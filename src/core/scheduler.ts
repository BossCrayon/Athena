import { TaskQueue } from './task-queue.js';
import type { Task } from './task.js';
import type { TaskStore } from './task-store.js';

export interface ScheduleOptions {
    runAt?: number;
    intervalMs?: number;
}

export class Scheduler {
    private intervalId: NodeJS.Timeout | null = null;
    private scheduledTasks: Set<Task> = new Set();

    constructor(
        private readonly queue: TaskQueue,
        private readonly taskStore?: TaskStore
    ) {}

    start(pollIntervalMs: number = 1000): void {
        if (this.intervalId) return;
        this.intervalId = setInterval(() => this.tick(), pollIntervalMs);
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    async schedule(task: Task, options: ScheduleOptions): Promise<void> {
        task.status = 'scheduled';
        task.scheduledAt = Date.now();
        task.nextRunAt = options.runAt || (Date.now() + (options.intervalMs || 0));
        if (options.intervalMs) {
            task.metadata = task.metadata || {};
            task.metadata.intervalMs = options.intervalMs;
        }
        this.scheduledTasks.add(task);
        if (this.taskStore) {
            await this.taskStore.upsert(task);
        }
    }

    async loadPersisted(): Promise<void> {
        if (!this.taskStore) return;
        try {
            const tasks = await this.taskStore.listScheduled();
            for (const t of tasks) {
                this.scheduledTasks.add(t);
            }
            console.log(`[Scheduler] Loaded ${tasks.length} scheduled tasks from persistence.`);
        } catch (e) {
            console.error('[Scheduler] Failed to load persisted tasks:', e);
        }
    }

    private async tick(): Promise<void> {
        const now = Date.now();
        for (const task of this.scheduledTasks) {
            if (task.isCancelled) {
                this.scheduledTasks.delete(task);
                if (this.taskStore) await this.taskStore.upsert(task);
                continue;
            }
            if (task.nextRunAt && now >= task.nextRunAt) {
                let newNextRunAt: number | null = null;
                if (task.metadata?.intervalMs) {
                    newNextRunAt = now + (task.metadata.intervalMs as number);
                }

                if (this.taskStore) {
                    // Atomic trigger. If another worker did it, we get null.
                    const triggered = await this.taskStore.triggerScheduledTask(task.id, newNextRunAt);
                    if (triggered) {
                        await this.queue.enqueue(triggered);
                        if (newNextRunAt) {
                            task.nextRunAt = newNextRunAt;
                            // Re-insert as scheduled for next time
                            task.status = 'scheduled';
                            await this.taskStore.upsert(task);
                        } else {
                            this.scheduledTasks.delete(task);
                        }
                    } else {
                        // Another worker handled it or it was cancelled
                        if (!newNextRunAt) {
                            this.scheduledTasks.delete(task);
                        } else {
                            task.nextRunAt = newNextRunAt;
                        }
                    }
                } else {
                    // In-memory fallback
                    await this.queue.enqueue(task);
                    if (newNextRunAt) {
                        task.nextRunAt = newNextRunAt;
                    } else {
                        this.scheduledTasks.delete(task);
                    }
                }
            }
        }
    }
}
