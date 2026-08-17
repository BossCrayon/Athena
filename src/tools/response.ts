import type { MessageContentPart } from '../llm/types.js';

export interface ToolResponse {
    toolName: string;
    success: boolean;
    output: string;
    error?: string;
    attachments?: MessageContentPart[];
}