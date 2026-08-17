-- Add plan column to tasks table
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS plan JSONB DEFAULT NULL;
