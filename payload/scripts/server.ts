/**
 * Payload CMS persistent HTTP server for CLI plugin.
 *
 * Run from project root:
 *   pnpm tsx P:\aromatt\payload\scripts\server.ts [--port 8100] [--timeout 30000]
 *
 * @author Arkadiusz Moscicki
 * @status draft
 * @version 0.1.0
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRequire = createRequire(path.join(process.cwd(), 'package.json'));

try {
  const dotenvPath = projectRequire.resolve('dotenv');
  const dotenv = projectRequire(dotenvPath);
  dotenv.config({ path: path.join(process.cwd(), '.env.local') });
} catch {
  // dotenv not installed — env vars must be set externally
}

const args = process.argv.slice(2);

function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  return args[idx + 1];
}

const PORT = Number(getArg('port', '8100'));
const IDLE_TIMEOUT_MS = Number(getArg('idle-timeout', String(30 * 60 * 1000)));
const TEST_DB_URL = getArg('test-db-url', process.env.TEST_POSTGRES_URL ?? '');
const PID_FILE = path.join(__dirname, '.payload-server.json');

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (
  chunk: string | Uint8Array,
  encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
  callback?: (err?: Error) => void,
): boolean => {
  if (typeof encodingOrCallback === 'function')
    return process.stderr.write(chunk, encodingOrCallback);
  return process.stderr.write(chunk, encodingOrCallback, callback);
};

process.env.USE_LOCAL_DB = 'true';

let devPayload: Awaited<ReturnType<typeof import('payload')['getPayload']>>;
let testPayload: Awaited<ReturnType<typeof import('payload')['getPayload']>> | null = null;
let collectionSlugs: string[] = [];

type FieldDef = {
  name?: string;
  type: string;
  required?: boolean;
  hasMany?: boolean;
  relationTo?: string | string[];
  options?: Array<string | { label: string; value: string }>;
  fields?: FieldDef[];
  tabs?: Array<{ fields: FieldDef[]; label?: string; name?: string }>;
  blocks?: Array<{ slug: string; fields: FieldDef[] }>;
};

function mapField(field: Record<string, unknown>): FieldDef {
  const mapped: FieldDef = { type: String(field.type ?? 'unknown') };

  if (field.name) mapped.name = String(field.name);
  if (field.required) mapped.required = true;
  if (field.hasMany) mapped.hasMany = true;
  if (field.relationTo) mapped.relationTo = field.relationTo as string | string[];
  if (Array.isArray(field.options)) mapped.options = field.options;

  if (Array.isArray(field.fields)) {
    mapped.fields = (field.fields as Record<string, unknown>[]).map(mapField);
  }
  if (Array.isArray(field.tabs)) {
    mapped.tabs = (field.tabs as Array<{ fields: Record<string, unknown>[]; label?: string; name?: string }>).map(t => ({
      ...(t.label ? { label: t.label } : {}),
      ...(t.name ? { name: t.name } : {}),
      fields: t.fields.map(mapField),
    }));
  }
  if (Array.isArray(field.blocks)) {
    mapped.blocks = (field.blocks as Array<{ slug: string; fields: Record<string, unknown>[] }>).map(b => ({
      slug: b.slug,
      fields: b.fields.map(mapField),
    }));
  }

  return mapped;
}

type CollectionConfig = { slug: string; fields: Record<string, unknown>[]; labels?: { singular?: string; plural?: string } };
let collectionConfigs: CollectionConfig[] = [];

async function initPayload() {
  const { default: configPromise } = await import('@payload-config');
  const payloadPath = projectRequire.resolve('payload');
  const { getPayload } = await import(pathToFileURL(payloadPath).href);

  const config = await configPromise;

  collectionConfigs = (config.collections ?? []) as unknown as CollectionConfig[];
  collectionSlugs = collectionConfigs
    .map((c) => c.slug)
    .filter((s) => !s.startsWith('payload-') || s === 'payload-preferences');

  devPayload = await getPayload({ config });

  if (TEST_DB_URL) {
    try {
      const dbPostgresPath = projectRequire.resolve('@payloadcms/db-postgres');
      const { postgresAdapter } = await import(pathToFileURL(dbPostgresPath).href);
      const testConfig = {
        ...config,
        db: postgresAdapter({
          pool: { connectionString: TEST_DB_URL },
        }),
      };
      testPayload = await getPayload({ config: testConfig });
    } catch (err) {
      process.stderr.write(`[payload] Warning: test DB init failed: ${err}\n`);
    }
  }
}

function getPayloadInstance(db: string) {
  if (db === 'test') {
    if (!testPayload) throw new Error('Test database not configured. Start with --test-db-url');
    return testPayload;
  }
  return devPayload;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handleHealth(_req: http.IncomingMessage, res: http.ServerResponse) {
  json(res, {
    ok: true,
    collections: collectionSlugs,
    uptime: process.uptime(),
    testDb: testPayload !== null,
  });
}

async function handleCollections(_req: http.IncomingMessage, res: http.ServerResponse) {
  const data = collectionConfigs
    .filter((c) => collectionSlugs.includes(c.slug))
    .map((c) => ({
      slug: c.slug,
      fieldCount: c.fields?.length ?? 0,
      labels: c.labels ?? null,
    }));
  json(res, { ok: true, data });
}

async function handleSchema(req: http.IncomingMessage, res: http.ServerResponse) {
  const slug = req.url?.split('/')[2];
  if (!slug) return json(res, { ok: false, error: 'Missing collection slug' }, 400);

  const col = collectionConfigs.find((c) => c.slug === slug);
  if (!col) return json(res, { ok: false, error: `Unknown collection: ${slug}` }, 404);

  json(res, {
    ok: true,
    data: {
      slug: col.slug,
      labels: col.labels ?? null,
      fields: col.fields.map(mapField),
    },
  });
}

async function handleQuery(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = JSON.parse(await readBody(req));
  const { collection, operation, db = 'dev', ...opts } = body;
  const payload = getPayloadInstance(db);

  switch (operation) {
    case 'find': {
      const findOpts: Record<string, unknown> = { collection, depth: 1 };
      if (opts.where) findOpts.where = opts.where;
      if (opts.sort) findOpts.sort = opts.sort;
      if (opts.limit !== undefined) findOpts.limit = Number(opts.limit);
      if (opts.page !== undefined) findOpts.page = Number(opts.page);
      if (opts.depth !== undefined) findOpts.depth = Number(opts.depth);
      if (opts.select) findOpts.select = opts.select;
      const result = await payload.find(findOpts as Parameters<typeof payload.find>[0]);
      return json(res, { ok: true, data: result });
    }

    case 'findById': {
      if (!opts.id) return json(res, { ok: false, error: 'Missing id' }, 400);
      const findOpts: Record<string, unknown> = { collection, id: String(opts.id), depth: 1 };
      if (opts.depth !== undefined) findOpts.depth = Number(opts.depth);
      if (opts.select) findOpts.select = opts.select;
      const result = await payload.findByID(findOpts as Parameters<typeof payload.findByID>[0]);
      return json(res, { ok: true, data: result });
    }

    case 'count': {
      const countOpts: Record<string, unknown> = { collection };
      if (opts.where) countOpts.where = opts.where;
      const result = await payload.count(countOpts as Parameters<typeof payload.count>[0]);
      return json(res, { ok: true, data: result });
    }

    default:
      return json(res, { ok: false, error: `Unknown query operation: ${operation}` }, 400);
  }
}

async function handleMutate(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = JSON.parse(await readBody(req));
  const { collection, operation, db = 'dev', ...opts } = body;
  const payload = getPayloadInstance(db);

  switch (operation) {
    case 'create': {
      if (!opts.data) return json(res, { ok: false, error: 'Missing data' }, 400);
      const createOpts: Record<string, unknown> = { collection, data: opts.data, depth: 1 };
      if (opts.depth !== undefined) createOpts.depth = Number(opts.depth);
      if (opts.select) createOpts.select = opts.select;
      const result = await payload.create(createOpts as Parameters<typeof payload.create>[0]);
      return json(res, { ok: true, data: result });
    }

    case 'update': {
      if (!opts.id) return json(res, { ok: false, error: 'Missing id' }, 400);
      if (!opts.data) return json(res, { ok: false, error: 'Missing data' }, 400);
      const updateOpts: Record<string, unknown> = { collection, id: String(opts.id), data: opts.data, depth: 1 };
      if (opts.depth !== undefined) updateOpts.depth = Number(opts.depth);
      if (opts.select) updateOpts.select = opts.select;
      const result = await payload.update(updateOpts as Parameters<typeof payload.update>[0]);
      return json(res, { ok: true, data: result });
    }

    case 'delete': {
      if (!opts.id) return json(res, { ok: false, error: 'Missing id' }, 400);
      const result = await payload.delete({ collection, id: String(opts.id) } as Parameters<typeof payload.delete>[0]);
      return json(res, { ok: true, data: result });
    }

    default:
      return json(res, { ok: false, error: `Unknown mutate operation: ${operation}` }, 400);
  }
}

let idleTimer: ReturnType<typeof setTimeout>;

function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    process.stderr.write('[payload] Idle timeout reached, shutting down\n');
    shutdown();
  }, IDLE_TIMEOUT_MS);
}

function shutdown() {
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
  process.exit(0);
}

const server = http.createServer(async (req, res) => {
  resetIdleTimer();

  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  try {
    if (method === 'GET' && url === '/health') return await handleHealth(req, res);
    if (method === 'GET' && url === '/collections') return await handleCollections(req, res);
    if (method === 'GET' && url.startsWith('/schema/')) return await handleSchema(req, res);
    if (method === 'POST' && url === '/query') return await handleQuery(req, res);
    if (method === 'POST' && url === '/mutate') return await handleMutate(req, res);
    if (method === 'POST' && url === '/shutdown') {
      json(res, { ok: true, message: 'Shutting down' });
      setTimeout(shutdown, 100);
      return;
    }
    json(res, { ok: false, error: `Not found: ${method} ${url}` }, 404);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[payload] Error: ${message}\n`);
    json(res, { ok: false, error: message }, 500);
  }
});

async function main() {
  await initPayload();

  process.stdout.write = originalStdoutWrite;

  server.listen(PORT, () => {
    fs.writeFileSync(PID_FILE, JSON.stringify({ pid: process.pid, port: PORT }, null, 2));

    process.stderr.write(`[payload] Server ready on port ${PORT}\n`);
    process.stderr.write(`[payload] Collections: ${collectionSlugs.join(', ')}\n`);
    process.stderr.write(`[payload] Test DB: ${testPayload ? 'connected' : 'not configured'}\n`);
    process.stderr.write(`[payload] Idle timeout: ${IDLE_TIMEOUT_MS / 1000}s\n`);
  });

  resetIdleTimer();

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  process.stdout.write = originalStdoutWrite;
  process.stderr.write(`[payload] Fatal: ${err.message}\n`);
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
  process.exit(1);
});
