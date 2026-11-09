/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import {
    ConnectionChangedError,
    ConnectionNotConfiguredError,
    ErrorCode,
    InvalidAgentDefinitionError,
    resolveConnection,
    storedConnectionName,
} from '@chamvi/core';
import type { ConnectionTypeDefinition, ResolveConnectionInput } from '@chamvi/core';

const definition: ConnectionTypeDefinition = {
    type: 'mail',
    label: 'Mail',
    multiple: true,
    fields: [
        {
            key: 'host',
            label: 'Host',
            kind: 'string',
            env: () => 'MAIL_HOST',
        },
        {
            key: 'password',
            label: 'Password',
            kind: 'secret',
            required: true,
            env: (connection) => `MAIL_${connection.toUpperCase()}_PASSWORD`,
        },
    ],
};

const resolve = (
    variables: Record<string, string>,
    input: Partial<ResolveConnectionInput> = {},
) => resolveConnection({
    definition,
    name: 'work',
    readVariable: (variable) => variables[variable],
    ...input,
});

describe('resolveConnection', () => {
    it('keeps a field keyed __proto__ an own value', () => {
        const resolved = resolve({}, {
            definition: {
                ...definition,
                fields: [{
                    key: '__proto__',
                    label: 'Proto',
                    kind: 'string',
                    required: true,
                }],
            },
            preset: Object.fromEntries([['__proto__', { value: 'preset', source: { kind: 'code' } }]]),
        });

        expect(resolved.state).toBe('configured');
        expect(Object.hasOwn(resolved.values, '__proto__')).toBe(true);
        expect(Object.getOwnPropertyDescriptor(resolved.values, '__proto__')?.value).toBe('preset');
        expect(Object.getPrototypeOf(resolved.values)).toBe(Object.prototype);
        expect(Object.hasOwn(resolved.sources, '__proto__')).toBe(true);
        expect(Object.getPrototypeOf(resolved.sources)).toBe(Object.prototype);
    });

    it('prefers preset over env over store', () => {
        const fields = ['a', 'b', 'c', 'd'].map((key) => ({
            key,
            label: key,
            kind: 'string' as const,
            env: () => `VAR_${key.toUpperCase()}`,
        }));

        const resolved = resolve(
            { VAR_A: 'env-a', VAR_B: 'env-b' },
            {
                definition: { ...definition, fields },
                preset: { a: { value: 'preset-a', source: { kind: 'code' } } },
                stored: {
                    a: 'stored-a', 
                    b: 'stored-b', 
                    c: 'stored-c', 
                },
            },
        );

        expect(resolved).toEqual({
            name: 'work',
            values: {
                a: 'preset-a', 
                b: 'env-b', 
                c: 'stored-c', 
            },
            sources: {
                a: { kind: 'code' },
                b: { kind: 'env', variable: 'VAR_B' },
                c: { kind: 'store' },
                d: { kind: 'unset' },
            },
            missing: [],
            state: 'configured',
        });
    });

    it('resolves the variable of the given connection', () => {
        const resolved = resolve({ MAIL_WORK_PASSWORD: 'x' });

        expect(resolved.sources.password).toEqual({ kind: 'env', variable: 'MAIL_WORK_PASSWORD' });
    });

    it('reads a field without an env source from the store only', () => {
        const resolved = resolve({}, {
            definition: {
                ...definition,
                fields: [{
                    key: 'port', 
                    label: 'Port', 
                    kind: 'number', 
                }],
            },
            stored: { port: 993 },
        });

        expect(resolved.values).toEqual({ port: 993 });
        expect(resolved.sources.port).toEqual({ kind: 'store' });
    });

    it('treats a field env returning undefined as having no variable', () => {
        const readVariable = () => {
            throw new Error('must not be read');
        };

        const resolved = resolve({}, {
            definition: {
                ...definition,
                fields: [{
                    key: 'port',
                    label: 'Port',
                    kind: 'number',
                    env: () => undefined,
                }],
            },
            readVariable,
        });

        expect(resolved.sources.port).toEqual({ kind: 'unset' });
    });

    it('reports not_configured with nothing set', () => {
        const resolved = resolve({});

        expect(resolved).toEqual({
            name: 'work',
            values: {},
            sources: { host: { kind: 'unset' }, password: { kind: 'unset' } },
            missing: ['password'],
            state: 'not_configured',
        });
    });

    it('reports incomplete when only the store holds part', () => {
        const resolved = resolve({}, { stored: { host: 'imap.example.org' } });

        expect(resolved.state).toBe('incomplete');
        expect(resolved.missing).toEqual(['password']);
        expect(resolved.values).toEqual({ host: 'imap.example.org' });
    });

    it('reports configured from an optional-only definition when one field is set', () => {
        const resolved = resolve({ MAIL_HOST: 'imap.example.org' }, { definition: { ...definition, fields: [definition.fields[0]!] } });

        expect(resolved.state).toBe('configured');
    });

    it('throws naming the variable when one env field is set and a required field is missing from env and store', () => {
        const act = () => resolve({ MAIL_HOST: 'very-secret-value' });

        expect(act).toThrow(InvalidAgentDefinitionError);
        expect(act).toThrow('MAIL_WORK_PASSWORD');
        expect(act).not.toThrow('very-secret-value');
    });

    it('names the field key when the missing required field has no variable', () => {
        const act = () => resolve({ MAIL_HOST: 'x' }, {
            definition: {
                ...definition,
                fields: [
                    definition.fields[0]!,
                    {
                        key: 'token',
                        label: 'Token',
                        kind: 'secret',
                        required: true,
                    },
                ],
            },
        });

        expect(act).toThrow(InvalidAgentDefinitionError);
        expect(act).toThrow('token');
    });

    it('counts a preset from an env source as env-touched', () => {
        const act = () => resolve({}, { preset: { host: { value: 'x', source: { kind: 'env', variable: 'MAIL_JSON' } } } });

        expect(act).toThrow(InvalidAgentDefinitionError);
        expect(act).toThrow('MAIL_WORK_PASSWORD');
    });

    it('does not count a preset from code as env-touched', () => {
        const resolved = resolve({}, { preset: { host: { value: 'x', source: { kind: 'code' } } } });

        expect(resolved.state).toBe('incomplete');
        expect(resolved.missing).toEqual(['password']);
    });

    it('a store value satisfies a required field when another field comes from env', () => {
        const resolved = resolve({ MAIL_HOST: 'x' }, { stored: { password: 'y' } });

        expect(resolved.state).toBe('configured');
        expect(resolved.missing).toEqual([]);
        expect(resolved.sources.password).toEqual({ kind: 'store' });
    });

    it('treats an empty variable as unset', () => {
        const empty = resolve({ MAIL_HOST: '', MAIL_WORK_PASSWORD: '' });

        expect(empty.state).toBe('not_configured');
        expect(empty.sources.host).toEqual({ kind: 'unset' });

        const fallback = resolve({ MAIL_HOST: '' }, { stored: { host: 'stored', password: 'y' } });

        expect(fallback.values.host).toBe('stored');
        expect(fallback.sources.host).toEqual({ kind: 'store' });
    });

    it('keeps falsy stored values set', () => {
        const resolved = resolve({}, {
            definition: {
                ...definition,
                fields: [
                    {
                        key: 'tls',
                        label: 'TLS',
                        kind: 'boolean',
                        required: true,
                    },
                    {
                        key: 'port',
                        label: 'Port',
                        kind: 'number',
                        required: true,
                    },
                ],
            },
            stored: { tls: false, port: 0 },
        });

        expect(resolved.state).toBe('configured');
        expect(resolved.values).toEqual({ tls: false, port: 0 });
    });

    it('does not take a field value from the prototype chain', () => {
        const resolved = resolve({}, {
            definition: {
                ...definition,
                fields: [{
                    key: 'toString',
                    label: 'x',
                    kind: 'string',
                }],
            },
            preset: {},
            stored: {},
        });

        expect(resolved.sources.toString).toEqual({ kind: 'unset' });
        expect(resolved.state).toBe('not_configured');
    });
});

describe('storedConnectionName', () => {
    it('prefixes the account with the type', () => {
        expect(storedConnectionName('mail', 'work')).toBe('mail-work');
    });
});

describe('connection errors', () => {
    it('carries the connection and its code', () => {
        expect(new ConnectionNotConfiguredError('mail-work')).toMatchObject({
            code: ErrorCode.CONNECTION_NOT_CONFIGURED,
            connection: 'mail-work',
        });
        expect(ErrorCode.CONNECTION_NOT_CONFIGURED).toBe('connection_not_configured');
        expect(new ConnectionChangedError('mail-work')).toMatchObject({
            code: ErrorCode.CONNECTION_CHANGED,
            connection: 'mail-work',
        });
        expect(ErrorCode.CONNECTION_CHANGED).toBe('connection_changed');
    });
});
