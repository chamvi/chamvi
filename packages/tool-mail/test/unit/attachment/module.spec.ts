/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Buffer } from 'node:buffer';
import zlib from 'node:zlib';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { EXTRACTION_FAILED_TEXT } from '../../../src/attachment/constants.ts';
import { extractAttachmentText } from '../../../src/attachment/module.ts';
import {
    MAIL_ATTACHMENT_MAX_CHARS,
    MAIL_OOXML_MAX_SLIDES,
    MAIL_XLSX_MAX_COLUMNS,
    MAIL_ZIP_PART_MAX_BYTES,
    MAIL_ZIP_TOTAL_MAX_BYTES,
} from '../../../src/text/constants.ts';
import { createPdf } from '../../utils/pdf.ts';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function setCentralSize(zip: Uint8Array, name: string, size: number): Uint8Array {
    const out = zip.slice();
    const view = new DataView(out.buffer);
    const encoded = strToU8(name);

    for (let i = 0; i < out.length - 46; i++) {
        if (view.getUint32(i, true) !== 0x02014B50) {
            continue;
        }

        const nameLength = view.getUint16(i + 28, true);
        const entry = out.subarray(i + 46, i + 46 + nameLength);
        const matches = nameLength === encoded.length && entry.every((byte, index) => byte === encoded[index]);

        if (matches) {
            view.setUint32(i + 24, size, true);

            return out;
        }
    }

    throw new Error(`no central entry for ${name}`);
}

type RawEntry = {
    name: string;
    /** The stored bytes: raw deflate data for method 8. */
    data: Uint8Array;
    method: 0 | 8;
    /** The uncompressed size both headers declare. */
    declared: number;
};

/** A zip written by hand, so the headers can declare any size (the CRC is not checked by fflate). */
function rawZip(entries: RawEntry[]): Uint8Array {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
        const name = Buffer.from(entry.name);
        const local = Buffer.alloc(30);

        local.writeUInt32LE(0x04034B50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(entry.method, 8);
        local.writeUInt32LE(entry.data.length, 18);
        local.writeUInt32LE(entry.declared, 22);
        local.writeUInt16LE(name.length, 26);

        const central = Buffer.alloc(46);

        central.writeUInt32LE(0x02014B50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(entry.method, 10);
        central.writeUInt32LE(entry.data.length, 20);
        central.writeUInt32LE(entry.declared, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(offset, 42);

        locals.push(local, name, Buffer.from(entry.data));
        centrals.push(central, name);
        offset += 30 + name.length + entry.data.length;
    }

    const directory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);

    end.writeUInt32LE(0x06054B50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);

    return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

/** Raw deflate data of `mib` MiB of zeros, streamed through zlib so the input is never allocated whole. */
async function deflatedZeros(mib: number): Promise<Uint8Array> {
    const deflate = zlib.createDeflateRaw({ level: 9 });
    const chunks: Buffer[] = [];
    const zero = Buffer.alloc(1024 * 1024);

    deflate.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
    });

    const ended = new Promise((resolve) => {
        deflate.on('end', resolve);
    });

    for (let i = 0; i < mib; i++) {
        deflate.write(zero);
    }

    deflate.end();
    await ended;

    return new Uint8Array(Buffer.concat(chunks));
}

