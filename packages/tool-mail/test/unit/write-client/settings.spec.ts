/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { normalizeSmtp } from '../../../src/write-client/asserts.ts';

const SECRET = 'smtp.secret-host-never-echoed';

function errorOf(value: unknown): InvalidAgentDefinitionError {
    let caught: unknown;

    try {
        normalizeSmtp(value, 'accounts[0].smtp');
    } catch (error) {
        caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidAgentDefinitionError);
    expect((caught as Error).message).not.toContain(SECRET);

    return caught as InvalidAgentDefinitionError;
}

describe('normalizeSmtp()', () => {
    it('defaults to tls on port 465', () => {
        expect(normalizeSmtp({ host: 'smtp.x.test' }, 'smtp')).toEqual({
            host: 'smtp.x.test',
            port: 465,
            security: 'tls',
        });
    });

    it.each([
        ['tls', 465],
        ['starttls', 587],
        ['plain', 25],
    ] as const)('defaults the port of %s to %i', (security, port) => {
        expect(normalizeSmtp({ host: 'smtp.x.test', security }, 'smtp')).toEqual({
            host: 'smtp.x.test',
            port,
            security,
        });
    });

    it('keeps an explicit port', () => {
        expect(normalizeSmtp({
            host: 'smtp.x.test',
            port: 2525,
            security: 'starttls',
        }, 'smtp')).toEqual({
            host: 'smtp.x.test',
            port: 2525,
            security: 'starttls',
        });
    });

    it.each([
        ['not an object', SECRET, 'accounts[0].smtp must be an object.'],
        ['an array', [SECRET], 'accounts[0].smtp must be an object.'],
        ['no host', { port: 25 }, 'accounts[0].smtp.host must be a non-empty string.'],
        ['an empty host', { host: '' }, 'accounts[0].smtp.host must be a non-empty string.'],
        ['a bad port', { host: SECRET, port: SECRET }, 'accounts[0].smtp.port must be an integer from 1 to 65535.'],
        ['a port out of range', { host: SECRET, port: 70_000 }, 'accounts[0].smtp.port must be an integer from 1 to 65535.'],
        ['a bad security', { host: SECRET, security: SECRET }, 'accounts[0].smtp.security must be one of tls, starttls, plain.'],
    ])('refuses %s, naming the field and never the value', (_name, value, message) => {
        expect(errorOf(value).message).toBe(message);
    });
});
