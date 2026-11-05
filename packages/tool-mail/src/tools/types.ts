/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolContext } from '@chamvi/core';
import type { IMailClient } from '../client/types.ts';

/** The client a tool call uses: the given one, or the one provided on the engine. */
export type MailClientSource = (context: ToolContext) => IMailClient;
