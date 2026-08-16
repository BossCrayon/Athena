import { GoogleGenAI } from '@google/genai';

import type {
    GenerationOptions,
    LLMProvider,
    LLMResponse,
    Message,
    ToolCall,
    ToolResult,
    ProviderMetadata,
} from '../types.js';

import type { ToolSchema } from '../../tools/schema.js';

export class GeminiProvider implements LLMProvider {
    private readonly ai: GoogleGenAI;
    private readonly model: string;

    constructor(modelName: string = 'gemini-3.6-flash') {
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not set.');
        }

        this.ai = new GoogleGenAI({
            apiKey,
        });

        this.model = modelName;
    }

    getMetadata(): ProviderMetadata {
        return {
            name: `gemini (${this.model})`,
            capabilities: {
                tools: true,
                vision: true,
                streaming: true,
            },
            cost: 'low',
            latency: 'low',
        };
    }

    private async _getInteractionWithRetry(interactionId: string) {
        for (let i = 0; i < 10; i++) {
            try {
                return await this.ai.interactions.get(interactionId);
            } catch (error: any) {
                if (error.status === 404 || error.statusCode === 404 || error.status === 400 || error.statusCode === 400) {
                    await new Promise((resolve) => setTimeout(resolve, 50));
                    continue;
                }
                throw error;
            }
        }
        throw new Error(`Failed to fetch interaction ${interactionId} after retries.`);
    }

    async generate(
        messages: Message[],
        options?: GenerationOptions,
        tools?: ToolSchema[]
    ): Promise<LLMResponse> {
        try {
            const systemMessage = messages.find(
                (m) => m.role === 'system'
            );
            const userMessages = messages.filter(
                (m) => m.role !== 'system'
            );

            const conversationText = userMessages
                .map(
                    (m) =>
                        `${m.role.toUpperCase()}: ${m.content}`
                )
                .join('\n\n');

            const toolDeclarations = tools?.map((tool) => {
                const properties: Record<string, unknown> = {};
                const required: string[] = [];

                for (const parameter of tool.parameters) {
                    properties[parameter.name] = {
                        type: parameter.type,
                        description: parameter.description,
                    };

                    if (parameter.required) {
                        required.push(parameter.name);
                    }
                }

                return {
                    type: 'function' as const,
                    name: tool.name,
                    description: tool.description,
                    parameters: {
                        type: 'object' as const,
                        properties,
                        ...(required.length > 0 ? { required } : {}),
                    },
                };
            });

            const interactionStream = await this.ai.interactions.create({
                model: this.model,

                ...(systemMessage?.content
                    ? {
                        system_instruction: systemMessage.content,
                    }
                    : {}),

                input: conversationText,

                ...(toolDeclarations
                    ? {
                        tools: toolDeclarations,
                    }
                    : {}),

                stream: true,
            });

            let text = '';
            let continuationId = '';

            for await (const event of interactionStream) {
                if (event.event_type === 'interaction.created') {
                    continuationId = event.interaction.id;
                } else if (
                    event.event_type === 'step.delta' &&
                    event.delta?.type === 'text'
                ) {
                    text += event.delta.text;
                    options?.onToken?.(event.delta.text);
                }
            }

            let toolCalls: ToolCall[] = [];
            try {
                const finalInteraction = await this._getInteractionWithRetry(continuationId);
                toolCalls = finalInteraction.steps
                    .filter((step: any) => step.type === 'function_call')
                    .map((step: any) => ({
                        id: step.id,
                        name: step.name,
                        arguments: step.arguments as Record<string, unknown>,
                    }));
            } catch (error) {
                // If it fails to fetch but we streamed text, gracefully fallback
                if (!text && toolCalls.length === 0) {
                    throw error;
                }
            }

            return {
                text: text,
                continuationId,
                ...(toolCalls.length > 0
                    ? {
                        toolCalls,
                    }
                    : {}),
            };
        } catch (error) {
            throw error;
        }
    }

    async continueWithToolResults(
        continuationId: string,
        results: ToolResult[],
        messages: Message[],
        options?: GenerationOptions,
        tools?: ToolSchema[]
    ): Promise<LLMResponse> {
        const toolDeclarations = tools?.map((tool) => {
            const properties: Record<string, unknown> = {};
            const required: string[] = [];

            for (const parameter of tool.parameters) {
                properties[parameter.name] = {
                    type: parameter.type,
                    description: parameter.description,
                };

                if (parameter.required) {
                    required.push(parameter.name);
                }
            }

            return {
                type: 'function' as const,
                name: tool.name,
                description: tool.description,
                parameters: {
                    type: 'object' as const,
                    properties,
                    ...(required.length > 0 ? { required } : {}),
                },
            };
        });

        const input = results.map((result) => {
            let parsedOutput;
            try {
                parsedOutput = JSON.parse(result.output);
            } catch {
                parsedOutput = { output: result.output };
            }

            return {
                type: 'function_result' as const,
                name: result.toolName,
                call_id: result.toolCallId,
                result: { output: result.output },
            };
        });

        const interactionStream =
            await this.ai.interactions.create({
                model: this.model,

                previous_interaction_id: continuationId,

                input,

                ...(toolDeclarations
                    ? {
                        tools: toolDeclarations,
                    }
                    : {}),

                stream: true,
            });

        let text = '';
        let newContinuationId = continuationId;

        for await (const event of interactionStream) {
            if (event.event_type === 'interaction.created') {
                newContinuationId = event.interaction.id;
            } else if (
                event.event_type === 'step.delta' &&
                event.delta?.type === 'text'
            ) {
                text += event.delta.text;
                options?.onToken?.(event.delta.text);
            }
        }

        let toolCalls: ToolCall[] = [];
        try {
            const finalInteraction = await this._getInteractionWithRetry(newContinuationId);
            toolCalls = finalInteraction.steps
                .filter((step: any) => step.type === 'function_call')
                .map((step: any) => ({
                    id: step.id,
                    name: step.name,
                    arguments: step.arguments as Record<string, unknown>,
                }));
        } catch (error) {
            // Silently fallback to streamed text as expected due to upstream 404 race conditions
        }

        return {
            text: text,
            continuationId: newContinuationId,
            ...(toolCalls.length > 0
                ? {
                    toolCalls,
                }
                : {}),
        };
    }
}