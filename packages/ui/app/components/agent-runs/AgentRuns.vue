<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { RunStatusLiteral } from '@chamvi/core-kit';
import type { DateRangeValue } from '@vuecs/forms';
import { computed, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { AgentWire } from '@chamvi/http-kit';
import type { RunListFilter } from '../../runs/types.ts';
import { useAppContext } from '@chamvi/ui-kit';
import { useRunList } from '../../runs/composables.ts';
import { RUN_DATE_PRESETS, RUN_STATUSES } from '../../runs/constants.ts';
import { filterFromQuery, queryFromFilter } from '../../runs/query.ts';
import EmptyState from '../empty-state/EmptyState.vue';
import RunsTable from '../runs-table/RunsTable.vue';

const props = defineProps<{ agent: AgentWire }>();

const { client } = useAppContext();
const route = useRoute();
const router = useRouter();

// the status and date filters and the page live in the query, next to ?tab=runs
const read = (): RunListFilter => ({ ...filterFromQuery(route.query), agent: props.agent.name });
const filter = shallowRef<RunListFilter>(read());

watch(() => [route.query, props.agent.name], () => {
    filter.value = read();
});

const { page, loading } = useRunList(client, filter);

function update(next: Partial<RunListFilter>): void {
    const query = queryFromFilter({
        ...filter.value,
        agent: undefined,
        offset: 0,
        ...next,
    });

    void router.replace({ query: { ...query, tab: 'runs' } });
}

const range = computed({
    get: (): DateRangeValue => ({ from: filter.value.from, to: filter.value.to }),
    set: (value: DateRangeValue) => update({ from: value.from, to: value.to }),
});

function toggleStatus(status: RunStatusLiteral): void {
    const current = filter.value.status ?? [];

    update({ status: current.includes(status) ? current.filter((s) => s !== status) : [...current, status] });
}

const filtered = computed(() => !!filter.value.status?.length || !!filter.value.from || !!filter.value.to);
</script>

<template>
    <div class="toolbar">
        <div
            class="field"
            style="min-width: 0; flex: 1"
        >
            <span class="field-label">Status</span>
            <div>
                <div
                    class="seg"
                    role="group"
                    aria-label="Status filter"
                >
                    <button
                        v-for="status in RUN_STATUSES"
                        :key="status"
                        type="button"
                        :data-status="status"
                        :aria-pressed="(filter.status ?? []).includes(status)"
                        @click="toggleStatus(status)"
                    >
                        {{ status }}
                    </button>
                </div>
            </div>
        </div>
        <div class="field date-range">
            <VCFormDateRange
                v-model="range"
                :presets="RUN_DATE_PRESETS"
                from-label="Created from"
                to-label="Created until"
                presets-label="Created in"
                :theme-class="{ label: 'field-label' }"
            />
        </div>
    </div>
    <RunsTable
        :page="page"
        :agents="[agent]"
        :loading="loading"
        :scoped="agent.name"
        @page="(offset) => update({ offset })"
    >
        <template #empty>
            <EmptyState
                v-if="filtered"
                variant="noResults"
                icon="search"
                title="No runs match these filters"
                :text="`Nothing of ${agent.name} matches these filters. Widen them.`"
                action-label="Clear filters"
                @action="update({ status: undefined, from: undefined, to: undefined })"
            />
            <EmptyState
                v-else
                icon="play"
                title="No runs yet"
                :text="`${agent.name} has not run. Start a run from the header, or wait for one of its triggers.`"
            />
        </template>
    </RunsTable>
</template>
