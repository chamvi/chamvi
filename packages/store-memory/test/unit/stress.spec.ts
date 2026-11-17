/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import {
    EntityConflictError,
    EntityDeadlockError,
    EntityRelationError,
} from '@chamvi/store';
import type { EntityRecord } from '@chamvi/store';
import { MemoryEntityRepository } from '@chamvi/store-memory';
import { ProbedRegistry } from '../utils/probed-registry.ts';

type Parent = {
    id: string;
    name: string;
    counter: number
};

type Child = { id: string; parentId: string };

type Op = { kind: 'read' | 'list' | 'remove' | 'orphan'; id: string } |
    {
        kind: 'bump';
        id: string;
        name?: string
    } |
    {
        kind: 'create';
        id: string;
        name: string
    } |
    {
        kind: 'adopt';
        id: string;
        parentId: string
    };

type Step = {
    mode: 'await' | 'swallow' | 'all' | 'settled' | 'float' | 'throw';
    ops: Op[];
    pause: number;
};

type Script = { entity: 'parent' | 'child'; steps: Step[] };

type Created = {
    entity: Parent;
    transaction: number;
    saved: boolean;
};

const ITERATIONS = 500;

const SETTLE_TIMEOUT_MS = 1000;

/**
 * mulberry32: a seeded generator of numbers in [0, 1).
 */
function createRandom(seed: number): () => number {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6D_2B_79_F5) >>> 0;

        let value = state;

        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

        return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
}

function pick<V>(random: () => number, values: V[]): V {
    return values[Math.floor(random() * values.length)]!;
}

function shuffle<V>(random: () => number, values: V[]): V[] {
    const output = [...values];

    for (let index = output.length - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1));

        [output[index], output[other]] = [output[other]!, output[index]!];
    }

    return output;
}

async function ticks(count: number): Promise<void> {
    for (let index = 0; index < count; index++) {
        await Promise.resolve();
    }
}

class ProbedRepository<T extends EntityRecord> extends MemoryEntityRepository<T> {
    isCreated(entity: T): boolean {
        return this.created.has(entity);
    }
}

type World = {
    registry: ProbedRegistry;
    parents: ProbedRepository<Parent>;
    children: ProbedRepository<Child>;
    /** Calls a script did not await. */
    floating: Promise<unknown>[];
    created: Created[];
};

function createWorld(): World {
    const registry = new ProbedRegistry();

    return {
        registry,
        parents: new ProbedRepository<Parent>({
            entity: 'parent',
            registry,
            key: ['id'],
            unique: [['name']],
        }),
        children: new ProbedRepository<Child>({
            entity: 'child',
            registry,
            key: ['id'],
            references: [{ field: 'parentId', entity: 'parent' }],
        }),
        floating: [],
        created: [],
    };
}

/**
 * One transaction's steps. Calls that run at the same time in one
 * transaction (a parallel group, a call not awaited and everything after
 * it) get rows of their own, so the order of its writes is the script's.
 */
function createScript(random: () => number, rows: string[], names: string[], kids: string[]): Script {
    const entity = random() < 0.25 ? 'child' : 'parent';
    const floating = new Set<string>();
    const steps: Step[] = [];
    const count = 1 + Math.floor(random() * 4);

    for (let index = 0; index < count; index++) {
        const pause = Math.floor(random() * 4);
        const roll = random();

        if (roll < 0.06) {
            steps.push({
                mode: 'throw',
                ops: [],
                pause,
            });

            break;
        }

        let mode: Step['mode'] = 'float';

        if (roll < 0.45) {
            mode = 'await';
        } else if (roll < 0.6) {
            mode = 'swallow';
        } else if (roll < 0.78) {
            mode = 'all';
        } else if (roll < 0.9) {
            mode = 'settled';
        }

        const size = mode === 'all' || mode === 'settled' ? 2 + Math.floor(random() * 2) : 1;
        const ids = shuffle(random, (entity === 'parent' ? rows : kids).filter((id) => !floating.has(id))).slice(0, size);
        const ops = ids.map((id): Op => {
            const kind = random();

            if (entity === 'child') {
                if (kind < 0.6) {
                    return {
                        kind: 'adopt',
                        id,
                        parentId: pick(random, rows),
                    };
                }

                return { kind: kind < 0.9 ? 'orphan' : 'read', id };
            }

            if (kind < 0.2) {
                return { kind: 'read', id };
            }

            if (kind < 0.55) {
                return {
                    kind: 'bump',
                    id,
                    name: random() < 0.4 ? pick(random, names) : undefined,
                };
            }

            if (kind < 0.75) {
                return {
                    kind: 'create',
                    id,
                    name: pick(random, names),
                };
            }

            return { kind: kind < 0.92 ? 'remove' : 'list', id };
        });

        if (ops.length === 0) {
            continue;
        }

        if (mode === 'float') {
            floating.add(ops[0]!.id);
        }

        steps.push({
            mode,
            ops,
            pause,
        });
    }

    return { entity, steps };
}

