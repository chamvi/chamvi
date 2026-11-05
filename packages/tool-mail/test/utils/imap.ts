/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import net from 'node:net';
import type { AddressInfo } from 'node:net';

export type FakeAttachment = {
    filename: string;
    mediaType: string;
    content: string | Uint8Array;
};

export type FakeMessage = {
    uid: number;
    /** ISO date, default 2026-11-01T10:00:00Z. */
    date?: string;
    from?: string;
    to?: string;
    cc?: string;
    subject?: string;
    messageId?: string;
    inReplyTo?: string;
    references?: string[];
    seen?: boolean;
    text?: string;
    html?: string;
    attachments?: FakeAttachment[];
    /** Overrides RFC822.SIZE. */
    size?: number;
    /** X-GM-THRID (gmail fakes). */
    threadId?: string;
};

export type FakeFolder = {
    path: string;
    /** LIST flags, e.g. `\\Trash`. */
    flags?: string[];
    uidValidity?: number;
    messages?: FakeMessage[];
};

export type FakeImapOptions = {
    gmail?: boolean;
    folders: FakeFolder[];
    /** Answers LOGIN with NO. */
    loginFails?: boolean;
    /** Commands matching it get no reply. */
    hold?: RegExp;
    /** The uids a search of `folder` returns (default: every uid of the folder, or the thread for X-GM-THRID). */
    search?: (folder: string, command: string) => number[] | undefined;
};

export type FakeImap = {
    port: number;
    commands: string[];
    /** Sockets that ended or closed. */
    closed: () => number;
    close: () => Promise<void>;
};

type Leaf = {
    type: string;
    subtype: string;
    params: string[];
    body: string;
    filename?: string;
};

type Built = {
    raw: string;
    headers: string;
    leaves: Leaf[];
    multipart: boolean;
};

const BOUNDARY = 'chamvi-boundary';

function quote(value: string): string {
    return `"${value.replace(/["\\]/g, (char) => `\\${char}`)}"`;
}

function nstring(value: string | undefined): string {
    return value === undefined ? 'NIL' : quote(value);
}

function base64(content: string | Uint8Array): string {
    const encoded = Buffer.from(content).toString('base64');

    return encoded.replace(/.{1,76}/g, (line) => `${line}\r\n`);
}

function parseAddress(value: string): {
    name?: string;
    local: string;
    domain: string
} {
    const match = /^(.*)<([^>]+)>$/.exec(value.trim());
    const name = match ? match[1]!.trim() : undefined;
    const address = match ? match[2]! : value.trim();
    const [local, domain] = address.split('@');

    return {
        ...(name && { name }),
        local: local!,
        domain: domain ?? '',
    };
}

function addressList(value: string | undefined): string {
    if (!value) {
        return 'NIL';
    }

    const entries = value.split(',').map((entry) => {
        const {
            name,
            local,
            domain,
        } = parseAddress(entry);

        return `(${nstring(name)} NIL ${quote(local)} ${quote(domain)})`;
    });

    return `(${entries.join('')})`;
}

