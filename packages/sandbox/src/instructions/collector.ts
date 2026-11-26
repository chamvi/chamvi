/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import type { IClock } from '@chamvi/core';
import { ValidationError } from '@chamvi/errors';
import { resolveWorkspacePath } from '../path/module.ts';
import type { ExecResult, IWorkspace } from '../workspace/types.ts';
import {
    INSPECT_BATCH_MAX_BYTES,
    INSPECT_BATCH_MAX_PATHS,
    INSTRUCTION_DENIED_MESSAGE,
    INSTRUCTION_DIRECTORIES_MAX,
    INSTRUCTION_FILES,
    INSTRUCTION_INCLUDE_DEPTH_MAX,
    INSTRUCTION_LINK_MESSAGE,
    INSTRUCTION_PATHS_MAX,
    INSTRUCTION_PATH_MAX_BYTES,
    INSTRUCTION_REFERENCES_MAX,
    INSTRUCTION_SOURCES_MAX,
    INSTRUCTION_SOURCE_MAX_BYTES,
    INSTRUCTION_SPECIAL_MESSAGE,
    INSTRUCTION_TOTAL_MAX_BYTES,
    INSTRUCTION_UNREADABLE_MESSAGE,
} from './constants.ts';
import { execDiscoveryScript } from './exec.ts';
import {
    byteLength,
    directoryChain,
    isGitPath,
    parseIncludes,
    parseInspectOutput,
    parseReadOutput,
    pathPrefix,
    resolveInclude,
} from './helpers/index.ts';
import type {
    DiagnosticList,
    IncludeTarget,
    InspectionStatus,
    InstructionNode,
    RepositoryInstructionSource,
} from './types.ts';

/** One request of `readRepositoryInstructions`: its bounds, what it read and what it reported. */
export class InstructionCollector {
    protected readonly workspace: IWorkspace;

    protected readonly clock: IClock;

    protected readonly signal: AbortSignal | undefined;

    protected readonly deadline: number;

    protected readonly redact: (text: string) => string;

    protected readonly diagnostics: DiagnosticList;

    protected readonly requested: readonly string[];

    protected references = 0;

    protected totalBytes = 0;

    protected stopped = false;

    readonly expiry = new AbortController();

    protected readonly statuses = new Map<string, InspectionStatus>();

    readonly sources: RepositoryInstructionSource[] = [];

    protected readonly nodes = new Map<string, InstructionNode>();

    protected readonly visited = new Map<string, number>();

    /** The accepted requested paths, once `collect` looked at them. */
    paths: string[] = [];

    constructor(input: {
        workspace: IWorkspace;
        clock: IClock;
        signal: AbortSignal | undefined;
        deadline: number;
        redact: (text: string) => string;
        diagnostics: DiagnosticList;
        requested: readonly string[];
    }) {
        this.workspace = input.workspace;
        this.clock = input.clock;
        this.signal = input.signal;
        this.deadline = input.deadline;
        this.redact = input.redact;
        this.diagnostics = input.diagnostics;
        this.requested = input.requested;
    }

    stop(message: string) {
        if (this.stopped) {
            return;
        }

        this.stopped = true;
        this.diagnostics.add('.', 'limit', message);
    }

    /** Counts one inspection or reference; false (and stopped) past the bound. */
    count() {
        if (this.stopped) {
            return false;
        }

        if (this.references >= INSTRUCTION_REFERENCES_MAX) {
            this.stop(`More than ${INSTRUCTION_REFERENCES_MAX} paths and references were looked at; the rest were skipped.`);

            return false;
        }

        this.references++;

        return true;
    }

    protected execScript(args: string[]): Promise<ExecResult> {
        return execDiscoveryScript({
            workspace: this.workspace,
            clock: this.clock,
            signal: this.signal,
            deadline: this.deadline,
            expiry: this.expiry,
        }, args);
    }

    /** Inspects the paths not inspected yet, in batches. */
    protected async inspect(list: string[]) {
        const pending = [...new Set(list.filter((path) => !this.statuses.has(path)))];

        while (pending.length > 0) {
            const batch: string[] = [];
            let bytes = 0;

            for (let next = pending[0]; next !== undefined; next = pending[0]) {
                if (batch.length >= INSPECT_BATCH_MAX_PATHS || (batch.length > 0 && bytes + byteLength(next) > INSPECT_BATCH_MAX_BYTES)) {
                    break;
                }

                bytes += byteLength(next);
                batch.push(next);
                pending.shift();
            }

            const result = await this.execScript(['inspect', ...batch]);
            const found = parseInspectOutput(result, batch.length);

            batch.forEach((path, index) => this.statuses.set(path, found[index]!));
        }
    }

