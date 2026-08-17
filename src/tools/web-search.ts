import { tavily } from '@tavily/core';
import type { Tool } from './types.js';
import type { SearchResult, ExternalObservation } from '../core/external.js';

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
        },
        isParallelizable: true
    },

    async execute(args: Record<string, unknown>) {
        const query = args.query as string;
        if (!query) {
            return {
                success: false,
                output: '',
                error: 'Search query is required.',
            };
        }

        const apiKey = process.env.TAVILY_API_KEY;
        if (!apiKey) {
            return {
                success: false,
                output: '',
                error: 'TAVILY_API_KEY is not set in the environment.',
            };
        }

        try {
            const tvly = tavily({ apiKey });
            
            // Perform an advanced search
            const response = await tvly.search(query, {
                searchDepth: 'advanced',
                maxResults: 5,
                includeAnswer: true,
            });
            
            let observations: ExternalObservation[] = [];

            if (response.answer) {
                observations.push({
                    content: response.answer,
                    source: {
                        url: 'https://tavily.com',
                        domain: 'tavily.com',
                        retrievedAt: Date.now(),
                        sourceType: 'unknown'
                    },
                    confidence: 'medium',
                    title: `AI Summary for: ${query}`
                });
            }

            if (response.results && response.results.length > 0) {
                for (const res of response.results) {
                    let domain = '';
                    try {
                        domain = new URL(res.url).hostname;
                    } catch {}
                    
                    observations.push({
                        content: res.content,
                        source: {
                            url: res.url,
                            domain,
                            retrievedAt: Date.now(),
                            sourceType: 'unknown',
                            publishedAt: undefined // Tavily advanced might not return this standardly, leave undefined
                        },
                        title: res.title,
                        snippet: res.content.substring(0, 500)
                    });
                }
            }

            return {
                success: true,
                output: JSON.stringify(observations),
            };
        } catch (error) {
            return {
                success: false,
                output: '',
                error: error instanceof Error ? error.message : 'Unknown error during web search.',
            };
        }
    },
};
