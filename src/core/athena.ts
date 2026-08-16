import { LLMRouter } from '../llm/router.js';
import type { Message } from '../llm/types.js';
import { ATHENA_SYSTEM_PROMPT } from '../personality/athena.js';

export class AthenaCore {
    private readonly router: LLMRouter;
    private readonly history: Message[];

    constructor(router: LLMRouter) {
        this.router = router;

        this.history = [
            {
                role: 'system',
                content: ATHENA_SYSTEM_PROMPT,
            },
        ];
    }

    async chat(userInput: string): Promise<string> {
        const message: Message = {
            role: 'user',
            content: userInput,
        };

        this.history.push(message);

        try {
            const response = await this.router.generate(this.history, {
                temperature: 0.7,
            });

            this.history.push({
                role: 'model',
                content: response.text,
            });

            return response.text;
        } catch (error) {
            // Remove the user message if the request failed.
            this.history.pop();

            console.error('[ATHENA] LLM request failed:', error);

            return 'I apologize, sir. I encountered an error communicating with the model provider.';
        }
    }

    getConversationHistory(): readonly Message[] {
        return this.history;
    }

    clearHistory(): void {
        this.history.length = 0;

        this.history.push({
            role: 'system',
            content: ATHENA_SYSTEM_PROMPT,
        });
    }

    getHistoryLength(): number {
        return this.history.length;
    }
}