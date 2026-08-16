import { createToolRegistry } from './index.js';
import { PermissionManager } from './permission.js';
import { ToolExecutor } from './executor.js';

const registry = createToolRegistry();
const permissions = new PermissionManager();
const executor = new ToolExecutor(registry, permissions);

const result = await executor.execute(
    'get_system_info',
    {},
    {
        workingDirectory: process.cwd(),
    }
);

console.log('Executor result:');
console.log(result);