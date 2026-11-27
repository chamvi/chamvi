/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createValidator } from '@validup/zod';
import { Container } from 'validup';
import {
    arraySchema,
    base64Schema,
    definedSchema,
    mediaTypeSchema,
    objectSchema,
    stringSchema,
} from '../../helpers/schemas/index.ts';
import { ATTACHMENT_FILENAME_MAX_LENGTH, MAX_ATTACHMENTS } from '../artifact/constants.ts';
import { TRIGGER_KEY_MAX_LENGTH } from '../trigger/constants.ts';
import type { StartRunBody } from './types.ts';

/**
 * A run's start (`POST /agents/{name}/runs`); unknown keys, also of an
 * attachment, are dropped. Attachment data stays base64 (strict, zero pad bits).
 */
export class RunValidator<T extends StartRunBody = StartRunBody> extends Container<T> {
    protected override initialize() {
        super.initialize();

        this.mount('payload', { optional: true }, createValidator(definedSchema()));
        this.mount('idempotencyKey', { optional: true }, createValidator(stringSchema({ min: 1, max: TRIGGER_KEY_MAX_LENGTH })));
        this.mount('address', { optional: true }, createValidator(stringSchema({ min: 1, max: TRIGGER_KEY_MAX_LENGTH })));

        const attachment = objectSchema({
            mediaType: mediaTypeSchema(),
            filename: stringSchema({ min: 1, max: ATTACHMENT_FILENAME_MAX_LENGTH }).optional(),
            data: base64Schema(),
        });

        this.mount(
            'attachments',
            { optional: true },
            createValidator(arraySchema(attachment, { max: MAX_ATTACHMENTS, noun: 'items' })),
        );
    }
}
