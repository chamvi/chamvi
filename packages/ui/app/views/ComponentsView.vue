<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import { useAppContext } from '@chamvi/ui-kit';
import type { ComponentWire } from '@chamvi/ui-kit';
import EmptyState from '../components/empty-state/EmptyState.vue';
import PageHead from '../components/page-head/PageHead.vue';
import { useComponents } from '../component-status/composables.ts';
import { COMPONENT_TIME_COLUMNS } from '../component-status/constants.ts';
import {
    absoluteTime,
    componentState,
    componentSummary,
    startsChannels,
} from '../component-status/helpers.ts';
import type { ComponentTimeKey } from '../component-status/types.ts';

const { client } = useAppContext();
const {
    components,
    error,
    loaded,
} = useComponents(client);

// the red mark goes on the last error only while it is why the component reads failing
const failMark = (component: ComponentWire, key: ComponentTimeKey) => key === 'lastErrorAt' &&
    componentState(component).tone === 'failed';
</script>

<template>
    <PageHead
        title="Components"
        lede="The background jobs and channels of the app replica that answered, and when each last worked. Times are local to this browser."
    >
        <span
            v-if="loaded && !error"
            class="live"
            data-testid="components-count"
        >{{ componentSummary(components) }}</span>
    </PageHead>

    <div
        v-if="error?.status === 403"
        class="card notice"
        data-testid="components-forbidden"
    >
        Listing components needs <b class="mono">{{ Permission.COMPONENT_READ }}</b>.
    </div>
    <div
        v-else-if="error"
        class="card notice"
        data-testid="components-error"
    >
        {{ error.code }} · {{ error.message }}
    </div>
    <div
        v-else-if="loaded && components.length === 0"
        class="card"
    >
        <EmptyState
            icon="components"
            title="No components"
            text="This app runs no background job and holds no channel with a start, so there is nothing to watch."
        />
    </div>
    <div
        v-else-if="components.length > 0"
        class="card table-card"
    >
        <div class="table-wrap">
            <table
                class="t stack"
                data-testid="components"
            >
                <thead>
                    <tr>
                        <th>Component</th>
                        <th>Status</th>
                        <th
                            v-for="column in COMPONENT_TIME_COLUMNS"
                            :key="column.key"
                        >
                            {{ column.label }}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="(component, index) in components"
                        :key="`${component.kind}:${component.name}`"
                        :class="{ 'kind-break': startsChannels(components, index) }"
                        :data-component="component.name"
                        :data-kind="component.kind"
                    >
                        <td class="full">
                            <span class="comp-name">{{ component.name }}</span>
                            {{ ' ' }}
                            <span :class="['kind', { 'kind-channel': component.kind === 'channel' }]">{{ component.kind }}</span>
                        </td>
                        <td data-label="Status">
                            <span
                                :class="['chip', `chip-${componentState(component).tone}`]"
                                data-testid="component-status"
                            >{{ componentState(component).label }}</span>
                        </td>
                        <td
                            v-for="column in COMPONENT_TIME_COLUMNS"
                            :key="column.key"
                            :data-label="column.label"
                            :data-time="column.key"
                        >
                            <span
                                v-if="component[column.key]"
                                :class="['when', { 'when-fail': failMark(component, column.key) }]"
                                :title="absoluteTime(component[column.key]!)"
                            ><VCTimeago :datetime="component[column.key]!" /></span>
                            <span
                                v-else
                                class="muted"
                            >—</span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
