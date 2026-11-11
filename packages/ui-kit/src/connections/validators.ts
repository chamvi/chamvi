/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { IssueCode } from '@ebec/core';
import { Container, createValidupError, defineValidator } from 'validup';
import type { ValidatorDescriptor } from 'validup';
import type { ConnectionFormField, ConnectionFormValues } from './types.ts';

/** The state key (and the server's issue path) of the account id while adding. */
export const ACCOUNT_KEY = 'account';

/** Whether the form must hold a value for the field: a secret with a stored value keeps it when left empty. */
export function isRequiredField(field: ConnectionFormField): boolean {
    return field.required === true && !field.lock && !(field.kind === 'secret' && field.secretSet);
}

function isBlank(value: unknown): boolean {
    return typeof value !== 'string' || value.trim() === '';
}

/** The account id while adding: required. Its format is the server's to check. */
export function isAccountId(): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            if (isBlank(value)) {
                throw createValidupError(undefined, IssueCode.REQUIRED, 'is required');
            }

            return value;
        },
    });
}

/**
 * One field's draft (the text of its control): required when the form must
 * hold a value, and of its kind when set. Empty is unset, the server's rule.
 * Never echoes the value: a secret goes through here too.
 */
export function isFieldDraft(field: ConnectionFormField, required: boolean): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            if (isBlank(value)) {
                if (required) {
                    throw createValidupError(undefined, IssueCode.REQUIRED, 'is required');
                }

                return value;
            }

            const text = String(value).trim();

            if (field.kind === 'number' && Number.isNaN(Number(text))) {
                throw createValidupError(undefined, IssueCode.NUMERIC, 'must be a number');
            }

            if (field.kind === 'select' && !(field.options ?? []).includes(text)) {
                throw createValidupError(undefined, IssueCode.VALUE_INVALID, 'must be one of the options');
            }

            if (field.kind === 'boolean' && text !== 'true' && text !== 'false') {
                throw createValidupError(undefined, IssueCode.VALUE_INVALID, 'must be yes or no');
            }

            return value;
        },
    });
}

/**
 * The client-side checks of a connection form, built from the field
 * definitions of `GET /connection-types`: one mount per field the form
 * writes (locked fields are not in the form), plus the account id while
 * adding. The server checks again; its issues come back per field.
 */
export function buildConnectionContainer(fields: readonly ConnectionFormField[], adding: boolean): Container<ConnectionFormValues> {
    const container = new Container<ConnectionFormValues>();

    if (adding) {
        container.mount(ACCOUNT_KEY, isAccountId());
    }

    for (const field of fields) {
        if (!field.lock) {
            container.mount(field.key, isFieldDraft(field, isRequiredField(field)));
        }
    }

    return container;
}
