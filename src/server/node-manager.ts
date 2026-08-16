import WebSocket from 'ws';
import { randomUUID } from 'crypto';

export interface ConnectedNode {
    id: string;
    ws: WebSocket;
    name: string;
    type: string;
}

export class NodeManager {
    private nodes = new Map<string, ConnectedNode>();
    private pendingToolCalls = new Map<string, { resolve: (res: any) => void; reject: (err: any) => void }>();

    registerNode(ws: WebSocket, id: string, name: string, type: string = 'laptop') {
        this.nodes.set(id, { id, ws, name, type });
        console.log(`[NodeManager] Registered node: ${name} (${id}) [${type}]`);
        
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

    async executeToolOnNode(toolName: string, args: Record<string, unknown>, targetType: string = 'laptop'): Promise<any> {
        console.log(`[NodeManager] executeToolOnNode called for ${toolName} with targetType=${targetType}`);
        console.log(`[NodeManager] Currently registered nodes:`, Array.from(this.nodes.values()).map(n => `${n.name} (${n.type})`));
        const node = Array.from(this.nodes.values()).find(n => n.type === targetType);
        if (!node) {
            throw new Error(`No connected nodes of type '${targetType}' found to execute tool: ${toolName}. Please ensure the ${targetType} is connected.`);
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
