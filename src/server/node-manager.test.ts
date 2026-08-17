import assert from 'assert';
import { NodeManager } from './node-manager.js';
import { EventEmitter } from 'events';

class MockWebSocket extends EventEmitter {
    public sentMessages: any[] = [];
    public closed: boolean = false;

    send(data: string) {
        this.sentMessages.push(JSON.parse(data));
    }

    close(code?: number, reason?: string) {
        this.closed = true;
        this.emit('close');
    }

    terminate() {
        this.close();
    }
}

async function runTests() {
    console.log('Running NodeManager K3 tests...');

    const VALID_TOKEN = 'secret-token-123';
    
    // Test 1: Valid authentication & capability matching
    const manager = new NodeManager(VALID_TOKEN);
    const ws1 = new MockWebSocket();
    manager.registerNode(ws1 as any, 'node1', 'laptop-1', 'laptop', VALID_TOKEN, ['test_tool']);
    
    assert.strictEqual(ws1.closed, false);
    
    let executionPromise = manager.executeToolOnNode('test_tool', {}, 'laptop');
    assert.strictEqual(ws1.sentMessages.length, 1);
    assert.strictEqual(ws1.sentMessages[0].type, 'execute_tool');

    // Resolve it so Node doesn't keep running
    ws1.emit('message', JSON.stringify({ type: 'tool_result', callId: ws1.sentMessages[0].callId, result: 'done' }));
    await executionPromise;

    // Test 2: Invalid authentication
    const ws2 = new MockWebSocket();
    manager.registerNode(ws2 as any, 'node2', 'laptop-2', 'laptop', 'wrong-token', ['test_tool']);
    assert.strictEqual(ws2.closed, true);
    assert.strictEqual(ws2.sentMessages.length, 1);
    assert.strictEqual(ws2.sentMessages[0].type, 'error');

    // Test 3: Unauthenticated node cannot execute tools
    try {
        await manager.executeToolOnNode('test_tool', {}, 'mobile');
        assert.fail('Should have thrown error about no authenticated nodes');
    } catch (e: any) {
        assert.ok(e.message.includes('No connected and authenticated nodes'));
    }

    // Test 4: NodeDisconnectError on close
    const ws3 = new MockWebSocket();
    manager.registerNode(ws3 as any, 'node3', 'laptop-3', 'laptop', VALID_TOKEN, ['test_tool_unique']);
    let hangingPromise = manager.executeToolOnNode('test_tool_unique', {}, 'laptop');
    ws3.close(); // Should trigger rejection
    try {
        await hangingPromise;
        assert.fail('Should have been rejected');
    } catch (e: any) {
        assert.strictEqual(e.name, 'NodeDisconnectError');
    }

    // Test 5: Duplicate connection overwrites
    const ws4 = new MockWebSocket();
    manager.registerNode(ws4 as any, 'dup_node', 'laptop-4', 'laptop', VALID_TOKEN, ['test_tool']);
    const ws5 = new MockWebSocket();
    manager.registerNode(ws5 as any, 'dup_node', 'laptop-4', 'laptop', VALID_TOKEN, ['test_tool']);
    assert.strictEqual(ws4.closed, true, 'Old connection should be closed');
    assert.strictEqual(ws5.closed, false, 'New connection should remain open');

    manager.stopHeartbeat();
    console.log('NodeManager K3 tests passed!');
    process.exit(0);
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
