import { listDirectoryTool } from '../src/tools/list-directory.js';

async function test() {
    const context = {
        cwd: 'c:\\\\Athena',
        environment: 'desktop'
    };
    try {
        console.log('Testing list_directory...');
        const res = await listDirectoryTool.execute({ dir_path: 'C:\\\\BdayGift' }, context as any);
        console.log(res);
    } catch (e) {
        console.error('CRASH', e);
    }
}
test();
