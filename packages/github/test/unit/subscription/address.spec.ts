/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GithubEvent, GithubPayload } from '@chamvi/github';
import { defaultConcurrencyKey, eventAddress } from '../../../src/subscription/helpers.ts';

function fixture(name: string): GithubPayload {
    return JSON.parse(readFileSync(new URL(`../../fixtures/deliveries/${name}.json`, import.meta.url), 'utf8')) as GithubPayload;
}

const SUITE = fixture('check-suite-completed');
const RUN = fixture('check-run-completed');

type Check = { pull_requests: Array<Record<string, any>> };

/** The check_suite delivery with its pull_requests list changed by `edit`. */
function suite(edit: (pulls: Check['pull_requests']) => unknown[] | undefined): GithubEvent {
    const payload = structuredClone(SUITE);
    const check = payload.check_suite as Check;
    const pulls = edit(check.pull_requests);

    if (pulls === undefined) {
        delete (check as Partial<Check>).pull_requests;
    } else {
        check.pull_requests = pulls as Check['pull_requests'];
    }

    return {
        name: 'check_suite',
        action: 'completed',
        delivery: 'd-1',
        installationId: 42,
        payload,
    };
}

function checkRun(payload: GithubPayload = RUN): GithubEvent {
    return {
        name: 'check_run',
        action: 'completed',
        delivery: 'd-1',
        installationId: 42,
        payload,
    };
}

describe('the address of a check event', () => {
    it('is the one pull request of the repository a check suite lists', () => {
        const event = suite((pulls) => pulls);

        expect(eventAddress(event)).toBe('octo/demo#12');
        expect(defaultConcurrencyKey(event)).toBe('octo/demo#12');
    });

    it('is the one pull request of the repository a check run lists', () => {
        const event = checkRun();

        expect(eventAddress(event)).toBe('octo/demo#12');
        expect(defaultConcurrencyKey(event)).toBe('octo/demo#12');
    });

    it('is none for no pull request', () => {
        for (const event of [suite(() => []), suite(() => undefined)]) {
            expect(eventAddress(event)).toBeUndefined();
            expect(defaultConcurrencyKey(event)).toBe('octo/demo');
        }
    });

    it('is none for several pull requests, also when only one is of the repository', () => {
        const several = suite((pulls) => [pulls[0], { ...pulls[0], number: 13 }]);
        const foreign = structuredClone(SUITE.check_suite as Check).pull_requests[0]!;

        foreign.number = 3;
        foreign.base.repo = {
            id: 9999, 
            url: 'https://api.github.com/repos/mallory/demo', 
            name: 'demo', 
        };

        expect(eventAddress(several)).toBeUndefined();
        expect(defaultConcurrencyKey(several)).toBe('octo/demo');
        expect(eventAddress(suite((pulls) => [pulls[0], foreign]))).toBeUndefined();
    });

    it('is none for a pull request of another repository', () => {
        const event = suite(([pull]) => [{
            ...pull,
            base: {
                ...pull!.base,
                repo: {
                    id: 9999, 
                    url: 'https://api.github.com/repos/mallory/demo', 
                    name: 'demo', 
                }, 
            },
        }]);

        expect(eventAddress(event)).toBeUndefined();
        expect(defaultConcurrencyKey(event)).toBe('octo/demo');
    });

    it('is none for an entry or a repository it cannot read', () => {
        const unreadable = [
            suite(() => [null]),
            suite(() => ['octo/demo#12']),
            suite(([pull]) => [{ ...pull, base: undefined }]),
            suite(([pull]) => [{ ...pull, base: { ...pull!.base, repo: { ...pull!.base.repo, id: '3001' } } }]),
            suite(([pull]) => [{ ...pull, number: '12' }]),
            suite(([pull]) => [{ ...pull, number: 0 }]),
        ];

        for (const event of unreadable) {
            expect(eventAddress(event)).toBeUndefined();
        }

        const noRepoId = structuredClone(SUITE);

        delete (noRepoId.repository as { id?: number }).id;
        expect(eventAddress({ ...suite((pulls) => pulls), payload: noRepoId })).toBeUndefined();
    });

    it('reads only the check the event name names', () => {
        // a check_run body replayed as check_suite (the name is not signed) has no check_suite list
        expect(eventAddress({ ...checkRun(), name: 'check_suite' })).toBeUndefined();

        // a check run's own list counts, not the one of its suite
        const payload = structuredClone(RUN);

        (payload.check_run as Check).pull_requests = [];
        expect(eventAddress(checkRun(payload))).toBeUndefined();
    });
});