describe('extractAttachmentText', () => {
    it('decodes text attachments by media type or file name', async () => {
        const data = strToU8('line one\r\nline two');

        expect(await extractAttachmentText(data, 'text/plain', 'notes.txt')).toBe('line one\r\nline two');
        expect(await extractAttachmentText(data, 'application/octet-stream', 'DATA.CSV')).toBe('line one\r\nline two');
        expect(await extractAttachmentText(data, 'application/octet-stream', 'readme.md')).toBe('line one\r\nline two');
    });

    it('decodes only the first bytes of a large text attachment', async () => {
        const data = strToU8('x'.repeat(MAIL_ATTACHMENT_MAX_CHARS * 10));
        const text = await extractAttachmentText(data, 'text/plain', null);

        expect(text).toHaveLength(MAIL_ATTACHMENT_MAX_CHARS * 4);
    });

    it('returns nothing for calendar data and unknown types', async () => {
        const data = strToU8('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');

        expect(await extractAttachmentText(data, 'text/calendar', null)).toBe('');
        expect(await extractAttachmentText(data, 'application/octet-stream', 'invite.ics')).toBe('');
        expect(await extractAttachmentText(strToU8('MZ'), 'application/octet-stream', 'tool.exe')).toBe('');
        expect(await extractAttachmentText(strToU8('MZ'), 'image/png', null)).toBe('');
    });

    it('reads xlsx cells row by row: shared and inline strings, numbers and booleans', async () => {
        const xlsx = zipSync({
            'xl/sharedStrings.xml': strToU8('<sst><si><t>Name</t></si><si><r><t>Tom </t></r><r><t>&amp; Jerry</t></r></si></sst>'),
            'xl/worksheets/sheet1.xml': strToU8([
                '<worksheet><cols><col min="1" max="2"/></cols><sheetData>',
                '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Amount</t></is></c></row>',
                '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>42.5</v></c><c r="C2" t="b"><v>1</v></c><c r="D2"/></row>',
                '</sheetData></worksheet>',
            ].join('')),
            'xl/worksheets/sheet2.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="str"><f>A1</f><v>formula</v></c></row></sheetData></worksheet>'),
        });

        expect(await extractAttachmentText(xlsx, XLSX, null)).toBe('Name\tAmount\nTom & Jerry\t42.5\tTRUE\t\n\nformula');
    });

    it('reads hostile worksheet xml in linear time', async () => {
        const xlsx = zipSync({ 'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>${  '<row><c t="s"><v>9'.repeat(200_000)}`) });
        const start = performance.now();
        const text = await extractAttachmentText(xlsx, XLSX, null);

        expect(performance.now() - start).toBeLessThan(2000);
        expect(typeof text).toBe('string');
    });

    it('keeps omitted xlsx cells as empty columns, within a column cap', async () => {
        const xlsx = zipSync({
            'xl/worksheets/sheet1.xml': strToU8([
                '<worksheet><sheetData>',
                '<row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Price</t></is></c>',
                '<c r="C1" t="inlineStr"><is><t>Quantity</t></is></c></row>',
                '<row r="2"><c r="A2" t="inlineStr"><is><t>Widget</t></is></c><c r="C2"><v>7</v></c></row>',
                '<row r="3"><c r="B3"><v>1</v></c><c r="XFD3"><v>2</v></c></row>',
                '</sheetData></worksheet>',
            ].join('')),
        });
        const lines = (await extractAttachmentText(xlsx, XLSX, null)).split('\n');

        expect(lines[0]).toBe('Name\tPrice\tQuantity');
        expect(lines[1]).toBe('Widget\t\t7');
        // a column past the cap is appended, not padded
        expect(lines[2]).toBe(`\t1${'\t'.repeat(MAIL_XLSX_MAX_COLUMNS - 2)}\t2`);
    });

    it('reads an xlsx without shared strings', async () => {
        const xlsx = zipSync({ 'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c></row></sheetData></worksheet>') });

        expect(await extractAttachmentText(xlsx, XLSX, null)).toBe('1\t2');
    });

    it('reads the text of a docx, xlsx and pptx', async () => {
        const docx = zipSync({
            '[Content_Types].xml': strToU8('<Types/>'),
            'word/document.xml': strToU8('<w:document><w:body><w:p><w:r><w:t>Hello docx</w:t></w:r></w:p></w:body></w:document>'),
            'word/styles.xml': strToU8('<w:styles>style noise</w:styles>'),
        });

        expect(await extractAttachmentText(docx, DOCX, 'a.docx')).toBe('Hello docx');

        const xlsx = zipSync({
            'xl/sharedStrings.xml': strToU8('<sst><si><t>Cell one</t></si></sst>'),
            'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>'),
        });

        expect(await extractAttachmentText(xlsx, 'application/octet-stream', 'b.XLSX')).toBe('Cell one');
        expect(await extractAttachmentText(xlsx, XLSX, null)).toBe('Cell one');

        const pptx = zipSync({
            'ppt/slides/slide10.xml': strToU8('<p:sld><a:t>Ten</a:t></p:sld>'),
            'ppt/slides/slide2.xml': strToU8('<p:sld><a:t>Two</a:t></p:sld>'),
            'ppt/slides/slide1.xml': strToU8('<p:sld><a:t>One</a:t></p:sld>'),
            'ppt/notesSlides/notesSlide1.xml': strToU8('<p:notes>notes noise</p:notes>'),
        });

        expect(await extractAttachmentText(pptx, PPTX, null)).toBe('One\nTwo\nTen');
    });

    it('skips an OOXML part that declares more than the part cap', async () => {
        const zip = zipSync({ 'word/document.xml': [new Uint8Array(20 * 1024 * 1024).fill(0x61), { level: 1 }] });

        expect(MAIL_ZIP_PART_MAX_BYTES).toBeLessThan(20 * 1024 * 1024);
        expect(await extractAttachmentText(zip, DOCX, 'big.docx')).toBe('');
    });

    it('bounds a part whose directory lies about its size', async () => {
        const zip = zipSync({ 'word/document.xml': [new Uint8Array(1024 * 1024).fill(0x61), { level: 1 }] });
        const lying = setCentralSize(zip, 'word/document.xml', 10);
        const text = await extractAttachmentText(lying, DOCX, 'lying.docx');

        expect(text.length).toBeLessThanOrEqual(10);
    });

    it('stops inflating a part at its declared size, in time and memory', async () => {
        // 512 MiB of zeros in about 500 KB, both headers declaring 10 bytes
        const data = await deflatedZeros(512);
        const zip = rawZip([{
            name: 'word/document.xml',
            data,
            method: 8,
            declared: 10,
        }]);
        const { rss } = process.memoryUsage();
        const started = performance.now();
        const text = await extractAttachmentText(zip, DOCX, 'lying.docx');

        expect(performance.now() - started).toBeLessThan(500);
        expect(process.memoryUsage().rss - rss).toBeLessThan(64 * 1024 * 1024);
        expect(text).toBe('\0'.repeat(10));
    });

    it('bounds the slides of a pptx by count and by the total size', async () => {
        const slide = (n: number, padding = 0) => strToU8(`<p:sld><a:t>S${n}</a:t>${' '.repeat(padding)}</p:sld>`);
        const many: Record<string, Uint8Array> = {};

        for (let n = 1; n <= MAIL_OOXML_MAX_SLIDES + 50; n++) {
            many[`ppt/slides/slide${n}.xml`] = slide(n);
        }

        const counted = await extractAttachmentText(zipSync(many), PPTX, null);

        expect(counted.split('\n')).toHaveLength(MAIL_OOXML_MAX_SLIDES);
        expect(counted).toContain(`S${MAIL_OOXML_MAX_SLIDES}`);
        expect(counted).not.toContain(`S${MAIL_OOXML_MAX_SLIDES + 1}`);

        const large: Record<string, [Uint8Array, { level: 1 }]> = {};

        for (let n = 1; n <= 30; n++) {
            large[`ppt/slides/slide${n}.xml`] = [slide(n, 1024 * 1024), { level: 1 }];
        }

        const sized = await extractAttachmentText(zipSync(large), PPTX, null);
        const fits = Math.floor(MAIL_ZIP_TOTAL_MAX_BYTES / slide(30, 1024 * 1024).length);

        expect(sized).toContain(`S${fits}`);
        expect(sized).not.toContain(`S${fits + 1}`);
    });

    it('stays bounded for a pptx of many large slides', async () => {
        // 150 slides of 10 MiB zeros each: about 1.5 MB on the wire
        const slide = await deflatedZeros(10);
        const zip = rawZip(Array.from({ length: 150 }, (_, index) => ({
            name: `ppt/slides/slide${index + 1}.xml`,
            data: slide,
            method: 8 as const,
            declared: MAIL_ZIP_PART_MAX_BYTES,
        })));
        const { rss } = process.memoryUsage();
        const started = performance.now();
        const text = await extractAttachmentText(zip, PPTX, null);

        expect(performance.now() - started).toBeLessThan(2000);
        expect(process.memoryUsage().rss - rss).toBeLessThan(400 * 1024 * 1024);
        expect(text.length).toBeLessThanOrEqual(MAIL_ZIP_TOTAL_MAX_BYTES + 150);
    });

    it('reports a failed extraction for a docx that is no zip', async () => {
        expect(await extractAttachmentText(strToU8('not a zip at all'), DOCX, 'broken.docx'))
            .toBe(EXTRACTION_FAILED_TEXT);
        expect(EXTRACTION_FAILED_TEXT).toBe('(text extraction failed)');
    });

    it('reports a failed extraction for a broken PDF', async () => {
        expect(await extractAttachmentText(strToU8('%PDF-1.4\nthis is not a pdf'), 'application/pdf', 'broken.pdf'))
            .toBe(EXTRACTION_FAILED_TEXT);
        expect(await extractAttachmentText(strToU8('garbage'), 'application/octet-stream', 'x.pdf'))
            .toBe(EXTRACTION_FAILED_TEXT);
    });

    it('reads the first 50 pages of a PDF and leaves the input intact', async () => {
        const data = createPdf(60);
        const size = data.byteLength;
        const text = await extractAttachmentText(data, 'application/pdf', 'long.pdf');

        expect(text).toContain('Page 1\n');
        expect(text).toContain('Page 50');
        expect(text).not.toContain('Page 51');
        expect(data.byteLength).toBe(size);
    });

    it('stays bounded for a PDF with 10 000 pages', async () => {
        const started = performance.now();
        const text = await extractAttachmentText(createPdf(10_000), 'application/pdf', 'huge.pdf');

        expect(performance.now() - started).toBeLessThan(10_000);
        expect(text).toContain('Page 50');
        expect(text).not.toContain('Page 51');
    });

    it('reports a failed extraction when the signal is aborted', async () => {
        const controller = new AbortController();

        controller.abort();
        expect(await extractAttachmentText(createPdf(2), 'application/pdf', 'a.pdf', controller.signal))
            .toBe(EXTRACTION_FAILED_TEXT);
        expect(await extractAttachmentText(strToU8('text'), 'text/plain', null, controller.signal))
            .toBe(EXTRACTION_FAILED_TEXT);
    });
});
