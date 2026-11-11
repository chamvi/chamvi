/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@chamvi/core';
import { evaluateExpression } from '../../../src/calculate/evaluate.ts';

describe('evaluateExpression', () => {
    it.each([
        ['0.1 + 0.2', '0.3'],
        ['12345678901234567890123456789012345678905', '12345678901234567890123456789012345678910'],
        ['abs(12345678901234567890123456789012345678905)', '12345678901234567890123456789012345678910'],
        ['2 + 3 * 4', '14'],
        ['(2 + 3) * 4', '20'],
        ['-2^2', '-4'],
        ['2^-1', '0.5'],
        ['2^3^2', '512'],
        ['50%^2', '0.25'],
        ['200 * 15%', '30'],
        ['1/3', '0.3333333333333333333333333333333333333333'],
        ['10^21', '1000000000000000000000'],
        ['sum(1, 2, 3.5)', '6.5'],
        ['min(3, 1)', '1'],
        ['max(3, 1)', '3'],
        ['avg(1, 2)', '1.5'],
        ['round(2.345, 2)', '2.35'],
        ['round(2.5)', '3'],
        ['abs(-1)', '1'],
        ['floor(1.9)', '1'],
        ['ceil(1.1)', '2'],
        ['100 * 1.1', '110'],
        // a product, a power or a function argument makes the percentage a plain number
        ['100 + 10%*1', '100.1'],
        ['100 + 10%^1', '100.1'],
        ['sum(100, 10%)', '100.1'],
        ['100 + (10% * 1)', '100.1'],
        ['(10%) * 100', '10'],
        ['(10%)', '0.1'],
        ['1 - 2 - 3', '-4'],
        ['8 / 2 / 2', '2'],
    ])('%s = %s', (expression, expected) => {
        expect(evaluateExpression(expression)).toBe(expected);
    });

    it('explains how to write a percentage under + and -', () => {
        expect(() => evaluateExpression('100 + 10%')).toThrow(/100 \* 1\.1/);
    });

    it.each([
        '100 + 10%',
        '100 - 10%',
        '100 + (10%)',
        '100 + ((10%))',
        '(10%) + 100',
        '100 - -(10%)',
        'foo',
        'foo(1)',
        'constructor',
        'constructor(1)',
        '__proto__',
        'a.b',
        '1 / 0',
        '2^-1 / 0',
        '0^-1',
        'sum()',
        'avg()',
        'min()',
        'round(1, 41)',
        'round(1, 0.5)',
        'round(1, -1)',
        '2^1001',
        '2^0.5',
        '(9^1000)^1000',
        '10^1000 * 10^1000',
        `1${'%'.repeat(999)}`,
        '1e5',
        '1,000',
        '(1',
        '1)',
        '1 +',
        'abs(1, 2)',
        'x = 1',
        '',
        ' '.repeat(3),
        '1'.repeat(1001),
        `${'('.repeat(65)}1${')'.repeat(65)}`,
        `${'-'.repeat(65)}1`,
        `${'2^'.repeat(65)}1`,
        `${'abs('.repeat(65)}1${')'.repeat(65)}`,
    ])('refuses %j', (expression) => {
        expect(() => evaluateExpression(expression)).toThrow(ValidationError);
    });

    it('accepts nesting at the limit', () => {
        expect(evaluateExpression(`${'('.repeat(64)}1${')'.repeat(64)}`)).toBe('1');
    });

    it('stays fast on hostile powers', () => {
        const started = Date.now();

        expect(() => evaluateExpression('((9^1000)^1000)^1000')).toThrow(ValidationError);
        expect(Date.now() - started).toBeLessThan(1000);
    });
});
