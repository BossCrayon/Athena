import type { Tool } from './types.js';

export const currentTimeTool: Tool = {
    definition: {
        name: 'get_current_time',
        description:
            'Returns the current date and time of the computer running ATHENA.',
        permission: 'safe',
        schema: {
            name: 'current_time',
            description: 'Gets the current local time in ISO format.',
            parameters: [],
        },
        isParallelizable: true
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