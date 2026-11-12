# @chamvi/access

Permission checks over authup permission bindings, the same in Node.js and the browser. The public API of `packages/access/src/index.ts`; `@chamvi/core`, `@chamvi/http`, `@chamvi/app` (which re-exports it) and the dashboard use it.

```bash
npm install @chamvi/access --save
```

It depends on `@authup/access` and on no other `@chamvi/*` package. See [Permissions and authup](/guide/permissions) for the names, their attributes and the authup setup.

## Checks

```ts
function can(holder: PermissionHolder, name: string, options?: PermissionCheckOptions): Promise<boolean>;
function canSome(holder: PermissionHolder, name: string, options?: PermissionCheckOptions): Promise<boolean>;
```

`can` is true when one binding of that name passes for the resource in `options.attributes`; without attributes a policy over them fails (the check asks about every resource). `canSome` counts a policy whose data is missing as passed (may the holder do this to some resource?). `options.now` feeds the `date` and `time` policies (default the real clock), the holder's `identity` the `identity` policies. Both never reject: an entry that is not a binding or a policy that cannot be evaluated grants nothing.

## Names and helpers

```ts
const Permission: {
    AGENT_READ: 'chamvi_agent_read';
    AGENT_RUN: 'chamvi_agent_run';
    AGENT_APPROVE: 'chamvi_agent_approve';
    RUN_READ: 'chamvi_run_read';
    RUN_CANCEL: 'chamvi_run_cancel';
    STATE_READ: 'chamvi_state_read';
    STATE_WRITE: 'chamvi_state_write';
    CONNECTION_READ: 'chamvi_connection_read';
    CONNECTION_WRITE: 'chamvi_connection_write';
    CONNECTION_CREATE: 'chamvi_connection_create';
    TOOL_USE: 'chamvi_tool_use';
    KNOWLEDGE_READ: 'chamvi_knowledge_read';
    KNOWLEDGE_WRITE: 'chamvi_knowledge_write';
};
const PERMISSION_NAMES: readonly string[];                     // the thirteen, in this order

function isPermissionBinding(value: unknown): value is PermissionBinding;
function allPermissions(): PermissionBinding[];                // one unrestricted binding per name
function permissionNames(holder: PermissionHolder): string[];  // distinct granted names
```

<<< ../../../access/src/permission/types.ts{ts}
