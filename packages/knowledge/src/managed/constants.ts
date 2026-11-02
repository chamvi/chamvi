/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The longest content of a managed document, in UTF-16 code units. */
export const MANAGED_CONTENT_MAX_CHARS = 1_048_576;

/**
 * How often an idle managed collection's loop looks for pending documents,
 * and how often the collections are listed to start or stop managed loops
 * (a collection another replica created or deleted).
 */
export const KNOWLEDGE_MANAGED_POLL_MS = 60_000;

/** Pending documents read per page of a managed pass. */
export const MANAGED_PAGE_SIZE = 64;
