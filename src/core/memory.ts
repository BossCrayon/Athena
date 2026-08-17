import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Message } from '../llm/types.js';
import * as crypto from 'crypto';
import { generateEmbedding } from './embeddings.js';
import type { MemoryRecord, MemoryContextOptions } from './memory-types.js';

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

            data.reverse();
            return data.map((row) => ({
                role: row.role as Message['role'],
                content: row.content,
            }));
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
                .insert([{
                    session_id: this.sessionId,
                    role: message.role,
                    content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
                }]);

            if (error) {
                console.error('[Memory] Failed to sync message to Supabase:', error.message);
            }
        } catch (err) {

            console.error('[Memory] Exception during message sync:', err);
        }
    }

    // --- Advanced Memory Methods ---

    async searchRelevantContext(query: string, options: MemoryContextOptions = {}): Promise<MemoryRecord[]> {
        if (!this.supabase) return [];
        
        try {
            const limit = options.maxMemories || 5;
            const threshold = options.minimumRelevance || 0.6;
            const embedding = await generateEmbedding(query);

            const { data, error } = await this.supabase.rpc('match_memories', {
                query_embedding: embedding,
                match_threshold: threshold,
                match_count: limit * 3, // Fetch extra to allow for client-side filtering
                p_session_id: this.sessionId,
            });

            if (error) throw error;
            if (!data) return [];

            let records: MemoryRecord[] = data.map((row: any) => ({
                id: row.id,
                content: row.content,
                metadata: row.metadata || {},
                similarity: row.similarity
            }));

            // Filter out superseded memories
            records = records.filter(r => r.metadata.status !== 'superseded');

            if (options.project) {
                records = records.filter(r => r.metadata.project === options.project);
            }
            if (options.types && options.types.length > 0) {
                records = records.filter(r => r.metadata.type && options.types!.includes(r.metadata.type as any));
            }

            return records.slice(0, limit);
        } catch (err) {
            console.error('[Memory] Search failed:', err);
            return [];
        }
    }

    async upsertMemory(record: MemoryRecord): Promise<void> {
        if (!this.supabase) return;

        try {
            const embedding = record.embedding || await generateEmbedding(record.content);
            record.metadata.updated_at = new Date().toISOString();
            if (!record.metadata.status) record.metadata.status = 'active';

            // Handle supersession first
            if (record.metadata.supersedes) {
                const ids = record.metadata.supersedes.split(',');
                for (const id of ids) {
                    if (!id.trim()) continue;
                    
                    // Fetch existing metadata to merge
                    const { data: existingData } = await this.supabase
                        .from('memories')
                        .select('metadata')
                        .eq('id', id.trim())
                        .single();

                    if (existingData) {
                        await this.supabase
                            .from('memories')
                            .update({
                                metadata: { ...existingData.metadata, status: 'superseded', superseded_by_task: record.metadata.source_task_id }
                            })
                            .eq('id', id.trim());
                    }
                }
            }

            if (!record.id) {
                const { data } = await this.supabase.rpc('match_memories', {
                    query_embedding: embedding,
                    match_threshold: 0.95,
                    match_count: 1,
                });

                if (data && data.length > 0) {
                    const existing = data[0];
                    const { error: updateError } = await this.supabase
                        .from('memories')
                        .update({
                            content: record.content, // update content to latest
                            metadata: { ...existing.metadata, ...record.metadata },
                            embedding: embedding
                        })
                        .eq('id', existing.id);
                        
                    if (updateError) throw updateError;
                    return;
                }
            }

            // Insert new
            const { error: insertError } = await this.supabase
                .from('memories')
                .insert([{
                    content: record.content,
                    metadata: {
                        ...record.metadata,
                        created_at: new Date().toISOString()
                    },
                    embedding: embedding
                }]);

            if (insertError) throw insertError;
        } catch (err) {
            console.error('[Memory] Upsert failed:', err);
        }
    }
}
