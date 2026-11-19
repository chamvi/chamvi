import { LockService, defineModelAgent } from '@chamvi/core';
import { MemoryLockRepository, MemoryRegistry } from '@chamvi/store-memory';
import { ControllableClock, createTestEngine, textModel } from '@chamvi/test-kit';

export async function leaseExpiry() {
    // #region clock
    const clock = new ControllableClock(new Date('2026-01-01T00:00:00Z'));
    const locks = new LockService({ repository: new MemoryLockRepository({ registry: new MemoryRegistry() }), clock });

    await locks.acquire('job', 'replica-a', 1_000); // a fencing token (a number)
    await locks.acquire('job', 'replica-b', 1_000); // undefined, held by replica-a

    clock.advance(1_000); // a lease expires at exactly T + ttlMs
    await locks.acquire('job', 'replica-b', 1_000); // a higher token
    // #endregion clock
}

export async function engineTest() {
    // #region engine
    const clock = new ControllableClock(new Date('2026-01-01T00:00:00Z'));
    const agent = defineModelAgent({
        name: 'greeter',
        // a scripted model: no provider, no key, no request
        model: textModel('Hello!'),
        instructions: 'Greet the user.',
    });
    // every service on memory repositories of one registry, on this clock
    const engine = createTestEngine({ agents: [agent], clock });

    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'greeter',
        trigger: 'test',
        channel: 'test',
        payload: {},
    });

    await engine.idle();

    const run = await engine.runService.findOneOrFail(runId); // run.status: 'completed', run.output: 'Hello!'

    // a second replica on the same services, e.g. to test recovery after a crash
    const replica = createTestEngine({ agents: [agent], replicaOf: engine });

    await engine.drain();
    // #endregion engine

    return { run, replica };
}
