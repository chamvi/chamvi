<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    VCFormCheckbox,
    VCFormCheckboxGroup,
    VCFormRadio,
    VCFormRadioGroup,
} from '@vuecs/forms';
import {
    computed,
    nextTick,
    onMounted,
    ref,
    watch,
} from 'vue';
import { RouterLink } from 'vue-router';
import type { RunWire } from '@chamvi/ui-kit';
import {
    approvalWaitOf,
    canApprove,
    detailLines,
    jsonBody,
    notifiedLine,
} from '../../approvals/helpers.ts';
import { useArtifactTiles } from '../../artifacts/composables.ts';
import { approvalArtifactIds } from '../../artifacts/helpers.ts';
import type { ArtifactTile } from '../../artifacts/types.ts';
import { NavIcon, StatusChip, useAppContext  } from '@chamvi/ui-kit';
import { RouteName } from '../../router/constants.ts';
import { shortId } from '../../runs/helpers.ts';
import ArtifactStrip from '../artifact-strip/ArtifactStrip.vue';
import ArtifactViewer from '../artifact-viewer/ArtifactViewer.vue';
import ExpiryCountdown from '../expiry-countdown/ExpiryCountdown.vue';
import JsonBlock from '../json-block/JsonBlock.vue';

const props = defineProps<{
    run: RunWire;
    /** The principal holds `chamvi_agent_approve` for the run's agent. */
    canAnswer: boolean;
    busy?: boolean;
    /** The approval a link opened: highlighted, scrolled into view and focused. */
    highlight?: boolean;
}>();

const emit = defineEmits<{ answer: [approved: boolean, reason: string, selected: string[]] }>();
const reason = ref('');
/** The chosen option ids of a choice approval (one for radios). */
const selected = ref<string[]>([]);
const single = ref<string>();

/** The run's approval wait point; a dispatch wait renders nothing. */
const waiting = computed(() => approvalWaitOf(props.run));
const options = computed(() => waiting.value?.options ?? []);
const multiple = computed(() => waiting.value?.multiple === true);
const chosen = computed<string[]>(() => {
    if (multiple.value) {
        return selected.value;
    }

    return single.value !== undefined ? [single.value] : [];
});
/** A JSON body (a trust approval: the tool, its input and the taint) is pretty-printed; any other body stays text. */
const structured = computed(() => (waiting.value?.body ? jsonBody(waiting.value.body) : undefined));
const approvable = computed(() => !waiting.value || canApprove(waiting.value, chosen.value));
/** The choice: one checkbox group (an array) or one radio group (an id), each row its own markup. */
const choiceGroup = computed(() => (multiple.value ? VCFormCheckboxGroup : VCFormRadioGroup));
const choiceControl = computed(() => (multiple.value ? VCFormCheckbox : VCFormRadio));
const choiceModel = computed(() => (multiple.value ? selected.value : single.value));

function choose(value: unknown): void {
    if (multiple.value) {
        selected.value = Array.isArray(value) ? value.map(String) : [];
    } else {
        single.value = value === null || value === undefined ? undefined : String(value);
    }
}

/** By position: an option id may hold characters an element id cannot. */
const optionId = (index: number) => `option-${props.run.id}-${index}`;

const { client } = useAppContext();
/** The images of the wait point: loaded once mounted, reloaded (and the old URLs revoked) per approval id. */
const artifacts = useArtifactTiles({
    client,
    runId: () => props.run.id,
    key: () => waiting.value?.approvalId,
    refresh: () => props.run,
    ids: () => approvalArtifactIds(waiting.value),
});
const viewing = ref<ArtifactTile>();
const viewerOpen = ref(false);

function view(tile: ArtifactTile): void {
    viewing.value = tile;
    viewerOpen.value = true;
}

onMounted(artifacts.start);

// another wait point of the run: its options and images are others
watch(() => waiting.value?.approvalId, () => {
    selected.value = [];
    single.value = undefined;
    viewerOpen.value = false;
    viewing.value = undefined;
});

function send(approved: boolean): void {
    // a denial selects nothing
    emit('answer', approved, reason.value, approved ? [...chosen.value] : []);
}

const id = `reason-${props.run.id}`;
const notified = computed(() => notifiedLine(props.run));

const root = ref<globalThis.HTMLElement>();
async function reveal(): Promise<void> {
    if (!props.highlight) {
        return;
    }

    await nextTick();
    root.value?.scrollIntoView({ block: 'center' });
    root.value?.focus({ preventScroll: true });
}
onMounted(reveal);
watch(() => props.highlight, reveal);
</script>

