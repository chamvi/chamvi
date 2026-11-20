/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IChannel } from '../../../channel/types.ts';
import { InvalidAgentDefinitionError } from '../../../errors/index.ts';
import type { IPeerResolver } from '../../../peer/types.ts';

/**
 * Refuses a peer whose `approvals` destination names a channel the engine
 * does not hold or one without `out`: the receiver's notifications would
 * otherwise fail one by one to `onError`.
 */
export function assertPeerApprovals(peers: IPeerResolver, getChannel: (name: string) => IChannel | undefined): void {
    for (const name of peers.names()) {
        const { approvals } = peers.settings(name);

        if (approvals && typeof getChannel(approvals.channel)?.out !== 'function') {
            throw new InvalidAgentDefinitionError(
                `Peer "${name}": approvals channel "${approvals.channel}" is not registered or sends nothing (no out).`,
            );
        }
    }
}
