import { readFileSync } from 'node:fs';
import { definePageConfig } from '@chamvi/ui-kit/vite';
import { defineConfig, mergeConfig } from 'vite';

// the dev server proxies the API to a chamvi app on port 3000
const API = 'http://127.0.0.1:3000';

const { version } = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig(({ command }) => mergeConfig(definePageConfig({ root: 'app' }), {
    base: command === 'build' ? './' : '/ui/',
    // the login footer's "chamvi 0.1"
    define: { __CHAMVI_VERSION__: JSON.stringify(version) },
    server: { proxy: Object.fromEntries(['/agents', '/runs', '/schedules', '/connections', '/me'].map((path) => [path, API])) },
}));
