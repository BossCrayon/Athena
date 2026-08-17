import { randomUUID } from 'crypto';
import type {
    GenerationOptions,
    LLMProvider,
    LLMResponse,
    Message,
    ProviderMetadata,
    ToolCall,
    ToolResult,
} from '../types.js';

import type { ToolSchema } from '../../tools/schema.js';

export class OllamaProvider implements LLMProvider {
    private readonly model: string;
    private readonly baseUrl: string;
    private sessions = new Map<string, any[]>();

    constructor(modelName: string = 'llama3.2', baseUrl: string = 'http://127.0.0.1:11434') {
        this.baseUrl = process.env.OLLAMA_HOST || baseUrl;
        this.model = process.env.OLLAMA_MODEL || modelName;
    }

    getMetadata(): ProviderMetadata {
        return {
            name: `ollama (${this.model})`,
            capabilities: {
                tools: true,
                vision: false,
                streaming: true,
                localOnly: true,
            },
            cost: 'low',
            latency: 'medium',
        };
    }

    private formatOllamaMessages(messages: Message[]): any[] {
        return messages.map(m => {
            const contentString = typeof m.content === 'string' 
                ? m.content 
                : m.content.map(p => p.type === 'text' ? p.text : '[Unsupported Image Data]').join('\n');
            
            if (m.role === 'user' && contentString.startsWith('[TOOL RESULT:')) {
                 return {
                     role: 'tool',
                     content: contentString
                 };
            }

            return {
                role: m.role === 'model' ? 'assistant' : m.role,
                content: contentString,
            };
        });
    }

    private formatOllamaTools(tools?: ToolSchema[]): any[] | undefined {
        if (!tools || tools.length === 0) return undefined;
        return tools.map(t => {
            const properties: Record<string, any> = {};
            const required: string[] = [];

            if (t.parameters) {
                for (const p of t.parameters) {
                    properties[p.name] = {
                        type: p.type,
                        description: p.description
                    };
                    if (p.required) required.push(p.name);
                }
            }

            return {
                type: 'function',
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: {
                        type: 'object',
                        properties,
                        required
                    }
                }
            };
        });
    }

    private async executeRequest(
        ollamaMessages: any[],
        options?: GenerationOptions,
        tools?: ToolSchema[]
    ): Promise<LLMResponse> {
        const requestBody = {
            model: this.model,
            messages: ollamaMessages,
            tools: this.formatOllamaTools(tools),
            stream: true,
            options: {
                temperature: options?.temperature ?? 0.7,
                num_predict: options?.maxOutputTokens,
            }
        };

        const response = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
        }

        if (!response.body) throw new Error('Ollama returned empty body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        const toolCalls: ToolCall[] = [];
        const rawToolCalls: any[] = [];

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(l => l.trim().length > 0);
                
                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line);
                        
                        if (parsed.message?.tool_calls) {
                            for (const tc of parsed.message.tool_calls) {
                                rawToolCalls.push(tc);
                                toolCalls.push({
                                    id: randomUUID(),
                                    name: tc.function.name,
                                    arguments: tc.function.arguments || {}
                                });
                            }
                        }

                        if (parsed.message?.content) {
                            fullText += parsed.message.content;
                            options?.onToken?.(parsed.message.content);
                        }
                    } catch (e) {
                        // ignore unparseable chunks
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        let continuationId: string | undefined;
        if (fullText || rawToolCalls.length > 0) {
            ollamaMessages.push({
                role: 'assistant',
                content: fullText,
                ...(rawToolCalls.length > 0 ? { tool_calls: rawToolCalls } : {})
            });
            continuationId = randomUUID();
            this.sessions.set(continuationId, ollamaMessages);
        }
        
        return {
            text: fullText,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            continuationId
        };
    }

    async generate(
        messages: Message[],
        options?: GenerationOptions,
        tools?: ToolSchema[]
    ): Promise<LLMResponse> {
        const ollamaMessages = this.formatOllamaMessages(messages);
        if (options?.systemPrompt) {
            ollamaMessages.unshift({ role: 'system', content: options.systemPrompt });
        }
        return this.executeRequest(ollamaMessages, options, tools);
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
            throw new Error(`Expired continuation ID: ${continuationId}`);
        }
        
        for (const res of results) {
            history.push({
                role: 'tool', 
                content: `[TOOL RESULT: ${res.toolName}]\n${res.output}\n${res.error ? `Error: ${res.error}` : ''}`
            });
        }

        return this.executeRequest(history, options, tools);
    }
}
