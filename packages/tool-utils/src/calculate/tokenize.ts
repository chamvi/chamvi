/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/core';
import type { Token } from './types.ts';

const NUMBER = /^(?:\d+(?:\.\d+)?|\.\d+)/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const SYMBOLS = '+-*/^%(),';

/** Splits the expression into tokens; any other character is a ValidationError. */
export function tokenize(expression: string): Token[] {
    const tokens: Token[] = [];
    let index = 0;

    while (index < expression.length) {
        const char = expression[index]!;

        if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
            index++;

            continue;
        }

        const rest = expression.slice(index);
        const number = NUMBER.exec(rest);

        if (number) {
            tokens.push({ kind: 'number', text: number[0] });
            index += number[0].length;

            continue;
        }

        const name = NAME.exec(rest);

        if (name) {
            tokens.push({ kind: 'name', text: name[0] });
            index += name[0].length;

            continue;
        }

        if (SYMBOLS.includes(char)) {
            tokens.push({ kind: 'symbol', text: char as '+' });
            index++;

            continue;
        }

        throw new ValidationError(`Unexpected character "${char}" at position ${index + 1}.`);
    }

    tokens.push({ kind: 'end' });

    return tokens;
}
