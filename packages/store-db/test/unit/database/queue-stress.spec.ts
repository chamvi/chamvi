/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ControllableClock } from '@chamvi/test-kit';
import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { closeDatabase } from '../../../src/database/index.ts';
import { queueOf } from '../../../src/entity/helpers/serialize/index.ts';
import { openFixtureDataSource } from '../../utils/entity/data-source.ts';
import type { FixtureDataSource } from '../../utils/entity/data-source.ts';
import { createFixtureRepositories } from '../../utils/entity/repositories.ts';
import type { FixtureRepositories } from '../../utils/entity/repositories.ts';

/*
 * Many concurrent callers on one guarded in-memory data source, each
 * through another way into it, interleaved at every await by a seeded
 * generator. A plan is drawn first and says, on its own, what the table
 * must hold afterwards: what a serial run of the committed units leaves.
 * The seed is in the case's name: a failure names the plan to replay.
 */

const SEEDS = 300;
const PARENTS = 'test_entity_parents';
const RECORDS = 'test_entity_records';
const COUNTER_ID = '00000000-0000-7000-8000-000000000000';
const INNER = 'the nested transaction fails';

/** A hang fails the case (the clock is never advanced: no deadline ends a wait). */
const TIMEOUT = 10_000;

const INSERT = `INSERT INTO "${PARENTS}" ("id", "name", "counter", "label", "created_at") VALUES (?, ?, 0, 'l', '2026-11-17 00:00:00.000')`;

type Kind =    'raw-save' |
    'raw-transaction' |
    'runner-transaction' |
    'runner-query' |
    'adapter-transaction' |
    'adapter-save' |
    'query' |
    'failing-query' |
    'reader';

type Unit = {
    id: string;
    kind: Kind;
    /** The rows of the unit, written in its transaction (one row for a kind without one). */
    rows: string[];
    /** The unit ends with a rollback. */
    fail: boolean;
    /** Its rows are written at once, not one after the other. */
    parallel: boolean;
    /** It increments the shared counter: read, await, write. */
    counts: boolean;
    /** A transaction inside it, with rows of its own, that commits or fails (and is caught). */
    nested: 'none' | 'commit' | 'fail';
    nestedRows: string[];
    /** `manager.transaction` with an isolation level; a nested one through the data source. */
    variant: boolean;
    /** A runner of the caller's own is released at the end, or never. */
    release: boolean;
    /** How many turns it yields at each of its awaits, in order (repeating). */
    pauses: number[];
};

/** The ways a unit's body reaches the database from inside the unit. */
type Access = {
    /** A statement through the unit's own handle. */
    query(sql: string, parameters?: unknown[]): Promise<unknown>;
    /** A row saved through the ORM (it fires the subscriber). */
    save(name: string): Promise<unknown>;
    /** A statement through another handle than the unit's own. */
    elsewhere(sql: string, parameters?: unknown[]): Promise<unknown>;
    nested(fn: (access: Access) => Promise<void>): Promise<void>;
};

/** mulberry32: a small seeded generator, the same sequence on every run. */
function generator(seed: number): () => number {
    let state = seed;

    return () => {
        state = (state + 0x6D2B79F5) | 0;

        let value = Math.imul(state ^ (state >>> 15), 1 | state);

        value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);

        return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
}

const KINDS: Kind[] = [
    'raw-save',
    'raw-transaction',
    'raw-transaction',
    'runner-transaction',
    'runner-transaction',
    'runner-query',
    'adapter-transaction',
    'adapter-transaction',
    'adapter-save',
    'query',
    'failing-query',
    'reader',
];

const TRANSACTIONS: Kind[] = ['raw-transaction', 'runner-transaction', 'adapter-transaction'];

