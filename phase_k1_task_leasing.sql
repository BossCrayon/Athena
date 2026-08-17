-- K1.1 Supabase Task Leasing Migration

-- 1. Add leasing columns to tasks table
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS claimed_by UUID,
ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- 2. Add an index to speed up claiming
CREATE INDEX IF NOT EXISTS idx_tasks_queued_priority 
ON tasks(status, priority DESC, created_at ASC);

-- 3. Atomic RPC for claiming the next task
-- This uses Postgres row-level locking (FOR UPDATE SKIP LOCKED)
-- to ensure two workers can never claim the same task.
CREATE OR REPLACE FUNCTION claim_next_task(worker_id UUID)
RETURNS SETOF tasks AS $$
DECLARE
  claimed_task tasks%ROWTYPE;
BEGIN
  -- Find the highest priority queued task and lock it
  SELECT * INTO claimed_task
  FROM tasks
  WHERE status = 'queued' AND is_cancelled = false
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- If we found one, claim it
  IF FOUND THEN
    UPDATE tasks
    SET 
      claimed_by = worker_id,
      claimed_at = NOW(),
      status = 'planning',
      updated_at = extract(epoch from now()) * 1000
    WHERE id = claimed_task.id
    RETURNING * INTO claimed_task;

    RETURN NEXT claimed_task;
  END IF;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- 4. Atomic RPC for reclaiming expired leases
-- Used when a worker detects a stuck task whose lease has expired
CREATE OR REPLACE FUNCTION reclaim_expired_task(worker_id UUID, target_task_id UUID, lease_timeout_ms BIGINT)
RETURNS SETOF tasks AS $$
DECLARE
  reclaimed_task tasks%ROWTYPE;
BEGIN
  -- Lock the specific task to prevent race conditions during reclaim
  SELECT * INTO reclaimed_task
  FROM tasks
  WHERE id = target_task_id
  FOR UPDATE SKIP LOCKED;

  IF FOUND AND reclaimed_task.claimed_at IS NOT NULL AND (extract(epoch from now()) - extract(epoch from reclaimed_task.claimed_at)) * 1000 > lease_timeout_ms THEN
    UPDATE tasks
    SET 
      claimed_by = worker_id,
      claimed_at = NOW(),
      status = 'planning',
      updated_at = extract(epoch from now()) * 1000
    WHERE id = reclaimed_task.id
    RETURNING * INTO reclaimed_task;

    RETURN NEXT reclaimed_task;
  END IF;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- 5. Atomic RPC for triggering scheduled tasks safely
CREATE OR REPLACE FUNCTION trigger_scheduled_task(target_task_id UUID, new_next_run_at BIGINT)
RETURNS SETOF tasks AS $$
DECLARE
  triggered_task tasks%ROWTYPE;
BEGIN
  SELECT * INTO triggered_task
  FROM tasks
  WHERE id = target_task_id AND status = 'scheduled'
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    UPDATE tasks
    SET 
      status = 'queued',
      next_run_at = new_next_run_at,
      updated_at = extract(epoch from now()) * 1000
    WHERE id = triggered_task.id
    RETURNING * INTO triggered_task;

    RETURN NEXT triggered_task;
  END IF;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;
