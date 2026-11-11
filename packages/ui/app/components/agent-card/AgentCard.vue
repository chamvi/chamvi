<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ACTIVITY_LIMIT } from '../../agents/constants.ts';
import { formatBudgetTime } from '../../agents/helpers.ts';
import type { AgentRollup, ChannelChip as Chip } from '../../agents/types.ts';
import type { AgentWire } from '@chamvi/ui-kit';
import { RouteName } from '../../router/constants.ts';
import { shortId } from '../../runs/helpers.ts';
import ActivityStrip from '../activity-strip/ActivityStrip.vue';
import ChannelChip from '../channel-chip/ChannelChip.vue';
import ExpiryCountdown from '../expiry-countdown/ExpiryCountdown.vue';
import { NavIcon, StatusChip  } from '@chamvi/ui-kit';

defineProps<{
    agent: AgentWire;
    chips: Chip[];
    rollup?: AgentRollup;
    /** Set when the principal may not read the agent's runs: shown instead of the rollup. */
    hidden?: string;
}>();

</script>

<template>
    <article
        class="card agent-card"
        data-testid="agent-card"
        :data-agent="agent.name"
    >
        <div class="agent-top">
            <h2 class="display">
                <!-- the one link of the card, stretched over it (::after); the last-run link sits above -->
                <RouterLink
                    class="card-link"
                    :to="{ name: RouteName.AGENT, params: { name: agent.name } }"
                >
                    {{ agent.name }}
                </RouterLink>
            </h2>
            <span
                v-if="agent.private"
                class="tag"
                data-testid="agent-private"
                :title="`Private: reading its runs and state needs chamvi_agent_read for ${agent.name}`"
            ><NavIcon name="lock" />private</span>
            <NavIcon name="go" />
        </div>
        <div class="trigs">
            <ChannelChip
                v-for="chip in chips"
                :key="`${chip.channel}:${chip.id}`"
                :chip="chip"
            />
        </div>
        <p
            v-if="hidden"
            class="hidden-runs"
            data-testid="agent-runs-hidden"
        >
            <NavIcon name="lock" />{{ hidden }}
        </p>
        <template v-else-if="rollup">
            <div class="nums">
                <div :class="['n-run', { zero: !rollup.running }]">
                    <small>Running</small><b>{{ rollup.running }}</b>
                </div>
                <div :class="['n-wait', { zero: !rollup.waiting }]">
                    <small>Waiting</small><b>{{ rollup.waiting }}</b>
                </div>
                <div :class="{ zero: !rollup.nextFire }">
                    <small>Next cron</small>
                    <ExpiryCountdown
                        v-if="rollup.nextFire"
                        :until="rollup.nextFire.nextAt"
                        :soon-ms="0"
                    />
                    <b
                        v-else
                        class="mono"
                    >—</b>
                </div>
            </div>
            <ActivityStrip :activity="rollup.activity" />
            <div class="last">
                <span class="field-label">Last run</span>
                <div
                    v-if="rollup.last"
                    class="last-row"
                >
                    <StatusChip :status="rollup.last.status" />
                    <RouterLink
                        class="id"
                        :to="{ name: RouteName.RUN, params: { id: rollup.last.id } }"
                    >
                        {{ shortId(rollup.last.id) }}
                    </RouterLink>
                    <span class="when"><VCTimeago :datetime="rollup.last.createdAt" /></span>
                </div>
                <p v-else-if="rollup.lastBeyond">
                    None among the newest {{ ACTIVITY_LIMIT }} runs.
                </p>
                <p v-else>
                    No runs yet.<template v-if="chips.some((c) => c.channel === 'http')">
                        Start one from its page.
                    </template>
                </p>
            </div>
        </template>
        <dl class="agent-foot">
            <div>
                <dt>Budget</dt>
                <dd>
                    {{ agent.budget.maxSteps ?? '—' }} steps · {{ formatBudgetTime(agent.budget.timeoutMs) }}
                </dd>
            </div>
            <div>
                <dt>State</dt>
                <dd
                    v-if="agent.state.length"
                >
                    <span
                        v-for="collection in agent.state"
                        :key="collection"
                        class="tag"
                    >{{ collection }}</span>
                </dd>
                <dd
                    v-else
                    class="none"
                >
                    no collections
                </dd>
            </div>
        </dl>
    </article>
</template>
