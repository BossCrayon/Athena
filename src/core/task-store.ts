import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Task, TaskStatus } from './task.js';

export class TaskStore {
    private supabase: SupabaseClient | null = null;

    constructor() {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;
        
        if (supabaseUrl && supabaseKey) {
            this.supabase = createClient(supabaseUrl, supabaseKey);
        } else {
            console.warn('[TaskStore] Supabase credentials not found in .env. Tasks will not be persisted.');
        }
    }

    async create(task: Task): Promise<void> {
        await this.upsert(task);
    }

    async get(taskId: string): Promise<Task | null> {
        if (!this.supabase) return null;
        try {
            const { data, error } = await this.supabase.from('tasks').select('*').eq('id', taskId).single();
            if (error || !data) return null;
            return this.fromRow(data);
        } catch (e) {
            console.error('[TaskStore] Exception getting task:', e);
            return null;
        }
    }

    async update(task: Task): Promise<void> {
        await this.upsert(task);
    }

    async upsert(task: Task): Promise<void> {
        if (!this.supabase) return;
        try {
            const { error } = await this.supabase.from('tasks')
                .upsert(this.toRow(task));
            if (error) {
                console.error('[TaskStore] Error upserting task:', error.message);
            }
        } catch (e) {
            console.error('[TaskStore] Exception upserting task:', e);
        }
    }

    async listIncomplete(): Promise<Task[]> {
        if (!this.supabase) return [];
        try {
            const statuses: TaskStatus[] = ['queued', 'planning', 'executing', 'observing', 'verifying', 'waiting'];
            const { data, error } = await this.supabase
                .from('tasks')
                .select('*')
                .in('status', statuses)
                .order('priority', { ascending: false })
                .order('created_at', { ascending: true });
                
            if (error) throw error;
            return (data || []).map(r => this.fromRow(r));
        } catch (e) {
            console.error('[TaskStore] Exception listing incomplete tasks:', e);
            return [];
        }
    }

    async listScheduled(): Promise<Task[]> {
        if (!this.supabase) return [];
        try {
            const { data, error } = await this.supabase
                .from('tasks')
                .select('*')
                .eq('status', 'scheduled')
                .order('next_run_at', { ascending: true });
                
            if (error) throw error;
            return (data || []).map(r => this.fromRow(r));
        } catch (e) {
            console.error('[TaskStore] Exception listing scheduled tasks:', e);
            return [];
        }
    }

    async listCompleted(limit: number = 50): Promise<Task[]> {
        if (!this.supabase) return [];
        try {
            const { data, error } = await this.supabase
                .from('tasks')
                .select('*')
                .in('status', ['completed', 'failed', 'cancelled', 'aborted'])
                .order('updated_at', { ascending: false })
                .limit(limit);
                
            if (error) throw error;
            return (data || []).map(r => this.fromRow(r));
        } catch (e) {
            console.error('[TaskStore] Exception listing completed tasks:', e);
            return [];
        }
    }

    async claimNextTask(workerId: string): Promise<Task | null> {
        if (!this.supabase) return null;
        try {
            const { data, error } = await this.supabase.rpc('claim_next_task', { worker_id: workerId });
            if (error) {
                console.error('[TaskStore] Error calling claim_next_task:', error.message);
                return null;
            }
            if (!data || data.length === 0) return null;
            return this.fromRow(data[0]);
        } catch (e) {
            console.error('[TaskStore] Exception claiming next task:', e);
            return null;
        }
    }

    async renewClaim(taskId: string, workerId: string): Promise<boolean> {
        if (!this.supabase) return false;
        try {
            const { error } = await this.supabase
                .from('tasks')
                .update({ claimed_at: new Date().toISOString(), updated_at: Date.now() })
                .eq('id', taskId)
                .eq('claimed_by', workerId);
            
            if (error) {
                console.error('[TaskStore] Error renewing claim:', error.message);
                return false;
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    async releaseClaim(taskId: string, workerId: string, backToQueue: boolean = true): Promise<void> {
        if (!this.supabase) return;
        try {
            const updateData: any = { claimed_by: null, claimed_at: null, updated_at: Date.now() };
            if (backToQueue) {
                updateData.status = 'queued';
            }
            await this.supabase
                .from('tasks')
                .update(updateData)
                .eq('id', taskId)
                .eq('claimed_by', workerId);
        } catch (e) {
            console.error('[TaskStore] Exception releasing claim:', e);
        }
    }

    async reclaimExpired(targetTaskId: string, workerId: string, leaseTimeoutMs: number): Promise<Task | null> {
        if (!this.supabase) return null;
        try {
            const { data, error } = await this.supabase.rpc('reclaim_expired_task', { 
                worker_id: workerId,
                target_task_id: targetTaskId,
                lease_timeout_ms: leaseTimeoutMs
            });
            if (error) {
                console.error('[TaskStore] Error calling reclaim_expired_task:', error.message);
                return null;
            }
            if (!data || data.length === 0) return null;
            return this.fromRow(data[0]);
        } catch (e) {
            console.error('[TaskStore] Exception reclaiming expired task:', e);
            return null;
        }
    }

    async triggerScheduledTask(targetTaskId: string, newNextRunAt: number | null): Promise<Task | null> {
        if (!this.supabase) return null;
        try {
            const { data, error } = await this.supabase.rpc('trigger_scheduled_task', {
                target_task_id: targetTaskId,
                new_next_run_at: newNextRunAt
            });
            if (error) {
                console.error('[TaskStore] Error calling trigger_scheduled_task:', error.message);
                return null;
            }
            if (!data || data.length === 0) return null;
            return this.fromRow(data[0]);
        } catch (e) {
            console.error('[TaskStore] Exception triggering scheduled task:', e);
            return null;
        }
    }

    // --- Mappers ---
    private toRow(task: Task): any {
        return {
            id: task.id,
            request: task.request,
            status: task.status,
            priority: task.priority,
            created_at: task.createdAt,
            updated_at: task.updatedAt,
            scheduled_at: task.scheduledAt || null,
            next_run_at: task.nextRunAt || null,
            retry_count: task.retryCount,
            originating_session: task.originatingSession || null,
            is_cancelled: task.isCancelled,
            steps: task.steps,
            metadata: task.metadata || {},
            claimed_by: task.claimedBy || null,
            claimed_at: task.claimedAt ? new Date(task.claimedAt).toISOString() : null,
            plan: task.plan || null
        };
    }

    private fromRow(row: any): Task {
        return {
            id: row.id,
            request: row.request,
            status: row.status as TaskStatus,
            priority: row.priority,
            createdAt: Number(row.created_at),
            updatedAt: Number(row.updated_at),
            scheduledAt: row.scheduled_at ? Number(row.scheduled_at) : undefined,
            nextRunAt: row.next_run_at ? Number(row.next_run_at) : undefined,
            retryCount: row.retry_count,
            originatingSession: row.originating_session || undefined,
            isCancelled: row.is_cancelled,
            steps: row.steps || [],
            metadata: row.metadata || {},
            claimedBy: row.claimed_by || undefined,
            claimedAt: row.claimed_at ? new Date(row.claimed_at).getTime() : undefined,
            plan: row.plan || undefined
        };
    }
}
