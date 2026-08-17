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
import { captureScreenshotTool } from '../tools/capture_screenshot.js';

const SERVER_URL = process.env.ATHENA_SERVER_URL || 'ws://localhost:3000/nodes';
const NODE_NAME = os.hostname();
const NODE_ID = 'node-' + NODE_NAME.toLowerCase();

const NODE_AUTH_TOKEN = process.env.NODE_AUTH_TOKEN || '';
if (!NODE_AUTH_TOKEN) {
    console.error('[Node] Warning: NODE_AUTH_TOKEN is not set in .env! Connection will likely be rejected.');
}

let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;

const capabilities = [
    'system_info', 'current_time', 'web_search', 'fetch_url', 'get_weather',
    'list_directory', 'read_file', 'search_files', 'run_command', 'locate_item', 'system_control',
    'capture_screenshot'
];

async function startNode() {
    console.log(`[Node] Starting Athena Node daemon for ${NODE_NAME}...`);
    
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
    toolRegistry.register(captureScreenshotTool);

    const permissions = new PermissionManager();
    const executor = new ToolExecutor(toolRegistry, permissions);

    let ws = new WebSocket(SERVER_URL);

    ws.on('open', () => {
        console.log(`[Node] Connected to Cloud Brain at ${SERVER_URL}`);
        reconnectDelay = 1000; // reset delay on successful connection
        ws.send(JSON.stringify({
            type: 'node_register',
            id: NODE_ID,
            name: NODE_NAME,
            token: NODE_AUTH_TOKEN,
            capabilities
        }));
    });

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());
            if (message.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
            } else if (message.type === 'execute_tool') {
                const { callId, toolName, args } = message;
                console.log(`[Node] Executing tool request: ${toolName}`);
                
                try {
                    const result = await executor.execute(toolName, args, { 
                        cwd: process.cwd(),
                        askPermission: async () => true
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
            } else if (message.type === 'error') {
                console.error(`[Node] Server Error: ${message.message}`);
            }
        } catch (err) {
            console.error('[Node] Error processing message:', err);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`[Node] Disconnected from Cloud Brain (Code: ${code}, Reason: ${reason}).`);
        console.log(`[Node] Reconnecting in ${reconnectDelay / 1000} seconds...`);
        setTimeout(startNode, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
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
