/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { flattenIssueItems } from '@ebec/core';
import { useValidup } from '@validup/vue';
import {
    computed,
    reactive,
    ref,
    shallowRef,
    watch,
} from 'vue';
import type { ApiError } from '../api/error.ts';
import { asApiError } from '../api/helpers.ts';
import type {
    ConnectionFormConfirmation,
    ConnectionFormField,
    ConnectionFormValues,
    ConnectionSettingsWire,
    ConnectionTestWire,
    ConnectionTypeWire,
    IConnectionConfigApi,
    UseConnectionFormOptions,
} from './types.ts';
import { ACCOUNT_KEY, buildConnectionContainer, parseNumberDraft } from './validators.ts';

/** The code of a server issue shown at its field: untranslated, so its own message shows. */
const SERVER_ISSUE_CODE = 'connection_config';

function toDraft(value: unknown): string {
    if (Array.isArray(value)) {
        return value.join(', ');
    }

    return value === undefined || value === null ? '' : String(value);
}

/** The API's typed value of a text input; empty is unset (the server's rule); the container refused any other non-number. */
function toSetting(field: ConnectionFormField, draft: string): unknown {
    switch (field.kind) {
        case 'number':
            return parseNumberDraft(draft) ?? draft.trim();
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
    /** The text of every control, checked by the container; a typed secret lives here until saved. */
    const values = reactive<ConnectionFormValues>({});
    const replacing = ref<Record<string, boolean>>({});
    const busy = shallowRef(false);
    /** A refused save with no issue at a field. */
    const formError = shallowRef<string>();
    const testResult = shallowRef<ConnectionTestWire>();
    const confirmation = shallowRef<ConnectionFormConfirmation>();
    const confirmError = shallowRef<string>();

    const fields = computed<ConnectionFormField[]>(() => (definition.value?.fields ?? []).map((field) => toField(field, view.value)));
    const plainFields = () => fields.value.filter((field) => field.kind !== 'secret' && !field.lock);
    const adding = name === undefined;
    const container = computed(() => buildConnectionContainer(fields.value, adding));
    const v = useValidup(container, values);
    /** Edited fields that decide where the secrets go; the server refuses them without the secrets again. */
    const movedFields = computed(() => (adding ? [] : plainFields().filter((field) => field.bindsSecrets &&
        (values[field.key] ?? '') !== toDraft(view.value?.settings[field.key]))));

    function mustReenter(field: ConnectionFormField): boolean {
        return movedFields.value.length > 0 && field.kind === 'secret' && field.secretSet && !field.lock;
    }

    /**
     * Whether a secret's input is open: never set, Replace, or asked for again.
     * The template shows it by this rule and a save sends only these drafts.
     */
    function showsSecretInput(field: ConnectionFormField): boolean {
        return field.kind === 'secret' && !field.lock && (!field.secretSet || replacing.value[field.key] === true || mustReenter(field));
    }

    // a closed input drops its text, so it neither leaves with a save nor shows up when the input opens again
    watch(() => fields.value.filter((field) => field.kind === 'secret' && !showsSecretInput(field)).map((field) => field.key), (closed) => {
        for (const key of closed) {
            if ((values[key] ?? '') !== '') {
                values[key] = '';
            }
        }
    });

    /** What a save of the edited destination needs; only names, never a value. */
    const rebindNotice = computed(() => {
        const moved = movedFields.value.map((field) => field.label).join(', ');
        const secretFields = fields.value.filter((field) => field.kind === 'secret');
        const locked = secretFields.filter((field) => field.lock);

        if (moved === '') {
            return undefined;
        }

        if (locked.length > 0) {
            return `${moved} cannot change here: ${locked.map((field) => field.label).join(', ')} comes from the environment or code.`;
        }

        const secretList = secretFields.filter((field) => field.secretSet).map((field) => field.label).join(', ');

        return secretList === '' ? undefined : `${moved} decides where the secrets are sent: enter ${secretList} again to save it.`;
    });

    /** Every control from the stored settings, secrets empty; the account id while adding stays. */
    function seedValues(): void {
        const account = values[ACCOUNT_KEY] ?? '';

        for (const key of Object.keys(values)) {
            delete values[key];
        }

        if (adding) {
            values[ACCOUNT_KEY] = account;
        }

        for (const field of fields.value) {
            if (!field.lock) {
                values[field.key] = field.kind === 'secret' ? '' : toDraft(view.value?.settings[field.key]);
            }
        }
    }

    function buildSettings(): Record<string, unknown> {
        return Object.fromEntries(plainFields().map((field) => [field.key, toSetting(field, values[field.key] ?? '')]));
    }

    function typedSecrets(): Record<string, string> {
        return Object.fromEntries(fields.value
            .filter((field) => showsSecretInput(field) && (values[field.key] ?? '') !== '')
            .map((field) => [field.key, values[field.key]!]));
    }

    function dropSecret(key: string): void {
        values[key] = '';
        replacing.value = without(replacing.value, key);
    }

    /** Replace opens an empty input for a set secret, Keep current closes it; neither shows the stored value. */
    function toggleReplace(key: string): void {
        replacing.value = { ...replacing.value, [key]: !replacing.value[key] };
        values[key] = '';
    }

    /** The server's issues at their fields (its paths end in the field key), anything else at the form. */
    function showSaveError(cause: unknown): void {
        const error = asApiError(cause);
        const known = new Set([...(adding ? [ACCOUNT_KEY] : []), ...fields.value.map((field) => field.key)]);
        const issues = flattenIssueItems(error.issues ?? [])
            .filter((issue) => known.has(String(issue.path?.at(-1) ?? '')))
            // the server says what is wrong in the message (every issue is value_invalid): a code the
            // catalog does not know keeps that wording instead of the catalog's generic one
            .map((issue) => ({
                ...issue,
                code: SERVER_ISSUE_CODE,
                path: [String(issue.path.at(-1))],
            }));

        v.setExternalIssues(issues);
        formError.value = issues.length > 0 ? undefined : statusOf(error);
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

            seedValues();
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
            v.setExternalIssues([]);
            testResult.value = undefined;

            // every field shows its issue; nothing is sent while one has any
            const checked = await v.$validate();

            if (!checked.success) {
                return;
            }

            try {
                const set = typedSecrets();

                if (name === undefined) {
                    const created = await api.create(options.type, {
                        account: values[ACCOUNT_KEY] ?? '',
                        settings: buildSettings(),
                        ...(Object.keys(set).length > 0 && { secrets: set }),
                    });

                    for (const key of Object.keys(set)) {
                        values[key] = '';
                    }

                    options.onCreated({ name: created.name, restartRequired: created.restartRequired });

                    return;
                }

                view.value = await api.save(name, {
                    settings: buildSettings(),
                    ...(Object.keys(set).length > 0 && { secrets: { set } }),
                });
                replacing.value = {};
                seedValues();
                v.$reset();
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
                // the result was of the values before
                testResult.value = undefined;
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
        values,
        v,
        replacing,
        busy,
        formError,
        testResult,
        confirmation,
        confirmError,
        rebindNotice,
        showsSecretInput,
        save,
        test,
        toggleReplace,
        askClear,
        askDelete,
        cancelConfirmation,
        confirm,
    };
}
