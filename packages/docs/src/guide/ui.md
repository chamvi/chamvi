# Dashboard

`@chamvi/ui` is a dashboard for the agents of an app: see what each agent does, start a run, watch runs live, answer approvals, look into agent state and see when cron subscriptions fire next. It is a prebuilt Vue 3 app (vuecs, the Glacier design) that your own `@chamvi/http` app serves on the same origin, so there is no CORS and no second deployment.

```bash
npm install @chamvi/ui --save
```

`uiRoutes()` returns the extra routes for `createHttpApp({ routes })`:

<<< @/snippets/ui.ts#tokens

Open `/ui/` and paste a token; the dashboard opens on the agents overview. Nothing of the dashboard runs on the server but one static file route; every page talks to the API it already has, with the signed-in principal's bearer token.

## Pages

| Page | Shows | Needs |
|---|---|---|
| Agents | A card per agent: its channel chips (GitHub events, cron expressions, hook paths, http), running and waiting runs, the next cron fire, a 24 h activity strip, the last run, the budget and the state collections; a name filter; a notice listing the [agent folders](/guide/agent-folders) that failed to load, with their messages. The landing page after sign-in. | `run:read` |
| Agent | The agent's budget, state collections and channel chips, Start run (with an `http.on()` subscription: a JSON payload sent to `POST /agents/:name/runs` as you) and View all runs, and four tabs: Overview (runs, failures, waiting approvals and tokens, recent runs, its waiting approvals, its subscriptions with route, hook or next fire), Runs (filtered by status), State (key-value entries and collections, read-only) and Schedules. | `run:read`; `agent:<name>:run` to start; `state:read` for State; `agent:<name>:read` for the runs and state of a [private agent](/guide/http#private-agents) |
| Runs | Every run, newest first (`GET /runs?sort=-createdAt`), filtered by agent and status in the address bar; running and waiting counts, failures and tokens of the last 24 h; tokens per run. Refreshes every 5 s. | `run:read` |
| Run | Status, budgets (steps, tokens, time), the envelope (channel, subscription, address, payload) and the step timeline (llm, tool and wait steps, inputs and outputs collapsed). For a [dispatched](/guide/dispatch) run, a "dispatched from" link to its parent; for a parent, its dispatched runs (agent, role, status, at most 100, refreshed as the run updates), the subtree token total, and a "Waits for N dispatched runs" callout while it waits on them. Listing dispatched runs needs `run:read`; an agent-scoped token sees a note instead. Live over the run's SSE stream, including the streamed text of the step in progress. A cancel button with a confirmation. | `run:read` or `agent:<name>:run`; `run:cancel` to cancel |
| Approvals | Each waiting run with the request's title and body, the tool, the channel it went out through, the expiry countdown and a reason field; a request with [options](/guide/approvals#offering-options) shows them as radios (one) or checkboxes (several), each `detail` preformatted in a closed `Details` block (a diff colored by line), and Approve waits for a fitting selection; [files](/guide/approvals#showing-files) of the request and of each option show as thumbnails with their filename (PNG, JPEG, GIF and WebP inline, a click opens them full size; any other type is a download); Approve or Deny (`POST /runs/:id/approve`). The sidebar shows the count. | `run:read` to list, `agent:<name>:approve` to answer |
| Schedules | The cron subscriptions per agent with the next fire time in the subscription's time zone. | `run:read` |
| Connections | The connections the app's modules expose (e.g. a [WhatsApp session](/deployment/whatsapp#session-store)) with type and status; a connection's page shows its live status and Reset session behind a confirmation in the page. Configuring a connection happens on its [page](#connection-pages). Listed in the sidebar only when there is a connection you may read. | `connection:<name>:read`; `connection:<name>:write` for the live view and reset |

Agent names link to the agent page from every other page. The 24 h figures come from the newest 100 runs (of the agent on its page, of the whole app on the overview and the runs page), since the API has no time filter: more runs than that in a day show `100+`. Only tools that need an approval are listed, because an agent may build its tool set per run.

A principal without the grant a page needs sees a notice naming it; the rest of the dashboard keeps working. An approval link from a channel's message needs read access to its run (`run:read` or `agent:<name>:run`) besides `agent:<name>:approve`.

## Connection pages

Mail, calendar, GitHub, Discord and WhatsApp connections are configured on their own pages, one package each. Add the page's module next to the provider's module:

| Page | Module | Package |
|---|---|---|
| Mail | `toolMailUiModule()` | `@chamvi/tool-mail-ui/module` |
| Calendar | `toolCalendarUiModule()` | `@chamvi/tool-calendar-ui/module` |
| GitHub | `githubUiModule()` | `@chamvi/github-ui/module` |
| Discord | `chatDiscordUiModule()` | `@chamvi/chat-discord-ui/module` |
| WhatsApp | `chatWhatsappUiModule()` | `@chamvi/chat-whatsapp-ui/module` |

```ts
import { toolMailModule } from '@chamvi/tool-mail/module';
import { toolMailUiModule } from '@chamvi/tool-mail-ui/module';
import { uiModule } from '@chamvi/ui/module';

const modules = [uiModule(), toolMailModule(), toolMailUiModule()];
```

Each page is served at `<uiBase>/ext/<slug>` and gets a sidebar item, shown to a principal who may read a connection of its type or holds `connections:create`. A connection without a page is listed under Connections and cannot be edited. A dashboard not at the default `/ui` needs the same value on both sides: `uiModule({ basePath: '/admin' })` and `toolMailUiModule({ uiBase: '/admin' })`. The sign-in modes of the package pages come only from the environment (`CHAMVI_UI_AUTHUP_CLIENT_ID`, `AUTHUP_URL`, `CHAMVI_UI_AUTHUP_REALM_ID`): `uiModule({ auth })` in code configures the dashboard alone, so a deployment using it needs the same values in the environment for the package pages.

A page shows one state per field:

| The field | The form |
|---|---|
| Unset or stored | Editable |
| Set from env or a `_FILE` variable | Locked, naming the variable; env wins over a stored value |
| A stored secret | "Set", with Replace and Clear; a value is never shown or returned by the API |

Saved values take effect at the next start; the page shows "Saved. Restart the app to apply." until a process has loaded them. Saving a secret, or anything that creates a stored connection, needs `CHAMVI_ENCRYPTION_KEYS` and is refused with a message naming it otherwise. Clearing a required secret is allowed and leaves the connection `incomplete` (a `chamvi start --check` issue, not a failed start, unless an env field is set too).

The accounts column and the Connections overview show `not configured`, `incomplete` (with what is missing or why the last start refused it, such as a missing `CHAMVI_PUBLIC_URL`) or `configured`; a connection with nothing running in this process, as mail and calendar always are, reads `configured` and not `disconnected`. **Test** checks the saved values only, never what is typed in the form: mail logs in over IMAP and out again, calendar logs in over CalDAV, GitHub calls `GET /app` with the App JWT and Discord calls `GET /users/@me`, each within 30 seconds and answering a generic reason on failure. Changing a field that decides where a secret is sent (the mail host, port or security, the calendar URL, the GitHub API URL) needs every stored secret entered again, and is refused while one of them comes from the environment.

Editing and deleting need `connection:<name>:write`, adding an account of a multi-account type (mail, calendar) `connections:create`. Deleting is offered for stored accounts only; an account declared in env or a module cannot be deleted.

::: warning Grant `connections:create` like a credential
Env wins over a stored value field by field, also for an account added here. A leftover variable such as `CHAMVI_MAIL_WORK_PASSWORD` therefore becomes the password of an account `work` that someone with `connections:create` adds, with a host of their choosing, from the next start on; a test or a tool call then sends it there. Remove the variables of accounts you no longer declare, give `connections:create` only to principals you would trust with those secrets, and keep the app's outbound network limited (the chart's egress policy).
:::

