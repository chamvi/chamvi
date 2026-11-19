/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** What no walk reads: installed and built files. */
const IGNORED = ['**/node_modules/**', '**/dist/**', '**/.vitepress/cache/**'];

function filesOf(patterns: string[]): string[] {
    return globSync(patterns, { cwd: ROOT, exclude: IGNORED }).map((path) => path.split('\\').join('/')).sort();
}

function read(path: string): string {
    return readFileSync(`${ROOT}${path}`, 'utf8');
}

const SOURCES = ['packages/*/src/**/*.{ts,mts,cts,vue}'];

/** A repository port (`IRunRepository`, `IEntityRepository`, ...), named anywhere in a file. */
const PORT = /\bI[A-Z]\w*Repository\b/g;

/** A repository token, by its key (`RUN_REPOSITORY`) or its value (`chamvi.run-repository`). */
const TOKEN = /\b[A-Z][A-Z_]*_REPOSITORY\b|\bchamvi\.[a-z-]+-repository\b/g;

/** The ports of `@chamvi/knowledge`, built on the generic one. */
const KNOWLEDGE_PORTS = ['IKnowledgeCollectionRepository', 'IKnowledgeDocumentRepository', 'IKnowledgeChunkRepository'];

/**
 * The files that may name a repository port or a repository token, each
 * with its reason; `names` narrows an exemption to those names. Everything
 * else reaches stored rows through a service.
 */
const PORT_EXEMPTIONS: Array<{
    test: (path: string) => boolean;
    names?: string[];
    reason: string
}> = [
    {
        test: (path) => /^packages\/(store|store-memory|store-db)\/src\//.test(path),
        reason: 'the ports themselves and their memory and database implementations',
    },
    {
        test: (path) => /^packages\/core\/src\/[^/]+\/(service|types)\.ts$/.test(path) &&
            globSync(`${path.slice(0, path.lastIndexOf('/'))}/service.ts`, { cwd: ROOT }).length > 0,
        reason: 'a core service and the context type it is built from (types.ts beside a service.ts)',
    },
    {
        test: (path) => path.startsWith('packages/app/src/modules/repository/') ||
            path.startsWith('packages/app/src/modules/service/') ||
            path.startsWith('packages/app/src/testing/') ||
            path === 'packages/app/src/module/constants.ts' ||
            path === 'packages/app/src/module/types.ts',
        reason: 'the wiring: the store module registers the repository tokens, the services step builds a service from each, ' +
            'the testing store module registers memory repositories, and the token declarations',
    },
    {
        test: (path) => /^packages\/test-kit\/src\/[a-z-]+-contract\//.test(path),
        reason: 'the contract suites, which drive a port directly',
    },
    {
        test: (path) => path.startsWith('packages/docs/src/snippets/database/'),
        names: ['IEntityRepository', 'ITicketRepository'],
        reason: 'the database guide\'s sample app: its own port on the generic one; a chamvi store port is no exemption there',
    },
    {
        test: (path) => path.startsWith('packages/knowledge/src/store/') ||
            path.startsWith('packages/knowledge/src/service/') ||
            path.startsWith('packages/store-db-vector/src/'),
        names: ['IEntityRepository', ...KNOWLEDGE_PORTS],
        reason: 'the knowledge ports and their memory repositories, the knowledge service and its context type, ' +
            'and the pgvector repositories: the knowledge ports only, a chamvi store port is no exemption there',
    },
    {
        test: (path) => [
            'packages/knowledge/src/knowledge/module.ts',
            'packages/knowledge/src/knowledge/types.ts',
        ].includes(path),
        names: ['IKnowledgeCollectionRepository'],
        reason: 'the options of createKnowledge() and the knowledge\'s repository field: they take the collection ' +
            'repository a backend provides and hand it to the knowledge service, which alone reads and writes it',
    },
    {
        test: (path) => path.startsWith('packages/knowledge/src/module/'),
        names: ['IKnowledgeCollectionRepository', 'chamvi.knowledge-repository'],
        reason: 'the knowledge module\'s options and its repository token, which a backend module (vectorStoreModule()) registers and the ' +
            'module hands to the knowledge: the token and its port only',
    },
];

