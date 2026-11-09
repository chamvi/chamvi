/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { flattenIssueItems } from '@ebec/core';
import {
    computed,
    ref,
    shallowRef,
} from 'vue';
import type { ApiError } from '../api/error.ts';
import { asApiError } from '../api/helpers.ts';
import type {
    ConnectionFormConfirmation,
    ConnectionFormField,
    ConnectionSettingsWire,
    ConnectionTestWire,
    ConnectionTypeWire,
    IConnectionConfigApi,
    UseConnectionFormOptions,
} from './types.ts';

const ACCOUNT_FIELD = 'account';

function toDraft(value: unknown): string {
    if (Array.isArray(value)) {
        return value.join(', ');
    }

    return value === undefined || value === null ? '' : String(value);
}

/** The API's typed value of a text input; empty is unset (the server's rule) and a non-number goes to its check. */
function toSetting(field: ConnectionFormField, draft: string): unknown {
    switch (field.kind) {
        case 'number': {
            const text = draft.trim();
            const value = Number(text);

            return text === '' || Number.isNaN(value) ? text : value;
        }
        case 'boolean':
            return draft === '' ? '' : draft === 'true';
        case 'list': {
            const items = draft.split(',').map((item) => item.trim()).filter((item) => item.length > 0);

            return items.length > 0 ? items : '';
        }
        default:
            return draft;
    }
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
    return Object.fromEntries(Object.entries(record).filter(([entry]) => entry !== key));
}

function statusOf(error: ApiError): string {
    return error.status === 409 ? error.message : `${error.code} · ${error.message}`;
}

function toField(field: ConnectionTypeWire['fields'][number], view: ConnectionSettingsWire | undefined): ConnectionFormField {
    const current = view?.fields.find((entry) => entry.key === field.key);
    const source = current?.source;

    return {
        ...field,
        ...((source?.kind === 'env' || source?.kind === 'code') && { lock: source }),
        secretSet: current?.set === true,
    };
}

/**
 * The state of one connection's form. `name` is fixed for its lifetime (the
 * page keys the component by it). A secret leaves only through `save`, and
 * no response carries one back; the typed text is dropped once saved.
 */
