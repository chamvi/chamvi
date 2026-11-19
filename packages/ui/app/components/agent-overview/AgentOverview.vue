<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { AgentWire } from '@chamvi/http-kit';
import { NavIcon, StatusChip, useAppContext } from '@chamvi/ui-kit';
import type { useAgentDetail } from '../../agents/composables.ts';
import { failedSummary, oldestWaiting } from '../../agents/helpers/index.ts';
import type { ChannelChip as Chip } from '../../agents/types.ts';
import { approvalLinkQuery } from '../../approvals/helpers/index.ts';
import { RouteName } from '../../router/constants.ts';
import { formatTokens, shortId, waitToolName } from '../../runs/helpers/index.ts';
import { formatFireTime } from '../../schedules/helpers.ts';
import ChannelChip from '../channel-chip/ChannelChip.vue';
import EmptyState from '../empty-state/EmptyState.vue';
import ExpiryCountdown from '../expiry-countdown/ExpiryCountdown.vue';

const props = defineProps<{
    agent: AgentWire;
    detail: ReturnType<typeof useAgentDetail>;
    chips: Chip[];
    canStart: boolean;
    emptyRunsText: string;
}>();

const emit = defineEmits<{ start: [] }>();

const { config } = useAppContext();
const activity = computed(() => props.detail.activity.value);
const schedules = computed(() => props.detail.schedules.value);
const oldest = computed(() => oldestWaiting(props.detail.waitingRuns.value));

function runSub(run: { trigger: { trigger: string; invoker?: { id: string; name?: string } }; concurrencyKey?: string }): string {
    if (run.concurrencyKey) {
        return `${run.trigger.trigger} · ${run.concurrencyKey}`;
    }

    if (run.trigger.invoker) {
        return `${run.trigger.trigger} · by ${run.trigger.invoker.name ?? run.trigger.invoker.id}`;
    }

    return run.trigger.trigger;
}

/** The cron schedule of a chip's subscription, if it is one. */
function scheduleOf(chip: Chip) {
    return schedules.value.find((s) => s.channel === chip.channel && s.trigger === chip.id);
}
</script>

<template>
    <div
        v-if="!detail.forbidden.value"
        class="stats"
    >
        <div class="card stat stat-run">
            <small>Runs · 24 h</small>
            <b data-testid="runs-24h">{{ activity.count }}{{ activity.saturated ? '+' : '' }}</b>
            <span>{{ activity.count || detail.running.value ? `${detail.running.value} running now` : 'nothing started yet' }}</span>
        </div>
        <div class="card stat stat-fail">
            <small>Failed · 24 h</small>
            <b>{{ activity.failed }}</b>
            <span>{{ failedSummary(activity) }}</span>
        </div>
        <div class="card stat stat-wait">
            <small>Waiting</small>
            <b>{{ detail.waitingTotal.value }}</b>
            <span v-if="oldest">oldest asked <VCTimeago :datetime="oldest.updatedAt" /></span>
            <span v-else>no approvals open</span>
        </div>
        <div class="card stat">
            <small>Tokens · 24 h</small>
            <b>{{ formatTokens(activity.tokens) }}{{ activity.saturated ? '+' : '' }}</b>
            <span>{{ agent.budget.maxTokens ? `cap ${formatTokens(agent.budget.maxTokens)} per run` : 'no per-run cap' }}</span>
        </div>
    </div>
    <div class="ov">
        <div class="ov-col">
            <section
                v-if="!detail.forbidden.value"
                class="card panel"
            >
                <div class="panel-head">
                    <h3>Recent runs</h3>
                    <RouterLink
                        v-if="detail.recent.value.length"
                        :to="{ query: { tab: 'runs' } }"
                    >
                        All runs of {{ agent.name }}
                    </RouterLink>
                </div>
                <ul
                    v-if="detail.recent.value.length"
                    class="rows"
                    data-testid="recent-runs"
                >
                    <li
                        v-for="run in detail.recent.value"
                        :key="run.id"
                    >
                        <RouterLink
                            class="rrow"
                            :to="{ name: RouteName.RUN, params: { id: run.id } }"
                        >
                            <StatusChip :status="run.status" />
                            <span class="rrow-main">
                                <span class="id">{{ shortId(run.id) }}</span>
                                <span class="sub">{{ runSub(run) }}</span>
                            </span>
                            <span class="when"><VCTimeago :datetime="run.createdAt" /></span>
                        </RouterLink>
                    </li>
                </ul>
                <EmptyState
                    v-else
                    icon="play"
                    title="No runs yet"
                    :text="emptyRunsText"
                >
                    <VCButton
                        v-if="canStart"
                        class="btn btn-sm btn-primary"
                        @click="emit('start')"
                    >
                        <NavIcon name="play" />Start run
                    </VCButton>
                </EmptyState>
            </section>
        </div>
        <div class="ov-col">
            <section
                v-if="!detail.forbidden.value"
                class="card panel"
            >
                <div class="panel-head">
                    <h3>
                        Waiting for approval<span
                            v-if="detail.waitingTotal.value"
                            class="badge"
                        >{{ detail.waitingTotal.value }}</span>
                    </h3>
                    <RouterLink
                        v-if="detail.waitingRuns.value.length"
                        :to="{ name: RouteName.APPROVALS }"
                    >
                        Open approvals
                    </RouterLink>
                </div>
                <ul
                    v-if="detail.waitingRuns.value.length"
                    class="rows"
                >
                    <li
                        v-for="run in detail.waitingRuns.value"
                        :key="run.id"
                    >
                        <RouterLink
                            class="aprow"
                            :to="{ name: RouteName.APPROVALS, query: approvalLinkQuery(run) }"
                        >
                            <b>{{ waitToolName(run) }}</b>
                            <span class="aprow-timer"><ExpiryCountdown :until="run.waiting!.expiresAt" /></span>
                            <span class="sub">run {{ shortId(run.id) }}{{ run.concurrencyKey ? ` · ${run.concurrencyKey}` : '' }}</span>
                        </RouterLink>
                    </li>
                </ul>
                <p
                    v-else
                    class="panel-empty"
                >
                    Nothing waiting for a person.
                </p>
            </section>
            <section class="card panel">
                <div class="panel-head">
                    <h3>Channels</h3>
                    <span>{{ chips.length }}</span>
                </div>
                <ul class="rows tlist">
                    <li
                        v-for="chip in chips"
                        :key="`${chip.channel}:${chip.id}`"
                    >
                        <div class="tlist-top">
                            <ChannelChip :chip="chip" />
                            <code v-if="chip.id !== chip.channel && chip.id !== `${chip.channel}:${chip.detail}`">{{ chip.id }}</code>
                        </div>
                        <div
                            v-if="scheduleOf(chip)"
                            class="endpoint"
                        >
                            <em>next</em>
                            <code><ExpiryCountdown
                                :until="scheduleOf(chip)!.nextAt"
                                :soon-ms="0"
                            /> · {{ formatFireTime(scheduleOf(chip)!.nextAt, scheduleOf(chip)!.timezone) }}</code>
                        </div>
                        <div
                            v-else-if="chip.hook"
                            class="endpoint"
                        >
                            <em>hook</em><code>POST {{ chip.hook }}</code>
                        </div>
                        <div
                            v-else-if="chip.channel === 'http'"
                            class="endpoint"
                        >
                            <em>route</em><code>POST {{ config.apiBase }}/agents/{{ agent.name }}/runs</code>
                        </div>
                    </li>
                </ul>
            </section>
        </div>
    </div>
</template>
