import { randomUUID } from 'crypto';
import { TaskQueue } from './task-queue.js';
import { TaskEngine } from './task-engine.js';
import { EventBus } from './events.js';
import { ATHENA_SYSTEM_PROMPT } from '../personality/athena.js';
import type { Message } from '../llm/types.js';
import type { ContextBuilder } from './context-builder.js';
import type { MemoryExtractor } from './memory-extractor.js';
import type { CloudMemoryManager } from './memory.js';
import type { TaskStore } from './task-store.js';
import type { Task } from './task.js';
import { evaluateRetrySafety } from './safety.js';

export class AutonomousRuntime {
    private isRunning: boolean = false;
    private shuttingDown: boolean = false;
    private intervalId: NodeJS.Timeout | null = null;
    private heartbeatIntervalId: NodeJS.Timeout | null = null;
    
    public readonly workerId: string;
    private activeTasks = new Map<string, Task>();
    private activeControllers = new Map<string, AbortController>();
    private readonly LEASE_TIMEOUT_MS = parseInt(process.env.TASK_LEASE_TIMEOUT_MS || '120000', 10); // 2 minutes default

    constructor(
        private readonly queue: TaskQueue,
        private readonly engine: TaskEngine,
        private readonly eventBus: EventBus,
        private readonly contextBuilder: ContextBuilder,
        private readonly memoryExtractor: MemoryExtractor,
        private readonly memoryManager: CloudMemoryManager,
        private readonly taskStore?: TaskStore
    ) {
        this.workerId = `athena-worker-${randomUUID()}`;
        
        // Listen for cancellation
        this.eventBus.subscribe('task_cancellation_requested', (payload: { taskId: string }) => {
            const controller = this.activeControllers.get(payload.taskId);
            if (controller) {
                console.log(`[AutonomousRuntime] Aborting executing task ${payload.taskId}...`);
                controller.abort();
            }
        });
    }

    start(pollIntervalMs: number = 2000): void {
        if (this.isRunning) return;
        this.isRunning = true;
        this.shuttingDown = false;
        
        this.intervalId = setInterval(() => this.poll(), pollIntervalMs);
        
        // Heartbeat to renew leases of active tasks
        this.heartbeatIntervalId = setInterval(() => this.renewLeases(), Math.floor(this.LEASE_TIMEOUT_MS / 3));
        
        console.log(`[AutonomousRuntime] Started. Worker ID: ${this.workerId}`);
    }

    async recover(): Promise<void> {
        if (!this.taskStore) return;
        
        try {
            const incompleteTasks = await this.taskStore.listIncomplete();
            let recoveredCount = 0;
            const now = Date.now();

            for (const task of incompleteTasks) {
                // Only recover tasks that are actually executing and whose lease is stale
                if (['executing', 'observing', 'verifying', 'planning'].includes(task.status)) {
                    if (task.claimedAt && (now - task.claimedAt) > this.LEASE_TIMEOUT_MS) {
                        const reclaimed = await this.taskStore.reclaimExpired(task.id, this.workerId, this.LEASE_TIMEOUT_MS);
                        
                        if (reclaimed) {
                            reclaimed.status = 'queued';
                            reclaimed.retryCount = (reclaimed.retryCount || 0) + 1;
                            
                            // Convert any pending/running step to unknown
                            if (reclaimed.steps && reclaimed.steps.length > 0) {
                                for (const step of reclaimed.steps) {
                                    if (step.status === 'pending' || step.status === 'running') {
                                        step.status = 'unknown';
                                        step.error = 'Worker crashed during execution. Tool outcome is UNKNOWN. Verify state before retrying side-effecting operations.';
                                    }
                                }
                            }
                            
                            await this.taskStore.upsert(reclaimed);
                            await this.queue.enqueue(reclaimed);
                            recoveredCount++;
                            this.eventBus.emit('telemetry', {
                                eventType: 'task_recovered',
                                timestamp: new Date().toISOString(),
                                taskId: reclaimed.id,
                                workerId: this.workerId,
                                metadata: { retryCount: reclaimed.retryCount }
                            });
                        }
                    }
                } else if (task.status === 'queued') {
                    // Queue locally if it's already queued
                    await this.queue.enqueue(task);
                }
            }
            console.log(`[AutonomousRuntime] Recovered ${recoveredCount} stale tasks from persistence.`);
        } catch (e) {
            console.error('[AutonomousRuntime] Failed to recover tasks:', e);
        }
    }

