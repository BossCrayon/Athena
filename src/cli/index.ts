import * as readline from 'node:readline';
import * as dotenv from 'dotenv';

import { AthenaCore } from '../core/athena.js';
import { LLMRouter } from '../llm/router.js';
import { GeminiProvider } from '../llm/providers/gemini.js';
import { handleCommand } from './commands.js';

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
    console.log("[System] Type '/help' for available commands.\n");

    const askQuestion = (): void => {
        rl.question('You: ', async (input: string) => {
            // Ignore empty input.
            if (!input.trim()) {
                askQuestion();
                return;
            }

            // Handle local CLI commands BEFORE contacting the LLM.
            const result = handleCommand(input, {
                getHistoryLength: () => athena.getHistoryLength(),
            });

            if (result.handled) {
                switch (result.action) {
                    case 'clear':
                        athena.clearHistory();

                        console.log(
                            '\nATHENA: Conversation context cleared, sir.\n'
                        );

                        askQuestion();
                        return;

                    case 'exit':
                        console.log(
                            '\nATHENA: Shutting down. Goodbye, sir.\n'
                        );

                        rl.close();
                        return;

                    default:
                        // Command was handled but requires no additional action.
                        askQuestion();
                        return;
                }
            }

            // Normal messages reach ATHENA and therefore the LLM.
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