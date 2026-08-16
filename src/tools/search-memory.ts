import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../core/embeddings.js';
import type { Tool, ToolContext } from './types.js';

export const searchMemoryTool: Tool = {
    definition: {
        name: 'search_memory',
        description: "Searches the user's long-term memory in Supabase to recall facts, context, or previous interactions based on semantic similarity.",
        permission: 'safe',
        schema: {
            name: 'search_memory',
            description: "Searches the user's long-term memory in Supabase to recall facts, context, or previous interactions based on semantic similarity.",
            parameters: [
                {
                    name: 'query',
                    description: 'The query to search the memory for.',
                    type: 'string',
                    required: true,
                },
                {
                    name: 'limit',
                    description: 'Maximum number of results to return (default 5).',
                    type: 'number',
                    required: false,
                }
            ],
        },
    },

    async execute(args: Record<string, unknown>, context: ToolContext) {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) {
            return { success: false, output: '', error: 'Supabase credentials not configured' };
        }
        const supabase = createClient(supabaseUrl, supabaseKey);

        try {
            const query = args.query as string;
            const limit = (args.limit as number) || 5;
            const embedding = await generateEmbedding(query);

            const { data, error } = await supabase.rpc('match_memories', {
                query_embedding: embedding,
                match_threshold: 0.7,
                match_count: limit,
            });

            if (error) throw error;
            return { success: true, output: JSON.stringify(data || [], null, 2) };
        } catch (err: any) {
            return { success: false, output: '', error: err.message };
        }
    }
};
