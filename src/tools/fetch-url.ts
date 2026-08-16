import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import type { Tool } from './types.js';

export const fetchUrlTool: Tool = {
    definition: {
        name: 'fetch_url',
        description: 'Fetches a webpage URL and extracts its main content as readable Markdown text.',
        permission: 'safe',
        schema: {
            name: 'fetch_url',
            description: 'Fetches a webpage URL and extracts its main content as readable Markdown text.',
            parameters: [
                {
                    name: 'url',
                    description: 'The full URL of the webpage to fetch.',
                    type: 'string',
                    required: true,
                },
            ],
        },
    },

    async execute(args: Record<string, unknown>) {
        const url = args.url as string;
        if (!url) {
            return {
                success: false,
                output: '',
                error: 'URL is required.',
            };
        }

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
            }

            const html = await response.text();
            
            // Parse HTML and remove clutter
            const $ = cheerio.load(html);
            $('script, style, noscript, iframe, nav, footer, header, aside').remove();
            
            // Extract the main body
            let mainHtml = $('article').html() || $('main').html() || $('.main-content').html() || $('body').html();
            
            if (!mainHtml) {
                mainHtml = html;
            }

            // Convert HTML to Markdown
            const turndownService = new TurndownService({
                headingStyle: 'atx',
                codeBlockStyle: 'fenced'
            });
            const markdown = turndownService.turndown(mainHtml);

            // Limit output length to prevent overwhelming the context window
            const MAX_LENGTH = 15000;
            const finalOutput = markdown.length > MAX_LENGTH 
                ? markdown.substring(0, MAX_LENGTH) + '\n\n... [Content Truncated]' 
                : markdown;

            return {
                success: true,
                output: `Source: ${url}\n\n${finalOutput}`,
            };
        } catch (error) {
            return {
                success: false,
                output: '',
                error: error instanceof Error ? error.message : 'Unknown error fetching URL.',
            };
        }
    },
};
