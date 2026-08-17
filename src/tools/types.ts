import type { ToolSchema } from './schema.js';

export type ToolPermission =
    | 'safe'
    | 'confirm'
    | 'restricted';

export interface ToolDefinition {
    name: string;
    description: string;
    permission: ToolPermission;
    isParallelizable?: boolean;
}

import type { Task, TaskStep } from '../core/task.js';

export interface ToolContext {
    cwd: string;
    askPermission?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
    signal?: AbortSignal;
    task?: Task;
    step?: TaskStep;
}

export interface ToolResult {
    success: boolean;
    output: string;
    error?: string;
}

export interface Tool {
    definition: ToolDefinition;

    execute(
        args: Record<string, unknown>,
        context: ToolContext
    ): Promise<ToolResult>;
}

export interface ToolDefinition {
    name: string;
    description: string;
    permission: ToolPermission;
    schema: ToolSchema;
    isParallelizable?: boolean;
}