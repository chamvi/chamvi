<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { useAlertDialog, useToast } from '@vuecs/overlays';
import { computed, onScopeDispose, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useAgents } from '../agents/composables.ts';
import {
    ApiError,
    NavIcon,
    StatusChip,
    useAppContext,
    useResolved,
} from '@chamvi/ui-kit';
import { approvalLinkQuery, approvalWaitOf } from '../approvals/helpers.ts';
import JsonBlock from '../components/json-block/JsonBlock.vue';
import StepItem from '../components/step-item/StepItem.vue';
import { errorText } from '../components/step-item/helpers.ts';
import UntrustedChip from '../components/untrusted-chip/UntrustedChip.vue';
import UsageMeter from '../components/usage-meter/UsageMeter.vue';
import { RouteName } from '../router/constants.ts';
import type { RunWire } from '@chamvi/ui-kit';
import { useRunChildren, useRunDetail } from '../runs/composables.ts';
import {
    canCancel,
    childRole,
    dispatchCallout,
    formatDuration,
    formatTokens,
    landedModelSteps,
    parentOf,
    runDuration,
    shortId,
    subtreeTotal,
} from '../runs/helpers.ts';

const { client, session } = useAppContext();
const route = useRoute();
const confirm = useAlertDialog();
const toast = useToast();

const runId = computed(() => String(route.params.id));
const {
    state,
    error,
    live,
    cancel,
} = useRunDetail(client, runId);
const { agents } = useAgents(client);

const now = ref(Date.now());
const clock = setInterval(() => {
    now.value = Date.now();
}, 1000);

onScopeDispose(() => clearInterval(clock));

const run = computed(() => state.value?.run);
const { page: childPage, forbidden: childrenForbidden } = useRunChildren(client, runId, run);
const childRows = computed(() => childPage.value?.data ?? []);
const CHILD_COLUMNS = [
    { key: 'id', label: 'Run' },
    { key: 'agent', label: 'Agent' },
    { key: 'role', label: 'Role' },
    { key: 'status', label: 'Status' },
];
const childRow = (value: unknown) => value as RunWire;
const subtree = computed(() => (run.value ? subtreeTotal(run.value) : undefined));
const dispatchLine = computed(() => (run.value ? dispatchCallout(run.value) : undefined));
const budget = computed(() => agents.value.find((agent) => agent.name === run.value?.agent)?.budget);
const parent = computed(() => (run.value ? parentOf(run.value) : undefined));
// the live stream replaces the run on every step: the verdict follows only its status and agent
const cancelKey = computed(() => (run.value ? `${run.value.status}:${run.value.agent}` : undefined));
const cancellable = useResolved(
    () => [cancelKey.value, session.principal.value] as const,
    ([key, principal]) => (key && run.value ? canCancel(run.value, principal) : Promise.resolve(false)),
    false,
);

const liveSteps = computed(() => {
    const { value } = state;

    if (!value) {
        return [];
    }

    return Object.entries(value.live)
        .map(([step, text]) => ({ step: Number(step), ...text }))
        .filter((entry) => entry.step >= landedModelSteps(value.steps))
        .sort((a, b) => a.step - b.step);
});
const stepsCount = computed(() => {
    const done = `${state.value?.steps.length ?? 0} done`;

    return liveSteps.value.length > 0 ? `${done} · ${liveSteps.value.length} streaming` : done;
});
const nextIndex = computed(() => (state.value?.steps.at(-1)?.index ?? -1) + 1);

const tokens = computed(() => (run.value ? run.value.usage.inputTokens + run.value.usage.outputTokens : 0));
const llmSteps = computed(() => (state.value ? landedModelSteps(state.value.steps) : 0));
const startedAt = computed(() => (run.value ? new Date(run.value.startedAt ?? run.value.createdAt).toLocaleTimeString() : ''));
const elapsed = computed(() => (run.value ? runDuration(run.value, now.value) : undefined));
/** The envelope as the model reads it: channel, subscription, address and payload. */
const envelope = computed(() => (run.value ? {
    channel: run.value.trigger.channel,
    trigger: run.value.trigger.trigger,
    address: run.value.trigger.address,
    payload: run.value.trigger.payload,
} : undefined));
const timeValue = computed(() => {
    if (elapsed.value === undefined) {
        return '—';
    }

    const timeout = budget.value?.timeoutMs;

    return timeout ? `${formatDuration(elapsed.value)} / ${formatDuration(timeout)}` : formatDuration(elapsed.value);
});

