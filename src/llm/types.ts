export type Role = 'user' | 'model' | 'system';

export interface Message {
    role: Role;
    content: string;
}

export interface GenerationOptions {
    temperature?: number;
    maxOutputTokens?: number;
}

export interface LLMResponse {
    text: string;
}

export interface LLMProvider {
    generate(
        messages: Message[],
        options?: GenerationOptions
    ): Promise<LLMResponse>;
}