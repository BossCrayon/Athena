import { tavily } from '@tavily/core';
import type { Tool, ToolContext } from './types.js';
import type { ExternalObservation, SearchResult } from '../core/external.js';

export const webSearchTool: Tool = {
    definition: {
        name: 'web_search',
        description: 'Performs an intelligent web search using the Tavily API and returns relevant results and answers.',
        permission: 'safe',
        schema: {
            name: 'web_search',
            description: 'Performs an intelligent web search using the Tavily API and returns relevant results and answers.',
            parameters: [
                {
                    name: 'query',
                    description: 'The search query.',
                    type: 'string',
                    required: true,
                },
            ],
        },
        isParallelizable: true,
    },

    async execute(args: Record<string, unknown>, context: ToolContext) {
        const query = typeof args.query === 'string' ? args.query.trim() : '';

        if (!query) {
            return { success: false, output: '', error: 'Search query is required.' };
        }

        const apiKey = process.env.TAVILY_API_KEY;
        if (!apiKey) {
            return { success: false, output: '', error: 'TAVILY_API_KEY is not set in the environment.' };
        }

        try {
            const client = tavily({ apiKey });
            const response = await client.search(query, {
                searchDepth: 'advanced',
                maxResults: 5,
                includeAnswer: true,
            });

            const results: SearchResult[] = (response.results || []).map((res) => {
                let domain = '';
                try { domain = new URL(res.url).hostname; } catch {}

                return {
                    title: res.title ?? '',
                    url: res.url ?? '',
                    domain,
                    snippet: res.content ?? '',
                    publishedAt: typeof (res as any).publishedDate === 'string'
                        ? (res as any).publishedDate
                        : undefined,
                    relevance: typeof (res as any).score === 'number'
                        ? (res as any).score
                        : undefined,
                    sourceType: 'unknown' as const,
                };
            });

            const observations: ExternalObservation[] = results.map((r) => ({
                content: r.snippet,
                title: r.title,
                snippet: r.snippet,
                source: {
                    url: r.url,
                    domain: r.domain,
                    retrievedAt: Date.now(),
                    publishedAt: r.publishedAt ? new Date(r.publishedAt).getTime() : undefined,
                    sourceType: r.sourceType,
                },
            }));

            // Add AI answer if present
            if (response.answer) {
                observations.unshift({
                    content: response.answer,
                    title: `AI Summary for: ${query}`,
                    source: { url: 'https://tavily.com', domain: 'tavily.com', retrievedAt: Date.now(), sourceType: 'unknown' },
                    confidence: 'medium',
                });
            }

            return {
                success: true,
                output: JSON.stringify(observations, null, 2),
            };
        } catch (error) {
            return {
                success: false,
                output: '',
                error: error instanceof Error ? error.message : 'Unknown web search error.',
            };
        }
    },
};
