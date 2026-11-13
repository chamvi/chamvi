# Reference: Authup repository conventions

- Source inspected: local `/opt/projects/authup/authup`, commit `a2b39a8ac` (2026-10-29).
- `packages/server-kit/src/core/types.ts`: `IEntityRepository` groups entity queries and mutations behind repository contracts.
- `apps/server-core/src/core/entities/user/types.ts`: `IUserRepository` adds domain operations.
- `apps/server-core/src/app/modules/database/repositories/user/repository.ts`: `UserRepositoryAdapter` adapts the persistence implementation to the contract.
- chamvi mapping: `packages/core/src/repository/types.ts` contains role-specific contracts; `packages/core/src/repository/memory/` and `packages/store-db/src/` implement them; `Engine.store` receives the assembled capabilities.

The user's requested `find`/`findOne`/`findOrFail`/`findOneOrFail` naming is explicit. It is not a claim that Authup exposes that exact quartet: the inspected generic Authup contract uses `findMany`, `findOneById` and other qualified methods. chamvi retains its existing domain return shapes, absence as undefined, mutation atomicity and clock semantics. No generic ORM query language or adapter inheritance hierarchy was introduced.

## HTTP controllers and services

Pinned to authup commit `052c85a85`; paths under `apps/server-core/src/`.

| authup | chamvi (`packages/http/src/`) |
|---|---|
| `adapters/http/controllers/**/module.ts` (`@DController` classes, a `{ service }` constructor context, `@DBody`, `@DContext`, literal return types, `event.response.status = 201 \| 202`) | `<area>/controller.ts` or `<area>/controller/<name>.ts` (`agents`, `runs`, `connections`, `health`, `me`, `authorization`) |
| `core/entities/*/service.ts` (permission checks, validation, repository calls) | `<area>/service.ts` or `<area>/service/<name>.ts`, an `I<Name>Service` in `<area>/types.ts` |
| `adapters/http/middleware/built-in/loggedin/module.ts` (`ForceLoggedInMiddleware`) | `middleware/logged-in.ts` (same name), plus `middleware/json-body.ts` and `middleware/required-json-body.ts` |
| `app/modules/http/modules/controller.ts` (`HTTPControllerModule.mount`: builds each controller with its services, one `router.use(decorators({ controllers }))`) | `app/module.ts` (`createHttpApp`) |

Differences:

- Bodies: authup parses them with the `@routup/basic` body plugin (`adapters/http/middleware/built-in/basic.ts`). chamvi installs no body parser: its body middleware reads with chamvi's own `readJsonBody` (limits, 413 with drain, 415, 400) and fills `@routup/body`'s cache, so `@DBody()` returns that value.
- Caller: authup services take an `ActorContext` (`buildActorContext(event)`); chamvi services take the `principal` (`usePrincipal(event)`) as an argument.
- Responses: authup wraps records as `{ data, meta }`; chamvi keeps its own response shapes and adds no envelope.
- Wiring: authup resolves repositories and services from an `IContainer` per controller; `@chamvi/http` has no DI container and builds the services from the `HttpContext` in `createHttpApp`.
