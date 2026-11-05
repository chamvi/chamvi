/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import { ValidationError, defineTool } from '@chamvi/core';
import type { MailAttachmentText } from '../client/types.ts';
import { MAIL_ATTACHMENT_MAX_CHARS } from '../text/constants.ts';
import {
    inputObject,
    objectSchema,
    optionalInteger,
    requireString,
    signalOf,
} from './asserts.ts';
import { UNTRUSTED_NOTE } from './constants.ts';
import type { MailClientSource } from './types.ts';

type MailAttachmentToolInput = {
    id: string;
    index: number;
    offset?: number;
};

export function mailAttachmentTool(source: MailClientSource): Tool<MailAttachmentToolInput, MailAttachmentText> {
    return defineTool<MailAttachmentToolInput, MailAttachmentText>({
        trust: { taint: true },
        description: 'Read the text of one attachment of a mail: PDF (first pages), docx, xlsx, pptx and text files. ' +
            `Other types give no text. Returns at most ${MAIL_ATTACHMENT_MAX_CHARS} characters from offset; nextOffset ` +
            `names the next page. Read only: the mail stays unread. ${UNTRUSTED_NOTE}`,
        inputSchema: objectSchema<MailAttachmentToolInput>({
            id: {
                type: 'string',
                minLength: 1,
                description: 'A mail id from mail_search or mail_thread.',
            },
            index: {
                type: 'integer',
                minimum: 0,
                description: 'The attachment index from mail_get.',
            },
            offset: {
                type: 'integer',
                minimum: 0,
                description: 'The character to start at, from nextOffset. Default 0.',
            },
        }, ['id', 'index']),
        execute: async (input, { abortSignal, context }) => {
            const body = inputObject(input);
            const id = requireString(body.id, 'id');
            const index = optionalInteger(body.index, 'index', 0);
            const offset = optionalInteger(body.offset, 'offset', 0) ?? 0;

            if (index === undefined) {
                throw new ValidationError('index must be an integer from 0.');
            }

            return source(context).attachment(id, index, offset, signalOf(abortSignal, context));
        },
    });
}
