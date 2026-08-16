import { LLMRouter } from '../llm/router.js';

import type {
    Message,
    ToolCall,
    ToolResult,
} from '../llm/types.js';

import { ATHENA_SYSTEM_PROMPT } from '../personality/athena.js';

import { ToolRegistry } from '../tools/registry.js';
import { ToolOrchestrator } from '../tools/orchestrator.js';

import type { ToolContext } from '../tools/types.js';

export class AthenaCore {
    private readonly router: LLMRouter;
    private readonly history: Message[];

    private readonly toolRegistry: ToolRegistry;
    private readonly toolOrchestrator: ToolOrchestrator;
    private readonly toolContext: ToolContext;

    constructor(
        router: LLMRouter,
        toolRegistry: ToolRegistry,
        toolOrchestrator: ToolOrchestrator,
        toolContext: ToolContext
    ) {
        this.router = router;
        this.toolRegistry = toolRegistry;
        this.toolOrchestrator = toolOrchestrator;
        this.toolContext = toolContext;

        this.history = [
            {
                role: 'system',
                content: ATHENA_SYSTEM_PROMPT,
            },
        ];
    }

    async chat(userInput: string): Promise<string> {
        this.history.push({
            role: 'user',
            content: userInput,
        });

        try {
            const response = await this.router.generate(
                this.history,
                {
                    temperature: 0.7,
                },
                this.toolRegistry.getSchemas()
            );

            if (
                response.toolCalls &&
                response.toolCalls.length > 0 &&
                response.continuationId
            ) {
                return await this.handleToolCalls(
                    response.toolCalls,
                    response.continuationId
                );
            }

            this.history.push({
                role: 'model',
                content: response.text,
            });

            return response.text;
        } catch (error) {
            this.history.pop();

            console.error(
                '[ATHENA] LLM request failed:',
                error
            );

            return 'I apologize, sir. I encountered an error communicating with the model provider.';
        }
    }

    private async handleToolCalls(
        toolCalls: ToolCall[],
        continuationId: string
    ): Promise<string> {
        const results: ToolResult[] = [];

        for (const toolCall of toolCalls) {
            console.log(
                `[ATHENA] Executing tool '${toolCall.name}'...`
            );

            const result =
                await this.toolOrchestrator.handle(
                    {
                        toolName: toolCall.name,
                        arguments: toolCall.arguments,
                    },
                    this.toolContext
                );

            console.log(
                `[ATHENA] Tool '${toolCall.name}': ${result.success
                    ? 'success'
                    : 'failed'
                }`
            );

            results.push({
                toolCallId: toolCall.id,
                toolName: result.toolName,
                success: result.success,
                output: result.output,
                ...(result.error !== undefined
                    ? {
                        error: result.error,
                    }
                    : {}),
            });
        }

        const response =
            await this.router.continueWithToolResults(
                continuationId,
                results,
                this.toolRegistry.getSchemas()
            );

        /*
         * Gemini may request another tool after receiving
         * the previous tool results.
         *
         * Continue until Gemini produces a normal response.
         */
        if (
            response.toolCalls &&
            response.toolCalls.length > 0 &&
            response.continuationId
        ) {
            return await this.handleToolCalls(
                response.toolCalls,
                response.continuationId
            );
        }

        this.history.push({
            role: 'model',
            content: response.text,
        });

        return response.text;
    }

    getConversationHistory(): readonly Message[] {
        return this.history;
    }

    clearConversation(): void {
        this.history.length = 1;
    }

    clearHistory(): void {
        this.history.length = 0;

        this.history.push({
            role: 'system',
            content: ATHENA_SYSTEM_PROMPT,
        });
    }

    getHistoryLength(): number {
        return this.history.length;
    }
}