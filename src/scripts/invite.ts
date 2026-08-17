import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Error: Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    const roleArg = process.argv[2];
    let role = 'user';
    if (roleArg && roleArg.toLowerCase() === 'admin') {
        role = 'admin';
    } else if (roleArg && roleArg.toLowerCase() !== 'user') {
        console.error('Usage: npm run invite [admin|user]');
        process.exit(1);
    }

    // Generate a 128-character secure random hex string (64 bytes = 128 hex chars)
    const inviteHash = crypto.randomBytes(64).toString('hex');

    const { error } = await supabase
        .from('auth_invites')
        .insert({ hash: inviteHash, role: role });

    if (error) {
        console.error('Failed to create invite:', error.message);
        process.exit(1);
    }

    console.log('\n=============================================================');
    console.log(`✅ Successfully generated a single-use ${role.toUpperCase()} invite code!`);
    console.log('=============================================================\n');
    console.log(inviteHash);
    console.log('\nPaste this 128-character code into the Athena Mobile App.');
    console.log('This code can only be used ONCE. Do not share it publicly.\n');
    process.exit(0);
}

main();
