/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { copyFixtureApp } from '../../utils/app.ts';
import type { TempApp } from '../../utils/app.ts';
import { freePort } from '../../utils/port.ts';
import { count, spawnCli, waitForOk } from '../../utils/spawn.ts';
import type { CliProcess } from '../../utils/spawn.ts';

const LISTENING = '"msg":"listening"';

/** What `node --watch` prints when it restarts the entry. */
const RESTARTING = 'Restarting \'';

describe('bin dev', () => {
    let app: TempApp;
    let cli: CliProcess | undefined;
    let port: number;

    beforeEach(async () => {
        app = await copyFixtureApp();
        port = await freePort();
    });

    afterEach(async () => {
        cli?.kill();
        cli = undefined;
        await app.remove();
    });

    it('dev runs a decorated entry and restarts on a change', async () => {
        await app.remove();
        app = await copyFixtureApp('decorated');
        cli = dev();
        await waitForOk(`http://127.0.0.1:${port}/readyz`);
        await cli.waitForOutput((output) => count(output, LISTENING) === 1);

        await untilRestart(cli, 2, (i) => appendFile(path.join(app.cwd, 'src/controller.ts'), `\n// changed ${i}\n`));
        await waitForOk(`http://127.0.0.1:${port}/readyz`);

        process.kill(-cli.child.pid!, 'SIGINT');
        expect((await cli.exited(15_000)).code).toBe(0);
    });

    function dev(): CliProcess {
        // a group of its own, signalled like a terminal signals its foreground group
        return spawnCli(['dev'], {
            cwd: app.cwd,
            env: { PORT: String(port), HOST: '127.0.0.1' },
            detached: true,
        });
    }

    it('dev restarts on a change and Ctrl-C stops it', async () => {
        cli = dev();
        await waitForOk(`http://127.0.0.1:${port}/readyz`);
        await cli.waitForOutput((output) => count(output, LISTENING) === 1);

        await untilRestart(cli, 2, (i) => appendFile(path.join(app.cwd, 'src/agents.ts'), `\n// changed ${i}\n`));
        await untilSettled(cli);
        await waitForOk(`http://127.0.0.1:${port}/readyz`);

        process.kill(-cli.child.pid!, 'SIGINT');
        expect(await cli.exited(15_000), `child stdout: ${cli.stdout()}\nchild stderr: ${cli.stderr()}`).toEqual({ code: 0, signal: null });
        expect(count(cli.stderr(), 'received SIGINT, stopping')).toBe(1);
        expect(cli.stderr()).not.toContain('forced exit');
    });

    it('dev restarts on a .env change', async () => {
        await writeFile(path.join(app.cwd, '.env'), 'CHAMVI_LOG_LEVEL=info\n');
        cli = dev();
        await cli.waitForOutput((output) => count(output, LISTENING) === 1);

        await untilRestart(cli, 2, (i) => writeFile(path.join(app.cwd, '.env'), `CHAMVI_LOG_LEVEL=info\nCHAMVI_DRAIN_TIMEOUT_MS=${1000 + i}\n`));

        process.kill(-cli.child.pid!, 'SIGINT');
        expect((await cli.exited(15_000)).code).toBe(0);
    });

    it('the dev group ends when the CLI is killed without its exit hook', async () => {
        cli = dev();
        await waitForOk(`http://127.0.0.1:${port}/readyz`);

        // SIGKILL: no exit event, nothing forwarded; only the closed stdin pipe tells the group
        process.kill(cli.child.pid!, 'SIGKILL');
        await cli.exited(5_000);

        await waitForDown(`http://127.0.0.1:${port}/readyz`, 10_000);
    });
});

/**
 * Changes a watched file until the app listened `times` times: a file
 * watcher under load (macOS FSEvents) may miss a single change.
 */
async function untilRestart(cli: CliProcess, times: number, change: (i: number) => Promise<void>, timeoutMs = 20_000): Promise<void> {
    const until = Date.now() + timeoutMs;

    for (let i = 0; count(cli.stdout() + cli.stderr(), LISTENING) < times; i++) {
        if (Date.now() > until) {
            throw new Error(`no restart within ${timeoutMs}ms:\n${cli.stdout()}${cli.stderr()}`);
        }

        await change(i);
        await cli.waitForOutput((output) => count(output, LISTENING) >= times, 2_000).catch(() => {});
    }
}

/**
 * Waits until every restart `node --watch` began (`Restarting '<entry>'`)
 * has listened, with no new one for `quietMs`: a change written while an
 * earlier restart ran restarts the app once more after untilRestart()
 * returned, and a signal during that restart reaches a child that has no
 * handlers yet (it dies silently, `node --watch` exits 0).
 */
async function untilSettled(cli: CliProcess, quietMs = 1_500, timeoutMs = 20_000): Promise<void> {
    const until = Date.now() + timeoutMs;
    const listened = () => count(cli.stdout() + cli.stderr(), LISTENING);
    const settled = (output: string) => count(output, LISTENING) === count(output, RESTARTING) + 1;

    for (;;) {
        await cli.waitForOutput(settled, Math.max(0, until - Date.now()));

        const seen = listened();

        await delay(quietMs);

        if (listened() === seen && settled(cli.stdout() + cli.stderr())) {
            return;
        }

        if (Date.now() > until) {
            throw new Error(`no settled restart within ${timeoutMs}ms:\n${cli.stdout()}${cli.stderr()}`);
        }
    }
}

async function waitForDown(url: string, timeoutMs: number): Promise<void> {
    const until = Date.now() + timeoutMs;

    for (;;) {
        try {
            await fetch(url);
        } catch {
            return;
        }

        if (Date.now() > until) {
            throw new Error(`${url} still answers ${timeoutMs}ms after the CLI died`);
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 200);
        });
    }
}
