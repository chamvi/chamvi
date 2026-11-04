/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { z } from 'zod';
import { defineModelAgent } from '@chamvi/core';
import type { Agent } from '@chamvi/core';
import { http, webhook } from '@chamvi/http';
import { deployTool } from './app.ts';
import { textModel } from './model.ts';

/** `echo` (http only) and `intake` (a webhook, a tool asking for approvals, an `issues` collection). */
export function inventoryAgents(): Agent[] {
    return [
        defineModelAgent({
            name: 'echo',
            model: textModel(),
            instructions: 'Echo.',
            channels: [http.on()],
        }),
        defineModelAgent({
            name: 'intake',
            model: textModel(),
            instructions: 'Intake.',
            channels: [webhook.on('/issues')],
            tools: () => ({ deploy: deployTool() }),
            state: { issues: z.object({ title: z.string(), status: z.string() }) },
        }),
    ];
}
