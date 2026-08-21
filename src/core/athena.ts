import { LLMRouter } from '../llm/router.js';

import type {
    Message,
    MessageContentPart
} from '../llm/types.js';

import { ATHENA_SYSTEM_PROMPT } from '../personality/athena.js';

import { ToolRegistry } from '../tools/registry.js';
import { ToolOrchestrator } from '../tools/orchestrator.js';

import type { ToolContext } from '../tools/types.js';

import { CloudMemoryManager } from './memory.js';
import { TaskEngine } from './task-engine.js';
import { Planner } from './planner.js';
import type { ContextBuilder } from './context-builder.js';
import type { TaskStore } from './task-store.js';
import type { EventBus } from './events.js';
import { LiveSessionManager, type LiveSessionCallbacks } from './live.js';

export class AthenaCore {
    private readonly router: LLMRouter;
    private history: Message[];

    private readonly toolRegistry: ToolRegistry;
    private readonly toolOrchestrator: ToolOrchestrator;
    private readonly toolContext: ToolContext;
    private readonly memoryManager: CloudMemoryManager;
    private readonly contextBuilder: ContextBuilder;
    private readonly taskStore?: TaskStore;
    private readonly eventBus?: EventBus;
    private readonly taskEngine: TaskEngine;
    private activeControllers: Set<AbortController>;
    private liveSession: LiveSessionManager | null = null;

    constructor(
        router: LLMRouter,
        toolRegistry: ToolRegistry,
        toolOrchestrator: ToolOrchestrator,
        toolContext: ToolContext,
        memoryManager: CloudMemoryManager,
        contextBuilder: ContextBuilder,
        taskStore?: TaskStore,
        eventBus?: EventBus,
        fastRouter?: LLMRouter
    ) {
        this.router = router;
        this.toolRegistry = toolRegistry;
        this.toolOrchestrator = toolOrchestrator;
        this.toolContext = toolContext;
        this.memoryManager = memoryManager;
        this.contextBuilder = contextBuilder;
        this.taskStore = taskStore;
        this.eventBus = eventBus;
        const planner = new Planner(router, contextBuilder, taskStore, fastRouter);
        this.taskEngine = new TaskEngine(router, toolRegistry, toolOrchestrator, toolContext, planner, taskStore, eventBus);

        this.history = [];
        this.activeControllers = new Set();
    }

    async initialize() {
        const savedHistory = await this.memoryManager.loadHistory();
        
        // Filter out any old system prompts to avoid duplicates
        this.history = savedHistory.filter(m => m.role !== 'system');
        
        // ALWAYS prepend the latest system prompt to the beginning of her working memory
        this.history.unshift({
            role: 'system',
            content: ATHENA_SYSTEM_PROMPT,
        });
    }

    async chat(userInput: string, attachments?: MessageContentPart[], onToken?: (text: string) => void, onToolCall?: (toolName: string) => void, role: string = 'admin'): Promise<string> {
        const controller = new AbortController();
        this.activeControllers.add(controller);

        const userMsg: Message = {
            role: 'user',
            content: attachments && attachments.length > 0 ? [{ type: 'text', text: userInput }, ...attachments] : userInput,
        };
        this.history.push(userMsg);
        await this.memoryManager.syncMessage(userMsg);

        const executionHistory = [...this.history];


        try {
            const finalResponseText = await this.taskEngine.executeInteractive(userInput, executionHistory, onToken, onToolCall, role);
            
            const modelMsg: Message = {
                role: 'model',
                content: finalResponseText,
            };
            this.history.push(modelMsg);
            await this.memoryManager.syncMessage(modelMsg);

            return finalResponseText;
        } catch (error: any) {
            if (error.name === 'AbortError') {
                const abortMsg: Message = { role: 'model', content: '\n*[Task aborted by user]*' };
                this.history.push(abortMsg);
                await this.memoryManager.syncMessage(abortMsg);
                return abortMsg.content as string;
            }
            this.history.pop();

            console.error(
                '[ATHENA] Task Engine failed:',
                error
            );

            return '[Error processing request: ' + error + ']';
        } finally {
            this.activeControllers.delete(controller);
        }
    }

    stop() {
        for (const controller of this.activeControllers) {
            controller.abort();
        }
        this.activeControllers.clear();
    }

    getTaskEngine(): TaskEngine {
        return this.taskEngine;
    }

    getConversationHistory(): readonly Message[] {
        return this.history;
    }

    clearConversation(): void {
        this.history.length = 1;
    }

    clearHistory(): void {
        this.history.length = 0;

        this.history.push({
            role: 'system',
            content: ATHENA_SYSTEM_PROMPT,
        });
    }

    getHistoryLength(): number {
        return this.history.length;
    }

    startLiveSession(callbacks: LiveSessionCallbacks): LiveSessionManager {
        if (this.liveSession) {
            this.liveSession.disconnect();
        }
        
        this.liveSession = new LiveSessionManager(
            this.toolRegistry,
            this.toolOrchestrator,
            this.toolContext,
            callbacks
        );
        
        return this.liveSession;
    }
}