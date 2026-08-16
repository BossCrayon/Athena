import type {
    GenerationOptions,
    LLMProvider,
    Message,
    ToolResult,
} from './types.js';

import type { ToolSchema } from '../tools/schema.js';

export class LLMRouter {
    private readonly providers = new Map<string, LLMProvider>();
    private defaultProviderName?: string;
    private fallbackProviders: string[] = [];

    registerProvider(name: string, provider: LLMProvider): void {
        this.providers.set(name, provider);
    }

    setDefaultProvider(name: string): void {
        if (!this.providers.has(name)) {
            throw new Error(`Cannot set default provider to '${name}': Provider not registered.`);
        }
        this.defaultProviderName = name;
    }

    setFallbackProviders(names: string[]): void {
        this.fallbackProviders = names;
    }

    private getProvider(name?: string): LLMProvider {
        const providerName = name ?? this.defaultProviderName;
        if (!providerName) {
            throw new Error('No provider specified and no default provider is set.');
        }
        const provider = this.providers.get(providerName);
        if (!provider) {
            throw new Error(`Provider '${providerName}' is not registered.`);
        }
        return provider;
    }

    private getOptimalProviders(options?: GenerationOptions, tools?: ToolSchema[]): string[] {
        if (options?.provider) {
            return [...new Set([options.provider, ...this.fallbackProviders])].filter((p): p is string => Boolean(p));
        }

        const routing = options?.routing;
        const requireTools = routing?.requireTools ?? (tools && tools.length > 0);
        const requireStreaming = routing?.requireStreaming ?? !!options?.onToken;
        
        let candidates = Array.from(this.providers.entries())
            .map(([name, provider]) => ({ name, metadata: provider.getMetadata() }));

        candidates = candidates.filter(({ metadata }) => {
            if (requireTools && !metadata.capabilities.tools) return false;
            if (requireStreaming && !metadata.capabilities.streaming) return false;
            if (routing?.requireVision && !metadata.capabilities.vision) return false;
            
            const costLevels = { 'low': 1, 'medium': 2, 'high': 3 };
            if (routing?.maxCost) {
                if (costLevels[metadata.cost] > costLevels[routing.maxCost]) return false;
            }
            
            return true;
        });

        if (routing?.priority) {
            candidates.sort((a, b) => {
                const costLevels = { 'low': 1, 'medium': 2, 'high': 3 };
                const latencyLevels = { 'low': 1, 'medium': 2, 'high': 3 };

                if (routing.priority === 'cost') {
                    return costLevels[a.metadata.cost] - costLevels[b.metadata.cost];
                } else if (routing.priority === 'latency') {
                    return latencyLevels[a.metadata.latency] - latencyLevels[b.metadata.latency];
                }
                return 0; 
            });
        } else {
            candidates.sort((a, b) => {
                if (a.name === this.defaultProviderName) return -1;
                if (b.name === this.defaultProviderName) return 1;
                return 0;
            });
        }

        const optimalNames = candidates.map(c => c.name);
        const finalProviders = [...new Set([...optimalNames, ...this.fallbackProviders])].filter((p): p is string => Boolean(p));
        
        if (finalProviders.length === 0 && this.defaultProviderName) {
            return [this.defaultProviderName];
        }
        return finalProviders;
    }

    async generate(
        messages: Message[],
        options?: GenerationOptions,
        tools?: ToolSchema[]
    ) {
        const uniqueProviders = this.getOptimalProviders(options, tools);

        let lastError: unknown;

        for (const providerName of uniqueProviders) {
            try {
                const provider = this.providers.get(providerName);
                if (!provider) continue;

                return await provider.generate(messages, options, tools);
            } catch (error) {
                lastError = error;
                console.warn(`[LLMRouter] Provider '${providerName}' failed during generate:`, error);
                // Continue to the next provider
            }
        }

        throw lastError ?? new Error('All providers failed.');
    }

    async continueWithToolResults(
        continuationId: string,
        results: ToolResult[],
        messages: Message[],
        options?: GenerationOptions,
        tools?: ToolSchema[]
    ) {
        const uniqueProviders = this.getOptimalProviders(options, tools);
        let lastError: unknown;

        // Try the primary provider that owns the continuationId
        const primaryProviderName = uniqueProviders[0];
        if (primaryProviderName) {
            try {
                const provider = this.providers.get(primaryProviderName);
                if (provider) {
                    return await provider.continueWithToolResults(
                        continuationId,
                        results,
                        messages,
                        options,
                        tools
                    );
                }
            } catch (error) {
                lastError = error;
                console.warn(`\n[LLMRouter] Primary provider '${primaryProviderName}' failed on continueWithToolResults. Falling back...`);
            }
        }

        // If the primary provider fails, we cannot safely resume the same continuation context on another provider.
        // Instead, we recreate the conversation tool history manually and use generate() on the fallback providers.
        const toolCallsContent = JSON.stringify(results.map(r => ({
            name: r.toolName,
            id: r.toolCallId,
        })));
        const toolResultsContent = JSON.stringify(results.map(r => ({
            name: r.toolName,
            success: r.success,
            output: r.output,
            error: r.error,
        })));
        
        const fallbackMessages: Message[] = [
            ...messages,
            { role: 'model', content: `[System Note: I decided to call the following tools: ${toolCallsContent}]` },
            { role: 'user', content: `[System Note: Tool execution results: ${toolResultsContent}]` },
        ];

        // Try the remaining fallback providers
        for (let i = 1; i < uniqueProviders.length; i++) {
            const providerName = uniqueProviders[i];
            try {
                const provider = this.providers.get(providerName);
                if (!provider) continue;

                return await provider.generate(fallbackMessages, options, tools);
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError ?? new Error('All providers failed during continueWithToolResults.');
    }
}