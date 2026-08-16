import { createToolRegistry } from './index.js';
import { PermissionManager } from './permission.js';

const registry = createToolRegistry();
const permissionManager = new PermissionManager();

const tool = registry.get('get_system_info');

if (!tool) {
    throw new Error('get_system_info tool was not registered.');
}

const permission = permissionManager.evaluate({
    toolName: tool.definition.name,
    permission: tool.definition.permission,
});

console.log('Tool:', tool.definition.name);
console.log('Permission:', permission);

if (permission.decision !== 'allow') {
    throw new Error('System info tool was unexpectedly denied.');
}

const result = await tool.execute(
    {},
    {
        cwd: process.cwd(),
    }
);

console.log('\nTool result:');
console.log(result);