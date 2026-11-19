/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Env } from '../../env/types.ts';
import { CONFIG_FILE_VARIABLE } from '../constants.ts';
import { locateConfigFile, readConfigFile } from '../file.ts';
import type { ProviderConfig } from '../types.ts';
import { issueMessageOf, reportSettingIssue } from './issues.ts';
import type { SettingIssues } from './types.ts';

export async function readFileLayer(
    env: Env,
    cwd: string,
    issues: SettingIssues,
): Promise<{
    path?: string;
    model?: string;
    providers: Record<string, ProviderConfig>
}> {
    const located = await locateConfigFile(env, cwd);

    if (located === undefined) {
        return { providers: {} };
    }

    try {
        return { path: located.path, ...(await readConfigFile(located.path)) };
    } catch (error) {
        reportSettingIssue(issues, located.named ? `${CONFIG_FILE_VARIABLE}: ${issueMessageOf(error)}` : issueMessageOf(error));

        return { providers: {} };
    }
}
