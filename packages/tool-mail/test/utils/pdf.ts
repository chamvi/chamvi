/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * A minimal valid PDF with one text line per page (`Page <n>`), with a correct xref table.
 */
export function createPdf(pages: number): Uint8Array {
    const objects: string[] = [];
    const kids: string[] = [];

    // 1: catalog, 2: pages, 3: font, then per page: page and content stream
    for (let i = 0; i < pages; i++) {
        kids.push(`${4 + (i * 2)} 0 R`);
    }

    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages} >>`);
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    for (let i = 0; i < pages; i++) {
        const stream = `BT /F1 12 Tf 72 720 Td (Page ${i + 1}) Tj ET`;

        objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + (i * 2)} 0 R >>`);
        objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    }

    let out = '%PDF-1.4\n';
    const offsets: number[] = [];

    for (const [index, object] of objects.entries()) {
        offsets.push(out.length);
        out += `${index + 1} 0 obj\n${object}\nendobj\n`;
    }

    const xref = out.length;

    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

    for (const offset of offsets) {
        out += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }

    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    return new TextEncoder().encode(out);
}
