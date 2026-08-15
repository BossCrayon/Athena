import * as readline from 'node:readline';
import * as dotenv from 'dotenv';

import { AthenaCore } from '../core/athena.js';
import { LLMRouter } from '../llm/router.js';
import { GeminiProvider } from '../llm/providers/gemini.js';

dotenv.config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

async function main(): Promise<void> {
    if (!process.env.GEMINI_API_KEY) {
        console.error(
            '\n[System] ERROR: GEMINI_API_KEY is missing from .env'
        );

        rl.close();
        process.exitCode = 1;
        return;
    }

    console.log('[System] Initializing ATHENA Core...');

    const provider = new GeminiProvider();
    const router = new LLMRouter(provider);
    const athena = new AthenaCore(router);

    console.log('[System] ATHENA is online.');
    console.log("[System] Type 'exit' to shut down.\n");

    const askQuestion = (): void => {
        rl.question('You: ', async (input: string) => {
            const command = input.trim().toLowerCase();

            if (command === 'exit') {
                console.log('\nATHENA: Shutting down. Goodbye, sir.');
                rl.close();
                return;
            }

            if (command === 'clear') {
                athena.clearConversation();

                console.log(
                    '\nATHENA: Conversation context cleared, sir.\n'
                );

                askQuestion();
                return;
            }

            if (!input.trim()) {
                askQuestion();
                return;
            }

            process.stdout.write('ATHENA: thinking...');

            try {
                const response = await athena.chat(input);

                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);

                console.log(`ATHENA: ${response}\n`);
            } catch (error) {
                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);

                console.error('[System] Unexpected error:', error);
            }

            askQuestion();
        });
    };

    askQuestion();
}

main().catch((error: unknown) => {
    console.error('[System] Fatal error:', error);
    rl.close();
    process.exitCode = 1;
});