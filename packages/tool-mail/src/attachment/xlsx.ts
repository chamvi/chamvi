/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { stripHtml } from '../text/module.ts';

/** A tag `<name` followed by whitespace, `>` or `/` (so `<c` does not match `<col`). */
function openTag(xml: string, name: string, from: number, until: number): number {
    for (let start = xml.indexOf(`<${name}`, from); start !== -1 && start < until; start = xml.indexOf(`<${name}`, start + 1)) {
        const next = xml.charAt(start + name.length + 1);

        if (next === '>' || next === '/' || next === ' ' || next === '\t' || next === '\n' || next === '\r') {
            return start;
        }
    }

    return -1;
}

type Element = {
    attributes: string;
    content: string;
    end: number
};

/**
 * The elements `name` in `xml[from, until)`, scanned with `indexOf` only (linear in the input: the XML is untrusted).
 * A self-closing element has empty content; an unterminated one runs to `until`.
 */
function* elements(xml: string, name: string, from: number, until: number): Generator<Element> {
    let position = from;

    for (;;) {
        const start = openTag(xml, name, position, until);

        if (start === -1) {
            return;
        }

        const close = xml.indexOf('>', start);

        if (close === -1 || close >= until) {
            return;
        }

        const attributes = xml.slice(start + name.length + 1, close);

        if (attributes.endsWith('/')) {
            position = close + 1;
            yield {
                attributes,
                content: '',
                end: position,
            };

            continue;
        }

        const endTag = xml.indexOf(`</${name}>`, close);
        const end = endTag === -1 || endTag >= until ? until : endTag;

        position = end === until ? until : end + name.length + 3;
        yield {
            attributes,
            content: xml.slice(close + 1, end),
            end: position,
        };
    }
}

/** The text inside the first `<name>` of `xml`, `undefined` without one. */
function inner(xml: string, name: string): string | undefined {
    const first = elements(xml, name, 0, xml.length).next();

    return first.done ? undefined : first.value.content;
}

/** The value of attribute `t` (the cell type), `''` without one. */
function cellType(attributes: string): string {
    return /\bt="([^"]*)"/.exec(attributes)?.[1] ?? '';
}

/** The strings of `xl/sharedStrings.xml`, by index (rich text runs joined). */
export function sharedStrings(xml: string): string[] {
    return Array.from(elements(xml, 'si', 0, xml.length), (item) => stripHtml(item.content));
}

/** One cell's text: a shared string by index, an inline string, a boolean, else the value as written. */
function cellText(cell: Element, strings: readonly string[]): string {
    const type = cellType(cell.attributes);

    if (type === 'inlineStr') {
        return stripHtml(inner(cell.content, 'is') ?? '');
    }

    const value = inner(cell.content, 'v');

    if (value === undefined) {
        return '';
    }

    if (type === 's') {
        return strings[Number(value.trim())] ?? '';
    }

    if (type === 'b') {
        return value.trim() === '1' ? 'TRUE' : 'FALSE';
    }

    return stripHtml(value);
}

/** A worksheet as text: one line per row, cells separated by a tab. */
export function sheetText(xml: string, strings: readonly string[]): string {
    const rows: string[] = [];

    for (const row of elements(xml, 'row', 0, xml.length)) {
        rows.push(Array.from(elements(row.content, 'c', 0, row.content.length), (cell) => cellText(cell, strings)).join('\t'));
    }

    return rows.join('\n');
}