/** The repository ports and repository tokens a source text names. */
function namedPortsAndTokens(source: string): string[] {
    return [...source.matchAll(PORT), ...source.matchAll(TOKEN)].map((match) => match[0]);
}

/** The repository ports and repository tokens each file names, outside the exemptions. */
function portViolations(files: Array<{ path: string; source: string }>): string[] {
    const violations: string[] = [];

    for (const { path, source } of files) {
        const exemption = PORT_EXEMPTIONS.find((candidate) => candidate.test(path));

        if (exemption && !exemption.names) {
            continue;
        }

        for (const name of new Set(namedPortsAndTokens(source))) {
            const allowed = exemption?.names?.includes(name) ?? false;

            if (!allowed) {
                violations.push(`${path} names ${name}`);
            }
        }
    }

    return violations;
}

/** What the store aggregate was; nothing in `packages/` names it. */
const REMOVED = [
    /\bIStore\b/,
    /\bcreateMemoryStore\b/,
    /\bcreateDatabaseStore\b/,
    /\bMemoryStoreOptions\b/,
    /\bDatabaseStoreOptions\b/,
    /\bMemoryStoreRepositories\b/,
    /\bAppToken\.STORE\b(?!_)/,
    /\bengine\.store\b/,
];

const GUIDE = 'packages/docs/src/guide/upgrading.md';

/**
 * The files that may name what was removed, each with its reason. The
 * upgrade guide is not among them: `guideViolations` lets it name a
 * removed export only where it says that it was removed.
 */
const REMOVED_EXEMPTIONS: Array<{ test: (path: string) => boolean; reason: string }> = [
    {
        test: (path) => path.endsWith('/CHANGELOG.md'),
        reason: 'release-please writes the history of every release',
    },
    {
        test: (path) => path === 'packages/app/test/unit/layering.spec.ts',
        reason: 'this spec names what it looks for',
    },
];

function namesRemoved(text: string): string | undefined {
    for (const pattern of REMOVED) {
        const match = pattern.exec(text);

        if (match) {
            return match[0];
        }
    }

    return undefined;
}

/**
 * The guide's lines that name a removed export where it is not said to be
 * removed. The released sections (from `## Upgrading to 0.8` on) are the
 * history of their release. In the unreleased part a removed export may
 * appear in the first cell of a table row (the "before" column, never
 * another cell of it) or inside a `<!-- removed-api -->` ...
 * `<!-- /removed-api -->` block, the paragraphs that say it was removed;
 * a block still open at the next heading fails.
 */
function guideViolations(guide: string): string[] {
    const violations: string[] = [];
    let block = false;
    let released = false;

    guide.split('\n').forEach((line, index) => {
        // a block ends before the next heading: one left open would exempt everything after it
        if (block && line.startsWith('#')) {
            violations.push(`${GUIDE}:${index + 1} opens a heading inside a removed-api block`);
            block = false;
        }

        if (/^## Upgrading to 0\.8\b/.test(line)) {
            released = true;
        }

        if (line.includes('<!-- removed-api -->')) {
            block = true;
        }

        if (line.includes('<!-- /removed-api -->')) {
            block = false;

            return;
        }

        if (released || block) {
            return;
        }

        const checked = line.startsWith('|') ? line.split('|').slice(2).join('|') : line;
        const name = namesRemoved(checked);

        if (name) {
            violations.push(`${GUIDE}:${index + 1} names ${name}`);
        }
    });

    return violations;
}

function removedNameViolations(): string[] {
    const violations: string[] = [];

    for (const path of filesOf(['packages/**/*.{ts,mts,cts,js,mjs,cjs,vue,md,json}'])) {
        const exempt = REMOVED_EXEMPTIONS.some((exemption) => exemption.test(path));

        if (exempt) {
            continue;
        }

        if (path === GUIDE) {
            violations.push(...guideViolations(read(path)));

            continue;
        }

        read(path).split('\n').forEach((line, index) => {
            const name = namesRemoved(line);

            if (name) {
                violations.push(`${path}:${index + 1} names ${name}`);
            }
        });
    }

    return violations;
}

