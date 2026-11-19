/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { systemClock } from '@chamvi/core';
import { AppToken, ModuleName, approvalUrlOf } from '@chamvi/app';
import type { IContainer, IModule } from '@chamvi/app';
import { createPeerResolver } from '../resolver/module.ts';
import { PEER_MODULE_NAME } from './constants.ts';
import type { PeerModuleOptions } from './types.ts';

/**
 * Registers `createPeerResolver()` as `AppToken.PEERS`, which the engine
 * module passes to the engine; the engine then refuses a remote agent naming
 * a peer it does not hold (also in a check).
 */
export class PeerModule implements IModule {
    readonly name = PEER_MODULE_NAME;

    readonly dependencies = [ModuleName.CONFIG];

    protected options: PeerModuleOptions;

    constructor(options: PeerModuleOptions) {
        this.options = options;

        // the option checks run when the factory is called (the clock is not used by them)
        createPeerResolver({ ...options, clock: options.clock ?? systemClock });
    }

    async setup(container: IContainer): Promise<void> {
        const approvalUrl = this.options.approvalUrl ?? approvalUrlOf(container.resolve(AppToken.CONFIG));
        const peers = createPeerResolver({
            ...this.options,
            ...(approvalUrl && { approvalUrl }),
            clock: this.options.clock ?? container.resolve(AppToken.CLOCK),
        });

        container.register(AppToken.PEERS, { useValue: peers });
    }
}

/** The peers remote agents run at, by name; see `PeerOptions`. */
export function peerModule(options: PeerModuleOptions): IModule {
    return new PeerModule(options);
}
