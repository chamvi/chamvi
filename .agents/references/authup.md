# Reference: Authup repository conventions

- Source inspected: local `/opt/projects/authup/authup`, commit `a2b39a8ac` (2026-10-29).
- `packages/server-kit/src/core/types.ts`: `IEntityRepository` groups entity queries and mutations behind repository contracts.
- `apps/server-core/src/core/entities/user/types.ts`: `IUserRepository` adds domain operations.
- `apps/server-core/src/app/modules/database/repositories/user/repository.ts`: `UserRepositoryAdapter` adapts the persistence implementation to the contract.
- chamvi mapping (#231): `packages/store/src/entity/types.ts` holds `IEntityRepository<T>` (`findMany`, `findOneById`, `findOneBy`, `create`, `merge`, `save`, `transaction`, ... as authup's) and `packages/store/src/<aggregate>/types.ts` the port per aggregate; `packages/store-memory/src/` (`MemoryEntityRepository`) and `packages/store-db/src/` (`EntityRepositoryAdapter`, as authup's `UserRepositoryAdapter`) implement them; the services of `packages/core/src/<aggregate>/service.ts` hold the domain operations and the engine takes each by name. Difference: authup's ports carry domain finders; chamvi's ports allow at most one finder and keep every rule in the service.

The user's requested `find`/`findOne`/`findOrFail`/`findOneOrFail` naming is explicit. It is not a claim that Authup exposes that exact quartet: the inspected generic Authup contract uses `findMany`, `findOneById` and other qualified methods. chamvi's services keep the domain return shapes, absence as undefined, mutation atomicity and clock semantics; the generic port speaks rapiq queries, never ORM find options.

## HTTP controllers and services

Pinned to authup commit `052c85a85`; paths under `apps/server-core/src/`.

| authup | chamvi (`packages/http/src/`) |
|---|---|
| `adapters/http/controllers/**/module.ts` (`@DController` classes, a `{ service }` constructor context, `@DBody`, `@DContext`, literal return types, `event.response.status = 201 \| 202`) | `<area>/controller.ts` or `<area>/controller/<name>.ts` (`agents`, `runs`, `connections`, `health`, `me`, `authorization`) |
| `core/entities/*/service.ts` (permission checks, validation, repository calls) | `<area>/service.ts` or `<area>/service/<name>.ts`, an `I<Name>Service` in `<area>/types.ts` |
| `adapters/http/middleware/built-in/loggedin/module.ts` (`ForceLoggedInMiddleware`) | `middleware/logged-in.ts` (same name), plus `middleware/json-body.ts` and `middleware/required-json-body.ts` |
| `app/modules/http/modules/controller.ts` (`HTTPControllerModule.mount`: builds each controller with its services, one `router.use(decorators({ controllers }))`) | `app/module.ts` (`createHttpApp`) |

Differences:

- Bodies: authup parses them with the `@routup/basic` body plugin (`adapters/http/middleware/built-in/basic.ts`). chamvi installs no body parser: its body middleware reads with chamvi's own `readJsonBody` (limits, 413 with drain, 415, 400) and hands it to `@routup/body`'s `setRequestBody`, so `@DBody()` returns that value.
- Success status: authup sets `event.response.status = 201 | 202` in the method; chamvi declares `@DStatus(201 | 202)` of `@routup/decorators` 5.1, applied after the method returned.
- Caller: authup services take an `ActorContext` (`buildActorContext(event)`); chamvi services take the `principal` (`usePrincipal(event)`) as an argument.
- Responses: authup wraps records as `{ data, meta }`; chamvi keeps its own response shapes and adds no envelope.
- Wiring: authup resolves repositories and services from an `IContainer` per controller; `@chamvi/http` has no DI container and builds the services from the `HttpContext` in `createHttpApp`.

## OpenAPI document and Swagger UI

Pinned to authup commit `052c85a85`; paths under `apps/server-core/`.

| authup | chamvi (`packages/http/`) |
|---|---|
| `trapi.config.ts` (`@routup/decorators/preset` plus a `DQuerySchema` method handler, the `ErrorResponse` default response, `data.extra`) | `trapi.config.ts` (same preset and error response; a handler for `DQuerySchema` only: `DStatus`, `DProduces` and `DReturns` are the preset's) |
| `src/adapters/http/decorators/query-schema.ts` (`DQuerySchema(entity, shape)`, a runtime no-op) | `src/decorators/query-schema.ts` (`DQuerySchema('runs' \| 'kv' \| 'documents' \| 'stream')`, a runtime no-op) |
| `src/adapters/http/middleware/built-in/swagger.ts` (`createSwaggerMiddleware`: reads once, a non-object mounts nothing with a warning, `/openapi.json` registered before the UI) | `src/openapi/module.ts` (`registerOpenApiRoutes`), `src/openapi/helpers.ts` |

Differences:

- Location: authup serves the document under the UI mount (`<mount>/openapi.json`); chamvi serves `<basePath>/openapi.json` at the API root next to `<basePath>/docs`, registered outside the UI mount.
- Content: authup sends the file verbatim; chamvi re-serializes it with `servers` set from `basePath`. A missing document is a logger warning in authup, one `onError` report in chamvi.
- UI guard: authup mounts the plugin as is; chamvi mounts `@routup/swagger-ui` 5 (its own file allowlist and GET/HEAD rule) with a stricter `csp` string and adds the static security headers.
- Query parameters: authup projects its rapiq schema registry into the document (and checks a schema hash at runtime); chamvi describes the parameters of its three list routes by hand in `trapi.config.ts` and its document spec feeds each documented example to the route's parser.
