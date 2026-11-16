# Controllers

An app adds REST routes of its own with [`@routup/decorators`](https://www.npmjs.com/package/@routup/decorators) controllers, the classes chamvi's own REST API is built from. A module contributes a controller instance; chamvi serves it under `basePath` behind its own request pipeline: the authenticators (when a method asks for them), the rate limiter, the body limits, the JSON error renderer and the metrics.

```bash
npm install @routup/decorators
```

`@routup/decorators` (`^5.2.0`) is a peer dependency of `@chamvi/http` and `@chamvi/app`: the app's decorators write the metadata chamvi reads, so npm must resolve one copy. npm 7 and later and pnpm 8 and later install it by themselves; a package manager that does not install peers (npm with `--legacy-peer-deps`, Yarn Berry, pnpm before 8) needs it in the app's `package.json`, otherwise the app fails at startup with a module-not-found error. Decorators need `experimentalDecorators: true` in the app's `tsconfig.json`.

## A controller over a service

The controller reads the request (path, query, body, the principal) and calls one service method. It holds no permission check and no validation: its service does, as chamvi's own controllers and services split the work. The service checks with `assertGranted(principal, clock, permission, attributes?)`, which throws 403 when the principal lacks the permission:

<<< @/snippets/controllers/core/note/service.ts#service

`"*"` in `CHAMVI_TOKENS` grants every chamvi permission, not an app's own names: grant `note_read` and `note_write` as [bindings](/guide/permissions) (a token's list, or authup).

<<< @/snippets/controllers/adapters/http/controllers/note.ts#controller

The decorators come from `@routup/decorators`; the request helpers come from `@chamvi/app` (and `@chamvi/http`):

| Helper | Does |
|---|---|
| `usePrincipal(event)` | The request's principal; 401 (with `WWW-Authenticate: Bearer`) without one. The authenticator chain runs once per request |
| `authorizeRequest(event, permission?, attributes?)` | `usePrincipal`, then 403 unless the principal holds `permission`: for the resource `attributes` when given, else for some resource. The same check as an `HttpRoute`'s `request.authorize()` |
| `assertGranted(principal, clock, permission, attributes?)` | The check without the event, for a service |
| `toInvoker(principal)` | The principal as a run's [invoker](/guide/http#invoker), e.g. for `engine.dispatch()` |
| `ForceLoggedInMiddleware` | A method middleware (`@DGet('/x', [ForceLoggedInMiddleware])`): 401 without a principal |
| `JsonBodyMiddleware`, `RequiredJsonBodyMiddleware` | Resolve the principal (401), then read a JSON body for `@DBody()` within the app's `bodyLimit`: 413 above it, 415 for another media type; the required one also answers 400 without a body. `@DBody()` needs one of them on the method, otherwise the body is `{}` |

**Authentication is opt-in per method.** A method is unauthenticated unless it uses `ForceLoggedInMiddleware`, a body middleware, or its service authorizes. `GET /notes/count` above answers anyone.

## Contributing it

A module registers a factory on `AppToken.HTTP_CONTROLLERS` in `setup`:

<<< @/snippets/controllers/app/modules/note.ts#module

The factory runs once, when the http module resolves the token in its `onReady`, after every module's `setup`, so it can resolve anything another module registered (`CLOCK`, `ENGINE`, `LOGGER`, your own tokens). It runs only in start mode, a [check](/guide/models#check-before-you-deploy) (`chamvi start --check`) included; `runJob()` and `migrate()` never build a controller. `httpModule({ controllers })` takes instances directly and mounts them before the token's; without `@chamvi/app`, pass them to `createHttpApp({ controllers: [new NoteController({ service })] })`.

A suggested layout, which follows authup and which chamvi does not enforce: the domain in `src/core/<entity>/service.ts`, the controller in `src/adapters/http/controllers/<entity>.ts` and the module in `src/app/modules/<entity>.ts`. An app keeps its own data source for its own tables; chamvi's store takes no contributed entities.

