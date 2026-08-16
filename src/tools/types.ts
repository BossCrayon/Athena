import type { ToolSchema } from './schema.js';

export type ToolPermission =
    | 'safe'
    | 'confirm'
    | 'restricted';

export interface ToolDefinition {
    name: string;
    description: string;
    permission: ToolPermission;
}

export interface ToolContext {
    workingDirectory: string;
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
}