async function applyToParents(world: World, repository: MemoryEntityRepository<Parent>, transaction: number, op: Op): Promise<void> {
    switch (op.kind) {
        case 'bump': {
            const row = await repository.findOneById(op.id);

            if (row) {
                repository.merge(row, { counter: row.counter + 1, ...(op.name ? { name: op.name } : {}) });
                await repository.save(row);
            }

            break;
        }
        case 'create': {
            const record: Created = {
                entity: repository.create({
                    id: op.id,
                    name: op.name,
                    counter: 0,
                }),
                transaction,
                saved: false,
            };

            world.created.push(record);
            await repository.save(record.entity);
            record.saved = true;

            break;
        }
        case 'remove': {
            const row = await repository.findOneById(op.id);

            if (row) {
                await repository.remove(row);
            }

            break;
        }
        case 'list': {
            await repository.findManyBy({});

            break;
        }
        default: {
            await repository.findOneById(op.id);
        }
    }
}

async function applyToChildren(repository: MemoryEntityRepository<Child>, op: Op): Promise<void> {
    if (op.kind === 'adopt') {
        await repository.upsert(repository.create({ id: op.id, parentId: op.parentId }));

        return;
    }

    const row = await repository.findOneById(op.id);

    if (row && op.kind === 'orphan') {
        await repository.remove(row);
    }
}

async function runSteps(world: World, steps: Step[], call: (op: Op) => Promise<void>): Promise<void> {
    for (const step of steps) {
        await ticks(step.pause);

        switch (step.mode) {
            case 'throw': {
                throw new Error('stop');
            }
            case 'await': {
                await call(step.ops[0]!);

                break;
            }
            case 'swallow': {
                try {
                    await call(step.ops[0]!);
                } catch {
                    // swallowed: an aborted transaction still fails as a whole
                }

                break;
            }
            case 'all': {
                await Promise.all(step.ops.map((op) => call(op)));

                break;
            }
            case 'settled': {
                await Promise.allSettled(step.ops.map((op) => call(op)));

                break;
            }
            default: {
                world.floating.push(call(step.ops[0]!).catch(() => undefined));
            }
        }
    }
}

function runScript(world: World, script: Script): Promise<void> {
    if (script.entity === 'child') {
        return world.children.transaction((repository) => runSteps(world, script.steps, (op) => applyToChildren(repository, op)));
    }

    return world.parents.transaction((repository) => {
        // `begin()` ran in this step
        const { id } = world.registry.transactions.at(-1)!;

        return runSteps(world, script.steps, (op) => applyToParents(world, repository, id, op));
    });
}

/**
 * The committed transactions, replayed one after the other in the order of
 * their commits: every write must be valid on the rows the transactions
 * before it left (a counter one above the stored one, a free key and name
 * for a new row, an existing parent, no child left behind).
 */
function replay(world: World, first: number): {
    parents: Map<string, Parent>;
    children: Map<string, Child>;
    findings: string[]
} {
    const parents = new Map<string, Parent>();
    const children = new Map<string, Child>();
    const findings: string[] = [];

    for (const id of world.registry.commits) {
        for (const write of world.registry.writes.get(id) ?? []) {
            const at = `transaction ${id}, ${write.entity} ${write.key}`;

            if (write.entity === 'child') {
                if (write.row) {
                    children.set(write.key, write.row as Child);
                } else {
                    children.delete(write.key);
                }

                continue;
            }

            const stored = parents.get(write.key);
            const row = write.row as Parent | null;

            if (!row) {
                if (!stored) {
                    findings.push(`${at}: removed a row that was not there`);
                }

                parents.delete(write.key);

                continue;
            }

            if (id >= first && row.counter !== (stored ? stored.counter + 1 : 0)) {
                findings.push(`${at}: wrote counter ${row.counter} over ${stored?.counter}`);
            }

            const taken = parents.values().some((other) => other.id !== row.id && other.name === row.name);

            if (taken) {
                findings.push(`${at}: wrote a name another row holds`);
            }

            parents.set(write.key, row);
        }

        // what a commit must leave: every child has its paren
        const orphaned = children.values().some((child) => !parents.has(JSON.stringify([child.parentId])));

        if (orphaned) {
            findings.push(`transaction ${id}: left a child without its parent`);
        }
    }

    return {
        parents,
        children,
        findings,
    };
}