## Sign-in

- **Token** (default): a static bearer token of `staticTokens()`. `GET /me` checks it before it is kept, in the tab's `sessionStorage` only; sign-out removes every `chamvi.` key but a pending approval link. Only a 401 drops a stored token: a reload while the API restarts or rate limits keeps it, and the next navigation tries again.
- **authup**: `auth.authup` adds "Continue with authup", the OIDC code flow with PKCE through `@authup/client-web-kit`, whose tokens are kept in the tab's `sessionStorage` (`chamvi.authup.*`), never in cookies. The authup client needs `<origin><uiBase>/login/callback` as a redirect URI. Pair it with the app's `authup()` authenticator. `auth.tokens: false` hides the token form (then `auth.authup` is required).

<<< @/snippets/ui.ts#authup

A revoked token or an expired authup session answers 401: the dashboard refreshes the authup session once, else signs out and returns to the sign-in page with the page it was on as the way back.

## Approval links

A channel's approval message (GitHub, OpenClaw, a channel you write) links a person straight to an approval by run, without a token: `<origin><uiBase>/approvals?run=<runId>&approval=<approvalId>` (`approval` is optional and then means the approval the run waits on when the page opens). A signed-out visit goes through sign-in, the token form or the authup round-trip, and comes back to the same URL. Signed in, the dashboard scrolls to that run's approval card, highlights and focuses it; Approve and Deny answer through `POST /runs/:id/approve` as the signed-in principal, so the link is only as powerful as the person who opens it. The page reads the run with `GET /runs/:id` (`run:read` or `agent:<name>:run`) and follows it with the inbox poll:

