/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { InvalidAgentDefinitionError, inject } from '@chamvi/core';
import { isObject } from 'smob';
import { createMailClient } from '../client/module.ts';
import type { IMailClient } from '../client/types.ts';
import { MAIL_CONTEXT } from '../context/constants.ts';
import { normalizeTiming } from '../options/module.ts';
import type { MailToolsOptions } from '../options/types.ts';
import { mailAccountsTool } from './accounts.ts';
import { mailAttachmentTool } from './attachment.ts';
import { mailGetTool } from './get.ts';
import { mailSearchTool } from './search.ts';
import { mailThreadTool } from './thread.ts';
import type { MailClientSource } from './types.ts';

const CLIENT_METHODS = ['accounts', 'search', 'get', 'attachment', 'thread', 'close'] as const;

function isMailClient(value: unknown): value is IMailClient {
    return isObject(value) && CLIENT_METHODS.every((name) => typeof value[name] === 'function');
}

function sourceOf(options: MailToolsOptions): MailClientSource {
    if (!isObject(options)) {
        throw new InvalidAgentDefinitionError('mailTools() options must be an object.');
    }

    const timing = normalizeTiming(options, 'mailTools()');

    if (options.client !== undefined) {
        if (!isMailClient(options.client)) {
            throw new InvalidAgentDefinitionError('mailTools() client must be a mail client (createMailClient()).');
        }

        const { client } = options;

        return () => client;
    }

    if (options.accounts !== undefined) {
        const client = createMailClient(options.accounts, timing);

        return () => client;
    }

    // the client the mail module provided; ContextNotProvidedError (a tool error) without one
    return (context) => inject(context, MAIL_CONTEXT);
}

/**
 * The read-only mail tools: `mail_accounts`, `mail_search`, `mail_get`, `mail_attachment` and `mail_thread`.
 * They use `client`, else a client of `accounts`, else the client the mail module provided on the engine.
 * Options are checked when called (InvalidAgentDefinitionError).
 */
export function mailTools(options: MailToolsOptions = {}): ToolSet {
    const source = sourceOf(options);

    return {
        mail_accounts: mailAccountsTool(source),
        mail_search: mailSearchTool(source),
        mail_get: mailGetTool(source),
        mail_attachment: mailAttachmentTool(source),
        mail_thread: mailThreadTool(source),
    };
}
