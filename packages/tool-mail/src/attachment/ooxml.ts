/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { FlateError, UnzipDecoder } from 'fflate';
import {
    Inflate,
    Unzip,
    strFromU8,
    unzipSync,
} from 'fflate';
import {
    MAIL_ATTACHMENT_MAX_CHARS,
    MAIL_OOXML_MAX_SLIDES,
    MAIL_ZIP_PART_MAX_BYTES,
    MAIL_ZIP_TOTAL_MAX_BYTES,
} from '../text/constants.ts';
import { stripHtml } from '../text/module.ts';
import { OOXML_TEXT_PARTS } from './constants.ts';

/** Compressed bytes inflated per step: a step writes at most ~1 MiB (the deflate ratio limit) past a part's budget. */
const INFLATE_STEP_BYTES = 1024;

/** Text collected from the parts at most; the parts after it are not inflated. */
const OOXML_TEXT_MAX_CHARS = MAIL_ATTACHMENT_MAX_CHARS * 5;

/** Hands the raw deflate data of a part through, so `extractOoxmlText()` inflates it in bounded steps. */
class RawDeflate implements UnzipDecoder {
    static compression = 8;

    ondata!: UnzipDecoder['ondata'];

    push(chunk: Uint8Array<ArrayBuffer>, final: boolean): void {
        this.ondata(null, chunk, final);
    }
}

function slideNumber(name: string): number {
    const match = /(\d+)\.xml$/.exec(name);

    return match ? Number(match[1]) : 0;
}

/**
 * The parts to read and their declared sizes, from the central directory (nothing is inflated; a buffer that is
 * no zip throws): text parts declaring at most `MAIL_ZIP_PART_MAX_BYTES`, at most `MAIL_OOXML_MAX_SLIDES` slides,
 * while the declared sizes add up to at most `MAIL_ZIP_TOTAL_MAX_BYTES`.
 */
function selectParts(data: Uint8Array): Map<string, number> {
    const selected = new Map<string, number>();
    let total = 0;
    let slides = 0;

    unzipSync(data, {
        filter: (file) => {
            if (
                !OOXML_TEXT_PARTS.test(file.name) ||
                selected.has(file.name) ||
                file.originalSize > MAIL_ZIP_PART_MAX_BYTES ||
                total + file.originalSize > MAIL_ZIP_TOTAL_MAX_BYTES
            ) {
                return false;
            }

            if (file.name.startsWith('ppt/')) {
                if (slides >= MAIL_OOXML_MAX_SLIDES) {
                    return false;
                }

                slides++;
            }

            total += file.originalSize;
            selected.set(file.name, file.originalSize);

            return false;
        },
    });

    return selected;
}

function concat(chunks: Uint8Array[], size: number): Uint8Array {
    const joined = new Uint8Array(size);
    let offset = 0;

    for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.length;
    }

    return joined;
}

/**
 * The text of a docx, xlsx or pptx. Only the parts `selectParts()` picks are read, each inflated in small steps
 * that stop once the part reaches its declared size: a part whose headers lie about its size costs neither memory
 * nor time, and the bytes actually inflated stay within `MAIL_ZIP_TOTAL_MAX_BYTES`. Parts are read until the text
 * passes `OOXML_TEXT_MAX_CHARS`.
 */
export function extractOoxmlText(data: Uint8Array): string {
    const selected = selectParts(data);
    const texts = new Map<string, string>();
    let remaining = MAIL_ZIP_TOTAL_MAX_BYTES;
    let chars = 0;

    const unzip = new Unzip((file) => {
        const declared = selected.get(file.name);

        if (
            declared === undefined ||
            (file.compression !== 0 && file.compression !== 8) ||
            chars > OOXML_TEXT_MAX_CHARS ||
            remaining <= 0
        ) {
            return;
        }

        selected.delete(file.name);

        const budget = Math.min(declared, remaining);
        const chunks: Uint8Array[] = [];
        let size = 0;
        let done = false;

        const take = (chunk: Uint8Array, final: boolean) => {
            if (done) {
                return;
            }

            const kept = chunk.subarray(0, budget - size);

            chunks.push(kept);
            size += kept.length;

            if (!final && size < budget) {
                return;
            }

            done = true;
            remaining -= size;

            const text = stripHtml(strFromU8(concat(chunks, size)));

            chars += text.length;
            texts.set(file.name, text);
        };

        if (file.compression === 0) {
            file.ondata = (error: FlateError | null, chunk: Uint8Array, final: boolean) => {
                if (error) {
                    throw error;
                }

                take(chunk, final);
            };
        } else {
            const inflate = new Inflate((chunk, final) => take(chunk, final));

            file.ondata = (error: FlateError | null, chunk: Uint8Array, final: boolean) => {
                if (error) {
                    throw error;
                }

                for (let start = 0; start < chunk.length && !done; start += INFLATE_STEP_BYTES) {
                    const end = start + INFLATE_STEP_BYTES;

                    inflate.push(chunk.subarray(start, end), final && end >= chunk.length);
                }

                if (final && chunk.length === 0 && !done) {
                    inflate.push(chunk, true);
                }

                // a stream that ended early (or an empty last chunk) still gives its part
                if (final) {
                    take(new Uint8Array(0), true);
                }
            };
        }

        file.start();
    });

    unzip.register(RawDeflate);
    unzip.push(data, true);

    return texts.keys().toArray()
        .sort((a, b) => slideNumber(a) - slideNumber(b) || a.localeCompare(b))
        .map((name) => texts.get(name)!)
        .join('\n');
}
