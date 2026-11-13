<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { IFieldValidation } from '@ilingo/validup-vue';
import { useValidup } from '@validup/vue';
import { Container } from 'validup';
import {
    reactive,
    ref,
    watch,
} from 'vue';
import { Permission } from '@chamvi/access';
import { createStartKeys } from '../../agents/helpers.ts';
import { refusalText } from '../../errors/helpers.ts';
import { isPayload } from '../../forms/validators.ts';
import type { StartRunResult } from '@chamvi/ui-kit';

const props = defineProps<{
    agent: string;
    /** Who the run is started as, for the lede. */
    invoker?: string;
    start: (payload: unknown, idempotencyKey: string) => Promise<StartRunResult>;
}>();

const emit = defineEmits<{ started: [result: StartRunResult] }>();
const open = defineModel<boolean>('open', { required: true });

const form = reactive({ payload: '{}' });
const payloadForm = new Container<{ payload: string }>();

payloadForm.mount('payload', isPayload());

const v = useValidup(payloadForm, form);
/** A start the API refused (a 403 names the permission); invalid JSON is the field's issue. */
const error = ref<string>();
const busy = ref(false);
const keys = createStartKeys();

watch(open, (value) => {
    if (!value) {
        return;
    }

    error.value = undefined;
});

async function submit(): Promise<void> {
    error.value = undefined;

    const checked = await v.$validate();

    if (!checked.success) {
        return;
    }

    busy.value = true;

    try {
        // the validator returns the parsed payload; the key follows the text, so a retry of the same text dedupes
        const result = await props.start(checked.data.payload, keys.keyFor(form.payload));

        keys.succeeded();
        open.value = false;
        emit('started', result);
    } catch (e) {
        error.value = refusalText(e, 'Starting a run', Permission.AGENT_RUN, props.agent);
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <VCModal v-model:open="open">
        <VCModalContent class="modal card">
            <form
                style="display: grid; gap: 12px"
                novalidate
                data-testid="start-run"
                @submit.prevent="submit"
            >
                <VCModalTitle class="display">
                    Start a run of {{ agent }}
                </VCModalTitle>
                <VCModalDescription>
                    Dispatches through the http trigger<template v-if="invoker">
                        as {{ invoker }}
                    </template>. The payload becomes the run's first message, checked against the trigger's schema if it has one.
                </VCModalDescription>
                <IFieldValidation
                    v-slot="{ value: validation }"
                    :field="v.fields.payload"
                >
                    <VCFormGroup
                        label-tag="span"
                        :validation="validation"
                    >
                        <template #label>
                            <label :for="`payload-${agent}`">Payload (JSON)</label>
                        </template>
                        <VCFormTextarea
                            :id="`payload-${agent}`"
                            v-model="v.fields.payload.$model.value"
                            class="textarea mono"
                            rows="7"
                            spellcheck="false"
                            name="payload"
                        />
                        <template #hint>
                            Empty sends {}.
                        </template>
                    </VCFormGroup>
                </IFieldValidation>
                <p
                    v-if="error"
                    class="form-err"
                    role="alert"
                >
                    {{ error }}
                </p>
                <div class="modal-actions">
                    <VCButton
                        type="button"
                        class="btn"
                        @click="open = false"
                    >
                        Cancel
                    </VCButton>
                    <VCButton
                        type="submit"
                        class="btn btn-primary"
                        :loading="busy"
                    >
                        Start run
                    </VCButton>
                </div>
            </form>
        </VCModalContent>
    </VCModal>
</template>
