/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import { createDatabase, dropDatabase } from 'typeorm-extension';
import { closeDatabase, connectDatabase } from '../database/connect.ts';
import { POSTGRES_PROTOCOLS } from '../database/constants.ts';
import { toUnavailable } from '../database/helpers.ts';
import { DatabaseOptionsError } from '../error/options.ts';
import { DatabaseUnavailableError } from '../error/unavailable.ts';
import {
    MAINTENANCE_DATABASE,
    MIGRATION_DATABASE_URL_VARIABLE,
    MISSING_DATABASE_CODE,
    SCRATCH_ALLOWED_PARAMETERS,
    SCRATCH_DATABASE_PATTERN,
    SCRATCH_MARKER,
    SCRATCH_SSL_MODES,
} from './constants.ts';
import { isSameDatabase } from './same-database.ts';
import type { ScratchConnection, ScratchDatabase } from './types.ts';

/** What the scratch database is and is marked with, as the server answers. */
type ScratchState = {
    /** `current_database()`: the database the server connected to. */
    database: string;
    /** The database's comment. */
    comment: string | null;
};

const VARIABLE = MIGRATION_DATABASE_URL_VARIABLE;

function decode(text: string): string {
    try {
        return decodeURIComponent(text);
    } catch {
        throw new DatabaseOptionsError(`${VARIABLE} has a user or password that is not valid percent-encoding.`);
    }
}

/**
 * The one parse of `MIGRATION_DATABASE_URL` every step of
 * `generate` uses: host, port, user, password, database and TLS as
 * explicit connection options, so the database the guard inspects, the
 * drop and create reach, the marker is written on, the migrations run in
 * and the last drop removes is one database, whatever TypeORM's or the
 * driver's own URL parser would read. Refused: no URL, not PostgreSQL, a
 * fragment, a host that is no plain name or IPv4 address, a database
 * that is no plain name, a query parameter other than `sslmode` (`disable`, `require`,
 * `verify-ca`, `verify-full`) and `application_name`, and a URL naming the database `DATABASE_URL` names
 * in any spelling. A message never holds the URL.
 */
