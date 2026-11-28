/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { boundReceived } from '../received.ts';
import type { CheckContext } from './types.ts';

/*
 * Every check reports a `custom` issue, which `@validup/zod` maps to the
 * code `value_invalid` with the message given here; zod's own checks
 * (`.min()`, `z.string()`) would map to other codes and carry no `received`.
 * A failing value goes back as `received` only within RECEIVED_MAX_LENGTH,
 * so a 400 never echoes a large input back.
 */

/** Reports the value as invalid; `echo: false` leaves `received` out (a secret may be the value). */
export function reportInvalid(ctx: CheckContext, message: string, echo = true): void {
    ctx.issues.push({
        code: 'custom',
        input: ctx.value,
        message,
        ...(echo && { received: boundReceived(ctx.value) }),
    });
}
