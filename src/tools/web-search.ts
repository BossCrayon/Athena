import { tavily } from '@tavily/core';
import type { Tool } from './types.js';

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
            
            let output = `Search Results for "${query}":\n\n`;

            if (response.answer) {
                output += `--- AI Answer ---\n${response.answer}\n\n`;
            }

            if (response.results && response.results.length > 0) {
                output += `--- Sources ---\n`;
                response.results.forEach((res, i) => {
                    output += `${i + 1}. ${res.title}\n`;
                    output += `   URL: ${res.url}\n`;
                    output += `   Content: ${res.content}\n\n`;
                });
            } else {
                output += 'No organic results found.';
            }

            return {
                success: true,
                output: output.trim(),
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
