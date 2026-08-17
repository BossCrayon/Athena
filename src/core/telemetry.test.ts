import assert from 'assert';
import { sanitize, sanitizeToolArguments, classifyError } from './telemetry.js';

async function runTests() {
    console.log('Running Telemetry tests...');

    // Test: sanitize redacts sensitive keys in objects recursively
    {
        const input = {
            user: 'alice',
            password: 'super-secret-password',
            metadata: {
                api_key: 'AIzaFakeExample',
                other_info: 'safe',
                env_vars: {
                    NODE_AUTH_TOKEN: 'secret123',
                    SUPABASE_ANON_KEY: 'secret456'
                }
            }
        };
        
        const result = sanitize(input);
        assert.strictEqual(result.password, '<REDACTED>');
        assert.strictEqual(result.metadata.api_key, '<REDACTED>');
        assert.strictEqual(result.metadata.env_vars.NODE_AUTH_TOKEN, '<REDACTED>');
        assert.strictEqual(result.metadata.env_vars.SUPABASE_ANON_KEY, '<REDACTED>');
        assert.strictEqual(result.user, 'alice');
    }

    // Test: sanitize redacts sensitive strings such as Bearer tokens
    {
        const input = 'Authorization: Bearer super-secret';
        const result = sanitize(input);
        assert.strictEqual(result, 'Authorization: Bearer <REDACTED>');
    }

    // Test: sanitize redacts environment variable like string assignments
    {
        const input = 'NODE_AUTH_TOKEN=secret123 and GEMINI_API_KEY=AIzaFakeExample';
        const result = sanitize(input);
        assert.strictEqual(result, 'NODE_AUTH_TOKEN=<REDACTED> and GEMINI_API_KEY=<REDACTED>');
    }
    
    // Test: sanitize handle arrays
    {
        const input = ['safe', { password: 'test' }];
        const result = sanitize(input);
        assert.strictEqual(result[0], 'safe');
        assert.strictEqual(result[1].password, '<REDACTED>');
    }

    // Test: sanitizeToolArguments redacts full command for run_command tool
    {
        const result = sanitizeToolArguments('run_command', { command: 'Get-Process | Where-Object { $_.Name -match "secret" }' });
        assert.strictEqual(result.operation, 'process_inspection');
        assert.strictEqual(result.command, undefined);
    }

    // Test: sanitizeToolArguments passes through arguments for normal tools
    {
        const result = sanitizeToolArguments('get_weather', { location: 'London' });
        assert.strictEqual(result.location, 'London');
    }

    // Test: classifyError
    {
        assert.strictEqual(classifyError(new Error('AbortError')), 'task_cancelled');
        assert.strictEqual(classifyError({ status: 429 }), 'provider_rate_limited');
        assert.strictEqual(classifyError(new Error('retry in 10s')), 'provider_rate_limited');
        
        const err = new Error('disconnected');
        err.name = 'NodeDisconnectError';
        assert.strictEqual(classifyError(err), 'node_disconnected');
        
        assert.strictEqual(classifyError(new Error('random error')), 'unknown_error');
    }

    console.log('Telemetry tests passed!');
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
