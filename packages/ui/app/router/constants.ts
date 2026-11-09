/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export const RouteName = {
    LOGIN: 'login',
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
