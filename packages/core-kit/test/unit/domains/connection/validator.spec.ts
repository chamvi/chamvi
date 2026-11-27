/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { isValidupError } from 'validup';
import { ConnectionValidator, ValidatorGroup } from '@chamvi/core-kit';
import {
    NUL,
    chars,
    omit,
    verify,
} from '../../../utils/validator.ts';
import type { Row } from '../../../utils/validator.ts';

describe('ConnectionValidator (ValidatorGroup.CREATE, the create body)', () => {
    const SECRET = 'hunter2-plaintext-secret';

    function account(patch: Record<string, unknown> = {}) {
        return {
            account: 'work',
            settings: { host: 'h.test' },
            secrets: { password: SECRET },
            ...patch,
        };
    }

    /* eslint-disable @stylistic/object-curly-newline -- one issue per line keeps the pinned issues readable */
    const rows: Row[] = [
        { title: 'accepts an account', input: account(), output: account() },
        { title: 'accepts an account without secrets and drops a revision', input: { account: 'work', settings: { host: ' h.test ' }, revision: 1 }, output: { account: 'work', settings: { host: ' h.test ' } } },
        { title: 'an empty body', input: {}, issues: [{ type: 'item', path: ['account'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid' }, { type: 'item', path: ['settings'], message: 'must be an object', code: 'value_invalid' }] },
        { title: 'account: missing', input: omit(account(), 'account'), issues: [{ type: 'item', path: ['account'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid' }] },
        { title: 'account: a number', input: account({ account: 1 }), issues: [{ type: 'item', path: ['account'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid' }] },
        { title: 'account: empty', input: account({ account: '' }), issues: [{ type: 'item', path: ['account'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid' }] },
        { title: 'account: 65 characters', input: account({ account: chars(65) }), issues: [{ type: 'item', path: ['account'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid' }] },
        { title: 'account: a NUL', input: account({ account: NUL }), issues: [{ type: 'item', path: ['account'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid' }] },
        { title: 'settings: missing', input: omit(account(), 'settings'), issues: [{ type: 'item', path: ['settings'], message: 'must be an object', code: 'value_invalid' }] },
        { title: 'settings: a string', input: account({ settings: 'x' }), issues: [{ type: 'item', path: ['settings'], message: 'must be an object', code: 'value_invalid' }] },
        { title: 'settings: an array', input: account({ settings: [] }), issues: [{ type: 'item', path: ['settings'], message: 'must be an object', code: 'value_invalid' }] },
        { title: 'settings: null', input: account({ settings: null }), issues: [{ type: 'item', path: ['settings'], message: 'must be an object', code: 'value_invalid' }] },
        { title: 'secrets: a string', input: account({ secrets: SECRET }), issues: [{ type: 'item', path: ['secrets'], message: 'must be an object', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'secrets: an array', input: account({ secrets: [SECRET] }), issues: [{ type: 'item', path: ['secrets'], message: 'must be an object', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'secrets: null', input: account({ secrets: null }), issues: [{ type: 'item', path: ['secrets'], message: 'must be an object', code: 'value_invalid', meta: { optional: true } }] },
    ];
    /* eslint-enable @stylistic/object-curly-newline */

    it.each(rows)('$title', async (row) => {
        await verify(new ConnectionValidator(), row, ValidatorGroup.CREATE);
    });
});

describe('ConnectionValidator (ValidatorGroup.UPDATE, the save body)', () => {
    const SECRET = 'hunter2-plaintext-secret';

    function save(patch: Record<string, unknown> = {}) {
        return {
            revision: 1,
            settings: { host: 'h.test' },
            ...patch,
        };
    }

    /* eslint-disable @stylistic/object-curly-newline -- one issue per line keeps the pinned issues readable */
    const rows: Row[] = [
        { title: 'accepts a save of the settings', input: { revision: 1, generation: '0198a7c0-0000-7000-8000-000000000000', settings: { host: 'h2.test' } }, output: { revision: 1, generation: '0198a7c0-0000-7000-8000-000000000000', settings: { host: 'h2.test' } } },
        { title: 'accepts a save of secrets and drops an account', input: { revision: 1, account: 'work', secrets: { set: { password: SECRET }, clear: [], other: 1 } }, output: { secrets: { set: { password: SECRET }, clear: [] }, revision: 1 } },
        { title: 'an empty body', input: {}, issues: [{ type: 'item', path: ['revision'], message: 'must be a non-negative integer', code: 'value_invalid' }] },
        { title: 'revision: missing', input: omit(save(), 'revision'), issues: [{ type: 'item', path: ['revision'], message: 'must be a non-negative integer', code: 'value_invalid' }] },
        { title: 'revision: -1', input: save({ revision: -1 }), issues: [{ type: 'item', path: ['revision'], message: 'must be a non-negative integer', code: 'value_invalid' }] },
        { title: 'revision: 1.5', input: save({ revision: 1.5 }), issues: [{ type: 'item', path: ['revision'], message: 'must be a non-negative integer', code: 'value_invalid' }] },
        { title: 'revision: a string', input: save({ revision: '1' }), issues: [{ type: 'item', path: ['revision'], message: 'must be a non-negative integer', code: 'value_invalid' }] },
        { title: 'revision: null', input: save({ revision: null }), issues: [{ type: 'item', path: ['revision'], message: 'must be a non-negative integer', code: 'value_invalid' }] },
        { title: 'generation: a number', input: save({ generation: 1 }), issues: [{ type: 'item', path: ['generation'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'generation: empty', input: save({ generation: '' }), issues: [{ type: 'item', path: ['generation'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'generation: 65 characters', input: save({ generation: chars(65) }), issues: [{ type: 'item', path: ['generation'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'settings: a string', input: save({ settings: 'x' }), issues: [{ type: 'item', path: ['settings'], message: 'must be an object', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'settings: an array', input: save({ settings: [] }), issues: [{ type: 'item', path: ['settings'], message: 'must be an object', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'secrets: a string', input: save({ secrets: SECRET }), issues: [{ type: 'item', path: ['secrets'], message: 'must be an object', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'secrets: an array', input: save({ secrets: [SECRET] }), issues: [{ type: 'item', path: ['secrets'], message: 'must be an object', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'secrets.set: a string', input: save({ secrets: { set: SECRET } }), issues: [{ type: 'item', path: ['secrets'], message: 'set must be an object', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'secrets.set: an array', input: save({ secrets: { set: [SECRET] } }), issues: [{ type: 'item', path: ['secrets'], message: 'set must be an object', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'secrets.clear: a string', input: save({ secrets: { clear: 'password' } }), issues: [{ type: 'item', path: ['secrets'], message: 'clear must be an array of field names', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'secrets.clear: a list with a number', input: save({ secrets: { clear: ['password', 1] } }), issues: [{ type: 'item', path: ['secrets'], message: 'clear must be an array of field names', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'reports every field at once', input: { revision: 'x', generation: 1, settings: 2, secrets: 3 }, issues: [{ type: 'item', path: ['settings'], message: 'must be an object', code: 'value_invalid', meta: { optional: true } }, { type: 'item', path: ['secrets'], message: 'must be an object', code: 'value_invalid', meta: { optional: true } }, { type: 'item', path: ['revision'], message: 'must be a non-negative integer', code: 'value_invalid' }, { type: 'item', path: ['generation'], message: 'must be a string of 1 to 64 characters', code: 'value_invalid', meta: { optional: true } }] },
    ];
    /* eslint-enable @stylistic/object-curly-newline */

    it.each(rows)('$title', async (row) => {
        await verify(new ConnectionValidator(), row, ValidatorGroup.UPDATE);
    });
});

describe('ConnectionValidator (without a group)', () => {
    const body = {
        account: 'work',
        settings: { host: 'h.test' },
        revision: 1,
    };
    const issues = [{
        type: 'item',
        path: [],
        message: 'must run with the create or the update group',
        code: 'value_invalid',
    }];

    it.each([
        { title: 'no group', options: {} },
        { title: 'an unknown group', options: { group: 'delete' } },
        { title: 'no group, in parallel', options: { parallel: true } },
    ])('rejects a run with $title', async ({ options }) => {
        const error = await new ConnectionValidator().run(body, options).then(() => undefined, (error_: unknown) => error_);

        expect(isValidupError(error)).toBe(true);
        expect(JSON.parse(JSON.stringify((error as { issues: unknown[] }).issues))).toEqual(issues);
    });

    it('rejects a sync run without a group', () => {
        let error: unknown;

        try {
            new ConnectionValidator().runSync(body);
        } catch (error_) {
            error = error_;
        }

        expect(isValidupError(error)).toBe(true);
        expect(JSON.parse(JSON.stringify((error as { issues: unknown[] }).issues))).toEqual(issues);
    });

    it('rejects a safe run without a group', async () => {
        const result = await new ConnectionValidator().safeRun(body);

        expect(result.success).toBe(false);
    });
});
