import type { Tool } from './types.js';

export const vibratePhoneTool: Tool = {
    definition: {
        name: 'vibrate_phone',
        description: 'Trigger a vibration on the connected mobile phone to alert the user.',
        permission: 'safe',
        schema: {
            name: 'vibrate_phone',
            description: 'Trigger a vibration on the connected mobile phone to alert the user.',
            parameters: [
                {
                    name: 'style',
                    type: 'string',
                    description: 'The style of vibration (e.g. "light", "medium", "heavy", "success", "warning", "error"). Default is "medium".',
                    required: false,
                }
            ],
        }
    },
    execute: async () => {
        // This is a proxy tool. The Cloud Brain will route it to the mobile node.
        throw new Error('This tool must be executed on a mobile node.');
    },
};
