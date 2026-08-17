
import type { Task } from './task.js';
import type { TaskStore } from './task-store.js';
import type { EventBus } from './events.js';

export class TaskQueue {
    private tasks: Map<string, Task> = new Map();

    constructor(
        private readonly taskStore?: TaskStore,
        private readonly eventBus?: EventBus
    ) { }

    async enqueue(task: Task): Promise<void> {
        task.status = 'queued';
        task.updatedAt = Date.now();
        this.tasks.set(task.id, task);
        if (this.taskStore) {
            await this.taskStore.upsert(task);
        }
        if (this.eventBus) {
            this.eventBus.emit('telemetry', {
                eventType: 'task_created',
                timestamp: new Date().toISOString(),
                taskId: task.id,
                metadata: { priority: task.priority }
            });
        }
    }

    async dequeue(workerId: string): Promise<Task | null> {
        if (this.taskStore) {
            const task = await this.taskStore.claimNextTask(workerId);
            if (task) {
                // Keep the in-memory mirror up to date if we are using it
                this.tasks.set(task.id, task);
                return task;
            }
            return null;
        }

        // Fallback to purely in-memory dequeue if no persistence
        let highestPriorityTask: Task | null = null;
        for (const task of this.tasks.values()) {
            if (task.status === 'queued' && !task.isCancelled) {
                if (!highestPriorityTask || task.priority > highestPriorityTask.priority) {
                    highestPriorityTask = task;
                }
            }
        }

        if (highestPriorityTask) {
            highestPriorityTask.status = 'planning';
            highestPriorityTask.updatedAt = Date.now();
            highestPriorityTask.claimedBy = workerId;
            highestPriorityTask.claimedAt = Date.now();
        }

        return highestPriorityTask;
    }

    async cancel(taskId: string): Promise<boolean> {
        const task = this.tasks.get(taskId);
        if (task) {
            task.isCancelled = true;
            task.status = 'cancelled';
            task.updatedAt = Date.now();
            if (this.taskStore) {
                await this.taskStore.upsert(task);
            }
            if (this.eventBus) {
                this.eventBus.emit('task_cancellation_requested', { taskId });
                this.eventBus.emit('telemetry', {
                    eventType: 'task_cancelled',
                    timestamp: new Date().toISOString(),
                    taskId: taskId
                });
            }
            return true;
        }

        // If not in memory but we have a store, we should try to cancel it there
        if (this.taskStore) {
            const dbTask = await this.taskStore.get(taskId);
            if (dbTask) {
                dbTask.isCancelled = true;
                dbTask.status = 'cancelled';
                dbTask.updatedAt = Date.now();
                await this.taskStore.upsert(dbTask);
                if (this.eventBus) {
                    this.eventBus.emit('task_cancellation_requested', { taskId });
                    this.eventBus.emit('telemetry', {
                        eventType: 'task_cancelled',
                        timestamp: new Date().toISOString(),
                        taskId: taskId
                    });
                }
                return true;
            }
        }

        return false;
    }

    getTask(taskId: string): Task | undefined {
        return this.tasks.get(taskId);
    }

    listTasks(): Task[] {
        return Array.from(this.tasks.values());
    }
}
