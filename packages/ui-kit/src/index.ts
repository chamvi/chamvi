/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Plugin } from 'vue';
import { install } from './module.ts';
import type { UiKitOptions } from './types.ts';

export * from './api/index.ts';
export * from './auth/index.ts';
export * from './config/index.ts';
export * from './connections/index.ts';
export * from './context/index.ts';
export * from './module.ts';
export * from './polling/index.ts';
export * from './shell/index.ts';
export * from './sse/index.ts';
export * from './types.ts';

export default { install } satisfies Plugin<UiKitOptions | undefined>;
