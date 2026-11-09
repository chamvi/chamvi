/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/core';
import type { Decimal } from 'decimal.js';
import {
    CALCULATE_MAX_DEPTH,
    CALCULATE_MAX_EXPONENT,
    CALCULATE_MAX_MAGNITUDE,
    CALCULATE_PRECISION,
    CalculateDecimal,
} from './constants.ts';
import type { Operand, Token } from './types.ts';

type CalculateFunction = (args: Decimal[]) => Decimal;

function atLeastOne(name: string, args: Decimal[]): void {
    if (args.length === 0) {
        throw new ValidationError(`${name}() needs at least one argument.`);
    }
}

function exactly(name: string, args: Decimal[], count: number): void {
    if (args.length !== count) {
        throw new ValidationError(`${name}() takes exactly ${count} argument${count === 1 ? '' : 's'}.`);
    }
}

function sumOf(args: Decimal[]): Decimal {
    return args.reduce((total, value) => total.plus(value), new CalculateDecimal(0));
}

/** The fixed function table: a Map, so no inherited name such as `constructor` can match. */
const FUNCTIONS = new Map<string, CalculateFunction>([
    ['sum', (args) => {
        atLeastOne('sum', args);

        return sumOf(args);
    }],
    ['min', (args) => {
        atLeastOne('min', args);

        return CalculateDecimal.min(...args);
    }],
    ['max', (args) => {
        atLeastOne('max', args);

        return CalculateDecimal.max(...args);
    }],
    ['avg', (args) => {
        atLeastOne('avg', args);

        return sumOf(args).div(args.length);
    }],
    ['abs', (args) => {
        exactly('abs', args, 1);

        return args[0]!.abs();
    }],
    ['floor', (args) => {
        exactly('floor', args, 1);

        return args[0]!.floor();
    }],
    ['ceil', (args) => {
        exactly('ceil', args, 1);

        return args[0]!.ceil();
    }],
    ['round', (args) => {
        if (args.length < 1 || args.length > 2) {
            throw new ValidationError('round() takes a value and optional digits.');
        }

        const digits = args.length === 2 ? args[1]! : new CalculateDecimal(0);

        if (!digits.isInteger() || digits.lt(0) || digits.gt(CALCULATE_PRECISION)) {
            throw new ValidationError(`round() digits must be an integer from 0 to ${CALCULATE_PRECISION}.`);
        }

        return args[0]!.toDecimalPlaces(digits.toNumber());
    }],
]);

/** Refuses a non-finite value or one whose decimal exponent is out of bounds. */
function checked(value: Decimal): Decimal {
    if (!value.isFinite() || (!value.isZero() && Math.abs(value.e) > CALCULATE_MAX_MAGNITUDE)) {
        throw new ValidationError(`The result is out of range (more than ${CALCULATE_MAX_MAGNITUDE} digits).`);
    }

    return value;
}

function plain(value: Decimal): Operand {
    return { value: checked(value), percent: false };
}

/**
 * Parses and evaluates the tokens in one precedence-climbing pass, tightest
 * first: primary and calls, postfix `%`, `^` (right-associative), unary
 * minus, `* /`, `+ -`. Every limit applies as it goes, so a hostile input
 * stops early.
 */
export function parseTokens(tokens: Token[]): Decimal {
    let position = 0;
    let depth = 0;

    const peek = (): Token => tokens[position]!;
    const isSymbol = (text: string): boolean => {
        const token = peek();

        return token.kind === 'symbol' && token.text === text;
    };

    const describe = (token: Token): string => (token.kind === 'end' ? 'the end of the expression' : `"${token.text}"`);

    const expect = (text: string): void => {
        if (!isSymbol(text)) {
            throw new ValidationError(`Expected "${text}" but found ${describe(peek())}.`);
        }

        position++;
    };

    const nested = <T>(run: () => T): T => {
        depth++;

        if (depth > CALCULATE_MAX_DEPTH) {
            throw new ValidationError(`The expression is nested deeper than ${CALCULATE_MAX_DEPTH} levels.`);
        }

        try {
            return run();
        } finally {
            depth--;
        }
    };

    const additive = (): Operand => {
        let left = multiplicative();

        while (isSymbol('+') || isSymbol('-')) {
            const op = (peek() as { text: string }).text;

            position++;

            const right = multiplicative();

            if (left.percent || right.percent) {
                throw new ValidationError(
                    `A percentage directly after "${op}" has two readings. ` +
                    'Write 100 * 1.1 for 100 plus 10%, or 100 * 0.9 for minus 10%.',
                );
            }

            left = plain(op === '+' ? left.value.plus(right.value) : left.value.minus(right.value));
        }

        return left;
    };

    const multiplicative = (): Operand => {
        let left = unary();

        while (isSymbol('*') || isSymbol('/')) {
            const op = (peek() as { text: string }).text;

            position++;

            const right = unary();

            if (op === '/') {
                if (right.value.isZero()) {
                    throw new ValidationError('Division by zero.');
                }

                left = plain(left.value.div(right.value));
            } else {
                left = plain(left.value.times(right.value));
            }
        }

        return left;
    };

    const unary = (): Operand => {
        if (isSymbol('-')) {
            position++;

            const operand = nested(unary);

            return { value: operand.value.neg(), percent: operand.percent };
        }

        return power();
    };

    const power = (): Operand => {
        const base = postfix();

        if (!isSymbol('^')) {
            return base;
        }

        position++;

        const exponent = nested(unary);
        const { value: y } = exponent;

        // checked before the power is computed
        if (!y.isInteger() || y.abs().gt(CALCULATE_MAX_EXPONENT)) {
            throw new ValidationError(`The exponent of ^ must be an integer from -${CALCULATE_MAX_EXPONENT} to ${CALCULATE_MAX_EXPONENT}.`);
        }

        if (base.value.isZero() && y.isNegative()) {
            throw new ValidationError('Division by zero.');
        }

        return plain(base.value.pow(y));
    };

    const postfix = (): Operand => {
        let operand = primary();

        while (isSymbol('%')) {
            position++;
            operand = { value: operand.value.div(100), percent: true };
        }

        return operand;
    };

    const primary = (): Operand => {
        const token = peek();

        if (token.kind === 'number') {
            position++;

            return plain(new CalculateDecimal(token.text));
        }

        if (token.kind === 'symbol' && token.text === '(') {
            position++;

            const inner = nested(additive);

            expect(')');

            return { value: inner.value, percent: false };
        }

        if (token.kind === 'name') {
            position++;

            const fn = FUNCTIONS.get(token.text);

            if (!fn) {
                throw new ValidationError(`Unknown name "${token.text}". Available functions: ${FUNCTIONS.keys().toArray().join(', ')}.`);
            }

            expect('(');

            const args = nested(() => {
                const list: Decimal[] = [];

                if (isSymbol(')')) {
                    return list;
                }

                list.push(additive().value);

                while (isSymbol(',')) {
                    position++;
                    list.push(additive().value);
                }

                return list;
            });

            expect(')');

            return plain(fn(args));
        }

        throw new ValidationError(`Unexpected ${describe(token)}.`);
    };

    const result = additive();

    if (peek().kind !== 'end') {
        throw new ValidationError(`Unexpected ${describe(peek())}.`);
    }

    return result.value;
}
