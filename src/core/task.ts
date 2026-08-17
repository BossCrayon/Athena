export type TaskStatus = 'queued' | 'scheduled' | 'planning' | 'executing' | 'replanning' | 'observing' | 'verifying' | 'waiting' | 'completed' | 'failed' | 'cancelled' | 'aborted';

export type TaskStepStatus = 'pending' | 'running' | 'success' | 'failure' | 'cancelled' | 'unknown';

export interface TaskRequirements {
    reasoning?: boolean;
    coding?: boolean;
    tools?: boolean;
    vision?: boolean;
    longContext?: boolean;
    fastResponse?: boolean;
    privacy?: boolean;
    localOnly?: boolean;
    web?: boolean;
}

export interface TaskSubgoal {
    id: string;
    description: string;
    dependencies: string[];
    status: 'pending' | 'active' | 'completed' | 'failed';
    verificationStrategy?: string;
    requirements?: TaskRequirements;
}

export interface TaskPlan {
    goal: string;
    complexity: 'simple' | 'complex';
    clarificationRequired?: string;
    subgoals: TaskSubgoal[];
}

export interface TaskStep {
    id: string;
    toolName: string;
    arguments: Record<string, unknown>;
    status: TaskStepStatus;
    executionKey?: string;
    observation?: string;
    error?: string;
    telemetry?: {
        durationMs?: number;
    };
}

export interface TaskTelemetry {
    startTime?: number;
    endTime?: number;
    durationMs?: number;
    llmGenerationMs?: number;
    toolExecutionMs?: number;
    loopIterations?: number;
}

export interface Task {
    id: string;
    request: string;
    status: TaskStatus;
    priority: number;
    createdAt: number;
    updatedAt: number;
    scheduledAt?: number;
    nextRunAt?: number;
    retryCount: number;
    originatingSession?: string;
    steps: TaskStep[];
    metadata?: Record<string, unknown>;
    isCancelled: boolean;
    telemetry?: TaskTelemetry;
    claimedBy?: string;
    claimedAt?: number;
    plan?: TaskPlan;
}
