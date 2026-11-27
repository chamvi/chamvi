<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="chamvi" width="96" height="96" />
</p>

<h1 align="center">@chamvi/errors</h1>

<p align="center">
    <b>chamvi's error classes, error codes and code-to-HTTP-status mapping, with guards that survive JSON.</b>
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/errors"><img src="https://img.shields.io/npm/v/@chamvi/errors" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/errors/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/errors" alt="License" /></a>
</p>

---

## Installation

```bash
npm install @chamvi/errors
```

The package is browser-safe and depends only on `@ebec/core`.

## Usage

Every error extends `ChamviError` (an `@ebec/core` `BaseError`) and carries a `code` from `ErrorCode`. Each class leaves a marker in its serialized instance chain, so its `is*Error` guard matches both an instance and its JSON round trip.

```ts
import {
    NotFoundError,
    httpStatusFromCode,
    isNotFoundError,
} from '@chamvi/errors';

const error = new NotFoundError('The run was not found.');

httpStatusFromCode(error.code); // 404

const rehydrated = JSON.parse(JSON.stringify(error));
isNotFoundError(rehydrated); // true
```

## API

| Export | Kind | Description |
|--------|------|-------------|
| `ChamviError` | class | The base error; takes a message or `ChamviErrorOptions` (`code`, `message`, `issues`, `cause`, `data`); `toJSON()` spreads `data` under the base fields |
| `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `RequestEntityTooLargeError`, `UnsupportedMediaTypeError`, `TooManyRequestsError`, `ServiceUnavailableError`, `InternalError` | classes | Built-ins with their code and the HTTP status text as default message |
| `ValidationError` | class | `new ValidationError(message, issues?)`, code `validation_error` |
| `EntityNotFoundError`, `EntityConflictError`, `EntityRelationError`, `EntityDeadlockError`, `EntityQueryError`, `EntityInvalidError` | classes | The storage errors a repository reports (see below) |
| `isChamviError`, `isBadRequestError`, ..., `isValidationError`, `isEntityNotFoundError`, ..., `isError` | functions | Guards that match by instance chain, also after JSON |
| `ErrorCode` | constant | Every error code chamvi uses |
| `ERROR_CODE_TO_STATUS`, `httpStatusFromCode(code, fallback = 400)` | constant, function | The default HTTP status per code |
| `normalizeError`, `serializeError` | functions | Turn a thrown value into an `Error`, an `Error` into a plain object |

## Storage errors

| Class | `code` | Extra field |
|-------|--------|-------------|
| `EntityNotFoundError` | `entity_not_found` | |
| `EntityConflictError` | `entity_conflict` | |
| `EntityRelationError` | `entity_relation_invalid` | `relation`: the referenced entity |
| `EntityDeadlockError` | `entity_deadlock` | |
| `EntityQueryError` | `entity_query_invalid` | |
| `EntityInvalidError` | `entity_invalid` | `operation`, and `field`: the column or constraint the storage named, if any |

Each takes a message or options with the entity's label (`new EntityNotFoundError({ entity: 'run' })`, message `The run was not found.`) and keeps it as `entity`. The message and the fields hold only the labels passed (`entity`, `relation`, `operation`, `field`); an option `ChamviErrorOptions` does not name is dropped, so a stored value given as an extra option (an id, a key) is neither in the message nor serialized (`data` is serialized by design). The repositories pass entity labels, the operation and a column or constraint name, never a stored value. An HTTP response never carries the message: `@chamvi/http` answers a storage error with a fixed text per code.

## License

Made with 💚

Published under [Apache License 2.0](./LICENSE).
