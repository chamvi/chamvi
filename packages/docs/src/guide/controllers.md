# Controllers

An app adds REST routes of its own with [`@routup/decorators`](https://www.npmjs.com/package/@routup/decorators) controllers, the classes chamvi's own REST API is built from. A module contributes a controller instance; chamvi serves it under `basePath` behind its own request pipeline: the authenticators (when a method asks for them), the rate limiter, the body limits, the JSON error renderer and the metrics.

```bash
npm install @routup/decorators
```

`@routup/decorators` (`^5.2.0`) is a peer dependency of `@chamvi/http` and `@chamvi/app`: the app's decorators write the metadata chamvi reads, so npm must resolve one copy. npm 7 and later install it by themselves; an install with `--legacy-peer-deps` must list it in the app's `package.json`. Decorators need `experimentalDecorators: true` in the app's `tsconfig.json`.

## A controller over a service

The controller reads the request (path, query, body, the principal) and calls one service method. It holds no permission check and no validation: its service does, as chamvi's own controllers and services split the work. The service checks with `assertGranted(principal, clock, permission, attributes?)`, which throws 403 when the principal lacks the permission:

<<< @/snippets/controllers/service.ts#service

`"*"` in `CHAMVI_TOKENS` grants every chamvi permission, not an app's own names: grant `note_read` and `note_write` as [bindings](/guide/permissions) (a token's list, or authup).

<<< @/snippets/controllers/controller.ts#controller

The decorators come from `@routup/decorators`; the request helpers come from `@chamvi/app` (and `@chamvi/http`):

| Helper | Does |
|---|---|
| `usePrincipal(event)` | The request's principal; 401 (with `WWW-Authenticate: Bearer`) without one. The authenticator chain runs once per request |
| `authorizeRequest(event, permission?, attributes?)` | `usePrincipal`, then 403 unless the principal holds `permission`: for the resource `attributes` when given, else for some resource. The same check as an `HttpRoute`'s `request.authorize()` |
| `assertGranted(principal, clock, permission, attributes?)` | The check without the event, for a service |
| `toInvoker(principal)` | The principal as a run's [invoker](/guide/http#invoker), e.g. for `engine.dispatch()` |
| `ForceLoggedInMiddleware` | A method middleware (`@DGet('/x', [ForceLoggedInMiddleware])`): 401 without a principal |
| `JsonBodyMiddleware`, `RequiredJsonBodyMiddleware` | Resolve the principal (401), then read a JSON body for `@DBody()` within the app's `bodyLimit`: 413 above it, 415 for another media type; the required one also answers 400 without a body |

**Authentication is opt-in per method.** A method is unauthenticated unless it uses `ForceLoggedInMiddleware`, a body middleware, or its service authorizes. `GET /notes/count` above answers anyone.

## Contributing it

A module registers a factory on `AppToken.HTTP_CONTROLLERS` in `setup`:

<<< @/snippets/controllers/module.ts#module

The factory runs once, when the http module resolves the token in its `onReady`, after every module's `setup`, so it can resolve anything another module registered (`CLOCK`, `ENGINE`, `LOGGER`, your own tokens). It runs only in start mode, a [check](/guide/models#check-before-you-deploy) (`chamvi start --check`) included; `runJob()` and `migrate()` never build a controller. `httpModule({ controllers })` takes instances directly and mounts them before the token's; without `@chamvi/app`, pass them to `createHttpApp({ controllers: [new NoteController({ service })] })`.

A suggested layout, which follows authup and which chamvi does not enforce: the domain in `src/core/<entity>/service.ts`, the controller in `src/adapters/http/controllers/<entity>.ts` and the module in `src/app/modules/<entity>.ts`. An app keeps its own data source for its own tables; chamvi's store takes no contributed entities.

`chamvi build` compiles the decorators with the app's `tsconfig.json`. Running a decorated entry from source (`chamvi dev`, `chamvi start --entry src/index.ts`) needs the CLI of the next release.

## Paths

The app is built at construction, so a breach fails the start and `chamvi start --check` with `InvalidAgentDefinitionError`:

- Each `@DController` base path (a string or an array) is a static path starting with `/` (letters, digits, `_`, `.`, `~`, `-`; no parameters), whose first segment is not a built-in one (`agents`, `authorization`, `channels`, `connection-types`, `connections`, `docs`, `healthz`, `mcp`, `me`, `openapi.json`, `readyz`, `runs`, `schedules`, `ui-pages`), and which is neither the metrics path nor above it (with metrics on). Paths compare case-insensitively, as routup matches them.
- A method path is empty or starts with `/`, and may carry routup parameters (`/:id`).
- No route (method plus full path, compared case-insensitively, parameter names ignored) is declared twice across all controllers.
- No route matches an extra route (`HttpRoute`, such as the dashboard's) of the same method, or lies at or under its prefix: controllers are mounted first and would shadow it.
- The class must be decorated with `@DController` and contributed as an instance, not as the class.

Routes match in declaration order, as routup answers with the first match: declare a static route (`/count`) before a parameter route of the same shape (`/:id`).

## Requests

- **Rate limit:** contributed routes are always limited by the app's limiter (`rateLimit`, 300 per minute per client by default). A caller that must not be limited, a webhook sender that never retries for example, stays an [`HttpRoute`](/guide/http#extra-routes) with `rateLimit: false`, or becomes a [channel](/guide/channels).
- **Errors:** throw `@ebec/http` errors (`NotFoundError`, `ConflictError`, ...), or classes of your own that extend them with their own `code`; they render as `{ status, code, message, issues? }` with the code lowercased. A validup error renders as 400 `validation_error` with its issues, and a core error (`ValidationError`, `RunNotFoundError`, ...) as in every other route. Anything else is a 500 `Internal Server Error` whose cause goes to `onError`, never to the client. There is no seam to map other errors: catch and rethrow in the service.
- **Metrics:** the `path` label of a contributed route is its declared pattern (`/notes/:id`), never the request path.

## OpenAPI document

chamvi's `/openapi.json` and `/docs` describe its own routes. An app adds its controllers to them with a document of its own, generated with [trapi](https://www.npmjs.com/package/@trapi/cli) (`npm install @trapi/cli --save-dev`) and the `@routup/decorators/preset`, with paths relative to `basePath` like chamvi's:

<<< @/snippets/controllers/trapi.config.ts#trapi

Run `trapi generate` before `chamvi build` (and in the image build), and contribute the parsed document through `AppToken.OPENAPI_DOCUMENTS`, as the module above does, or through `httpModule({ openapi: { documents } })` (`createHttpApp({ openapi: { documents } })`); the option's documents merge first. With `openapi: false` both are ignored.

- `paths`, `tags` and `components` (every group: `schemas`, `securitySchemes`, ...) are merged into chamvi's document; `info`, `servers` and every other top-level key stay chamvi's.
- Paths merge per path and method. A method already in chamvi's document or in another contributed one is refused, as is a different path-level field (`parameters`, `summary`, ...) for the same path.
- A component name that exists with a different definition is refused; an identical one is kept once. Tags merge by name, and the first description wins.

A refusal is an `InvalidAgentDefinitionError` at construction, so it also fails `chamvi start --check`. The contributed documents are checked against each other even when chamvi's own document is missing.

## HttpRoute or a controller

[`HttpRoute`](/guide/http#extra-routes) (`AppToken.HTTP_ROUTES`) stays: it suits a small static route without decorators, such as the dashboard's files, and the routes a caller must reach without the rate limit. A controller suits an API with parameters, bodies and services.
