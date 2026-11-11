/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import { defineTool } from '@chamvi/core';
import type { MailMessage } from '../client/types.ts';
import { MAIL_BODY_MAX_CHARS, MAIL_FETCH_MAX_BYTES } from '../text/constants.ts';
import {
    inputObject,
    objectSchema,
    optionalInteger,
    requireString,
    signalOf,
    taintOf,
} from './asserts.ts';
import { UNTRUSTED_NOTE } from './constants.ts';
import type { MailClientSource } from './types.ts';

type MailGetToolInput = {
    id: string;
    offset?: number;
};

export function mailGetTool(source: MailClientSource): Tool<MailGetToolInput, MailMessage> {
    return defineTool<MailGetToolInput, MailMessage>({
        trust: { taint: taintOf(source) },
        description: 'Read one mail by id: headers, the text body, summaries of calendar invites and the attachment list ' +
            `(metadata only; mail_attachment reads one). Returns at most ${MAIL_BODY_MAX_CHARS} body characters from offset; ` +
            `nextOffset names the next page. A mail above ${MAIL_FETCH_MAX_BYTES / 1024 / 1024} MiB gives headers and attachments only ` +
            `(truncated). Read only: the mail stays unread. ${UNTRUSTED_NOTE}`,
        inputSchema: objectSchema<MailGetToolInput>({
            id: {
                type: 'string',
                minLength: 1,
                description: 'A mail id from mail_search or mail_thread.',
            },
            offset: {
                type: 'integer',
                minimum: 0,
                description: 'The body character to start at, from nextOffset. Default 0.',
            },
        }, ['id']),
        execute: async (input, { abortSignal, context }) => {
            const body = inputObject(input);
            const id = requireString(body.id, 'id');
            const offset = optionalInteger(body.offset, 'offset', 0) ?? 0;

            return source(context).get(id, offset, signalOf(abortSignal, context));
        },
    });
}
