/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { isObject } from 'smob';
import { STORE_DB_PACKAGE } from './constants.ts';
import type { TestDatabaseStore } from './types.ts';

/** Imports a package by a variable specifier, so the bundler, tsc and nx leave it alone. */
function loadPackage<T>(specifier: string): Promise<T> {
    return import(specifier) as Promise<T>;
}

/** The package itself is not installed (Node's or the Vitest module runner's message), not something it imports. */
function isPackageNotFound(error: unknown, specifier: string): boolean {
    if (!isObject(error) || typeof error.message !== 'string') {
        return false;
    }

    if (error.code === 'ERR_MODULE_NOT_FOUND') {
        return error.message.startsWith(`Cannot find package '${specifier}'`);
    }

    return error.code === undefined && error.message.startsWith(`Could not resolve "${specifier}"`);
}

/**
 * The package's ES entry as an app in `directory` resolves it: its
 * `package.json` found from there, then its `exports['.']` import entry
 * (or `main`). Undefined when the folder cannot see it.
 */
async function loadFromDirectory<T>(specifier: string, directory: string): Promise<T | undefined> {
    let manifest: string;

    try {
        manifest = createRequire(path.join(directory, 'package.json')).resolve(`${specifier}/package.json`);
    } catch {
        return undefined;
    }

    const { exports, main } = JSON.parse(await readFile(manifest, 'utf8')) as { exports?: unknown; main?: string };
    const root = isObject(exports) ? (exports as Record<string, unknown>)['.'] : exports;
    let entry: unknown = root;

    if (isObject(root)) {
        entry = root.import ?? root.default;
    }

    return loadPackage<T>(pathToFileURL(path.join(path.dirname(manifest), typeof entry === 'string' ? entry : main ?? 'index.js')).href);
}

/**
 * `@chamvi/store-db` (`specifier`), which an app with a database has
 * installed (a dependency of `@chamvi/app`): first as the kit's own folder
 * resolves it (npm's hoisted layout, and the spec runner's aliases, so the
 * spec and the kit share one copy), then from the app's folder
 * (`directory`, default the working directory), where pnpm's strict layout
 * keeps it. Neither: `InvalidAgentDefinitionError` naming the package.
 */
export async function loadDatabaseStore(specifier: string = STORE_DB_PACKAGE, directory: string = process.cwd()): Promise<TestDatabaseStore> {
    try {
        return await loadPackage<TestDatabaseStore>(specifier);
    } catch (error) {
        if (!isPackageNotFound(error, specifier)) {
            throw error;
        }
    }

    const found = await loadFromDirectory<TestDatabaseStore>(specifier, directory);

    if (found) {
        return found;
    }

    throw new InvalidAgentDefinitionError(
        `createTestDataSource needs ${specifier}: add it to the app's devDependencies, with typeorm and better-sqlite3 (SQLite) or pg (PostgreSQL).`,
    );
}

/** A fresh database name on a PostgreSQL server: one per data source. */
export function testDatabaseName(): string {
    return `chamvi_test_${crypto.randomUUID().replaceAll('-', '')}`;
}
