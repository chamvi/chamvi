<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { RunPage, RunWire } from '@chamvi/http-kit';
import { StatusChip } from '@chamvi/ui-kit';
import { RouteName } from '../../router/constants.ts';
import { childRole, shortId } from '../../runs/helpers/index.ts';

const props = defineProps<{ page: RunPage | undefined; forbidden: boolean }>();

const rows = computed(() => props.page?.data ?? []);
const CHILD_COLUMNS = [
    { key: 'id', label: 'Run' },
    { key: 'agent', label: 'Agent' },
    { key: 'role', label: 'Role' },
    { key: 'status', label: 'Status' },
];
const childRow = (value: unknown) => value as RunWire;
</script>

<template>
    <template v-if="forbidden || rows.length > 0">
        <div class="section-head">
            <h2 class="display">
                Dispatched runs
            </h2>
            <span v-if="page">{{ page.meta.total }}</span>
        </div>
        <div
            v-if="forbidden"
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
                    :data="rows"
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
</template>