function dateOf(message: FakeMessage): Date {
    return new Date(message.date ?? '2026-11-01T10:00:00Z');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function internalDate(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');

    return `${pad(date.getUTCDate())}-${MONTHS[date.getUTCMonth()]}-${date.getUTCFullYear()} ` +
        `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`;
}

function build(message: FakeMessage): Built {
    const date = dateOf(message);
    const headerLines = [
        `Date: ${date.toUTCString()}`,
        `From: ${message.from ?? 'Alice <alice@x.test>'}`,
        `To: ${message.to ?? 'bob@y.test'}`,
        ...(message.cc ? [`Cc: ${message.cc}`] : []),
        `Subject: ${message.subject ?? `Mail ${message.uid}`}`,
        `Message-ID: ${message.messageId ?? `<${message.uid}@x.test>`}`,
        ...(message.inReplyTo ? [`In-Reply-To: ${message.inReplyTo}`] : []),
        ...(message.references ? [`References: ${message.references.join(' ')}`] : []),
        'MIME-Version: 1.0',
    ];
    const leaves: Leaf[] = [];

    if (message.text !== undefined) {
        leaves.push({
            type: 'TEXT',
            subtype: 'PLAIN',
            params: ['CHARSET', 'utf-8'],
            body: base64(message.text),
        });
    }

    if (message.html !== undefined) {
        leaves.push({
            type: 'TEXT',
            subtype: 'HTML',
            params: ['CHARSET', 'utf-8'],
            body: base64(message.html),
        });
    }

    for (const attachment of message.attachments ?? []) {
        const [type, subtype] = attachment.mediaType.toUpperCase().split('/');

        leaves.push({
            type: type!,
            subtype: subtype!,
            params: ['NAME', attachment.filename],
            body: base64(attachment.content),
            filename: attachment.filename,
        });
    }

    if (leaves.length === 0) {
        leaves.push({
            type: 'TEXT',
            subtype: 'PLAIN',
            params: ['CHARSET', 'utf-8'],
            body: base64(''),
        });
    }

    const multipart = leaves.length > 1;
    const partHeaders = (leaf: Leaf) => [
        `Content-Type: ${leaf.type.toLowerCase()}/${leaf.subtype.toLowerCase()}; ${leaf.params[0]!.toLowerCase()}="${leaf.params[1]}"`,
        'Content-Transfer-Encoding: base64',
        ...(leaf.filename ? [`Content-Disposition: attachment; filename="${leaf.filename}"`] : []),
    ];
    let headers: string;
    let body: string;

    if (multipart) {
        headers = [...headerLines, `Content-Type: multipart/mixed; boundary="${BOUNDARY}"`].join('\r\n');
        body = `${leaves.map((leaf) => `--${BOUNDARY}\r\n${partHeaders(leaf).join('\r\n')}\r\n\r\n${leaf.body}`).join('')
        }--${BOUNDARY}--\r\n`;
    } else {
        headers = [...headerLines, ...partHeaders(leaves[0]!)].join('\r\n');
        body = leaves[0]!.body;
    }

    return {
        raw: `${headers}\r\n\r\n${body}`,
        headers,
        leaves,
        multipart,
    };
}

function leafStructure(leaf: Leaf): string {
    const params = `(${leaf.params.map(quote).join(' ')})`;
    const size = Buffer.byteLength(leaf.body);
    const lines = leaf.type === 'TEXT' ? ` ${leaf.body.split('\r\n').length - 1}` : '';
    const disposition = leaf.filename ? `("ATTACHMENT" ("FILENAME" ${quote(leaf.filename)}))` : 'NIL';

    return `(${quote(leaf.type)} ${quote(leaf.subtype)} ${params} NIL NIL "BASE64" ${size}${lines} NIL ${disposition} NIL NIL)`;
}

function bodyStructure(built: Built): string {
    if (!built.multipart) {
        return leafStructure(built.leaves[0]!);
    }

    return `(${built.leaves.map(leafStructure).join('')} "MIXED" ("BOUNDARY" ${quote(BOUNDARY)}) NIL NIL NIL)`;
}

function envelope(message: FakeMessage): string {
    const from = addressList(message.from ?? 'Alice <alice@x.test>');

    return `(${quote(dateOf(message).toUTCString())} ${quote(message.subject ?? `Mail ${message.uid}`)} ${from} ${from} ${from} ` +
        `${addressList(message.to ?? 'bob@y.test')} ${addressList(message.cc)} NIL ${nstring(message.inReplyTo)} ` +
        `${quote(message.messageId ?? `<${message.uid}@x.test>`)})`;
}

function headerFields(built: Built, names: string[]): string {
    const wanted = new Set(names.map((name) => name.toLowerCase()));
    const lines = built.headers.split('\r\n').filter((line) => wanted.has(line.slice(0, line.indexOf(':')).toLowerCase()));

    return `${lines.join('\r\n')}\r\n\r\n`;
}

function section(built: Built, name: string): string {
    if (name === '') {
        return built.raw;
    }

    const fields = /^HEADER\.FIELDS \(([^)]*)\)$/i.exec(name);

    if (fields) {
        return headerFields(built, fields[1]!.split(' '));
    }

    if (/^\d+$/.test(name)) {
        return built.leaves[Number(name) - 1]?.body ?? '';
    }

    return '';
}

function literal(value: string): string {
    return `{${Buffer.byteLength(value)}}\r\n${value}`;
}

function uidSet(value: string, max: number): Set<number> {
    const uids = new Set<number>();

    for (const range of value.split(',')) {
        const [start, end] = range.split(':').map((part) => (part === '*' ? max : Number(part)));

        for (let uid = Math.min(start!, end ?? start!); uid <= Math.max(start!, end ?? start!); uid++) {
            uids.add(uid);
        }
    }

    return uids;
}

