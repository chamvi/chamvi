/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import Layout from './Layout.vue';

import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist/wght-italic.css';
import '@fontsource-variable/geist-mono/wght.css';
import './style.css';

export default {
    extends: DefaultTheme,
    Layout,
} satisfies Theme;
