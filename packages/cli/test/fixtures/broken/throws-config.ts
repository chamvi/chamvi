/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createApp } from '@chamvi/app';
import { githubModule } from '@chamvi/github/module';
import { echo } from '../app/src/agents.ts';

// a malformed value is refused when the factory is called, i.e. at import
export default createApp({ agents: [echo], modules: [githubModule({ env: { GITHUB_INSTALLATION_ID: '0' } })] });
