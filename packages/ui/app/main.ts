/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import '@chamvi/ui-kit/style.css';
import { createAuthGuard, mountPage } from '@chamvi/ui-kit';
import App from './App.vue';
import { createUiRouter } from './router/module.ts';

await mountPage(App, { router: ({ config, session }) => createUiRouter(config, [createAuthGuard(session)]) });
