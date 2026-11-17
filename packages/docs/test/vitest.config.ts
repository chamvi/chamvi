import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (name: string) => fileURLToPath(new URL(`../../${name}/src/index.ts`, import.meta.url));

// the guide's sample spec (src/snippets/database/spec.ts), run as an app would run it, against the sources
export default defineConfig({
    resolve: {
        alias: ['access', 'core', 'store', 'store-memory', 'store-db', 'test-kit']
            .map((name) => ({ find: new RegExp(`^@chamvi/${name}$`), replacement: source(name) })),
    },
    test: {
        include: ['src/snippets/**/spec.ts'],
        passWithNoTests: false,
    },
});
