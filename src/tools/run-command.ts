import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { Tool, ToolContext } from './types.js';

const execAsync = promisify(exec);

export const runCommandTool: Tool = {
    definition: {
        name: 'run_command',
        description: 'Runs a shell command (cmd/powershell on Windows, bash on Linux/macOS).',
        permission: 'confirm',
        schema: {
            name: 'run_command',
            description: 'Runs a shell command (cmd/powershell on Windows, bash on Linux/macOS).',
            parameters: [
                {
                    name: 'command',
                    description: 'The shell command to execute.',
                    type: 'string',
                    required: true,
                }
            ],
        },
    },

    async execute(args: Record<string, unknown>, context: ToolContext) {
        const command = args.command as string;
        try {
            let { stdout, stderr } = await execAsync(command, { cwd: context.cwd, timeout: 30000 });
            
            if (stdout.length > 15000) stdout = stdout.substring(0, 15000) + '\\n...[STDOUT TRUNCATED]...';
            if (stderr.length > 5000) stderr = stderr.substring(0, 5000) + '\\n...[STDERR TRUNCATED]...';

            if (!stdout.trim() && !stderr.trim()) {
                return { success: true, output: "Command executed successfully with no output." };
            }

            return {
                success: true,
                output: "STDOUT:\\n" + (stdout || "None") + "\\n\\nSTDERR:\\n" + (stderr || "None"),
            };
        } catch (err: any) {
            return { 
                success: false, 
                output: "STDOUT:\\n" + err.stdout + "\\n\\nSTDERR:\\n" + err.stderr,
                error: err.message 
            };
        }
    }
};
