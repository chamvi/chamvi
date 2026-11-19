/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';

export function invalidSkill(reason: string): never {
    throw new InvalidAgentDefinitionError(`Invalid skill: ${reason}.`);
}
