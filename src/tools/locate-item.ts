import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Tool, ToolContext } from './types.js';

export const locateItemTool: Tool = {
    definition: {
        name: 'locate_item',
        description: 'Autonomously searches for a file or directory by name. Smartly prioritizes the current project and user directories before falling back to a broader search.',
        permission: 'safe',
        schema: {
            name: 'locate_item',
            description: 'Autonomously searches for a file or directory by name. Smartly prioritizes the current project and user directories before falling back to a broader search.',
            parameters: [
                {
                    name: 'name',
                    description: 'The name of the file or folder to find (e.g. "bms", "project", "steam.exe").',
                    type: 'string',
                    required: true,
                }
            ],
        },
    },

    async execute(args: Record<string, unknown>, context: ToolContext) {
        const targetName = (args.name as string).toLowerCase();
        const homedir = os.homedir();
        
        const searchRoots = [
            context.cwd,
            'C:\\\\', // Important to check C:\ directly for root folders like C:\BMS
            path.join(homedir, 'Documents'),
            path.join(homedir, 'Desktop'),
            path.join(homedir, 'Downloads'),
            homedir
        ];

        const ignoredDirs = new Set(['node_modules', '.git', 'windows', 'program files', 'program files (x86)', 'appdata', '.cache']);
        let allResults: string[] = [];
        const startTime = Date.now();
        const MAX_TIME_MS = 10000; // 10 seconds max

        // Smart BFS Search
        for (const root of searchRoots) {
            const queue: string[] = [root];
            const visited = new Set<string>();

            while (queue.length > 0) {
                if (Date.now() - startTime > MAX_TIME_MS) {
                    break; // Timeout
                }

                const currentDir = queue.shift()!;
                if (visited.has(currentDir)) continue;
                visited.add(currentDir);

                try {
                    const entries = await fs.readdir(currentDir, { withFileTypes: true });
                    
                    for (const entry of entries) {
                        const fullPath = path.join(currentDir, entry.name);
                        
                        // Check if this entry matches our target
                        if (entry.name.toLowerCase().includes(targetName)) {
                            allResults.push(fullPath);
                            // If we found enough results, we can stop early
                            if (allResults.length >= 20) break;
                        }

                        // Queue subdirectories
                        if (entry.isDirectory()) {
                            const dirNameLower = entry.name.toLowerCase();
                            if (!ignoredDirs.has(dirNameLower)) {
                                queue.push(fullPath);
                            }
                        }
                    }
                } catch (err) {
                    // Ignore permission denied or missing folders
                    continue;
                }

                if (allResults.length >= 20) break;
            }
            
            if (allResults.length > 0) break; // Found what we need, don't search fallback roots
            if (Date.now() - startTime > MAX_TIME_MS) break;
        }

        allResults = [...new Set(allResults)];

        if (allResults.length === 0) {
            return { success: true, output: "No items found matching '" + targetName + "'." };
        }

        return {
            success: true,
            output: "Found " + allResults.length + " matching items:\\n" + allResults.join("\\n"),
        };
    }
};
