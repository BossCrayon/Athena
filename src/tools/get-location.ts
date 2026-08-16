import type { Tool } from './types.js';

export const getLocationTool: Tool = {
    definition: {
        name: 'get_location',
        description: 'Get the current GPS location coordinates (latitude and longitude) of the connected mobile phone.',
        permission: 'safe',
        schema: {
            name: 'get_location',
            description: 'Get the current GPS location coordinates (latitude and longitude) of the connected mobile phone.',
            parameters: [],
        }
    },
    execute: async () => {
        // This is a proxy tool. The Cloud Brain will route it to the mobile node.
        throw new Error('This tool must be executed on a mobile node.');
    },
};
