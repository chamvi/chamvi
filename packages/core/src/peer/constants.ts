/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The default deadline of a remote agent's whole remote run (24 h, as waitForDispatch()). */
export const REMOTE_TIMEOUT_DEFAULT_MS = 86_400_000;

/** The deadline of one request to a peer (start, read, cancel), on the engine's clock. */
export const PEER_REQUEST_TIMEOUT_MS = 30_000;

/** The longest `peer.origin` (the invoker's display name) of a peer start; a caller cuts a longer one. */
export const PEER_ORIGIN_MAX_LENGTH = 128;
