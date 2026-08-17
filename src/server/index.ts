import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import * as dotenv from 'dotenv';
import { AthenaCore } from '../core/athena.js';
import { LLMRouter } from '../llm/router.js';
import { GeminiProvider } from '../llm/providers/gemini.js';
import { OpenRouterProvider } from '../llm/providers/openrouter.js';
import { OllamaProvider } from '../llm/providers/ollama.js';
import { GroqProvider } from '../llm/providers/groq.js';
import { ToolRegistry } from '../tools/registry.js';
import { ToolExecutor } from '../tools/executor.js';
import { ToolOrchestrator } from '../tools/orchestrator.js';
import { PermissionManager } from '../tools/permission.js';
import { CloudMemoryManager } from '../core/memory.js';
import { NodeManager } from './node-manager.js';

// Tools
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
import { saveMemoryTool } from '../tools/save-memory.js';
import { searchMemoryTool } from '../tools/search-memory.js';
import { getBatteryLevelTool } from '../tools/get-battery.js';
import { vibratePhoneTool } from '../tools/vibrate-phone.js';
import { getLocationTool } from '../tools/get-location.js';

dotenv.config();

const fastify = Fastify({ logger: true, pluginTimeout: 60000 });
fastify.register(cors, { origin: true });
fastify.register(websocket);

import { EventBus } from '../core/events.js';
import { TaskQueue } from '../core/task-queue.js';
import { Scheduler } from '../core/scheduler.js';
import { AutonomousRuntime } from '../core/autonomous-runtime.js';
import { ContextBuilder } from '../core/context-builder.js';
import { MemoryExtractor } from '../core/memory-extractor.js';
import { TaskStore } from '../core/task-store.js';
import { TelemetryTracker } from '../core/telemetry.js';
import { DiagnosticHandler } from '../core/diagnostics.js';
import { SemanticRouter } from '../core/semantic-router.js';

// Initialize ATHENA backend
async function setupAthena(nodeManager: NodeManager, eventBus: EventBus) {
    // Eagerly initialize Semantic Router
    SemanticRouter.getInstance().init().catch(err => {
        console.error('[SemanticRouter] Failed to initialize:', err);
    });

    const router = new LLMRouter(eventBus);
    const fallbackOrder: string[] = [];

    if (process.env.GEMINI_API_KEY) {
        // Lite models (These are the only ones with active API quota)
        router.registerProvider('gemini-3.5-flash-lite', new GeminiProvider('gemini-3.5-flash-lite'));
        router.registerProvider('gemini-3.1-flash-lite', new GeminiProvider('gemini-3.1-flash-lite'));
        
        fallbackOrder.push(
            'gemini-3.1-flash-lite',
            'gemini-3.5-flash-lite'
        );
    }
    if (process.env.OPENROUTER_API_KEY) {
        router.registerProvider('openrouter', new OpenRouterProvider());
        if (!process.env.GEMINI_API_KEY) router.setDefaultProvider('openrouter');
        fallbackOrder.push('openrouter');
    }
    if (process.env.GROQ_API_KEY) {
        router.registerProvider('groq', new GroqProvider());
        router.setDefaultProvider('groq');
        fallbackOrder.unshift('groq');
    } else if (process.env.GEMINI_API_KEY) {
        router.setDefaultProvider('gemini-3.1-flash-lite');
    }
    router.registerProvider('ollama', new OllamaProvider());
    if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY && !process.env.GROQ_API_KEY) router.setDefaultProvider('ollama');
    fallbackOrder.push('ollama');
    router.setFallbackProviders(fallbackOrder);
    
    // Fast router: lightweight model used exclusively for Planner JSON generation
    // and simple conversational fast-path routing. Much lower latency.
    let fastRouter: LLMRouter | undefined = new LLMRouter(eventBus);
    const fastFallbackOrder: string[] = [];
    
    if (process.env.GEMINI_API_KEY) {
        fastRouter.registerProvider('gemini-3.1-flash-lite', new GeminiProvider('gemini-3.1-flash-lite'));
        fastFallbackOrder.push('gemini-3.1-flash-lite');
    }
    
    if (process.env.GROQ_API_KEY) {
        fastRouter.registerProvider('groq', new GroqProvider('openai/gpt-oss-20b'));
        fastRouter.setDefaultProvider('groq');
        fastFallbackOrder.unshift('groq'); // Prioritize groq
    } else if (process.env.GEMINI_API_KEY) {
        fastRouter.setDefaultProvider('gemini-3.1-flash-lite');
    }
    
    fastRouter.registerProvider('ollama', new OllamaProvider());
    if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
        fastRouter.setDefaultProvider('ollama');
    }
    fastFallbackOrder.push('ollama');
    
    fastRouter.setFallbackProviders(fastFallbackOrder);

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
    toolRegistry.register(saveMemoryTool);
    toolRegistry.register(searchMemoryTool);
    toolRegistry.register(getBatteryLevelTool);
    toolRegistry.register(vibratePhoneTool);
    toolRegistry.register(getLocationTool);


    const permissions = new PermissionManager();
    const executor = new ToolExecutor(toolRegistry, permissions, nodeManager);
    const toolOrchestrator = new ToolOrchestrator(toolRegistry, executor);
    const memoryManager = new CloudMemoryManager();
    const contextBuilder = new ContextBuilder(memoryManager);
    const memoryExtractor = new MemoryExtractor(router, memoryManager);
    const taskStore = new TaskStore();

    const athena = new AthenaCore(
        router,
        toolRegistry,
        toolOrchestrator,
        {
            cwd: process.cwd(),
            askPermission: async () => true
        },
        memoryManager,
        contextBuilder,
        taskStore,
        eventBus,
        fastRouter
    );

    await athena.initialize();

    const taskQueue = new TaskQueue(taskStore);
    const scheduler = new Scheduler(taskQueue, taskStore);
    const autonomousRuntime = new AutonomousRuntime(
        taskQueue, 
        athena.getTaskEngine(), 
        eventBus, 
        contextBuilder, 
        memoryExtractor, 
        memoryManager,
        taskStore
    );

    // Phase I: Persisted recovery
    await scheduler.loadPersisted();
    await autonomousRuntime.recover();

    return { athena, eventBus, taskQueue, scheduler, autonomousRuntime, router };
}

