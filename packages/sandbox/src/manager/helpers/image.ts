/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ISandboxProvider } from '../../provider/types.ts';
import type { WorkspaceManagerOptions } from '../types.ts';

/** The name of the local provider, which runs no images. */
const LOCAL_PROVIDER = 'local';

/**
 * Whether `create_workspace` offers an `image`: only with an allow-list and
 * never on the local provider (it runs no images).
 */
export function offersImage(
    provider: Pick<ISandboxProvider, 'name'>,
    allowImage: WorkspaceManagerOptions['allowImage'],
): boolean {
    return allowImage !== undefined && provider.name !== LOCAL_PROVIDER;
}

/** Why a requested image is refused when the manager offers none. */
export function imageNotOfferedMessage(provider: Pick<ISandboxProvider, 'name'>): string {
    return provider.name === LOCAL_PROVIDER ?
        'image is not offered: the local provider runs no images.' :
        'image is not offered: the operator configured no image allow-list.';
}
