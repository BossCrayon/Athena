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
        return tools.map(t => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters || { type: 'object', properties: {} }
            }
        }));
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
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
        }

        if (!response.body) {
            throw new Error('Ollama returned empty body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        const toolCalls: ToolCall[] = [];

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

        const continuationHistory = [...messages];
        if (fullText || toolCalls.length > 0) {
             continuationHistory.push({ 
                 role: 'model', 
                 content: fullText 
             });
        }
        
        return {
            text: fullText,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            continuationId: toolCalls.length > 0 ? JSON.stringify(continuationHistory) : undefined
        };
    }

    async continueWithToolResults(
        continuationId: string,
        results: ToolResult[],
        messages: Message[],
        options?: GenerationOptions,
        tools?: ToolSchema[]
    ): Promise<LLMResponse> {
        
        let history: Message[] = [];
        try {
            history = JSON.parse(continuationId);
        } catch(e) {
            history = messages;
        }
        
        for (const res of results) {
            history.push({
                role: 'user', 
                content: `[TOOL RESULT: ${res.toolName}]\n${res.output}\n${res.error ? `Error: ${res.error}` : ''}`
            });
        }

        return this.generate(history, options, tools);
    }
}
