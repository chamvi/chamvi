/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { APPROVAL_OPTIONS_MAX, DISPATCH_DEPTH_MAX, PEER_ORIGIN_MAX_LENGTH } from '@chamvi/core';
import type { ArtifactInput } from '@chamvi/core-kit';
import { Container } from 'validup';
import {
    isArrayOf,
    isBase64,
    isBoolean,
    isDefined,
    isInteger,
    isMediaType,
    isName,
    isString,
    isStringArray,
} from '../../request/validators.ts';
import { KEY_MAX_LENGTH } from '../../request/constants.ts';
import {
    APPROVAL_ID_MAX_LENGTH,
    APPROVAL_OPTION_ID_MAX_LENGTH,
    APPROVAL_REASON_MAX_LENGTH,
    ATTACHMENT_FILENAME_MAX_LENGTH,
    MAX_ATTACHMENTS,
} from '../constants.ts';
import type {
    ApproveBody,
    PeerStartBody,
    PeerStartRunBody,
    StartRunBody,
} from '../types.ts';

export function createStartRunContainer(): Container<StartRunBody> {
    const container = new Container<StartRunBody>();

    container.mount('payload', { optional: true }, isDefined());
    container.mount('idempotencyKey', { optional: true }, isString({ min: 1, max: KEY_MAX_LENGTH }));
    container.mount('address', { optional: true }, isString({ min: 1, max: KEY_MAX_LENGTH }));
    container.mount('attachments', { optional: true }, isArrayOf(createAttachmentContainer(), { max: MAX_ATTACHMENTS }));

    return container;
}

/** A peer's start: the start body with `role` and `peer` required; unknown keys are dropped. */
export function createPeerStartContainer(): Container<PeerStartRunBody> {
    const container = new Container<PeerStartRunBody>();
    const parent = new Container<PeerStartBody['parent']>();
    const peer = new Container<PeerStartBody>();

    parent.mount('runId', isString({ min: 1, max: KEY_MAX_LENGTH }));
    parent.mount('agent', isName());
    parent.mount('depth', isInteger({ min: 0, max: DISPATCH_DEPTH_MAX }));

    peer.mount('standIn', isString({ min: 1, max: KEY_MAX_LENGTH }));
    peer.mount('parent', parent);
    peer.mount('taint', isBoolean());
    peer.mount('origin', { optional: true }, isString({ min: 1, max: PEER_ORIGIN_MAX_LENGTH }));

    container.mount('payload', { optional: true }, isDefined());
    container.mount('idempotencyKey', { optional: true }, isString({ min: 1, max: KEY_MAX_LENGTH }));
    container.mount('address', { optional: true }, isString({ min: 1, max: KEY_MAX_LENGTH }));
    container.mount('attachments', { optional: true }, isArrayOf(createAttachmentContainer(), { max: MAX_ATTACHMENTS }));
    container.mount('role', isName());
    container.mount('peer', peer);

    return container;
}

/** One attachment; unknown keys are dropped. */
function createAttachmentContainer(): Container<ArtifactInput> {
    const container = new Container<ArtifactInput>();

    container.mount('mediaType', isMediaType());
    container.mount('filename', { optional: true }, isString({ min: 1, max: ATTACHMENT_FILENAME_MAX_LENGTH }));
    container.mount('data', isBase64());

    return container;
}

export function createApproveContainer(): Container<ApproveBody> {
    const container = new Container<ApproveBody>();

    container.mount('approvalId', isString({ min: 1, max: APPROVAL_ID_MAX_LENGTH }));
    container.mount('approved', isBoolean());
    container.mount('reason', { optional: true }, isString({ max: APPROVAL_REASON_MAX_LENGTH }));
    container.mount(
        'selected',
        { optional: true },
        isStringArray({ max: APPROVAL_OPTIONS_MAX, item: { min: 1, max: APPROVAL_OPTION_ID_MAX_LENGTH } }),
    );

    return container;
}
