import type { Tool } from './types.js';

export const getBatteryLevelTool: Tool = {
    definition: {
        name: 'get_battery_level',
        description: 'Get the current battery percentage and charging status of the connected mobile phone.',
        permission: 'safe',
        schema: {
            name: 'get_battery_level',
            description: 'Retrieves the current battery level of the mobile device. Works only on mobile.',
            parameters: []
        },
        isParallelizable: true
    },
    execute: async () => {
        // This is a proxy tool. The Cloud Brain will route it to the mobile node.
        throw new Error('This tool must be executed on a mobile node.');
    },
};
