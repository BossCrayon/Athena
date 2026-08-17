export type RetrySafety = 'SAFE_TO_RETRY' | 'IDEMPOTENT' | 'NON_IDEMPOTENT' | 'UNKNOWN';

export function evaluateRetrySafety(toolName: string, args: Record<string, unknown>): RetrySafety {
    const safeByDefault = [
        'system_info', 'current_time', 'get_weather', 'get_battery', 
        'get_location', 'list_directory', 'read_file', 'search_files', 
        'locate_item', 'search_memory', 'web_search'
    ];
    
    if (safeByDefault.includes(toolName)) {
        return 'SAFE_TO_RETRY';
    }

    if (toolName === 'run_command') {
        const cmd = String(args.command || '').toLowerCase().trim();
        if (cmd.startsWith('get-process') || cmd.startsWith('ls ') || cmd.startsWith('dir ') || cmd.startsWith('echo ')) {
            return 'SAFE_TO_RETRY';
        }
        return 'UNKNOWN';
    }

    if (toolName === 'system_control') {
        const action = String(args.action || '').toLowerCase();
        if (action === 'get_network_status' || action === 'get_volume') {
            return 'SAFE_TO_RETRY';
        }
        if (action === 'kill_process' || action === 'set_volume') {
            return 'NON_IDEMPOTENT';
        }
        return 'UNKNOWN';
    }
    
    if (toolName === 'fetch_url') {
        const method = String(args.method || 'GET').toUpperCase();
        if (method === 'GET' || method === 'HEAD') {
            return 'UNKNOWN'; // Might have side effects on the external server
        }
        return 'NON_IDEMPOTENT';
    }
    
    if (toolName === 'save_memory') {
        return 'NON_IDEMPOTENT';
    }
    
    if (toolName === 'vibrate_phone') {
        return 'NON_IDEMPOTENT';
    }
    
    return 'UNKNOWN';
}
