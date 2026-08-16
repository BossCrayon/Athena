import { locateItemTool } from '../src/tools/locate-item.js';

async function test() {
    const context = {
        cwd: 'c:\\\\Athena',
        environment: 'desktop'
    };
    try {
        console.log('Testing locate_item...');
        const res = await locateItemTool.execute({ name: 'bdaygift' }, context as any);
        console.log(res);
    } catch (e) {
        console.error('CRASH', e);
    }
}
test();
