import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import type { EventBus } from '../core/events.js';

export class NodeDisconnectError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NodeDisconnectError';
    }
}

export interface ConnectedNode {
    nodeId: string;
    connectionId: string;
    ws: WebSocket;
    name: string;
    type: string;
    capabilities: string[];
    authenticated: boolean;
    connectedAt: number;
    lastSeenAt: number;
    status: 'online' | 'stale' | 'offline';
}

export interface PendingToolCall {
    resolve: (res: any) => void;
    reject: (err: any) => void;
    nodeId: string;
    taskId?: string;
    stepId?: string;
    executionKey?: string;
}

export class NodeManager {
    private nodes = new Map<string, ConnectedNode>();
    private pendingToolCalls = new Map<string, PendingToolCall>();
    
    private readonly HEARTBEAT_INTERVAL_MS = 30000;
    private readonly STALE_TIMEOUT_MS = 60000;
    private readonly OFFLINE_TIMEOUT_MS = 120000;
    private heartbeatTimer?: NodeJS.Timeout;

    constructor(private readonly authToken?: string, private readonly eventBus?: EventBus) {
        if (!this.authToken) {
            console.warn('[NodeManager] Warning: NODE_AUTH_TOKEN is not set. Node registration will fail.');
        }
        this.startHeartbeat();
    }

