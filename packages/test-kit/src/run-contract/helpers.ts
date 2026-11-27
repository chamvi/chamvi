/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */
import type { IRunRepository } from '@chamvi/store';
import type { Run } from '@chamvi/core-kit';

export function idsOf(rows: { id: string }[]): string[] {
    return rows.map((row) => row.id);
}

export async function insert(runs: IRunRepository, run: Run): Promise<Run> {
    return runs.save(runs.create(run));
}
