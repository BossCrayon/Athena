import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { Tool, ToolContext } from './types.js';

const execAsync = promisify(exec);

export const runCommandTool: Tool = {
    definition: {
        name: 'run_command',
        description: 'Runs a shell command. For long-running processes (dev servers, watchers), set background=true to start them detached and return immediately.',
        permission: 'confirm',
        schema: {
            name: 'run_command',
            description: 'Runs a shell command. For long-running processes (dev servers, watchers), set background=true to start them detached and return immediately.',
            parameters: [
                {
                    name: 'command',
                    description: 'The shell command to execute.',
                    type: 'string',
                    required: true,
                },
                {
                    name: 'cwd',
                    description: 'Optional working directory to run the command in.',
                    type: 'string',
                    required: false,
                },
                {
                    name: 'background',
                    description: 'If true, start the process in the background (detached) and return immediately. Use this for long-running processes like dev servers (npm run start, adonis serve, etc.).',
                    type: 'boolean',
                    required: false,
                }
            ],
        },
    },

    async execute(args: Record<string, unknown>, context: ToolContext) {
        const command = args.command as string;
        const cwd = (args.cwd as string) || context.cwd;
        const background = args.background === true;

        if (background) {
            // Spawn detached — fire and forget. Returns immediately.
            return new Promise<{ success: boolean; output: string; error?: string }>((resolve) => {
                try {
                    // Use cmd /c on Windows to handle .cmd shims (npm.cmd, adonis.cmd, etc.)
                    const isWindows = process.platform === 'win32';
                    const child = isWindows
                        ? spawn('cmd', ['/c', command], {
                            cwd,
                            detached: true,
                            stdio: 'ignore',
                            windowsHide: true,
                          })
                        : spawn('sh', ['-c', command], {
                            cwd,
                            detached: true,
                            stdio: 'ignore',
                          });

                    child.unref(); // Allow parent process to exit independently

                    resolve({
                        success: true,
                        output: `Process started in background (PID: ${child.pid}). Command: ${command}${cwd !== context.cwd ? ` (in ${cwd})` : ''}`,
                    });
                } catch (err: any) {
                    resolve({
                        success: false,
                        output: '',
                        error: `Failed to start background process: ${err.message}`,
                    });
                }
            });
        }

        // Standard blocking execution for short-lived commands
        try {
            let { stdout, stderr } = await execAsync(command, { cwd, timeout: 30000 });

            if (stdout.length > 15000) stdout = stdout.substring(0, 15000) + '\n...[STDOUT TRUNCATED]...';
            if (stderr.length > 5000) stderr = stderr.substring(0, 5000) + '\n...[STDERR TRUNCATED]...';

            if (!stdout.trim() && !stderr.trim()) {
                return { success: true, output: 'Command executed successfully with no output.' };
            }

            return {
                success: true,
                output: 'STDOUT:\n' + (stdout || 'None') + '\n\nSTDERR:\n' + (stderr || 'None'),
            };
        } catch (err: any) {
            return {
                success: false,
                output: 'STDOUT:\n' + (err.stdout || '') + '\n\nSTDERR:\n' + (err.stderr || ''),
                error: err.message,
            };
        }
    }
};