    /** Reports a status that is no regular file; `missing` names the code of an absent path. */
    protected report(path: string, status: InspectionStatus | { kind: 'unreadable' }, missing?: 'missing-include') {
        switch (status.kind) {
            case 'absent':
                if (missing) {
                    this.diagnostics.add(path, missing, 'The included file does not exist.');
                }

                return;
            case 'link':
                this.diagnostics.add(pathPrefix(path, status.at), 'unsupported-file', INSTRUCTION_LINK_MESSAGE);

                return;
            case 'denied':
                this.diagnostics.add(pathPrefix(path, status.at - 1), 'unreadable', INSTRUCTION_DENIED_MESSAGE);

                return;
            case 'unreadable':
                this.diagnostics.add(path, 'unreadable', INSTRUCTION_UNREADABLE_MESSAGE);

                return;
            case 'file':
                // a regular file is no failure
                return;
            default:
                this.diagnostics.add(path, 'unsupported-file', INSTRUCTION_SPECIAL_MESSAGE);
        }
    }

    /** Reads and records a file once per request; undefined when it failed (reported once). */
    protected async load(path: string, include: boolean): Promise<InstructionNode> {
        if (this.nodes.has(path)) {
            return this.nodes.get(path);
        }

        if (this.sources.length >= INSTRUCTION_SOURCES_MAX) {
            this.stop(`More than ${INSTRUCTION_SOURCES_MAX} instruction files; the rest were skipped.`);

            return undefined;
        }

        const outcome = parseReadOutput(await this.execScript(['read', path]));
        let node: InstructionNode;

        if (outcome.kind !== 'bytes') {
            this.report(path, outcome, include ? 'missing-include' : undefined);
        } else if (outcome.bytes.byteLength > INSTRUCTION_SOURCE_MAX_BYTES) {
            this.diagnostics.add(path, 'limit', `The file is larger than ${INSTRUCTION_SOURCE_MAX_BYTES} bytes and was omitted.`);
        } else if (this.totalBytes + outcome.bytes.byteLength > INSTRUCTION_TOTAL_MAX_BYTES) {
            this.stop(`The instruction files exceed ${INSTRUCTION_TOTAL_MAX_BYTES} bytes together; the rest were skipped.`);
        } else {
            let text: string | undefined;

            try {
                text = new TextDecoder('utf-8', { fatal: true }).decode(outcome.bytes);
            } catch {
                this.diagnostics.add(path, 'invalid-utf8', 'The file is not valid UTF-8.');
            }

            if (text !== undefined) {
                this.totalBytes += outcome.bytes.byteLength;

                // redacted before anything reads it, the digest is of the bytes on disk
                const content = this.redact(text);
                const source: RepositoryInstructionSource = {
                    path,
                    sha256: createHash('sha256').update(outcome.bytes).digest('hex'),
                    content,
                    scopes: [],
                    includedBy: [],
                };

                this.sources.push(source);
                node = { source, includes: parseIncludes(content) };
            }
        }

        this.nodes.set(path, node);

        return node;
    }

    protected async visit(path: string, scope: string, parent: string | undefined, ancestry: string[]): Promise<void> {
        if (this.stopped) {
            return;
        }

        const node = await this.load(path, parent !== undefined);

        if (!node) {
            return;
        }

        if (!node.source.scopes.includes(scope)) {
            node.source.scopes.push(scope);
        }

        if (parent !== undefined && !node.source.includedBy.includes(parent)) {
            node.source.includedBy.push(parent);
        }

        if (ancestry.includes(path)) {
            this.diagnostics.add(path, 'cycle', 'The file includes itself through the files it includes.');

            return;
        }

        const key = `${path}\0${scope}`;
        // A shorter route can reach descendants that exceeded the depth limit before.
        const previousDepth = this.visited.get(key);

        if (previousDepth !== undefined && previousDepth <= ancestry.length) {
            return;
        }

        this.visited.set(key, ancestry.length);

        const depth = ancestry.length + 1;
        const targets: Array<{ reference: string; target: IncludeTarget }> = [];

        for (const reference of node.includes) {
            if (!this.count()) {
                break;
            }

            targets.push({ reference, target: resolveInclude(path, reference) });
        }

        await this.inspect(targets.flatMap(({ target }) => (target.kind === 'path' && depth <= INSTRUCTION_INCLUDE_DEPTH_MAX ? [target.path] : [])));

        for (const { reference, target } of targets) {
            if (this.stopped) {
                return;
            }

            if (target.kind === 'diagnostic') {
                this.diagnostics.add(reference, target.code, target.message);

                continue;
            }

            if (depth > INSTRUCTION_INCLUDE_DEPTH_MAX) {
                this.diagnostics.add(target.path, 'limit', `Includes nest deeper than ${INSTRUCTION_INCLUDE_DEPTH_MAX} levels.`);

                continue;
            }

            const status = this.statuses.get(target.path)!;

            if (status.kind === 'file') {
                await this.visit(target.path, scope, path, [...ancestry, path]);
            } else {
                this.report(target.path, status, 'missing-include');
            }
        }
    }

