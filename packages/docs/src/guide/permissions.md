# Permissions and authup

A principal and a run's invoker hold their grants in one of two forms. A static token, an `oidc()` mapping or a direct dispatch carries `bindings`: a list of **permission bindings**, authup's `PermissionPolicyBinding` with its policy trees resolved. An authup login carries `authorization` instead (see [authup](#authup)), with `bindings` empty. A check passes when either form passes. A binding names one permission and the policies that must pass for it:

```json
{ "permission": { "name": "chamvi_agent_run" }, "policies": [{ "type": "attributes", "query": { "name": "triage" } }] }
```

Permission names are static. A binding without `policies` is unrestricted; an authup policy narrows it to some resources, for example an `attributes` policy over the resource's attributes to one agent or one connection. The check is `can()` of `@chamvi/access` (re-exported by `@chamvi/app`), the function the server and core use. The dashboard does not run it: it asks `POST /authorization/check` ([HTTP API](/guide/http)), which answers with `canSome`. A button is a pre-gate from that answer (a policy that needs an agent or connection passes), the route behind it decides per resource, and a refused action shows the permission it needs.

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
| `chamvi_knowledge_read` | `name` (the collection) | Read the [knowledge](/guide/knowledge) collections and their documents (`GET /knowledge/...`) |
| `chamvi_knowledge_write` | `name` (the collection) | Create, delete and sync collections and write the documents of managed ones |
| `chamvi_component_read` | `name`, `kind` (`job` or `channel`) | List the background components and the channels' status (`GET /components`); a restricted grant lists the components it covers |

Any other name works too: a principal may do X when it holds a binding for X whose policies pass. An app checks its own names with `can(invoker, 'release_manage')` (see [Restricting tools per invoker](/guide/tools#restricting-tools-per-invoker)).

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

Anything else, an old string such as `"agent:deploy:run"` or `"*"` inside the list included, fails the start with `InvalidAgentDefinitionError` naming the entry. A token has no realm, so `realmScope` on its bindings is ignored, and a binding whose policies hold a `realmMatch` node grants nothing (its other bindings still apply). The `principal` mapper of `oidc()` returns the same shape (see [Authentication](/guide/http#authentication-and-permissions)).

## authup {#authup}

`authup()` (and `authupModule()` of `@chamvi/app/authup`) gives a login authup's own two-layer **authorization snapshot**, `authorization: { snapshot, realm, client? }`, evaluated by `@authup/access` exactly as the authup server evaluates it:

- Only tokens with the `global` scope and a user or client subject carry grants.
- `snapshot` holds the permission definitions with their policy trees and the login's grants (realm reach and the policies on the grant, the role's or the user's assignment), built by `buildAuthorizationSnapshot` from authup's catalog (`GET /authorization`, read with chamvi's own client, cached for a minute and read again when a grant names a definition or policy the copy lacks). It keeps every `chamvi_*` definition and every other definition the login holds a grant of; an app's own permission without a grant therefore denies, even where its definition would pass on the server. It is plain JSON, so a run's invoker stores it.
- `realm` is the realm of chamvi's authup client: chamvi's resources belong to it. Every check reaches into it: a grant with reach `own` works for identities of that realm; identities of other realms need reach `any`. A definition owned by that realm is checked by its plain name; one owned by another realm or by a client is never reached, unless the [owner is the client](#owner-client).
- A definition the catalog withholds (`policies: null`) or whose policy tree cannot be read denies its grants; the other grants still apply.
- A catalog or realm that cannot be read (the client lacks `permission_read` with reach `ownOrNull` or wider, authup is down) gives the login no `authorization` and reports the error to `onError` (the app's logger); the start does not fail and static tokens keep working.
- Every call to authup has a deadline: `timeoutMs` of `authupModule()`, else `AUTHUP_TIMEOUT_MS`, default 10 000 ms. A token verification that does not answer in time, or cannot reach authup, is a 503 (not a 401); a catalog read or realm lookup that does not answer in time counts as a failed read, and the next login tries again.

With `@chamvi/app`, `authupModule()` reads `AUTHUP_URL`, `AUTHUP_CLIENT_ID`, `AUTHUP_CLIENT_SECRET` and the optional `AUTHUP_TIMEOUT_MS` and `AUTHUP_PERMISSION_OWNER`. That client needs the `client_credentials` grant and the permissions `permission_read` (the catalog) and `token_introspect` (verifying logins, and finding its own realm), granted with a realm scope of `ownOrNull` or wider. authup's default reach `own` does not reach its global permission definitions: the catalog is then refused, or served with `policies: null` for the `chamvi_*` definitions, and every authup login gets no permissions (reported to `onError`). A client's direct permissions take no reach in a provisioning file, so the file below grants them through a role.

### Provisioning

A ready [authup provisioning file](https://authup.org/guide/deployment/provisioning) for the fourteen permissions, chamvi's client, an unrestricted role and a role restricted to the agent `triage`:

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
  - attributes: { name: chamvi_knowledge_read }
  - attributes: { name: chamvi_knowledge_write }
  - attributes: { name: chamvi_component_read }

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
        - chamvi_knowledge_read
        - chamvi_knowledge_write
        - chamvi_component_read
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

### Who owns the permissions {#owner-client}

By default the permissions are global or owned by chamvi's realm (the file above). Several chamvi deployments sharing one realm then share the definitions too: a grant of `chamvi_run_read` given for one deployment applies in all of them.

Client ownership gives each deployment its own. Set `AUTHUP_PERMISSION_OWNER=client` (or `authupModule({ permissionOwner: 'client' })`; the default is `realm`, any other value fails the start): the dashboard client users sign in with owns the permissions, the one `CHAMVI_UI_AUTHUP_CLIENT_ID` names (or `uiModule({ auth })` in code), not chamvi's own `AUTHUP_CLIENT_ID`. Then every name chamvi checks on an authup login, the fourteen `chamvi_*` ones and an app's own such as `release_manage`, is checked only as the definition owned by that client in chamvi's realm. Global and realm-owned definitions grant nothing, so a leftover never applies. authup applies a user's client-owned grants only through tokens issued to that client (or to no client, and chamvi does the same), so the same user signs in to every deployment and holds grants per deployment.

| | Realm mode (default) | Client mode |
|---|---|---|
| Set by | `AUTHUP_PERMISSION_OWNER=realm` (default) | `AUTHUP_PERMISSION_OWNER=client` / `permissionOwner: 'client'` |
| A check asks | the global definition, then the realm-owned one | only the one owned by the client in chamvi's realm |
| A grant applies | through any login of the realm | through tokens issued to the owner client |

- The dashboard client may be given by id (used as is; a uuid-shaped value is always an id) or by name, and must belong to chamvi's realm (an owner in another realm denies every authup login). A name is resolved once through authup's client API in chamvi's realm, so chamvi's client then also needs `client_read`: at start for a serving app, at the first login with grants for `run-job`, `migrate` and `start --check` (which then grants nothing until it resolves). Client mode without a dashboard client, or at a serving start a name that matches no client or several, or a lookup that fails or exceeds the deadline, fails the start. chamvi never falls back to realm mode.
- Machine clients (peers, CI, other API clients) are not narrowed, but in client mode their global or realm-owned grants of `chamvi_*` count no longer: grant them the owner client's definitions (`clientPermissions: { <dashboard client>: [...] }` on their role or client) before switching.
- The catalog serves client-owned definitions of chamvi's realm to chamvi's `permission_read`; nothing else changes on chamvi's client.
- A run stores the owner with its invoker, so it keeps the mode it was dispatched in after a switch. Static tokens and `oidc()` bindings are not affected.

In client mode the dashboard client owns both the permissions and the roles that bind them; chamvi's own client owns neither. The provisioning file declares them under the dashboard client and binds the roles with `clientPermissions`. Users get those client roles assigned, in the file with `clientRoles` or later in authup (a user's role of the dashboard client). Every role that binds the permissions moves to the client, and an app's own names follow too:

```yaml
realms:
  - attributes: { name: master }
    relations:
      clients:
        - attributes: { name: agents-dashboard, authMethod: none }
          relations:
            permissions:
              - attributes: { name: chamvi_agent_read }
              - attributes: { name: chamvi_agent_run }
              # ... the other twelve chamvi_* names, and the app's own
            roles:
              - attributes: { name: chamvi-admin }
                relations:
                  clientPermissions:
                    agents-dashboard: [chamvi_agent_read, chamvi_agent_run]
      # optional: users may also get the client role later in authup
      users:
        - attributes: { name: alice }
          relations:
            clientRoles:
              agents-dashboard: [chamvi-admin]
```

chamvi's own client keeps its role from the file above, with `client_read` added to `globalPermissions` when the dashboard client is given by name.

To move a realm from realm to client ownership: provision the client-owned permissions and roles, switch every deployment sharing the realm to `AUTHUP_PERMISSION_OWNER=client`, then remove the realm-owned or global `chamvi_*` definitions and the roles binding them.

## Upgrading

The permission strings of earlier releases (`agent:<name>:run`, `run:read`, `connection:<name>:write`, `tool:<agent>:<tool>`, `*`) are not translated.

1. Let running and waiting runs finish (drain the app) before the upgrade: a stored run's invoker that carries old strings is read as holding no permissions, so its `requireToolPermission()` tools and cross-agent dispatches are refused.
2. Rewrite every `CHAMVI_TOKENS` entry: `["*"]` becomes `"*"`, any other list a list of bindings. The start fails until then. `"*"` covers every `chamvi_*` name, the two knowledge permissions included (as `*` did): a token that must not read or write knowledge collections gets explicit bindings without them.
3. In authup, create the fourteen permissions (the file above) and give roles the new names; remove the old ones. A restriction to one agent or connection is a policy on the grant.
4. An `oidc()` mapper returns `bindings`; an app's own `hasPermission(invoker.permissions, ...)` becomes `await can(invoker, ...)`.
5. Upgrade the authup server to 1.0.0-beta.75 or later before chamvi: a policy type newer than the checking side denies. A run stored before this release carries its grants under `permissions` and no `bindings` or `authorization`: it grants nothing, so drain the app first (step 1).

| Before | Now |
|---|---|
| `agent:<name>:run`, `:read`, `:approve` | `chamvi_agent_run`, `chamvi_agent_read`, `chamvi_agent_approve` with `{ "name": "<name>" }` |
| `run:read`, `run:cancel` | `chamvi_run_read`, `chamvi_run_cancel` (optionally `{ "agent": "<name>" }`) |
| `state:read`, `state:write` | `chamvi_state_read`, `chamvi_state_write` (optionally `{ "name": "<agent>" }`) |
| `connection:<name>:read`, `:write` | `chamvi_connection_read`, `chamvi_connection_write` with `{ "name": "<name>" }` |
| `connections:create` | `chamvi_connection_create` (optionally `{ "type": "mail" }`) |
| `tool:<agent>:<tool>` | `chamvi_tool_use` with `{ "agent": "<agent>", "name": "<tool>" }` |
| `knowledge:read`, `knowledge:write` | `chamvi_knowledge_read`, `chamvi_knowledge_write` (optionally `{ "name": "<collection>" }`) |
| `*` | `"*"` for a static token, the `chamvi-admin` role in authup |
