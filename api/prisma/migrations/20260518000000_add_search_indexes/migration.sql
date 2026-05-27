-- Enable trigram extension for fuzzy/partial search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index on users.username
CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON users USING GIN (username gin_trgm_ops);

-- GIN trigram index on shouts.content
CREATE INDEX IF NOT EXISTS idx_shouts_content_trgm ON shouts USING GIN (content gin_trgm_ops);
