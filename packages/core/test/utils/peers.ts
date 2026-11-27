/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { 
    IPeerResolver, 
    IPeerTransport, 
    PeerRequestOptions, 
    PeerSettings, 
} from '@chamvi/core';
import type { Invoker, PeerRunView, PeerStartInput } from '@chamvi/core-kit';

const REJECT = Symbol('reject');

/** A scripted rejection (see rejectWith()). */
export type PeerRejection = { [REJECT]: unknown };

/** What a method returns, per call: a value, a rejection, or a function of the call. */
export type PeerScript<A, T> = T | PeerRejection | ((args: A) => T | Promise<T>);

type Methods = {
    start: {
        args: {
            peer: string;
            input: PeerStartInput;
            opts: PeerRequestOptions
        };
        result: { runId: string }
    };
    read: {
        args: {
            peer: string;
            runId: string;
            opts: PeerRequestOptions
        };
        result: PeerRunView
    };
    cancel: {
        args: {
            peer: string;
            runId: string;
            opts: PeerRequestOptions
        };
        result: undefined
    };
    wake: {
        args: {
            peer: string;
            runId: string;
            opts: PeerRequestOptions
        };
        result: undefined
    };
};

export type PeerMethod = keyof Methods;

export type FakePeers = {
    resolver: IPeerResolver;
    /** Every call, per method, in order (the peer name included). */
    calls: { [M in PeerMethod]: Methods[M]['args'][] };
    /**
     * Queues the results of the next calls of `method`, used once each in
     * order; once the queue is empty the method's default answers.
     */
    script<M extends PeerMethod>(method: M, ...results: PeerScript<Methods[M]['args'], Methods[M]['result']>[]): void;
    /** The settings `resolver.settings(name)` answers (the defaults merged under them); change them any time. */
    settings: Record<string, Partial<PeerSettings>>;
    /** What `resolver.recognize(invoker)` answers; change it any time. */
    recognize: (invoker: Invoker | undefined) => string | undefined;
};

/** A scripted rejection with `error`; `retryAfterMs` sets that property on it. */
export function rejectWith(error: unknown, options: { retryAfterMs?: number } = {}): PeerRejection {
    if (options.retryAfterMs !== undefined) {
        Object.assign(error as object, { retryAfterMs: options.retryAfterMs });
    }

    return { [REJECT]: error };
}

/** A running remote run's view: the default answer of `read`. */
export function peerRunView(runId: string, patch: Partial<PeerRunView> = {}): PeerRunView {
    return {
        id: runId,
        status: 'running',
        tainted: false,
        usage: { inputTokens: 0, outputTokens: 0 },
        ...patch,
    };
}

const DEFAULT_SETTINGS: PeerSettings = {
    pollMs: 60_000,
    untrusted: false,
    outgoing: true,
};

/**
 * A scripted IPeerResolver over one fake IPeerTransport per peer, all
 * recording into `calls`. `peers` names the configured peers and their
 * settings. Defaults: `start` answers `{ runId: 'remote-<n>' }` (n counts
 * starts from 1), `read` a running view, `cancel` and `wake` nothing.
 */
export function fakePeers(
    peers: Record<string, Partial<PeerSettings>> = { dev: {} },
    options: { approvalUrl?: IPeerResolver['approvalUrl'] } = {},
): FakePeers {
    const queues: { [M in PeerMethod]: PeerScript<Methods[M]['args'], Methods[M]['result']>[] } = {
        start: [],
        read: [],
        cancel: [],
        wake: [],
    };
    const calls: FakePeers['calls'] = {
        start: [],
        read: [],
        cancel: [],
        wake: [],
    };
    const defaults: { [M in PeerMethod]: (args: Methods[M]['args']) => Methods[M]['result'] } = {
        start: () => ({ runId: `remote-${calls.start.length}` }),
        read: (args) => peerRunView(args.runId),
        cancel: () => undefined,
        wake: () => undefined,
    };

    async function answer<M extends PeerMethod>(method: M, args: Methods[M]['args']): Promise<Methods[M]['result']> {
        (calls[method] as Methods[M]['args'][]).push(args);

        const next = (queues[method] as PeerScript<Methods[M]['args'], Methods[M]['result']>[]).shift();

        if (next === undefined) {
            return defaults[method](args);
        }

        if (typeof next === 'object' && next !== null && REJECT in next) {
            throw (next as PeerRejection)[REJECT];
        }

        if (typeof next === 'function') {
            return (next as (a: Methods[M]['args']) => Methods[M]['result'] | Promise<Methods[M]['result']>)(args);
        }

        return structuredClone(next as Methods[M]['result']);
    }

    function transport(peer: string): IPeerTransport {
        return {
            start: (input, opts) => answer('start', {
                peer,
                input: structuredClone(input),
                opts,
            }),
            read: (runId, opts) => answer('read', {
                peer,
                runId,
                opts,
            }),
            cancel: async (runId, opts) => {
                await answer('cancel', {
                    peer,
                    runId,
                    opts,
                });
            },
            wake: async (runId, opts) => {
                await answer('wake', {
                    peer,
                    runId,
                    opts,
                });
            },
        };
    }

    const fake: FakePeers = {
        calls,
        settings: { ...peers },
        recognize: () => undefined,
        script(method, ...results) {
            (queues[method] as unknown[]).push(...results);
        },
        resolver: {
            names: () => Object.keys(fake.settings),
            has: (name) => Object.hasOwn(fake.settings, name),
            settings: (name) => ({ ...DEFAULT_SETTINGS, ...fake.settings[name] }),
            transport,
            recognize: (invoker) => fake.recognize(invoker),
            ...(options.approvalUrl ? { approvalUrl: options.approvalUrl } : {}),
        },
    };

    return fake;
}
