/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import { defineTool } from '@chamvi/core';
import type { MailAccountView } from '../client/types.ts';
import { objectSchema, signalOf, taintOf } from './asserts.ts';
import { UNTRUSTED_NOTE } from './constants.ts';
import type { MailClientSource } from './types.ts';

export function mailAccountsTool(source: MailClientSource): Tool<Record<string, never>, MailAccountView[]> {
    return defineTool<Record<string, never>, MailAccountView[]>({
        trust: { taint: taintOf(source) },
        description: 'List the mail accounts you can read, with their folders (path and special use such as \\Sent). ' +
            `Read only: nothing in a mailbox changes. ${UNTRUSTED_NOTE}`,
        inputSchema: objectSchema<Record<string, never>>({}),
        execute: async (_, { abortSignal, context }) => source(context).accounts(signalOf(abortSignal, context)),
    });
}
