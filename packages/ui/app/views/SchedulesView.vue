<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed } from 'vue';
import EmptyState from '../components/empty-state/EmptyState.vue';
import PageHead from '../components/page-head/PageHead.vue';
import ScheduleCard from '../components/schedule-card/ScheduleCard.vue';
import { useAppContext } from '@chamvi/ui-kit';
import { useSchedules } from '../schedules/composables.ts';
import { groupByAgent } from '../schedules/helpers.ts';

const { client } = useAppContext();
const { schedules, error } = useSchedules(client);
const list = computed(() => groupByAgent(schedules.value).flatMap((group) => group.schedules));
</script>

<template>
    <PageHead
        title="Schedules"
        lede="Cron subscriptions per agent and when they fire next. Times are in each subscription's time zone."
    >
        <span
            v-if="!error"
            class="live"
        >{{ list.length }} cron {{ list.length === 1 ? 'subscription' : 'subscriptions' }}</span>
    </PageHead>

    <div
        v-if="error?.status === 403"
        class="card notice"
    >
        Listing schedules needs <b class="mono">chamvi_run_read</b>.
    </div>
    <div
        v-else-if="list.length === 0"
        class="card"
    >
        <EmptyState
            icon="schedules"
            title="No cron subscriptions"
            text="No agent has a cron.on() subscription, so nothing starts on a schedule."
        />
    </div>
    <div
        v-else
        class="sched-cards"
    >
        <ScheduleCard
            v-for="schedule in list"
            :key="`${schedule.agent}:${schedule.channel}:${schedule.trigger}`"
            :schedule="schedule"
        />
    </div>
</template>
