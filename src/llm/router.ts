import type {
    LLMProvider,
    Message,
    GenerationOptions,
    LLMResponse,
} from './types.js';

export class LLMRouter {
    constructor(private readonly provider: LLMProvider) { }

    async generate(
        messages: Message[],
        options?: GenerationOptions
    ): Promise<LLMResponse> {
        return this.provider.generate(messages, options);
    }
}