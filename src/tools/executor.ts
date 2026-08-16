import { PermissionManager } from './permission.js';
import { ToolRegistry } from './registry.js';
import type {
    ToolContext,
    ToolResult,
} from './types.js';

export class ToolExecutor {
    constructor(
        private readonly registry: ToolRegistry,
        private readonly permissions: PermissionManager
    ) { }

    async execute(
        toolName: string,
        args: Record<string, unknown>,
        context: ToolContext
    ): Promise<ToolResult> {
        const tool = this.registry.get(toolName);

        if (!tool) {
            return {
                success: false,
                output: '',
                error: `Tool '${toolName}' is not registered.`,
            };
        }

        const permission = this.permissions.evaluate({
            toolName: tool.definition.name,
            permission: tool.definition.permission,
        });

        if (permission.decision === 'deny') {
            return {
                success: false,
                output: '',
                error: `Permission denied: ${permission.reason}`,
            };
        }

        if (permission.decision === 'confirm') {
            return {
                success: false,
                output: '',
                error: `User confirmation required: ${permission.reason}`,
            };
        }

        try {
            return await tool.execute(args, context);
        } catch (error) {
            return {
                success: false,
                output: '',
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unknown tool execution error.',
            };
        }
    }
}