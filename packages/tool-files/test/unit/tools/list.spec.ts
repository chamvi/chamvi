/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { ValidationError, createMemoryStore } from '@chamvi/core';
import { fileTools } from '@chamvi/tool-files';
import { listTool, toolContext } from '../../utils/context.ts';

describe('list_artifacts', () => {
    it('pages only the current run metadata, never loading file bytes', async () => {
        const store = createMemoryStore();
        const ctx = toolContext('catalog', undefined, store);

        await toolContext('foreign', undefined, store).artifacts.put({ mediaType: 'text/plain', data: new Uint8Array([99]) });

        for (let i = 0; i < 17; i++) {
            await ctx.artifacts.put({
                key: `file-${i}`,
                filename: `file-${i}`,
                mediaType: 'text/plain',
                data: new Uint8Array([i]),
            });
        }

        const read = vi.spyOn(store.artifacts, 'read');
        const first = await listTool(fileTools(), {}, ctx);

        expect(first.artifacts).toHaveLength(16);
        expect(first.artifacts.every((item) => item.runId === 'catalog' && item.size === 1)).toBe(true);
        expect(first.nextOffset).toBe(16);

        const last = await listTool(fileTools(), { offset: first.nextOffset }, ctx);

        expect(last.artifacts).toHaveLength(1);
        expect(last.nextOffset).toBeUndefined();
        expect(new Set([...first.artifacts, ...last.artifacts].map((item) => item.id)).size).toBe(17);
        expect(read).not.toHaveBeenCalled();
        expect(await listTool(fileTools(), { offset: 99 }, ctx)).toEqual({ artifacts: [] });
    });

    it('returns an empty catalog with no cursor', async () => {
        expect(await listTool(fileTools(), {}, toolContext('empty'))).toEqual({ artifacts: [] });
    });

    it.each([null, [], { offset: -1 }, { offset: 1.5 }, { offset: NaN }, { offset: '0' }, { offset: Number.MAX_SAFE_INTEGER + 1 }])('validates offsets before access: %j', async (input) => {
        const ctx = toolContext('invalid');
        const list = vi.spyOn(ctx.artifacts, 'list');

        await expect(listTool(fileTools(), input, ctx)).rejects.toThrow(ValidationError);
        expect(list).not.toHaveBeenCalled();
    });

    it('propagates cancellation after an abort-ignoring store read', async () => {
        const controller = new AbortController();
        const reason = new Error('cancelled');
        const ctx = toolContext('cancel', controller.signal);

        vi.spyOn(ctx.artifacts, 'list').mockImplementation(async () => {
            controller.abort(reason);

            return [];
        });
        await expect(listTool(fileTools(), {}, ctx)).rejects.toBe(reason);
    });
});

it('preserves the run cancellation reason on a rejected catalog read', async () => {
    const controller = new AbortController();
    const reason = new Error('run cancelled');
    const ctx = toolContext('abort-error', controller.signal);

    vi.spyOn(ctx.artifacts, 'list').mockImplementation(async () => {
        controller.abort(reason);

        throw new Error('store read aborted');
    });
    await expect(listTool(fileTools(), {}, ctx)).rejects.toBe(reason);
});
