/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import 'reflect-metadata';
import { createApp } from '@chamvi/app';
import { tick } from './agents.ts';

export { NoteController } from './controller.ts';
export { COLUMNS, Note, NoteStatus } from './entity.ts';

export default createApp({ agents: [tick] });
