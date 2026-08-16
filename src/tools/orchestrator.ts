import { ToolExecutor } from './executor.js';
import { ToolRegistry } from './registry.js';
import type { ToolRequest } from './request.js';
import type { ToolResponse } from './response.js';
import type { ToolContext } from './types.js';

export class ToolOrchestrator {
    constructor(
        private readonly registry: ToolRegistry,
        private readonly executor: ToolExecutor
    ) { }

    async handle(
        request: ToolRequest,
        context: ToolContext
    ): Promise<ToolResponse> {
        if (!this.registry.has(request.toolName)) {
            return {
                toolName: request.toolName,
                success: false,
                output: '',
                error: `Unknown tool '${request.toolName}'.`,
            };
        }

        const result = await this.executor.execute(
            request.toolName,
            request.arguments,
            context
        );

        return {
            toolName: request.toolName,
            success: result.success,
            output: result.output,
            ...(result.error !== undefined
                ? { error: result.error }
                : {}),
        };
    }
}