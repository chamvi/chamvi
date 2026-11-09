/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import { defineTool } from '@chamvi/core';
import { evaluateExpression } from '../calculate/evaluate.ts';
import { inputObject, objectSchema, requireString } from './asserts.ts';

type CalculateInput = {
    expression: string;
};

type CalculateResult = {
    result: string;
};

export function calculateTool(): Tool<CalculateInput, CalculateResult> {
    return defineTool<CalculateInput, CalculateResult>({
        description: 'Decimal arithmetic rounded to 40 significant digits (0.1 + 0.2 is 0.3): call it for any sum, product, percentage, average or rounding ' +
            'instead of calculating yourself. Supports + - * / ^, parentheses, a % suffix (50% is 0.5), and ' +
            'sum, min, max, avg, round(x, digits), abs, floor, ceil. Numbers are plain decimals (no 1e5, no ' +
            'thousands separators). "100 + 10%" is refused: write 100 * 1.1. Returns { result } as a decimal string.',
        inputSchema: objectSchema<CalculateInput>({
            expression: {
                type: 'string',
                description: 'The expression, e.g. "(19.99 * 3) * 1.19" or "round(200 * 15%, 2)".',
            },
        }, ['expression']),
        execute: async (input) => {
            const body = inputObject(input);

            return { result: evaluateExpression(requireString(body.expression, 'expression')) };
        },
    });
}
