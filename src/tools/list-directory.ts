import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Tool, ToolContext } from './types.js';

export const listDirectoryTool: Tool = {
    definition: {
        name: 'list_directory',
        description: 'Lists the contents of a directory on the local filesystem. Returns files and folders.',
        permission: 'safe',
        schema: {
            name: 'list_directory',
            description: 'Lists the contents of a directory on the local filesystem. Returns files and folders.',
            parameters: [
                {
                    name: 'dir_path',
                    description: 'The absolute or relative path to the directory to list.',
                    type: 'string',
                    required: true,
                }
            ],
        },
    },

    async execute(args: Record<string, unknown>, context: ToolContext) {
        const dirPath = args.dir_path as string;
        try {
            const absolutePath = path.resolve(context.cwd, dirPath);
            const entries = await fs.readdir(absolutePath, { withFileTypes: true });
            
            let results = entries.map(entry => {
                return {
                    name: entry.name,
                    type: entry.isDirectory() ? 'directory' : 'file',
                };
            });
            
            if (results.length > 250) {
                const total = results.length;
                results = results.slice(0, 250);
                results.push({ name: `...and ${total - 250} more items hidden to save memory.`, type: 'info' });
            }
            
            return {
                success: true,
                output: JSON.stringify({ path: absolutePath, contents: results }, null, 2),
            };
        } catch (err: any) {
            return { success: false, output: '', error: err.message };
        }
    }
};
