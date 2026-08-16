import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../core/embeddings.js';
import type { Tool, ToolContext } from './types.js';

export const saveMemoryTool: Tool = {
    definition: {
        name: 'save_memory',
        description: 'Saves an important fact, user preference, or long-term context to Supabase memory storage.',
        permission: 'safe',
        schema: {
            name: 'save_memory',
            description: 'Saves an important fact, user preference, or long-term context to Supabase memory storage.',
            parameters: [
                {
                    name: 'content',
                    description: 'The fact or memory content to save.',
                    type: 'string',
                    required: true,
                },
                {
                    name: 'metadata',
                    description: 'Optional JSON string containing metadata like source or topic.',
                    type: 'string',
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
            const content = args.content as string;
            const embedding = await generateEmbedding(content);
            const metadataObj = args.metadata ? JSON.parse(args.metadata as string) : {};

            const { error } = await supabase
                .from('memories')
                .insert([{
                    content: content,
                    metadata: metadataObj,
                    embedding: embedding
                }]);

            if (error) throw error;
            return { success: true, output: 'Memory saved successfully' };
        } catch (err: any) {
            return { success: false, output: '', error: err.message };
        }
    }
};
