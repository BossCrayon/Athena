export type CommandResult =
    | { handled: true; action?: 'exit' | 'clear' }
    | { handled: false };

export interface CommandContext {
    getHistoryLength: () => number;
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

  /help       Show this help message
  /clear      Clear the current conversation
  /status     Show ATHENA system status
  /history    Show conversation information
  /exit       Shut down ATHENA
`);
            return { handled: true };

        case '/clear':
            return {
                handled: true,
                action: 'clear',
            };

        case '/status':
            console.log(`
ATHENA Status
  Core:       Online
  Interface:  Terminal
  Mode:       Conversational
  Memory:     Session only
`);
            return { handled: true };

        case '/history':
            console.log(
                `\nATHENA: Current conversation contains ${context.getHistoryLength()} messages.\n`
            );
            return { handled: true };

        case '/exit':
            return {
                handled: true,
                action: 'exit',
            };

        default:
            return { handled: false };
    }
}