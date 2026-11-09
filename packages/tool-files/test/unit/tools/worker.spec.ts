/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { ToolContext } from '@chamvi/core';
import { fileTools } from '@chamvi/tool-files';
import { callTool, toolContext } from '../../utils/context.ts';

function differingLines(prefix: string, bytes: number): string {
    const lines: string[] = [];

    for (let size = 0, index = 0; size < bytes; index++) {
        const line = `${prefix}${index}_${(index * 2_654_435_761).toString(36)}`;

        lines.push(line);
        size += line.length + 1;
    }

    return `${lines.join('\n')}\n`;
}

async function select(ctx: ToolContext, files: Record<string, string>) {
    const encoder = new TextEncoder();
    const inputs = [];

    for (const [path, text] of Object.entries(files)) {
        const artifact = await ctx.artifacts.put({ mediaType: 'text/plain', data: encoder.encode(text) });

        inputs.push({ artifactId: artifact.id, path });
    }

    return inputs;
}

/** The longest pause of the host event loop while `work` runs. */
async function withLongestStall<T>(work: () => Promise<T>): Promise<{ result: T; stall: number }> {
    let last = performance.now();
    let stall = 0;
    const timer = setInterval(() => {
        const now = performance.now();

        stall = Math.max(stall, now - last);
        last = now;
    }, 10);

    try {
        const result = await work();

        stall = Math.max(stall, performance.now() - last);

        return { result, stall };
    } finally {
        clearInterval(timer);
    }
}

const STALLING = { a: differingLines('a', 200_000), b: differingLines('b', 200_000) };

describe('interpreter isolation', () => {
    it('keeps the host event loop responsive and ends a command that ignores its deadline', async () => {
        const ctx = toolContext('stuck');
        const inputs = await select(ctx, STALLING);
        const started = performance.now();
        const { result, stall } = await withLongestStall(() => callTool(fileTools({ timeoutMs: 100 }), { command: 'diff a b', inputs }, ctx));

        expect(stall).toBeLessThan(1000);
        expect(performance.now() - started).toBeLessThan(5000);
        expect(result.exitCode).toBe(124);
        expect(result.stderr).toMatch(/deadline/);
        expect(result.artifacts).toEqual([]);
    });

    it('ends a stuck command as soon as the run is cancelled', async () => {
        const controller = new AbortController();
        const reason = new Error('cancelled while stuck');
        const ctx = toolContext('stuck-cancel', controller.signal);
        const inputs = await select(ctx, STALLING);
        const started = performance.now();
        const timer = setTimeout(() => controller.abort(reason), 100);

        await expect(callTool(fileTools(), { command: 'diff a b', inputs }, ctx)).rejects.toBe(reason);
        clearTimeout(timer);
        expect(performance.now() - started).toBeLessThan(2000);
    });

    it('reports heap exhaustion as a failed command instead of taking the host down', async () => {
        const ctx = toolContext('heap');
        const inputs = await select(ctx, { list: '- a\n'.repeat(1_300_000) });
        const result = await callTool(fileTools(), { command: 'yq -o json . list', inputs }, ctx);

        expect(result.exitCode).toBe(137);
        expect(result.stderr).toMatch(/memory/);
    });
});

describe('record budgets', () => {
    const json = JSON.stringify(Array.from({ length: 20_000 }, (_, id) => ({
        id,
        group: id % 10,
        value: id % 100,
    })));
    const jsonLines = Array.from({ length: 20_000 }, (_, id) => JSON.stringify({ id, value: id % 100 })).join('\n');
    const csv = (rows: number) => `name,value\n${Array.from({ length: rows }, (_, id) => `row${id},${id % 100}`).join('\n')}\n`;

    it.each([
        ['jq filter', 'jq "map(select(.value > 10)) | length" in', json, '17800'],
        ['jq group', 'jq "group_by(.group) | length" in', json, '10'],
        ['jq lines', 'jq -c "select(.value > 10)" in | wc -l', jsonLines, '17800'],
        ['jq raw lines', 'jq -R . in | wc -l', jsonLines, '20000'],
        ['awk', 'awk -F, \'NR>1{s+=$2} END{print s}\' in', csv(20_000), '990000'],
        ['cut', 'cut -d, -f1 in | wc -l', csv(20_000), '20001'],
        ['shell loop', 'n=0; while read -r line; do n=$((n+1)); done < in; echo $n', csv(20_000), '20001'],
        ['xan beyond 100k rows', 'xan count in', csv(150_000), '150000'],
        ['awk beyond 100k rows', 'awk -F, \'NR>1{n++} END{print n}\' in', csv(150_000), '150000'],
    ])('processes realistic data below the byte limit: %s', async (_, command, text, expected) => {
        const ctx = toolContext('records');
        const inputs = await select(ctx, { in: text });
        const result = await callTool(fileTools(), { command, inputs }, ctx);

        expect(result.stderr).toBe('');
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe(expected);
    });

    it('reports a document whose formatted form outgrows the filesystem as a failed command', async () => {
        const ctx = toolContext('pretty');
        const rows = [];

        for (let id = 0, size = 0; size < 5_200_000; id++) {
            const row = JSON.stringify({
                id,
                group: id % 10,
                name: `row${id}`,
            });

            rows.push(row);
            size += row.length + 1;
        }

        const inputs = await select(ctx, { in: `[${rows.join(',')}]` });
        const result = await callTool(fileTools(), { command: 'jq . in > out; wc -c out', inputs }, ctx);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(/filesystem byte limit/);
    });

    it('still stops a runaway loop within its budget', async () => {
        const result = await callTool(fileTools({ timeoutMs: 500 }), { command: 'while :; do :; done' }, toolContext('runaway'));

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toMatch(/too many commands|deadline/);
    });
});
