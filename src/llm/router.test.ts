import assert from 'assert';
import { LLMRouter } from './router.js';
import type { LLMProvider, GenerationOptions, Message, ToolResult, LLMResponse, ProviderMetadata } from './types.js';

class MockProvider implements LLMProvider {
    constructor(
        private metadata: ProviderMetadata,
        private generateMock: () => Promise<LLMResponse>,
        private continueMock: () => Promise<LLMResponse> = async () => ({ text: '' })
    ) {}

    getMetadata(): ProviderMetadata {
        return this.metadata;
    }

    async generate() { return this.generateMock(); }
    async continueWithToolResults() { return this.continueMock(); }
}

async function runTests() {
    console.log('Running LLMRouter tests...');

    // Test 1: Healthy provider selection & Capability filtering
    {
        const router = new LLMRouter();
        router.registerProvider('p1', new MockProvider(
            { name: 'p1', capabilities: { tools: false, vision: false, streaming: false }, cost: 'low', latency: 'low' },
            async () => ({ text: 'p1 text' })
        ));
        router.registerProvider('p2', new MockProvider(
            { name: 'p2', capabilities: { tools: true, vision: false, streaming: false }, cost: 'low', latency: 'low' },
            async () => ({ text: 'p2 text' })
        ));

        // Requesting tools should skip p1 and pick p2
        const res = await router.generate([], { routing: { requireTools: true } });
        assert.strictEqual(res.text, 'p2 text', 'Capability filtering failed');
    }

    // Test 2: Fallback & Cost/Latency preference
    {
        const router = new LLMRouter();
        let p1Calls = 0;
        let p2Calls = 0;

        router.registerProvider('expensive', new MockProvider(
            { name: 'expensive', capabilities: { tools: true, vision: false, streaming: false }, cost: 'high', latency: 'low' },
            async () => { p1Calls++; return { text: 'expensive' }; }
        ));
        router.registerProvider('cheap', new MockProvider(
            { name: 'cheap', capabilities: { tools: true, vision: false, streaming: false }, cost: 'low', latency: 'low' },
            async () => { p2Calls++; return { text: 'cheap' }; }
        ));

        router.setFallbackProviders(['expensive', 'cheap']);

        // Priority cost should pick cheap first
        const res = await router.generate([], { routing: { priority: 'cost' } });
        assert.strictEqual(res.text, 'cheap');
        assert.strictEqual(p2Calls, 1);
        assert.strictEqual(p1Calls, 0);
    }

    // Test 3: Rate-limited detection, cooldown, and fallback
    {
        const router = new LLMRouter();
        router.registerProvider('primary', new MockProvider(
            { name: 'primary', capabilities: { tools: true, vision: false, streaming: false }, cost: 'low', latency: 'low' },
            async () => { throw new Error('429 Too Many Requests'); }
        ));
        router.registerProvider('secondary', new MockProvider(
            { name: 'secondary', capabilities: { tools: true, vision: false, streaming: false }, cost: 'medium', latency: 'medium' },
            async () => ({ text: 'secondary success' })
        ));
        
        router.setDefaultProvider('primary');
        router.setFallbackProviders(['secondary']);

        // This should fail on primary, fallback to secondary without crashing
        const res = await router.generate([]);
        assert.strictEqual(res.text, 'secondary success', 'Fallback failed');

        const primaryHealth = router.getProviderHealth('primary');
        assert.strictEqual(primaryHealth?.status, 'rate-limited', 'Rate limit detection failed');
        assert.ok(primaryHealth.cooldownUntil && primaryHealth.cooldownUntil > Date.now(), 'Cooldown not set');
    }

    // Test 4: Retry delay extraction (regex)
    {
        const router = new LLMRouter();
        router.registerProvider('primary', new MockProvider(
            { name: 'primary', capabilities: { tools: true, vision: false, streaming: false }, cost: 'low', latency: 'low' },
            async () => { throw new Error('Quota exceeded. Please try again in 9.225s'); }
        ));
        router.registerProvider('secondary', new MockProvider(
            { name: 'secondary', capabilities: { tools: true, vision: false, streaming: false }, cost: 'low', latency: 'low' },
            async () => ({ text: 'secondary success' })
        ));
        router.setFallbackProviders(['primary', 'secondary']);

        await router.generate([]);
        const primaryHealth = router.getProviderHealth('primary');
        
        assert.strictEqual(primaryHealth?.status, 'rate-limited');
        // Delay should be ceil(9.225) = 10 seconds
        const expectedCooldown = Date.now() + 10 * 1000;
        assert.ok(primaryHealth!.cooldownUntil! <= expectedCooldown + 1000 && primaryHealth!.cooldownUntil! >= expectedCooldown - 1000, 'Retry extraction failed for "try again in"');
    }

    // Test 4b: Retry delay extraction (Retry-After header)
    {
        const router = new LLMRouter();
        router.registerProvider('primary', new MockProvider(
            { name: 'primary', capabilities: { tools: true, vision: false, streaming: false }, cost: 'low', latency: 'low' },
            async () => { 
                const err: any = new Error('429 Rate Limit');
                err.headers = { 'retry-after': '12' };
                throw err;
            }
        ));
        router.registerProvider('secondary', new MockProvider(
            { name: 'secondary', capabilities: { tools: true, vision: false, streaming: false }, cost: 'low', latency: 'low' },
            async () => ({ text: 'secondary success' })
        ));
        router.setFallbackProviders(['primary', 'secondary']);

        await router.generate([]);
        const primaryHealth = router.getProviderHealth('primary');
        
        assert.strictEqual(primaryHealth?.status, 'rate-limited');
        const expectedCooldown = Date.now() + 12 * 1000;
        assert.ok(primaryHealth!.cooldownUntil! <= expectedCooldown + 1000 && primaryHealth!.cooldownUntil! >= expectedCooldown - 1000, 'Retry-After header extraction failed');
    }

    // Test 5: All providers unavailable
    {
        const router = new LLMRouter();
        router.registerProvider('p1', new MockProvider(
            { name: 'p1', capabilities: { tools: true, vision: false, streaming: false }, cost: 'low', latency: 'low' },
            async () => { throw new Error('429'); }
        ));
        router.setFallbackProviders(['p1']);

        try {
            await router.generate([]);
            assert.fail('Should have thrown when all providers fail');
        } catch (e: any) {
            assert.ok(e.message.includes('429'), 'Should throw the last error or generic error');
        }
    }

    // Test 6: Recovery after cooldown
    {
        const router = new LLMRouter();
        let p1Fails = true;
        router.registerProvider('p1', new MockProvider(
            { name: 'p1', capabilities: { tools: true, vision: false, streaming: false }, cost: 'low', latency: 'low' },
            async () => { 
                if (p1Fails) throw new Error('Please retry in 0.01s');
                return { text: 'recovered' };
            }
        ));
        router.setFallbackProviders(['p1']);

        try {
            await router.generate([]);
        } catch (e) {}

        const health = router.getProviderHealth('p1');
        assert.strictEqual(health?.status, 'rate-limited');

        // Wait for cooldown to pass
        await new Promise(resolve => setTimeout(resolve, 1500));

        p1Fails = false;
        const res = await router.generate([]);
        assert.strictEqual(res.text, 'recovered', 'Provider failed to recover');
        assert.strictEqual(router.getProviderHealth('p1')?.status, 'healthy');
    }

    // Test 7: continueWithToolResults fallback
    {
        const router = new LLMRouter();
        router.registerProvider('primary', new MockProvider(
            { name: 'primary', capabilities: { tools: true, vision: false, streaming: false }, cost: 'low', latency: 'low' },
            async () => ({ text: 'primary generate', continuationId: '123' }),
            async () => { throw new Error('429'); }
        ));
        router.registerProvider('secondary', new MockProvider(
            { name: 'secondary', capabilities: { tools: true, vision: false, streaming: false }, cost: 'low', latency: 'low' },
            async () => ({ text: 'secondary fallback text' }),
            async () => ({ text: 'should not reach here' })
        ));
        
        router.setFallbackProviders(['primary', 'secondary']);
        
        // This generate will succeed on primary
        await router.generate([]);
        
        // Now continueWithToolResults should fail on primary, mark it rate-limited, and fallback to secondary's generate
        const res = await router.continueWithToolResults('123', [], []);
        assert.strictEqual(res.text, 'secondary fallback text');
        assert.strictEqual(router.getProviderHealth('primary')?.status, 'rate-limited');
    }

    // Test 8: Intent-based routing
    {
        const router = new LLMRouter();
        
        router.registerProvider('base', new MockProvider(
            { name: 'base', capabilities: { tools: true, vision: false, streaming: false }, cost: 'low', latency: 'low' },
            async () => ({ text: 'base text' })
        ));
        
        router.registerProvider('coder', new MockProvider(
            { name: 'coder', capabilities: { tools: true, vision: false, streaming: false, coding: true }, cost: 'medium', latency: 'medium' },
            async () => ({ text: 'coder text' })
        ));
        
        router.registerProvider('reasoner', new MockProvider(
            { name: 'reasoner', capabilities: { tools: true, vision: false, streaming: false, reasoning: true }, cost: 'high', latency: 'high' },
            async () => ({ text: 'reasoner text' })
        ));
        
        router.setFallbackProviders(['base', 'coder', 'reasoner']);

        // Default request should use 'base' because it's first and lowest cost
        const res1 = await router.generate([], { routing: { priority: 'cost' } });
        assert.strictEqual(res1.text, 'base text');
        
        // Requiring coding should skip 'base' and pick 'coder'
        const res2 = await router.generate([], { routing: { intent: { coding: true } } });
        assert.strictEqual(res2.text, 'coder text');
        
        // Requiring reasoning should skip 'base' and 'coder', and pick 'reasoner'
        const res3 = await router.generate([], { routing: { intent: { reasoning: true } } });
        assert.strictEqual(res3.text, 'reasoner text');
        
        // fastResponse intent should prioritize latency (base is lowest)
        const res4 = await router.generate([], { routing: { intent: { fastResponse: true } } });
        assert.strictEqual(res4.text, 'base text');
    }

    // Test 9: Empty response detection
    {
        const router = new LLMRouter();
        
        router.registerProvider('empty-provider', new MockProvider(
            { name: 'empty-provider', capabilities: { tools: true, vision: false, streaming: false }, cost: 'low', latency: 'low' },
            async () => ({ text: '' }),
            async () => ({ text: '   \n  ' }) // continuation empty
        ));
        router.registerProvider('fallback-provider', new MockProvider(
            { name: 'fallback-provider', capabilities: { tools: true, vision: false, streaming: false }, cost: 'low', latency: 'low' },
            async () => ({ text: 'fallback success' }),
            async () => ({ text: 'continuation success' })
        ));
        
        router.setFallbackProviders(['empty-provider', 'fallback-provider']);

        // Test 9a: Empty generate
        router.setDefaultProvider('empty-provider');
        const resGenerate = await router.generate([]);
        assert.strictEqual(resGenerate.text, 'fallback success', 'Did not fallback from empty response');
        
        const emptyHealth = router.getProviderHealth('empty-provider');
        assert.strictEqual(emptyHealth?.status, 'error', 'Empty response provider should be marked as error');
        
        // Restore empty-provider health for next test
        emptyHealth.status = 'healthy';
        emptyHealth.failures = 0;
        emptyHealth.cooldownUntil = undefined;

        // Test 9b: Empty continuation
        // First request is to primary which owns the continuation ID
        // The router will try to continue on 'empty-provider' which returns empty, should fallback
        const resContinue = await router.continueWithToolResults('123', [], []);
        assert.strictEqual(resContinue.text, 'fallback success', 'Did not fallback from empty continuation');
        assert.strictEqual(router.getProviderHealth('empty-provider')?.status, 'error', 'Empty continuation should be marked as error');

        // Test 9c: Tool call is NOT empty
        const router2 = new LLMRouter();
        router2.registerProvider('tool', new MockProvider(
            { name: 'tool', capabilities: { tools: true, vision: false, streaming: false }, cost: 'low', latency: 'low' },
            async () => ({ text: '', toolCalls: [{ id: '1', name: 'myTool', arguments: {} }] })
        ));
        router2.setDefaultProvider('tool');
        const resTool = await router2.generate([]);
        assert.strictEqual(resTool.toolCalls?.length, 1, 'Tool calls should not be treated as empty');
        assert.strictEqual(router2.getProviderHealth('tool')?.status, 'healthy', 'Tool call provider should remain healthy');
    }

    console.log('All tests passed!');
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
