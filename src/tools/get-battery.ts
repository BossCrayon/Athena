import type { ToolSchema } from './schema.js';

export const getBatteryLevelTool: ToolSchema = {
    name: 'get_battery_level',
    description: 'Get the current battery percentage and charging status of the connected mobile phone.',
    parameters: [],
    execute: async () => {
        // This is a proxy tool. The Cloud Brain will route it to the mobile node.
        throw new Error('This tool must be executed on a mobile node.');
    },
};
