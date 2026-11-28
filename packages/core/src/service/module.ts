/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { forbidden, isActorGranted, isActorGrantedSome } from '../actor/helpers.ts';
import type { ActorContext } from '../actor/types.ts';

/**
 * The base of a service that checks what its actor may do (authup's
 * `AbstractEntityService`, with the checks chamvi calls).
 */
export abstract class AbstractEntityService {
    /** Whether the actor holds `name` for the resource `attributes`. */
    protected isGranted(actor: ActorContext<unknown>, name: string, attributes?: Record<string, unknown>): Promise<boolean> {
        return isActorGranted(actor, name, attributes);
    }

    /** Whether the actor holds `name` for some resource (a collection gate). */
    protected isGrantedSome(actor: ActorContext<unknown>, name: string): Promise<boolean> {
        return isActorGrantedSome(actor, name);
    }

    /**
     * `isGranted` with attributes, else `isGrantedSome`; `forbidden(name)`
     * when it fails.
     */
    protected async assertGranted(actor: ActorContext<unknown>, name: string, attributes?: Record<string, unknown>): Promise<void> {
        const granted = attributes !== undefined ?
            await this.isGranted(actor, name, attributes) :
            await this.isGrantedSome(actor, name);

        if (!granted) {
            throw forbidden(name);
        }
    }
}
