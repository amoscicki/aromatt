-- Semantic Codebase Indexer Schema
-- pgvector extension for vector similarity search

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE codebase_segments (
    id SERIAL PRIMARY KEY,
    project_root TEXT NOT NULL,           -- Absolute path to project root
    file_path TEXT NOT NULL,              -- Relative path from project root
    file_name TEXT NOT NULL,              -- Basename for display
    content TEXT NOT NULL,                -- The actual code segment
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    symbol_name TEXT,                     -- Function/class name if AST-parsed
    node_type TEXT,                       -- 'function', 'class', 'method', 'block', 'file'
    content_hash TEXT NOT NULL,           -- SHA-256 for deduplication
    embedding vector(768),                -- Gemini text-embedding-004 dimension
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(project_root, file_path, start_line, end_line)
);

-- Index for vector similarity search (IVFFlat for performance)
CREATE INDEX idx_embedding ON codebase_segments
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Index for project filtering
CREATE INDEX idx_project_root ON codebase_segments(project_root);

-- Index for file lookup
CREATE INDEX idx_file_path ON codebase_segments(project_root, file_path);

-- Index for hash-based deduplication checks
CREATE INDEX idx_content_hash ON codebase_segments(content_hash);
