/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Logger } from 'typeorm';

/**
 * Records every statement a data source sends, for the cases that check
 * what reaches the database.
 */
export class QueryLog implements Logger {
    readonly queries: string[] = [];

    /** The bind parameters of each statement, by the index of `queries`. */
    readonly parameters: unknown[][] = [];

    logQuery(query: string, parameters?: unknown[]): void {
        this.queries.push(query);
        this.parameters.push(parameters ?? []);
    }

    logQueryError(): void {
        // a failed statement is recorded by logQuery already
    }

    logQuerySlow(): void {
        // not needed
    }

    logSchemaBuild(): void {
        // not needed
    }

    logMigration(): void {
        // not needed
    }

    log(): void {
        // not needed
    }

    clear(): void {
        this.queries.length = 0;
        this.parameters.length = 0;
    }
}
