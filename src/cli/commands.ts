import type { ToolRegistry } from '../tools/registry.js';

export type CommandResult =
    | {
        handled: true;
        action?: 'exit' | 'clear';
    }
    | {
        handled: true;
        action: 'tools';
    }
    | {
        handled: false;
    };

export interface CommandContext {
    getHistoryLength: () => number;
    toolRegistry: ToolRegistry;
}

export function handleCommand(
    input: string,
    context: CommandContext
): CommandResult {
    const command = input.trim().toLowerCase();

    switch (command) {
        case '/help':
            console.log(`
ATHENA Commands

  /help       Show available commands
  /clear      Clear conversation history
  /history    Show conversation history length
  /tools      Show registered tools
  /exit       Shut down ATHENA
`);
            return {
                handled: true,
            };

        case '/clear':
            return {
                handled: true,
                action: 'clear',
            };

        case '/history':
            console.log(
                `\nATHENA: Conversation contains ${context.getHistoryLength()} message(s).\n`
            );

            return {
                handled: true,
            };

        case '/tools': {
            const tools = context.toolRegistry.list();

            console.log('\nATHENA Tools\n');

            if (tools.length === 0) {
                console.log('  No tools are currently registered.\n');
                return {
                    handled: true,
                };
            }

            for (const tool of tools) {
                console.log(`  ${tool.definition.name}`);
                console.log(`    ${tool.definition.description}`);
                console.log(
                    `    Permission: ${tool.definition.permission}`
                );
                console.log();
            }

            return {
                handled: true,
            };
        }

        case '/exit':
        case 'exit':
            return {
                handled: true,
                action: 'exit',
            };

        default:
            return {
                handled: false,
            };
    }
}