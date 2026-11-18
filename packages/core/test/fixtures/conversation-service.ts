/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import {
    CONVERSATION_NOTES_MAX,
    CONVERSATION_NOTE_KEY_MAX_LENGTH,
    CONVERSATION_NOTE_TEXT_MAX_BYTES,
    DEFAULT_CONVERSATION_LIMITS,
    RunNotFoundError,
} from '@chamvi/core';
import type { IConversationService, ResolvedConversationLimits } from '@chamvi/core';
import { RunStatus } from '@chamvi/store';
import type {
    ConversationIdentity,
    ConversationItem,
    ConversationNoteOperation,
    ConversationScope,
    IConversationRepository,
    Run,
} from '@chamvi/store';
import { ControllableClock } from '../utils/clock.ts';

export const LIMITS: ResolvedConversationLimits = { ...DEFAULT_CONVERSATION_LIMITS };

const STATE = { code: 'invalid_run_state' };
const INVALID = { code: 'validation_error' };
const NOT_FOUND = { code: 'repository_not_found' };

/** A uuid made of a short label, so cases name runs readably and a database accepts them. */
export function uuidOf(label: string): string {
    const hex = Buffer.concat([Buffer.from(label, 'utf8'), Buffer.alloc(16)]).subarray(0, 16).toString('hex');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A queued run of this id (or as `overrides` say): what a turn of the run references. */
export function makeRun(id: string, overrides: Partial<Run> = {}): Run {
    const at = new Date('2026-01-01T00:00:00.000Z');

    return {
        id,
        agent: 'helper',
        status: RunStatus.QUEUED,
        trigger: {
            id,
            agent: 'helper',
            trigger: 'message',
            channel: 'chat',
            payload: {},
            receivedAt: at,
        },
        usage: { inputTokens: 0, outputTokens: 0 },
        createdAt: at,
        updatedAt: at,
        ...overrides,
    };
}

export function makeIdentity(chat = 'chat-1', overrides: Partial<ConversationIdentity> = {}): ConversationIdentity {
    return {
        agent: 'helper',
        channel: 'openclaw',
        account: 'main',
        chat,
        audience: 'direct',
        ...overrides,
    };
}

export function makeEmit(clock: ControllableClock, runId: string, n: number, text: string): ConversationItem {
    return {
        id: `assistant:${runId}:${n}`,
        role: 'assistant',
        text,
        runId,
        createdAt: new Date(clock.now()),
        status: 'pending',
        effectKey: `${runId}:emit:${n}`,
        target: { channel: 'openclaw', address: 'chat-1' },
    };
}

export function makeSet(
    runId: string,
    key: string,
    text: string,
    options: {
        toolCallId?: string;
        stepIndex?: number;
        expiresAt?: Date;
        inputHash?: string;
    } = {},
): Extract<ConversationNoteOperation, { kind: 'set' }> {
    const toolCallId = options.toolCallId ?? `call-${key}`;
    const stepIndex = options.stepIndex ?? 0;

    return {
        id: `${runId}:${stepIndex}:${toolCallId}:0`,
        inputHash: options.inputHash ?? `hash:set:${key}:${text}`,
        source: {
            runId,
            toolCallId,
            stepIndex,
        },
        kind: 'set',
        key,
        text,
        ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
    };
}

export function makeRemove(runId: string, key: string, toolCallId = `call-rm-${key}`): ConversationNoteOperation {
    return {
        id: `${runId}:0:${toolCallId}:0`,
        inputHash: `hash:remove:${key}`,
        source: {
            runId,
            toolCallId,
            stepIndex: 0,
        },
        kind: 'remove',
        key,
    };
}

/** What a driver hands the cases: the service on its storage and a way to store a run (the turns reference runs). */
export type ConversationServiceFixture = {
    service: IConversationService;
    /** Store a run of this id, if absent. */
    seedRun(id: string): Promise<void>;
    /** The repository the service is on: a case holds a conversation row's lock through it. */
    repository?: IConversationRepository;
    /** Resolves once a statement of another caller waits for a row lock a transaction holds. */
    untilBlocked?(): Promise<void>;
};

export type ConversationServiceCasesInput = {
    name: string;
    /** A fresh, empty storage per case on the given clock. */
    create(clock: ControllableClock): Promise<ConversationServiceFixture>;
};

/**
 * The service as the engine uses it, with the run of a turn stored first
 * (as the engine creates a run before its turn): `beginTurn` stores the run
 * of a well-formed id, a malformed one is left to the service to refuse.
 */
export function turnsOf(fixture: ConversationServiceFixture) {
    const { service, seedRun } = fixture;
    const wellFormed = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

    return Object.assign(Object.create(service) as IConversationService, {
        async beginTurn(scope: ConversationScope, runId: string, text: string, limits: ResolvedConversationLimits) {
            if (typeof runId === 'string' && wellFormed.test(runId)) {
                await seedRun(runId);
            }

            return service.beginTurn(scope, runId, text, limits);
        },
    });
}

/** One whole turn: begin, the given replies emitted and confirmed, end. */
export async function completeTurn(
    store: IConversationService,
    clock: ControllableClock,
    scope: ConversationScope,
    runId: string,
    text: string,
    replies: string[] = [],
    limits: ResolvedConversationLimits = LIMITS,
): Promise<void> {
    const begun = await store.beginTurn(scope, runId, text, limits);

    if (begun.kind !== 'ready') {
        throw new TypeError(`turn did not begin (${begun.kind})`);
    }

    const ids: string[] = [];

    for (const [n, reply] of replies.entries()) {
        const item = makeEmit(clock, runId, n, reply);

        await store.prepareEmit(scope, item);
        ids.push(item.id);
    }

    await store.endTurn(scope, runId, ids);
}

/**
 * Every rule of `ConversationService`, run on a driver: refusals with
 * today's error classes and messages, turns, emits, notes, the recall,
 * reset, delete and retention.
 */
export function describeConversationServiceCases(input: ConversationServiceCasesInput): void {
    const setup = async () => {
        const clock = new ControllableClock(new Date('2026-01-01T00:00:00.000Z'));
        const fixture = await input.create(clock);
        const store = turnsOf(fixture);
        const identity = makeIdentity();
        const scope = await store.resolve(identity);

        return {
            clock,
            store,
            identity,
            scope,
            fixture,
        };
    };

    describe(`conversation service: ${input.name}`, () => {
        it('OrFail queries reject absent identities, notes and empty pages without creating them', async () => {
            const {
                store,
                identity,
                scope,
            } = await setup();

            await expect(store.findOneOrFail(makeIdentity('missing'))).rejects.toMatchObject(NOT_FOUND);
            expect(await store.findOne(makeIdentity('missing'))).toBeUndefined();
            expect(await store.findOneOrFail(identity)).toEqual(scope);
            await expect(store.findOneNoteOrFail(scope, 'missing')).rejects.toMatchObject(NOT_FOUND);
            await expect(store.findItemsOrFail(scope, { limit: 10, offset: 0 })).rejects.toMatchObject(NOT_FOUND);
            await expect(store.findNotesOrFail(scope, { limit: 10, offset: 0 })).rejects.toMatchObject(NOT_FOUND);
            await store.beginTurn(scope, uuidOf('run-a'), 'hello', LIMITS);
            await store.applyNote(scope, makeSet(uuidOf('run-a'), 'name', 'Ada'));
            await expect(store.findItemsOrFail(scope, { limit: 10, offset: 1 })).rejects.toMatchObject(NOT_FOUND);
            await expect(store.findItemsOrFail(scope, { limit: 0, offset: 0 })).rejects.toMatchObject(INVALID);
            await expect(store.findNotesOrFail(scope, { limit: 10, offset: 1 })).rejects.toMatchObject(NOT_FOUND);
            expect(await store.findNotes(scope, { limit: 10, offset: 1 })).toEqual({ data: [], total: 1 });
            await expect(store.findItemsOrFail(scope, { limit: -1, offset: 0 })).rejects.toMatchObject(INVALID);
        });

        it('OrFail queries preserve copies, expiry and generation fences', async () => {
            const {
                store,
                identity,
                scope,
                clock,
            } = await setup();

            await store.beginTurn(scope, uuidOf('run-a'), 'hello', LIMITS);
            await store.applyNote(scope, makeSet(uuidOf('run-a'), 'name', 'Ada', { expiresAt: new Date(clock.now() + 1_000) }));

            const found = await store.findOneOrFail(identity);

            found.identity.chat = 'changed';
            expect(await store.findOneOrFail(identity)).toEqual(scope);

            const note = await store.findOneNoteOrFail(scope, 'name');

            expect(note.text).toBe('Ada');
            note.text = 'changed';
            expect((await store.findOneNoteOrFail(scope, 'name')).text).toBe('Ada');
            expect((await store.findItemsOrFail(scope, { limit: 10, offset: 0 })).data.map((item) => item.text)).toEqual(['hello']);
            expect((await store.findNotesOrFail(scope, { limit: 10, offset: 0 })).data.map((item) => item.text)).toEqual(['Ada']);
            clock.advance(1_000);
            await expect(store.findOneNoteOrFail(scope, 'name')).rejects.toMatchObject(NOT_FOUND);
            await store.endTurn(scope, uuidOf('run-a'), []);

            const next = await store.reset(identity, { keepNotes: false });

            await expect(store.findItemsOrFail(next, { limit: 10, offset: 0 })).rejects.toMatchObject(NOT_FOUND);
            await expect(store.findNotesOrFail(scope, { limit: 10, offset: 0 })).rejects.toMatchObject(NOT_FOUND);
        });

        it('resolve creates generation 0 once and findOne reads without creating', async () => {
            const {
                store,
                identity,
                scope,
            } = await setup();

            expect(scope.generation).toBe(0);
            expect(scope.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
            expect(scope.identity).toEqual(identity);
            expect(await store.resolve({ ...identity })).toEqual(scope);
            expect(await store.findOne(identity)).toEqual(scope);
            expect(await store.findOne(makeIdentity('unknown'))).toBeUndefined();
            expect(await store.findOne(makeIdentity('unknown'))).toBeUndefined();
            await expect(store.resolve(makeIdentity(''))).rejects.toMatchObject(INVALID);
        });

        it('resolve returns one scope for one identity, also when callers race on a new identity', async () => {
            const { store } = await setup();
            const identity = makeIdentity('raced');
            const scopes = await Promise.all(Array.from({ length: 6 }, () => store.resolve({ ...identity })));

            expect(new Set(scopes.map((scope) => scope.id)).size).toBe(1);
            expect(scopes.every((scope) => scope.generation === 0)).toBe(true);
        });

        it('activeRun is read-only, generation fenced and cleared by endTurn', async () => {
            const {
                store,
                scope,
                identity,
            } = await setup();

            expect(await store.activeRun(scope)).toBeUndefined();
            await store.beginTurn(scope, uuidOf('run'), 'hello', LIMITS);
            expect(await store.activeRun(scope)).toBe(uuidOf('run'));
            await store.endTurn(scope, uuidOf('run'), []);
            expect(await store.activeRun(scope)).toBeUndefined();
            await store.reset(identity, { keepNotes: false });
            expect(await store.activeRun(scope)).toBeUndefined();
        });

        it('rejects unsupported Unicode in stored opaque strings without changing state', async () => {
            const {
                store,
                scope,
                clock,
            } = await setup();

            await expect(store.beginTurn(scope, 'run\ud800', 'hello', LIMITS)).rejects.toMatchObject(INVALID);
            await store.beginTurn(scope, uuidOf('run'), 'hello', LIMITS);

            const item = makeEmit(clock, uuidOf('run'), 0, 'reply');

            for (const changed of [
                { ...item, id: 'bad\ud800' },
                { ...item, effectKey: 'bad\ud800' },
                { ...item, target: { channel: 'bad\ud800', address: 'chat' } },
                { ...item, target: { channel: 'chat', address: 'bad\0' } },
                { ...item, target: { channel: 'chat', address: 'bad\ud800' } },
            ]) {
                await expect(store.prepareEmit(scope, changed)).rejects.toMatchObject(INVALID);
            }

            const operation = makeSet(uuidOf('run'), 'note', 'value');

            for (const changed of [
                { ...operation, id: 'bad\ud800' },
                { ...operation, inputHash: 'bad\ud800' },
                { ...operation, source: { ...operation.source, toolCallId: 'bad\ud800' } },
            ]) {
                await expect(store.applyNote(scope, changed)).rejects.toMatchObject(INVALID);
            }

            expect((await store.findItems(scope, { limit: 100, offset: 0 })).total).toBe(1);
            expect((await store.findNotes(scope, { limit: 100, offset: 0 })).total).toBe(0);
        });

        it('refuses a malformed scope, run id or text before any state change; a scope never resolved is stale', async () => {
            const { store, scope } = await setup();

            await expect(store.beginTurn({ ...scope, id: 'nope' }, uuidOf('run-a'), 'hi', LIMITS)).rejects.toMatchObject(INVALID);
            await expect(store.beginTurn({ ...scope, generation: -1 }, uuidOf('run-a'), 'hi', LIMITS)).rejects.toMatchObject(INVALID);
            await expect(store.beginTurn(scope, '', 'hi', LIMITS)).rejects.toMatchObject(INVALID);
            await expect(store.beginTurn(scope, uuidOf('run-a'), '', LIMITS)).rejects.toMatchObject(INVALID);
            expect((await store.findItems(scope, { limit: 10, offset: 0 })).total).toBe(0);
            expect(await store.beginTurn({ ...scope, id: 'f'.repeat(64) }, uuidOf('run-a'), 'hi', LIMITS)).toEqual({ kind: 'stale' });
            expect(await store.beginTurn({ ...scope, id: uuidOf('elsewhere') }, uuidOf('run-a'), 'hi', LIMITS)).toEqual({ kind: 'stale' });
            await expect(store.applyNote(scope, { ...makeSet(uuidOf('run-a'), 'k', 'v'), kind: 'other' } as never)).rejects.toMatchObject(STATE);
            expect(await store.pendingEmits({ ...scope, id: 'f'.repeat(64) }, uuidOf('run-a'))).toEqual([]);
            expect(await store.findItems({ ...scope, id: 'f'.repeat(64) }, { limit: 10, offset: 0 })).toEqual({ data: [], total: 0 });
            expect(await store.activeRun({ ...scope, id: 'f'.repeat(64) })).toBeUndefined();
        });

        it('a turn of a run that does not exist is RunNotFoundError, and nothing is stored', async () => {
            const { fixture, scope } = await setup();

            await expect(fixture.service.beginTurn(scope, uuidOf('missing'), 'hello', LIMITS)).rejects.toBeInstanceOf(RunNotFoundError);
            await expect(fixture.service.beginTurn(scope, 'not-a-run', 'hello', LIMITS)).rejects.toBeInstanceOf(RunNotFoundError);
            expect(await fixture.service.activeRun(scope)).toBeUndefined();
            expect((await fixture.service.findItems(scope, { limit: 10, offset: 0 })).total).toBe(0);
        });

        it('begin_is_atomic_across_callers', async () => {
            const { fixture, scope } = await setup();
            const runs = Array.from({ length: 10 }, (_, i) => uuidOf(`run-${i}`));

            for (const runId of runs) {
                await fixture.seedRun(runId);
            }

            const results = await Promise.all(runs.map((runId, i) => fixture.service.beginTurn(scope, runId, `hello ${i}`, LIMITS)));
            const ready = results.filter((r) => r.kind === 'ready');

            expect(ready).toHaveLength(1);

            const winner = ready[0]!.kind === 'ready' ? ready[0]!.snapshot.runId : '';

            expect(results.filter((r) => r.kind === 'busy')).toHaveLength(9);

            for (const result of results) {
                if (result.kind === 'busy') {
                    expect(result.runId).toBe(winner);
                }
            }

            const items = await fixture.service.findItems(scope, { limit: 100, offset: 0 });

            expect(items.total).toBe(1);
            expect(items.data[0]).toMatchObject({
                id: `user:${winner}`,
                role: 'user',
                status: 'sent',
            });
        });

        it('two runs begin a turn on one conversation together: one is ready, the other busy', async () => {
            const {
                store,
                fixture,
                scope,
            } = await setup();

            await fixture.seedRun(uuidOf('run-a'));
            await fixture.seedRun(uuidOf('run-b'));

            const [a, b] = await Promise.all([
                store.beginTurn(scope, uuidOf('run-a'), 'a', LIMITS),
                store.beginTurn(scope, uuidOf('run-b'), 'b', LIMITS),
            ]);

            expect([a.kind, b.kind].sort()).toEqual(['busy', 'ready']);

            const owner = a.kind === 'ready' ? uuidOf('run-a') : uuidOf('run-b');

            expect([a, b].find((result) => result.kind === 'busy')).toEqual({ kind: 'busy', runId: owner });
            expect(await store.activeRun(scope)).toBe(owner);
            expect((await store.findItems(scope, { limit: 10, offset: 0 })).data.map((item) => item.id)).toEqual([`user:${owner}`]);
        });

        it('a change waiting for the conversation row reads the clock after the lock', async () => {
            const {
                store,
                clock,
                scope,
                fixture,
            } = await setup();
            const { repository, untilBlocked } = fixture;

            if (!repository || !untilBlocked) {
                return;
            }

            await completeTurn(store, clock, scope, uuidOf('run-a'), 'earlier', []);
            await fixture.seedRun(uuidOf('run-b'));

            const { promise: held, resolve: release } = Promise.withResolvers<void>();
            const { promise: locked, resolve: lockedOnce } = Promise.withResolvers<void>();
            const holding = repository.transaction(async (bound) => {
                await bound.findOneById(scope.id);
                lockedOnce();
                await held;
            });

            await locked;

            const begun = fixture.service.beginTurn(scope, uuidOf('run-b'), 'later', LIMITS);

            await untilBlocked();
            clock.advance(5000);
            release();
            await holding;

            const result = await begun;

            expect(result).toMatchObject({ kind: 'ready', snapshot: { createdAt: new Date(clock.now()) } });
            expect((await store.findItems(scope, { limit: 10, offset: 0 })).data.at(-1)?.createdAt).toEqual(new Date(clock.now()));
        });

        it('same_run_reuses_snapshot', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();

            await completeTurn(store, clock, scope, uuidOf('run-0'), 'earlier', ['reply']);

            const first = await store.beginTurn(scope, uuidOf('run-a'), 'hello', LIMITS);

            clock.advance(5000);
            await store.prepareEmit(scope, makeEmit(clock, uuidOf('run-a'), 0, 'not yet sent'));

            const second = await store.beginTurn(scope, uuidOf('run-a'), 'hello', LIMITS);

            expect(first.kind).toBe('ready');
            expect(second).toEqual(first);

            const items = await store.findItems(scope, { limit: 100, offset: 0 });

            expect(items.data.filter((item) => item.id === `user:${uuidOf('run-a')}`)).toHaveLength(1);
            expect(items.total).toBe(4);
        });

        it('a retry of beginTurn by the owning run returns the same snapshot', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();

            await completeTurn(store, clock, scope, uuidOf('run-0'), 'earlier', ['reply']);
            await store.beginTurn(scope, uuidOf('run-a'), 'hello', LIMITS);
            await store.applyNote(scope, makeSet(uuidOf('run-a'), 'name', 'Ada'));
            clock.advance(60_000);

            const first = await store.beginTurn(scope, uuidOf('run-a'), 'hello', LIMITS);
            const retried = await store.beginTurn(scope, uuidOf('run-a'), 'hello', {
                ...LIMITS,
                maxItems: 1,
                maxHistoryBytes: 1,
            });

            expect(retried).toStrictEqual(first);
            expect(first).toMatchObject({
                kind: 'ready',
                snapshot: {
                    runId: uuidOf('run-a'),
                    itemIds: [`user:${uuidOf('run-0')}`, `assistant:${uuidOf('run-0')}:0`],
                    noteKeys: [],
                    createdAt: new Date('2026-01-01T00:00:00.000Z'),
                },
            });
        });

        it('active_snapshot_survives_stricter_limits_on_resume', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();

            await completeTurn(store, clock, scope, uuidOf('run-0'), 'earlier', ['reply']);

            const first = await store.beginTurn(scope, uuidOf('run-a'), 'accepted text', LIMITS);

            expect(first.kind).toBe('ready');
            clock.advance(5000);

            const stricter = {
                ...LIMITS,
                maxItemBytes: 4,
                maxHistoryBytes: 4,
                retentionMs: 1,
            };

            await expect(store.beginTurn(scope, uuidOf('run-a'), 'accepted text', stricter)).resolves.toEqual(first);
            await store.endTurn(scope, uuidOf('run-a'), []);
            await expect(store.beginTurn(scope, uuidOf('run-b'), 'new oversized input', stricter)).rejects.toMatchObject(INVALID);
        });

        it('ended_turn_does_not_reclaim_its_retained_input', async () => {
            const { store, scope } = await setup();

            await store.beginTurn(scope, uuidOf('run-a'), 'hello', LIMITS);
            await store.endTurn(scope, uuidOf('run-a'), []);
            await expect(store.beginTurn(scope, uuidOf('run-a'), 'hello', LIMITS))
                .rejects.toMatchObject({ code: 'invalid_run_state', message: 'The conversation turn has already ended.' });
            expect((await store.findItems(scope, { limit: 10, offset: 0 })).total).toBe(1);
            expect((await store.beginTurn(scope, uuidOf('run-b'), 'next', LIMITS)).kind).toBe('ready');
        });

        it('busy_does_not_append_input', async () => {
            const { store, scope } = await setup();

            await store.beginTurn(scope, uuidOf('run-a'), 'first', LIMITS);
            expect(await store.beginTurn(scope, uuidOf('run-b'), 'second', LIMITS)).toEqual({ kind: 'busy', runId: uuidOf('run-a') });

            let items = await store.findItems(scope, { limit: 100, offset: 0 });

            expect(items.data.map((item) => item.id)).toEqual([`user:${uuidOf('run-a')}`]);

            await store.endTurn(scope, uuidOf('run-a'), []);
            expect((await store.beginTurn(scope, uuidOf('run-b'), 'second', LIMITS)).kind).toBe('ready');
            // a settled owner retrying with its snapshot never takes the scope back from the active one
            expect(await store.beginTurn(scope, uuidOf('run-a'), 'first', LIMITS)).toEqual({ kind: 'busy', runId: uuidOf('run-b') });
            items = await store.findItems(scope, { limit: 100, offset: 0 });
            expect(items.data.map((item) => item.id)).toEqual([`user:${uuidOf('run-a')}`, `user:${uuidOf('run-b')}`]);
        });

        it('end_is_owner_guarded', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();

            await store.beginTurn(scope, uuidOf('run-a'), 'first', LIMITS);

            const confirmed = makeEmit(clock, uuidOf('run-a'), 0, 'confirmed');
            const lost = makeEmit(clock, uuidOf('run-a'), 1, 'uncertain');

            await store.prepareEmit(scope, confirmed);
            await store.prepareEmit(scope, lost);

            await store.endTurn(scope, uuidOf('run-b'), [confirmed.id, lost.id]);
            expect(await store.beginTurn(scope, uuidOf('run-c'), 'third', LIMITS)).toEqual({ kind: 'busy', runId: uuidOf('run-a') });
            expect((await store.pendingEmits(scope, uuidOf('run-a'))).map((item) => item.id)).toEqual([confirmed.id, lost.id]);

            await store.endTurn(scope, uuidOf('run-a'), [confirmed.id]);

            const items = await store.findItems(scope, { limit: 100, offset: 0 });

            expect(items.data.map((item) => [item.id, item.status])).toEqual([
                [`user:${uuidOf('run-a')}`, 'sent'],
                [confirmed.id, 'sent'],
                [lost.id, 'unknown'],
            ]);
            expect(await store.pendingEmits(scope, uuidOf('run-a'))).toEqual([]);

            // a repeated end is a no-op, and unknown is terminal
            await store.endTurn(scope, uuidOf('run-a'), [lost.id]);
            expect((await store.beginTurn(scope, uuidOf('run-c'), 'third', LIMITS)).kind).toBe('ready');
            await store.endTurn(scope, uuidOf('run-c'), [lost.id]);

            const after = await store.findItems(scope, { limit: 100, offset: 0 });

            expect(after.data.find((item) => item.id === lost.id)?.status).toBe('unknown');
            await expect(store.endTurn(scope, uuidOf('run-c'), [1] as never)).rejects.toMatchObject({
                code: 'validation_error',
                message: 'The confirmed emit ids must be an array of strings.',
            });
        });

        it('endTurn of a stale generation is a no-op', async () => {
            const { store, scope } = await setup();

            await store.beginTurn(scope, uuidOf('run-a'), 'hi', LIMITS);
            await store.endTurn({ ...scope, generation: 3 }, uuidOf('run-a'), []);
            expect(await store.beginTurn(scope, uuidOf('run-b'), 'x', LIMITS)).toEqual({ kind: 'busy', runId: uuidOf('run-a') });
            expect(await store.pendingEmits({ ...scope, generation: 3 }, uuidOf('run-a'))).toEqual([]);
        });

        it('two_scope_identities_isolate', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();
            const other = await store.resolve(makeIdentity('chat-1', { audience: 'group' }));

            expect(other.id).not.toBe(scope.id);

            expect((await store.beginTurn(scope, uuidOf('run-a'), 'mine', LIMITS)).kind).toBe('ready');
            expect((await store.beginTurn(other, uuidOf('run-b'), 'theirs', LIMITS)).kind).toBe('ready');
            await store.applyNote(scope, makeSet(uuidOf('run-a'), 'name', 'Ada'));
            await store.prepareEmit(scope, makeEmit(clock, uuidOf('run-a'), 0, 'hi Ada'));
            await expect(store.applyNote(other, makeSet(uuidOf('run-a'), 'name', 'Eve')))
                .rejects.toMatchObject({ ...STATE, message: 'The run does not hold the conversation turn.' });
            await expect(store.prepareEmit(other, makeEmit(clock, uuidOf('run-a'), 1, 'x'))).rejects.toMatchObject(STATE);

            expect((await store.findItems(other, { limit: 100, offset: 0 })).data.map((i) => i.id)).toEqual([`user:${uuidOf('run-b')}`]);
            expect((await store.findNotes(other, { limit: 100, offset: 0 })).total).toBe(0);
            expect(await store.findOneNote(other, 'name')).toBeUndefined();
            expect((await store.findOneNote(scope, 'name'))?.text).toBe('Ada');
        });

        it('reset_races_begin', async () => {
            for (const order of ['begin-first', 'reset-first'] as const) {
                const {
                    store,
                    fixture,
                    identity,
                    scope,
                } = await setup();

                await fixture.seedRun(uuidOf('run-a'));

                const begin = () => store.beginTurn(scope, uuidOf('run-a'), 'hello', LIMITS);
                const reset = () => store.reset(identity, { keepNotes: false });
                let beginResult: PromiseSettledResult<Awaited<ReturnType<typeof begin>>>;
                let resetResult: PromiseSettledResult<unknown>;

                if (order === 'begin-first') {
                    [beginResult, resetResult] = await Promise.allSettled([begin(), reset()]);
                } else {
                    [resetResult, beginResult] = await Promise.allSettled([reset(), begin()]);
                }

                const ready = beginResult.status === 'fulfilled' && beginResult.value.kind === 'ready';

                expect(ready !== (resetResult.status === 'fulfilled')).toBe(true);

                if (!ready) {
                    expect(beginResult).toMatchObject({ status: 'fulfilled', value: { kind: 'stale' } });
                }
            }
        });

        it('delete_leaves_generation_tombstone', async () => {
            const {
                store,
                clock,
                identity,
                scope,
            } = await setup();

            await store.beginTurn(scope, uuidOf('run-a'), 'remember me', LIMITS);
            await store.applyNote(scope, makeSet(uuidOf('run-a'), 'name', 'Ada'));
            await store.prepareEmit(scope, makeEmit(clock, uuidOf('run-a'), 0, 'ok'));
            await store.endTurn(scope, uuidOf('run-a'), [`assistant:${uuidOf('run-a')}:0`]);

            await store.delete(identity);

            const current = await store.findOne(identity);

            expect(current?.id).toBe(scope.id);
            expect(current?.generation).toBeGreaterThan(scope.generation);
            expect(await store.resolve(identity)).toEqual(current);

            expect(await store.beginTurn(scope, uuidOf('run-b'), 'old queued work', LIMITS)).toEqual({ kind: 'stale' });
            await expect(store.prepareEmit(scope, makeEmit(clock, uuidOf('run-b'), 0, 'x')))
                .rejects.toMatchObject({ ...STATE, message: 'The conversation scope is stale: it was reset or deleted.' });
            await expect(store.applyNote(scope, makeSet(uuidOf('run-b'), 'k', 'v'))).rejects.toMatchObject(STATE);
            expect((await store.findItems(scope, { limit: 100, offset: 0 })).total).toBe(0);
            expect((await store.findItems(current!, { limit: 100, offset: 0 })).total).toBe(0);
            expect((await store.findNotes(current!, { limit: 100, offset: 0 })).total).toBe(0);
            expect(await store.findOneNote(current!, 'name')).toBeUndefined();

            const ready = await store.beginTurn(current!, uuidOf('run-c'), 'fresh', LIMITS);

            expect(ready).toMatchObject({
                kind: 'ready',
                snapshot: {
                    messages: [],
                    itemIds: [],
                    noteKeys: [],
                },
            });

            // deleting an identity never seen is a no-op that creates nothing
            await store.delete(makeIdentity('never'));
            expect(await store.findOne(makeIdentity('never'))).toBeUndefined();
        });

        it('reset_rejects_array_options_without_advancing_generation', async () => {
            const {
                store,
                identity,
                scope,
            } = await setup();

            await expect(store.reset(identity, Object.assign([], { keepNotes: true })))
                .rejects.toMatchObject({ ...INVALID, message: 'The reset options need keepNotes as a boolean.' });
            expect(await store.findOne(identity)).toEqual(scope);
        });

        it('reset_refuses_active', async () => {
            const {
                store,
                identity,
                scope,
            } = await setup();

            await store.beginTurn(scope, uuidOf('run-a'), 'hello', LIMITS);
            await store.applyNote(scope, makeSet(uuidOf('run-a'), 'name', 'Ada'));
            await expect(store.reset(identity, { keepNotes: false }))
                .rejects.toMatchObject({ ...STATE, message: 'The conversation has an active turn and cannot be reset.' });
            await expect(store.delete(identity))
                .rejects.toMatchObject({ ...STATE, message: 'The conversation has an active turn and cannot be deleted.' });
            expect(await store.findOne(identity)).toEqual(scope);
            await store.endTurn(scope, uuidOf('run-a'), []);

            const dropped = await store.reset(identity, { keepNotes: false });

            expect(dropped.generation).toBeGreaterThan(scope.generation);
            expect((await store.findNotes(dropped, { limit: 100, offset: 0 })).total).toBe(0);
            expect(await store.beginTurn(scope, uuidOf('run-b'), 'old', LIMITS)).toEqual({ kind: 'stale' });

            const second = await setup();

            await second.store.beginTurn(second.scope, uuidOf('run-a'), 'hello', LIMITS);
            await second.store.applyNote(second.scope, makeSet(uuidOf('run-a'), 'name', 'Ada', { inputHash: 'h1' }));
            await second.store.endTurn(second.scope, uuidOf('run-a'), []);

            const kept = await second.store.reset(second.identity, { keepNotes: true });

            expect((await second.store.findNotes(kept, { limit: 100, offset: 0 })).data.map((n) => [n.key, n.text]))
                .toEqual([['name', 'Ada']]);
            // the old generation's operation record grants no replay in the new one
            expect((await second.store.beginTurn(kept, uuidOf('run-a'), 'again', LIMITS)).kind).toBe('ready');

            const result = await second.store.applyNote(kept, makeSet(uuidOf('run-a'), 'name', 'Grace', { inputHash: 'h2' }));

            expect(result).toMatchObject({ kind: 'set', key: 'name' });
            expect((await second.store.findOneNote(kept, 'name'))?.text).toBe('Grace');
            // old transcript items are not part of the new generation
            expect((await second.store.findItems(kept, { limit: 100, offset: 0 })).data.map((i) => i.id))
                .toEqual([`user:${uuidOf('run-a')}`]);
        });

        it('reset with keepNotes keeps the live notes in the new generation, drops the expired ones and keeps the scope id', async () => {
            const {
                store,
                clock,
                identity,
                scope,
            } = await setup();

            await store.beginTurn(scope, uuidOf('run-a'), 'hello', LIMITS);
            await store.applyNote(scope, makeSet(uuidOf('run-a'), 'live', 'stays'));
            await store.applyNote(scope, makeSet(uuidOf('run-a'), 'short', 'goes', { expiresAt: new Date(clock.now() + 10) }));
            await store.endTurn(scope, uuidOf('run-a'), []);
            clock.advance(10);

            const kept = await store.reset(identity, { keepNotes: true });

            expect(kept.id).toBe(scope.id);
            expect((await store.findNotes(kept, { limit: 100, offset: 0 })).data.map((note) => note.key)).toEqual(['live']);
            expect(await store.findOneNote(kept, 'live')).toMatchObject({ text: 'stays', source: { runId: uuidOf('run-a') } });
            expect(await store.findNotes(scope, { limit: 100, offset: 0 })).toEqual({ data: [], total: 0 });
        });

        it('notes_replay_once_hash_collision_refused', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();

            await store.beginTurn(scope, uuidOf('run-a'), 'hello', LIMITS);

            const set = makeSet(uuidOf('run-a'), 'name', 'Ada');
            const created = await store.applyNote(scope, set);

            expect(created).toEqual({
                kind: 'set',
                key: 'name',
                updatedAt: new Date(clock.now()),
            });
            expect(created).not.toHaveProperty('text');

            const createdAt = created.kind === 'set' ? created.updatedAt : undefined;

            clock.advance(1000);
            expect(await store.applyNote(scope, set)).toEqual(created);

            const note = await store.findOneNote(scope, 'name');

            expect(note).toMatchObject({
                text: 'Ada',
                updatedAt: createdAt,
                source: set.source,
            });
            await expect(store.applyNote(scope, {
                ...set,
                inputHash: 'other',
                text: 'Eve',
            })).rejects.toMatchObject({ ...INVALID, message: 'The note operation was already applied with another input.' });
            expect((await store.findOneNote(scope, 'name'))?.text).toBe('Ada');

            const update = makeSet(uuidOf('run-a'), 'name', 'Grace', { toolCallId: 'call-2', stepIndex: 1 });
            const updated = await store.applyNote(scope, update);

            expect(updated).toEqual({
                kind: 'set',
                key: 'name',
                updatedAt: new Date(clock.now()),
            });
            expect(await store.findOneNote(scope, 'name')).toMatchObject({
                text: 'Grace',
                createdAt,
                updatedAt: new Date(clock.now()),
            });

            const remove = makeRemove(uuidOf('run-a'), 'name');

            expect(await store.applyNote(scope, remove)).toEqual({
                kind: 'remove',
                key: 'name',
                removed: true,
            });
            expect(await store.applyNote(scope, remove)).toEqual({
                kind: 'remove',
                key: 'name',
                removed: true,
            });
            expect(await store.applyNote(scope, makeRemove(uuidOf('run-a'), 'name', 'call-3')))
                .toEqual({
                    kind: 'remove',
                    key: 'name',
                    removed: false,
                });
            expect(await store.findOneNote(scope, 'name')).toBeUndefined();

            // no write and no replay without the run's active ownership
            await expect(store.applyNote(scope, makeSet(uuidOf('run-b'), 'k', 'v'))).rejects.toMatchObject(STATE);
            await store.endTurn(scope, uuidOf('run-a'), []);
            await expect(store.applyNote(scope, set)).rejects.toMatchObject(STATE);
            expect(await store.findOneNote(scope, 'name')).toBeUndefined();
        });

        it('note operations are bounded and validated', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();

            expect(CONVERSATION_NOTES_MAX).toBe(100);
            expect(CONVERSATION_NOTE_KEY_MAX_LENGTH).toBe(128);
            expect(CONVERSATION_NOTE_TEXT_MAX_BYTES).toBe(2048);
            await store.beginTurn(scope, uuidOf('run-a'), 'hello', LIMITS);

            for (let i = 0; i < 100; i++) {
                await store.applyNote(scope, makeSet(uuidOf('run-a'), `k${i}`, 'v'));
            }

            await expect(store.applyNote(scope, makeSet(uuidOf('run-a'), 'k100', 'v')))
                .rejects.toMatchObject({ ...INVALID, message: 'A conversation holds at most 100 notes.' });
            expect((await store.findNotes(scope, { limit: 200, offset: 0 })).total).toBe(100);
            // updating an existing note at the cap is fine
            await store.applyNote(scope, makeSet(uuidOf('run-a'), 'k0', 'w', { toolCallId: 'again' }));
            await expect(store.applyNote(scope, makeSet(uuidOf('run-a'), '', 'v'))).rejects.toMatchObject(INVALID);
            await expect(store.applyNote(scope, makeSet(uuidOf('run-a'), 'k'.repeat(129), 'v'))).rejects.toMatchObject(INVALID);
            await expect(store.applyNote(scope, makeSet(uuidOf('run-a'), 'a\nb', 'v'))).rejects.toMatchObject(INVALID);
            await expect(store.applyNote(scope, makeSet(uuidOf('run-a'), 'k0', 'é'.repeat(1025), { toolCallId: 'long' })))
                .rejects.toMatchObject(INVALID);
            await expect(store.applyNote(scope, makeSet(uuidOf('run-a'), 'k0', 'v', { toolCallId: 'past', expiresAt: new Date(clock.now()) })))
                .rejects.toMatchObject(INVALID);
            // a refused operation records nothing: the same id applies once valid
            expect(await store.applyNote(scope, makeSet(uuidOf('run-a'), 'k0', 'w', { toolCallId: 'long' })))
                .toMatchObject({ kind: 'set', key: 'k0' });

            const page = await store.findNotes(scope, { limit: 2, offset: 1 });

            expect(page.total).toBe(100);
            expect(page.data.map((n) => n.key)).toEqual(['k1', 'k10']);
        });

        it('a note limit counts live notes only: an expired note frees its place', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();

            await store.beginTurn(scope, uuidOf('run-a'), 'hello', LIMITS);

            for (let i = 0; i < 99; i++) {
                await store.applyNote(scope, makeSet(uuidOf('run-a'), `k${i}`, 'v'));
            }

            await store.applyNote(scope, makeSet(uuidOf('run-a'), 'short', 'v', { expiresAt: new Date(clock.now() + 5) }));
            await expect(store.applyNote(scope, makeSet(uuidOf('run-a'), 'more', 'v'))).rejects.toMatchObject(INVALID);
            clock.advance(5);
            expect(await store.applyNote(scope, makeSet(uuidOf('run-a'), 'more', 'v'))).toMatchObject({ kind: 'set', key: 'more' });
            expect((await store.findNotes(scope, { limit: 200, offset: 0 })).total).toBe(100);
        });

        it('validates a note operation of the active run', async () => {
            const { store, scope } = await setup();

            await store.beginTurn(scope, uuidOf('run-a'), 'hi', LIMITS);
            await expect(store.applyNote(scope, { ...makeSet(uuidOf('run-a'), 'k', 'v'), kind: 'other' } as never)).rejects.toMatchObject(INVALID);
            await expect(store.applyNote(scope, { ...makeSet(uuidOf('run-a'), 'k', 'v'), id: '' })).rejects.toMatchObject(INVALID);
            await expect(store.applyNote(scope, { ...makeSet(uuidOf('run-a'), 'k', 'v'), inputHash: '' })).rejects.toMatchObject(INVALID);
            await expect(store.applyNote(scope, makeSet(uuidOf('run-a'), 'k', 'a\0b'))).rejects.toMatchObject(INVALID);
            await expect(store.applyNote(scope, { ...makeSet(uuidOf('run-a'), 'k', 'v'), expiresAt: new Date(NaN) })).rejects.toMatchObject(INVALID);
            expect(await store.findOneNote(scope, 'k')).toBeUndefined();
        });

        it('pending_send_not_recalled', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();

            await store.beginTurn(scope, uuidOf('run-a'), 'question', LIMITS);

            const sent = makeEmit(clock, uuidOf('run-a'), 0, 'sent answer');
            const uncertain = makeEmit(clock, uuidOf('run-a'), 1, 'uncertain answer');

            await store.prepareEmit(scope, sent);
            await store.prepareEmit(scope, sent);
            await store.prepareEmit(scope, uncertain);
            await expect(store.prepareEmit(scope, { ...sent, text: 'changed' }))
                .rejects.toMatchObject({ ...INVALID, message: 'A conversation item of this id exists with other content.' });
            await expect(store.prepareEmit(scope, { ...sent, target: { channel: 'openclaw', address: 'x' } }))
                .rejects.toMatchObject(INVALID);
            await expect(store.prepareEmit(scope, { ...sent, effectKey: 'other' })).rejects.toMatchObject(INVALID);
            await expect(store.prepareEmit(scope, { ...sent, runId: uuidOf('run-b') })).rejects.toMatchObject(STATE);
            await store.confirmEmit(scope, sent.id);
            await store.confirmEmit(scope, sent.id);
            await expect(store.confirmEmit(scope, 'assistant:none')).rejects.toMatchObject(STATE);

            const before = await store.beginTurn(scope, uuidOf('run-x'), 'busy', LIMITS);

            expect(before.kind).toBe('busy');
            expect((await store.pendingEmits(scope, uuidOf('run-a'))).map((item) => item.id)).toEqual([uncertain.id]);
            await store.endTurn(scope, uuidOf('run-a'), []);
            await expect(store.confirmEmit(scope, uncertain.id)).rejects.toMatchObject(STATE);

            const next = await store.beginTurn(scope, uuidOf('run-b'), 'follow-up', LIMITS);

            if (next.kind !== 'ready') {
                throw new TypeError('expected ready');
            }

            expect(next.snapshot.itemIds).toEqual([`user:${uuidOf('run-a')}`, sent.id]);
            expect(next.snapshot.messages).toEqual([
                { role: 'user', content: 'question' },
                { role: 'assistant', content: 'sent answer' },
            ]);

            const items = await store.findItems(scope, { limit: 100, offset: 0 });

            expect(items.data.find((item) => item.id === uncertain.id)?.status).toBe('unknown');
            expect(items.data.filter((item) => item.id === sent.id)).toHaveLength(1);
        });

        it('expired_notes_ignored_at_exact_time', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();

            await store.beginTurn(scope, uuidOf('run-a'), 'hello', LIMITS);
            await store.applyNote(scope, makeSet(uuidOf('run-a'), 'temp', 'short-lived', { expiresAt: new Date(clock.now() + 1000) }));
            await store.applyNote(scope, makeSet(uuidOf('run-a'), 'keep', 'forever'));
            await store.endTurn(scope, uuidOf('run-a'), []);

            clock.advance(999);
            expect((await store.findOneNote(scope, 'temp'))?.text).toBe('short-lived');

            const held = await store.beginTurn(scope, uuidOf('run-b'), 'still there?', LIMITS);

            if (held.kind !== 'ready') {
                throw new TypeError('expected ready');
            }

            expect(held.snapshot.noteKeys).toEqual(['keep', 'temp']);

            clock.advance(1);
            expect(await store.findOneNote(scope, 'temp')).toBeUndefined();
            expect((await store.findNotes(scope, { limit: 100, offset: 0 })).data.map((n) => n.key)).toEqual(['keep']);
            // the snapshot taken earlier is immutable
            expect(await store.beginTurn(scope, uuidOf('run-b'), 'still there?', LIMITS)).toEqual(held);
            await store.endTurn(scope, uuidOf('run-b'), []);

            const next = await store.beginTurn(scope, uuidOf('run-c'), 'gone?', LIMITS);

            if (next.kind !== 'ready') {
                throw new TypeError('expected ready');
            }

            expect(next.snapshot.noteKeys).toEqual(['keep']);
            expect(JSON.stringify(next.snapshot.messages)).not.toContain('short-lived');
        });

        it('expires transcript items at exactly createdAt + retentionMs', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();
            const limits: ResolvedConversationLimits = { ...LIMITS, retentionMs: 10_000 };

            await completeTurn(store, clock, scope, uuidOf('run-a'), 'old', ['old reply'], limits);
            clock.advance(9999);
            await completeTurn(store, clock, scope, uuidOf('run-b'), 'recent', [], limits);

            const recalled = await store.beginTurn(scope, uuidOf('run-c'), 'now', limits);

            if (recalled.kind !== 'ready') {
                throw new TypeError('expected ready');
            }

            expect(recalled.snapshot.itemIds).toEqual([`user:${uuidOf('run-a')}`, `assistant:${uuidOf('run-a')}:0`, `user:${uuidOf('run-b')}`]);
            await store.endTurn(scope, uuidOf('run-c'), []);

            clock.advance(1);

            const trimmed = await store.beginTurn(scope, uuidOf('run-d'), 'later', limits);

            if (trimmed.kind !== 'ready') {
                throw new TypeError('expected ready');
            }

            expect(trimmed.snapshot.itemIds).toEqual([`user:${uuidOf('run-b')}`, `user:${uuidOf('run-c')}`]);
            expect((await store.findItems(scope, { limit: 100, offset: 0 })).data.map((i) => i.id))
                .toEqual([`user:${uuidOf('run-b')}`, `user:${uuidOf('run-c')}`, `user:${uuidOf('run-d')}`]);
        });

        it('trim_inactive_via_prune', async () => {
            const {
                store,
                clock,
                identity,
                scope,
            } = await setup();
            const limits: ResolvedConversationLimits = { ...LIMITS, retentionMs: 10_000 };

            await completeTurn(store, clock, scope, uuidOf('run-a'), 'old', ['old reply'], limits);
            await store.beginTurn(scope, uuidOf('run-b'), 'active', limits);
            await store.applyNote(scope, makeSet(uuidOf('run-b'), 'temp', 't', { expiresAt: new Date(clock.now() + 5) }));

            const other = await store.resolve(makeIdentity('chat-2'));

            await completeTurn(store, clock, other, uuidOf('run-o'), 'other', [], limits);
            await store.reset(makeIdentity('chat-2'), { keepNotes: true });
            // reset is no erasure: the old generation keeps its records until retention removes them
            expect((await store.findItems(other, { limit: 100, offset: 0 })).total).toBe(1);

            clock.advance(10_000);
            await store.prune(limits);

            const items = await store.findItems(scope, { limit: 100, offset: 0 });

            // the active turn keeps its input
            expect(items.data.map((item) => item.id)).toEqual([`user:${uuidOf('run-b')}`]);
            expect((await store.findItems(other, { limit: 100, offset: 0 })).total).toBe(0);
            expect(await store.findOne(identity)).toEqual(scope);
            // the active turn's snapshot survives the prune
            expect((await store.beginTurn(scope, uuidOf('run-b'), 'active', limits)).kind).toBe('ready');
            expect((await store.findNotes(scope, { limit: 100, offset: 0 })).total).toBe(0);

            // maxStoredItems keeps the newest records of a generation
            await store.endTurn(scope, uuidOf('run-b'), []);

            const capped: ResolvedConversationLimits = { ...limits, maxStoredItems: 3 };

            for (const run of [uuidOf('run-c'), uuidOf('run-d'), uuidOf('run-e')]) {
                await completeTurn(store, clock, scope, run, run, [`${run} reply`], limits);
            }

            await store.prune(capped);
            expect((await store.findItems(scope, { limit: 100, offset: 0 })).data.map((i) => i.id))
                .toEqual([`assistant:${uuidOf('run-d')}:0`, `user:${uuidOf('run-e')}`, `assistant:${uuidOf('run-e')}:0`]);
            // begin trims too, never dropping the new input
            await completeTurn(store, clock, scope, uuidOf('run-f'), 'f', ['f reply'], capped);
            expect((await store.findItems(scope, { limit: 100, offset: 0 })).data.map((i) => i.id))
                .toEqual([`user:${uuidOf('run-e')}`, `assistant:${uuidOf('run-e')}:0`, `user:${uuidOf('run-f')}`, `assistant:${uuidOf('run-f')}:0`]);
        });

        it('prune cuts every generation to maxStoredItems, the active turn\'s items spared', async () => {
            const {
                store,
                clock,
                identity,
                scope,
            } = await setup();

            for (const run of ['run-a', 'run-b', 'run-c']) {
                await completeTurn(store, clock, scope, uuidOf(run), run, [`${run} reply`]);
            }

            const next = await store.reset(identity, { keepNotes: false });

            for (const run of ['run-d', 'run-e']) {
                await completeTurn(store, clock, next, uuidOf(run), run, [`${run} reply`]);
            }

            await store.beginTurn(next, uuidOf('run-f'), 'active', LIMITS);
            await store.prune({ ...LIMITS, maxStoredItems: 1 });
            expect((await store.findItems(scope, { limit: 100, offset: 0 })).data.map((item) => item.id))
                .toEqual([`assistant:${uuidOf('run-c')}:0`]);
            // the active turn's item counts toward the limit and is never removed
            expect((await store.findItems(next, { limit: 100, offset: 0 })).data.map((item) => item.id))
                .toEqual([`user:${uuidOf('run-f')}`]);
        });

        it('prunes note operation records only for settled runs past retention', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();
            const limits: ResolvedConversationLimits = { ...LIMITS, retentionMs: 10_000 };

            await store.beginTurn(scope, uuidOf('run-a'), 'hello', limits);
            await store.applyNote(scope, makeSet(uuidOf('run-a'), 'name', 'Ada'));
            await store.endTurn(scope, uuidOf('run-a'), []);
            await store.beginTurn(scope, uuidOf('run-b'), 'hello', limits);
            await store.applyNote(scope, makeSet(uuidOf('run-b'), 'city', 'Rome'));

            const young = vi.fn<(runId: string) => Promise<boolean>>(async () => true);

            await store.prune(limits, { isSettled: young });
            expect(young).not.toHaveBeenCalled();

            clock.advance(10_000);

            const failing = vi.fn<(runId: string) => Promise<boolean>>(async () => {
                throw new TypeError('lookup failed');
            });

            await expect(store.prune(limits, { isSettled: failing })).rejects.toThrow('lookup failed');
            // the active run is never asked
            expect(failing.mock.calls.map(([runId]) => runId)).toEqual([uuidOf('run-a')]);

            const settled = vi.fn<(runId: string) => Promise<boolean>>(async () => true);

            await store.prune(limits, { isSettled: settled });
            expect(settled.mock.calls.map(([runId]) => runId)).toEqual([uuidOf('run-a')]);

            const again = vi.fn<(runId: string) => Promise<boolean>>(async () => true);

            await store.prune(limits, { isSettled: again });
            expect(again).not.toHaveBeenCalled();
            // live notes are not operation records and stay
            expect((await store.findOneNote(scope, 'name'))?.text).toBe('Ada');
            // the active run's record still replays
            expect(await store.applyNote(scope, makeSet(uuidOf('run-b'), 'city', 'Rome')))
                .toMatchObject({ kind: 'set', key: 'city' });
        });

        it('prune with isSettled never holds a transaction across the callback', async () => {
            const {
                store,
                clock,
                identity,
                scope,
            } = await setup();
            const limits: ResolvedConversationLimits = { ...LIMITS, retentionMs: 1000 };

            await store.beginTurn(scope, uuidOf('run-a'), 'hi', limits);
            await store.applyNote(scope, makeSet(uuidOf('run-a'), 'k', 'v'));
            await store.endTurn(scope, uuidOf('run-a'), []);
            clock.advance(1000);

            const calls: string[] = [];

            await store.prune(limits, {
                isSettled: async (runId) => {
                    // a write of the same conversation inside the callback: a transaction held across it would never let it through
                    const begun = await store.beginTurn(scope, uuidOf('run-b'), 'during the callback', limits);

                    await store.endTurn(scope, uuidOf('run-b'), []);
                    calls.push(`${runId}:${begun.kind}`);

                    return true;
                },
            });

            expect(calls).toEqual([`${uuidOf('run-a')}:ready`]);
            expect(await store.reset(identity, { keepNotes: true })).toMatchObject({ generation: 1 });
        });

        it('keeps an operation record whose run became active again during the settled lookup', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();
            const limits = { ...LIMITS, retentionMs: 1000 };

            await store.beginTurn(scope, uuidOf('run-a'), 'hi', limits);

            const op = makeSet(uuidOf('run-a'), 'k', 'v');
            const first = await store.applyNote(scope, op);

            await store.endTurn(scope, uuidOf('run-a'), []);
            clock.advance(1000);
            await store.prune(limits, {
                isSettled: async () => {
                    // the run takes the scope back (engine-invalid, but the prune must re-check after its await)
                    await store.beginTurn(scope, uuidOf('run-a'), 'hi', limits);

                    return true;
                },
            });
            clock.advance(5);
            expect(await store.applyNote(scope, op)).toEqual(first);
        });

        it('copy_in_out', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();
            const identity = makeIdentity('copy');
            const resolved = await store.resolve(identity);

            identity.chat = 'mutated';
            resolved.identity.chat = 'mutated';
            resolved.generation = 7;
            expect(await store.findOne(makeIdentity('copy'))).toMatchObject({ generation: 0, identity: { chat: 'copy' } });

            await completeTurn(store, clock, scope, uuidOf('run-a'), 'hello', ['hi']);

            const begun = await store.beginTurn(scope, uuidOf('run-b'), 'again', LIMITS);

            if (begun.kind !== 'ready') {
                throw new TypeError('expected ready');
            }

            begun.snapshot.messages.push({ role: 'user', content: 'injected' });
            begun.snapshot.itemIds.length = 0;
            begun.snapshot.createdAt.setTime(0);

            const admitted = await store.findItems(scope, { limit: 100, offset: 0 });

            expect(admitted.data.find((item) => item.id === `user:${uuidOf('run-b')}`)?.createdAt).toEqual(new Date(clock.now()));

            const replay = await store.beginTurn(scope, uuidOf('run-b'), 'again', LIMITS);

            if (replay.kind !== 'ready') {
                throw new TypeError('expected ready');
            }

            expect(replay.snapshot.messages).toHaveLength(2);
            expect(replay.snapshot.itemIds).toEqual([`user:${uuidOf('run-a')}`, `assistant:${uuidOf('run-a')}:0`]);
            expect(replay.snapshot.createdAt).toEqual(new Date(clock.now()));

            const item = makeEmit(clock, uuidOf('run-b'), 0, 'original');

            await store.prepareEmit(scope, item);
            item.text = 'mutated';
            item.target!.address = 'mutated';

            const listed = await store.findItems(scope, { limit: 100, offset: 0 });
            const stored = listed.data.find((i) => i.id === `assistant:${uuidOf('run-b')}:0`)!;

            expect(stored).toMatchObject({ text: 'original', target: { address: 'chat-1' } });
            expect(stored.createdAt).toBeInstanceOf(Date);
            stored.text = 'mutated';
            listed.data.length = 0;
            expect((await store.pendingEmits(scope, uuidOf('run-b')))[0]?.text).toBe('original');

            const op = makeSet(uuidOf('run-b'), 'name', 'Ada');
            const result = await store.applyNote(scope, op);

            op.key = 'other';

            if (result.kind === 'set') {
                result.updatedAt.setTime(0);
            }

            const note = (await store.findOneNote(scope, 'name'))!;

            expect(note.updatedAt).toEqual(new Date(clock.now()));
            note.text = 'mutated';
            note.source.runId = 'mutated';
            expect(await store.findOneNote(scope, 'name')).toMatchObject({ text: 'Ada', source: { runId: uuidOf('run-b') } });
            expect(await store.applyNote(scope, makeSet(uuidOf('run-b'), 'name', 'Ada')))
                .toEqual({
                    kind: 'set',
                    key: 'name',
                    updatedAt: new Date(clock.now()),
                });
        });

        it('unicode_budget_whole_items', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();
            // an item may be larger than the history budget: it is skipped whole and counted
            const limits: ResolvedConversationLimits = {
                ...LIMITS,
                maxHistoryBytes: 12,
                maxItemBytes: 64,
            };

            await completeTurn(store, clock, scope, uuidOf('run-a'), 'ééé', [], limits);
            await completeTurn(store, clock, scope, uuidOf('run-b'), '😀😀😀😀', [], limits);
            await completeTurn(store, clock, scope, uuidOf('run-c'), '€€', [], limits);

            const begun = await store.beginTurn(scope, uuidOf('run-d'), 'next', limits);

            if (begun.kind !== 'ready') {
                throw new TypeError('expected ready');
            }

            expect(begun.snapshot.itemIds).toEqual([`user:${uuidOf('run-a')}`, `user:${uuidOf('run-c')}`]);
            expect(begun.snapshot.omitted).toBe(1);
            expect(begun.snapshot.messages).toEqual([
                { role: 'user', content: 'ééé' },
                { role: 'user', content: '€€' },
            ]);
            await store.endTurn(scope, uuidOf('run-d'), []);

            const one: ResolvedConversationLimits = { ...limits, maxItems: 1 };
            const counted = await store.beginTurn(scope, uuidOf('run-e'), 'count', one);

            if (counted.kind !== 'ready') {
                throw new TypeError('expected ready');
            }

            expect(counted.snapshot.itemIds).toEqual([`user:${uuidOf('run-d')}`]);
            expect(counted.snapshot.omitted).toBe(3);
            await store.endTurn(scope, uuidOf('run-e'), []);

            await expect(store.beginTurn(scope, uuidOf('run-f'), 'é'.repeat(33), limits))
                .rejects.toMatchObject({ ...INVALID, message: 'The conversation text must be at most 64 UTF-8 bytes.' });
            expect((await store.findItems(scope, { limit: 100, offset: 0 })).data.some((i) => i.runId === uuidOf('run-f')))
                .toBe(false);
            expect((await store.beginTurn(scope, uuidOf('run-g'), 'free?', limits)).kind).toBe('ready');
        });

        it('an item larger than the remaining byte budget is skipped and older, smaller ones are still recalled', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();
            const limits: ResolvedConversationLimits = {
                ...LIMITS,
                maxHistoryBytes: 100,
                maxItemBytes: 1000,
            };

            await completeTurn(store, clock, scope, uuidOf('run-a'), 'a'.repeat(30), [], limits);
            await completeTurn(store, clock, scope, uuidOf('run-b'), 'b'.repeat(30), [], limits);
            await completeTurn(store, clock, scope, uuidOf('run-c'), 'c'.repeat(60), [], limits);
            await completeTurn(store, clock, scope, uuidOf('run-d'), 'd'.repeat(50), [], limits);

            const begun = await store.beginTurn(scope, uuidOf('run-e'), 'now', limits);

            if (begun.kind !== 'ready') {
                throw new TypeError('expected ready');
            }

            // d (50) fits, c (60) does not fit the 50 left, b (30) does, a (30) no longer does (20 left)
            expect(begun.snapshot.itemIds).toEqual([`user:${uuidOf('run-b')}`, `user:${uuidOf('run-d')}`]);
            expect(begun.snapshot.omitted).toBe(2);
        });

        it('recalls across pages: more than a page of items newer than an older fitting one', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();
            const limits: ResolvedConversationLimits = {
                ...LIMITS,
                maxHistoryBytes: 120,
                maxItemBytes: 1000,
            };

            await completeTurn(store, clock, scope, uuidOf('oldest'), 'fits', [], limits);

            for (let i = 0; i < 120; i++) {
                await completeTurn(store, clock, scope, uuidOf(`big-${i}`), 'x'.repeat(121), [], limits);
            }

            const begun = await store.beginTurn(scope, uuidOf('recall'), 'now', limits);

            if (begun.kind !== 'ready') {
                throw new TypeError('expected ready');
            }

            expect(begun.snapshot.itemIds).toEqual([`user:${uuidOf('oldest')}`]);
            expect(begun.snapshot.omitted).toBe(120);
        });

        it('selects notes latest updated first within budget and renders them by key', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();
            const limits: ResolvedConversationLimits = { ...LIMITS, maxNotesBytes: 10 };

            await store.beginTurn(scope, uuidOf('run-a'), 'hello', limits);
            await store.applyNote(scope, makeSet(uuidOf('run-a'), 'b', 'bbbb'));
            clock.advance(1);
            await store.applyNote(scope, makeSet(uuidOf('run-a'), 'a', 'aaaa'));
            clock.advance(1);
            await store.applyNote(scope, makeSet(uuidOf('run-a'), 'c', 'cccc'));
            await store.endTurn(scope, uuidOf('run-a'), []);

            const begun = await store.beginTurn(scope, uuidOf('run-b'), 'question', limits);

            if (begun.kind !== 'ready') {
                throw new TypeError('expected ready');
            }

            expect(begun.snapshot.noteKeys).toEqual(['a', 'c']);

            const [notes, ...rest] = begun.snapshot.messages;

            expect(notes?.role).toBe('user');

            const content = String(notes?.content);

            expect(content).toContain('aaaa');
            expect(content).not.toContain('bbbb');
            expect(content.indexOf('aaaa')).toBeLessThan(content.indexOf('cccc'));
            expect(rest).toEqual([{ role: 'user', content: 'hello' }]);
            expect(begun.snapshot.itemIds).toEqual([`user:${uuidOf('run-a')}`]);
        });

        it('no_current_user_duplicate', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();

            await completeTurn(store, clock, scope, uuidOf('run-a'), 'first', ['r1']);

            const begun = await store.beginTurn(scope, uuidOf('run-b'), 'second', LIMITS);

            if (begun.kind !== 'ready') {
                throw new TypeError('expected ready');
            }

            expect(begun.snapshot).toMatchObject({
                runId: uuidOf('run-b'),
                scope,
                omitted: 0,
            });
            expect(begun.snapshot.messages).toEqual([
                { role: 'user', content: 'first' },
                { role: 'assistant', content: 'r1' },
            ]);
            expect(begun.snapshot.itemIds).not.toContain(`user:${uuidOf('run-b')}`);
            await store.beginTurn(scope, uuidOf('run-b'), 'second', LIMITS);

            const items = await store.findItems(scope, { limit: 100, offset: 0 });

            expect(items.data.filter((item) => item.id === `user:${uuidOf('run-b')}`)).toHaveLength(1);
            expect(items.data.find((item) => item.id === `user:${uuidOf('run-b')}`)).toMatchObject({
                role: 'user',
                text: 'second',
                runId: uuidOf('run-b'),
                status: 'sent',
            });
        });

        it('an item\'s stored byte length equals the measured one', async () => {
            const {
                store,
                clock,
                scope,
                fixture,
            } = await setup();
            const { repository } = fixture;

            if (!repository) {
                throw new TypeError('the fixture must hand its repository');
            }

            // ASCII, two- and three-byte characters, astral characters (four bytes, two UTF-16 units)
            const texts = ['plain ascii', 'é中€ß', '😀🎉 and 𝄞', 'mixed é 😀 x'];
            const runs = [uuidOf('bytes-a'), uuidOf('bytes-b')];

            // a user input (sent), emits with and without effect key and target: pending, confirmed (sent), unknown
            await store.beginTurn(scope, runs[0]!, texts[0]!, LIMITS);

            const confirmed = makeEmit(clock, runs[0]!, 0, texts[1]!);
            const settled = makeEmit(clock, runs[0]!, 1, texts[2]!);
            const uncertain = makeEmit(clock, runs[0]!, 2, texts[3]!);

            await store.prepareEmit(scope, confirmed);
            await store.confirmEmit(scope, confirmed.id);
            await store.prepareEmit(scope, settled);
            await store.prepareEmit(scope, uncertain);
            await store.endTurn(scope, runs[0]!, [settled.id]);

            await store.beginTurn(scope, runs[1]!, texts[2]!, LIMITS);

            const bare: ConversationItem = {
                id: `assistant:${runs[1]}:bare`,
                role: 'assistant',
                text: texts[1]!,
                runId: runs[1]!,
                createdAt: new Date(clock.now()),
                status: 'pending',
            };

            await store.prepareEmit(scope, bare);

            const rows = await repository.items.findManyBy({ scopeId: scope.id });

            expect(rows.map((row) => [row.key, row.status])).toEqual([
                [`user:${runs[0]}`, 'sent'],
                [confirmed.id, 'sent'],
                [settled.id, 'sent'],
                [uncertain.id, 'unknown'],
                [`user:${runs[1]}`, 'sent'],
                [bare.id, 'pending'],
            ]);

            for (const row of rows) {
                expect(row.bytes, row.key).toBe(Buffer.byteLength(row.text, 'utf8'));
            }

            expect(rows.map((row) => row.bytes)).toEqual([11, 10, 17, 15, 17, 10]);
            // the item the service hands out carries no storage field
            expect((await store.findItems(scope, { limit: 10, offset: 0 })).data.every((item) => !('bytes' in item))).toBe(true);
        });

        it('lists items chronologically with paging', async () => {
            const {
                store,
                clock,
                scope,
            } = await setup();

            await completeTurn(store, clock, scope, uuidOf('run-a'), 'a', ['a1', 'a2']);

            const page = await store.findItems(scope, { limit: 2, offset: 1 });

            expect(page.total).toBe(3);
            expect(page.data.map((item) => item.id)).toEqual([`assistant:${uuidOf('run-a')}:0`, `assistant:${uuidOf('run-a')}:1`]);
            await expect(store.findItems(scope, { limit: -1, offset: 0 })).rejects.toMatchObject(INVALID);
        });

        it('no refusal names a stored value', async () => {
            const {
                store,
                clock,
                identity,
                scope,
            } = await setup();
            const secret = 'secret-note-text-1234';

            await store.beginTurn(scope, uuidOf('run-a'), secret, LIMITS);
            await store.applyNote(scope, makeSet(uuidOf('run-a'), 'k', secret));

            const errors: unknown[] = [];
            const refused = async (call: () => Promise<unknown>) => {
                await call().then(() => {
                    throw new TypeError('expected a refusal');
                }, (error: unknown) => {
                    errors.push(error);
                });
            };

            await refused(() => store.applyNote(scope, { ...makeSet(uuidOf('run-a'), 'k', secret), inputHash: 'other' }));
            await store.prepareEmit(scope, makeEmit(clock, uuidOf('run-a'), 0, secret));
            await refused(() => store.prepareEmit(scope, { ...makeEmit(clock, uuidOf('run-a'), 0, secret), text: `${secret}!` }));
            await refused(() => store.reset(identity, { keepNotes: true }));
            await store.endTurn(scope, uuidOf('run-a'), []);
            await refused(() => store.beginTurn(scope, uuidOf('run-a'), secret, LIMITS));

            expect(errors.every((error) => Error.isError(error))).toBe(true);

            for (const error of errors as Error[]) {
                expect(`${error.message} ${JSON.stringify(error)}`).not.toContain(secret);
            }
        });
    });
}
