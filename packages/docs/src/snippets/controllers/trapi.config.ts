// #region trapi
// trapi.config.ts, next to package.json: `trapi generate` writes dist/openapi.json
import { defineConfig } from '@trapi/cli';

export default defineConfig({
    metadata: {
        entryPoint: ['src/adapters/http/controllers/*.ts'],
        // reads @DController, @DGet, @DStatus, ... of @routup/decorators
        preset: '@routup/decorators/preset',
        tsconfig: 'tsconfig.json',
    },
    swagger: {
        version: 'v3.2',
        // info and servers stay chamvi's: only paths, tags and components are merged
        data: { name: 'notes', version: '1.0.0' },
    },
    output: { path: 'dist/openapi.json' },
});
// #endregion trapi
