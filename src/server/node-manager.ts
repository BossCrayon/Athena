import WebSocket from 'ws';
import { randomUUID } from 'crypto';

export interface ConnectedNode {
    id: string;
    ws: WebSocket;
    name: string;
}

export class NodeManager {
    private nodes = new Map<string, ConnectedNode>();
    private pendingToolCalls = new Map<string, { resolve: (res: any) => void; reject: (err: any) => void }>();

    registerNode(ws: WebSocket, id: string, name: string) {
        this.nodes.set(id, { id, ws, name });
        console.log(`[NodeManager] Registered node: ${name} (${id})`);
        
        ws.on('close', () => {
            this.nodes.delete(id);
            console.log(`[NodeManager] Node disconnected: ${name} (${id})`);
        });

        ws.on('message', (message: string) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'tool_result') {
                    const pending = this.pendingToolCalls.get(data.callId);
                    if (pending) {
                        pending.resolve(data.result);
                        this.pendingToolCalls.delete(data.callId);
                    }
                }
            } catch (err) {
                console.error('[NodeManager] Failed to parse node message:', err);
            }
        });
    }

    async executeToolOnNode(toolName: string, args: Record<string, unknown>): Promise<any> {
        const node = Array.from(this.nodes.values())[0]; // Simplification: pick first available node
        if (!node) {
            throw new Error('No device nodes currently connected to handle this tool execution.');
        }

        const callId = randomUUID();
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingToolCalls.delete(callId);
                reject(new Error(`Tool execution timed out for ${toolName}`));
            }, 60000);

            this.pendingToolCalls.set(callId, {
                resolve: (res) => {
                    clearTimeout(timeout);
                    resolve(res);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    reject(err);
                }
            });

            node.ws.send(JSON.stringify({
                type: 'execute_tool',
                callId,
                toolName,
                args
            }));
        });
    }
}
