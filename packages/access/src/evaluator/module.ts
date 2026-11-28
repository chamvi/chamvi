/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    IPermissionEvaluator,
    PermissionCompileResult,
    PermissionEvaluationContext,
} from '@authup/access';
import { BuiltInPolicyType, PermissionError } from '@authup/access';
import { isObject } from 'smob';
import { can, canSome } from '../check/module.ts';
import type { PermissionCheckOptions, PermissionHolder } from '../permission/types.ts';
import type { HolderPermissionEvaluatorOptions } from './types.ts';

/**
 * authup's evaluator contract over `can` and `canSome` for one holder, so
 * every decision is theirs. The holder is kept by reference (their evaluator
 * cache is per holder object). Only the attributes are read from `ctx.data`;
 * `now` comes from the options, realm and client from the holder.
 */
export class HolderPermissionEvaluator implements IPermissionEvaluator {
    protected holder: PermissionHolder;

    protected options: HolderPermissionEvaluatorOptions;

    constructor(holder: PermissionHolder, options: HolderPermissionEvaluatorOptions = {}) {
        this.holder = holder;
        this.options = options;
    }

    /** Every name passes `can`. */
    async evaluate(ctx: PermissionEvaluationContext): Promise<void> {
        await this.assertEvery(ctx, false);
    }

    /** Some name passes `can`. */
    async evaluateOneOf(ctx: PermissionEvaluationContext): Promise<void> {
        await this.assertSome(ctx, false);
    }

    /** Every name passes `canSome`. */
    async preEvaluate(ctx: PermissionEvaluationContext): Promise<void> {
        await this.assertEvery(ctx, true);
    }

    /** Some name passes `canSome`. */
    async preEvaluateOneOf(ctx: PermissionEvaluationContext): Promise<void> {
        await this.assertSome(ctx, true);
    }

    /** The static check cannot lower to a query: every row is checked on its own. */
    async compile(): Promise<PermissionCompileResult> {
        return { verdict: 'post' };
    }

    protected async assertEvery(ctx: PermissionEvaluationContext, some: boolean): Promise<void> {
        const options = this.buildOptions(ctx);

        for (const name of this.namesOf(ctx)) {
            if (!await this.check(name, options, some)) {
                throw PermissionError.denied(name);
            }
        }
    }

    protected async assertSome(ctx: PermissionEvaluationContext, some: boolean): Promise<void> {
        const options = this.buildOptions(ctx);
        const names = this.namesOf(ctx);

        for (const name of names) {
            if (await this.check(name, options, some)) {
                return;
            }
        }

        throw names.length === 1 ? PermissionError.denied(names[0]!) : PermissionError.deniedAll(names);
    }

    protected async check(name: string, options: PermissionCheckOptions, some: boolean): Promise<boolean> {
        return some ? canSome(this.holder, name, options) : can(this.holder, name, options);
    }

    protected namesOf(ctx: PermissionEvaluationContext): string[] {
        return Array.isArray(ctx.name) ? ctx.name : [ctx.name];
    }

    protected buildOptions(ctx: PermissionEvaluationContext): PermissionCheckOptions {
        const attributes = ctx.data?.has(BuiltInPolicyType.ATTRIBUTES) ?
            ctx.data.get<unknown>(BuiltInPolicyType.ATTRIBUTES) :
            undefined;

        return {
            ...(isObject(attributes) ? { attributes } : {}),
            ...(this.options.now ? { now: this.options.now() } : {}),
        };
    }
}