| The run | The page shows |
|---|---|
| waits on that approval | the highlighted card |
| waits on another approval | a notice linking the run; the new approval is listed in the inbox |
| no longer waits (answered, finished) or the approval expired | a notice linking the run |
| waits, but the principal lacks `agent:<name>:approve` | a 403 notice naming the grant, and the card without Approve and Deny |
| is not readable with the principal's grants | a 403 notice |
| does not exist | "not found" |

Every answer goes through `POST /runs/:id/approve` by approval id, as the signed-in principal; a run that moved on to another approval answers 409.

## Serving

| Option | Default | |
|---|---|---|
| `basePath` | `'/ui'` | The dashboard's path under the app's `basePath`, lower case |
| `auth.tokens` | `true` | Offer the token form |
| `auth.authup` | none | `{ url, clientId, realmId? }` |
| `root` | the package's `dist/app` | Another build folder |

- Every `GET` below `basePath` answers a file of the build, `index.html` for any other path without an extension (the client routes), or 404. Hashed files under `assets/` are cached for a year (`immutable`), the rest `no-cache`.
- `index.html` gets `<base href="<uiBase>/">` and the config (`apiBase`, `uiBase`, the sign-in modes) as a JSON block, so the same build works under any `basePath`.
- Paths are decoded once and refused on `..`, `.`, empty segments, backslashes, NUL and double encoding: nothing outside the build is read.
- Every answer carries a Content-Security-Policy (`default-src 'self'`, scripts only from the build, `connect-src` and `form-action` add the authup origin, images also from `blob:` (approval files, read with the bearer token), `frame-ancestors 'none'`), `x-content-type-options: nosniff`, `x-frame-options: DENY` and `referrer-policy: no-referrer`. Fonts and icons are part of the build; nothing loads from a CDN.
- The route checks no credentials (the build holds no secret) and skips the rate limiter.

Behind a proxy that mounts the app under a prefix, set the app's `basePath`; the dashboard and the [connection pages](#connection-pages) follow it. Invalid options throw `InvalidAgentDefinitionError`; a missing build is reported on the first request (500 and `onError`), so the build may land later, e.g. in a container image.

## Live updates

The runs list and the inbox poll every 5 s. The run page follows `GET /runs/:id/stream` with a fetch-based reader (an `EventSource` cannot send the bearer header): after a dropped connection it reconnects with the last step index as `Last-Event-ID` (1, 2, 5, then every 10 s, or the `Retry-After` of a 503 from the stream cap), so a step is never lost or shown twice. Streamed text belongs to the model step in progress and gives way to the step once it is stored.
