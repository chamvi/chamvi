/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { ValidationError } from '../../../errors/index.ts';
import { assertDispatchKey } from '../../helpers/index.ts';
import type { PeerDispatchFields } from '../../types.ts';

/** The lineage fields a peer sent, checked and copied (a ValidationError for a malformed one). */
export function readPeerFields(fields: unknown): PeerDispatchFields {
    if (!isObject(fields) || !isObject(fields.parent)) {
        throw new ValidationError('A peer start needs a role, a stand-in and a parent.');
    }

    const { parent } = fields;

    assertDispatchKey('peer role', fields.role, true);
    assertDispatchKey('peer stand-in', fields.standIn, true);
    assertDispatchKey('peer parent run', parent.runId, true);
    assertDispatchKey('peer parent agent', parent.agent, true);
    assertDispatchKey('peer origin', fields.origin, true);

    if (fields.role === undefined || fields.standIn === undefined || parent.runId === undefined || parent.agent === undefined) {
        throw new ValidationError('A peer start needs a role, a stand-in and a parent.');
    }

    if (typeof parent.depth !== 'number' || !Number.isSafeInteger(parent.depth) || parent.depth < 0) {
        throw new ValidationError('The peer parent depth must be a non-negative integer.');
    }

    if (fields.taint !== undefined && typeof fields.taint !== 'boolean') {
        throw new ValidationError('The peer taint must be a boolean.');
    }

    return {
        role: fields.role,
        standIn: fields.standIn,
        parent: {
            runId: parent.runId,
            agent: parent.agent,
            depth: parent.depth,
        },
        taint: fields.taint === true,
        ...(fields.origin !== undefined ? { origin: fields.origin } : {}),
    };
}
