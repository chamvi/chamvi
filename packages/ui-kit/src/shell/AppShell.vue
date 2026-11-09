<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { useColorMode } from '@vuecs/design';
import { computed } from 'vue';
import type { MeWire } from '../api/types.ts';
import { useAppContext } from '../context/module.ts';
import BrandLogo from './BrandLogo.vue';
import { useUiPages } from './composables.ts';
import NavIcon from './NavIcon.vue';
import type { IconName } from './types.ts';

const props = defineProps<{
    principal?: MeWire;
    /** The open item: a fixed item's key (`agents`, `runs`, ...) or a page's slug. */
    current?: string;
    /** A host with a router takes the fixed items' clicks; without it they are plain links. */
    navigate?: (path: string) => void;
    /** A count on a fixed item, by its key. */
    badges?: Record<string, number>;
}>();

const emit = defineEmits<{ signOut: [] }>();

const { config } = useAppContext();
const {
    pages, 
    types, 
    connections, 
} = useUiPages();
const { host } = globalThis.location;
const colorMode = useColorMode();

const items: ReadonlyArray<{
    key: string; 
    label: string; 
    icon: IconName 
}> = [
    {
        key: 'agents', 
        label: 'Agents', 
        icon: 'agents', 
    },
    {
        key: 'runs', 
        label: 'Runs', 
        icon: 'runs', 
    },
    {
        key: 'approvals', 
        label: 'Approvals', 
        icon: 'approvals', 
    },
    {
        key: 'schedules', 
        label: 'Schedules', 
        icon: 'schedules', 
    },
    {
        key: 'connections', 
        label: 'Connections', 
        icon: 'connections', 
    },
];

// the page shows only when the app exposes a connection this principal may read
const visible = computed(() => items.filter((item) => item.key !== 'connections' || connections.value.length > 0));

function follow(event: globalThis.MouseEvent, key: string): void {
    // a new tab or window stays the browser's
    if (!props.navigate || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
    }

    event.preventDefault();
    props.navigate(`/${key}`);
}

const displayName = computed(() => props.principal?.name ?? props.principal?.id ?? '');
const initials = computed(() => displayName.value.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?');
const grants = computed(() => {
    const count = props.principal?.permissions.length ?? 0;

    return `${props.principal?.kind ?? ''} · ${count} ${count === 1 ? 'grant' : 'grants'}`;
});
</script>

<template>
    <div :class="['app', 'shell', { 'has-accounts': $slots.accounts }]">
        <aside class="side">
            <BrandLogo />
            <nav aria-label="Main">
                <div class="nav-group">
                    Operate
                </div>
                <a
                    v-for="item in visible"
                    :key="item.key"
                    :href="`${config.uiBase}/${item.key}`"
                    class="nav-item"
                    :data-nav="item.key"
                    :aria-current="current === item.key ? 'page' : undefined"
                    @click="follow($event, item.key)"
                >
                    <NavIcon :name="item.icon" />
                    {{ item.label }}
                    <span
                        v-if="badges?.[item.key]"
                        class="badge"
                        :aria-label="`${badges[item.key]} waiting`"
                    >{{ badges[item.key] }}</span>
                </a>
                <template v-if="pages.length > 0">
                    <div class="nav-group nav-group-next">
                        Connect
                    </div>
                    <a
                        v-for="page in pages"
                        :key="page.slug"
                        :href="page.path"
                        class="nav-item"
                        :data-page="page.slug"
                        :aria-current="current === page.slug ? 'page' : undefined"
                    >
                        <NavIcon name="connections" />
                        {{ page.label }}
                    </a>
                </template>
            </nav>
            <div class="side-foot">
                <div
                    class="env"
                    :title="host"
                >
                    <span>{{ host }}</span>
                </div>
                <div class="who">
                    <span
                        class="avatar"
                        aria-hidden="true"
                    >{{ initials }}</span>
                    <div class="who-text">
                        <div
                            class="who-name"
                            data-testid="principal"
                        >
                            {{ displayName }}
                        </div>
                        <div class="who-sub">
                            {{ grants }}
                        </div>
                    </div>
                    <div class="who-actions">
                        <button
                            type="button"
                            class="icon-btn"
                            :title="colorMode.isDark.value ? 'Light mode' : 'Dark mode'"
                            :aria-label="colorMode.isDark.value ? 'Light mode' : 'Dark mode'"
                            @click="colorMode.toggle()"
                        >
                            <NavIcon :name="colorMode.isDark.value ? 'sun' : 'moon'" />
                        </button>
                        <button
                            type="button"
                            class="icon-btn"
                            title="Sign out"
                            aria-label="Sign out"
                            @click="emit('signOut')"
                        >
                            <NavIcon name="logout" />
                        </button>
                    </div>
                </div>
            </div>
        </aside>
        <aside
            v-if="$slots.accounts"
            class="side-sub"
        >
            <slot
                name="accounts"
                :types="types"
                :connections="connections"
            />
        </aside>
        <div class="canvas">
            <main class="main">
                <slot />
            </main>
        </div>
    </div>
</template>