async function runIteration(seed: number): Promise<void> {
    const random = createRandom(seed);
    const world = createWorld();
    // every fourth run gives each transaction rows, names and children of its own
    const disjoint = seed % 4 === 3;
    const total = 2 + Math.floor(random() * 5);
    const scripts: Script[] = [];

    for (let index = 0; index < total; index++) {
        const prefix = disjoint ? `${index}-` : '';
        const rows = ['a', 'b', 'c', 'd'].map((id) => `${prefix}${id}`);

        // the first two rows of a script exist from the star
        for (const id of rows.slice(0, 2)) {
            if (disjoint || index === 0) {
                await world.parents.save(world.parents.create({
                    id,
                    name: `${id}-name`,
                    counter: 0,
                }));
            }
        }

        scripts.push(createScript(
            random,
            rows,
            ['n1', 'n2', 'n3'].map((name) => `${prefix}${name}`),
            ['k1', 'k2'].map((id) => `${prefix}${id}`),
        ));
    }

    const first = world.registry.transactions.length + 1;
    const runs: Promise<void>[] = [];

    for (const script of scripts) {
        runs.push(runScript(world, script));
        await ticks(Math.floor(random() * 3));
    }

    // (a) everything settles: the transactions, then the calls they did not awai
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), SETTLE_TIMEOUT_MS);
    });
    const settled = await Promise.race([
        Promise.allSettled(runs).then(async (results) => {
            await Promise.all(world.floating);

            return results;
        }),
        timeout,
    ]);

    clearTimeout(timer);

    if (settled === 'timeout') {
        throw new Error('the transactions did not settle');
    }

    // (b) no refusal without a cycle, no cycle left waiting, no rule of the locks broken
    expect(world.registry.findings).toEqual([]);

    const reasons = settled.map((result) => (result.status === 'rejected' ? result.reason as unknown : undefined));

    for (const [index, reason] of reasons.entries()) {
        const transaction = world.registry.transactions[first - 1 + index]!;
        const stopped = Error.isError(reason) && reason.message === 'stop';
        const storage = reason instanceof EntityConflictError ||
            reason instanceof EntityRelationError ||
            reason instanceof EntityDeadlockError;

        // nothing but the script's own throw and the storage errors
        expect(reason === undefined || stopped || storage, `transaction ${transaction.id}: ${String(reason)}`).toBe(true);
        // committed exactly when it resolved, and never when a storage error aborted i
        expect(world.registry.commits.includes(transaction.id)).toBe(reason === undefined);
        expect(reason === undefined && transaction.aborted !== undefined).toBe(false);
    }

    if (disjoint) {
        expect(world.registry.refusals).toBe(0);
        expect(reasons.filter((reason) => reason instanceof EntityDeadlockError)).toEqual([]);
    }

    // (c) nothing is locked and nothing waits
    expect(world.registry.isIdle()).toBe(true);

    // the rows are those the commits leave, replayed one after the other
    const expected = replay(world, first);
    const byId = (left: { id: string }, right: { id: string }) => left.id.localeCompare(right.id);

    expect(expected.findings).toEqual([]);
    expect((await world.parents.findManyBy({})).toSorted(byId)).toEqual(expected.parents.values().toArray().toSorted(byId));
    expect((await world.children.findManyBy({})).toSorted(byId)).toEqual(expected.children.values().toArray().toSorted(byId));

    // an entity object stays a created one unless its save was committed
    for (const record of world.created) {
        const committed = record.saved && world.registry.commits.includes(record.transaction);

        expect(world.parents.isCreated(record.entity), `created mark of ${record.entity.id}`).toBe(!committed);
    }
}

describe('memory transactions under random interleavings', () => {
    it('settle, are refused only on a cycle and leave no lock behind', async () => {
        const base = Number(process.env.STORE_MEMORY_STRESS_SEED ?? 20_261_116);

        for (let index = 0; index < ITERATIONS; index++) {
            const seed = base + index;

            try {
                await runIteration(seed);
            } catch (error) {
                throw new Error(`seed ${seed} (rerun with STORE_MEMORY_STRESS_SEED=${seed}): ${(error as Error).message}`, { cause: error });
            }
        }
    }, 20_000);
});
