/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineContextKey } from '@chamvi/core';
import type { IMailClient } from '../client/types.ts';
import type { IMailWriteClient } from '../write-client/types.ts';

/** The shared client the mail module provides on the engine. */
export const MAIL_CONTEXT = defineContextKey<IMailClient>('mail');

/** The shared write client the mail module provides on the engine. */
export const MAIL_WRITE_CONTEXT = defineContextKey<IMailWriteClient>('mail-write');
