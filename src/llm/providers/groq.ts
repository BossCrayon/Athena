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

export class GroqProvider implements LLMProvider {
    private readonly client: OpenAI;
    private readonly model: string;

    // Keep state locally because Groq doesn't have stateful interaction IDs
    private readonly sessions = new Map<string, OpenAI.Chat.ChatCompletionMessageParam[]>();

    constructor(modelName: string = 'openai/gpt-oss-20b') {
        const apiKey = process.env.GROQ_API_KEY;

        if (!apiKey) {
            throw new Error('GROQ_API_KEY is not set.');
        }

        this.client = new OpenAI({
            baseURL: 'https://api.groq.com/openai/v1',
            apiKey,
        });

        this.model = modelName;
    }

    getMetadata(): ProviderMetadata {
        return {
            name: `groq (${this.model})`,
            capabilities: {
                tools: true,
                vision: false, 
                streaming: true,
            },
            cost: 'low',
            latency: 'low',
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

    private async executeRequest(
        formattedMessages: OpenAI.Chat.ChatCompletionMessageParam[],
        options?: GenerationOptions,
        tools?: ToolSchema[],
        continuationIdToUpdate?: string
    ): Promise<LLMResponse> {
        const stream = await this.client.chat.completions.create({
            model: this.model,
            messages: formattedMessages,
            temperature: options?.temperature,
            max_tokens: options?.maxOutputTokens ?? 1024,
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
        let continuationId = continuationIdToUpdate;

        if (Object.keys(toolCallsArgs).length > 0) {
            toolCalls = Object.values(toolCallsArgs).map(tc => ({
                id: tc.id,
                name: tc.name,
                arguments: JSON.parse(tc.arguments || '{}')
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

            formattedMessages.push(message);
            if (!continuationId) {
                continuationId = Math.random().toString(36).substring(7);
            }
            this.sessions.set(continuationId, formattedMessages);
        } else if (continuationId) {
            this.sessions.delete(continuationId);
        }

        return {
            text,
            continuationId,
            ...(toolCalls ? { toolCalls } : {}),
        };
    }

    async generate(
        messages: Message[],
        options?: GenerationOptions,
        tools?: ToolSchema[]
    ): Promise<LLMResponse> {
        const formattedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map(m => {
            const contentString = typeof m.content === 'string' 
                ? m.content 
                : m.content.map(p => p.type === 'text' ? p.text : '[Unsupported Image Data]').join('\n');
            
            return {
                role: m.role === 'model' ? 'assistant' : m.role,
                content: contentString
            } as OpenAI.Chat.ChatCompletionMessageParam;
        });

        if (options?.systemPrompt) {
            formattedMessages.unshift({ role: 'system', content: options.systemPrompt });
        }

        return this.executeRequest(formattedMessages, options, tools);
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
                name: result.toolName,
                content: JSON.stringify({
                    success: result.success,
                    output: result.output,
                    ...(result.error ? { error: result.error } : {})
                })
            } as any); 
        }

        return this.executeRequest(history, options, tools, continuationId);
    }
}
