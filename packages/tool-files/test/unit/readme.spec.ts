/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createFileAgent } from '../fixtures/readme-example.ts';
import { createTestEngine } from '@chamvi/test-kit';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('README example', () => {
    it('contains the executable fixture verbatim', () => {
        const blocks = read('../../README.md').matchAll(/```typescript\n([\s\S]*?)```/g).map((match) => match[1]).toArray();

        expect(blocks).toContain(read('../fixtures/readme-example.ts'));
    });

    it('transforms an attachment and reads the selected output through run artifacts without a model', async () => {
        const engine = createTestEngine({ agents: [createFileAgent()] });

        try {
            await engine.start();

            const { runId } = await engine.dispatch({
                agent: 'file-report',
                trigger: 'test',
                channel: 'test',
                payload: {},
                attachments: [{
                    filename: 'sales.json',
                    mediaType: 'application/json',
                    data: new TextEncoder().encode('[{"amount":12},{"amount":30}]'),
                }],
            });

            await engine.idle();

            const artifacts = await engine.artifactService.find(runId);
            const report = artifacts.find((artifact) => artifact.filename === 'report.json');

            expect(report).toMatchObject({
                runId,
                mediaType: 'application/json',
                size: 3,
            });
            expect(await engine.runService.findOne(runId)).toMatchObject({
                status: 'completed',
                output: { artifact: { id: report!.id, filename: 'report.json' }, text: '42\n' },
                taint: { source: 'tool:list_artifacts' },
            });
            expect(artifacts).toHaveLength(2);
            expect(new TextDecoder().decode(await engine.artifactService.read(report!.id))).toBe('42\n');
        } finally {
            await engine.stop();
        }
    });
});
