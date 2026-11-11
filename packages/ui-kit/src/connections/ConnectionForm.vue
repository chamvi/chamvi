<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { IFieldValidation } from '@ilingo/validup-vue';
import {
    VCFormGroup,
    VCFormInput,
    VCFormSelect,
    VCFormTextarea,
} from '@vuecs/forms';
import type { FormOption } from '@vuecs/forms';
import {
    computed,
    nextTick,
    ref,
    watch,
} from 'vue';
import { useAppContext } from '../context/module.ts';
import { createConnectionConfigApi } from './api.ts';
import { useConnectionForm } from './form.ts';
import { canWriteConnection, connectionProblem } from './helpers.ts';
import type { ConnectionCreated, ConnectionDeleted, ConnectionFormField } from './types.ts';
import { ACCOUNT_KEY, isRequiredField } from './validators.ts';

// mounted once per connection name (the caller keys it by the name)
const props = defineProps<{
    /** The connection to edit; absent adds an account of the type. */
    name?: string;
    type: string;
}>();

const emit = defineEmits<{ created: [result: ConnectionCreated]; deleted: [result: ConnectionDeleted] }>();

const { client, session } = useAppContext();
const form = useConnectionForm(createConnectionConfigApi(client), {
    ...(props.name === undefined ? {} : { name: props.name }),
    type: props.type,
    onCreated: (result) => emit('created', result),
    onDeleted: (result) => emit('deleted', result),
});
const {
    definition,
    view,
    loaded,
    loadError,
    fields,
    v,
    replacing,
    busy,
    formError,
    testResult,
    confirmation,
    confirmError,
    rebindNotice,
} = form;

const adding = computed(() => props.name === undefined);
const problem = computed(() => (view.value ? connectionProblem(view.value) : undefined));
const canWrite = computed(() => props.name === undefined ||
    canWriteConnection(session.principal.value?.permissions ?? [], props.name));
const canEdit = computed(() => canWrite.value && (view.value?.editable ?? true));
const canTest = computed(() => !adding.value && canWrite.value && definition.value?.testable === true);
const canDelete = computed(() => canWrite.value && view.value?.deletable === true);
const accountId = computed(() => {
    const prefix = `${props.type}-`;

    return props.name?.startsWith(prefix) ? props.name.slice(prefix.length) : props.name;
});
const heading = computed(() => {
    const label = definition.value?.label ?? props.type;

    if (adding.value) {
        return `Add ${label} account`;
    }

    return definition.value?.multiple ? `${label} account: ${accountId.value}` : `${label}: ${props.name}`;
});

/** A field's validation state; its `$model` writes mark it dirty and drop the server's issue there. */
const fieldOf = (key: string) => v.fields.at<string | undefined>(key);

/** A select's choices; the select has no empty value, so unset is `null` (an empty draft). */
function choicesOf(field: ConnectionFormField): FormOption[] {
    const choices = field.kind === 'boolean' ?
        [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] :
        (field.options ?? []).map((option) => ({ value: option, label: option }));

    return [{ value: null, label: 'Not set' }, ...choices];
}

function choiceOf(key: string): string | null {
    const draft = fieldOf(key).$model.value;

    return draft === undefined || draft === '' ? null : draft;
}

function choose(key: string, next: unknown): void {
    fieldOf(key).$model.value = next === null || next === undefined ? '' : String(next);
}

// the button that had the focus leaves the DOM: the focus follows into the confirmation and back
const root = ref<globalThis.HTMLElement>();

watch(confirmation, async (open, previous) => {
    await nextTick();

    if (open) {
        root.value?.querySelector<globalThis.HTMLElement>('[data-confirm-keep]')?.focus({ preventScroll: true });
    } else if (previous) {
        const origin = previous.kind === 'clear' ?
            Array.from(root.value?.querySelectorAll<globalThis.HTMLElement>('[data-clear]') ?? [])
                .find((element) => element.dataset.clear === previous.key) :
            root.value?.querySelector<globalThis.HTMLElement>('[data-delete]');

        origin?.focus({ preventScroll: true });
    }
});
</script>

