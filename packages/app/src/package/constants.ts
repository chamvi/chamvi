/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** npm's package name rule (lower case, an optional scope). */
export const PACKAGE_NAME_PATTERN = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/** npm's maximum package name length. */
export const PACKAGE_NAME_MAX_LENGTH = 214;

/** The width of the store's revision marker column (`chamvi_agent_revisions.hash`). */
export const REVISION_MAX_LENGTH = 128;

/** How many hex characters of the content hash a dev marker (`<name>@<version>+<hash>`) carries. */
export const DEV_HASH_LENGTH = 12;

export const PACKAGE_MANIFEST = 'package.json';

/** The top-level folder the hash leaves out of a package without a `files` field. */
export const PACKAGE_TEST_DIR = 'test';

/** Always left out of a package's hash: installed packages of its own. */
export const PACKAGE_HASH_IGNORE = ['**/node_modules/**'] as const;
