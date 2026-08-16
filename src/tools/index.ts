import { ToolRegistry } from './registry.js';
import { systemInfoTool } from './system-info.js';

export function createToolRegistry(): ToolRegistry {
    const registry = new ToolRegistry();

    registry.register(systemInfoTool);

    return registry;
}