/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// Runs on the built packages (spawned by test/unit/app/lazy.spec.ts): an app
// on the memory store, without a database module, checked, started on a
// loopback port, given a run and stopped. Prints every module URL the
// process resolved, as JSON.
import { registerHooks } from 'node:module';
import { createServer } from 'node:net';

const resolved = new Set();

registerHooks({
    resolve(specifier, context, nextResolve) {
        const result = nextResolve(specifier, context);

        resolved.add(result.url);

        return result;
    },
});

const {
    createApp,
    cron,
    defineSimpleAgent,
} = await import('@chamvi/app');

const echo = defineSimpleAgent({
    name: 'echo',
    channels: [cron.on('0 9 * * *')],
    run: async () => 'done',
});
const port = await new Promise((resolve) => {
    const server = createServer();

    server.listen(0, '127.0.0.1', () => {
        const { port: free } = server.address();

        server.close(() => resolve(free));
    });
});
const env = {
    HOST: '127.0.0.1',
    PORT: String(port),
    TOKENS: JSON.stringify([{
        value: 'x'.repeat(32),
        id: 'ops',
        permissions: '*',
    }]),
    LOG_LEVEL: 'error',
    DRAIN_TIMEOUT_MS: '1000',
};

const checked = await createApp({ agents: [echo] }).check({ env });
const app = createApp({ agents: [echo] });

await app.start({ env });

const job = await createApp({ agents: [echo] }).runJob({ agent: 'echo', env });

await app.stop();

process.stdout.write(`${JSON.stringify({
    issues: checked.issues,
    job: job.status,
    resolved: [...resolved],
})}\n`);
