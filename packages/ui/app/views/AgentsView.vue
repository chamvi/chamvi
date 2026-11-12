<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed, ref } from 'vue';
import { useAgentRollups } from '../agents/composables.ts';
import { channelChips, hiddenRunsNotice, matchesName } from '../agents/helpers.ts';
import AgentCard from '../components/agent-card/AgentCard.vue';
import EmptyState from '../components/empty-state/EmptyState.vue';
import PageHead from '../components/page-head/PageHead.vue';
import { useAppContext, useResolved } from '@chamvi/ui-kit';

const { client, session } = useAppContext();
const {
    agents,
    issues,
    schedules,
    rollups,
    error,
    loaded,
} = useAgentRollups(client);

const query = ref('');
const shown = computed(() => agents.value.filter((agent) => matchesName(agent, query.value)));
// a private agent's card says why its runs are missing
const hidden = useResolved(
    () => [agents.value, session.principal.value] as const,
    async ([list, principal]) => {
        const notices: Record<string, string | undefined> = {};

        await Promise.all(list.map(async (agent) => {
            notices[agent.name] = await hiddenRunsNotice(agent, principal);
        }));

        return notices;
    },
    {} as Record<string, string | undefined>,
);
</script>

<template>
    <PageHead
        title="Agents"
        lede="Every agent this app runs, with what starts it and what it did in the last 24 h. Open one for its runs, state and schedules."
    >
        <span
            v-if="loaded && !error"
            class="live"
        >{{ agents.length }} {{ agents.length === 1 ? 'agent' : 'agents' }}</span>
    </PageHead>

    <div
        v-if="error?.status === 403"
        class="card notice"
    >
        Listing agents needs <b class="mono">chamvi_run_read</b>. An approval link from a notification still works.
    </div>
    <template v-else>
        <p
            v-if="error"
            class="err-line"
            style="margin-bottom: 14px"
        >
            {{ error.code }} · {{ error.message }}
        </p>
        <div
            v-if="issues.length > 0"
            class="card notice load-issues"
            role="status"
            data-testid="agent-issues"
        >
            <p>{{ issues.length }} {{ issues.length === 1 ? 'agent' : 'agents' }} failed to load</p>
            <p
                v-for="issue in issues"
                :key="issue.agent"
            >
                <code class="mono">{{ issue.agent }}</code> {{ issue.message }}
            </p>
        </div>
        <div class="toolbar">
            <VCFormGroup
                label-tag="span"
                style="width: 260px; max-width: 100%"
            >
                <template #label>
                    <label for="agent-filter">Filter by name</label>
                </template>
                <VCFormInput
                    id="agent-filter"
                    v-model="query"
                    class="mono"
                    type="search"
                    placeholder="e.g. triage"
                    autocomplete="off"
                    name="agent-filter"
                />
            </VCFormGroup>
        </div>
        <div
            v-if="shown.length > 0"
            class="agent-cards"
        >
            <AgentCard
                v-for="agent in shown"
                :key="agent.name"
                :agent="agent"
                :chips="channelChips(agent, schedules)"
                :rollup="rollups[agent.name]"
                :hidden="hidden[agent.name]"
            />
        </div>
        <div
            v-else-if="loaded && agents.length > 0"
            class="card"
        >
            <EmptyState
                icon="search"
                title="No agent matches"
                :text="`No agent name contains “${query.trim()}”. Agent names are lower-case, like release-notes.`"
            >
                <button
                    type="button"
                    class="btn btn-sm"
                    @click="query = ''"
                >
                    Clear filter
                </button>
            </EmptyState>
        </div>
        <div
            v-else-if="loaded && !error"
            class="card"
        >
            <EmptyState
                icon="agents"
                title="No agents"
                text="This app registers no agent. Pass them to the Engine with defineModelAgent()."
            />
        </div>
    </template>
</template>
