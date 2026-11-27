/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isValidupError } from 'validup';
import { describe, expect, it } from 'vitest';
import { buildConnectionContainer } from '../../../src/connections/validators.ts';
import type { ConnectionFormField, ConnectionFormValues } from '../../../src/connections/types.ts';

/*
 * The client-side checks of a connection form: the issues (path, code, message) a
 * draft gets, so a replacement of the validators keeps what the form shows.
 */

const FIELDS: ConnectionFormField[] = [
    {
        key: 'host',
        label: 'Host',
        kind: 'string',
        required: true,
        secretSet: false,
    },
    {
        key: 'note',
        label: 'Note',
        kind: 'string',
        secretSet: false,
    },
    {
        key: 'port',
        label: 'Port',
        kind: 'number',
        secretSet: false,
    },
    {
        key: 'mode',
        label: 'Mode',
        kind: 'select',
        options: ['plain', 'tls'],
        required: true,
        secretSet: false,
    },
    {
        key: 'verify',
        label: 'Verify',
        kind: 'boolean',
        secretSet: false,
    },
    {
        key: 'password',
        label: 'Password',
        kind: 'secret',
        required: true,
        secretSet: false,
    },
    {
        key: 'token',
        label: 'Token',
        kind: 'secret',
        required: true,
        secretSet: true,
    },
    {
        key: 'region',
        label: 'Region',
        kind: 'string',
        required: true,
        secretSet: false,
        lock: { kind: 'env', variable: 'REGION' },
    },
];

const VALID: ConnectionFormValues = {
    host: 'imap.example',
    password: 'secret',
    mode: 'tls',
};

type Row = {
    title: string;
    values: Record<string, unknown>;
    adding?: boolean;
    /** The cleaned values of a valid form, or the issues of an invalid one. */
    expected: { valid: unknown } | { issues: unknown[] };
};

async function outcomeOf(values: Record<string, unknown>, adding = false): Promise<Row['expected']> {
    try {
        return { valid: await buildConnectionContainer(FIELDS, adding).run(values as ConnectionFormValues) };
    } catch (error) {
        if (isValidupError(error)) {
            return { issues: error.issues };
        }

        throw error;
    }
}

