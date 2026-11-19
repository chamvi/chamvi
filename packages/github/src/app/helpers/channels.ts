/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The names of the GitHub channels made for each app (githubChannel() registers its own). */
const CHANNEL_NAMES = new WeakMap<object, Set<string>>();

/** Records that the channel `name` takes the deliveries of `app` (githubChannel() calls it). */
export function registerChannelName(app: object, name: string): void {
    let names = CHANNEL_NAMES.get(app);

    if (!names) {
        names = new Set();
        CHANNEL_NAMES.set(app, names);
    }

    names.add(name);
}

/** Whether any githubChannel() was made for `app`. */
export function hasChannel(app: object): boolean {
    return (CHANNEL_NAMES.get(app)?.size ?? 0) > 0;
}

/** Whether a githubChannel() of `app` is named `name`. */
export function isChannelOf(app: object, name: unknown): boolean {
    return typeof name === 'string' && (CHANNEL_NAMES.get(app)?.has(name) ?? false);
}
