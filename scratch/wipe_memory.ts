import { CloudMemoryManager } from '../src/core/memory.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function clear() {
    const mem = new CloudMemoryManager();
    const supabase = (mem as any).supabase;
    if (supabase) {
        const { error } = await supabase.from('messages').delete().eq('session_id', 'athena-cli-user-session');
        if (error) console.error(error);
        else console.log('Memory wiped successfully.');
    } else {
        console.log('No supabase instance');
    }
}
clear();
clear();
