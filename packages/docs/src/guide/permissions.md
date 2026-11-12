# Permissions and authup

A principal (a static token, an authup login, an `oidc()` mapping) and a run's invoker carry `permissions`: a list of **permission bindings**, authup's `PermissionPolicyBinding` with its policy trees resolved. A binding names one permission and the policies that must pass for it:

```json
{ "permission": { "name": "chamvi_agent_run" }, "policies": [{ "type": "attributes", "query": { "name": "triage" } }] }
```

Permission names are static. A binding without `policies` is unrestricted; an authup policy narrows it to some resources, for example an `attributes` policy over the resource's attributes to one agent or one connection. The check is `can()` of `@chamvi/access` (re-exported by `@chamvi/app`), the same function the server, core and the dashboard use, so a button and the route behind it agree.

## Names

These are the names chamvi checks, exported as `Permission` (`Permission.AGENT_RUN`, ...) and `PERMISSION_NAMES`. The attributes are what an `attributes` policy matches.

| Name | Attributes | Grants |
|---|---|---|
| `chamvi_agent_run` | `name`, `private` | Start the agent's runs (REST, MCP `run_<name>`, `webhookChannel()` deliveries, a cross-agent [dispatch](/guide/dispatch)) and read them when the agent is not private |
| `chamvi_agent_read` | `name`, `private` | Read the agent's runs and, for a [private agent](/guide/http#private-agents), its state; unrestricted, list every run |
| `chamvi_agent_approve` | `name`, `private` | Answer the agent's approvals (`POST /runs/:id/approve`, MCP `approve_run`) |
| `chamvi_run_read` | `agent` | Read and list a public agent's runs; list the agents and schedules |
| `chamvi_run_cancel` | `agent` | Cancel the agent's runs |
| `chamvi_state_read` | `name` (the agent) | Read the agent's state |
| `chamvi_state_write` | `name` (the agent) | Write the agent's state |
| `chamvi_connection_read` | `name`, `type` | See a connection, its status and its configuration |
| `chamvi_connection_write` | `name`, `type` | Also its widgets (a pairing QR), its live stream, reset, edit, test and delete; implies read |
| `chamvi_connection_create` | `type` | Add an account of a multi-account type (mail, calendar) |
| `chamvi_tool_use` | `agent`, `name` (the tool) | Read by [`requireToolPermission()`](/guide/tools#restricting-tools-per-invoker): the agent offers the tool to the invoker's runs |

Any other name works too: a principal may do X when it holds a binding for X whose policies pass. An app checks its own names with `can(invoker, 'release_manage')` (see [Restricting tools per invoker](/guide/tools#restricting-tools-per-invoker)); `@chamvi/knowledge` checks `knowledge:read` and `knowledge:write`.

## How a check reads a binding

- Bindings of one name are alternatives: one that passes is enough. The policies of one binding must all pass (or follow the binding's `permission.decisionStrategy`).
- A route on one resource checks with that resource's attributes. An agent route checks before it answers 404, and an agent the app does not hold counts as `private: true`. A run route answers 404 for an unknown run and for a private agent's run the principal may not read, 403 for any other run it may not read.
- A collection (a list route, a sidebar item) asks whether the principal may do it to some resource: a policy whose data is missing counts as passed. Each row is then checked with its own attributes.
- `date` and `time` policies are evaluated at each check with the engine's clock, also later in a run: the invoker is a snapshot, its policies are not.
- An `identity` policy sees the authup identity (`type`, `id`, `realmId`, ...); static tokens and `oidc()` principals have none, so it fails for them.
- Fail closed: an entry that is not a binding, a policy type `@chamvi/access` does not know, or a policy that cannot be evaluated grants nothing. A check never throws.

## Static tokens and OIDC

`CHAMVI_TOKENS` (and `staticTokens()`) take `"*"` (every `chamvi_*` name, unrestricted) or a list of bindings:

```bash
export CHAMVI_TOKENS='[
  { "value": "<admin secret>", "id": "admin", "permissions": "*" },
  { "value": "<ci secret>", "id": "ci", "permissions": [
    { "permission": { "name": "chamvi_agent_run" }, "policies": [{ "type": "attributes", "query": { "name": "deploy" } }] },
    { "permission": { "name": "chamvi_run_read" }, "policies": [{ "type": "attributes", "query": { "agent": "deploy" } }] }
  ] }
]'
```

Anything else, an old string such as `"agent:deploy:run"` or `"*"` inside the list included, fails the start with `InvalidAgentDefinitionError` naming the entry. A token has no realm, so `realmScope` on its bindings is ignored. The `principal` mapper of `oidc()` returns the same shape (see [Authentication](/guide/http#authentication-and-permissions)).

## authup {#authup}

`authup()` (and `authupModule()` of `@chamvi/app/authup`) turns each grant of a login into a binding:

- Only tokens with the `global` scope and a user or client subject carry grants.
- The binding's policies are the permission definition's own policy trees, without their `permissionBinding` check, followed by the policies on the grant (the role's or the user's assignment). They come from authup's catalog (`GET /authorization`), read with chamvi's own client, cached for a minute and read again when a grant names a definition or policy the copy lacks.
- Realm reach is settled at login: chamvi's resources belong to the realm of its authup client. A grant with reach `own` works for identities of that realm; identities of other realms need reach `any`.
- A grant this copy cannot express exactly (a definition with `policies: null`, a policy tree it cannot project, a `permissionBinding` check under `invert` or a non-unanimous composite, a definition owned by another realm or by a client) is dropped; the other grants still apply.
- A grant whose policies hold a `realmMatch` policy grants nothing: a chamvi resource carries no realm, so the policy cannot be answered. Restrict by realm with the grant's realm scope instead.
- A catalog that cannot be read (the client lacks `permission_read` with reach `ownOrNull` or wider, authup is down) gives the login no permissions and reports the error to `onError` (the app's logger); the start does not fail and static tokens keep working.

With `@chamvi/app`, `authupModule()` reads `AUTHUP_URL`, `AUTHUP_CLIENT_ID` and `AUTHUP_CLIENT_SECRET`. That client needs the `client_credentials` grant and the permissions `permission_read` (the catalog) and `token_introspect` (verifying logins, and finding its own realm), granted with a realm scope of `ownOrNull` or wider. authup's default reach `own` does not reach its global permission definitions: the catalog is then refused, or served with `policies: null` for the `chamvi_*` definitions, and every authup login gets no permissions (reported to `onError`). A client's direct permissions take no reach in a provisioning file, so the file below grants them through a role.

### Provisioning

A ready [authup provisioning file](https://authup.org/guide/deployment/provisioning) for the eleven permissions, chamvi's client, an unrestricted role and a role restricted to the agent `triage`:

```yaml
# provisioning/chamvi.yaml
permissions:
  - attributes: { name: chamvi_agent_read }
  - attributes: { name: chamvi_agent_run }
  - attributes: { name: chamvi_agent_approve }
  - attributes: { name: chamvi_run_read }
  - attributes: { name: chamvi_run_cancel }
  - attributes: { name: chamvi_state_read }
  - attributes: { name: chamvi_state_write }
  - attributes: { name: chamvi_connection_read }
  - attributes: { name: chamvi_connection_write }
  - attributes: { name: chamvi_connection_create }
  - attributes: { name: chamvi_tool_use }

policies:
  # the agent triage, for the agent permissions
  - attributes: { name: chamvi-agent-triage, type: attributes }
    extraAttributes:
      query: { name: triage }
  # the runs of triage, for chamvi_run_read and chamvi_run_cancel
  - attributes: { name: chamvi-runs-of-triage, type: attributes }
    extraAttributes:
      query: { agent: triage }

roles:
  - attributes: { name: chamvi-admin }
    relations:
      globalPermissions:
        - chamvi_agent_read
        - chamvi_agent_run
        - chamvi_agent_approve
        - chamvi_run_read
        - chamvi_run_cancel
        - chamvi_state_read
        - chamvi_state_write
        - chamvi_connection_read
        - chamvi_connection_write
        - chamvi_connection_create
        - chamvi_tool_use
  - attributes: { name: chamvi-triage }
    relations:
      globalPermissions:
        - chamvi_agent_run
        - chamvi_agent_read
        - chamvi_agent_approve
        - chamvi_run_read
  # chamvi's own client: the catalog needs the global definitions in reach
  - attributes: { name: chamvi-client }
    relations:
      globalPermissions:
        - permission_read
        - token_introspect
      globalPermissionsRealmScope: ownOrNull

realms:
  - attributes: { name: master }
    relations:
      clients:
        - attributes:
            name: chamvi
            authMethod: secret
            secret: replace-with-a-strong-secret
            secretHashed: true
            grantTypes: client_credentials
          relations:
            globalRoles:
              - chamvi-client
```

authup's built-in `admin` role receives every permission it creates, so an admin login works once the names exist. A provisioning file assigns grants without policies, so `chamvi-triage` is unrestricted until its grants carry a policy: attach `chamvi-agent-triage` to the role's grants of `chamvi_agent_run`, `chamvi_agent_read` and `chamvi_agent_approve`, and `chamvi-runs-of-triage` to `chamvi_run_read`, in the admin console (the role's permissions) or through the API:

```bash
# the role's grant of chamvi_agent_run, by its id from GET /role-permissions
curl -X POST "$AUTHUP_URL/role-permissions/<id>" \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{ "policyId": "<id of chamvi-agent-triage>" }'
```

A user of the client's realm (`master` here) with `chamvi-triage` then starts, reads and approves `triage` only, and sees only its runs. Users of other realms need the grants' reach set to `any`. A role for a WhatsApp operator holds `chamvi_connection_write` with a policy `{ "name": "<connection>" }`: it sees that connection's page, its QR and Reset session, and no other connection.

## Upgrading

The permission strings of earlier releases (`agent:<name>:run`, `run:read`, `connection:<name>:write`, `tool:<agent>:<tool>`, `*`) are not translated.

1. Let running and waiting runs finish (drain the app) before the upgrade: a stored run's invoker that carries old strings is read as holding no permissions, so its `requireToolPermission()` tools and cross-agent dispatches are refused.
2. Rewrite every `CHAMVI_TOKENS` entry: `["*"]` becomes `"*"`, any other list a list of bindings. The start fails until then.
3. In authup, create the eleven permissions (the file above) and give roles the new names; remove the old ones. A restriction to one agent or connection is a policy on the grant.
4. `"*"` covers only the eleven `chamvi_*` names. With `@chamvi/knowledge`, grant `knowledge:read` and `knowledge:write` explicitly (a token's binding list, or permissions of those names in authup); a `"*"` token, the `chamvi dev` one included, gets 403 on `/knowledge`.
5. An `oidc()` mapper returns bindings; an app's own `hasPermission(invoker.permissions, ...)` becomes `await can(invoker, ...)`.

| Before | Now |
|---|---|
| `agent:<name>:run`, `:read`, `:approve` | `chamvi_agent_run`, `chamvi_agent_read`, `chamvi_agent_approve` with `{ "name": "<name>" }` |
| `run:read`, `run:cancel` | `chamvi_run_read`, `chamvi_run_cancel` (optionally `{ "agent": "<name>" }`) |
| `state:read`, `state:write` | `chamvi_state_read`, `chamvi_state_write` (optionally `{ "name": "<agent>" }`) |
| `connection:<name>:read`, `:write` | `chamvi_connection_read`, `chamvi_connection_write` with `{ "name": "<name>" }` |
| `connections:create` | `chamvi_connection_create` (optionally `{ "type": "mail" }`) |
| `tool:<agent>:<tool>` | `chamvi_tool_use` with `{ "agent": "<agent>", "name": "<tool>" }` |
| `*` | `"*"` for a static token, the `chamvi-admin` role in authup |