/** The fetch items that set \Seen: BODY[...], BINARY[...], RFC822 and RFC822.TEXT. */
const SEEN_ITEMS = /(^|[\s(])(BODY\[|BINARY\[|RFC822(\.TEXT)?(?=[\s)]|$))/i;

/** `UID STORE <set> [+-]FLAGS[.SILENT] (...)`: applies \Seen to the messages, as a real server does. */
function store(folder: FakeFolder, command: string): void {
    const match = /UID STORE (\S+) ([+-]?)FLAGS(?:\.SILENT)? \(([^)]*)\)/i.exec(command);

    if (!match) {
        return;
    }

    const messages = folder.messages ?? [];
    const uids = uidSet(match[1]!, Math.max(0, ...messages.map((message) => message.uid)));
    const seen = /\\Seen/i.test(match[3]!);

    for (const message of messages) {
        if (!uids.has(message.uid)) {
            continue;
        }

        if (match[2] === '-') {
            message.seen = message.seen && !seen;
        } else if (match[2] === '+') {
            message.seen = message.seen || seen;
        } else {
            message.seen = seen;
        }
    }
}

function fetchResponse(folder: FakeFolder, command: string, gmail: boolean): string[] {
    const match = /UID FETCH (\S+) \((.*)\)$/i.exec(command);

    if (!match) {
        return [];
    }

    const messages = folder.messages ?? [];
    const uids = uidSet(match[1]!, Math.max(0, ...messages.map((message) => message.uid)));
    const items = match[2]!;
    const lines: string[] = [];
    // a fetch of a body section that is not BODY.PEEK sets \Seen, as a real server does (RFC 3501 6.4.5)
    const marks = SEEN_ITEMS.test(items);

    messages.forEach((message, index) => {
        if (!uids.has(message.uid)) {
            return;
        }

        if (marks) {
            message.seen = true;
        }

        const built = build(message);
        const parts = [`UID ${message.uid}`];

        if (/\bFLAGS\b/.test(items)) {
            parts.push(`FLAGS (${message.seen ? '\\Seen' : ''})`);
        }

        if (/\bRFC822\.SIZE\b/.test(items)) {
            parts.push(`RFC822.SIZE ${message.size ?? Buffer.byteLength(built.raw)}`);
        }

        if (/\bINTERNALDATE\b/.test(items)) {
            parts.push(`INTERNALDATE ${quote(internalDate(dateOf(message)))}`);
        }

        if (gmail && /\bX-GM-MSGID\b/.test(items)) {
            parts.push(`X-GM-MSGID ${1000 + message.uid}`);
        }

        if (gmail && /\bX-GM-THRID\b/.test(items)) {
            parts.push(`X-GM-THRID ${message.threadId ?? 2000 + message.uid}`);
        }

        if (/\bENVELOPE\b/.test(items)) {
            parts.push(`ENVELOPE ${envelope(message)}`);
        }

        if (/\bBODYSTRUCTURE\b/.test(items)) {
            parts.push(`BODYSTRUCTURE ${bodyStructure(built)}`);
        }

        for (const peek of items.matchAll(/BODY\.PEEK\[([^\]]*)\](?:<(\d+)\.(\d+)>)?/g)) {
            let value = section(built, peek[1]!);
            let key = `BODY[${peek[1]}]`;

            if (peek[2] !== undefined) {
                value = value.slice(Number(peek[2]), Number(peek[2]) + Number(peek[3]));
                key += `<${peek[2]}>`;
            }

            parts.push(`${key} ${literal(value)}`);
        }

        lines.push(`* ${index + 1} FETCH (${parts.join(' ')})`);
    });

    return lines;
}