async function onCancel(): Promise<void> {
    const ok = await confirm({
        title: 'Cancel this run?',
        description: 'The run stops after the current step. Its checkpoints stay; an effect already applied is not undone.',
        confirmLabel: 'Cancel run',
        cancelLabel: 'Keep running',
        tone: 'primary',
    });

    if (!ok) {
        return;
    }

    try {
        await cancel();
        toast.add({ title: `Cancel requested · run ${shortId(runId.value)}` });
    } catch (e) {
        toast.add({
            title: 'Cancel failed',
            description: e instanceof ApiError ? e.message : String(e),
            color: 'error',
        });
    }
}
</script>

<template>
    <RouterLink
        class="back"
        :to="{ name: RouteName.RUNS }"
    >
        <NavIcon name="back" />runs / {{ shortId(runId) }}
    </RouterLink>

    <div
        v-if="error && !state"
        class="card notice"
    >
        <template v-if="error.status === 404">
            Run <b class="mono">{{ runId }}</b> does not exist.
        </template>
        <template v-else-if="error.status === 403">
            Reading this run needs <b class="mono">chamvi_run_read</b> or <b class="mono">chamvi_agent_run</b> for its agent;
            a private agent's run needs <b class="mono">chamvi_agent_read</b> for its agent.
        </template>
        <template v-else>
            {{ error.code }} · {{ error.message }}
        </template>
    </div>

    <template v-if="state && run">
        <section class="card run-head">
            <div class="run-head-top">
                <div class="run-title">
                    <h1 class="display">
                        Run <span class="mono">{{ shortId(run.id) }}</span>
                    </h1>
                    <StatusChip :status="run.status" />
                    <UntrustedChip :taint="run.taint" />
                    <VCButton
                        v-if="cancellable"
                        class="btn btn-danger"
                        @click="onCancel"
                    >
                        Cancel run
                    </VCButton>
                </div>
                <dl class="facts">
                    <div>
                        <dt>agent</dt>
                        <dd data-testid="run-agent">
                            <RouterLink
                                :to="{ name: RouteName.AGENT, params: { name: run.agent } }"
                                data-testid="agent-link"
                            >
                                {{ run.agent }}
                            </RouterLink>
                        </dd>
                    </div>
                    <div>
                        <dt>trigger</dt>
                        <dd class="mono">
                            {{ run.trigger.trigger }}
                        </dd>
                    </div>
                    <div v-if="parent">
                        <dt>{{ parent.label }}</dt>
                        <dd class="mono">
                            <RouterLink :to="{ name: RouteName.RUN, params: { id: parent.runId } }">
                                {{ parent.runId }}
                            </RouterLink>
                        </dd>
                    </div>
                    <div v-if="subtree !== undefined">
                        <dt>subtree</dt>
                        <dd
                            class="tnum"
                            data-testid="subtree-total"
                        >
                            {{ formatTokens(subtree) }} tok
                        </dd>
                    </div>
                    <div v-if="run.concurrencyKey">
                        <dt>key</dt>
                        <dd class="mono">
                            {{ run.concurrencyKey }}
                        </dd>
                    </div>
                    <div v-if="run.trigger.invoker">
                        <dt>invoker</dt>
                        <dd>
                            {{ run.trigger.invoker.name ?? run.trigger.invoker.id }}
                            <span class="muted mono">({{ run.trigger.invoker.kind }})</span>
                        </dd>
                    </div>
                    <div>
                        <dt>started</dt>
                        <dd class="tnum">
                            {{ startedAt }}
                        </dd>
                    </div>
                    <div v-if="run.finishedAt">
                        <dt>finished</dt>
                        <dd><VCTimeago :datetime="run.finishedAt" /></dd>
                    </div>
                    <div>
                        <dt>live</dt>
                        <dd data-testid="live">
                            {{ live ? 'SSE' : 'off' }}
                        </dd>
                    </div>
                </dl>
            </div>
            <div
                v-if="run.error"
                class="err-line"
            >
                {{ errorText(run.error) }}
            </div>
            <div class="meters">
                <UsageMeter
                    label="Steps"
                    :value="budget ? `${llmSteps} / ${budget.maxSteps}` : String(llmSteps)"
                    :ratio="budget ? llmSteps / budget.maxSteps : 0"
                />
                <UsageMeter
                    label="Tokens"
                    :value="`${formatTokens(run.usage.inputTokens)} in · ${formatTokens(run.usage.outputTokens)} out`"
                    :ratio="budget?.maxTokens ? tokens / budget.maxTokens : 0"
                />
                <UsageMeter
                    label="Time"
                    :value="timeValue"
                    :ratio="elapsed !== undefined && budget?.timeoutMs ? elapsed / budget.timeoutMs : 0"
                />
            </div>
        </section>

        <div
            v-if="run.status === 'waiting' && approvalWaitOf(run)"
            class="callout"
            style="margin-bottom: 26px"
        >
            <div class="callout-head">
                <span class="callout-icon"><NavIcon name="hand" /></span>
                <div class="callout-title">
                    <h2>{{ approvalWaitOf(run)?.toolName }}<StatusChip status="waiting" /></h2>
                    <p>The run waits for an approval of this tool call.</p>
                </div>
                <RouterLink
                    class="btn btn-sm"
                    :to="{ name: RouteName.APPROVALS, query: approvalLinkQuery(run) }"
                >
                    Open approvals
                </RouterLink>
            </div>
        </div>

        <div
            v-if="dispatchLine"
            class="callout"
            style="margin-bottom: 26px"
            data-testid="dispatch-callout"
        >
            <div class="callout-head">
                <span class="callout-icon"><NavIcon name="play" /></span>
                <div class="callout-title">
                    <h2>{{ run.waiting?.toolName }}<StatusChip status="waiting" /></h2>
                    <p>{{ dispatchLine }}.</p>
                </div>
            </div>
        </div>

        <template v-if="childrenForbidden || childRows.length > 0">
            <div class="section-head">
                <h2 class="display">
                    Dispatched runs
                </h2>
                <span v-if="childPage">{{ childPage.meta.total }}</span>
            </div>
            <div
                v-if="childrenForbidden"
                class="card notice"
                style="margin-bottom: 26px"
                data-testid="children-forbidden"
            >
                Listing dispatched runs needs <b class="mono">chamvi_run_read</b>.
            </div>
            <div
                v-else
                class="card table-card"
                style="margin-bottom: 26px"
            >
                <div class="table-wrap">
                    <VCTable
                        class="t stack"
                        :columns="CHILD_COLUMNS"
                        :data="childRows"
                        data-testid="children"
                    >
                        <template #cell-id="{ row: value }">
                            <RouterLink
                                class="id"
                                :to="{ name: RouteName.RUN, params: { id: childRow(value).id } }"
                                data-testid="child-link"
                            >
                                {{ shortId(childRow(value).id) }}
                            </RouterLink>
                        </template>
                        <template #cell-agent="{ row: value }">
                            <RouterLink :to="{ name: RouteName.AGENT, params: { name: childRow(value).agent } }">
                                {{ childRow(value).agent }}
                            </RouterLink>
                        </template>
                        <template #cell-role="{ row: value }">
                            <span class="mono">{{ childRole(childRow(value)) }}</span>
                        </template>
                        <template #cell-status="{ row: value }">
                            <StatusChip :status="childRow(value).status" />
                        </template>
                    </VCTable>
                </div>
            </div>
        </template>

        <div class="section-head">
            <h2 class="display">
                Steps
            </h2>
            <span data-testid="steps-count">{{ stepsCount }}</span>
        </div>
        <ol
            class="timeline"
            data-testid="timeline"
        >
            <li class="step step-trigger">
                <span class="step-mark" />
                <VCCollapse class="card step-card">
                    <VCCollapseTrigger class="step-sum">
                        <span class="step-idx">in</span>
                        <span class="kind kind-trigger">trigger</span>
                        <span class="title">Envelope (first user message)</span>
                        <span class="meta">received <VCTimeago :datetime="run.trigger.receivedAt" /></span>
                    </VCCollapseTrigger>
                    <VCCollapseContent class="step-body">
                        <JsonBlock :value="envelope" />
                    </VCCollapseContent>
                </VCCollapse>
            </li>
            <StepItem
                v-for="step in state.steps"
                :key="step.index"
                :step="step"
            />
            <li
                v-for="(entry, i) in liveSteps"
                :key="`live-${entry.step}`"
                class="step step-llm step-live"
                data-testid="live-step"
            >
                <span class="step-mark" />
                <div class="card step-card live-card">
                    <div class="step-sum static">
                        <span class="step-idx">#{{ nextIndex + i }}</span>
                        <span class="kind kind-llm">llm</span>
                        <span class="title">Model turn</span>
                        <span class="streaming-tag">streaming</span>
                        <span class="meta">run.delta · {{ entry.reasoning ? 'reasoning, text' : 'text' }}</span>
                    </div>
                    <div class="stream">
                        <span
                            v-if="entry.reasoning"
                            class="reasoning"
                        >{{ entry.reasoning }}
                        </span><span>{{ entry.text }}</span><span class="caret" />
                    </div>
                </div>
            </li>
        </ol>

        <template v-if="run.status === 'completed' && run.output !== undefined">
            <div class="section-head spaced">
                <h2 class="display">
                    Output
                </h2>
            </div>
            <JsonBlock
                v-if="typeof run.output !== 'string'"
                :value="run.output"
            />
            <div
                v-else
                class="card output-card"
                data-testid="output"
            >
                {{ run.output }}
            </div>
        </template>
    </template>
</template>
