import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: { index: 'src/index.ts' },
    format: 'esm',
    // the declarations come from vue-tsc (build:types), which understands the SFCs
    dts: false,
    sourcemap: true,
    plugins: [vue()],
});
