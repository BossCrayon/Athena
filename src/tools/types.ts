import type { ToolSchema } from './schema.js';
import type { Task, TaskStep } from '../core/task.js';
import type { MessageContentPart } from '../llm/types.js';

export type ToolPermission =
    | 'safe'
    | 'confirm'
    | 'restricted';

export interface ToolDefinition {
    name: string;
    description: string;
    permission: ToolPermission;
    schema: ToolSchema;
    isParallelizable?: boolean;
}

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
    attachments?: MessageContentPart[];
}

export interface Tool {
    definition: ToolDefinition;

    execute(
        args: Record<string, unknown>,
        context: ToolContext
    ): Promise<ToolResult>;
}