/* eslint-disable @stylistic/object-curly-newline -- one issue per line keeps the pinned wire readable */
const ROWS: Row[] = [
    {
        title: 'accepts every field set',
        values: { ...VALID, note: 'n', port: '25', verify: 'false', token: 't' },
        expected: { valid: { host: 'imap.example', note: 'n', port: '25', mode: 'tls', verify: 'false', password: 'secret', token: 't' } },
    },
    {
        title: 'accepts the required fields only',
        values: VALID,
        expected: { valid: { host: 'imap.example', mode: 'tls', password: 'secret' } },
    },
    {
        title: 'accepts empty optional fields and an empty secret that has a stored value',
        values: { ...VALID, note: '', port: '', verify: '', token: '' },
        expected: { valid: { host: 'imap.example', note: '', port: '', mode: 'tls', verify: '', password: 'secret', token: '' } },
    },
    {
        title: 'accepts a number draft with padding, a sign and a fraction',
        values: { ...VALID, port: ' -1.5 ' },
        expected: { valid: { host: 'imap.example', port: ' -1.5 ', mode: 'tls', password: 'secret' } },
    },
    {
        title: 'accepts a number draft with a leading dot',
        values: { ...VALID, port: '.5' },
        expected: { valid: { host: 'imap.example', port: '.5', mode: 'tls', password: 'secret' } },
    },
    {
        title: 'accepts a number draft with a trailing dot',
        values: { ...VALID, port: '5.' },
        expected: { valid: { host: 'imap.example', port: '5.', mode: 'tls', password: 'secret' } },
    },
    {
        title: 'accepts a select option with padding',
        values: { ...VALID, mode: ' plain ' },
        expected: { valid: { host: 'imap.example', mode: ' plain ', password: 'secret' } },
    },
    {
        title: 'accepts a boolean draft with padding',
        values: { ...VALID, verify: ' true ' },
        expected: { valid: { host: 'imap.example', mode: 'tls', verify: ' true ', password: 'secret' } },
    },
    {
        title: 'accepts a NUL in a string draft (the server refuses it)',
        values: { ...VALID, host: 'a\0b' },
        expected: { valid: { host: 'a\0b', mode: 'tls', password: 'secret' } },
    },
    {
        title: 'ignores a locked field',
        values: { ...VALID, region: '' },
        expected: { valid: { host: 'imap.example', mode: 'tls', password: 'secret' } },
    },
    {
        title: 'ignores a key that is no field',
        values: { ...VALID, other: 'x' },
        expected: { valid: { host: 'imap.example', mode: 'tls', password: 'secret' } },
    },
    {
        title: 'every required field missing',
        values: {},
        expected: {
            issues: [
                { type: 'item', path: ['host'], message: 'is required', code: 'required' },
                { type: 'item', path: ['mode'], message: 'is required', code: 'required' },
                { type: 'item', path: ['password'], message: 'is required', code: 'required' },
            ],
        },
    },
    {
        title: 'host: empty',
        values: { ...VALID, host: '' },
        expected: { issues: [{ type: 'item', path: ['host'], message: 'is required', code: 'required' }] },
    },
    {
        title: 'host: blank',
        values: { ...VALID, host: ' '.repeat(3) },
        expected: { issues: [{ type: 'item', path: ['host'], message: 'is required', code: 'required' }] },
    },
    {
        title: 'host: a number',
        values: { ...VALID, host: 5 },
        expected: { issues: [{ type: 'item', path: ['host'], message: 'is required', code: 'required' }] },
    },
    {
        title: 'host: null',
        values: { ...VALID, host: null },
        expected: { issues: [{ type: 'item', path: ['host'], message: 'is required', code: 'required' }] },
    },
    {
        title: 'password: missing',
        values: { host: 'h', mode: 'tls' },
        expected: { issues: [{ type: 'item', path: ['password'], message: 'is required', code: 'required' }] },
    },
    {
        title: 'password: blank',
        values: { ...VALID, password: ' ' },
        expected: { issues: [{ type: 'item', path: ['password'], message: 'is required', code: 'required' }] },
    },
    {
        title: 'mode: missing',
        values: { host: 'h', password: 'p' },
        expected: { issues: [{ type: 'item', path: ['mode'], message: 'is required', code: 'required' }] },
    },
    {
        title: 'mode: not an option',
        values: { ...VALID, mode: 'ssl' },
        expected: { issues: [{ type: 'item', path: ['mode'], message: 'must be one of the options', code: 'value_invalid' }] },
    },
    {
        title: 'mode: another case',
        values: { ...VALID, mode: 'TLS' },
        expected: { issues: [{ type: 'item', path: ['mode'], message: 'must be one of the options', code: 'value_invalid' }] },
    },
    {
        title: 'port: text',
        values: { ...VALID, port: 'abc' },
        expected: { issues: [{ type: 'item', path: ['port'], message: 'must be a number', code: 'numeric' }] },
    },
    {
        title: 'port: an exponent',
        values: { ...VALID, port: '1e3' },
        expected: { issues: [{ type: 'item', path: ['port'], message: 'must be a number', code: 'numeric' }] },
    },
    {
        title: 'port: hex',
        values: { ...VALID, port: '0x10' },
        expected: { issues: [{ type: 'item', path: ['port'], message: 'must be a number', code: 'numeric' }] },
    },
    {
        title: 'port: Infinity',
        values: { ...VALID, port: 'Infinity' },
        expected: { issues: [{ type: 'item', path: ['port'], message: 'must be a number', code: 'numeric' }] },
    },
    {
        title: 'port: a lone dot',
        values: { ...VALID, port: '.' },
        expected: { issues: [{ type: 'item', path: ['port'], message: 'must be a number', code: 'numeric' }] },
    },
    {
        title: 'port: digits with a space inside',
        values: { ...VALID, port: '1 2' },
        expected: { issues: [{ type: 'item', path: ['port'], message: 'must be a number', code: 'numeric' }] },
    },
    {
        title: 'verify: not a boolean',
        values: { ...VALID, verify: 'maybe' },
        expected: { issues: [{ type: 'item', path: ['verify'], message: 'must be yes or no', code: 'value_invalid' }] },
    },
    {
        title: 'verify: yes',
        values: { ...VALID, verify: 'yes' },
        expected: { issues: [{ type: 'item', path: ['verify'], message: 'must be yes or no', code: 'value_invalid' }] },
    },
    {
        title: 'verify: another case',
        values: { ...VALID, verify: 'True' },
        expected: { issues: [{ type: 'item', path: ['verify'], message: 'must be yes or no', code: 'value_invalid' }] },
    },
    {
        title: 'reports every field at once',
        values: { host: ' ', port: 'x', mode: 'y', verify: 'z' },
        expected: {
            issues: [
                { type: 'item', path: ['host'], message: 'is required', code: 'required' },
                { type: 'item', path: ['port'], message: 'must be a number', code: 'numeric' },
                { type: 'item', path: ['mode'], message: 'must be one of the options', code: 'value_invalid' },
                { type: 'item', path: ['verify'], message: 'must be yes or no', code: 'value_invalid' },
                { type: 'item', path: ['password'], message: 'is required', code: 'required' },
            ],
        },
    },
    {
        title: 'adding: accepts an account',
        values: { ...VALID, account: 'work' },
        adding: true,
        expected: { valid: { account: 'work', host: 'imap.example', mode: 'tls', password: 'secret' } },
    },
    {
        title: 'adding: account missing',
        values: VALID,
        adding: true,
        expected: { issues: [{ type: 'item', path: ['account'], message: 'is required', code: 'required' }] },
    },
    {
        title: 'adding: account empty',
        values: { ...VALID, account: '' },
        adding: true,
        expected: { issues: [{ type: 'item', path: ['account'], message: 'is required', code: 'required' }] },
    },
    {
        title: 'adding: account blank',
        values: { ...VALID, account: '  ' },
        adding: true,
        expected: { issues: [{ type: 'item', path: ['account'], message: 'is required', code: 'required' }] },
    },
    {
        title: 'adding: account a number',
        values: { ...VALID, account: 5 },
        adding: true,
        expected: { issues: [{ type: 'item', path: ['account'], message: 'is required', code: 'required' }] },
    },
    {
        title: 'adding: account with a NUL (the server refuses it)',
        values: { ...VALID, account: 'a\0b' },
        adding: true,
        expected: { valid: { account: 'a\0b', host: 'imap.example', mode: 'tls', password: 'secret' } },
    },
    {
        title: 'adding: account is not read while editing',
        values: { ...VALID, account: '' },
        adding: false,
        expected: { valid: { host: 'imap.example', mode: 'tls', password: 'secret' } },
    },
];
/* eslint-enable @stylistic/object-curly-newline */

describe('connection form validation', () => {
    it.each(ROWS)('$title', async ({
        values,
        adding,
        expected,
    }) => {
        const outcome = await outcomeOf(values, adding);

        expect(outcome).toEqual(expected);
    });
});
