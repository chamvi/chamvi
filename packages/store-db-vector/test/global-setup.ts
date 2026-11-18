/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import type { PostgresConnection } from './utils/database.ts';

export default async function setup(project: TestProject) {
    let container;

    try {
        container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
            // a throwaway container: no fsync, so the drops of parallel spec files do not queue on a slow disk
            .withCommand(['postgres', '-c', 'max_connections=200', '-c', 'fsync=off', '-c', 'full_page_writes=off', '-c', 'synchronous_commit=off'])
            .start();
    } catch (e) {
        if (process.env.CI) {
            throw e;
        }

        const message = Error.isError(e) ? e.message : String(e);

        // eslint-disable-next-line no-console
        console.warn(`[@chamvi/store-db-vector] Docker is not available, skipping the Postgres tests: ${message}. Start Docker to run them.`);

        return undefined;
    }

    const connection: PostgresConnection = {
        host: container.getHost(),
        port: container.getPort(),
        username: container.getUsername(),
        password: container.getPassword(),
    };

    project.provide('postgres', connection);

    return async () => {
        await container.stop();
    };
}
