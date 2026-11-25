/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { InvalidAgentDefinitionError, inject } from '@chamvi/core';
import { isObject } from 'smob';
import { MAIL_WRITE_CONTEXT } from '../context/constants.ts';
import { normalizeAccounts, normalizeTiming } from '../options/module.ts';
import { normalizeSmtp } from '../write-client/asserts.ts';
import { createMailWriteClient } from '../write-client/module.ts';
import type { IMailWriteClient } from '../write-client/types.ts';
import { mailSendTool } from './send.ts';
import type { MailWriteClientSource, MailWriteToolsOptions } from './types.ts';

const CALLER = 'mailWriteTools()';

const CLIENT_METHODS = ['account', 'send', 'findSent', 'describe', 'trash', 'replyHeaders', 'close'] as const;

function isMailWriteClient(value: unknown): value is IMailWriteClient {
    return isObject(value) && CLIENT_METHODS.every((name) => typeof value[name] === 'function');
}

function sourceOf(options: MailWriteToolsOptions): MailWriteClientSource {
    if (!isObject(options)) {
        throw new InvalidAgentDefinitionError(`${CALLER} options must be an object.`);
    }

    const timing = normalizeTiming(options, CALLER);

    if (options.classifier !== undefined && !isObject(options.classifier)) {
        throw new InvalidAgentDefinitionError(`${CALLER} classifier must be an object.`);
    }

    if (options.client !== undefined) {
        if (!isMailWriteClient(options.client)) {
            throw new InvalidAgentDefinitionError(`${CALLER} client must be a mail write client (createMailWriteClient()).`);
        }

        const { client } = options;

        return () => client;
    }

    if (options.accounts !== undefined) {
        // checked here, so errors name this factory, never a value
        normalizeAccounts(options.accounts, CALLER);
        options.accounts.forEach((account, index) => {
            if (account.smtp !== undefined) {
                normalizeSmtp(account.smtp, `${CALLER} accounts[${index}].smtp`);
            }
        });

        const client = createMailWriteClient(options.accounts, timing);

        return () => client;
    }

    // the client the mail module provided; ContextNotProvidedError (a tool error) without one
    return (context) => inject(context, MAIL_WRITE_CONTEXT);
}

/**
 * The mail write tools: `mail_send` (SMTP, always approved by the owner with the whole mail). They use
 * `client`, else a client of `accounts`, else the write client the mail module provided on the engine.
 * Options are checked when called (InvalidAgentDefinitionError).
 */
export function mailWriteTools(options: MailWriteToolsOptions = {}): ToolSet {
    const source = sourceOf(options);

    return { mail_send: mailSendTool(source) };
}
