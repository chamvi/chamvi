/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createApp, defineModelAgent, http } from '@chamvi/app';

// a model string of a provider whose API key is not set
const triage = defineModelAgent({
    name: 'triage',
    model: 'anthropic/claude-sonnet-5-5',
    instructions: 'Triage the issue.',
    channels: [http.on()],
});

export default createApp({ agents: [triage] });
