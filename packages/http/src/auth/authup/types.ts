/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ITokenVerifier } from '@authup/server-adapter-kit';
import type { IClock } from '@chamvi/core';

export type AuthupOptions = {
    /** An authup `TokenVerifier` (remote mode for grants) or any `ITokenVerifier`. */
    verifier: ITokenVerifier;
    /** RFC 8705: the client certificate's SHA-256 thumbprint, for certificate-bound tokens. */
    certificateThumbprintByRequest?: (request: Request) => string | undefined | Promise<string | undefined>;
    /**
     * Reads authup's `GET /authorization` body (needs `permission_read` with a realm scope of `ownOrNull` or wider).
     * Called once, again once the copy is older than `catalogMaxAgeMs`,
     * when a grant names a definition or policy the copy lacks, and after a
     * failed read (a body that is not a catalog counts as one).
     */
    catalog: () => Promise<unknown>;
    /** How long a read catalog is used before it is read again, so policy edits in authup apply. Default: 60 000. */
    catalogMaxAgeMs?: number;
    /** The clock the catalog's age is measured on. Default: `systemClock`. */
    clock?: IClock;
    /** The realm chamvi's resources belong to (the realm id of chamvi's authup client). Called per request with grants; cache it. */
    realm: () => Promise<string>;
    /** Receives catalog, realm and snapshot failures; the login then grants nothing. Default: `console.error`. */
    onError?: (error: unknown) => void;
};
