import * as readline from 'node:readline';
import WebSocket from 'ws';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
import * as dotenv from 'dotenv';
dotenv.config();

const SERVER_URL = process.env.ATHENA_CLIENT_URL || 'ws://localhost:3000/chat';

async function main() {
    console.log(`[System] Connecting to ATHENA Server (${SERVER_URL})...`);

    const ws = new WebSocket(SERVER_URL);
    
    let isWaitingForResponse = false;
    let isFirstToken = false;

    ws.on('open', () => {
        console.log('[System] ATHENA is online and connected.');
        promptUser();
    });

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'token') {
                if (isFirstToken) {
                    isFirstToken = false;
                    readline.clearLine(process.stdout, 0);
                    readline.cursorTo(process.stdout, 0);
                    process.stdout.write('ATHENA: ' + message.text);
                } else {
                    process.stdout.write(message.text);
                }
            } else if (message.type === 'tool') {
                // Already says "Thinking...", we can just leave it.
            } else if (message.type === 'done') {
                console.log(); // New line after response
                isWaitingForResponse = false;
                promptUser();
            }
        } catch (err) {
            console.error('Failed to parse message from server:', err);
        }
    });

    ws.on('close', () => {
        console.log('\n[System] Disconnected from server. Make sure "npm run server" is running.');
        process.exit(0);
    });

    ws.on('error', (err: any) => {
        console.error('\n[System] Connection error. Make sure the server is running on port 3000.');
        if (err.code === 'ECONNREFUSED') {
            console.error('Run "npm run server" in another terminal first!');
        }
        process.exit(1);
    });

    function promptUser() {
        if (isWaitingForResponse) return;
        
        rl.question('\nYou: ', (input) => {
            const trimmed = input.trim();
            if (!trimmed) {
                promptUser();
                return;
            }

            if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
                ws.close();
                process.exit(0);
            }

            isWaitingForResponse = true;
            isFirstToken = true;
            process.stdout.write('\nATHENA: \x1b[90mThinking...\x1b[0m');
            
            ws.send(JSON.stringify({
                type: 'text',
                text: trimmed
            }));
        });
    }
}

main().catch(err => {
    console.error('[System] Fatal error:', err);
    process.exit(1);
});