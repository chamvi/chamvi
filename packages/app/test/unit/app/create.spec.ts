/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { cron } from '@chamvi/channel-cron';
import {
    InvalidAgentDefinitionError,
    createMemoryStore,
    defineModelAgent,
} from '@chamvi/core';
import type { IModule } from 'orkos';
import {
    describe,
    expect,
    it,
} from 'vitest';
import {
    AppToken,
    ModuleName,
    createApp,
    isApp,
} from '@chamvi/app';
import { textModel } from '@chamvi/test-kit';

const agent = defineModelAgent({
    name: 'sweep',
    model: textModel(),
    instructions: 'x',
    channels: [cron.on('*/5 * * * *')],
});

function named(name: string, calls: string[] = []): IModule {
    return {
        name,
        async setup() {
            calls.push(name);
        },
    };
}

describe('createApp', () => {
    it('is branded and side-effect free', () => {
        const calls: string[] = [];
        const read: PropertyKey[] = [];
        const env = new Proxy(process.env, {
            get(target, key) {
                read.push(key);

                return Reflect.get(target, key);
            },
        });
        const original = process.env;

        process.env = env;

        try {
            const app = createApp({ agents: [agent], modules: [named('a', calls)] });

            expect(isApp(app)).toBe(true);
            expect(app.agents).toEqual([agent]);
        } finally {
            process.env = original;
        }

        expect(read).toEqual([]);
        expect(calls).toEqual([]);
    });

    it('isApp is true across copies', () => {
        expect(isApp({ [Symbol.for('chamvi.app')]: true })).toBe(true);
        expect(isApp({ [Symbol.for('chamvi.app')]: 'yes' })).toBe(false);
        expect(isApp(undefined)).toBe(false);
        expect(isApp(null)).toBe(false);
        expect(isApp('app')).toBe(false);
    });

    it('throws for duplicate module names', () => {
        expect(() => createApp({ agents: [agent], modules: [named('a'), named('a')] }))
            .toThrow(new InvalidAgentDefinitionError('Two modules are named "a".'));
        expect(() => createApp({ agents: [agent], modules: [named(ModuleName.STORE), named(ModuleName.STORE)] }))
            .toThrow(InvalidAgentDefinitionError);
    });

    it('throws for a module that is no IModule instance', () => {
        expect(() => createApp({ agents: [agent], modules: [named('a'), 'config' as unknown as IModule] }))
            .toThrow(new InvalidAgentDefinitionError('modules[1] must be an IModule instance.'));
        expect(() => createApp({ agents: [agent], modules: [{ name: '', setup: async () => {} }] }))
            .toThrow(InvalidAgentDefinitionError);
        expect(() => createApp({ agents: [agent], modules: [{ name: 'x' } as unknown as IModule] }))
            .toThrow(InvalidAgentDefinitionError);
    });

    it('a module named chamvi:store replaces the built-in', async () => {
        const calls: string[] = [];
        const app = createApp({
            agents: [agent],
            modules: [{
                name: ModuleName.STORE,
                dependencies: [ModuleName.CONFIG],
                async setup(container) {
                    calls.push('fake store');
                    container.register(AppToken.STORE, { useValue: createMemoryStore() });
                },
            }],
        });

        // the built-in would connect to this unreachable database and fail
        await app.migrate({ env: { DATABASE_URL: 'postgres://u:p@127.0.0.1:1/db', CHAMVI_LOG_LEVEL: 'error' } });
        expect(calls).toEqual(['fake store']);
    });

    it('agents may be omitted', () => {
        expect(createApp({}).agents).toEqual([]);
        expect(createApp({ agents: [] }).agents).toEqual([]);
    });

    it('throws for agents that are no array', () => {
        expect(() => createApp({ agents: 'triage' } as never)).toThrow(InvalidAgentDefinitionError);
        expect(() => createApp(undefined as never)).toThrow(InvalidAgentDefinitionError);
    });

    it.each([[''], [42], [null]])('throws for the model %j', (model) => {
        expect(() => createApp({ model } as never)).toThrow(new InvalidAgentDefinitionError(
            'createApp\'s model must be a "<provider>/<model>" string or a LanguageModel object.',
        ));
    });

    it.each([['anthropic'], [[]], [null]])('throws for the providers %j', (providers) => {
        expect(() => createApp({ providers } as never)).toThrow(new InvalidAgentDefinitionError(
            'createApp\'s providers must be an object of provider configs by name.',
        ));
    });

    it('takes a string model and providers', () => {
        expect(() => createApp({
            model: 'local/m',
            providers: { local: { type: 'openai-compatible', baseURL: 'http://127.0.0.1:11434/v1' } },
        })).not.toThrow();
    });
});

describe('createApp package agents', () => {
    it('takes bare package specifiers beside agents passed in code, without touching the file system', () => {
        const app = createApp({ agents: [agent, '@acme/missing-agents', 'other/sub'] });

        expect(app.agents).toEqual([agent]);
        expect(app.packages).toEqual(['@acme/missing-agents', 'other/sub']);
        expect(Object.isFrozen(app.packages)).toBe(true);
    });

    it.each(['./agents/greeter', '/abs/pkg', 'file:///pkg', 'node:fs', 'Upper'])('refuses %s', (spec) => {
        expect(() => createApp({ agents: [spec] })).toThrow(InvalidAgentDefinitionError);
        expect(() => createApp({ agents: [spec] })).toThrow('createApp\'s agents[0] is no bare package specifier');
    });

    it('refuses a package listed twice', () => {
        expect(() => createApp({ agents: ['a', agent, 'a'] })).toThrow('createApp\'s agents lists the package a twice.');
    });

    it('has no packages without string entries', () => {
        expect(createApp({ agents: [agent] }).packages).toEqual([]);
    });
});