    public stopHeartbeat() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    }

    private startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            const now = Date.now();
            for (const [nodeId, node] of this.nodes.entries()) {
                const idleTime = now - node.lastSeenAt;
                
                if (idleTime > this.OFFLINE_TIMEOUT_MS) {
                    node.status = 'offline';
                    node.ws.terminate();
                    this.nodes.delete(nodeId);
                    this.rejectPendingCallsForNode(nodeId, 'Node went offline due to missed heartbeats.');
                    if (this.eventBus) {
                        this.eventBus.emit('telemetry', {
                            eventType: 'node_disconnected',
                            timestamp: new Date().toISOString(),
                            nodeId: nodeId,
                            nodeType: node.type,
                            errorCategory: 'node_timeout'
                        });
                    }
                } else if (idleTime > this.STALE_TIMEOUT_MS) {
                    if (node.status !== 'stale') {
                        node.status = 'stale';
                        if (this.eventBus) {
                            this.eventBus.emit('telemetry', {
                                eventType: 'node_stale',
                                timestamp: new Date().toISOString(),
                                nodeId: nodeId,
                                nodeType: node.type
                            });
                        }
                    }
                } else {
                    node.ws.send(JSON.stringify({ type: 'ping' }));
                }
            }
        }, this.HEARTBEAT_INTERVAL_MS);
    }

    private rejectPendingCallsForNode(nodeId: string, reason: string) {
        for (const [callId, pending] of this.pendingToolCalls.entries()) {
            if (pending.nodeId === nodeId) {
                pending.reject(new NodeDisconnectError(reason));
                this.pendingToolCalls.delete(callId);
            }
        }
    }

    registerNode(ws: WebSocket, id: string, name: string, type: string = 'laptop', providedToken?: string, capabilities: string[] = []) {
        // Temporarily allow mobile nodes (APK) to bypass auth since they were built before enforcement
        if (type !== 'mobile' && (!this.authToken || providedToken !== this.authToken)) {
            console.error(`[NodeManager] Rejected unauthenticated node: ${name} (${id})`);
            ws.send(JSON.stringify({ type: 'error', message: 'Authentication failed. Invalid or missing NODE_AUTH_TOKEN.' }), () => {
                ws.close(4001, 'Unauthorized');
            });
            return;
        }

        // Handle duplicate connections
        const existingNode = this.nodes.get(id);
        if (existingNode) {
            console.log(`[NodeManager] Duplicate connection detected for node: ${id}. Terminating old connection.`);
            this.rejectPendingCallsForNode(id, 'Node reconnected from a new socket.');
            existingNode.ws.terminate();
            this.nodes.delete(id);
        }

        const connectionId = randomUUID();
        const now = Date.now();

        const newNode: ConnectedNode = {
            nodeId: id,
            connectionId,
            ws,
            name,
            type,
            capabilities,
            authenticated: true,
            connectedAt: now,
            lastSeenAt: now,
            status: 'online'
        };

        this.nodes.set(id, newNode);
        if (this.eventBus) {
            this.eventBus.emit('telemetry', {
                eventType: 'node_authenticated',
                timestamp: new Date().toISOString(),
                nodeId: id,
                nodeType: type,
                metadata: { capabilities }
            });
        }
        
        ws.on('close', () => {
            const current = this.nodes.get(id);
            if (current && current.connectionId === connectionId) {
                current.status = 'offline';
                this.nodes.delete(id);
                this.rejectPendingCallsForNode(id, 'Node WebSocket disconnected.');
                if (this.eventBus) {
                    this.eventBus.emit('telemetry', {
                        eventType: 'node_disconnected',
                        timestamp: new Date().toISOString(),
                        nodeId: id,
                        nodeType: current.type
                    });
                }
            }
        });

        ws.on('message', (message: string) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'pong') {
                    const node = this.nodes.get(id);
                    if (node && node.connectionId === connectionId) {
                        node.lastSeenAt = Date.now();
                        if (node.status === 'stale') {
                            node.status = 'online';
                            if (this.eventBus) {
                                this.eventBus.emit('telemetry', {
                                    eventType: 'node_reconnected',
                                    timestamp: new Date().toISOString(),
                                    nodeId: id,
                                    nodeType: node.type
                                });
                            }
                        }
                    }
                } else if (data.type === 'tool_result') {
                    const pending = this.pendingToolCalls.get(data.callId);
                    // Match execution identity loosely via pending. If node restarts, it can't send a valid callId unless it saved it, but even so it's checked.
                    if (pending && pending.nodeId === id) {
                        pending.resolve(data.result);
                        this.pendingToolCalls.delete(data.callId);
                    } else if (pending) {
                        console.warn(`[NodeManager] Stale or mismatched tool_result for callId ${data.callId} from node ${id}. Ignored.`);
                    }
                }
            } catch (err) {
                console.error('[NodeManager] Failed to parse node message:', err);
            }
        });
    }

    async executeToolOnNode(toolName: string, args: Record<string, unknown>, targetType: string = 'laptop', signal?: AbortSignal, correlationContext?: { taskId: string, stepId: string, executionKey: string }): Promise<any> {
        console.log(`[NodeManager] executeToolOnNode called for ${toolName} with targetType=${targetType}`);
        
        // Find a node that is authenticated, online, matches the type, and advertises this capability
        const node = Array.from(this.nodes.values()).find(n => 
            n.type === targetType && 
            n.authenticated && 
            n.status !== 'offline' &&
            n.capabilities.includes(toolName)
        );
        
        if (!node) {
            throw new Error(`No connected and authenticated nodes of type '${targetType}' found supporting capability: ${toolName}.`);
        }

        const callId = randomUUID();
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingToolCalls.delete(callId);
                reject(new Error(`Tool execution timed out for ${toolName}`));
            }, 60000);

            const handleAbort = () => {
                clearTimeout(timeout);
                this.pendingToolCalls.delete(callId);
                // Send cancellation to the node with execution Key for strict correlation
                node.ws.send(JSON.stringify({ 
                    type: 'cancel_tool', 
                    callId,
                    taskId: correlationContext?.taskId,
                    stepId: correlationContext?.stepId,
                    executionKey: correlationContext?.executionKey
                }));
                reject(new Error('AbortError'));
            };

            if (signal) {
                if (signal.aborted) {
                    return handleAbort();
                }
                signal.addEventListener('abort', handleAbort);
            }

            this.pendingToolCalls.set(callId, {
                resolve: (res) => {
                    clearTimeout(timeout);
                    if (signal) signal.removeEventListener('abort', handleAbort);
                    resolve(res);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    if (signal) signal.removeEventListener('abort', handleAbort);
                    reject(err);
                },
                nodeId: node.nodeId,
                taskId: correlationContext?.taskId,
                stepId: correlationContext?.stepId,
                executionKey: correlationContext?.executionKey
            });

            node.ws.send(JSON.stringify({
                type: 'execute_tool',
                callId,
                toolName,
                args,
                taskId: correlationContext?.taskId,
                stepId: correlationContext?.stepId,
                executionKey: correlationContext?.executionKey
            }));
        });
    }
}
