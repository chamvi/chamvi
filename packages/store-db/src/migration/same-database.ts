/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isIPv4, isIPv6 } from 'node:net';
import { hostname, networkInterfaces } from 'node:os';
import { POSTGRES_PROTOCOLS } from '../database/constants.ts';
import type { DatabaseIdentity } from './types.ts';

/** Every host of this machine, compared as one. */
const LOOPBACK = 'loopback';

function decode(text: string): string {
    try {
        return decodeURIComponent(text);
    } catch {
        return text;
    }
}

/** The addresses and the name of this machine, lower-cased. */
function ownHosts(): Set<string> {
    const own = new Set<string>(['localhost', '0.0.0.0', '::', '::1']);

    try {
        own.add(hostname().toLowerCase());

        for (const addresses of Object.values(networkInterfaces())) {
            for (const address of addresses ?? []) {
                own.add(address.address.toLowerCase());
            }
        }
    } catch {
        // no interfaces readable: the fixed names above still count
    }

    return own;
}

/**
 * The host as the network sees it: lower case, no brackets, no trailing
 * dot, IPv4 and IPv6 in their canonical form (`127.1` and `0x7f.0.0.1`
 * are `127.0.0.1`), and `loopback` for a socket path, an empty host and
 * every name or address of this machine.
 */
function normalizeHost(raw: string, own: Set<string>): string {
    let host = decode(raw).trim().toLowerCase().replace(/^\[(.*)\]$/, '$1').replace(/\.+$/, '');

    if (host.length === 0 || host.startsWith('/')) {
        return LOOPBACK;
    }

    // the WHATWG parser of a special scheme canonicalizes IPv4 shorthands and IPv6 compressions
    try {
        host = new URL(`http://${isIPv6(host) ? `[${host}]` : host}/`).hostname.replace(/^\[(.*)\]$/, '$1');
    } catch {
        // not a host the parser takes: compare its spelling
    }

    // an IPv4-mapped IPv6 address, which the parser writes in hex (`::ffff:7f00:1`)
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);

    if (mapped) {
        const [high, low] = [Number.parseInt(mapped[1]!, 16), Number.parseInt(mapped[2]!, 16)];

        host = [high >> 8, high & 255, low >> 8, low & 255].join('.');
    }

    if (own.has(host) || host.endsWith('.localhost') || (isIPv4(host) && host.startsWith('127.'))) {
        return LOOPBACK;
    }

    return host;
}

/**
 * How a PostgreSQL URL names its database, spelling aside, as the
 * driver (`pg`) reads it: a `host`, `port`, `dbname`, `database` or `db`
 * query parameter counts beside the URL's own; a URL without a database
 * names the user's; a URL without a port names any. Undefined for a URL
 * that does not parse or is not PostgreSQL.
 */
export function identifyDatabase(url: string): DatabaseIdentity | undefined {
    if (!URL.canParse(url)) {
        return undefined;
    }

    const parsed = new URL(url);

    if (!POSTGRES_PROTOCOLS.includes(parsed.protocol)) {
        return undefined;
    }

    const own = ownHosts();
    const query = parsed.searchParams;
    const hostParameter = query.get('host') ?? query.get('hostaddr');
    const hosts = new Set((hostParameter ?? parsed.hostname).split(',').map((host) => normalizeHost(host, own)));

    const portText = query.get('port') ?? parsed.port;
    const port = portText.length > 0 ? Number(portText) : undefined;

    const names = new Set<string>();
    const path = decode(parsed.pathname.replace(/^\//, '').replace(/\/+$/, ''));

    names.add((path.length > 0 ? path : decode(parsed.username)).toLowerCase());

    for (const key of ['dbname', 'database', 'db']) {
        const value = query.get(key);

        if (value) {
            names.add(value.toLowerCase());
        }
    }

    return {
        hosts,
        port: port !== undefined && Number.isSafeInteger(port) ? port : undefined,
        names,
    };
}

function overlaps<T>(a: Set<T>, b: Set<T>): boolean {
    return !a.isDisjointFrom(b);
}

/**
 * Whether two PostgreSQL URLs may name one database, whatever their
 * spelling: `postgres:` or `postgresql:`, the host's case, a trailing
 * dot or slash, a default port given or left out, percent-encoding,
 * `localhost`, `127.0.0.1`, `::1` or this machine's name and addresses,
 * a query string, another user. It errs towards `true`: database names
 * compare without case, a URL without a port matches any port, a URL
 * without a database matches its user's name, a URL that does not parse
 * matches everything. It cannot see two names of one server that differ
 * outside this machine (a DNS alias, a pooler): `generate` asks the
 * server as well.
 */
export function isSameDatabase(a: string, b: string): boolean {
    const left = identifyDatabase(a);
    const right = identifyDatabase(b);

    if (!left || !right) {
        return true;
    }

    const names = [...left.names, ...right.names];

    if (names.includes('')) {
        // a URL naming neither a database nor a user: the driver's default, which may be anything
        return overlaps(left.hosts, right.hosts) && (left.port === undefined || right.port === undefined || left.port === right.port);
    }

    return overlaps(left.hosts, right.hosts) &&
        (left.port === undefined || right.port === undefined || left.port === right.port) &&
        overlaps(left.names, right.names);
}
