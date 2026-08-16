import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import * as dotenv from 'dotenv';
import { AthenaCore } from '../core/athena.js';
import { LLMRouter } from '../llm/router.js';
import { GeminiProvider } from '../llm/providers/gemini.js';
import { OpenRouterProvider } from '../llm/providers/openrouter.js';
import { OllamaProvider } from '../llm/providers/ollama.js';
import { ToolRegistry } from '../tools/registry.js';
import { ToolExecutor } from '../tools/executor.js';
import { ToolOrchestrator } from '../tools/orchestrator.js';
import { PermissionManager } from '../tools/permission.js';
import { CloudMemoryManager } from '../core/memory.js';

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

dotenv.config();

const fastify = Fastify({ logger: true });
fastify.register(cors, { origin: true });
fastify.register(websocket);

// Initialize ATHENA backend
async function setupAthena() {
    const router = new LLMRouter();
    const fallbackOrder: string[] = [];

    if (process.env.GEMINI_API_KEY) {
        router.registerProvider('gemini', new GeminiProvider());
        router.setDefaultProvider('gemini');
        fallbackOrder.push('gemini');
    }
    if (process.env.OPENROUTER_API_KEY) {
        router.registerProvider('openrouter', new OpenRouterProvider());
        if (!process.env.GEMINI_API_KEY) router.setDefaultProvider('openrouter');
        fallbackOrder.push('openrouter');
    }
    router.registerProvider('ollama', new OllamaProvider());
    if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) router.setDefaultProvider('ollama');
    fallbackOrder.push('ollama');
    router.setFallbackProviders(fallbackOrder);

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

    const permissions = new PermissionManager();
    const executor = new ToolExecutor(toolRegistry, permissions);
    const toolOrchestrator = new ToolOrchestrator(toolRegistry, executor);
    const memoryManager = new CloudMemoryManager();

    const athena = new AthenaCore(
        router,
        toolRegistry,
        toolOrchestrator,
        {
            cwd: process.cwd(),
            // For headless server, we auto-allow confirm tools or we deny them.
            askPermission: async () => true // Auto-allow for now to ensure remote apps can use tools.
        },
        memoryManager
    );

    await athena.initialize();
    return athena;
}

fastify.register(async function (app) {
    const athena = await setupAthena();

    app.get('/chat', { websocket: true }, (connection: any, req) => {
        connection.on('message', async (message: string) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'text') {
                    // Start streaming response
                    await athena.chat(
                        data.text, 
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
});

async function start() {
    try {
        await fastify.listen({ port: 3000, host: '0.0.0.0' });
        console.log('ATHENA Server is running on ws://localhost:3000/chat');
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}

start();
