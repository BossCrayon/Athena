import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { Tool, ToolContext } from './types.js';
import * as os from 'node:os';

const execAsync = promisify(exec);

export const systemControlTool: Tool = {
    definition: {
        name: 'system_control',
        description: 'Interacts with the local device to list running applications, kill processes, open apps, or get detailed system hardware information.',
        permission: 'safe',
        schema: {
            name: 'system_control',
            description: 'Interacts with the local device to list running applications, kill processes, open apps, or get detailed system hardware information.',
            parameters: [
                {
                    name: 'action',
                    description: 'The action to perform: "list_apps", "list_processes", "kill_process", "open_app", "system_info", "advanced_hardware_info", "network_status".',
                    type: 'string',
                    required: true,
                },
                {
                    name: 'target',
                    description: 'The name of the process to kill or the app to open (e.g. "notepad.exe", "calc"). Required for "kill_process" and "open_app".',
                    type: 'string',
                    required: false,
                }
            ],
        },
    },

    async execute(args: Record<string, unknown>, context: ToolContext) {
        const action = args.action as string;
        const target = args.target as string || (args.process_name as string);

        try {
            if (action === 'system_info') {
                const info = {
                    platform: os.platform(),
                    release: os.release(),
                    arch: os.arch(),
                    cpus: os.cpus()[0].model + ' (' + os.cpus().length + ' cores)',
                    totalMemory: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                    freeMemory: (os.freemem() / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                    uptime: (os.uptime() / 3600).toFixed(2) + ' hours'
                };
                return { success: true, output: JSON.stringify(info, null, 2) };
            } 
            
            else if (action === 'advanced_hardware_info') {
                // Gets deeper hardware level info (GPU, BIOS, Disks)
                const script = `
                    $gpu = Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json -Compress;
                    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, Size, FreeSpace | ConvertTo-Json -Compress;
                    $bios = Get-CimInstance Win32_BIOS | Select-Object Manufacturer, Name, Version | ConvertTo-Json -Compress;
                    Write-Output "GPU:$gpu|DISK:$disk|BIOS:$bios"
                `;
                const { stdout } = await execAsync('powershell -Command "' + script.replace(/\\n/g, '') + '"');
                return { success: true, output: stdout.trim() };
            }
            
            else if (action === 'list_apps') {
                const cmd = 'powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-Json"';
                const { stdout } = await execAsync(cmd);
                if (!stdout || stdout.trim() === '') return { success: true, output: 'No visible applications found.' };
                return { success: true, output: stdout };
            } 
            
            else if (action === 'list_processes') {
                const cmd = 'tasklist';
                const { stdout } = await execAsync(cmd);
                let output = stdout;
                if (output.length > 10000) output = output.substring(0, 10000) + '\\n...[TRUNCATED]...';
                return { success: true, output };
            } 
            
            else if (action === 'kill_process') {
                if (!target) return { success: false, output: 'Must provide target process name.' };
                const cmd = 'taskkill /F /IM "' + target + '" /T';
                const { stdout } = await execAsync(cmd);
                return { success: true, output: stdout };
            } 
            
            else if (action === 'open_app') {
                if (!target) return { success: false, output: 'Must provide target app name.' };
                // Start-Process starts it asynchronously so it doesn't block the server
                const cmd = 'powershell -Command "Start-Process \'' + target + '\'"';
                await execAsync(cmd);
                return { success: true, output: 'Successfully sent command to open: ' + target };
            }
            
            else if (action === 'network_status') {
                // Gets active TCP/UDP connections and listening ports with PIDs
                const cmd = 'netstat -ano';
                const { stdout } = await execAsync(cmd);
                let output = stdout;
                if (output.length > 15000) output = output.substring(0, 15000) + '\\n...[TRUNCATED]...';
                return { success: true, output };
            }
            
            else {
                return { success: false, output: 'Unknown action: ' + action };
            }
        } catch (err: any) {
            return { success: false, output: '', error: err.message };
        }
    }
};
