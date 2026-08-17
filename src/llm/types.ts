import type { ToolSchema } from '../tools/schema.js';

export type Role = 'user' | 'model' | 'system';

export type MessageContentPart =
    | {
          type: 'text';
          text: string;
      }
    | {
          type: 'image';
          mimeType: string;
          data?: string;
          uri?: string;
          width?: number;
          height?: number;
      }
    | {
          type: 'document';
          mimeType: string;
          data?: string;
          uri?: string;
      };

export interface Message {
    role: Role;
    content: string | MessageContentPart[];
}

export interface RoutingPreferences {
    priority?: 'cost' | 'latency' | 'capability';
    requireTools?: boolean;
    requireVision?: boolean;
    requireStreaming?: boolean;
    maxCost?: 'low' | 'medium' | 'high';
}

export interface GenerationOptions {
    temperature?: number;
    maxTokens?: number;
    maxOutputTokens?: number;
    provider?: string;
    systemPrompt?: string;
    onToken?: (text: string) => void;
    signal?: AbortSignal;
    routing?: {
        priority?: 'cost' | 'latency';
        requireTools?: boolean;
        requireStreaming?: boolean;
        requireVision?: boolean;
        maxCost?: 'low' | 'medium' | 'high';
        // New intent-based requirements
        intent?: {
            reasoning?: boolean;
            coding?: boolean;
            fastResponse?: boolean;
            privacy?: boolean;
            localOnly?: boolean;
            longContext?: boolean;
        };
    };
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
    attachments?: MessageContentPart[];
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

export interface ProviderMetadata {
    name: string;
    capabilities: {
        tools: boolean;
        vision: boolean;
        streaming: boolean;
        reasoning?: boolean;
        coding?: boolean;
        localOnly?: boolean;
        privacy?: boolean;
        longContext?: boolean;
    };
    cost: 'low' | 'medium' | 'high';
    latency: 'low' | 'medium' | 'high';
}

export type ProviderStatus = 'healthy' | 'rate-limited' | 'error' | 'offline';

export interface ProviderHealth {
    status: ProviderStatus;
    failures: number;
    successes: number;
    cooldownUntil?: number;
}

export interface LLMProvider {
    getMetadata(): ProviderMetadata;

    generate(
        messages: Message[],
        options?: GenerationOptions,
        tools?: ToolSchema[]
    ): Promise<LLMResponse>;

    continueWithToolResults(
        continuationId: string,
        results: ToolResult[],
        messages: Message[],
        options?: GenerationOptions,
        tools?: ToolSchema[]
    ): Promise<LLMResponse>;
}