import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: { module: 'src/module/index.ts' },
    format: 'esm',
    dts: true,
    sourcemap: true,
});
