/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createValidator } from '@validup/zod';
import { Container, createValidupError } from 'validup';
import type { ContainerInput, ContainerRunOptions } from 'validup';
import { ValidatorGroup } from '../../helpers/validator-group.ts';
import {
    opaqueStringSchema,
    recordSchema,
    revisionSchema,
    secretsWriteSchema,
} from '../../helpers/schemas/index.ts';
import { CONNECTION_ACCOUNT_ID_MAX_LENGTH, CONNECTION_GENERATION_MAX_LENGTH } from './constants.ts';
import type { ConnectionCreateBody, ConnectionSaveBody } from './types.ts';

/**
 * A connection's create (`POST /connection-types/{type}/connections`,
 * ValidatorGroup.CREATE: a ConnectionCreateBody) and save (`PUT
 * /connections/{name}/config`, ValidatorGroup.UPDATE: a ConnectionSaveBody).
 * The bodies carry secrets: no issue echoes a value. Every mount is
 * grouped, so a run without one of the two groups is refused instead of
 * returning `{}`.
 */
export class ConnectionValidator extends Container<ConnectionCreateBody | ConnectionSaveBody> {
    override async run(
        data?: ContainerInput<ConnectionCreateBody | ConnectionSaveBody>,
        options: ContainerRunOptions<ConnectionCreateBody | ConnectionSaveBody> = {},
    ): Promise<ConnectionCreateBody | ConnectionSaveBody> {
        this.assertGroup(options.group);

        return super.run(data, options);
    }

    override runSync(
        data?: ContainerInput<ConnectionCreateBody | ConnectionSaveBody>,
        options: ContainerRunOptions<ConnectionCreateBody | ConnectionSaveBody> = {},
    ): ConnectionCreateBody | ConnectionSaveBody {
        this.assertGroup(options.group);

        return super.runSync(data, options);
    }

    protected assertGroup(group: string | undefined): void {
        if (group !== ValidatorGroup.CREATE && group !== ValidatorGroup.UPDATE) {
            throw createValidupError(undefined, 'value_invalid', 'must run with the create or the update group');
        }
    }

    protected override initialize() {
        super.initialize();

        // the account id builds the name, which the connection-name rule checks
        this.mount(
            'account',
            { group: ValidatorGroup.CREATE },
            createValidator(opaqueStringSchema({ max: CONNECTION_ACCOUNT_ID_MAX_LENGTH, allowNul: false })),
        );
        this.mount('settings', { group: ValidatorGroup.CREATE }, createValidator(recordSchema()));
        this.mount('settings', { group: ValidatorGroup.UPDATE, optional: true }, createValidator(recordSchema()));
        this.mount('secrets', { group: ValidatorGroup.CREATE, optional: true }, createValidator(recordSchema()));
        this.mount('secrets', { group: ValidatorGroup.UPDATE, optional: true }, createValidator(secretsWriteSchema()));
        this.mount('revision', { group: ValidatorGroup.UPDATE }, createValidator(revisionSchema()));
        this.mount(
            'generation',
            { group: ValidatorGroup.UPDATE, optional: true },
            createValidator(opaqueStringSchema({ max: CONNECTION_GENERATION_MAX_LENGTH, allowNul: true })),
        );
    }
}
