import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { Tool, ToolContext } from './types.js';

const execAsync = promisify(exec);

export const searchFilesTool: Tool = {
    definition: {
        name: 'search_files',
        description: 'Searches for a text pattern inside files in a given directory using grep or findstr.',
        permission: 'safe',
        schema: {
            name: 'search_files',
            description: 'Searches for a text pattern inside files in a given directory using grep or findstr.',
            parameters: [
                {
                    name: 'directory',
                    description: 'The directory to search in.',
                    type: 'string',
                    required: true,
                },
                {
                    name: 'query',
                    description: 'The text pattern to search for.',
                    type: 'string',
                    required: true,
                }
            ],
        },
    },

    async execute(args: Record<string, unknown>, context: ToolContext) {
        const dirPath = args.directory as string;
        const query = args.query as string;
        try {
            const absolutePath = path.resolve(context.cwd, dirPath);
            const cmd = 'findstr /S /I /N "' + query + '" "' + absolutePath + '\\\\*.*"';
            let { stdout } = await execAsync(cmd, { timeout: 15000 });
            
            if (stdout && stdout.length > 15000) {
                stdout = stdout.substring(0, 15000) + '\\n...[RESULTS TRUNCATED TO 15,000 CHARS TO PREVENT OVERLOAD]...';
            }

            return {
                success: true,
                output: stdout || "Matches found, but no output.",
            };
        } catch (err: any) {
            if (err.code === 1) {
                return { success: true, output: "No matches found." };
            }
            return { success: false, output: '', error: err.message };
        }
    }
};
