import type {
    GenerationOptions,
    LLMProvider,
    Message,
    ToolResult,
} from './types.js';

import type { ToolSchema } from '../tools/schema.js';

export class LLMRouter {
    constructor(private readonly provider: LLMProvider) { }

    async generate(
        messages: Message[],
        options?: GenerationOptions,
        tools?: ToolSchema[]
    ) {
        return this.provider.generate(
            messages,
            options,
            tools
        );
    }

    async continueWithToolResults(
        continuationId: string,
        results: ToolResult[],
        tools?: ToolSchema[]
    ) {
        return this.provider.continueWithToolResults(
            continuationId,
            results,
            tools
        );
    }
}