#!/usr/bin/env node
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { fileURLToPath } from 'node:url';
import { processContext } from './run/helpers.ts';
import { runCli } from './run/module.ts';

await runCli(process.argv.slice(2), processContext(fileURLToPath(import.meta.url)));
