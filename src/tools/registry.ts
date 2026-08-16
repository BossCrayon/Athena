import type { Tool } from './types.js';
import type { ToolSchema } from './schema.js';

export class ToolRegistry {
    private readonly tools = new Map<string, Tool>();

    register(tool: Tool): void {
        if (this.tools.has(tool.definition.name)) {
            throw new Error(
                `Tool '${tool.definition.name}' is already registered.`
            );
        }

        this.tools.set(tool.definition.name, tool);
    }

    get(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    has(name: string): boolean {
        return this.tools.has(name);
    }

    list(): Tool[] {
        return [...this.tools.values()];
    }

    getSchemas(): ToolSchema[] {
        return Array.from(this.tools.values()).map(
            (tool) => tool.definition.schema
        );
    }
}