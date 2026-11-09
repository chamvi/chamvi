/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { InjectionKey } from 'vue';
import type { AppContext } from './types.ts';

export const APP_CONTEXT: InjectionKey<AppContext> = Symbol('chamvi');
