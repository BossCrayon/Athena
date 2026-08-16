import os from 'node:os';
import process from 'node:process';

import type {
    Tool,
    ToolContext,
    ToolResult,
} from './types.js';

export const systemInfoTool: Tool = {
    definition: {
        name: 'get_system_info',
        description:
            'Returns basic information about the computer running ATHENA.',
        permission: 'safe',
        schema: {
            name: 'get_system_info',
            description:
                'Returns basic information about the computer running ATHENA.',
            parameters: [],
        },
    },

    async execute(
        _args: Record<string, unknown>,
        context: ToolContext
    ): Promise<ToolResult> {
        try {
            const information = {
                operatingSystem: `${os.type()} ${os.release()}`,
                platform: process.platform,
                architecture: process.arch,
                hostname: os.hostname(),
                cpuCount: os.cpus().length,
                nodeVersion: process.version,
                cwd: context.cwd,
            };

            return {
                success: true,
                output: JSON.stringify(information, null, 2),
            };
        } catch (error) {
            return {
                success: false,
                output: '',
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error while retrieving system information.',
            };
        }
    },
};