import { GoogleGenAI } from '@google/genai';

import type {
    LLMProvider,
    Message,
    GenerationOptions,
    LLMResponse,
} from '../types.js';

export class GeminiProvider implements LLMProvider {
    private readonly ai: GoogleGenAI;
    private readonly model: string;

    constructor(modelName: string = 'gemini-3.7-flash') {
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not set.');
        }

        this.ai = new GoogleGenAI({
            apiKey,
        });

        this.model = modelName;
    }

    async generate(
        messages: Message[],
        _options?: GenerationOptions
    ): Promise<LLMResponse> {
        const systemMessage = messages.find(
            (message) => message.role === 'system'
        );

        const conversation = messages.filter(
            (message) => message.role !== 'system'
        );

        const conversationText = conversation
            .map((message) => {
                const speaker =
                    message.role === 'user' ? 'USER' : 'ATHENA';

                return `${speaker}: ${message.content}`;
            })
            .join('\n\n');

        const interaction = await this.ai.interactions.create({
            model: this.model,

            system_instruction: systemMessage?.content,

            input: conversationText,
        });

        return {
            text: interaction.output_text ?? '',
        };
    }
}