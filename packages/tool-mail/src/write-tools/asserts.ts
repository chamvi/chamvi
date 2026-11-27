/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import { inputObject, optionalString, requireString } from '../tools/asserts/index.ts';
import {
    MAIL_ADDRESS_PATTERN,
    MAIL_DELETE_MAX_IDS,
    MAIL_SEND_MAX_RECIPIENTS,
    MAIL_SEND_SUBJECT_MAX_CHARS,
    MAIL_SEND_TEXT_MAX_CHARS,
} from './constants.ts';
import type { MailDeleteInput, MailSendInput } from './types.ts';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;

/** Zero-width and bidi formatting characters: they hide or reorder what the owner reads in the approval. */
const FORMAT_CHARACTERS = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/;

/** Printable ASCII only: no look-alike letters, no invisible or reordering characters. */
const PRINTABLE_ASCII = /^[\x21-\x7E]+$/;

function addressesOf(value: unknown, name: string, required: boolean): string[] | undefined {
    if (value === undefined && !required) {
        return undefined;
    }

    if (!Array.isArray(value) || (required && value.length === 0)) {
        throw new ValidationError(`${name} must be ${required ? 'a non-empty' : 'an'} array of addresses.`);
    }

    return value.map((address, index) => {
        if (typeof address !== 'string' || !PRINTABLE_ASCII.test(address) || !MAIL_ADDRESS_PATTERN.test(address)) {
            throw new ValidationError(`${name}[${index}] must be one bare address such as alice@example.com: no display name, no list.`);
        }

        return address;
    });
}

/** The input of `mail_send` checked (ValidationError, before anything is read, asked or sent). */
export function parseMailSendInput(input: unknown): MailSendInput {
    const body = inputObject(input);
    const account = requireString(body.account, 'account');
    const to = addressesOf(body.to, 'to', true)!;
    const cc = addressesOf(body.cc, 'cc', false);
    const bcc = addressesOf(body.bcc, 'bcc', false);

    if (to.length + (cc?.length ?? 0) + (bcc?.length ?? 0) > MAIL_SEND_MAX_RECIPIENTS) {
        throw new ValidationError(`A mail takes at most ${MAIL_SEND_MAX_RECIPIENTS} recipients in to, cc and bcc together.`);
    }

    const { subject, text } = body;

    if (
        typeof subject !== 'string' ||
        subject.trim().length === 0 ||
        subject.length > MAIL_SEND_SUBJECT_MAX_CHARS ||
        CONTROL_CHARACTERS.test(subject) ||
        FORMAT_CHARACTERS.test(subject)
    ) {
        throw new ValidationError(`subject must be one line of 1 to ${MAIL_SEND_SUBJECT_MAX_CHARS} characters without control, zero-width or bidi characters.`);
    }

    if (typeof text !== 'string' || text.trim().length === 0 || text.length > MAIL_SEND_TEXT_MAX_CHARS) {
        throw new ValidationError(`text must be a string of 1 to ${MAIL_SEND_TEXT_MAX_CHARS} characters.`);
    }

    const inReplyTo = optionalString(body.inReplyTo, 'inReplyTo');

    return {
        account,
        to,
        ...(cc !== undefined && { cc }),
        ...(bcc !== undefined && { bcc }),
        subject,
        text,
        ...(inReplyTo !== undefined && { inReplyTo }),
    };
}

/** The input of `mail_delete` checked (ValidationError): 1 to `MAIL_DELETE_MAX_IDS` strings, deduplicated in order. */
export function parseMailDeleteInput(input: unknown): MailDeleteInput {
    const { ids } = inputObject(input);

    const valid = Array.isArray(ids) &&
        ids.length > 0 &&
        ids.length <= MAIL_DELETE_MAX_IDS &&
        ids.every((id) => typeof id === 'string' && id.length > 0);

    if (!valid) {
        throw new ValidationError(`ids must be an array of 1 to ${MAIL_DELETE_MAX_IDS} mail ids.`);
    }

    return { ids: [...new Set(ids as string[])] };
}
