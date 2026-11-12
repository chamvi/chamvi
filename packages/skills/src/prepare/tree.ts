/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { invalid, unavailable } from './helpers.ts';

const run = promisify(execFile);

/** The deadline of a metadata command on the fetched repository. */
const METADATA_TIMEOUT_MS = 30_000;

/** The deadline of the blob-less fetch of the pinned commit (a slow host, a large tree). */
const FETCH_TIMEOUT_MS = 300_000;

const SYMLINK_MODE = '120000';
const GITLINK_MODE = '160000';

type GitOptions = {
    timeout: number;
    signal?: AbortSignal;
};

async function git(args: string[], options: GitOptions) {
    const pending = run('git', ['-c', 'protocol.ext.allow=never', ...args], {
        timeout: options.timeout,
        signal: options.signal,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    // Abort rejects before close; cleanup must wait for the actual process and streams.
    const closed = new Promise<void>((done) => {
        pending.child.once('close', () => done());
    });

    try {
        return (await pending).stdout;
    } finally {
        await closed;
    }
}

/** A command on the fetched commit: a failing or flooding one is the source's, a timeout or an external signal is retryable. */
async function metadata(args: string[], signal?: AbortSignal): Promise<string> {
    try {
        return await git(args, { timeout: METADATA_TIMEOUT_MS, signal });
    } catch (error) {
        if (signal?.aborted) {
            throw error;
        }

        const { code, signal: terminatedBy } = error as { code?: unknown; signal?: unknown };

        if (typeof code === 'number' || code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
            invalid();
        }

        if (typeof terminatedBy === 'string') {
            unavailable();
        }

        throw error;
    }
}

/** Whether a gitlink at `link` equals, lies inside or contains the skill folder `skill` (`.` is the root). */
function overlaps(link: string, skill: string): boolean {
    if (skill === '.') {
        return true;
    }

    return link === skill || link.startsWith(`${skill}/`) || skill.startsWith(`${link}/`);
}

/**
 * Fetches the pinned commit without blobs into the empty `directory` with plain git (the host's git
 * credentials, none of the SDK's `gh`/SSH fallbacks) and inspects its complete tree before anything is
 * copied: a tracked symlink anywhere refuses the source, and so does a gitlink (submodule) at, inside
 * or around a selected skill folder (`paths`, relative to the repository root). The fetch failing is
 * retryable; git's messages are never forwarded.
 */
export async function verifyPinnedTree(input: {
    directory: string;
    url: string;
    revision: string;
    paths: readonly string[];
    signal?: AbortSignal;
}): Promise<void> {
    const {
        directory,
        url,
        revision,
        paths,
        signal,
    } = input;

    try {
        await git(['init', '--bare', '-q', directory], { timeout: METADATA_TIMEOUT_MS, signal });
        await git([
            '-C',
            directory,
            'fetch',
            '-q',
            '--depth',
            '1',
            '--filter=blob:none',
            '--no-tags',
            '--no-recurse-submodules',
            '--end-of-options',
            url,
            revision,
        ], { timeout: FETCH_TIMEOUT_MS, signal });
    } catch (error) {
        if (signal?.aborted) {
            throw error;
        }

        unavailable();
    }

    const head = await metadata(['-C', directory, 'rev-parse', '--verify', 'FETCH_HEAD^{commit}'], signal);

    if (head.trim().toLowerCase() !== revision) {
        invalid();
    }

    const tree = await metadata(['-C', directory, 'ls-tree', '-r', '-z', 'FETCH_HEAD'], signal);

    for (const entry of tree.split('\0')) {
        if (!entry) {
            continue;
        }

        const tab = entry.indexOf('\t');
        const mode = entry.slice(0, entry.indexOf(' '));
        const path = entry.slice(tab + 1);

        if (mode === SYMLINK_MODE) {
            invalid();
        }

        const isAroundSelected = mode === GITLINK_MODE && paths.some((skill) => overlaps(path, skill));

        if (isAroundSelected) {
            invalid();
        }
    }
}
