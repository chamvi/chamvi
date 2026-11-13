/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomBytes } from 'node:crypto';
import {
    InvalidAgentDefinitionError,
    createKeyring,
    defineModelAgent,
} from '@chamvi/core';
import type { IConnectionHandle } from '@chamvi/core';
import { http } from '@chamvi/http';
import { ControllableClock, textModel } from '@chamvi/test-kit';
import type { IModule } from 'orkos';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    AppToken,
    ENV_ENCRYPTION_KEYS,
    configModule,
    engineModule,
    httpModule,
    staticTokensModule,
    storeModule,
} from '@chamvi/app';
import { TOKEN, TOKENS } from '../../utils/app.ts';
import { buildHarness } from '../../utils/harness.ts';
import type { Harness } from '../../utils/harness.ts';
import { createRecordingLogger } from '../../utils/logger.ts';
import { freePort } from '../../utils/port.ts';

const K1 = randomBytes(32).toString('base64');
const K2 = randomBytes(32).toString('base64');

let harnesses: Harness[] = [];

afterEach(async () => {
    await Promise.all(harnesses.map((h) => h.stop()));
    harnesses = [];
});

function keep(harness: Harness): Harness {
    harnesses.push(harness);

    return harness;
}

/** A module that needs the keyring in setup, as a connection provider's module does. */
function needsKeyring(seen: unknown[] = []): IModule {
    return {
        name: 'needs-keyring',
        async setup(container) {
            seen.push(container.resolve(AppToken.KEYRING));
        },
    };
}

describe('the keyring', () => {
    it('names the variable', () => {
        expect(ENV_ENCRYPTION_KEYS).toBe('CHAMVI_ENCRYPTION_KEYS');
    });

    it('is parsed from CHAMVI_ENCRYPTION_KEYS, the first key active', async () => {
        const seen: unknown[] = [];
        const harness = keep(buildHarness({
            env: { CHAMVI_ENCRYPTION_KEYS: `k2:${K2},k1:${K1}` },
            modules: [configModule(), needsKeyring(seen)],
        }));

        await harness.setup();

        const keyring = harness.container.resolve(AppToken.KEYRING);

        expect(keyring.activeId).toBe('k2');
        // one instance per app
        expect(seen).toEqual([keyring]);

        const { key, wrapped } = keyring.createDataKey('connection:bot');

        expect(createKeyring([{ id: 'k2', key: Buffer.from(K2, 'base64') }]).unwrap(wrapped, 'connection:bot')).toEqual(key);
    });

    it('fails only when a module resolves it without the variable', async () => {
        const harness = keep(buildHarness({ modules: [configModule()] }));

        // nothing needs it: an app without a connection module needs no new env
        await harness.setup();

        expect(() => harness.container.resolve(AppToken.KEYRING)).toThrow(InvalidAgentDefinitionError);
        expect(() => harness.container.resolve(AppToken.KEYRING)).toThrow(/CHAMVI_ENCRYPTION_KEYS is not set/);

        const failing = keep(buildHarness({ modules: [configModule(), needsKeyring()] }));

        await expect(failing.setup()).rejects.toThrow(/CHAMVI_ENCRYPTION_KEYS is not set/);
    });

    it('a check reports a malformed value without echoing it', async () => {
        const value = `k1:${K1.slice(0, 20)}`;
        const harness = keep(buildHarness({
            check: true,
            env: { CHAMVI_ENCRYPTION_KEYS: value },
            modules: [configModule(), needsKeyring()],
        }));
        const error = await harness.setup().then(() => undefined, (rejection: unknown) => rejection as Error);

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error!.message).toMatch(/^CHAMVI_ENCRYPTION_KEYS: /);
        expect(error!.message).not.toContain(K1.slice(0, 20));
        expect(JSON.stringify(error)).not.toContain(K1.slice(0, 20));
    });

    it('a keyring the harness provides wins over the env', async () => {
        const keyring = createKeyring([{ id: 'test', key: randomBytes(32) }]);
        const harness = keep(buildHarness({ keyring, modules: [configModule()] }));

        await harness.setup();

        expect(harness.container.resolve(AppToken.KEYRING)).toBe(keyring);
    });
});

describe('connection handles', () => {
    it('the http app serves the contributed handles', async () => {
        const port = await freePort();
        const clock = new ControllableClock(new Date('2026-11-06T00:00:00Z'));
        const handle: IConnectionHandle = {
            name: 'bot',
            type: 'whatsapp',
            status: () => 'connected',
            widgets: () => [],
            subscribe: () => () => undefined,
            actions: {},
        };
        const harness = keep(buildHarness({
            env: {
                HOST: '127.0.0.1',
                PORT: String(port),
                CHAMVI_TOKENS: TOKENS,
            },
            agents: [defineModelAgent({
                name: 'triage',
                model: textModel(),
                instructions: 'triage',
                channels: [http.on()],
            })],
            modules: [
                configModule({ clock, logger: createRecordingLogger(clock) }),
                storeModule(),
                staticTokensModule(),
                engineModule(),
                httpModule({ openapi: false }),
                {
                    name: 'handles',
                    async setup(container) {
                        container.registerMany(AppToken.CONNECTIONS, { useValue: handle });
                    },
                },
            ],
        }));

        await harness.setup();

        const response = await fetch(`http://127.0.0.1:${port}/connections`, { headers: { authorization: `Bearer ${TOKEN}` } });

        expect(await response.json()).toEqual({
            data: [{
                name: 'bot', 
                type: 'whatsapp', 
                status: 'connected', 
            }], 
        });
    });
});
