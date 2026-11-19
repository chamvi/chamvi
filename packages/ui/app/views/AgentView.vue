<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { useToast } from '@vuecs/overlays';
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useAgentDetail } from '../agents/composables.ts';
import {
    canStartAgent,
    channelChips,
    formatBudgetTime,
    lastRunOf,
} from '../agents/helpers/index.ts';
import type { StartRunResult } from '@chamvi/http-kit';
import { NavIcon, useAppContext } from '@chamvi/ui-kit';
import AgentOverview from '../components/agent-overview/AgentOverview.vue';
import AgentRuns from '../components/agent-runs/AgentRuns.vue';
import AgentStatePanel from '../components/agent-state/AgentStatePanel.vue';
import ChannelChip from '../components/channel-chip/ChannelChip.vue';
import EmptyState from '../components/empty-state/EmptyState.vue';
import ScheduleCard from '../components/schedule-card/ScheduleCard.vue';
import StartRunModal from '../components/start-run/StartRunModal.vue';
import { panelId, tabId } from '../components/tab-list/helpers.ts';
import TabList from '../components/tab-list/TabList.vue';
import { RouteName } from '../router/constants.ts';
import { formatTokens, shortId } from '../runs/helpers/index.ts';
import { queryFromFilter } from '../runs/query.ts';
import { useAgentState } from '../state/composables.ts';

const TABS = ['overview', 'runs', 'state', 'schedules'] as const;
type Tab = typeof TABS[number];

const { client, session } = useAppContext();
const route = useRoute();
const router = useRouter();
const toast = useToast();

const name = computed(() => String(route.params.name));
const detail = useAgentDetail(client, name);
const {
    agent,
    schedules,
    error,
} = detail;
const stateName = computed<string | undefined>(() => (agent.value ? agent.value.name : undefined));
const state = useAgentState(client, stateName);

const tab = computed<Tab>({
    get: () => (TABS as readonly string[]).includes(String(route.query.tab)) ? route.query.tab as Tab : 'overview',
    set: (value) => {
        void router.replace({ query: value === 'overview' ? {} : { tab: value } });
    },
});

const chips = computed(() => (agent.value ? channelChips(agent.value, schedules.value) : []));
const canStart = computed(() => (agent.value ? canStartAgent(agent.value, session.allowed) : false));
const invoker = computed(() => session.principal.value?.name ?? session.principal.value?.id);
const stateCount = computed(() => (state.error.value ? undefined :
    `${state.kv.value.length + state.collections.value.length}${state.moreKv.value ? '+' : ''}`));
const startOpen = ref(false);
const emptyRunsText = computed(() => `${name.value} has not run${canStart.value ? '. Use Start run to send a first payload.' : ' yet.'}`);

function onStarted(result: StartRunResult): void {
    toast.add({
        title: result.deduplicated ? `Already started · run ${shortId(result.runId)}` : `Run queued · ${name.value} · ${shortId(result.runId)}`,
        color: 'success',
    });
}
</script>

