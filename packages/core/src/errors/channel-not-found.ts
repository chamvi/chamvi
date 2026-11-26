/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, ErrorCode } from '@chamvi/errors';

/**
 * ctx.channels.findOneOrFail() named a channel the engine does not have, or
 * one that cannot send (it has no `out`); also an approval delivery through
 * a channel the engine no longer has. The message names the channel only.
 */
export class ChannelNotFoundError extends ChamviError {
    constructor(name: string) {
        super({
            message: `Channel "${name}" is not registered on the engine or cannot send (it has no out).`,
            code: ErrorCode.CHANNEL_NOT_FOUND,
        });
    }
}
