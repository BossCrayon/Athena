import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Tool, ToolContext } from './types.js';

export const readFileTool: Tool = {
    definition: {
        name: 'read_file',
        description: 'Reads the contents of a file on the local filesystem.',
        permission: 'safe',
        schema: {
            name: 'read_file',
            description: 'Reads the contents of a file on the local filesystem.',
            parameters: [
                {
                    name: 'file_path',
                    description: 'The absolute or relative path to the file to read.',
                    type: 'string',
                    required: true,
                }
            ],
        },
    },

    async execute(args: Record<string, unknown>, context: ToolContext) {
        const filePath = args.file_path as string;
        try {
            const absolutePath = path.resolve(context.cwd, filePath);
            let content = await fs.readFile(absolutePath, 'utf-8');
            
            if (content.length > 20000) {
                content = content.substring(0, 20000) + '\\n\\n...[CONTENT TRUNCATED AFTER 20,000 CHARACTERS TO PREVENT SYSTEM OVERLOAD]...';
            }

            return {
                success: true,
                output: content,
            };
        } catch (err: any) {
            return { success: false, output: '', error: err.message };
        }
    }
};
