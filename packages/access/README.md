<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/access" width="128" height="128" />
</p>

<h1 align="center">@chamvi/access</h1>

<p align="center">
    <b>Permission checks for chamvi.</b><br>
    Static permission names whose grants are authup policy bindings, evaluated with <code>@authup/access</code> in Node.js and the browser.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/access"><img src="https://img.shields.io/npm/v/@chamvi/access" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/access/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/access" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [Usage](#usage)
- [Permissions](#permissions)
- [can and canSome](#can-and-cansome)
- [License](#license)

## Installation

```bash
npm install @chamvi/access --save
```

ESM only, Node.js `>=26.0.0` or a browser. It depends on no other `@chamvi/*` package; `@chamvi/core`, `@chamvi/http`, `@chamvi/app` and the dashboard use it.

## Usage

A holder (a principal, a run's invoker) carries `permissions`: authup's `PermissionPolicyBinding`s, each a permission name with the policies that must pass for it. A binding without policies is unrestricted; a policy restricts it to some resources.

```typescript
import type { PermissionHolder } from '@chamvi/access';
import { Permission, can, canSome } from '@chamvi/access';

// an authup attributes policy over the resource
const onlyTriage = { type: 'attributes', query: { name: 'triage' } };

// may run every agent, and read only the agent "triage"
const principal: PermissionHolder = {
    permissions: [
        { permission: { name: Permission.AGENT_RUN } },
        { permission: { name: Permission.AGENT_READ }, policies: [onlyTriage] },
    ],
};

export async function checks() {
    const triage = { name: 'triage', private: false };
    const other = { name: 'other', private: false };

    return {
        runTriage: await can(principal, Permission.AGENT_RUN, { attributes: triage }),
        readTriage: await can(principal, Permission.AGENT_READ, { attributes: triage }),
        readOther: await can(principal, Permission.AGENT_READ, { attributes: other }),
        // a list route: may the principal read some agent?
        readSome: await canSome(principal, Permission.AGENT_READ),
    };
}
```

## Permissions

Any name is checkable (an app may check its own, such as `release_manage`). These are the names chamvi checks, exported as `Permission` and `PERMISSION_NAMES`; an `attributes` policy on a grant matches the resource attributes listed here.

| Name | Resource attributes |
|------|---------------------|
| `chamvi_agent_read` | `name`, `private` |
| `chamvi_agent_run` | `name`, `private` |
| `chamvi_agent_approve` | `name`, `private` |
| `chamvi_run_read` | `agent` |
| `chamvi_run_cancel` | `agent` |
| `chamvi_state_read` | `name` (the agent) |
| `chamvi_state_write` | `name` (the agent) |
| `chamvi_connection_read` | `name`, `type` |
| `chamvi_connection_write` | `name`, `type` |
| `chamvi_connection_create` | `type` |
| `chamvi_tool_use` | `agent`, `name` (the tool) |

`allPermissions()` returns one unrestricted binding per name, `permissionNames(holder)` the distinct granted names and `isPermissionBinding(value)` tells a binding from anything else.

## can and canSome

- `can(holder, name, { attributes, now })` is true when one binding of that name passes for the resource in `attributes`. Bindings of one name are a disjunction, the policies of one binding a conjunction (or the binding's `permission.decisionStrategy`). Without `attributes` a policy over them fails: the check asks about every resource.
- `canSome(holder, name, options)` treats a policy whose data is missing (no `attributes`, no `identity`) as passed: may the holder do this to some resource? A list route uses it, then checks each row with `can`.
- `now` feeds the `date` and `time` policies (default the real clock); the holder's `identity` feeds `identity` policies.
- Both fail closed and never reject: an entry that is not a binding, an unknown policy type and a `permissionBinding` policy node grant nothing.

## License

Published under [Apache License 2.0](./LICENSE).