    async collect() {
        // the requested paths
        const accepted: string[] = [];

        for (const raw of this.requested.slice(0, INSTRUCTION_PATHS_MAX)) {
            if (typeof raw !== 'string' || raw.length === 0 || raw.includes('\0')) {
                throw new ValidationError('paths must be non-empty strings without NUL.');
            }

            if (byteLength(raw) > INSTRUCTION_PATH_MAX_BYTES) {
                this.diagnostics.add(raw, 'limit', `The path is longer than ${INSTRUCTION_PATH_MAX_BYTES} bytes.`);

                continue;
            }

            let path: string;

            try {
                path = resolveWorkspacePath(raw);
            } catch {
                this.diagnostics.add(raw, 'outside-workspace', 'The path is not inside the workspace.');

                continue;
            }

            accepted.push(path);
        }

        if (this.requested.length > INSTRUCTION_PATHS_MAX) {
            this.diagnostics.add('.', 'limit', `Only the first ${INSTRUCTION_PATHS_MAX} paths were looked at.`);
        }

        this.paths = accepted;

        const inspectable = accepted.filter((path) => path !== '.' && !isGitPath(path));

        await this.inspect(inspectable.filter(() => this.count()));

        // the directories each path reaches, in request order
        const directories: string[] = [];

        for (const path of accepted) {
            if (this.stopped) {
                break;
            }

            let chain: string[];

            if (path === '.') {
                chain = ['.'];
            } else if (isGitPath(path)) {
                this.diagnostics.add(path, 'unsupported-file', 'Paths in .git are never read.');

                continue;
            } else {
                const status = this.statuses.get(path);

                if (!status) {
                    break;
                }

                const components = path.split('/').length;

                if (status.kind === 'link') {
                    this.report(path, status);
                    chain = directoryChain(pathPrefix(path, status.at - 1));
                } else if (status.kind === 'denied') {
                    this.report(path, status);

                    if (status.at < 2) {
                        continue;
                    }

                    chain = directoryChain(pathPrefix(path, status.at - 2));
                } else {
                    chain = directoryChain(pathPrefix(path, status.kind === 'dir' ? components : components - 1));
                }
            }

            for (const dir of chain) {
                if (directories.includes(dir)) {
                    continue;
                }

                if (directories.length >= INSTRUCTION_DIRECTORIES_MAX) {
                    this.diagnostics.add('.', 'limit', `More than ${INSTRUCTION_DIRECTORIES_MAX} directories; the deeper ones were skipped.`);

                    break;
                }

                directories.push(dir);
            }
        }

        // root first, then each level, each level in code-point order
        const depthOf = (dir: string) => (dir === '.' ? 0 : dir.split('/').length);
        const order = (a: string, b: string) => {
            if (a === b) {
                return 0;
            }

            return a < b ? -1 : 1;
        };

        directories.sort((a, b) => depthOf(a) - depthOf(b) || order(a, b));

        const candidates: Array<{ dir: string; path: string }> = [];

        for (const dir of directories) {
            for (const name of INSTRUCTION_FILES) {
                if (!this.count()) {
                    break;
                }

                candidates.push({ dir, path: dir === '.' ? name : `${dir}/${name}` });
            }
        }

        await this.inspect(candidates.map(({ path }) => path));

        for (const { dir, path } of candidates) {
            if (this.stopped) {
                break;
            }

            const status = this.statuses.get(path)!;

            if (status.kind === 'file') {
                await this.visit(path, dir, undefined, []);
            } else {
                this.report(path, status);
            }
        }
    }
}
