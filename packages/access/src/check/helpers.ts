/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IPolicyEvaluator, PolicyEvaluationResult, PolicyEvaluators } from '@authup/access';
import { BuiltInPolicyType, PolicyIssueCode } from '@authup/access';
import { isObject } from 'smob';

/** Marks a binding whose policy tree failed for a reason other than a verdict. */
type BrokenFlag = { broken: boolean };

/**
 * A deep copy of plain policy data (the engine rewrites `$regex` strings in
 * place). Reads through proxies, unlike structuredClone; a cycle throws.
 */
export function copyPolicy<T>(value: T, seen: unknown[] = []): T {
    if (Array.isArray(value)) {
        return withSeen(value, seen, () => value.map((item) => copyPolicy(item, seen))) as T;
    }

    if (value instanceof Date) {
        return new Date(value.getTime()) as T;
    }

    if (isObject(value)) {
        return withSeen(value, seen, () => {
            const output: Record<string, unknown> = {};

            for (const [key, item] of Object.entries(value)) {
                output[key] = copyPolicy(item, seen);
            }

            return output;
        }) as T;
    }

    return value;
}

function withSeen<T>(value: unknown, seen: unknown[], copy: () => T): T {
    if (seen.includes(value)) {
        throw new TypeError('A policy must not contain a cycle.');
    }

    seen.push(value);

    try {
        return copy();
    } finally {
        seen.pop();
    }
}

/**
 * True when every node of the tree has a type the evaluators answer. A
 * `permissionBinding` node never is: a binding carries its own grant. A
 * `realmMatch` node never is either: a resource carries no realm here (reach
 * is settled before a binding is built), and the engine passes it then.
 * An empty composite is refused here, since the engine fails it without
 * an evaluator error an inverted parent would then turn into a pass.
 */
export function isEvaluable(policy: unknown, evaluators: PolicyEvaluators): boolean {
    if (
        !isObject(policy) ||
        typeof policy.type !== 'string' ||
        policy.type === BuiltInPolicyType.PERMISSION_BINDING ||
        policy.type === BuiltInPolicyType.REALM_MATCH ||
        !Object.prototype.hasOwnProperty.call(evaluators, policy.type)
    ) {
        return false;
    }

    if (policy.type !== BuiltInPolicyType.COMPOSITE) {
        return true;
    }

    const { children } = policy;

    return Array.isArray(children) &&
        children.length > 0 &&
        children.every((child) => isEvaluable(child, evaluators));
}

/**
 * Wraps every evaluator so that anything other than a verdict (a validator
 * or data validator throwing, an issue other than a denial) sets the flag.
 * The engine reports such failures as a plain `success: false` an inverted
 * composite above would flip into a pass; the flag fails the binding instead.
 */
export function guardEvaluators(evaluators: PolicyEvaluators, flag: BrokenFlag): PolicyEvaluators {
    const output: PolicyEvaluators = {};

    for (const [type, evaluator] of Object.entries(evaluators)) {
        output[type] = guardEvaluator(evaluator, flag);
    }

    return output;
}

function guardEvaluator(evaluator: IPolicyEvaluator, flag: BrokenFlag): IPolicyEvaluator {
    const guarded: IPolicyEvaluator = {
        evaluate: async (value, ctx) => {
            try {
                const result = await evaluator.evaluate(value, ctx);

                if (isMalfunction(result)) {
                    flag.broken = true;
                }

                return result;
            } catch (error) {
                flag.broken = true;

                throw error;
            }
        },
    };

    if (evaluator.requires) {
        guarded.requires = (value) => {
            try {
                return evaluator.requires!(value);
            } catch (error) {
                flag.broken = true;

                throw error;
            }
        };
    }

    if (evaluator.toCondition) {
        guarded.toCondition = (value, ctx) => evaluator.toCondition!(value, ctx);
    }

    return guarded;
}

/** A settled failure that carries an issue item other than a denial. */
function isMalfunction(result: PolicyEvaluationResult): boolean {
    if (result.success || result.pending || !result.issues) {
        return false;
    }

    return result.issues.some((issue) => issue.type !== 'group' &&
        issue.code !== PolicyIssueCode.EVALUATION_DENIED);
}
