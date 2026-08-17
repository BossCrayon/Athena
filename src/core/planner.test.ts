import { test, mock } from 'node:test';
import assert from 'assert';
import { Planner } from './planner.js';
import type { Task } from './task.js';
import type { LLMRouter } from '../llm/router.js';
import type { ContextBuilder } from './context-builder.js';

test('Planner generates valid plan', async () => {
    const mockRouter = {
        generate: mock.fn(async () => {
            return {
                text: JSON.stringify({
                    goal: 'Test goal',
                    complexity: 'simple',
                    subgoals: [
                        { id: 'sg1', description: 'Step 1', dependencies: [] }
                    ]
                })
            };
        })
    } as unknown as LLMRouter;

    const mockContextBuilder = {
        buildContext: mock.fn(async () => 'mock context')
    } as unknown as ContextBuilder;

    const planner = new Planner(mockRouter, mockContextBuilder);
    const task: Task = { id: 't1', request: 'Do something', status: 'planning', priority: 0, retryCount: 0, isCancelled: false, steps: [], createdAt: 0, updatedAt: 0 };

    const plan = await planner.createPlan(task);
    assert.strictEqual(plan.goal, 'Test goal');
    assert.strictEqual(plan.subgoals.length, 1);
    assert.strictEqual(plan.subgoals[0].status, 'pending');
});

test('Planner handles clarification', async () => {
    const mockRouter = {
        generate: mock.fn(async () => {
            return {
                text: JSON.stringify({
                    goal: 'Test goal',
                    complexity: 'simple',
                    clarificationRequired: 'Which server?',
                    subgoals: []
                })
            };
        })
    } as unknown as LLMRouter;

    const mockContextBuilder = {
        buildContext: mock.fn(async () => '')
    } as unknown as ContextBuilder;

    const planner = new Planner(mockRouter, mockContextBuilder);
    const task: Task = { id: 't1', request: 'Restart the server', status: 'planning', priority: 0, retryCount: 0, isCancelled: false, steps: [], createdAt: 0, updatedAt: 0 };

    const plan = await planner.createPlan(task);
    assert.strictEqual(plan.clarificationRequired, 'Which server?');
});
