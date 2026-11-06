import { ValidationError, defineSimpleAgent } from '@chamvi/core';
import { fileTools } from '@chamvi/tool-files';
import type { ListArtifactsResult, ProcessFilesResult } from '@chamvi/tool-files';

export function createFileAgent() {
    return defineSimpleAgent({
        name: 'file-report',
        tools: fileTools(),
        run: async (_, ctx) => {
            const catalog = await ctx.tools.list_artifacts!({}) as ListArtifactsResult;
            const source = catalog.artifacts.find((artifact) => artifact.filename === 'sales.json');

            if (!source) {
                throw new ValidationError('Attach sales.json with an array of amounts.');
            }

            const result = await ctx.tools.process_files!({
                command: "jq '[.[].amount] | add' sales.json > report.json",
                inputs: [{ artifactId: source.id, path: 'sales.json' }],
                outputs: [{ path: 'report.json', mediaType: 'application/json' }],
            }) as ProcessFilesResult;
            const report = result.artifacts[0];

            if (result.exitCode !== 0 || !report) {
                throw new ValidationError(result.stderr || 'No report produced.');
            }

            // The returned ID works with the existing run artifact API.
            const output = await ctx.artifacts.get(report.id);

            if (!output) {
                throw new ValidationError('Report is unavailable.');
            }

            return { artifact: output.artifact, text: new TextDecoder().decode(output.data) };
        },
    });
}