function plan(seed: number): Unit[] {
    const random = generator(seed);
    const pick = (below: number) => Math.floor(random() * below);
    const units: Unit[] = [];
    const count = 8 + pick(17);

    for (let index = 0; index < count; index++) {
        const id = `u${index}`;
        const kind = KINDS[pick(KINDS.length)]!;
        const transaction = TRANSACTIONS.includes(kind);
        // the repository base nests without a savepoint: its nested transaction only commits
        const nested = (['none', 'commit', 'fail'] as const)[transaction ? pick(kind === 'adapter-transaction' ? 2 : 3) : 0]!;

        units.push({
            id,
            kind,
            rows: Array.from({ length: transaction ? 1 + pick(4) : 1 }, (_, row) => `${id}:${row}`),
            fail: transaction && pick(3) === 0,
            parallel: transaction && pick(3) === 0,
            counts: transaction && pick(2) === 0,
            nested,
            nestedRows: nested === 'none' ? [] : Array.from({ length: 1 + pick(2) }, (_, row) => `${id}:n${row}`),
            variant: pick(2) === 0,
            release: pick(2) === 0,
            pauses: Array.from({ length: 1 + pick(5) }, () => pick(4)),
        });
    }

    return units;
}

/** What a serial run of the plan's committed units leaves: the model the database is compared with. */
function expected(units: Unit[]) {
    const writers = units.filter((unit) => !['failing-query', 'reader'].includes(unit.kind));
    const committed = writers.filter((unit) => !unit.fail);
    const visible = new Map(writers.map((unit) => [
        unit.id,
        unit.fail ? 0 : unit.rows.length + (unit.nested === 'commit' ? unit.nestedRows.length : 0),
    ]));

    return {
        names: committed
            .flatMap((unit) => [...unit.rows, ...(unit.nested === 'commit' ? unit.nestedRows : [])])
            .sort(),
        counter: committed.filter((unit) => unit.counts).length,
        /** The rows of each unit a reader may see: all of them, or none. */
        visible,
    };
}

async function turns(count: number): Promise<void> {
    for (let turn = 0; turn < count; turn++) {
        await Promise.resolve();
    }
}

class Run {
    readonly problems: string[] = [];

    /** The rows saved through the ORM: the subscriber wrote an audit row for each. */
    readonly saved = new Set<string>();

    protected readonly dataSource: DataSource;

    protected readonly repositories: FixtureRepositories;

    protected readonly model: ReturnType<typeof expected>;

    constructor(protected readonly fixture: FixtureDataSource, protected readonly units: Unit[]) {
        this.dataSource = fixture.dataSource;
        this.repositories = createFixtureRepositories(fixture);
        this.model = expected(units);
    }

    protected row(name: string) {
        return {
            id: crypto.randomUUID(),
            name,
            note: null,
            counter: 0,
            label: 'l',
            createdAt: new Date('2026-11-17T00:00:00.000Z'),
        };
    }

    protected ofManager(manager: EntityManager): Access {
        return {
            query: (sql, parameters) => manager.query(sql, parameters),
            save: (name) => manager.getRepository(this.fixture.schemas.parent).save(this.row(name)),
            // inside a transaction's callback the data source itself joins
            elsewhere: (sql, parameters) => this.dataSource.query(sql, parameters),
            nested: (fn) => manager.transaction(async (inner) => fn(this.ofManager(inner))),
        };
    }

