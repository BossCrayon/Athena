import { PermissionManager } from './permission.js';

const manager = new PermissionManager();

const safe = manager.evaluate({
    toolName: 'get_system_info',
    permission: 'safe',
});

const confirm = manager.evaluate({
    toolName: 'read_file',
    permission: 'confirm',
});

const restricted = manager.evaluate({
    toolName: 'execute_command',
    permission: 'restricted',
});

console.log('Safe:', safe);
console.log('Confirm:', confirm);
console.log('Restricted:', restricted);