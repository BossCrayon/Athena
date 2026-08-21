import { GoogleGenAI, Type, Schema } from '@google/genai';
import { ToolRegistry } from '../tools/registry.js';
import { ToolOrchestrator } from '../tools/orchestrator.js';
import type { ToolContext } from '../tools/types.js';
import { ATHENA_SYSTEM_PROMPT } from '../personality/athena.js';

export interface LiveSessionCallbacks {
    onAudio: (chunk: Buffer) => void;
    onText: (text: string) => void;
    onToolCall: (name: string) => void;
    onInterrupted: () => void;
    onConnected: () => void;
    onError: (err: any) => void;
    onClosed: () => void;
}

export class LiveSessionManager {
    private ai: GoogleGenAI;
    private session: any = null;
    private toolRegistry: ToolRegistry;
    private toolOrchestrator: ToolOrchestrator;
    private toolContext: ToolContext;
    private callbacks: LiveSessionCallbacks;

    constructor(
        toolRegistry: ToolRegistry,
        toolOrchestrator: ToolOrchestrator,
        toolContext: ToolContext,
        callbacks: LiveSessionCallbacks
    ) {
        this.toolRegistry = toolRegistry;
        this.toolOrchestrator = toolOrchestrator;
        this.toolContext = toolContext;
        this.callbacks = callbacks;
        this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
    }

    private convertToolsToGeminiFormat() {
        const schemas = this.toolRegistry.getSchemas();
        const functionDeclarations = schemas.map(schema => {
            const properties: Record<string, Schema> = {};
            const required: string[] = [];

            for (const param of schema.parameters) {
                let pType = Type.STRING;
                if (param.type === 'number') pType = Type.NUMBER;
                else if (param.type === 'boolean') pType = Type.BOOLEAN;
                else if (param.type === 'object') pType = Type.OBJECT;
                
                properties[param.name] = {
                    type: pType,
                    description: param.description
                };
                if (param.required) {
                    required.push(param.name);
                }
            }

            return {
                name: schema.name,
                description: schema.description,
                parameters: {
                    type: Type.OBJECT,
                    properties,
                    required: required.length > 0 ? required : undefined
                }
            };
        });
        
        return [{ functionDeclarations }];
    }

    async connect() {
        try {
            this.session = await this.ai.live.connect({
                model: 'gemini-3.1-flash-live-preview',
                config: {
                    responseModalities: ['AUDIO'] as any,
                    systemInstruction: { parts: [{ text: ATHENA_SYSTEM_PROMPT }] },
                    tools: this.convertToolsToGeminiFormat(),
                },
                callbacks: {
                    onopen: () => {
                        console.log('[Live] Connected to Gemini Live API');
                        this.callbacks.onConnected();
                    },
                    onmessage: async (response: any) => {
                        const content = response.serverContent;
                        if (!content) return;
                        
                        // Handle audio and text
                        if (content.modelTurn?.parts) {
                            for (const part of content.modelTurn.parts) {
                                if (part.inlineData) {
                                    const buf = Buffer.from(part.inlineData.data, 'base64');
                                    this.callbacks.onAudio(buf);
                                }
                                if (part.functionCall) {
                                    await this.handleToolCall(part.functionCall);
                                }
                            }
                        }
                        
                        // Transcriptions
                        if (content.inputTranscription) {
                            this.callbacks.onText(`[User]: ${content.inputTranscription.text}`);
                        }
                        if (content.outputTranscription) {
                            this.callbacks.onText(`[Athena]: ${content.outputTranscription.text}`);
                        }
                        
                        if (content.interrupted) {
                            this.callbacks.onInterrupted();
                        }
                    },
                    onerror: (error: any) => {
                        console.error('[Live] Error:', error);
                        this.callbacks.onError(error);
                    },
                    onclose: () => {
                        console.log('[Live] Closed');
                        this.callbacks.onClosed();
                        this.session = null;
                    }
                }
            });
        } catch (err) {
            console.error('[Live] Connection failed:', err);
            this.callbacks.onError(err);
        }
    }

    private async handleToolCall(functionCall: any) {
        this.callbacks.onToolCall(functionCall.name);
        
        try {
            const args = functionCall.args || {};
            const result = await this.toolOrchestrator.handle(
                { toolName: functionCall.name, arguments: args },
                this.toolContext
            );
            
            if (this.session) {
                // Send synchronous tool response. The Live API format uses clientContent or toolResponse
                const responsePayload = {
                    toolResponse: {
                        functionResponses: [{
                            name: functionCall.name,
                            id: functionCall.id,
                            response: { result: JSON.stringify(result).substring(0, 5000) }
                        }]
                    }
                };
                
                // Fallback approaches in case of SDK differences
                if (typeof this.session.sendToolResponse === 'function') {
                    this.session.sendToolResponse(responsePayload.toolResponse);
                } else if (typeof this.session.send === 'function') {
                    this.session.send(responsePayload);
                } else {
                    console.error('[Live] Failed to send tool response: No send method found');
                }
            }
        } catch (e: any) {
            console.error('[Live] Tool execution failed:', e);
            if (this.session) {
                const responsePayload = {
                    toolResponse: {
                        functionResponses: [{
                            name: functionCall.name,
                            id: functionCall.id,
                            response: { error: e.message }
                        }]
                    }
                };
                if (typeof this.session.sendToolResponse === 'function') {
                    this.session.sendToolResponse(responsePayload.toolResponse);
                } else if (typeof this.session.send === 'function') {
                    this.session.send(responsePayload);
                }
            }
        }
    }

    sendAudioChunk(chunk: Buffer) {
        if (!this.session) return;
        
        const payload = {
            audio: { data: chunk.toString('base64'), mimeType: 'audio/pcm;rate=16000' }
        };
        
        if (typeof this.session.sendRealtimeInput === 'function') {
            this.session.sendRealtimeInput([payload]);
        } else if (typeof this.session.send === 'function') {
            this.session.send({ realtimeInput: payload });
        }
    }

    sendText(text: string) {
        if (!this.session) return;
        
        if (typeof this.session.sendRealtimeInput === 'function') {
            this.session.sendRealtimeInput([{ text }]);
        } else if (typeof this.session.send === 'function') {
            this.session.send({ realtimeInput: { text } });
        }
    }

    disconnect() {
        if (this.session) {
            if (typeof this.session.close === 'function') {
                this.session.close();
            } else if (typeof this.session.disconnect === 'function') {
                this.session.disconnect();
            }
            this.session = null;
        }
    }
}
