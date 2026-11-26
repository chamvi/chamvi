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
| `isChamviError`, `isBadRequestError`, ..., `isValidationError`, `isError` | functions | Guards that match by instance chain, also after JSON |
| `ErrorCode` | constant | Every error code chamvi uses |
| `ERROR_CODE_TO_STATUS`, `httpStatusFromCode(code, fallback = 400)` | constant, function | The default HTTP status per code |
| `normalizeError`, `serializeError` | functions | Turn a thrown value into an `Error`, an `Error` into a plain object |

## License

Made with 💚

Published under [Apache License 2.0](./LICENSE).