describe('layering', () => {
    it('no source file outside a service, the stores and the wiring names a repository port or a repository token', () => {
        const files = filesOf(SOURCES).map((path) => ({ path, source: read(path) }));

        expect(files.length).toBeGreaterThan(500);
        expect(portViolations(files)).toEqual([]);
    });

    it('finds a port or a token however it is named', () => {
        expect(portViolations([
            { path: 'packages/github/src/a.ts', source: 'import * as store from \'@chamvi/store\';\ntype X = store.IRunRepository;' },
            { path: 'packages/github/src/b.ts', source: 'import store, { type ILockRepository as L } from \'@chamvi/store\';' },
            { path: 'packages/github/src/c.ts', source: 'container.resolve(AppToken.STEP_REPOSITORY);\nnew TypedToken(\'chamvi.lock-repository\');' },
            {
                path: 'packages/knowledge/src/store/d.ts',
                source: 'import type { IKnowledgeCollectionRepository } from \'./types.ts\';\nimport type { IRunRepository } from \'@chamvi/store\';',
            },
            { path: 'packages/knowledge/src/indexer/e.ts', source: 'import type { IKnowledgeCollectionRepository } from \'../store/types.ts\';' },
            { path: 'packages/core/src/run/service.ts', source: 'import type { IRunRepository } from \'@chamvi/store\';' },
        ])).toEqual([
            'packages/github/src/a.ts names IRunRepository',
            'packages/github/src/b.ts names ILockRepository',
            'packages/github/src/c.ts names STEP_REPOSITORY',
            'packages/github/src/c.ts names chamvi.lock-repository',
            'packages/knowledge/src/store/d.ts names IRunRepository',
            'packages/knowledge/src/indexer/e.ts names IKnowledgeCollectionRepository',
        ]);
    });

    it('nothing in packages/ names the store aggregate, the guide only where it says it was removed', () => {
        expect(removedNameViolations()).toEqual([]);
    });

    it('the guide may not name a removed export in an "after" cell or a sentence of the unreleased part', () => {
        const guide = [
            '## Upgrading to 0.9',
            '| `createMemoryStore()` | `createTestEngine()` |',
            '| `new Engine({ store })` | `new Engine({ runService })` on `createMemoryStore()` |',
            'Build the engine on `createMemoryStore()`.',
            '<!-- removed-api -->',
            '`IStore` is gone.',
            '<!-- /removed-api -->',
            '## Upgrading to 0.8',
            'Use `createMemoryStore()`.',
        ].join('\n');

        expect(guideViolations(guide)).toEqual([
            `${GUIDE}:3 names createMemoryStore`,
            `${GUIDE}:4 names createMemoryStore`,
        ]);
    });

    it('a removed-api block still open at the next heading or the released part fails the guide check', () => {
        const unclosed = [
            '## Upgrading to 0.9',
            '<!-- removed-api -->',
            '`IStore` is gone.',
            '### Next',
            'Build the engine on `createMemoryStore()`.',
            '## Upgrading to 0.8',
        ].join('\n');

        expect(guideViolations(unclosed)).toEqual([
            `${GUIDE}:4 opens a heading inside a removed-api block`,
            `${GUIDE}:5 names createMemoryStore`,
        ]);
        expect(guideViolations('## Upgrading to 0.9\n<!-- removed-api -->\n## Upgrading to 0.8')).toEqual([
            `${GUIDE}:3 opens a heading inside a removed-api block`,
        ]);
    });

    it('the upgrade guide names every removed export', () => {
        const guide = read(GUIDE);

        for (const name of ['IStore', 'createMemoryStore', 'createDatabaseStore', 'AppToken.STORE', 'memoryStoreModule', 'StoreModuleOptions']) {
            expect(guide.includes(`\`${name}`), name).toBe(true);
        }
    });

    it('the exemptions are listed with a reason', () => {
        for (const exemption of [...PORT_EXEMPTIONS, ...REMOVED_EXEMPTIONS]) {
            expect(exemption.reason.length).toBeGreaterThan(0);
        }
    });
});
