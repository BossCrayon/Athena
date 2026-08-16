import { PermissionManager } from './permission.js';
import { ToolRegistry } from './registry.js';
import type {
    ToolContext,
    ToolResult,
} from './types.js';
import type { NodeManager } from '../server/node-manager.js';

export class ToolExecutor {
    constructor(
        private readonly registry: ToolRegistry,
        private readonly permissions: PermissionManager,
        private readonly nodeManager?: NodeManager
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
            if (!context.askPermission) {
                return {
                    success: false,
                    output: '',
                    error: `User confirmation required, but no interactive prompt is available.`,
                };
            }

            const allowed = await context.askPermission(tool.definition.name, args);
            if (!allowed) {
                return {
                    success: false,
                    output: '',
                    error: `Permission denied by user.`,
                };
            }
        }

        try {
            if (this.nodeManager) {
                return await this.nodeManager.executeToolOnNode(toolName, args) as ToolResult;
            } else {
                return await tool.execute(args, context);
            }
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