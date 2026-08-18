import type {
    GenerationOptions,
    LLMProvider,
    Message,
    ToolResult,
    ProviderHealth,
    LLMResponse,
} from './types.js';

import type { ToolSchema } from '../tools/schema.js';
import type { EventBus } from '../core/events.js';
import { classifyError } from '../core/telemetry.js';

export class LLMRouter {
    private readonly providers = new Map<string, LLMProvider>();
    private readonly healthState = new Map<string, ProviderHealth>();
    private defaultProviderName?: string;
    private fallbackProviders: string[] = [];

    constructor(private readonly eventBus?: EventBus) {}

    registerProvider(name: string, provider: LLMProvider): void {
        this.providers.set(name, provider);
        this.healthState.set(name, {
            status: 'healthy',
            failures: 0,
            successes: 0,
        });
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

    getProviderHealth(name: string): ProviderHealth | undefined {
        return this.healthState.get(name);
    }

    private handleProviderSuccess(providerName: string) {
        const state = this.healthState.get(providerName);
        if (!state) return;
        state.successes += 1;
        state.failures = 0;
        state.status = 'healthy';
        state.cooldownUntil = undefined;
    }

    private handleProviderFailure(providerName: string, error: any) {
        const state = this.healthState.get(providerName);
        if (!state) return;

        state.failures += 1;
        
        const errStr = String(error?.message || error).toLowerCase();
        const status = error?.status || error?.statusCode;

        // Detect rate limit
        const isRateLimit = status === 429 || errStr.includes('429') || errStr.includes('quota') || errStr.includes('rate limit') || /(?:retry|try again) in/i.test(errStr);

        if (isRateLimit) {
            state.status = 'rate-limited';
            
            let cooldownSeconds = 60; // Default 60s
            
            if (error?.headers?.['retry-after']) {
                const retryAfter = parseInt(error.headers['retry-after'], 10);
                if (!isNaN(retryAfter) && retryAfter > 0) {
                    cooldownSeconds = retryAfter;
                }
            } else if (error?.retryAfter) {
                const retryAfter = parseFloat(error.retryAfter);
                if (!isNaN(retryAfter) && retryAfter > 0) {
                    cooldownSeconds = Math.ceil(retryAfter);
                }
            } else {
                const retryMatch = errStr.match(/(?:retry|try again) in ([\d\.]+)s/i);
                if (retryMatch && retryMatch[1]) {
                    const parsed = parseFloat(retryMatch[1]);
                    if (!isNaN(parsed) && parsed > 0) {
                        cooldownSeconds = Math.ceil(parsed);
                    }
                }
            }
            
            // Limit the cooldown to max 5 minutes to prevent infinite hangs
            cooldownSeconds = Math.min(cooldownSeconds, 300);
            
            state.cooldownUntil = Date.now() + cooldownSeconds * 1000;
            if (this.eventBus) {
                this.eventBus.emit('telemetry', {
                    eventType: 'provider_rate_limited',
                    timestamp: new Date().toISOString(),
                    provider: providerName,
                    errorCategory: 'provider_rate_limited'
                });
            }
        } else {
            // Standard error
            const errCategory = classifyError(error);
            const isEmptyResponse = errCategory === 'provider_empty_response';
            
            if (isEmptyResponse) {
                state.status = 'error';
                state.cooldownUntil = Date.now() + 60 * 1000;
            } else if (state.failures >= 3) {
                state.status = 'error';
                state.cooldownUntil = Date.now() + 30 * 1000; // 30s cooldown for general repeated errors
            }
            if (this.eventBus) {
                this.eventBus.emit('telemetry', {
                    eventType: isEmptyResponse ? 'provider_empty_response' : 'provider_failed',
                    timestamp: new Date().toISOString(),
                    provider: providerName,
                    errorCategory: errCategory
                });
            }
        }
    }

    private getOptimalProviders(options?: GenerationOptions, tools?: ToolSchema[]): string[] {
        const now = Date.now();
        // check and recover providers
        for (const [name, state] of this.healthState.entries()) {
            if ((state.status === 'rate-limited' || state.status === 'error' || state.status === 'offline') && state.cooldownUntil && state.cooldownUntil <= now) {
                state.status = 'healthy';
                state.cooldownUntil = undefined;
                if (this.eventBus) {
                    this.eventBus.emit('telemetry', {
                        eventType: 'provider_recovered',
                        timestamp: new Date().toISOString(),
                        provider: name
                    });
                }
            }
        }

        let candidates = Array.from(this.providers.entries())
            .map(([name, provider]) => ({ name, metadata: provider.getMetadata() }));

        // Filter by health FIRST
        candidates = candidates.filter(({ name }) => {
            const state = this.healthState.get(name);
            return state && state.status === 'healthy';
        });

        if (options?.provider) {
            const requestedHealthy = candidates.find(c => c.name === options.provider);
            const fallbackHealthy = this.fallbackProviders.filter(p => {
                const state = this.healthState.get(p);
                return state && state.status === 'healthy';
            });
            
            const list = requestedHealthy ? [options.provider, ...fallbackHealthy] : fallbackHealthy;
            return [...new Set(list)].filter((p): p is string => Boolean(p));
        }

        const routing = options?.routing;
        const requireTools = routing?.requireTools ?? (tools && tools.length > 0);
        const requireStreaming = routing?.requireStreaming ?? !!options?.onToken;
        
        candidates = candidates.filter(({ metadata }) => {
            if (requireTools && !metadata.capabilities.tools) return false;
            if (requireStreaming && !metadata.capabilities.streaming) return false;
            if (routing?.requireVision && !metadata.capabilities.vision) return false;
            
            // Intent-based filtering
            const intent = routing?.intent;
            if (intent) {
                if (intent.reasoning && !metadata.capabilities.reasoning) return false;
                if (intent.coding && !metadata.capabilities.coding) return false;
                if (intent.localOnly && !metadata.capabilities.localOnly) return false;
                if (intent.privacy && !metadata.capabilities.privacy) return false;
                if (intent.longContext && !metadata.capabilities.longContext) return false;
            }
            
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
        } else if (routing?.intent?.fastResponse) {
            candidates.sort((a, b) => {
                const latencyLevels = { 'low': 1, 'medium': 2, 'high': 3 };
                return latencyLevels[a.metadata.latency] - latencyLevels[b.metadata.latency];
            });
        } else {
            candidates.sort((a, b) => {
                if (a.name === this.defaultProviderName) return -1;
                if (b.name === this.defaultProviderName) return 1;
                return 0;
            });
        }

        const optimalNames = candidates.map(c => c.name);
        const fallbackHealthy = this.fallbackProviders.filter(p => {
            const state = this.healthState.get(p);
            return state && state.status === 'healthy';
        });
        
        const finalProviders = [...new Set([...optimalNames, ...fallbackHealthy])].filter((p): p is string => Boolean(p));
        
        if (finalProviders.length === 0 && this.defaultProviderName) {
            const defaultState = this.healthState.get(this.defaultProviderName);
            if (defaultState && defaultState.status === 'healthy') {
                return [this.defaultProviderName];
            }
        }
        return finalProviders;
    }

    async generate(
        messages: Message[],
        options?: GenerationOptions,
        tools?: ToolSchema[]
    ) {
        const uniqueProviders = this.getOptimalProviders(options, tools);

        if (uniqueProviders.length === 0) {
            throw new Error('All providers are unavailable or incompatible with the requested capabilities.');
        }

        let lastError: unknown;

        let isFallback = false;
        let lastFailedProvider = '';

        for (const providerName of uniqueProviders) {
            try {
                const provider = this.providers.get(providerName);
                if (!provider) continue;

                if (this.eventBus) {
                    if (isFallback) {
                        this.eventBus.emit('telemetry', {
                            eventType: 'provider_fallback',
                            timestamp: new Date().toISOString(),
                            provider: providerName,
                            from: lastFailedProvider,
                            to: providerName
                        });
                    } else {
                        this.eventBus.emit('telemetry', {
                            eventType: 'provider_selected',
                            timestamp: new Date().toISOString(),
                            provider: providerName
                        });
                    }
                }

                const generatePromise = provider.generate(messages, options, tools);
                
                let result: LLMResponse;
                const startMs = Date.now();
                if (options?.signal) {
                    result = await Promise.race([
                        generatePromise,
                        new Promise<LLMResponse>((_, reject) => {
                            if (options.signal!.aborted) {
                                return reject(new Error('AbortError'));
                            }
                            options.signal!.addEventListener('abort', () => reject(new Error('AbortError')));
                        })
                    ]);
                } else {
                    result = await generatePromise;
                }
                
                if (!result.text?.trim() && !result.toolCalls?.length) {
                    throw new Error('Provider returned an empty response.');
                }
                
                this.handleProviderSuccess(providerName);
                if (this.eventBus) {
                    this.eventBus.emit('telemetry', {
                        eventType: 'provider_completed',
                        timestamp: new Date().toISOString(),
                        provider: providerName,
                        durationMs: Date.now() - startMs
                    });
                }
                return result;
            } catch (error: any) {
                if (error?.message === 'AbortError') throw error; // Don't fallback on user cancellation
                lastError = error;
                this.handleProviderFailure(providerName, error);
                lastFailedProvider = providerName;
                isFallback = true;
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

        if (uniqueProviders.length === 0) {
            throw new Error('All providers are unavailable or incompatible with the requested capabilities.');
        }

        let lastError: unknown;

        // Try the primary provider that owns the continuationId
        const primaryProviderName = uniqueProviders[0];
        if (primaryProviderName) {
            try {
                const provider = this.providers.get(primaryProviderName);
                if (provider) {
                    if (this.eventBus) {
                        this.eventBus.emit('telemetry', {
                            eventType: 'provider_selected',
                            timestamp: new Date().toISOString(),
                            provider: primaryProviderName
                        });
                    }
                    const startMs = Date.now();
                    
                    const continuePromise = provider.continueWithToolResults(
                        continuationId,
                        results,
                        messages,
                        options,
                        tools
                    );
                    
                    let result: LLMResponse;
                    if (options?.signal) {
                        result = await Promise.race([
                            continuePromise,
                            new Promise<LLMResponse>((_, reject) => {
                                if (options.signal!.aborted) {
                                    return reject(new Error('AbortError'));
                                }
                                options.signal!.addEventListener('abort', () => reject(new Error('AbortError')));
                            })
                        ]);
                    } else {
                        result = await continuePromise;
                    }
                    
                    if (!result.text?.trim() && !result.toolCalls?.length) {
                        throw new Error('Provider returned an empty response.');
                    }
                    
                    if (this.eventBus) {
                        this.eventBus.emit('telemetry', {
                            eventType: 'provider_completed',
                            timestamp: new Date().toISOString(),
                            provider: primaryProviderName,
                            durationMs: Date.now() - startMs
                        });
                    }
                    this.handleProviderSuccess(primaryProviderName);
                    return result;
                }
            } catch (error: any) {
                if (error?.message === 'AbortError') throw error; // Don't fallback on user cancellation
                lastError = error;
                this.handleProviderFailure(primaryProviderName, error);
                if (this.eventBus) {
                    this.eventBus.emit('telemetry', {
                        eventType: 'provider_failed',
                        timestamp: new Date().toISOString(),
                        provider: primaryProviderName,
                        errorCategory: classifyError(error)
                    });
                }
            }
        }

        // Filter the remaining providers. Re-run getOptimalProviders in case handleProviderFailure marked primary as unhealthy.
        const fallbackProvidersList = this.getOptimalProviders(options, tools).filter(p => p !== primaryProviderName);

        if (fallbackProvidersList.length === 0) {
            throw lastError ?? new Error('All fallback providers are unavailable.');
        }

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

        let isFallback = true;
        let lastFailedProvider = primaryProviderName || '';
        // Try the remaining fallback providers
        for (const providerName of fallbackProvidersList) {
            try {
                const provider = this.providers.get(providerName);
                if (!provider) continue;

                if (this.eventBus) {
                    this.eventBus.emit('telemetry', {
                        eventType: 'provider_fallback',
                        timestamp: new Date().toISOString(),
                        provider: providerName,
                        from: lastFailedProvider,
                        to: providerName
                    });
                }

                const generatePromise = provider.generate(fallbackMessages, options, tools);
                let result: LLMResponse;
                if (options?.signal) {
                    result = await Promise.race([
                        generatePromise,
                        new Promise<LLMResponse>((_, reject) => {
                            if (options.signal!.aborted) {
                                return reject(new Error('AbortError'));
                            }
                            options.signal!.addEventListener('abort', () => reject(new Error('AbortError')));
                        })
                    ]);
                } else {
                    result = await generatePromise;
                }

                if (!result.text?.trim() && !result.toolCalls?.length) {
                    throw new Error('Provider returned an empty response.');
                }

                this.handleProviderSuccess(providerName);
                if (this.eventBus) {
                    this.eventBus.emit('telemetry', {
                        eventType: 'provider_completed',
                        timestamp: new Date().toISOString(),
                        provider: providerName
                    });
                }
                return result;
            } catch (error: any) {
                if (error?.message === 'AbortError') throw error; // Don't fallback on user cancellation
                lastError = error;
                this.handleProviderFailure(providerName, error);
                lastFailedProvider = providerName;
            }
        }

        throw lastError ?? new Error('All providers failed during continueWithToolResults.');
    }
}