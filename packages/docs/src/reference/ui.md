# @chamvi/ui

The dashboard, served by `@chamvi/http`. The public API of `packages/ui/src/index.ts`; the app itself is a prebuilt bundle in `dist/app`.

```bash
npm install @chamvi/ui @chamvi/http @chamvi/core --save
```

`@chamvi/core` and `@chamvi/http` are peer dependencies. See [Dashboard](/guide/ui) for the pages, sign-in and serving rules. The run page's lineage view (parent link, dispatched runs, subtree total) reads `GET /runs?filter[parent]=<id>` from the `@chamvi/http` version it is served with, so serve both at the same version.

## uiRoutes

```ts
function uiRoutes(options?: UiRoutesOptions): HttpRoute[];
```

One unauthenticated, not rate-limited `GET` prefix route at `basePath` for `createHttpApp({ routes })`. Throws `InvalidAgentDefinitionError` for a `basePath` that is not a lower-case path, an `auth.authup.url` that is no absolute http(s) URL, an empty `clientId`, `auth.tokens: false` without `auth.authup`, and an empty `root`.

<<< ../../../ui/src/routes/types.ts{ts}

## Config

The block `uiRoutes()` injects into `index.html` (element id `CONFIG_ELEMENT_ID`).

<<< ../../../ui/src/config/types.ts{ts}

## Constants

| Constant | Value |
|---|---|
| `DEFAULT_UI_BASE_PATH` | `'/ui'` |
| `ASSET_CACHE_CONTROL` | `'public, max-age=31536000, immutable'` |
| `DOCUMENT_CACHE_CONTROL` | `'no-cache'` |
| `CONFIG_ELEMENT_ID` | `'chamvi-config'` |

## Module

```ts
// @chamvi/ui/module, needs @chamvi/app
function uiModule(options?: UiModuleOptions): IModule; // name UI_MODULE_NAME 'chamvi:ui'
```

Contributes `uiRoutes()` to the app's routes (`/ui` under `CHAMVI_BASE_PATH`). Reads `CHAMVI_UI_AUTHUP_CLIENT_ID`, `CHAMVI_UI_AUTHUP_REALM_ID` and `AUTHUP_URL` from `options.env ?? process.env` when it is called, unless `auth` is given, and shares that sign-in with every `*-ui` page. It provides no context (tools have nothing to reach). `@chamvi/app` is an optional peer: the main entry never imports it.

<<< ../../../ui/src/module/types.ts{ts}
