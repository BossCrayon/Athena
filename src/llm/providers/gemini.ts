import { GoogleGenAI } from '@google/genai';

import type {
    GenerationOptions,
    LLMProvider,
    LLMResponse,
    Message,
    ToolCall,
    ToolResult,
} from '../types.js';

import type { ToolSchema } from '../../tools/schema.js';

export class GeminiProvider implements LLMProvider {
    private readonly ai: GoogleGenAI;
    private readonly model: string;

    constructor(modelName: string = 'gemini-3.7-flash') {
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not set.');
        }

        this.ai = new GoogleGenAI({
            apiKey,
        });

        this.model = modelName;
    }

    async generate(
        messages: Message[],
        _options?: GenerationOptions,
        tools?: ToolSchema[]
    ): Promise<LLMResponse> {
        const systemMessage = messages.find(
            (message) => message.role === 'system'
        );

        const conversation = messages.filter(
            (message) => message.role !== 'system'
        );

        const conversationText = conversation
            .map((message) => {
                const speaker =
                    message.role === 'user' ? 'USER' : 'ATHENA';

                return `${speaker}: ${message.content}`;
            })
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
                    required,
                },
            };
        });

        const interaction = await this.ai.interactions.create({
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
        });

        const toolCalls: ToolCall[] = interaction.steps
            .filter((step) => step.type === 'function_call')
            .map((step) => ({
                id: step.id,
                name: step.name,
                arguments: step.arguments as Record<string, unknown>,
            }));

        return {
            text: interaction.output_text ?? '',
            continuationId: interaction.id,
            ...(toolCalls.length > 0
                ? { toolCalls }
                : {}),
        };
    }

    async continueWithToolResults(
        continuationId: string,
        results: ToolResult[],
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
                    required,
                },
            };
        });

        const input = results.map((result) => ({
            type: 'function_result' as const,
            name: result.toolName,
            call_id: result.toolCallId,
            result: [
                {
                    type: 'text' as const,
                    text: JSON.stringify({
                        success: result.success,
                        output: result.output,
                        ...(result.error !== undefined
                            ? {
                                error: result.error,
                            }
                            : {}),
                    }),
                },
            ],
        }));

        const interaction =
            await this.ai.interactions.create({
                model: this.model,

                previous_interaction_id: continuationId,

                input,

                ...(toolDeclarations
                    ? {
                        tools: toolDeclarations,
                    }
                    : {}),
            });

        const toolCalls: ToolCall[] =
            interaction.steps
                .filter(
                    (step) =>
                        step.type === 'function_call'
                )
                .map((step) => ({
                    id: step.id,
                    name: step.name,
                    arguments:
                        step.arguments as Record<
                            string,
                            unknown
                        >,
                }));

        return {
            text: interaction.output_text ?? '',
            continuationId: interaction.id,
            ...(toolCalls.length > 0
                ? {
                    toolCalls,
                }
                : {}),
        };
    }
}