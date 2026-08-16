import OpenAI from 'openai';
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

export class OpenRouterProvider implements LLMProvider {
    private readonly client: OpenAI;
    private readonly model: string;

    // We keep state locally because OpenRouter doesn't have stateful interaction IDs like Gemini
    private readonly sessions = new Map<string, OpenAI.Chat.ChatCompletionMessageParam[]>();

    constructor(modelName: string = 'google/gemini-3.6-flash') {
        const apiKey = process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            throw new Error('OPENROUTER_API_KEY is not set.');
        }

        this.client = new OpenAI({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey,
        });

        this.model = modelName;
    }

    getMetadata(): ProviderMetadata {
        return {
            name: `openrouter (${this.model})`,
            capabilities: {
                tools: true,
                vision: false, // Assume false safely unless specific model supports it
                streaming: true,
            },
            cost: 'medium',
            latency: 'medium',
        };
    }

    private convertTools(tools?: ToolSchema[]): OpenAI.Chat.ChatCompletionTool[] | undefined {
        if (!tools || tools.length === 0) return undefined;
        
        return tools.map((tool) => {
            const properties: Record<string, unknown> = {};
            const required: string[] = [];

            for (const parameter of tool.parameters) {
                properties[parameter.name] = {
                    type: parameter.type as "string" | "number" | "boolean" | "object",
                    description: parameter.description,
                };
                if (parameter.required) {
                    required.push(parameter.name);
                }
            }

            return {
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: {
                        type: 'object',
                        properties,
                        required,
                        additionalProperties: false,
                    },
                },
            };
        });
    }

    async generate(
        messages: Message[],
        options?: GenerationOptions,
        tools?: ToolSchema[]
    ): Promise<LLMResponse> {
        const formattedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map(m => ({
            role: m.role === 'model' ? 'assistant' : m.role,
            content: m.content
        }));

        const stream = await this.client.chat.completions.create({
            model: this.model,
            messages: formattedMessages,
            temperature: options?.temperature,
            max_tokens: options?.maxOutputTokens ?? 512,
            tools: this.convertTools(tools),
            stream: true
        });

        let text = '';
        const toolCallsArgs: Record<number, { id: string, name: string, arguments: string }> = {};

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
                text += delta.content;
                options?.onToken?.(delta.content);
            }

            if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                    if (!toolCallsArgs[tc.index]) {
                        toolCallsArgs[tc.index] = { id: tc.id!, name: tc.function!.name!, arguments: '' };
                    }
                    if (tc.function?.arguments) {
                        toolCallsArgs[tc.index].arguments += tc.function.arguments;
                    }
                }
            }
        }

        let toolCalls: ToolCall[] | undefined;
        let continuationId: string | undefined;

        if (Object.keys(toolCallsArgs).length > 0) {
            toolCalls = Object.values(toolCallsArgs).map(tc => ({
                id: tc.id,
                name: tc.name,
                arguments: JSON.parse(tc.arguments)
            }));

            const message: OpenAI.Chat.ChatCompletionMessageParam = {
                role: 'assistant',
                content: text || null,
                tool_calls: Object.values(toolCallsArgs).map(tc => ({
                    id: tc.id,
                    type: 'function',
                    function: {
                        name: tc.name,
                        arguments: tc.arguments
                    }
                }))
            };

            continuationId = Math.random().toString(36).substring(7);
            formattedMessages.push(message);
            this.sessions.set(continuationId, formattedMessages);
        }

        return {
            text,
            continuationId,
            ...(toolCalls ? { toolCalls } : {}),
        };
    }

    async continueWithToolResults(
        continuationId: string,
        results: ToolResult[],
        messages: Message[],
        options?: GenerationOptions,
        tools?: ToolSchema[]
    ): Promise<LLMResponse> {
        const history = this.sessions.get(continuationId);
        if (!history) {
            throw new Error(`Invalid or expired continuation ID: ${continuationId}`);
        }

        for (const result of results) {
            history.push({
                role: 'tool',
                tool_call_id: result.toolCallId,
                name: result.toolName, // ADD NAME HERE
                content: JSON.stringify({
                    success: result.success,
                    output: result.output,
                    ...(result.error ? { error: result.error } : {})
                })
            } as any); // Cast to any to bypass strict type check if name is not standard in their types
        }

        const stream = await this.client.chat.completions.create({
            model: this.model,
            messages: history,
            temperature: options?.temperature,
            max_tokens: options?.maxOutputTokens ?? 512,
            tools: this.convertTools(tools),
            stream: true
        });

        let text = '';
        const toolCallsArgs: Record<number, { id: string, name: string, arguments: string }> = {};

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
                text += delta.content;
                options?.onToken?.(delta.content);
            }

            if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                    if (!toolCallsArgs[tc.index]) {
                        toolCallsArgs[tc.index] = { id: tc.id!, name: tc.function!.name!, arguments: '' };
                    }
                    if (tc.function?.arguments) {
                        toolCallsArgs[tc.index].arguments += tc.function.arguments;
                    }
                }
            }
        }

        let toolCalls: ToolCall[] | undefined;

        if (Object.keys(toolCallsArgs).length > 0) {
            toolCalls = Object.values(toolCallsArgs).map(tc => ({
                id: tc.id,
                name: tc.name,
                arguments: JSON.parse(tc.arguments)
            }));

            const message: OpenAI.Chat.ChatCompletionMessageParam = {
                role: 'assistant',
                content: text || null,
                tool_calls: Object.values(toolCallsArgs).map(tc => ({
                    id: tc.id,
                    type: 'function',
                    function: {
                        name: tc.name,
                        arguments: tc.arguments
                    }
                }))
            };
            
            history.push(message);
        } else {
            this.sessions.delete(continuationId);
        }

        return {
            text,
            continuationId,
            ...(toolCalls ? { toolCalls } : {}),
        };
    }
}
