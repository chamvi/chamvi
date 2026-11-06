/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { getMetadataArgsStorage } from 'typeorm';
import { expect, it } from 'vitest';
import { STORE_ENTITIES } from '@chamvi/store-db';

it.each(STORE_ENTITIES.map((entity) => ({ name: entity.name, entity })))('$name has one UUID or bigint primary column', ({ entity }) => {
    const columns = getMetadataArgsStorage().filterColumns(entity)
        .filter((column) => column.options.primary);

    expect(columns).toHaveLength(1);
    expect(['uuid', 'bigint']).toContain(columns[0]!.options.type);
    expect(columns[0]!.options.collation).toBeUndefined();
});