export function useConnectionForm(api: IConnectionConfigApi, options: UseConnectionFormOptions) {
    const { name } = options;
    const definition = shallowRef<ConnectionTypeWire>();
    const view = shallowRef<ConnectionSettingsWire>();
    const loadError = shallowRef<ApiError>();
    const loaded = shallowRef(false);
    const account = ref('');
    const drafts = ref<Record<string, string>>({});
    const secrets = ref<Record<string, string>>({});
    const replacing = ref<Record<string, boolean>>({});
    const busy = shallowRef(false);
    const formError = shallowRef<string>();
    const fieldErrors = shallowRef<Record<string, string>>({});
    const testResult = shallowRef<ConnectionTestWire>();
    const confirmation = shallowRef<ConnectionFormConfirmation>();
    const confirmError = shallowRef<string>();

    const fields = computed<ConnectionFormField[]>(() => (definition.value?.fields ?? []).map((field) => toField(field, view.value)));
    const plainFields = () => fields.value.filter((field) => field.kind !== 'secret' && !field.lock);

    function seedDrafts(): void {
        drafts.value = Object.fromEntries(plainFields().map((field) => [field.key, toDraft(view.value?.settings[field.key])]));
    }

    function buildSettings(): Record<string, unknown> {
        return Object.fromEntries(plainFields().map((field) => [field.key, toSetting(field, drafts.value[field.key] ?? '')]));
    }

    function typedSecrets(): Record<string, string> {
        return Object.fromEntries(fields.value
            .filter((field) => field.kind === 'secret' && !field.lock && (secrets.value[field.key] ?? '') !== '')
            .map((field) => [field.key, secrets.value[field.key]!]));
    }

    function dropSecret(key: string): void {
        secrets.value = without(secrets.value, key);
        replacing.value = without(replacing.value, key);
    }

    function showSaveError(cause: unknown): void {
        const error = asApiError(cause);
        const known = new Set([ACCOUNT_FIELD, ...fields.value.map((field) => field.key)]);
        const perField: Record<string, string> = {};

        for (const issue of flattenIssueItems(error.issues ?? [])) {
            const key = String(issue.path?.at(-1) ?? '');

            if (known.has(key)) {
                perField[key] = issue.message;
            }
        }

        fieldErrors.value = perField;
        formError.value = Object.keys(perField).length > 0 ? undefined : statusOf(error);
    }

    /** The failure of a confirmed action, which has no field to show an issue at. */
    function confirmFailure(cause: unknown): string {
        const error = asApiError(cause);
        const issues = flattenIssueItems(error.issues ?? []);

        if (issues.length === 0) {
            return statusOf(error);
        }

        return issues.map((issue) => {
            const key = String(issue.path?.at(-1) ?? '');
            const label = fields.value.find((field) => field.key === key)?.label;

            return label ? `${label} ${issue.message}` : issue.message;
        }).join('; ');
    }

    async function load(): Promise<void> {
        try {
            const types = await api.types();

            definition.value = types.find((type) => type.type === options.type);

            if (definition.value && name !== undefined) {
                view.value = await api.read(name);
            }

            seedDrafts();
        } catch (e) {
            loadError.value = asApiError(e);
        } finally {
            loaded.value = true;
        }
    }

    /** Runs one request at a time: a double click sends once. */
    async function exclusive(run: () => Promise<void>): Promise<void> {
        if (busy.value) {
            return;
        }

        busy.value = true;

        try {
            await run();
        } finally {
            busy.value = false;
        }
    }

    async function save(): Promise<void> {
        await exclusive(async () => {
            formError.value = undefined;
            fieldErrors.value = {};
            testResult.value = undefined;

            try {
                const set = typedSecrets();

                if (name === undefined) {
                    const created = await api.create(options.type, {
                        account: account.value,
                        settings: buildSettings(),
                        ...(Object.keys(set).length > 0 && { secrets: set }),
                    });

                    secrets.value = {};
                    options.onCreated(created.name);

                    return;
                }

                view.value = await api.save(name, {
                    settings: buildSettings(),
                    ...(Object.keys(set).length > 0 && { secrets: { set } }),
                });
                secrets.value = {};
                replacing.value = {};
                seedDrafts();
            } catch (e) {
                showSaveError(e);
            }
        });
    }

    async function test(): Promise<void> {
        if (name === undefined) {
            return;
        }

        await exclusive(async () => {
            testResult.value = undefined;

            try {
                testResult.value = await api.test(name);
            } catch (e) {
                testResult.value = { ok: false, message: statusOf(asApiError(e)) };
            }
        });
    }

    function askClear(field: ConnectionFormField): void {
        const current = view.value;
        // a declared account without its required secret refuses to start, and so does any partly-env connection
        const stopsNextStart = field.required === true &&
            current !== undefined &&
            ((definition.value?.multiple === true && !current.deletable) || current.fields.some((entry) => entry.source.kind === 'env'));

        confirmError.value = undefined;
        confirmation.value = {
            kind: 'clear',
            key: field.key,
            label: field.label,
            stopsNextStart,
        };
    }

    function askDelete(): void {
        confirmError.value = undefined;
        confirmation.value = { kind: 'delete' };
    }

    function cancelConfirmation(): void {
        confirmation.value = undefined;
    }

    async function confirm(): Promise<void> {
        const open = confirmation.value;

        if (!open || name === undefined) {
            return;
        }

        await exclusive(async () => {
            try {
                if (open.kind === 'delete') {
                    const { restartRequired } = await api.remove(name);

                    confirmation.value = undefined;
                    options.onDeleted({ name, restartRequired });

                    return;
                }

                // only the secret: edits still in the form stay unsaved and in the form
                view.value = await api.save(name, { secrets: { clear: [open.key] } });
                dropSecret(open.key);
                confirmation.value = undefined;
            } catch (e) {
                confirmError.value = confirmFailure(e);
            }
        });
    }

    void load();

    return {
        definition,
        view,
        loaded,
        loadError,
        fields,
        account,
        drafts,
        secrets,
        replacing,
        busy,
        formError,
        fieldErrors,
        testResult,
        confirmation,
        confirmError,
        save,
        test,
        askClear,
        askDelete,
        cancelConfirmation,
        confirm,
    };
}
