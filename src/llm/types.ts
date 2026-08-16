import type { ToolSchema } from '../tools/schema.js';

export type Role = 'user' | 'model' | 'system';

export interface Message {
    role: Role;
    content: string;
}

export interface GenerationOptions {
    temperature?: number;
    maxOutputTokens?: number;
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

export interface ToolResult {
    toolCallId: string;
    toolName: string;
    success: boolean;
    output: string;
    error?: string;
}

export interface LLMResponse {
    text: string;
    toolCalls?: ToolCall[];

    /**
     * Provider-specific continuation identifier.
     *
     * For Gemini this is the Interaction ID.
     * Other providers can use their own continuation mechanism.
     */
    continuationId?: string;
}

export interface LLMProvider {
    generate(
        messages: Message[],
        options?: GenerationOptions,
        tools?: ToolSchema[]
    ): Promise<LLMResponse>;

    continueWithToolResults(
        continuationId: string,
        results: ToolResult[],
        tools?: ToolSchema[]
    ): Promise<LLMResponse>;
}