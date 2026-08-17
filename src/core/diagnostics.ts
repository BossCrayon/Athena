import type { AutonomousRuntime } from './autonomous-runtime.js';
import type { TaskQueue } from './task-queue.js';
import type { LLMRouter } from '../llm/router.js';
import type { NodeManager } from '../server/node-manager.js';

export class DiagnosticHandler {
    constructor(
        private readonly runtime: AutonomousRuntime,
        private readonly queue: TaskQueue,
        private readonly router: LLMRouter,
        private readonly nodeManager: NodeManager
    ) {}

    public handleCommand(command: string): string | null {
        const cmd = command.trim().toLowerCase();
        
        switch (cmd) {
            case '/status':
                return this.getStatus();
            case '/nodes':
                return this.getNodes();
            case '/tasks':
                return this.getTasks();
            case '/providers':
                return this.getProviders();
            default:
                return null;
        }
    }

    private getStatus(): string {
        return `ATHENA Status
-------------
Runtime: ${this.runtime.getIsRunning() ? 'running' : 'stopped'}
Worker: ${this.runtime.workerId}
Active tasks: ${this.runtime.getActiveTaskCount()}
Queued tasks: ${this.queue.listTasks().filter(t => t.status === 'queued').length}
Shutting down: ${this.runtime.isShuttingDown()}
`;
    }

    private getNodes(): string {
        // We use an exposed method from NodeManager or we can add one if it doesn't exist
        const nodes = (this.nodeManager as any).nodes; // Map
        if (!nodes || nodes.size === 0) {
            return `Nodes\n-----\nNo nodes connected.`;
        }

        let output = `Nodes\n-----\n`;
        for (const [id, node] of nodes.entries()) {
            output += `${node.name} (${node.type})   ${node.status}\n`;
        }
        return output;
    }

    private getTasks(): string {
        const tasks = this.queue.listTasks();
        if (tasks.length === 0) {
            return `Tasks\n-----\nNo active tasks.`;
        }
        
        let output = `Tasks\n-----\n`;
        for (const t of tasks.slice(0, 10)) { // limit to 10
            output += `ID: ${t.id} | Status: ${t.status} | Priority: ${t.priority} | Retries: ${t.retryCount || 0} | Worker: ${t.claimedBy || 'none'}\n`;
        }
        if (tasks.length > 10) {
            output += `... and ${tasks.length - 10} more.\n`;
        }
        return output;
    }

    private getProviders(): string {
        const healthState = (this.router as any).healthState;
        if (!healthState || healthState.size === 0) {
            return `Providers\n---------\nNo providers configured.`;
        }

        let output = `Providers\n---------\n`;
        for (const [name, state] of healthState.entries()) {
            output += `${name.padEnd(20)} ${state.status} (Failures: ${state.failures})\n`;
        }
        return output;
    }
}
