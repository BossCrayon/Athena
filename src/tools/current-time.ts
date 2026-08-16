import type { Tool } from './types.js';

export const currentTimeTool: Tool = {
    definition: {
        name: 'get_current_time',
        description:
            'Returns the current date and time of the computer running ATHENA.',
        permission: 'safe',
        schema: {
            name: 'get_current_time',
            description:
                'Returns the current date and time of the computer running ATHENA.',
            parameters: [],
        },
    },

    async execute(): Promise<{
        success: boolean;
        output: string;
    }> {
        return {
            success: true,
            output: new Date().toString(),
        };
    },
};