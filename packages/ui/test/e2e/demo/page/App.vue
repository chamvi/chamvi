<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { AppShell, useAppContext } from '@chamvi/ui-kit';
import { E2E_PAGE_SLUG } from '../constants.ts';

const { session } = useAppContext();
</script>

<template>
    <AppShell
        :principal="session.principal.value"
        :current="E2E_PAGE_SLUG"
    >
        <h1 data-testid="demo-page">
            Demo page
        </h1>
    </AppShell>
</template>
