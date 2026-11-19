/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MODEL_SEPARATOR } from '../constants.ts';

/** `<provider>/<model>` split at the first `/`; undefined when either part is empty. */
export function splitModelRef(ref: string): { provider: string; model: string } | undefined {
    const index = ref.indexOf(MODEL_SEPARATOR);

    if (index <= 0 || index === ref.length - 1) {
        return undefined;
    }

    return {
        provider: ref.slice(0, index),
        model: ref.slice(index + MODEL_SEPARATOR.length),
    };
}
