/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BadRequestError } from '@chamvi/errors';
import { isObject } from 'smob';
import type { Container } from 'validup';

/**
 * Validates a JSON object body with a validup container (in the given
 * `group`, e.g. a core-kit ValidatorGroup). A missing body reads as `{}`;
 * unknown keys are dropped.
 */
export async function validateBody<T extends Record<string, any>>(
    container: Container<T>,
    body: unknown,
    options: { group?: string } = {},
): Promise<T> {
    if (body === undefined) {
        body = {};
    }

    if (!isObject(body)) {
        throw new BadRequestError({ message: 'The request body must be a JSON object.' });
    }

    return container.run(body as Partial<T>, options);
}
