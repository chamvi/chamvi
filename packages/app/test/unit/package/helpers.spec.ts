/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError, defineAgent } from '@chamvi/core';
import { textModel } from '@chamvi/test-kit';
import {
    assertPackageSpecifier,
    isDevMarkerOf,
    mergePackageSpecifiers,
    packageNameOf,
    splitAgentEntries,
} from '../../../src/package/helpers.ts';

describe('package specifiers', () => {
    it.each(['pkg', 'my-agent', '@s/pkg', '@s/pkg/sub/path', 'pkg/agents', '@scope.x/a_b~c'])('accepts %s', (spec) => {
        expect(assertPackageSpecifier(spec, 'agents[0]')).toBe(spec);
    });

    it.each([
        './x',
        '../x',
        '/abs',
        'C:\\x',
        'file:///x',
        'https://x',
        'node:fs',
        'fs',
        '@s',
        '@s/',
        'Pkg',
        'pkg/../x',
        'pkg/./x',
        'pkg//x',
        'pkg/',
        '',
        'x'.repeat(215),
    ])('refuses %s, naming the field and never the value', (spec) => {
        expect(() => assertPackageSpecifier(spec, 'CHAMVI_AGENTS entry 2')).toThrow(InvalidAgentDefinitionError);

        try {
            assertPackageSpecifier(spec, 'CHAMVI_AGENTS entry 2');
        } catch (error) {
            expect((error as Error).message).toBe(
                'CHAMVI_AGENTS entry 2 is no bare package specifier (a package name such as @acme/agents, no path or URL).',
            );
        }
    });

    it('refuses what is no string', () => {
        expect(() => assertPackageSpecifier(1, 'agents[0]')).toThrow(InvalidAgentDefinitionError);
    });

    it('names the package of a subpath', () => {
        expect(packageNameOf('@s/pkg/sub/path')).toBe('@s/pkg');
        expect(packageNameOf('pkg/agents')).toBe('pkg');
        expect(packageNameOf('pkg')).toBe('pkg');
    });
});

describe('createApp agent entries', () => {
    const agent = defineAgent({
        name: 'greeter',
        model: textModel('x'),
        instructions: 'x',
    });

    it('keeps code agents in order and collects package specifiers', () => {
        expect(splitAgentEntries([agent, '@s/a', 'b'])).toEqual({ agents: [agent], packages: ['@s/a', 'b'] });
    });

    it('refuses a specifier that is no bare one, naming the index', () => {
        expect(() => splitAgentEntries([agent, './agents/x'])).toThrow('createApp\'s agents[1] is no bare package specifier');
    });

    it('refuses a specifier listed twice', () => {
        expect(() => splitAgentEntries(['a', 'a'])).toThrow('createApp\'s agents lists the package a twice.');
    });
});

describe('mergePackageSpecifiers', () => {
    it('is the union in first-seen order (code, file, env)', () => {
        expect(mergePackageSpecifiers(['a', 'b'], ['c', 'a'], undefined, ['d', 'b'])).toEqual(['a', 'b', 'c', 'd']);
    });
});

describe('dev markers', () => {
    it('matches the version marker plus 12 hex characters only', () => {
        expect(isDevMarkerOf('@s/pkg@1.0.0+0123456789ab', '@s/pkg@1.0.0')).toBe(true);
        expect(isDevMarkerOf('@s/pkg@1.0.0+0123456789a', '@s/pkg@1.0.0')).toBe(false);
        expect(isDevMarkerOf('@s/pkg@1.0.1+0123456789ab', '@s/pkg@1.0.0')).toBe(false);
        expect(isDevMarkerOf('@s/pkg@1.0.0', '@s/pkg@1.0.0')).toBe(false);
    });
});
