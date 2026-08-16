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

    constructor(modelName: string = 'llama3', baseUrl: string = 'http://localhost:11434') {
        this.model = modelName;
        this.baseUrl = baseUrl;
    }

    getMetadata(): ProviderMetadata {
        return {
            name: `ollama (${this.model})`,
            capabilities: {
                tools: false, // Most Ollama models don't support tools out of the box effectively yet
                vision: false,
                streaming: true,
            },
            cost: 'low', // Local inference is free
            latency: 'medium',
        };
    }

    async generate(
        messages: Message[],
        options?: GenerationOptions,
        tools?: ToolSchema[]
    ): Promise<LLMResponse> {
        if (tools && tools.length > 0) {
            console.warn(`[OllamaProvider] Tools were provided but are not supported by this provider.`);
        }

        const requestBody = {
            model: this.model,
            messages: messages.map(m => ({
                role: m.role,
                content: m.content,
            })),
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

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(l => l.trim().length > 0);
                
                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line);
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

        return {
            text: fullText,
        };
    }

    async continueWithToolResults(
        continuationId: string,
        results: ToolResult[],
        messages: Message[],
        options?: GenerationOptions,
        tools?: ToolSchema[]
    ): Promise<LLMResponse> {
        throw new Error('continueWithToolResults is not supported by OllamaProvider.');
    }
}
