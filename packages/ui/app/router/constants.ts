/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { LOGIN_ROUTE_NAME } from '@chamvi/ui-kit';

export const RouteName = {
    LOGIN: LOGIN_ROUTE_NAME,
    LOGIN_CALLBACK: 'login-callback',
    AGENTS: 'agents',
    AGENT: 'agent',
    RUNS: 'runs',
    RUN: 'run',
    APPROVALS: 'approvals',
    SCHEDULES: 'schedules',
    CONNECTIONS: 'connections',
    CONNECTION: 'connection',
} as const;

export type RouteNameValue = typeof RouteName[keyof typeof RouteName];
