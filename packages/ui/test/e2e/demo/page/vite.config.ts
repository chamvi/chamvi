import { fileURLToPath } from 'node:url';
import { definePageConfig } from '@chamvi/ui-kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(definePageConfig({ root: fileURLToPath(new URL('.', import.meta.url)) }));