export function parseScratchUrl(scratchUrl: string | undefined, url: string | undefined): ScratchDatabase {
    if (scratchUrl === undefined || scratchUrl.length === 0) {
        throw new DatabaseOptionsError(
            `${VARIABLE} is required: generate builds the schema in a throwaway PostgreSQL database it creates and drops, never in DATABASE_URL's.`,
        );
    }

    const parsed = URL.canParse(scratchUrl) ? new URL(scratchUrl) : undefined;

    if (!parsed || !POSTGRES_PROTOCOLS.includes(parsed.protocol)) {
        throw new DatabaseOptionsError(`${VARIABLE} must be an absolute URL with one of the protocols ${POSTGRES_PROTOCOLS.join(', ')}.`);
    }

    if (scratchUrl.includes('#')) {
        throw new DatabaseOptionsError(`${VARIABLE} cannot have a fragment ("#..."): parsers disagree on where its database name ends.`);
    }

    if (parsed.hostname.length === 0 || /[%[\]]/.test(parsed.hostname)) {
        throw new DatabaseOptionsError(`${VARIABLE} must name its host by a name or an IPv4 address, without percent-encoding.`);
    }

    const name = parsed.pathname.replace(/^\//, '');

    if (!SCRATCH_DATABASE_PATTERN.test(name)) {
        throw new DatabaseOptionsError(
            `${VARIABLE} must name its database by a plain name (letters, digits, "_" and "-", no percent-encoding, no trailing slash).`,
        );
    }

    const refused = [...new Set(parsed.searchParams.keys())].filter((key) => !SCRATCH_ALLOWED_PARAMETERS.includes(key));

    if (refused.length > 0) {
        throw new DatabaseOptionsError(
            `${VARIABLE} cannot set ${refused.join(', ')} in its query: only ${SCRATCH_ALLOWED_PARAMETERS.join(' and ')} are taken.`,
        );
    }

    const sslmode = parsed.searchParams.get('sslmode') ?? 'disable';

    if (!Object.hasOwn(SCRATCH_SSL_MODES, sslmode)) {
        throw new DatabaseOptionsError(`${VARIABLE}'s sslmode must be one of ${Object.keys(SCRATCH_SSL_MODES).join(', ')}.`);
    }

    if (url !== undefined && isSameDatabase(url, scratchUrl)) {
        throw new DatabaseOptionsError(
            `${VARIABLE} names the database DATABASE_URL names: generate drops and creates it. Name a throwaway database of its own.`,
        );
    }

    const ssl = SCRATCH_SSL_MODES[sslmode];
    const applicationName = parsed.searchParams.get('application_name') ?? undefined;

    return {
        name,
        host: parsed.hostname,
        port: parsed.port.length > 0 ? Number(parsed.port) : 5432,
        username: decode(parsed.username),
        password: decode(parsed.password),
        ...(ssl !== undefined && { ssl }),
        ...(applicationName !== undefined && { applicationName }),
    };
}

/** The connection options of `database` (default the scratch database itself) on the scratch server; never a URL. */
export function scratchConnection(scratch: ScratchDatabase, database: string = scratch.name): ScratchConnection {
    return {
        type: 'postgres',
        host: scratch.host,
        port: scratch.port,
        username: scratch.username,
        password: scratch.password,
        database,
        ...(scratch.ssl !== undefined && { ssl: scratch.ssl }),
        ...(scratch.applicationName !== undefined && { applicationName: scratch.applicationName }),
    };
}

async function connectScratch(scratch: ScratchDatabase, connectTimeoutMs: number): Promise<DataSource> {
    return connectDatabase({
        ...scratchConnection(scratch),
        entities: [],
        migrations: [],
        synchronize: false,
        migrationsRun: false,
        installExtensions: false,
        logging: false,
        connectTimeoutMS: connectTimeoutMs,
    });
}

async function readState(dataSource: DataSource): Promise<ScratchState> {
    try {
        const [row] = await dataSource.query(
            `SELECT current_database() AS "database",
                (SELECT shobj_description(d.oid, 'pg_database') FROM pg_database d
                    WHERE d.datname = current_database()) AS "comment"`,
        ) as ScratchState[];

        return row!;
    } catch (error) {
        throw toUnavailable('inspect', error);
    }
}

/**
 * Refuses a connection that reached another database than the scratch
 * one (a pooler or proxy routing the name elsewhere), and, when `marked`
 * is required, one whose database does not carry the marker.
 */
function assertState(state: ScratchState, scratch: ScratchDatabase, marked: boolean): void {
    if (state.database !== scratch.name) {
        throw new DatabaseOptionsError(
            `${VARIABLE} reaches another database than it names (a pooler or proxy in between?): generate works only on a direct connection.`,
        );
    }

    if (marked && state.comment !== SCRATCH_MARKER) {
        throw new DatabaseOptionsError(
            `${VARIABLE} names a database that exists and was not created by generate. Name a database that does not exist ` +
            '(generate creates it and drops it again), or drop the stale one by hand.',
        );
    }
}

/**
 * The server-side guard, before anything is dropped: the scratch
 * database must not exist, or be a leftover of a `generate` that
 * crashed, carrying the marker it writes right after creating it. Any
 * other existing database, empty or not, is refused, and so is a
 * connection the server routes to another database. Resolves `true` for
 * a marked leftover (the only database `recreateScratch` may drop),
 * `false` when none exists.
 */
export async function assertScratchDisposable(scratch: ScratchDatabase, connectTimeoutMs: number): Promise<boolean> {
    let dataSource: DataSource;

    try {
        dataSource = await connectScratch(scratch, connectTimeoutMs);
    } catch (error) {
        if (error instanceof DatabaseUnavailableError && error.driverCode === MISSING_DATABASE_CODE) {
            return false;
        }

        throw error;
    }

    try {
        assertState(await readState(dataSource), scratch, true);

        return true;
    } finally {
        await closeDatabase(dataSource);
    }
}

function maintenance(scratch: ScratchDatabase) {
    return { options: scratchConnection(scratch), initialDatabase: MAINTENANCE_DATABASE };
}

/**
 * Drops the scratch database on one connection to the maintenance
 * database. With `marked`, only while the database still carries the
 * marker, read on that connection right before the drop: a database that
 * lost it since the guard looked is refused and kept (what remains is
 * the time between that read and the drop). A database already gone is
 * left alone.
 */
async function dropOnMaintenance(scratch: ScratchDatabase, marked: boolean, connectTimeoutMs: number): Promise<void> {
    const dataSource = await connectDatabase({
        ...scratchConnection(scratch, MAINTENANCE_DATABASE),
        entities: [],
        migrations: [],
        synchronize: false,
        migrationsRun: false,
        installExtensions: false,
        logging: false,
        connectTimeoutMS: connectTimeoutMs,
    });

    try {
        if (marked) {
            let rows: { comment: string | null }[];

            try {
                // a database's comment by its name: TypeORM has no query for a shared catalog
                rows = await dataSource.query(
                    'SELECT shobj_description(d.oid, \'pg_database\') AS "comment" FROM pg_database d WHERE d.datname = $1',
                    [scratch.name],
                );
            } catch (error) {
                throw toUnavailable('inspect', error);
            }

            if (rows.length === 0) {
                return;
            }

            if (rows[0]!.comment !== SCRATCH_MARKER) {
                throw new DatabaseOptionsError(
                    `${VARIABLE} names a database that lost the marker generate writes before it could be dropped: ` +
                    'it is kept. Name a database that does not exist, or drop the stale one by hand.',
                );
            }
        }

        try {
            // DROP DATABASE has no ORM form; a name SCRATCH_DATABASE_PATTERN allows, so quoting it is enough
            await dataSource.query(`DROP DATABASE IF EXISTS "${scratch.name}"`);
        } catch (error) {
            throw toUnavailable('drop', error);
        }
    } finally {
        await closeDatabase(dataSource);
    }
}

/**
 * Drops the marked leftover the guard found (`leftover`) when it still
 * carries the marker, creates the scratch database and marks it as
 * generate's own at once. Without a leftover nothing is dropped first: a
 * database that appeared under the name since the guard looked makes the
 * create fail instead. A failure after the create and before the marker
 * (the server reports another database, the comment fails) drops the
 * database this call created, so no unmarked one refuses later runs.
 */
export async function recreateScratch(scratch: ScratchDatabase, leftover: boolean, connectTimeoutMs: number): Promise<void> {
    if (leftover) {
        await dropOnMaintenance(scratch, true, connectTimeoutMs);
    }

    try {
        await createDatabase({
            ...maintenance(scratch),
            ifNotExist: false,
            synchronize: false,
        });
    } catch (error) {
        throw toUnavailable('create', error);
    }

    try {
        const dataSource = await connectScratch(scratch, connectTimeoutMs);

        try {
            assertState(await readState(dataSource), scratch, false);
            // a name SCRATCH_DATABASE_PATTERN allows, so quoting it is enough
            await dataSource.query(`COMMENT ON DATABASE "${scratch.name}" IS '${SCRATCH_MARKER}'`);
        } finally {
            await closeDatabase(dataSource);
        }
    } catch (error) {
        const failure = error instanceof DatabaseOptionsError ? error : toUnavailable('create', error);

        try {
            // created by this call (the create refuses an existing name): nothing else is dropped
            await dropOnMaintenance(scratch, false, connectTimeoutMs);
        } catch {
            // the failure that matters is the first one
        }

        throw failure;
    }
}

/**
 * Before anything is written through `dataSource`: it is connected to
 * the scratch database, and that database carries the marker.
 */
export async function assertScratchConnection(dataSource: DataSource, scratch: ScratchDatabase): Promise<void> {
    assertState(await readState(dataSource), scratch, true);
}

/** Drops the scratch database, when it exists. */
export async function dropScratch(scratch: ScratchDatabase): Promise<void> {
    try {
        await dropDatabase({ ...maintenance(scratch), ifExist: true });
    } catch (error) {
        throw toUnavailable('drop', error);
    }
}
