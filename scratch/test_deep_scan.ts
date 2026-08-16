import { systemControlTool } from '../src/tools/system-control.js';

async function test() {
    const context = {
        cwd: 'c:\\\\Athena',
        environment: 'desktop'
    };
    try {
        console.log('Testing deep_security_scan...');
        const res = await systemControlTool.execute({ action: 'deep_security_scan' }, context as any);
        console.log(res);
    } catch (e) {
        console.error('CRASH', e);
    }
}
test();
