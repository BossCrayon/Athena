export type MemoryType = 'semantic' | 'episodic' | 'project' | 'preference' | 'fact' | 'decision';

export interface MemoryMetadata {
    type?: MemoryType;
    importance?: 'low' | 'medium' | 'high';
    confidence?: 'low' | 'medium' | 'high';
    project?: string;
    source?: string;
    source_task_id?: string;
    source_session_id?: string;
    created_at?: string;
    updated_at?: string;
    supersedes?: string;
    [key: string]: any;
}

export interface MemoryRecord {
    id?: string;
    content: string;
    metadata: MemoryMetadata;
    embedding?: number[];
    similarity?: number;
}

export interface MemoryContextOptions {
    maxMemories?: number;
    maxTokens?: number;
    minimumRelevance?: number;
    project?: string;
    types?: MemoryType[];
}