    /** The body every transaction of the plan runs, through whatever its kind reaches the database with. */
    protected async body(unit: Unit, access: Access): Promise<void> {
        let step = 0;
        const pause = () => turns(unit.pauses[step++ % unit.pauses.length]!);
        const write = async (target: Access, name: string, index: number) => {
            if (index % 3 === 1) {
                await target.save(name);
                this.saved.add(name);
            } else if (index % 3 === 2) {
                await target.elsewhere(INSERT, [crypto.randomUUID(), name]);
            } else {
                await target.query(INSERT, [crypto.randomUUID(), name]);
            }
        };

        await pause();

        if (unit.parallel) {
            await Promise.all(unit.rows.map((name, index) => write(access, name, index)));
        } else {
            for (const [index, name] of unit.rows.entries()) {
                await write(access, name, index);
                await pause();
            }
        }

        if (unit.counts) {
            const [row] = await access.query(`SELECT "counter" FROM "${PARENTS}" WHERE "id" = ?`, [COUNTER_ID]) as Array<{ counter: number }>;

            await pause();
            await access.query(`UPDATE "${PARENTS}" SET "counter" = ? WHERE "id" = ?`, [row!.counter + 1, COUNTER_ID]);
        }

        if (unit.nested !== 'none') {
            try {
                await access.nested(async (inner) => {
                    for (const [index, name] of unit.nestedRows.entries()) {
                        await write(inner, name, index);
                        await pause();
                    }

                    if (unit.nested === 'fail') {
                        throw new Error(INNER);
                    }
                });
            } catch (error) {
                if (!Error.isError(error) || error.message !== INNER) {
                    throw error;
                }
            }
        }

        await pause();

        if (unit.fail) {
            throw new Error(`rollback ${unit.id}`);
        }
    }

    /** A reader outside every unit sees all rows of a unit or none: never a transaction in flight. */
    protected async read(unit: Unit): Promise<void> {
        const rows = unit.variant ?
            await this.dataSource.getRepository(this.fixture.schemas.parent).find() as Array<{ name: string }> :
            await this.dataSource.query(`SELECT "name" FROM "${PARENTS}"`) as Array<{ name: string }>;
        const seen = new Map<string, number>();

        for (const { name } of rows) {
            const [id] = name.split(':');

            seen.set(id!, (seen.get(id!) ?? 0) + 1);
        }

        for (const [id, count] of seen) {
            if (this.model.visible.has(id) && count !== this.model.visible.get(id)) {
                this.problems.push(`${unit.id} read ${count} rows of ${id}, a unit of ${this.model.visible.get(id)}`);
            }
        }
    }

    protected async runnerTransaction(unit: Unit): Promise<void> {
        const runner = this.dataSource.createQueryRunner();
        const access: Access = {
            ...this.ofManager(runner.manager),
            query: (sql, parameters) => runner.query(sql, parameters),
            // outside a callback only the runner and its manager are part of the transaction
            elsewhere: (sql, parameters) => runner.manager.query(sql, parameters),
        };

        if (unit.variant) {
            await runner.query('SELECT 1');
        }

        await runner.startTransaction();

        try {
            await this.body(unit, access);
            await runner.commitTransaction();
        } catch (error) {
            await runner.rollbackTransaction();

            throw error;
        } finally {
            if (unit.release) {
                await runner.release();
            }
        }
    }

    protected async adapterTransaction(unit: Unit): Promise<void> {
        const { parents } = this.repositories;

        const access = (repository: typeof parents): Access => ({
            query: (sql, parameters) => this.dataSource.query(sql, parameters),
            save: (name) => repository.save(repository.create(this.row(name))),
            elsewhere: (sql, parameters) => this.dataSource.manager.query(sql, parameters),
            nested: (fn) => repository.transaction(async (inner) => fn(access(inner))),
        });

        await parents.transaction(async (repository) => this.body(unit, access(repository)));
    }

    protected async start(unit: Unit): Promise<void> {
        const { dataSource } = this;
        const [name] = unit.rows;

        await turns(unit.pauses[0]!);

        switch (unit.kind) {
            case 'raw-save': {
                await dataSource.getRepository(this.fixture.schemas.parent).save(this.row(name!));
                this.saved.add(name!);

                break;
            }
            case 'raw-transaction': {
                const run = async (manager: EntityManager) => this.body(unit, {
                    ...this.ofManager(manager),
                    ...(unit.variant ? { nested: (fn) => dataSource.transaction(async (inner) => fn(this.ofManager(inner))) } : {}),
                });

                await (unit.variant ? dataSource.manager.transaction('SERIALIZABLE', run) : dataSource.transaction(run));

                break;
            }
            case 'runner-transaction': {
                await this.runnerTransaction(unit);

                break;
            }
            case 'runner-query': {
                // never released
                await dataSource.createQueryRunner().query(INSERT, [crypto.randomUUID(), name]);

                break;
            }
            case 'adapter-transaction': {
                await this.adapterTransaction(unit);

                break;
            }
            case 'adapter-save': {
                await this.repositories.parents.save(this.repositories.parents.create(this.row(name!)));

                break;
            }
            case 'query': {
                await (unit.variant ? dataSource.sql`SELECT 1` : dataSource.manager.query('SELECT 1'));
                await dataSource.query(INSERT, [crypto.randomUUID(), name]);

                break;
            }
            case 'failing-query': {
                await dataSource.query('SELECT * FROM "no_such_table"');

                break;
            }
            default: {
                await this.read(unit);
            }
        }
    }