<template>
    <RouterLink
        class="back"
        :to="{ name: RouteName.AGENTS }"
    >
        <NavIcon name="back" />agents / {{ name }}
    </RouterLink>

    <div
        v-if="error?.status === 403"
        class="card notice"
    >
        Reading an agent needs <b class="mono">chamvi_run_read</b>.
    </div>
    <div
        v-else-if="detail.notFound.value"
        class="card"
    >
        <EmptyState
            icon="search"
            title="No such agent"
            :text="`This app registers no agent named ${name}.`"
        />
    </div>
    <p
        v-else-if="error"
        class="err-line"
        data-testid="agent-error"
    >
        <template v-if="agent">
            Not updating, showing the last data:
        </template>{{ error.code }} · {{ error.message }}
    </p>

    <template v-if="agent">
        <section class="card run-head agent-head">
            <div class="run-head-top">
                <div class="run-title">
                    <h1 class="display">
                        {{ agent.name }}
                    </h1>
                    <span
                        v-if="agent.private"
                        class="tag"
                        data-testid="agent-private"
                        :title="`Private: reading its runs and state needs chamvi_agent_read for ${agent.name}`"
                    ><NavIcon name="lock" />private</span>
                    <div class="head-actions">
                        <VCButton
                            v-if="canStart"
                            class="btn btn-primary"
                            @click="startOpen = true"
                        >
                            <NavIcon name="play" />Start run
                        </VCButton>
                        <RouterLink
                            class="btn"
                            :to="{ name: RouteName.RUNS, query: queryFromFilter({ agent: agent.name }) }"
                        >
                            View all runs
                        </RouterLink>
                    </div>
                </div>
                <div class="trigs">
                    <ChannelChip
                        v-for="chip in chips"
                        :key="`${chip.channel}:${chip.id}`"
                        :chip="chip"
                    />
                </div>
                <dl class="facts">
                    <div>
                        <dt>max steps</dt>
                        <dd class="tnum">
                            {{ agent.budget.maxSteps ?? '—' }}
                        </dd>
                    </div>
                    <div>
                        <dt>timeout</dt>
                        <dd>{{ formatBudgetTime(agent.budget.timeoutMs) }}</dd>
                    </div>
                    <div>
                        <dt>max tokens</dt>
                        <dd :class="agent.budget.maxTokens ? 'tnum' : 'muted'">
                            {{ agent.budget.maxTokens ? formatTokens(agent.budget.maxTokens) : 'no limit' }}
                        </dd>
                    </div>
                    <div>
                        <dt>state</dt>
                        <dd v-if="agent.state.length">
                            <span
                                v-for="collection in agent.state"
                                :key="collection"
                                class="tag"
                            >{{ collection }}</span>
                        </dd>
                        <dd
                            v-else
                            class="muted"
                        >
                            no collections
                        </dd>
                    </div>
                </dl>
            </div>
            <p class="head-note">
                Tools appear here only when they need approval: an agent can build its tool set per run, so the full list is not known ahead of time.
            </p>
        </section>

        <TabList
            v-model="tab"
            :tabs="TABS"
            prefix="agent"
            label="Agent sections"
        >
            <template #tab="{ tab: id }">
                <template v-if="id === 'overview'">
                    Overview
                </template>
                <template v-else-if="id === 'runs'">
                    Runs <span class="count">{{ detail.totalRuns.value }}</span>
                </template>
                <template v-else-if="id === 'state'">
                    State <span
                        v-if="stateCount !== undefined"
                        class="count"
                    >{{ stateCount }}</span>
                </template>
                <template v-else>
                    Schedules <span class="count">{{ schedules.length }}</span>
                </template>
            </template>
        </TabList>

        <div
            :id="panelId('agent')"
            role="tabpanel"
            :aria-labelledby="tabId('agent', tab)"
        >
            <div
                v-if="detail.forbidden.value && tab !== 'state' && tab !== 'schedules'"
                class="card notice"
                data-testid="agent-forbidden"
            >
                Reading this agent's runs needs <b class="mono">chamvi_agent_read</b> for {{ agent.name }}.
            </div>
            <template v-if="tab === 'runs'">
                <AgentRuns
                    v-if="!detail.forbidden.value"
                    :agent="agent"
                />
            </template>
            <AgentStatePanel
                v-else-if="tab === 'state'"
                :agent="agent.name"
                :is-private="agent.private"
                :state="state"
            />
            <template v-else-if="tab === 'schedules'">
                <template v-if="schedules.length">
                    <div class="tab-lede">
                        <p>Cron subscriptions of {{ agent.name }}. Times are in each subscription's time zone.</p>
                    </div>
                    <div class="sched-cards">
                        <ScheduleCard
                            v-for="schedule in schedules"
                            :key="`${schedule.channel}:${schedule.trigger}`"
                            :schedule="schedule"
                            :last="lastRunOf(detail.runs.value, schedule.trigger)"
                        />
                    </div>
                </template>
                <div
                    v-else
                    class="card"
                >
                    <EmptyState
                        icon="schedules"
                        title="No cron subscriptions"
                        :text="`${agent.name} has no cron.on() subscription, so nothing starts it on a schedule.`"
                    />
                </div>
            </template>
            <AgentOverview
                v-else
                :agent="agent"
                :detail="detail"
                :chips="chips"
                :can-start="canStart"
                :empty-runs-text="emptyRunsText"
                @start="startOpen = true"
            />
        </div>

        <StartRunModal
            v-model:open="startOpen"
            :agent="agent.name"
            :invoker="invoker"
            :start="detail.start"
            @started="onStarted"
        />
    </template>
</template>
