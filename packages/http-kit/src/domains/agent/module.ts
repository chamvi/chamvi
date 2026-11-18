/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { path } from '../../helpers/path.ts';
import { BaseAPI } from '../base.ts';
import { dataOf } from '../helpers.ts';
import type { APIRequestOptions } from '../types.ts';
import type {
    AgentIssueWire,
    AgentList,
    AgentWire,
    IAgentAPI,
    StartRunBody,
    StartRunResult,
} from './types.ts';

export class AgentAPI extends BaseAPI implements IAgentAPI {
    async getMany(options?: APIRequestOptions): Promise<AgentList> {
        const body = await this.request<unknown>({ url: '/agents', method: 'GET' }, options);

        return {
            data: dataOf<AgentWire>(body),
            issues: isObject(body) && Array.isArray(body.issues) ? body.issues as AgentIssueWire[] : [],
        };
    }

    startRun(name: string, body: StartRunBody, options?: APIRequestOptions): Promise<StartRunResult> {
        return this.request<StartRunResult>({
            url: `${path('agents', name)}/runs`, 
            method: 'POST', 
            body, 
        }, options);
    }
}
