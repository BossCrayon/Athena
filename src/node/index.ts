import WebSocket from 'ws';
import * as dotenv from 'dotenv';
dotenv.config();
import * as os from 'node:os';
import { ToolRegistry } from '../tools/registry.js';
import { ToolExecutor } from '../tools/executor.js';
import { PermissionManager } from '../tools/permission.js';

// Import all tools
import { systemInfoTool } from '../tools/system-info.js';
import { currentTimeTool } from '../tools/current-time.js';
import { webSearchTool } from '../tools/web-search.js';
import { fetchUrlTool } from '../tools/fetch-url.js';
import { getWeatherTool } from '../tools/get-weather.js';
import { listDirectoryTool } from '../tools/list-directory.js';
import { readFileTool } from '../tools/read-file.js';
import { searchFilesTool } from '../tools/search-files.js';
import { runCommandTool } from '../tools/run-command.js';
import { locateItemTool } from '../tools/locate-item.js';
import { systemControlTool } from '../tools/system-control.js';

const SERVER_URL = process.env.ATHENA_SERVER_URL || 'ws://localhost:3000/nodes';
const NODE_NAME = os.hostname();
const NODE_ID = 'node-' + NODE_NAME.toLowerCase();

async function startNode() {
    console.log(`[Node] Starting Athena Node daemon for ${NODE_NAME}...`);
    
    // Setup local tools
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(systemInfoTool);
    toolRegistry.register(currentTimeTool);
    toolRegistry.register(webSearchTool);
    toolRegistry.register(fetchUrlTool);
    toolRegistry.register(getWeatherTool);
    toolRegistry.register(listDirectoryTool);
    toolRegistry.register(readFileTool);
    toolRegistry.register(searchFilesTool);
    toolRegistry.register(runCommandTool);
    toolRegistry.register(locateItemTool);
    toolRegistry.register(systemControlTool);

    const permissions = new PermissionManager();
    const executor = new ToolExecutor(toolRegistry, permissions); // No NodeManager passed, so it runs locally!

    let ws = new WebSocket(SERVER_URL);

    ws.on('open', () => {
        console.log(`[Node] Connected to Cloud Brain at ${SERVER_URL}`);
        ws.send(JSON.stringify({
            type: 'node_register',
            id: NODE_ID,
            name: NODE_NAME
        }));
    });

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());
            if (message.type === 'execute_tool') {
                const { callId, toolName, args } = message;
                console.log(`[Node] Executing tool request: ${toolName}`);
                
                try {
                    const result = await executor.execute(toolName, args, { 
                        cwd: process.cwd(),
                        askPermission: async () => true // Auto-allow for now, assuming the Brain already confirmed intent.
                    });
                    ws.send(JSON.stringify({
                        type: 'tool_result',
                        callId,
                        result
                    }));
                } catch (err: any) {
                    ws.send(JSON.stringify({
                        type: 'tool_result',
                        callId,
                        result: { success: false, output: '', error: err.message }
                    }));
                }
            }
        } catch (err) {
            console.error('[Node] Error processing message:', err);
        }
    });

    ws.on('close', () => {
        console.log('[Node] Disconnected from Cloud Brain. Reconnecting in 5 seconds...');
        setTimeout(startNode, 5000);
    });

    ws.on('error', (err: any) => {
        if (err.code === 'ECONNREFUSED') {
            console.error('[Node] Connection refused. Is the Cloud Brain running?');
        } else {
            console.error('[Node] WebSocket error:', err.message);
        }
    });
}

startNode();
