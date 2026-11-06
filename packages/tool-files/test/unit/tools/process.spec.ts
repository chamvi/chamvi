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
import { callTool, toolContext } from '../../utils/context.ts';

it('processes JSON into a real run artifact', async () => {
    const ctx = toolContext('run');
    const source = await ctx.artifacts.put({ mediaType: 'application/json', data: new TextEncoder().encode('{"a": 21}') });
    const result = await callTool(fileTools(), {
        command: 'jq ".a * 2" input.json > result.json',
        inputs: [{ artifactId: source.id, path: 'input.json' }],
        outputs: [{ path: 'result.json', mediaType: 'application/json' }],
    }, ctx);

    expect(result.exitCode).toBe(0);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]).toMatchObject({
        runId: 'run',
        filename: 'result.json',
        mediaType: 'application/json',
    });

    const output = await ctx.artifacts.get(result.artifacts[0]!.id);

    expect(new TextDecoder().decode(output?.data)).toBe('42\n');
});

const text = (value: string) => new TextEncoder().encode(value);
const output = (path: string, mediaType = 'text/plain') => ({ path, mediaType });
const read = async (ctx: ReturnType<typeof toolContext>, id: string) => (await ctx.artifacts.get(id))!.data;

describe('process_files', () => {
    it('transforms CSV and publishes its bytes', async () => {
        const ctx = toolContext('csv');
        const source = await ctx.artifacts.put({ mediaType: 'text/csv', data: text('name,n\nAda,2\nLin,3\n') });
        const result = await callTool(fileTools(), {
            command: 'xan select name in.csv > names.csv',
            inputs: [{ artifactId: source.id, path: 'in.csv' }],
            outputs: [output('names.csv', 'text/csv')],
        }, ctx);

        expect(result.exitCode).toBe(0);
        expect(new TextDecoder().decode(await read(ctx, result.artifacts[0]!.id))).toBe('name\nAda\nLin\n');
    });

    it('uses a fresh filesystem, environment and cwd for every call', async () => {
        const ctx = toolContext('fresh');
        const tools = fileTools();

        await callTool(tools, { command: 'echo secret > hidden; export LEAK=secret; mkdir sub; cd sub' }, ctx);

        const result = await callTool(tools, { command: 'pwd; echo "${LEAK-unset}"; cat hidden' }, ctx);

        expect(result.stdout).toBe('/workspace\nunset\n');
        expect(result.exitCode).not.toBe(0);
        expect(result.artifacts).toEqual([]);
    });

    it('imports only selected artifacts and never host files or env', async () => {
        const ctx = toolContext('selected');

        await ctx.artifacts.put({
            mediaType: 'text/plain',
            filename: 'unselected',
            data: text('secret'),
        });

        const result = await callTool(fileTools(), { command: 'cat unselected /etc/hosts; echo "${npm_package_name-unset}"' }, ctx);

        expect(result.stdout).toBe('unset\n');
        expect(result.stderr).toContain('No such file');
    });

    it('rejects foreign artifacts before loading any bytes', async () => {
        const store = createMemoryStore();
        const ctx = toolContext('own', undefined, store);
        const foreign = await toolContext('foreign', undefined, store).artifacts.put({ mediaType: 'text/plain', data: text('secret') });
        const get = vi.spyOn(ctx.artifacts, 'get');

        await expect(callTool(fileTools(), { command: 'cat in', inputs: [{ artifactId: foreign.id, path: 'in' }] }, ctx)).rejects.toThrow(ValidationError);
        expect(get).not.toHaveBeenCalled();
    });

    it.each(['', '.', './', '/', '/root', '../a', 'a/../b', 'a\\b', 'a\0b', 'a\nb', 'a\u007fb', 'é'.repeat(128)])('rejects invalid path %j', async (path) => {
        const ctx = toolContext('path');

        await expect(callTool(fileTools(), { command: 'echo x', outputs: [output(path)] }, ctx)).rejects.toThrow(ValidationError);
        await expect(callTool(fileTools(), { command: 'echo x', inputs: [{ artifactId: 'id', path }] }, ctx)).rejects.toThrow(ValidationError);
        expect(await ctx.artifacts.list()).toEqual([]);
    });

    it('normalizes harmless dot segments and allows replacing an input', async () => {
        const ctx = toolContext('normalize');
        const source = await ctx.artifacts.put({ mediaType: 'text/plain', data: text('old') });
        const result = await callTool(fileTools(), {
            command: 'echo new > in',
            inputs: [{ artifactId: source.id, path: './in' }],
            outputs: [output('././in')],
        }, ctx);

        expect(result.artifacts[0]!.filename).toBe('in');
        expect(await read(ctx, source.id)).toEqual(text('old'));
        expect(await read(ctx, result.artifacts[0]!.id)).toEqual(text('new\n'));
    });

    it.each([
        { command: '' },
        { command: 42 },
        { command: 'é'.repeat(8193) },
        null,
        { command: 'echo x', inputs: {} },
        { command: 'echo x', outputs: {} },
        { command: 'echo x', inputs: [null] },
        { command: 'echo x', inputs: [{ artifactId: '', path: 'a' }] },
        { command: 'echo x', outputs: [output('a', 'text/plain; charset=utf-8')] },
        { command: 'echo x', outputs: [output('a', 'invalid')] },
        { command: 'echo x', outputs: [output('a'), output('./a')] },
        { command: 'echo x', inputs: [{ artifactId: 'a', path: 'a' }, { artifactId: 'b', path: './a' }] },
        { command: 'echo x', inputs: Array.from({ length: 17 }, (_, i) => ({ artifactId: String(i), path: String(i) })) },
        { command: 'echo x', outputs: Array.from({ length: 17 }, (_, i) => output(String(i))) },
    ])('validates the complete input before any artifact access: %j', async (input) => {
        const ctx = toolContext('invalid');
        const list = vi.spyOn(ctx.artifacts, 'list');

        await expect(callTool(fileTools(), input, ctx)).rejects.toThrow(ValidationError);
        expect(list).not.toHaveBeenCalled();
    });

    it('checks aggregate input metadata before reading any selected file', async () => {
        const ctx = toolContext('metadata');
        const a = await ctx.artifacts.put({ mediaType: 'text/plain', data: text('123') });
        const b = await ctx.artifacts.put({ mediaType: 'text/plain', data: text('456') });
        const get = vi.spyOn(ctx.artifacts, 'get');

        await expect(callTool(fileTools({ maxBytes: 5 }), { command: 'echo should-not-execute', inputs: [{ artifactId: a.id, path: 'a' }, { artifactId: b.id, path: 'b' }] }, ctx)).rejects.toThrow(ValidationError);
        expect(get).not.toHaveBeenCalled();
    });

    it('rechecks actual aggregate bytes after metadata preflight', async () => {
        const ctx = toolContext('actual');
        const a = await ctx.artifacts.put({ mediaType: 'text/plain', data: text('12') });
        const b = await ctx.artifacts.put({ mediaType: 'text/plain', data: text('34') });
        const get = ctx.artifacts.get.bind(ctx.artifacts);

        vi.spyOn(ctx.artifacts, 'get').mockImplementation(async (id) => {
            const value = (await get(id))!;

            return { ...value, data: text('123') };
        });
        await expect(callTool(fileTools({ maxBytes: 5 }), { command: 'cat a b', inputs: [{ artifactId: a.id, path: 'a' }, { artifactId: b.id, path: 'b' }] }, ctx)).rejects.toThrow(ValidationError);
    });

    it.each(['missing', 'directory', 'oversize'])('preflights every output with no partial publication: %s', async (kind) => {
        const ctx = toolContext('outputs');
        const command = {
            missing: 'echo ok > a',
            directory: 'echo ok > a; mkdir b',
            oversize: 'printf 123 > a; printf 456 > b',
        }[kind];

        await expect(callTool(fileTools({ maxBytes: 5 }), { command, outputs: [output('a'), output('b')] }, ctx)).rejects.toThrow(ValidationError);
        expect(await ctx.artifacts.list()).toEqual([]);
    });

    it('round-trips raw binary and Unicode files and decodes byte-shaped stdout', async () => {
        const ctx = toolContext('bytes');
        const binary = new Uint8Array([0, 255, 128, 10, 42]);
        const unicode = text('Grüße 世界 🦦\n');
        const inputs = await Promise.all([binary, unicode].map(async (data, i) => ({ artifactId: (await ctx.artifacts.put({ mediaType: 'application/octet-stream', data })).id, path: `in${i}` })));
        const result = await callTool(fileTools(), {
            command: 'cp in0 out0; cat in1 | tee out1',
            inputs,
            outputs: [output('out0', 'application/octet-stream'), output('out1')],
        }, ctx);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('Grüße 世界 🦦\n');
        expect(await read(ctx, result.artifacts[0]!.id)).toEqual(binary);
        expect(await read(ctx, result.artifacts[1]!.id)).toEqual(unicode);
    });

    it('replaces artifacts on replay but retains separate calls at the same filename', async () => {
        const ctx = toolContext('keys');
        const tools = fileTools();
        const run = (value: string, call: string) => callTool(tools, { command: `printf ${value} > result`, outputs: [output('result')] }, ctx, call);
        const first = await run('first', 'c1');
        const second = await run('second', 'c2');

        expect(first.artifacts[0]!.id).not.toBe(second.artifacts[0]!.id);
        expect(await read(ctx, first.artifacts[0]!.id)).toEqual(text('first'));

        const replay = await run('replayed', 'c2');

        expect(replay.artifacts[0]!.id).toBe(second.artifacts[0]!.id);
        expect(await ctx.artifacts.list()).toHaveLength(2);
        expect(await read(ctx, first.artifacts[0]!.id)).toEqual(text('first'));
    });

    it.each(['curl https://example.com', 'git status', 'node -e "1"', 'python -c "1"', 'python3 -c "1"', 'js-exec "1"', 'sqlite3 :memory:', 'tar cf out .', 'gzip file', 'bash -c "node -e 1"', 'env node -e 1', 'echo 1 | xargs node', "find . -exec node {} ';'"])('denies unregistered commands: %s', async (command) => {
        const result = await callTool(fileTools(), { command, outputs: [output('missing')] }, toolContext('denied'));

        expect(result.exitCode).not.toBe(0);
        expect(result.artifacts).toEqual([]);
        expect(result.stderr).not.toBe('');
    });

    it.each(['while :; do :; done', 'seq 1 100000', 'awk "BEGIN { while (1) {} }"', "sed ':a;ba' <<< x"])('bounds runaway work/output: %s', async (command) => {
        const result = await callTool(fileTools(), { command }, toolContext('limit'));

        expect(result.exitCode).not.toBe(0);
        expect(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(65_536);
    });

    it('bounds execution time with the interpreter deadline', async () => {
        const result = await callTool(fileTools({ timeoutMs: 1 }), { command: 'while :; do :; done' }, toolContext('time'));

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toMatch(/time|deadline/i);
    });

    it('bounds intermediate filesystem bytes', async () => {
        const ctx = toolContext('filesystem');
        const result = await callTool(fileTools({ maxBytes: 8192 }), { command: 'printf "%020000d" 0 > huge; cp huge b; cp huge c; cp huge d', outputs: [output('huge')] }, ctx);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('filesystem byte limit');
        expect(await ctx.artifacts.list()).toEqual([]);
    });

    it.each(['run', 'sdk'])('propagates the original pre-execution cancellation reason: %s', async (kind) => {
        const controller = new AbortController();
        const reason = new Error('cancelled by caller');

        controller.abort(reason);
        await expect(callTool(fileTools(), { command: 'echo x > a', outputs: [output('a')] }, toolContext('abort', kind === 'run' ? controller.signal : undefined), 'call', kind === 'sdk' ? controller.signal : undefined)).rejects.toBe(reason);
    });

    it.each(['list', 'get'])('checks cancellation after asynchronous artifact %s', async (method) => {
        const controller = new AbortController();
        const ctx = toolContext('abort-read', controller.signal);
        const source = await ctx.artifacts.put({ mediaType: 'text/plain', data: text('x') });
        const list = ctx.artifacts.list.bind(ctx.artifacts);
        const get = ctx.artifacts.get.bind(ctx.artifacts);
        const reason = new Error('cancel during read');

        // The operation completes after the caller aborts, as an abort-ignoring store can do.
        if (method === 'list') {
            vi.spyOn(ctx.artifacts, 'list').mockImplementation(async () => {
                const value = await list();

                controller.abort(reason);

                return value;
            });
        } else {
            vi.spyOn(ctx.artifacts, 'get').mockImplementation(async (id) => {
                const value = await get(id);

                controller.abort(reason);

                return value;
            });
        }

        await expect(callTool(fileTools(), {
            command: 'cp in out',
            inputs: [{ artifactId: source.id, path: 'in' }],
            outputs: [output('out')],
        }, ctx)).rejects.toBe(reason);
        expect(await ctx.artifacts.list()).toHaveLength(1);
    });

    it('preserves store failures rather than converting them into sandbox failures', async () => {
        const ctx = toolContext('store');
        const reason = new Error('store unavailable');

        vi.spyOn(ctx.artifacts, 'list').mockRejectedValue(reason);
        await expect(callTool(fileTools(), { command: 'cat in', inputs: [{ artifactId: 'id', path: 'in' }] }, ctx)).rejects.toBe(reason);
        vi.spyOn(ctx.artifacts, 'put').mockRejectedValue(reason);
        await expect(callTool(fileTools(), { command: 'echo x > out', outputs: [output('out')] }, ctx)).rejects.toBe(reason);
    });
});

it('executes valid tiny byte allowances and enforces their exact import/export caps', async () => {
    const ctx = toolContext('tiny');
    const source = await ctx.artifacts.put({ mediaType: 'text/plain', data: text('12345') });
    const result = await callTool(fileTools({ maxBytes: 5 }), {
        command: 'cp in out',
        inputs: [{ artifactId: source.id, path: 'in' }],
        outputs: [output('out')],
    }, ctx);

    expect(result.exitCode).toBe(0);
    expect(await read(ctx, result.artifacts[0]!.id)).toEqual(text('12345'));
    await expect(callTool(fileTools({ maxBytes: 5 }), { command: 'printf 123456 > out', outputs: [output('out')] }, ctx)).rejects.toThrow(ValidationError);
});

it('keeps the original cancellation reason when an artifact read rejects after abort', async () => {
    const controller = new AbortController();
    const reason = new Error('run cancelled');
    const ctx = toolContext('abort-error', controller.signal);

    vi.spyOn(ctx.artifacts, 'list').mockImplementation(async () => {
        controller.abort(reason);

        throw new Error('store operation aborted');
    });
    await expect(callTool(fileTools(), { command: 'cat in', inputs: [{ artifactId: 'id', path: 'in' }] }, ctx)).rejects.toBe(reason);
});

it('stops publication after cancellation without promising rollback of a successful put', async () => {
    const controller = new AbortController();
    const ctx = toolContext('abort-publish', controller.signal);
    const reason = new Error('cancelled during publication');
    const put = ctx.artifacts.put.bind(ctx.artifacts);

    vi.spyOn(ctx.artifacts, 'put').mockImplementation(async (input) => {
        const artifact = await put(input);

        controller.abort(reason);

        return artifact;
    });
    await expect(callTool(fileTools(), { command: 'echo a > a; echo b > b', outputs: [output('a'), output('b')] }, ctx)).rejects.toBe(reason);
    expect((await ctx.artifacts.list()).map((item) => item.filename)).toEqual(['a']);
});

it('ignores unsupported interpreter capability options rather than forwarding them', async () => {
    const ctx = toolContext('injection');
    const tools = fileTools({
        python: true,
        javascript: true,
        network: { dangerouslyAllowFullInternetAccess: true },
        files: { '/workspace/secret': 'hidden' },
        env: { HOST_SECRET: 'hidden' },
        customCommands: [{
            name: 'injected',
            execute: async () => ({
                stdout: 'escaped',
                stderr: '',
                exitCode: 0,
            }),
        }],
    } as Parameters<typeof fileTools>[0]);
    const result = await callTool(tools, { command: 'cat secret; echo "${HOST_SECRET-unset}"; injected' }, ctx);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe('unset\n');
    expect(result.stderr).toContain('injected: command not found');
});

it('bounds decoded binary stdout together with limit diagnostics', async () => {
    const ctx = toolContext('binary-stdout');
    const source = await ctx.artifacts.put({ mediaType: 'application/octet-stream', data: new Uint8Array(32_768).fill(255) });
    const result = await callTool(fileTools(), { command: 'cat in; echo error >&2', inputs: [{ artifactId: source.id, path: 'in' }] }, ctx);

    expect(result.exitCode).not.toBe(0);
    expect(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(65_536);
    expect(result.stdout).not.toContain('�');
    expect(result.stderr).toContain('output size exceeded');
    expect((await ctx.artifacts.get(source.id))!.data).toHaveLength(32_768);
});
