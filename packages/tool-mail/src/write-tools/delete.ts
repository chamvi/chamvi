/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import { jsonSchema } from 'ai';
import {
    ToolDeniedError,
    ValidationError,
    defineEffectTool,
    once,
    toolLimitApproved,
} from '@chamvi/core';
import type { ApprovalDecision, ApprovalRequestInput, ToolContext } from '@chamvi/core';
import { signalOf } from '../tools/asserts/index.ts';
import type { MailDeleteResult } from '../write-client/types.ts';
import { askMailApproval, deleteApprovalOf } from './approval.ts';
import { parseMailDeleteInput } from './asserts.ts';
import { classifyMailDelete } from './classify.ts';
import { MAIL_DELETE_MAX_IDS } from './constants.ts';
import { mailDeleteKey } from './keys.ts';
import { limitListingCovers, mailDeleteLimitOf } from './limit.ts';
import type { MailDeleteInput, MailDeleteToolOptions, MailWriteClientSource } from './types.ts';

// validated by the AI SDK before the call is counted or run: 21 ids never reach the limit
const INPUT_SCHEMA = jsonSchema<MailDeleteInput>({
    type: 'object',
    properties: {
        ids: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            minItems: 1,
            maxItems: MAIL_DELETE_MAX_IDS,
            description: `1 to ${MAIL_DELETE_MAX_IDS} mail ids of one account, from mail_search, mail_get or mail_thread.`,
        },
    },
    required: ['ids'],
    additionalProperties: false,
}, {
    validate: (value) => {
        try {
            return { success: true, value: parseMailDeleteInput(value) };
        } catch (error) {
            return { success: false, error: error as Error };
        }
    },
});

/** The owner's decision; a request the source chat cannot show is the model's to split. */
async function decisionOf(ctx: ToolContext, request: ApprovalRequestInput): Promise<ApprovalDecision> {
    try {
        return await askMailApproval(ctx, request);
    } catch (error) {
        if (error instanceof ValidationError) {
            throw new ValidationError(`${error.message} The approval does not fit this chat: delete fewer mails per call; nothing was moved.`);
        }

        throw error;
    }
}

export function mailDeleteTool(source: MailWriteClientSource, options: MailDeleteToolOptions): Tool<MailDeleteInput, MailDeleteResult> {
    return defineEffectTool<MailDeleteInput, MailDeleteResult>({
        // it asks the owner itself whenever a delete is not routine
        trust: { guardWhenTainted: false },
        description: 'Move mails to the trash folder of their account (never deleted for good). Takes 1 to ' +
            `${MAIL_DELETE_MAX_IDS} mail ids of one account, from mail_search, mail_get or mail_thread. Routine mail ` +
            '(newsletters, notifications, marketing, automated mail, spam) is moved right away; anything else asks ' +
            'the owner first with a list of the mails, and a denial is final for this call. Deletes are rate ' +
            'limited; over the limit the owner is asked instead. The result lists the moved ids and in missing the ' +
            'ids whose mail was already gone. When the approval is too long for the chat, delete fewer mails per call.',
        inputSchema: INPUT_SCHEMA,
        effectKey: (input, ctx) => mailDeleteKey(parseMailDeleteInput(input), ctx),
        ...(options.limit !== false && { limit: mailDeleteLimitOf(source, options.limit) }),
        execute: async (input, { abortSignal, context }) => {
            const { ids } = parseMailDeleteInput(input);
            const client = source(context);
            const signal = signalOf(abortSignal, context);

            // an approved limit approval that listed every mail is the owner's decision on the call; one that
            // showed less (a fallback, an agent's own limit) is not, and the checks below still run
            if (!toolLimitApproved(context) || !await limitListingCovers(context, ids)) {
                const listing = await client.describe(ids, signal);

                if (listing.mails.length === 0) {
                    return {
                        account: listing.account,
                        trash: listing.trash,
                        moved: [],
                        missing: listing.missing,
                    };
                }

                // recorded: a resumed call reaches the answer of the approval it asked, whatever a new verdict says
                const classified = await once(context, 'mail_delete:classify', () => classifyMailDelete(context, listing.mails, {
                    clock: options.clock,
                    timeoutMs: options.timeoutMs,
                    ...(options.classifier?.model !== undefined && { model: options.classifier.model }),
                }));

                if (classified === 'ask') {
                    const decision = await decisionOf(context, deleteApprovalOf(listing));

                    if (!decision.approved) {
                        const reason = decision.reason ? ` Reason: ${decision.reason}` : '';

                        throw new ToolDeniedError(`mail_delete: not approved; nothing was moved.${reason}`);
                    }
                }
            }

            return client.trash(ids, signal);
        },
    });
}
