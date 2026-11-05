/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MessageStructureObject } from 'imapflow';
import type { StructureAttachment } from './types.ts';

function leavesOf(node: MessageStructureObject): MessageStructureObject[] {
    if (node.type.startsWith('multipart/') && node.childNodes) {
        return node.childNodes.flatMap(leavesOf);
    }

    // a message/rfc822 part is one attachment, its inner parts are not walked
    return [node];
}

export function filenameOf(node: MessageStructureObject): string | null {
    return node.dispositionParameters?.filename ?? node.parameters?.name ?? null;
}

function isBodyText(node: MessageStructureObject): boolean {
    return (node.type === 'text/plain' || node.type === 'text/html') &&
        node.disposition !== 'attachment' &&
        filenameOf(node) === null;
}

/** The IMAP section of a part: a single-part mail's body is section 1. */
export function sectionOf(node: MessageStructureObject): string {
    return node.part ?? '1';
}

/** The first text part of the body (plain before html), for snippets. */
export function textPartOf(root: MessageStructureObject): MessageStructureObject | undefined {
    const texts = leavesOf(root).filter(isBodyText);

    return texts.find((node) => node.type === 'text/plain') ?? texts[0];
}

/** Every part that is not body text, in order; `index` is the position in this list. */
export function attachmentsOf(root: MessageStructureObject | undefined): StructureAttachment[] {
    if (!root) {
        return [];
    }

    return leavesOf(root)
        .filter((node) => !isBodyText(node))
        .map((node, index) => ({
            node,
            info: {
                index,
                filename: filenameOf(node),
                mediaType: node.type,
                size: node.encoding === 'base64' ? Math.floor((node.size ?? 0) * 3 / 4) : node.size ?? 0,
            },
        }));
}

function decodeQuotedPrintable(data: Uint8Array): Uint8Array {
    const text = Buffer.from(data).toString('latin1').replace(/=\r?\n/g, '');
    const bytes: number[] = [];

    for (let index = 0; index < text.length; index++) {
        const hex = text.slice(index + 1, index + 3);

        if (text[index] === '=' && /^[\dA-Fa-f]{2}$/.test(hex)) {
            bytes.push(Number.parseInt(hex, 16));
            index += 2;
        } else {
            bytes.push(text.charCodeAt(index) & 0xFF);
        }
    }

    return Uint8Array.from(bytes);
}

/** The bytes of a part with its Content-Transfer-Encoding removed. */
export function decodeTransfer(data: Uint8Array, encoding: string | undefined): Uint8Array {
    if (encoding === 'base64') {
        return new Uint8Array(Buffer.from(Buffer.from(data).toString('latin1'), 'base64'));
    }

    if (encoding === 'quoted-printable') {
        return decodeQuotedPrintable(data);
    }

    return data;
}

/** A text part's bytes as a string in its charset (UTF-8 for an unknown one). */
export function decodeText(data: Uint8Array, node: MessageStructureObject): string {
    const bytes = decodeTransfer(data, node.encoding);

    try {
        return new TextDecoder(node.parameters?.charset ?? 'utf-8').decode(bytes);
    } catch {
        return new TextDecoder().decode(bytes);
    }
}
