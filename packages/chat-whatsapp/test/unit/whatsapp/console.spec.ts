/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createRequire } from 'node:module';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import type { MockInstance } from 'vitest';
import { guardConsole } from '../../../src/whatsapp/console.ts';

const METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;

type Method = typeof METHODS[number];

type SessionEntry = {
    indexInfo: {
        baseKey: Buffer; 
        baseKeyType: number; 
        closed: number 
    };
    currentRatchet: { rootKey: string; ephemeralKeyPair: { privKey: string } };
};

type SessionRecordInstance = {
    setSession(session: SessionEntry): void;
    openSession(session: SessionEntry): void;
    closeSession(session: SessionEntry): void;
};

// libsignal as baileys loads it: resolved from the baileys package, not a copy of its code
const baileysRequire = createRequire(createRequire(import.meta.url).resolve('baileys'));
const { SessionRecord } = baileysRequire('libsignal') as { SessionRecord: new () => SessionRecordInstance };

const ROOT_KEY = 'SENTINEL-ROOT-KEY';
const PRIVATE_KEY = 'SENTINEL-PRIVATE-KEY';

function fakeSession(): SessionEntry {
    return {
        indexInfo: {
            baseKey: Buffer.from('base-key'), 
            baseKeyType: 2, 
            closed: -1, 
        },
        currentRatchet: { rootKey: ROOT_KEY, ephemeralKeyPair: { privKey: PRIVATE_KEY } },
    };
}

describe('guardConsole', () => {
    const originals = {} as Record<Method, Console[Method]>;
    const spies = {} as Record<Method, MockInstance>;
    const releases: (() => void)[] = [];

    const install = (): () => void => {
        const release = guardConsole();

        releases.push(release);

        return release;
    };

    beforeEach(() => {
        for (const method of METHODS) {
            spies[method] = vi.spyOn(console, method).mockImplementation(() => undefined);
            originals[method] = console[method];
        }
    });

    afterEach(() => {
        for (const release of releases.splice(0)) {
            release();
        }

        vi.restoreAllMocks();
    });

    it('drops the session logs of the real libsignal code while installed', () => {
        install();

        const record = new SessionRecord();
        const session = fakeSession();

        record.setSession(session);
        record.closeSession(session);
        record.closeSession(session);
        record.openSession(session);
        record.openSession(session);

        for (const method of METHODS) {
            expect(spies[method]).not.toHaveBeenCalled();
        }
    });

    it.each([0, 1])('drops them when the application sets Error.stackTraceLimit to %d, and keeps that limit', (limit) => {
        const before = Error.stackTraceLimit;

        Error.stackTraceLimit = limit;

        try {
            install();

            const record = new SessionRecord();
            const session = fakeSession();

            record.setSession(session);
            record.closeSession(session);
            record.openSession(session);
            console.info('application line');

            expect(spies.info).toHaveBeenCalledTimes(1);
            expect(spies.info).toHaveBeenCalledWith('application line');
            expect(spies.warn).not.toHaveBeenCalled();
            expect(Error.stackTraceLimit).toBe(limit);
        } finally {
            Error.stackTraceLimit = before;
        }
    });

    it('lets the libsignal session logs through without the guard (the leak it closes)', () => {
        const record = new SessionRecord();
        const session = fakeSession();

        record.setSession(session);
        record.closeSession(session);

        expect(spies.info).toHaveBeenCalledWith('Closing session:', session);
    });

    it('passes an application call through unchanged', () => {
        install();

        const payload = { id: 1 };

        console.info('application line', payload);
        console.error('application error');

        expect(spies.info).toHaveBeenCalledTimes(1);
        expect(spies.info).toHaveBeenCalledWith('application line', payload);
        expect(spies.info.mock.contexts[0]).toBe(console);
        expect(spies.error).toHaveBeenCalledWith('application error');
    });

    it('restores the original methods after the last release', () => {
        const release = install();

        for (const method of METHODS) {
            expect(console[method]).not.toBe(originals[method]);
        }

        release();

        for (const method of METHODS) {
            expect(console[method]).toBe(originals[method]);
        }
    });

    it('keeps the guard until the last of nested installs is released', () => {
        const first = install();
        const second = install();

        first();
        // a second release of the same install changes nothing
        first();

        const record = new SessionRecord();
        const session = fakeSession();

        record.setSession(session);
        record.closeSession(session);

        expect(spies.info).not.toHaveBeenCalled();
        expect(console.info).not.toBe(originals.info);

        second();

        expect(console.info).toBe(originals.info);
    });
});
