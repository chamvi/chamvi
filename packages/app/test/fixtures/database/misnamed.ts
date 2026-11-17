/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MigrationInterface } from 'typeorm';

/** A migration class TypeORM refuses: its name ends in no timestamp. */
export class Misnamed implements MigrationInterface {
    async up(): Promise<void> {
        // never run
    }

    async down(): Promise<void> {
        // never run
    }
}
