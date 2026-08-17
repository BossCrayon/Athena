CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    request TEXT NOT NULL,
    status TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    scheduled_at BIGINT,
    next_run_at BIGINT,
    retry_count INTEGER DEFAULT 0,
    originating_session TEXT,
    is_cancelled BOOLEAN DEFAULT false,
    steps JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for efficient querying by the Autonomous Runtime
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_next_run_at ON tasks(next_run_at);
CREATE INDEX idx_tasks_priority ON tasks(priority);
