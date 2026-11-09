/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { hostname } from 'node:os';
import { BufferJSON } from 'baileys';
import { KEY_ENTRY_PREFIX } from './constants.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A Baileys value as UTF-8 JSON (Buffers through BufferJSON, as Baileys' own file store writes them). */
export function encodeValue(value: unknown): Uint8Array {
    return encoder.encode(JSON.stringify(value, BufferJSON.replacer));
}

export function decodeValue<T>(bytes: Uint8Array): T {
    return JSON.parse(decoder.decode(bytes), BufferJSON.reviver) as T;
}

/** The entry of one signal key. */
export function keyEntryOf(type: string, id: string): string {
    return `${KEY_ENTRY_PREFIX}${type}:${id}`;
}

/** The engine's owner format. */
export function defaultOwner(): string {
    return `${hostname()}-${process.pid}`;
}
