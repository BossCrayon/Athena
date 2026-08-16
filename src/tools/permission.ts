import type { ToolPermission } from './types.js';

export type PermissionDecision =
    | 'allow'
    | 'confirm'
    | 'deny';

export interface PermissionRequest {
    toolName: string;
    permission: ToolPermission;
}

export interface PermissionResult {
    decision: PermissionDecision;
    reason: string;
}

export class PermissionManager {
    evaluate(request: PermissionRequest): PermissionResult {
        switch (request.permission) {
            case 'safe':
                return {
                    decision: 'allow',
                    reason: 'This tool is classified as safe.',
                };

            case 'confirm':
                return {
                    decision: 'confirm',
                    reason: 'This tool requires user confirmation.',
                };

            case 'restricted':
                return {
                    decision: 'deny',
                    reason: 'This tool is restricted.',
                };

            default:
                return {
                    decision: 'deny',
                    reason: 'Unknown permission level.',
                };
        }
    }
}