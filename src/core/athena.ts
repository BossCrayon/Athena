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

import { CloudMemoryManager } from './memory.js';

export class AthenaCore {
    private readonly router: LLMRouter;
    private history: Message[];

    private readonly toolRegistry: ToolRegistry;
    private readonly toolOrchestrator: ToolOrchestrator;
    private readonly toolContext: ToolContext;
    private readonly memoryManager: CloudMemoryManager;

    constructor(
        router: LLMRouter,
        toolRegistry: ToolRegistry,
        toolOrchestrator: ToolOrchestrator,
        toolContext: ToolContext,
        memoryManager: CloudMemoryManager
    ) {
        this.router = router;
        this.toolRegistry = toolRegistry;
        this.toolOrchestrator = toolOrchestrator;
        this.toolContext = toolContext;
        this.memoryManager = memoryManager;

        this.history = [];
    }

    async initialize() {
        const savedHistory = await this.memoryManager.loadHistory();
        
        // Filter out any old system prompts to avoid duplicates
        this.history = savedHistory.filter(m => m.role !== 'system');
        
        // ALWAYS prepend the latest system prompt to the beginning of her working memory
        this.history.unshift({
            role: 'system',
            content: ATHENA_SYSTEM_PROMPT,
        });
    }

    async chat(userInput: string, onToken?: (text: string) => void, onToolCall?: (toolName: string) => void): Promise<string> {
        const userMsg: Message = {
            role: 'user',
            content: userInput,
        };
        this.history.push(userMsg);
        await this.memoryManager.syncMessage(userMsg);

        try {
            const routing = {
                priority: 'latency' as const, // For standard user interactions, prioritize fast responses
                requireTools: true, // We want the ability to use tools by default
            };

            const response = await this.router.generate(
                this.history,
                {
                    temperature: 0.7,
                    onToken,
                    routing,
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
                    response.continuationId,
                    onToken,
                    onToolCall
                );
            } else {
                const modelMsg: Message = {
                    role: 'model',
                    content: response.text,
                };
                this.history.push(modelMsg);
                await this.memoryManager.syncMessage(modelMsg);

                return response.text;
            }
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
        continuationId: string,
        onToken?: (text: string) => void,
        onToolCall?: (toolName: string) => void
    ): Promise<string> {
        const results: ToolResult[] = [];

        for (const toolCall of toolCalls) {
            if (onToolCall) {
                onToolCall(toolCall.name);
            }
            const result =
                await this.toolOrchestrator.handle(
                    {
                        toolName: toolCall.name,
                        arguments: toolCall.arguments,
                    },
                    this.toolContext
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
                this.history,
                { 
                    temperature: 0.7, 
                    onToken,
                    routing: {
                        priority: 'latency',
                        requireTools: true,
                    }
                },
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
                response.continuationId,
                onToken,
                onToolCall
            );
        }
        let finalResponseText = response.text;
        
        if (!finalResponseText) {
            const rawOutput = results.map(r => r.output || r.error).join('\n\n');
            finalResponseText = `Here is the result of the operation:\n\n${rawOutput}`;
            onToken?.(finalResponseText);
        }

        const finalModelMsg: Message = {
            role: 'model',
            content: finalResponseText,
        };
        this.history.push(finalModelMsg);
        await this.memoryManager.syncMessage(finalModelMsg);

        return finalResponseText;
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