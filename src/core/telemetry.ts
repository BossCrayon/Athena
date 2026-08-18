import { EventBus } from './events.js';

export interface TelemetryEvent {
    eventType: string;
    timestamp: string;
    taskId?: string;
    sessionId?: string;
    stepId?: string;
    executionKey?: string;
    workerId?: string;
    provider?: string;
    model?: string;
    nodeId?: string;
    nodeType?: string;
    toolName?: string;
    durationMs?: number;
    status?: string;
    errorCategory?: string;
    metadata?: Record<string, any>;
    from?: string; // For fallback
    to?: string;   // For fallback
}

const REDACTED_STRING = '<REDACTED>';
const SENSITIVE_KEYS = [
    'password', 'token', 'api_key', 'apikey', 'secret', 
    'authorization', 'cookie', 'credential', 'private_key',
    'node_auth_token', 'supabase_anon_key', 'gemini_api_key', 'openrouter_api_key'
];

export function sanitize(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
        // Redact authorization headers in strings
        if (/bearer\s+[a-zA-Z0-9_\-\.]+/i.test(obj)) {
            obj = obj.replace(/bearer\s+[a-zA-Z0-9_\-\.]+/ig, `Bearer ${REDACTED_STRING}`);
        }
        // Redact potential env var assignments
        if (/(NODE_AUTH_TOKEN|GEMINI_API_KEY|OPENROUTER_API_KEY|SUPABASE_ANON_KEY)=([^\s]+)/i.test(obj)) {
            obj = obj.replace(/(NODE_AUTH_TOKEN|GEMINI_API_KEY|OPENROUTER_API_KEY|SUPABASE_ANON_KEY)=([^\s]+)/ig, `$1=${REDACTED_STRING}`);
        }
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => sanitize(item));
    }
    if (typeof obj === 'object') {
        const sanitizedObj: any = {};
        for (const [key, value] of Object.entries(obj)) {
            const keyLower = key.toLowerCase();
            const isSensitive = SENSITIVE_KEYS.some(sensitiveKey => keyLower.includes(sensitiveKey));
            
            if (isSensitive) {
                sanitizedObj[key] = REDACTED_STRING;
            } else {
                sanitizedObj[key] = sanitize(value);
            }
        }
        return sanitizedObj;
    }
    return obj;
}

export function sanitizeToolArguments(toolName: string, args: Record<string, any>): Record<string, any> {
    const sanitizedArgs = sanitize(args);
    if (toolName === 'run_command' || toolName === 'system_control') {
        // For run_command, we do not log full commands by default
        return { operation: sanitizedArgs.command ? 'process_inspection' : 'unknown', summary: 'Arguments redacted for safety' };
    }
    return sanitizedArgs;
}

export function classifyError(error: any): string {
    if (!error) return 'unknown_error';
    const errStr = String(error.message || error).toLowerCase();
    const status = error.status || error.statusCode;

    if (errStr === 'aborterror') return 'task_cancelled';
    if (error.name === 'NodeDisconnectError') return 'node_disconnected';
    if (errStr.includes('ssrf blocked') || errStr.includes('private/internal ip') || errStr.includes('unsupported protocol')) return 'url_blocked';
    if (status === 429 || errStr.includes('429') || errStr.includes('quota') || errStr.includes('rate limit') || errStr.includes('retry in')) return 'provider_rate_limited';
    if (status === 401 || status === 403 || errStr.includes('unauthorized') || errStr.includes('authentication')) return 'provider_authentication';
    if (errStr.includes('timed out') || errStr.includes('time out')) {
        if (errStr.includes('external') || errStr.includes('request')) return 'external_timeout';
        if (errStr.includes('tool')) return 'tool_timeout';
        if (errStr.includes('node')) return 'node_timeout';
        if (errStr.includes('provider')) return 'provider_timeout';
        return 'task_timeout';
    }
    if (errStr.includes('timeout')) {
        if (errStr.includes('tool')) return 'tool_timeout';
        if (errStr.includes('node')) return 'node_timeout';
        if (errStr.includes('provider')) return 'provider_timeout';
        return 'task_timeout';
    }
    if (errStr.includes('exceeded maximum size')) return 'response_too_large';
    if (errStr.includes('exceeded maximum redirect')) return 'too_many_redirects';
    if (errStr.includes('permission denied')) return 'permission_denied';
    if (errStr.includes('memory')) return 'memory_failure';
    if (errStr.includes('supabase') || errStr.includes('postgres')) return 'persistence_failure';
    if (errStr.includes('provider returned an empty response')) return 'provider_empty_response';
    
    return 'unknown_error';
}

export class TelemetryTracker {
    private eventBus: EventBus;

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
        this.eventBus.subscribe('telemetry', this.handleEvent.bind(this));
    }

    private handleEvent(payload: TelemetryEvent) {
        // Sanitize the metadata
        const sanitizedEvent = {
            ...payload,
            metadata: payload.metadata ? sanitize(payload.metadata) : undefined
        };
        
        // Print structured JSON to stdout for Render compatibility
        console.log(JSON.stringify(sanitizedEvent));
    }
}
