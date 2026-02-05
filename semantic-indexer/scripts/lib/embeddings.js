'use strict';

const https = require('https');
const {loadCredentials} = require('./auth');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent';
const EMBEDDING_DIMENSION = 768;

async function generateEmbedding(text, taskType = 'RETRIEVAL_DOCUMENT') {
  const {apiKey} = loadCredentials();

  const requestBody = JSON.stringify({
    model: 'models/text-embedding-004',
    content: {parts: [{text}]},
    taskType, // RETRIEVAL_DOCUMENT for indexing, RETRIEVAL_QUERY for search
  });

  return new Promise((resolve, reject) => {
    const url = new URL(GEMINI_API_URL);
    url.searchParams.set('key', apiKey);

    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              const err = new Error(json.error.message);
              err.code = 'GEMINI_API_ERROR';
              err.status = json.error.code;
              reject(err);
              return;
            }
            resolve(json.embedding.values);
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      const err = new Error('Gemini API request timed out');
      err.code = 'TIMEOUT';
      reject(err);
    });
    req.write(requestBody);
    req.end();
  });
}

async function generateQueryEmbedding(text) {
  return generateEmbedding(text, 'RETRIEVAL_QUERY');
}

async function generateBatchEmbeddings(texts, taskType = 'RETRIEVAL_DOCUMENT', delayMs = 100) {
  const results = [];
  for (const text of texts) {
    results.push(await generateEmbedding(text, taskType));
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs)); // Rate limit protection
    }
  }
  return results;
}

module.exports = {
  generateEmbedding,
  generateQueryEmbedding,
  generateBatchEmbeddings,
  EMBEDDING_DIMENSION,
};
