import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        vite: 'src/vite/index.ts',
    },
    format: 'esm',
    // the declarations come from vue-tsc (build:types), which understands the SFCs
    dts: false,
    sourcemap: true,
    plugins: [vue()],
    // provided by the icon plugin of definePageConfig in the consumer's Vite build
    external: ['virtual:chamvi-icons'],
    // raw, so the consumer's Tailwind compiles it
    copy: [{ from: 'src/shell/style.css', to: 'dist' }],
});
