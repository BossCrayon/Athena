import WebSocket from 'ws';
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

export interface AthenaDesktopNodeOptions {
    serverUrl?: string;
    token: string;
    nodeName?: string;
    onAskPermission?: (toolName: string, args: any) => Promise<boolean>;
    onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => void;
}

export class AthenaDesktopNode {
    private ws: WebSocket | null = null;
    private serverUrl: string;
    private token: string;
    private nodeName: string;
    private nodeId: string;
    
    private reconnectDelay = 1000;
    private readonly MAX_RECONNECT_DELAY = 30000;
    private isShuttingDown = false;
    
    private toolRegistry: ToolRegistry;
    private permissions: PermissionManager;
    private executor: ToolExecutor;
    private onAskPermission: (toolName: string, args: any) => Promise<boolean>;
    private onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => void;
    
    private activeToolCalls = new Map<string, AbortController>();

    private readonly capabilities = [
        'system_info', 'current_time', 'web_search', 'fetch_url', 'get_weather',
        'list_directory', 'read_file', 'search_files', 'run_command', 'locate_item', 'system_control',
        'capture_screenshot'
    ];

    constructor(options: AthenaDesktopNodeOptions) {
        this.serverUrl = options.serverUrl || 'ws://localhost:3000/nodes';
        this.token = options.token;
        this.nodeName = options.nodeName || os.hostname();
        this.nodeId = 'node-' + this.nodeName.toLowerCase();
        
        // Provide a default permissive callback for CLI, but allow Electron to intercept
        this.onAskPermission = options.onAskPermission || (async () => true);
        this.onStatusChange = options.onStatusChange;

        this.toolRegistry = new ToolRegistry();
        this.toolRegistry.register(systemInfoTool);
        this.toolRegistry.register(currentTimeTool);
        this.toolRegistry.register(webSearchTool);
        this.toolRegistry.register(fetchUrlTool);
        this.toolRegistry.register(getWeatherTool);
        this.toolRegistry.register(listDirectoryTool);
        this.toolRegistry.register(readFileTool);
        this.toolRegistry.register(searchFilesTool);
        this.toolRegistry.register(runCommandTool);
        this.toolRegistry.register(locateItemTool);
        this.toolRegistry.register(systemControlTool);
        this.toolRegistry.register(captureScreenshotTool);

        this.permissions = new PermissionManager();
        this.executor = new ToolExecutor(this.toolRegistry, this.permissions);
    }

    public start() {
        if (this.isShuttingDown) return;
        
        console.log(`[Node] Starting Athena Desktop Node daemon for ${this.nodeName}...`);
        this.onStatusChange?.('connecting');
        
        this.ws = new WebSocket(this.serverUrl);

        this.ws.on('open', () => {
            console.log(`[Node] Connected to Cloud Brain at ${this.serverUrl}`);
            this.onStatusChange?.('connected');
            this.reconnectDelay = 1000;
            this.ws?.send(JSON.stringify({
                type: 'node_register',
                id: this.nodeId,
                name: this.nodeName,
                token: this.token,
                capabilities: this.capabilities
            }));
        });

        this.ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === 'ping') {
                    this.ws?.send(JSON.stringify({ type: 'pong' }));
                } else if (message.type === 'execute_tool') {
                    const { callId, toolName, args } = message;
                    console.log(`[Node] Executing tool request: ${toolName}`);
                    
                    const controller = new AbortController();
                    this.activeToolCalls.set(callId, controller);

                    try {
                        const result = await this.executor.execute(toolName, args, { 
                            cwd: process.cwd(),
                            askPermission: this.onAskPermission,
                            signal: controller.signal
                        });
                        this.ws?.send(JSON.stringify({
                            type: 'tool_result',
                            callId,
                            result
                        }));
                    } catch (err: any) {
                        this.ws?.send(JSON.stringify({
                            type: 'tool_result',
                            callId,
                            result: { success: false, output: '', error: err.name === 'AbortError' ? 'Tool execution was cancelled.' : err.message }
                        }));
                    } finally {
                        this.activeToolCalls.delete(callId);
                    }
                } else if (message.type === 'cancel_tool') {
                    const { callId } = message;
                    if (this.activeToolCalls.has(callId)) {
                        console.log(`[Node] Cancelling tool execution: ${callId}`);
                        this.activeToolCalls.get(callId)?.abort();
                    }
                } else if (message.type === 'error') {
                    console.error(`[Node] Server Error: ${message.message}`);
                }
            } catch (err) {
                console.error('[Node] Error processing message:', err);
            }
        });

        this.ws.on('close', (code, reason) => {
            if (this.isShuttingDown) return;
            console.log(`[Node] Disconnected from Cloud Brain (Code: ${code}, Reason: ${reason}).`);
            this.onStatusChange?.('disconnected', reason.toString());
            console.log(`[Node] Reconnecting in ${this.reconnectDelay / 1000} seconds...`);
            setTimeout(() => this.start(), this.reconnectDelay);
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.MAX_RECONNECT_DELAY);
        });

        this.ws.on('error', (err: any) => {
            if (this.isShuttingDown) return;
            if (err.code === 'ECONNREFUSED') {
                console.error('[Node] Connection refused. Is the Cloud Brain running?');
                this.onStatusChange?.('error', 'Connection refused');
            } else {
                console.error('[Node] WebSocket error:', err.message);
                this.onStatusChange?.('error', err.message);
            }
        });
    }

    public stop() {
        this.isShuttingDown = true;
        if (this.ws) {
            console.log(`[Node] Gracefully shutting down node connection...`);
            this.ws.close();
            this.ws = null;
        }
    }
}