<template>
    <div
        v-if="loadError"
        class="card notice"
        data-testid="connection-form-error"
    >
        <template v-if="loadError.status === 404">
            Connection <b class="mono">{{ name }}</b> has no configuration.
        </template>
        <template v-else-if="loadError.status === 403">
            Reading this connection needs <b class="mono">connection:{{ name }}:read</b>.
        </template>
        <template v-else>
            {{ loadError.code }} · {{ loadError.message }}
        </template>
    </div>

    <div
        v-else-if="loaded && !definition"
        class="card notice"
    >
        The connection type <b class="mono">{{ type }}</b> is not available in this app.
    </div>

    <div
        v-else-if="loaded"
        ref="root"
        class="connection-form"
    >
        <h1 class="display">
            {{ heading }}
        </h1>

        <div
            v-if="view?.restartRequired"
            class="banner"
            role="status"
            data-testid="connection-restart"
        >
            Saved. Restart the app to apply.
        </div>

        <div
            v-if="problem"
            class="card notice"
            role="status"
            data-testid="connection-state"
        >
            {{ problem }}
        </div>

        <div
            v-if="!canWrite"
            class="card notice"
            data-testid="connection-form-readonly"
        >
            Changing this connection needs <b class="mono">connection:{{ name }}:write</b>.
        </div>

        <form
            class="card connection-fields"
            novalidate
            @submit.prevent="form.save()"
        >
            <IFieldValidation
                v-if="adding"
                v-slot="{ value: validation }"
                :field="fieldOf(ACCOUNT_KEY)"
            >
                <VCFormGroup
                    data-field="account"
                    label-tag="span"
                    :validation="validation"
                >
                    <template #label>
                        <label for="connection-account">Account id</label>
                    </template>
                    <VCFormInput
                        id="connection-account"
                        v-model="fieldOf(ACCOUNT_KEY).$model.value"
                        class="mono"
                        autocomplete="off"
                        aria-required="true"
                        :disabled="busy"
                    />
                    <p class="hint">
                        Lower-case letters, digits and dashes, for example work.
                    </p>
                </VCFormGroup>
            </IFieldValidation>

            <IFieldValidation
                v-for="field in fields"
                :key="field.key"
                v-slot="{ value: validation }"
                :field="fieldOf(field.key)"
            >
                <VCFormGroup
                    :data-field="field.key"
                    label-tag="span"
                    :validation="validation"
                >
                    <template #label>
                        <label :for="`connection-${field.key}`">{{ field.label }}<span
                            v-if="field.required"
                            aria-hidden="true"
                        > *</span></label>
                    </template>

                    <template v-if="field.lock">
                        <div class="field-value field-value-locked">
                            Locked
                        </div>
                        <p class="hint">
                            <template v-if="field.lock.kind === 'env'">
                                Set from <code class="mono">{{ field.lock.variable }}</code>
                            </template>
                            <template v-else>
                                Set in code
                            </template>
                        </p>
                    </template>

                    <template v-else-if="field.kind === 'secret'">
                        <template v-if="canEdit && (!field.secretSet || replacing[field.key] || form.mustReenter(field))">
                            <!-- a password input strips line breaks: a pasted PEM would be saved corrupted -->
                            <VCFormTextarea
                                v-if="field.multiline"
                                :id="`connection-${field.key}`"
                                v-model="fieldOf(field.key).$model.value"
                                class="mono"
                                rows="6"
                                autocomplete="off"
                                autocapitalize="off"
                                spellcheck="false"
                                :disabled="busy"
                                :aria-required="isRequiredField(field)"
                            />
                            <VCFormInput
                                v-else
                                :id="`connection-${field.key}`"
                                v-model="fieldOf(field.key).$model.value"
                                type="password"
                                autocomplete="new-password"
                                :disabled="busy"
                                :aria-required="isRequiredField(field)"
                            />
                        </template>
                        <div
                            v-if="field.secretSet"
                            class="field-value"
                        >
                            <span data-testid="secret-set">Set</span>
                            <span
                                v-if="canEdit"
                                class="field-value-actions"
                            >
                                <button
                                    type="button"
                                    class="btn btn-sm btn-ghost"
                                    :disabled="busy"
                                    @click="form.toggleReplace(field.key)"
                                >
                                    {{ replacing[field.key] ? 'Keep current' : 'Replace' }}
                                </button>
                                <button
                                    type="button"
                                    class="btn btn-sm btn-ghost btn-danger"
                                    :data-clear="field.key"
                                    :disabled="busy"
                                    @click="form.askClear(field)"
                                >
                                    Clear
                                </button>
                            </span>
                        </div>
                        <div
                            v-else-if="!canEdit"
                            class="field-value field-value-locked"
                        >
                            Not set
                        </div>
                        <div
                            v-if="confirmation?.kind === 'clear' && confirmation.key === field.key"
                            class="connection-confirm"
                            role="alertdialog"
                            aria-label="Clear this secret?"
                        >
                            <p>
                                Clear <b>{{ confirmation.label }}</b>? The stored value is removed.
                                <template v-if="confirmation.stopsNextStart">
                                    This account is declared in the environment, so clearing it stops the next start until it is set again.
                                </template>
                            </p>
                            <div class="connection-action-buttons">
                                <button
                                    type="button"
                                    class="btn"
                                    data-confirm-keep
                                    :disabled="busy"
                                    @click="form.cancelConfirmation()"
                                >
                                    Keep secret
                                </button>
                                <button
                                    type="button"
                                    class="btn btn-primary"
                                    :disabled="busy"
                                    @click="form.confirm()"
                                >
                                    Clear secret
                                </button>
                            </div>
                            <p
                                v-if="confirmError"
                                class="form-err"
                            >
                                {{ confirmError }}
                            </p>
                        </div>
                    </template>

                    <VCFormSelect
                        v-else-if="field.kind === 'select' || field.kind === 'boolean'"
                        :id="`connection-${field.key}`"
                        :model-value="choiceOf(field.key)"
                        :options="choicesOf(field)"
                        placeholder="Not set"
                        :disabled="!canEdit || busy"
                        @update:model-value="(next: unknown) => choose(field.key, next)"
                    />

                    <VCFormTextarea
                        v-else-if="field.multiline"
                        :id="`connection-${field.key}`"
                        v-model="fieldOf(field.key).$model.value"
                        rows="4"
                        :disabled="!canEdit || busy"
                        :aria-required="isRequiredField(field)"
                    />

                    <VCFormInput
                        v-else
                        :id="`connection-${field.key}`"
                        v-model="fieldOf(field.key).$model.value"
                        :inputmode="field.kind === 'number' ? 'numeric' : undefined"
                        autocomplete="off"
                        :disabled="!canEdit || busy"
                        :aria-required="isRequiredField(field)"
                    />

                    <p
                        v-if="field.description"
                        class="hint"
                    >
                        {{ field.description }}
                    </p>
                    <p
                        v-if="field.kind === 'list' && !field.lock"
                        class="hint"
                    >
                        Comma separated.
                    </p>
                </VCFormGroup>
            </IFieldValidation>

            <p
                v-if="rebindNotice && canEdit"
                class="hint"
                role="status"
                data-testid="connection-rebind"
            >
                {{ rebindNotice }}
            </p>

            <p
                v-if="formError"
                class="form-err"
                data-testid="connection-form-failure"
            >
                {{ formError }}
            </p>

            <div class="connection-action-buttons">
                <button
                    v-if="canEdit"
                    type="submit"
                    class="btn btn-primary"
                    :disabled="busy"
                >
                    Save
                </button>
                <button
                    v-if="canTest"
                    type="button"
                    class="btn"
                    title="Tests the saved values"
                    :disabled="busy"
                    @click="form.test()"
                >
                    Test
                </button>
                <button
                    v-if="canDelete && confirmation?.kind !== 'delete'"
                    type="button"
                    class="btn btn-danger connection-delete"
                    data-delete
                    :disabled="busy"
                    @click="form.askDelete()"
                >
                    Delete
                </button>
            </div>

            <p
                v-if="testResult"
                :class="testResult.ok ? 'hint' : 'form-err'"
                role="status"
                data-testid="connection-test-result"
            >
                {{ testResult.ok ? 'The saved values work.' : testResult.message ?? 'The connection test failed.' }}
            </p>

            <div
                v-if="confirmation?.kind === 'delete'"
                class="connection-confirm"
                role="alertdialog"
                aria-label="Delete this account?"
            >
                <p>
                    Delete <b class="mono">{{ accountId }}</b>? Its settings and secrets are removed.
                </p>
                <div class="connection-action-buttons">
                    <button
                        type="button"
                        class="btn"
                        data-confirm-keep
                        :disabled="busy"
                        @click="form.cancelConfirmation()"
                    >
                        Keep account
                    </button>
                    <button
                        type="button"
                        class="btn btn-primary"
                        :disabled="busy"
                        @click="form.confirm()"
                    >
                        Delete account
                    </button>
                </div>
                <p
                    v-if="confirmError"
                    class="form-err"
                >
                    {{ confirmError }}
                </p>
            </div>
        </form>
    </div>
</template>