    /** Runs every unit of the plan at once and compares the outcome with the model. */
    async execute(): Promise<void> {
        const {
            dataSource,
            units,
            model,
        } = this;

        await dataSource.query(INSERT, [COUNTER_ID, 'counter']);
        // every save is audited through its event's manager: in the save's own unit
        dataSource.subscribers.push({
            beforeInsert: async (event) => {
                await event.manager.query('SELECT 1');
            },
            afterInsert: async (event) => {
                if (event.metadata.tableName === PARENTS) {
                    await event.manager.query(
                        `INSERT INTO "${RECORDS}" ("id", "scope", "name", "value") VALUES (?, 'audit', ?, 0)`,
                        [crypto.randomUUID(), (event.entity as { name: string }).name],
                    );
                }
            },
        });

        const outcomes = await Promise.allSettled(units.map((unit) => this.start(unit)));

        for (const [index, outcome] of outcomes.entries()) {
            const unit = units[index]!;
            const message = outcome.status === 'rejected' ? String((outcome.reason as Error).message) : undefined;
            const wanted = unit.fail ? `rollback ${unit.id}` : undefined;

            if (unit.kind === 'failing-query' ? !message?.includes('no_such_table') : message !== wanted) {
                this.problems.push(`${unit.id} (${unit.kind}) ended with ${message ?? 'success'}, the plan says ${wanted ?? 'success'}`);
            }
        }

        const rows = await dataSource.query(`SELECT "name", "counter" FROM "${PARENTS}" ORDER BY "name"`) as Array<{ name: string; counter: number }>;
        const audits = await dataSource.query(`SELECT "name" FROM "${RECORDS}" ORDER BY "name"`) as Array<{ name: string }>;
        const names = rows.map((row) => row.name).filter((name) => name !== 'counter');
        const audited = audits.map((row) => row.name);

        expect(this.problems).toEqual([]);
        expect(names).toEqual(model.names);
        expect(rows.find((row) => row.name === 'counter')?.counter).toBe(model.counter);
        // an audit row lives and dies with its save: one per committed save, none of a rolled back one
        expect(audited.filter((name) => !names.includes(name))).toEqual([]);
        expect([...this.saved].filter((name) => names.includes(name) && audited.filter((audit) => audit === name).length !== 1)).toEqual([]);
    }
}

describe('a guarded better-sqlite3 data source under concurrent callers', () => {
    it.each(Array.from({ length: SEEDS }, (_, seed) => seed + 1))('seed %d: the table holds what a serial run of the committed units leaves', async (seed) => {
        const clock = new ControllableClock(new Date('2026-11-17T00:00:00.000Z'));
        const fixture = await openFixtureDataSource('better-sqlite3', { guard: { clock } });
        const queue = queueOf(fixture.dataSource);

        try {
            await new Run(fixture, plan(seed)).execute();
        } finally {
            await closeDatabase(fixture.dataSource);
        }

        // nothing is left behind: no holder, no waiter, no timer
        expect([fixture.dataSource.isInitialized, queue.unit, queue.waiters.length, queue.timer]).toEqual([false, undefined, 0, undefined]);
    }, TIMEOUT);
});
