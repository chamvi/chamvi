<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { useConnection } from './composables.ts';
import QrWidget from './QrWidget.vue';
import StatusBadge from './StatusBadge.vue';
import type { IConnectionsApi } from './types.ts';

// mounted once per connection name (the caller keys it by the name)
const props = defineProps<{
    api: IConnectionsApi;
    name: string;
    /** The principal holds connection:<name>:write: widgets, the live stream and reset. */
    write: boolean;
}>();

const state = useConnection(props.api, props.name, { write: props.write });
const {
    connection,
    widgets,
    error,
    confirming,
    resetting,
    resetError,
} = state;
</script>

<template>
    <div
        v-if="error && !connection"
        class="card notice"
    >
        <template v-if="error.status === 404">
            Connection <b class="mono">{{ name }}</b> does not exist.
        </template>
        <template v-else-if="error.status === 403">
            Reading this connection needs <b class="mono">connection:{{ name }}:read</b>.
        </template>
        <template v-else>
            {{ error.code }} · {{ error.message }}
        </template>
    </div>

    <template v-if="connection">
        <section class="card run-head">
            <div class="run-head-top">
                <div class="run-title">
                    <h1 class="display">
                        {{ connection.name }}
                    </h1>
                    <StatusBadge :status="connection.status" />
                </div>
                <dl class="facts">
                    <div>
                        <dt>type</dt>
                        <dd class="mono">
                            {{ connection.type }}
                        </dd>
                    </div>
                </dl>
            </div>
        </section>

        <div
            v-if="!write"
            class="card notice"
            data-testid="connection-readonly"
        >
            Pairing and reset need <b class="mono">connection:{{ name }}:write</b>.
        </div>
        <template v-else>
            <div
                v-if="error"
                class="card notice"
            >
                The live view stopped: {{ error.code }} · {{ error.message }}
            </div>
            <section
                v-for="(widget, index) in widgets"
                :key="`${widget.kind}:${index}`"
                class="card connection-widget"
            >
                <QrWidget
                    v-if="widget.kind === 'qr'"
                    :value="widget.value"
                />
            </section>

            <section class="card connection-actions">
                <div
                    v-if="!confirming"
                    class="connection-action"
                >
                    <p
                        v-if="connection.status === 'held_elsewhere'"
                        class="hint"
                        data-testid="connection-reset-held"
                    >
                        Another process holds this session, so a reset is refused here: reset it where it is held, or once it is no longer held elsewhere.
                    </p>
                    <p
                        v-else
                        class="hint"
                    >
                        Reset clears the stored session and connects again, so a new pairing starts.
                    </p>
                    <button
                        type="button"
                        class="btn btn-danger"
                        data-testid="connection-reset"
                        @click="state.askReset()"
                    >
                        Reset session
                    </button>
                </div>
                <div
                    v-else
                    class="connection-action"
                    role="alertdialog"
                    aria-labelledby="reset-question"
                    data-testid="connection-reset-confirm"
                >
                    <p id="reset-question">
                        Reset <b class="mono">{{ name }}</b>? The linked session is deleted and the account must be paired again.
                    </p>
                    <div class="connection-action-buttons">
                        <button
                            type="button"
                            class="btn"
                            :disabled="resetting"
                            @click="state.cancelReset()"
                        >
                            Keep session
                        </button>
                        <button
                            type="button"
                            class="btn btn-primary"
                            :disabled="resetting"
                            data-testid="connection-reset-yes"
                            @click="state.confirmReset()"
                        >
                            Reset
                        </button>
                    </div>
                </div>
                <p
                    v-if="resetError"
                    class="form-err"
                    data-testid="connection-reset-error"
                >
                    {{ resetError.status === 409 ? resetError.message : `${resetError.code} · ${resetError.message}` }}
                </p>
            </section>
        </template>
    </template>
</template>
