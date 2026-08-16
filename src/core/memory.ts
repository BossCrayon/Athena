import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Message } from '../llm/types.js';
import * as crypto from 'crypto';

export class CloudMemoryManager {
    private supabase: SupabaseClient | null = null;
    private sessionId: string;
    
    constructor() {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;
        
        if (supabaseUrl && supabaseKey) {
            this.supabase = createClient(supabaseUrl, supabaseKey);
        } else {
            console.warn('[Memory] Supabase credentials not found in .env. Memory will not be persisted.');
        }

        // For a CLI, we generate a unique session ID per user machine. 
        // In a real app, this would be tied to user auth. We'll use a fixed ID for the single user CLI for now 
        // so that ATHENA remembers the conversation across restarts.
        this.sessionId = 'athena-cli-user-session';
    }

    async loadHistory(): Promise<Message[]> {
        if (!this.supabase) return [];

        try {
            const { data, error } = await this.supabase
                .from('messages')
                .select('*')
                .eq('session_id', this.sessionId)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) {
                console.error('[Memory] Error loading history from Supabase:', error.message);
                return [];
            }

            if (!data || data.length === 0) {
                return [];
            }

            // Reverse the data so it's chronologically ascending for the LLM
            data.reverse();

            // Convert Supabase rows back to Message objects
            return data.map((row) => {
                // If it's a model message with a JSON object (like our mock tool results), we just parse it back if needed
                // But since content is a string, we just pass it as string.
                return {
                    role: row.role as Message['role'],
                    content: row.content,
                };
            });
        } catch (err) {
            console.error('[Memory] Failed to load history:', err);
            return [];
        }
    }

    async syncMessage(message: Message): Promise<void> {
        if (!this.supabase) return;

        try {
            const { error } = await this.supabase
                .from('messages')
                .insert([
                    {
                        session_id: this.sessionId,
                        role: message.role,
                        content: typeof message.content === 'string' 
                            ? message.content 
                            : JSON.stringify(message.content), // Fallback in case content is object (though type says string)
                    }
                ]);

            if (error) {
                console.error('[Memory] Failed to sync message to Supabase:', error.message);
            }
        } catch (err) {
            console.error('[Memory] Exception during message sync:', err);
        }
    }
}
