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
            // Tools that MUST run on the physical laptop device node
            const laptopDeviceTools = [
                'get_system_info', 'run_command', 'locate_item', 
                'system_control', 'list_directory', 'read_file', 'search_files'
            ];

            // Tools that MUST run on the physical mobile device node
            const mobileDeviceTools = [
                'get_battery_level', 'vibrate_phone', 'get_location'
            ];

            if (this.nodeManager) {
                if (laptopDeviceTools.includes(toolName)) {
                    const output = await this.nodeManager.executeToolOnNode(toolName, args, 'laptop');
                    return { success: true, output: String(output) };
                } else if (mobileDeviceTools.includes(toolName)) {
                    const output = await this.nodeManager.executeToolOnNode(toolName, args, 'mobile');
                    return { success: true, output: String(output) };
                }
            }
            
            // Cloud-native tools (memory, weather, web search) run directly on the Brain
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