`chamvi build` compiles the decorators with the app's `tsconfig.json`. `chamvi dev` and `chamvi start --entry src/index.ts` run a decorated entry from source through the CLI's [TypeScript entries](/reference/cli#typescript-entries) hooks: they need `"experimentalDecorators": true` in the `tsconfig.json` the build finds (the nearest one at or above the working directory), `"type": "module"` in the app's `package.json`, and tsdown installed.

## Paths

The app is built at construction, so a breach fails the start and `chamvi start --check` with `InvalidAgentDefinitionError`:

- Each `@DController` base path (a string or an array) is a static path starting with `/` (letters, digits, `_`, `.`, `~`, `-`; no parameters), whose first segment is not a built-in one (`agents`, `authorization`, `channels`, `connection-types`, `connections`, `docs`, `healthz`, `mcp`, `me`, `openapi.json`, `readyz`, `runs`, `schedules`, `ui-pages`), and which is neither the metrics path nor above it (with metrics on). Paths compare case-insensitively, as routup matches them.
- A method path is empty or starts with `/`, and may carry routup parameters (`/:id`). `{/:id}` is refused, though routup would take it: declare `''` and `/:id` as two methods.
- No route (method plus full path, compared case-insensitively, parameter names ignored) is declared twice across all controllers.
- No route of the same method could take a request of an extra route (`HttpRoute`, such as the dashboard's): its path, or for a prefix route any path at or under it. Segments compare one by one (a quoted parameter name holding a `/` stays one segment): a segment with a parameter matches every segment its literal text before the first and after the last parameter fits (`/ui/styles-:id` never matches `/ui/assets`, `/ui/as:rest` does), and one with a wildcard the rest. So `/ui/:section/:file` is refused beside the prefix route `/ui/assets`: controllers are mounted first and would shadow it.
- The class must be decorated with `@DController` and contributed as an instance, not as the class.

Routes match in declaration order, as routup answers with the first match: declare a static route (`/count`) before a parameter route of the same shape (`/:id`).

A class-level middleware (`@DController('/notes', [ForceLoggedInMiddleware])`) runs for every request under the controller's base path, unmatched paths and an `HttpRoute` beneath it included: keep `ForceLoggedInMiddleware` on the methods unless the whole base path is the controller's.

## Requests

- **Rate limit:** contributed routes are always limited by the app's limiter (`rateLimit`, 300 per minute per client by default). A caller that must not be limited, a webhook sender that never retries for example, stays an [`HttpRoute`](/guide/http#extra-routes) with `rateLimit: false`, or becomes a [channel](/guide/channels).
- **Errors:** throw `@ebec/http` errors (`NotFoundError`, `ConflictError`, ...), or classes of your own that extend them with their own `code`; they render as `{ status, code, message, issues? }` with the code lowercased. A validup error renders as 400 `validation_error` with its issues, and a core error (`ValidationError`, `RunNotFoundError`, ...) as in every other route. Anything else is a 500 `Internal Server Error` whose cause goes to `onError`, never to the client. There is no seam to map other errors: catch and rethrow in the service.
- **Metrics:** the `path` label of a contributed route is its declared pattern (`/notes/:id`), never the request path.

## OpenAPI document

chamvi's `/openapi.json` and `/docs` describe its own routes. An app adds its controllers to them with a document of its own, generated with [trapi](https://www.npmjs.com/package/@trapi/cli) (`npm install @trapi/cli --save-dev`) and the `@routup/decorators/preset`, with paths relative to `basePath` like chamvi's:

<<< @/snippets/controllers/trapi.config.ts#trapi

The document goes to `openapi.json` beside `package.json`, never into `dist`: `chamvi build` refuses an out dir holding a file it did not write. Run `trapi generate` in the image build too and copy `openapi.json` into the final image beside `dist` (the module reads it relative to the working directory, the app's root). Contribute the parsed document through `AppToken.OPENAPI_DOCUMENTS`, as the module above does, or through `httpModule({ openapi: { documents } })` (`createHttpApp({ openapi: { documents } })`); the option's documents merge first. With `openapi: false` both are ignored.

- `paths`, `tags` and `components` (every group: `schemas`, `securitySchemes`, ...) are merged into chamvi's document; `info`, `servers` and every other top-level key stay chamvi's.
- Paths merge per path and method, method keys compared case-insensitively; the methods of OpenAPI 3.2's `additionalOperations` (`COPY`, ...) merge the same way, kept as written, and one that has a fixed field (`POST`, `query`) is refused. A method already in chamvi's document or in another contributed one is refused, as is a different path-level field (`parameters`, `summary`, ...) for the same path. Paths that differ only in parameter names (`/notes/{id}`, `/notes/{noteId}`) are refused: use one template, with the same parameter names, for every operation on it.
- A contributed document's top-level `security` is not applied: each operation carries its own.
- A path, path-level field, `additionalOperations` method, component group or component name `__proto__`, `constructor` or `prototype` is refused.
- A component name that exists with a different definition is refused; an identical one is kept once. Tags merge by name, and the first description wins.

A refusal is an `InvalidAgentDefinitionError` at construction, so it also fails `chamvi start --check`. The contributed documents are checked against each other even when chamvi's own document is missing.

## HttpRoute or a controller

[`HttpRoute`](/guide/http#extra-routes) (`AppToken.HTTP_ROUTES`) stays: it suits a small static route without decorators, such as the dashboard's files, and the routes a caller must reach without the rate limit. A controller suits an API with parameters, bodies and services.