function unquote(value: string): string {
    const trimmed = value.trim();

    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1).replace(/\\(["\\])/g, '$1');
    }

    return trimmed;
}

/** An in-process IMAP server on 127.0.0.1 answering the commands imapflow sends; records every command line. */
export async function createFakeImap(options: FakeImapOptions): Promise<FakeImap> {
    const capabilities = `IMAP4rev1 NAMESPACE SPECIAL-USE${options.gmail ? ' X-GM-EXT-1' : ''}`;
    const commands: string[] = [];
    const sockets = new Set<net.Socket>();
    let closed = 0;

    const server = net.createServer((socket) => {
        sockets.add(socket);
        socket.on('close', () => {
            sockets.delete(socket);
            closed++;
        });
        socket.on('error', () => undefined);

        let selected: FakeFolder | undefined;
        let buffer = '';
        const write = (value: string) => {
            if (!socket.destroyed) {
                socket.write(value);
            }
        };

        write(`* OK [CAPABILITY ${capabilities}] ready\r\n`);

        socket.on('data', (data) => {
            buffer += data.toString('utf8');

            let index = buffer.indexOf('\r\n');

            while (index !== -1) {
                const line = buffer.slice(0, index);

                buffer = buffer.slice(index + 2);
                index = buffer.indexOf('\r\n');
                commands.push(line);

                if (options.hold?.test(line)) {
                    continue;
                }

                const [tag, first = '', second = ''] = line.split(' ');
                const name = first.toUpperCase() === 'UID' ? `UID ${second.toUpperCase()}` : first.toUpperCase();
                const rest = line.slice(tag!.length + 1 + name.length + 1);
                const ok = () => write(`${tag} OK done\r\n`);

                switch (name) {
                    case 'CAPABILITY':
                        write(`* CAPABILITY ${capabilities}\r\n`);
                        ok();

                        break;
                    case 'LOGIN':
                        if (options.loginFails) {
                            write(`${tag} NO [AUTHENTICATIONFAILED] server says: wrong secret-server-text\r\n`);
                        } else {
                            ok();
                        }

                        break;
                    case 'NAMESPACE':
                        write('* NAMESPACE (("" "/")) NIL NIL\r\n');
                        ok();

                        break;
                    case 'LIST':
                        for (const folder of options.folders) {
                            write(`* LIST (${['\\HasNoChildren', ...(folder.flags ?? [])].join(' ')}) "/" ${quote(folder.path)}\r\n`);
                        }

                        ok();

                        break;
                    case 'LSUB':
                        ok();

                        break;
                    case 'EXAMINE':
                    case 'SELECT': {
                        const path = unquote(rest);
                        const folder = options.folders.find((entry) => entry.path === path);

                        if (!folder) {
                            write(`${tag} NO no such mailbox\r\n`);

                            break;
                        }

                        selected = folder;
                        write(`* ${folder.messages?.length ?? 0} EXISTS\r\n* 0 RECENT\r\n* FLAGS (\\Seen)\r\n` +
                            `* OK [UIDVALIDITY ${folder.uidValidity ?? 42}] u\r\n` +
                            `* OK [UIDNEXT ${Math.max(0, ...(folder.messages ?? []).map((message) => message.uid)) + 1}] n\r\n`);
                        write(`${tag} OK [READ-ONLY] done\r\n`);

                        break;
                    }
                    case 'UID SEARCH':
                    case 'SEARCH': {
                        const messages = selected?.messages ?? [];
                        const thread = /X-GM-THRID (\d+)/.exec(line);
                        let uids = selected ? options.search?.(selected.path, line) : undefined;

                        if (!uids && thread) {
                            uids = messages.filter((message) => (message.threadId ?? String(2000 + message.uid)) === thread[1])
                                .map((message) => message.uid);
                        }

                        uids ??= messages.map((message) => message.uid);
                        write(`* SEARCH${uids.map((uid) => ` ${uid}`).join('')}\r\n`);
                        ok();

                        break;
                    }
                    case 'UID FETCH':
                        if (selected) {
                            for (const response of fetchResponse(selected, line, !!options.gmail)) {
                                write(`${response}\r\n`);
                            }
                        }

                        ok();

                        break;
                    case 'UID STORE':
                        if (selected) {
                            store(selected, line);
                        }

                        ok();

                        break;
                    case 'NOOP':
                    case 'CLOSE':
                    case 'UNSELECT':
                        ok();

                        break;
                    case 'LOGOUT':
                        write('* BYE bye\r\n');
                        ok();
                        socket.end();

                        break;
                    default:
                        write(`${tag} BAD unknown command\r\n`);
                }
            }
        });
    });

    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });

    return {
        port: (server.address() as AddressInfo).port,
        commands,
        closed: () => closed,
        close: async () => {
            for (const socket of sockets) {
                socket.destroy();
            }

            await new Promise<void>((resolve) => {
                server.close(() => resolve());
            });
        },
    };
}
