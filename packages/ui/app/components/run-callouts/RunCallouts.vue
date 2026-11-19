<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { RunWire } from '@chamvi/http-kit';
import { NavIcon, StatusChip } from '@chamvi/ui-kit';
import { approvalLinkQuery, approvalWaitOf } from '../../approvals/helpers/index.ts';
import { RouteName } from '../../router/constants.ts';
import { dispatchCallout, remoteCallout, waitToolName } from '../../runs/helpers/index.ts';

const props = defineProps<{ run: RunWire }>();

const dispatchLine = computed(() => dispatchCallout(props.run));
const remoteWait = computed(() => remoteCallout(props.run));
</script>

<template>
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
                <h2>{{ waitToolName(run) }}<StatusChip status="waiting" /></h2>
                <p>{{ dispatchLine }}.</p>
            </div>
        </div>
    </div>

    <div
        v-if="remoteWait"
        class="callout"
        style="margin-bottom: 26px"
        data-testid="remote-callout"
    >
        <div class="callout-head">
            <span class="callout-icon"><NavIcon name="play" /></span>
            <div class="callout-title">
                <h2>{{ remoteWait.target }}<StatusChip status="waiting" /></h2>
                <p>
                    Waits for the remote run <span class="mono">{{ remoteWait.remoteRunId }}</span>.
                </p>
                <p
                    v-if="remoteWait.approval"
                    data-testid="remote-approval"
                >
                    Waits for an approval at the peer: {{ remoteWait.approval.title }}
                </p>
            </div>
            <a
                v-if="remoteWait.approval?.url"
                class="btn btn-sm"
                :href="remoteWait.approval.url"
                target="_blank"
                rel="noopener noreferrer"
            >
                Answer at the peer
            </a>
        </div>
    </div>
</template>
