import * as readline from 'node:readline';
import * as dotenv from 'dotenv';

import { AthenaCore } from '../core/athena.js';
import { LLMRouter } from '../llm/router.js';
import { GeminiProvider } from '../llm/providers/gemini.js';

import { OpenRouterProvider } from '../llm/providers/openrouter.js';
import { OllamaProvider } from '../llm/providers/ollama.js';

import { ToolRegistry } from '../tools/registry.js';
import { ToolExecutor } from '../tools/executor.js';
import { ToolOrchestrator } from '../tools/orchestrator.js';
import { PermissionManager } from '../tools/permission.js';

import { systemInfoTool } from '../tools/system-info.js';

import { handleCommand } from './commands.js';
import { currentTimeTool } from '../tools/current-time.js';

dotenv.config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

async function main(): Promise<void> {
    // Local LLMs are supported via Ollama without an API key, so we don't hard crash if keys are missing.
    if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
        console.warn(
            '\n[System] WARNING: No cloud API keys found. ATHENA will rely strictly on the local Ollama provider.'
        );
    }

    console.log('[System] Initializing ATHENA Core...');

    // --------------------------------------------------
    // LLM
    // --------------------------------------------------

    const router = new LLMRouter();
    const fallbackOrder: string[] = [];

    if (process.env.GEMINI_API_KEY) {
        const geminiProvider = new GeminiProvider();
        router.registerProvider('gemini', geminiProvider);
        router.setDefaultProvider('gemini');
        fallbackOrder.push('gemini');
    }

    if (process.env.OPENROUTER_API_KEY) {
        const openrouterProvider = new OpenRouterProvider();
        router.registerProvider('openrouter', openrouterProvider);
        if (!process.env.GEMINI_API_KEY) {
            router.setDefaultProvider('openrouter');
        }
        fallbackOrder.push('openrouter');
    }

    // Always register Ollama as it is a local provider (assumes localhost:11434)
    const ollamaProvider = new OllamaProvider();
    router.registerProvider('ollama', ollamaProvider);
    if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
        router.setDefaultProvider('ollama');
    }
    fallbackOrder.push('ollama');

    // Set fallback cascade
    router.setFallbackProviders(fallbackOrder);

    // --------------------------------------------------
    // Tools
    // --------------------------------------------------

    const toolRegistry = new ToolRegistry();

    toolRegistry.register(systemInfoTool);
    toolRegistry.register(currentTimeTool);
    const permissions = new PermissionManager();

    const executor = new ToolExecutor(
        toolRegistry,
        permissions
    );

    const toolOrchestrator = new ToolOrchestrator(
        toolRegistry,
        executor
    );

    // --------------------------------------------------
    // ATHENA
    // --------------------------------------------------

    const { CloudMemoryManager } = await import('../core/memory.js');
    const memoryManager = new CloudMemoryManager();

    const athena = new AthenaCore(
        router,
        toolRegistry,
        toolOrchestrator,
        {
            workingDirectory: process.cwd(),
        },
        memoryManager
    );

    await athena.initialize();

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
                toolRegistry,
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
            process.stdout.write('ATHENA: \x1b[3mthinking...\x1b[0m');

            let isFirstToken = true;

            try {
                await athena.chat(input, (text) => {
                    if (isFirstToken) {
                        readline.clearLine(process.stdout, 0);
                        readline.cursorTo(process.stdout, 0);
                        process.stdout.write('ATHENA: ');
                        isFirstToken = false;
                    }
                    process.stdout.write(text);
                });

                if (isFirstToken) {
                    readline.clearLine(process.stdout, 0);
                    readline.cursorTo(process.stdout, 0);
                    process.stdout.write('ATHENA: \n');
                } else {
                    console.log('\n');
                }
            } catch (error) {
                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);

                console.error(
                    '[System] Unexpected error:',
                    error
                );
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