/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/core';
import { CALCULATE_MAX_LENGTH } from './constants.ts';
import { parseTokens } from './parse.ts';
import { tokenize } from './tokenize.ts';

/**
 * Evaluates an arithmetic expression exactly (decimal.js) and returns the
 * plain decimal string. Never evaluates code. Throws ValidationError.
 */
export function evaluateExpression(expression: string): string {
    if (expression.trim().length === 0) {
        throw new ValidationError('expression must be a non-empty string.');
    }

    if (expression.length > CALCULATE_MAX_LENGTH) {
        throw new ValidationError(`expression must be at most ${CALCULATE_MAX_LENGTH} characters.`);
    }

    return parseTokens(tokenize(expression)).toFixed();
}
