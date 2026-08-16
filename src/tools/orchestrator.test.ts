import { createToolRegistry } from './index.js';
import { PermissionManager } from './permission.js';
import { ToolExecutor } from './executor.js';
import { ToolOrchestrator } from './orchestrator.js';

const registry = createToolRegistry();
const permissions = new PermissionManager();
const executor = new ToolExecutor(registry, permissions);
const orchestrator = new ToolOrchestrator(registry, executor);

const response = await orchestrator.handle(
    {
        toolName: 'get_system_info',
        arguments: {},
    },
    {
        workingDirectory: process.cwd(),
    }
);

console.log('Tool response:');
console.log(response);