fastify.register(async function (app) {
    const eventBus = new EventBus();
    const telemetryTracker = new TelemetryTracker(eventBus);

    const nodeManager = new NodeManager(process.env.NODE_AUTH_TOKEN, eventBus);
    const { athena, scheduler, autonomousRuntime, taskQueue, router } = await setupAthena(nodeManager, eventBus);
    const diagnostics = new DiagnosticHandler(autonomousRuntime, taskQueue, router, nodeManager);

    // Start background services
    scheduler.start();
    autonomousRuntime.start();

    let isShuttingDown = false;

    // Ensure graceful shutdown
    app.addHook('onClose', async (instance) => {
        if (!isShuttingDown) {
            isShuttingDown = true;
            scheduler.stop();
            await autonomousRuntime.shutdownGracefully(30000); // Wait up to 30s
        }
    });
    
    // Process signal handlers
    const handleShutdown = async (signal: string) => {
        console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);
        if (isShuttingDown) return;
        isShuttingDown = true;
        
        scheduler.stop();
        await autonomousRuntime.shutdownGracefully(30000);
        
        console.log('[Server] Closing Fastify server...');
        await app.close();
        console.log('[Server] Fastify server closed. Exiting process.');
        process.exit(0);
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));

    // Render Health Endpoint (Liveness)
    app.get('/health', async (req, res) => {
        if (isShuttingDown || autonomousRuntime.isShuttingDown()) {
            return res.status(503).send({ status: 'shutting_down' });
        }
        return res.send({
            status: 'ok',
            workerId: autonomousRuntime.workerName,
            runtime: autonomousRuntime.getIsRunning() ? 'running' : 'stopped',
            activeTasks: autonomousRuntime.getActiveTaskCount()
        });
    });

    // Readiness Endpoint
    app.get('/ready', async (req, res) => {
        if (isShuttingDown || autonomousRuntime.isShuttingDown()) {
            return res.status(503).send({ status: 'not_ready', reason: 'shutting_down' });
        }
        
        if (!autonomousRuntime.getIsRunning()) {
            return res.status(503).send({ status: 'not_ready', reason: 'runtime_stopped' });
        }

        try {
            // Check critical database connectivity if applicable (TaskStore health)
            // Assuming task store is initialized and accessible.
            // Fast failing if there's a connection issue.
            const { error } = await athena['taskStore']?.listIncomplete().then(() => ({ error: null })).catch(e => ({ error: e })) || { error: null };
            if (error) {
                return res.status(503).send({ status: 'not_ready', reason: 'database_unavailable' });
            }
        } catch (e) {
            return res.status(503).send({ status: 'not_ready', reason: 'database_unavailable' });
        }

        return res.send({
            status: 'ready',
            workerId: autonomousRuntime.workerName
        });
    });

    app.get('/chat', { websocket: true }, (connection: any, req) => {
        connection.on('message', async (message: string) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'text') {
                    const diagResult = diagnostics.handleCommand(data.text);
                    if (diagResult !== null) {
                        connection.send(JSON.stringify({ type: 'token', text: diagResult }));
                        connection.send(JSON.stringify({ type: 'done' }));
                        return;
                    }

                    // Start streaming response
                    await athena.chat(
                        data.text,
                        data.attachments,
                        (token) => {
                            connection.send(JSON.stringify({ type: 'token', text: token }));
                        },
                        (toolName) => {
                            connection.send(JSON.stringify({ type: 'tool', tool: toolName }));
                        }
                    );
                    connection.send(JSON.stringify({ type: 'done' }));
                }
            } catch (err) {
                console.error('WS Error:', err);
            }
        });
    });

    app.get('/nodes', { websocket: true }, (connection, req) => {
        connection.on('message', message => {
            try {
                const data = JSON.parse(message.toString());
                if (data.type === 'node_register') {
                    const nodeType = data.nodeType || 'laptop';
                    nodeManager.registerNode(
                        connection, 
                        data.id, 
                        data.name, 
                        nodeType, 
                        data.token,
                        data.capabilities || []
                    );
                }
            } catch (err) {
                console.error('Node WS Error:', err);
            }
        });
    });
});

async function start() {
    try {
        const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
        await fastify.listen({ port, host: '0.0.0.0' });
        console.log(`ATHENA Server is running on port ${port}`);

        // Render keep-alive: self-ping every 14 minutes to prevent cold starts.
        // Render free tier spins down after 15 minutes of inactivity, adding 20-30s
        // to the first response. This keeps the instance warm.
        const selfPingUrl = process.env.RENDER_EXTERNAL_URL
            ? `${process.env.RENDER_EXTERNAL_URL}/health`
            : null;

        if (selfPingUrl) {
            setInterval(async () => {
                try {
                    await fetch(selfPingUrl);
                    console.log('[KeepAlive] Self-ping sent to', selfPingUrl);
                } catch (e) {
                    // Non-fatal — don't crash the server if ping fails
                }
            }, 14 * 60 * 1000); // 14 minutes
            console.log(`[KeepAlive] Render keep-alive active — pinging ${selfPingUrl} every 14 min`);
        }
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}

start();