<template>
    <article
        v-if="waiting"
        ref="root"
        :class="['callout', { linked: highlight }]"
        data-testid="approval"
        :data-run="run.id"
        :data-linked="highlight ? 'true' : undefined"
        :tabindex="highlight ? -1 : undefined"
        :aria-label="highlight ? `Linked approval: ${waiting.title}, run ${shortId(run.id)}` : undefined"
    >
        <div class="callout-head">
            <span class="callout-icon"><NavIcon name="hand" /></span>
            <div class="callout-title">
                <h2><span data-testid="approval-title">{{ waiting.title }}</span><StatusChip status="waiting" /></h2>
                <p>
                    <RouterLink
                        :to="{ name: RouteName.AGENT, params: { name: run.agent } }"
                        data-testid="agent-link"
                    >
                        {{ run.agent }}
                    </RouterLink>
                    · run
                    <RouterLink
                        class="mono"
                        :to="{ name: RouteName.RUN, params: { id: run.id } }"
                    >
                        {{ shortId(run.id) }}
                    </RouterLink>
                    <template v-if="run.concurrencyKey">
                        · {{ run.concurrencyKey }}
                    </template>
                </p>
            </div>
            <div class="timer">
                <small>Expires in</small>
                <ExpiryCountdown :until="waiting.expiresAt" />
                <span>then denied</span>
            </div>
        </div>
        <div class="callout-body">
            <div>
                <p
                    v-if="run.taint"
                    class="taint-warning"
                    role="note"
                    data-testid="approval-untrusted-content"
                >
                    This run consumed untrusted content. Review this request carefully before approving.
                </p>
                <div
                    v-if="structured !== undefined"
                    class="callout-json"
                    data-testid="approval-body"
                >
                    <JsonBlock :value="structured" />
                </div>
                <p
                    v-else-if="waiting.body"
                    class="callout-text"
                    data-testid="approval-body"
                    v-text="waiting.body"
                />
                <p
                    v-else
                    class="callout-text muted"
                >
                    No details given.
                </p>
                <ArtifactStrip
                    :tiles="artifacts.tilesOf(waiting.artifacts)"
                    @open="view"
                    @download="artifacts.download"
                />
                <fieldset
                    v-if="options.length > 0"
                    class="callout-options"
                    data-testid="approval-options"
                >
                    <legend class="field-label">
                        {{ multiple ? 'Choose one or more' : 'Choose one' }}
                    </legend>
                    <component
                        :is="choiceGroup"
                        :model-value="choiceModel"
                        :name="`option-${run.id}`"
                        :disabled="!canAnswer"
                        class="callout-option-list"
                        @update:model-value="choose"
                    >
                        <div
                            v-for="(option, index) in options"
                            :key="option.id"
                            class="callout-option"
                        >
                            <div
                                class="callout-option-head"
                                data-testid="approval-option"
                                :data-option="option.id"
                            >
                                <component
                                    :is="choiceControl"
                                    :id="optionId(index)"
                                    :value="option.id"
                                    :label="false"
                                />
                                <label :for="optionId(index)">
                                    <span>{{ option.label }}</span>
                                    <span class="mono muted">{{ option.id }}</span>
                                </label>
                            </div>
                            <ArtifactStrip
                                :tiles="artifacts.tilesOf(option.artifacts)"
                                @open="view"
                                @download="artifacts.download"
                            />
                            <details v-if="option.detail">
                                <summary>Details</summary>
                                <pre class="option-detail"><template
                                    v-for="(line, index) in detailLines(option.detail)"
                                    :key="index"
                                ><span :class="line.kind ? `diff-${line.kind}` : undefined">{{ line.text }}</span>{{ '\n' }}</template></pre>
                            </details>
                        </div>
                    </component>
                </fieldset>
            </div>
            <div>
                <dl class="callout-meta">
                    <dt>tool</dt>
                    <dd
                        class="mono"
                        data-testid="approval-tool"
                    >
                        {{ waiting.toolName }}
                    </dd>
                    <dt>requested</dt>
                    <dd><VCTimeago :datetime="run.updatedAt" /></dd>
                    <dt>notified</dt>
                    <dd
                        :class="{ warn: notified.warn }"
                        data-testid="notified"
                    >
                        {{ notified.text }}
                    </dd>
                </dl>
                <VCFormGroup
                    v-if="canAnswer"
                    label-tag="span"
                >
                    <template #label>
                        <label :for="id">Reason (optional, sent to the model)</label>
                    </template>
                    <VCFormTextarea
                        :id="id"
                        v-model="reason"
                        class="textarea"
                        rows="3"
                        placeholder="Why, in one line"
                    />
                </VCFormGroup>
            </div>
        </div>
        <div class="callout-foot">
            <p v-if="canAnswer">
                Approving or denying queues the run again.
            </p>
            <p v-else>
                Answering needs <span class="mono">agent:{{ run.agent }}:approve</span>.
            </p>
            <div
                v-if="canAnswer"
                class="callout-actions"
            >
                <VCButton
                    class="btn"
                    :disabled="busy"
                    @click="send(false)"
                >
                    Deny
                </VCButton>
                <VCButton
                    class="btn btn-primary"
                    :loading="busy"
                    :disabled="busy || !approvable"
                    data-testid="approve"
                    @click="send(true)"
                >
                    <NavIcon name="check" />Approve
                </VCButton>
            </div>
        </div>
        <ArtifactViewer
            v-model:open="viewerOpen"
            :tile="viewing"
        />
    </article>
</template>
