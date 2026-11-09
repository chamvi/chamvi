import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: { index: 'src/index.ts', worker: 'src/runner/worker.ts' },
    format: 'esm',
    dts: true,
    sourcemap: true,
});
