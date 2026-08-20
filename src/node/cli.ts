import * as dotenv from 'dotenv';
dotenv.config();

import { AthenaDesktopNode } from './desktop-node.js';

const SERVER_URL = process.env.ATHENA_SERVER_URL || 'ws://localhost:3000/nodes';
const NODE_AUTH_TOKEN = process.env.NODE_AUTH_TOKEN || '';

if (!NODE_AUTH_TOKEN) {
    console.error('[Node] Warning: NODE_AUTH_TOKEN is not set in .env! Connection will likely be rejected.');
}

const node = new AthenaDesktopNode({
    serverUrl: SERVER_URL,
    token: NODE_AUTH_TOKEN,
    onAskPermission: async (toolName, args) => {
        // CLI defaults to permissive execution since the human user is theoretically at the terminal.
        // If we want terminal prompt (`inquirer`), we can add it here.
        return true;
    }
});

node.start();

// Handle graceful exit
process.on('SIGINT', () => {
    console.log('\n[Node CLI] Shutting down node...');
    node.stop();
    process.exit(0);
});