    stop(): void {
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.heartbeatIntervalId) {
            clearInterval(this.heartbeatIntervalId);
            this.heartbeatIntervalId = null;
        }
        console.log('[AutonomousRuntime] Stopped polling.');
    }

    async shutdownGracefully(timeoutMs: number = 30000): Promise<void> {
        this.shuttingDown = true;
        this.stop();
        console.log(`[AutonomousRuntime] Graceful shutdown initiated. Waiting up to ${timeoutMs}ms for ${this.activeTasks.size} active tasks...`);
        
        const startWait = Date.now();
        while (this.activeTasks.size > 0 && (Date.now() - startWait) < timeoutMs) {
            await new Promise(r => setTimeout(r, 500));
        }

        if (this.activeTasks.size > 0) {
            console.warn(`[AutonomousRuntime] Shutdown timeout reached. ${this.activeTasks.size} tasks will be abandoned for lease expiration.`);
            // We just let them expire so another worker can reclaim them
        } else {
            console.log('[AutonomousRuntime] All active tasks completed gracefully.');
        }
    }

    getIsRunning(): boolean {
        return this.isRunning;
    }

    isShuttingDown(): boolean {
        return this.shuttingDown;
    }

    getActiveTaskCount(): number {
        return this.activeTasks.size;
    }

    private async renewLeases(): Promise<void> {
        if (!this.taskStore) return;
        for (const taskId of this.activeTasks.keys()) {
            await this.taskStore.renewClaim(taskId, this.workerId);
        }
    }

    private async poll(): Promise<void> {
        if (!this.isRunning || this.shuttingDown) return;

        const task = await this.queue.dequeue(this.workerId);
        if (!task) return;
        
        this.activeTasks.set(task.id, task);
        
        const controller = new AbortController();
        this.activeControllers.set(task.id, controller);
        
        this.eventBus.emit('task_started', task);
        this.eventBus.emit('telemetry', {
            eventType: task.retryCount > 0 ? 'task_retrying' : 'task_started',
            timestamp: new Date().toISOString(),
            taskId: task.id,
            workerId: this.workerId,
            metadata: { retryCount: task.retryCount }
        });
        


        // Check for unknown steps from recovery and inject warning
        let recoveryWarning = '';
        const unknownSteps = task.steps?.filter(s => s.status === 'unknown') || [];
        const dangerousUnknownSteps = unknownSteps.filter(s => {
            const safety = evaluateRetrySafety(s.toolName, s.arguments);
            return safety !== 'SAFE_TO_RETRY' && safety !== 'IDEMPOTENT';
        });

        if (dangerousUnknownSteps.length > 0) {
            const unknownList = dangerousUnknownSteps.map(s => `- ${s.toolName}(${JSON.stringify(s.arguments)})`).join('\n');
            recoveryWarning = `\n\n[System Note: The previous worker crashed. The following operations have UNKNOWN outcomes. You MUST VERIFY their external state before retrying them if they are dangerous or non-idempotent:\n${unknownList}]\n`;
        }

        const history: Message[] = [
            { role: 'system', content: ATHENA_SYSTEM_PROMPT },
            { role: 'user', content: task.request + recoveryWarning }
        ];

        try {
            await this.engine.executeBackground(task, history, controller.signal);
            
            // If the task completed normally or failed structurally inside TaskEngine, its status is updated there.
            if (task.status !== 'cancelled' && task.status !== 'aborted') {
                if (task.steps.some(s => s.status === 'failure')) {
                    task.status = 'failed';
                    if (this.taskStore) {
                        await this.taskStore.upsert(task);
                    }
                    this.eventBus.emit('task_failed', task);
                } else {
                    task.status = 'completed';
                    if (this.taskStore) {
                        await this.taskStore.upsert(task);
                    }
                    this.eventBus.emit('task_completed', task);
                    
                    // Asynchronous memory extraction
                    this.memoryExtractor.extractFromTask(task)
                        .then(async (memories) => {
                            for (const m of memories) {
                                await this.memoryManager.upsertMemory(m);
                            }
                        })
                        .catch(err => console.error('[AutonomousRuntime] Extractor error:', err));
                }
            } else if (task.status === 'cancelled') {
                this.eventBus.emit('task_cancelled', task);
            } else if (task.status === 'aborted') {
                this.eventBus.emit('task_aborted', task);
            }
        } catch (error: any) {
            if (error?.name === 'AbortError' || error?.message === 'AbortError') {
                task.status = 'cancelled';
                if (this.taskStore) {
                    await this.taskStore.upsert(task);
                }
                this.eventBus.emit('task_cancelled', task);
            } else {
                task.status = 'failed';
                task.metadata = task.metadata || {};
                task.metadata.error = String(error);
                if (this.taskStore) {
                    await this.taskStore.upsert(task);
                }
                this.eventBus.emit('task_failed', task);
            }
        } finally {
            this.activeTasks.delete(task.id);
            this.activeControllers.delete(task.id);
            // Optionally, safely release the task lease if cancelled or failed, but upsert handles status updates.
        }
    }
}
