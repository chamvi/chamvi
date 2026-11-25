# @chamvi/tool-calendar

Calendar tools for chamvi agents: the calendars and events of CalDAV accounts (iCloud, Fastmail, Nextcloud, ...), recurring events expanded in one time zone, read without ever changing a calendar, plus guarded `calendar_create` and `calendar_delete`. The public API of `packages/tool-calendar/src/index.ts` and its `/module` entry. See [Mail and calendar tools](/guide/tools#mail-and-calendar-tools) for an example.

```bash
npm install @chamvi/tool-calendar @chamvi/core ai --save
```

`@chamvi/core` and `ai` are peer dependencies; `@chamvi/app` is an optional peer of `@chamvi/tool-calendar/module`.

## calendarTools

```ts
function calendarTools(options?: CalendarToolsOptions): ToolSet; // { calendar_list, calendar_events }
function createCalendarClient(accounts: CalendarAccount[], options?: CalendarClientOptions): ICalendarClient;

const CALENDAR_REQUEST_ERROR_CODE: 'calendar_request';
const CALENDAR_DEFAULT_TIMEZONE: 'Europe/Berlin';
const CALENDAR_TIMEOUT_MS: 30_000;
const CALENDAR_RANGE_MAX_DAYS: 92;
const CALENDAR_EVENTS_DEFAULT_LIMIT: 100;
const CALENDAR_EVENTS_MAX_LIMIT: 500;
const CALENDAR_DESCRIPTION_MAX_CHARS: 2000;
const CALENDAR_FIELD_MAX_CHARS: 500;
const CALENDAR_EXPAND_MAX_ITERATIONS: 10_000;
```

The tools use `client`, else a client of `accounts`, else the client the module [provided on the engine](#toolcalendarmodule) (without one, each call fails with `context_not_provided`). Throws `InvalidAgentDefinitionError` for options that are no object, `accounts` and `client` together, an account without an `id` (`^[a-z0-9]+(-[a-z0-9]+)*$`, at most 64), an http(s) `url`, a `user` or a `password`, a duplicate id, a `timezone` that is no IANA zone id, a `fetch` that is no function, a `timeoutMs` that is no integer from 1 to 2^31 - 1 and a clock without `now()` and `setTimeout()`. No message echoes a password.

| Tool | Input | Result |
|---|---|---|
| `calendar_list` | none | `{ calendars: CalendarView[] }`: id, account, name, color and zone of every calendar that holds events |
| `calendar_events` | `from`, `to`, `calendar?`, `limit?` (default 100, at most 500) | `CalendarEventsResult`: events sorted by start (each with an `id` for `calendar_delete` when its resource sits directly in the calendar and has an ETag), `truncated` when more matched |

- **Read-only.** `calendarTools()`: every request goes through a fetch that lets only `PROPFIND`, `REPORT` and `GET` pass; any other method throws before a request is sent.
- **Calendar ids** are `<account>:<last path segment of the calendar URL>`; reminder lists are not listed.
- **Range.** `from` and `to` are ISO dates (midnight in the zone) or date-times; `to` is exclusive, after `from` and at most 92 days later.
- **Recurrence.** Recurring events are expanded here, not by the server: moved occurrences replace their slot, `EXDATE`s are dropped, cancelled ones are kept with `status: 'CANCELLED'`; a series stops after 10 000 iterations.
- **Zone.** Times are ISO with the offset of `timezone`, whatever the process zone is; a `TZID` without its `VTIMEZONE` is read in that zone when it is an IANA id. All-day events give plain dates, `end` exclusive.
- **Errors.** A malformed input or an unknown calendar is a `ValidationError`; a failed request (credentials, a timeout after `timeoutMs` on the clock, an unreachable server) a `ChamviError` with code `calendar_request` and the message `<tool>: <account>: request failed` (or `timed out`), never the server's text or a credential.

The read tools declare `trust: { taint: true }`: a result taints the run.

## calendarWriteTools

```ts
function calendarWriteTools(options?: CalendarWriteToolsOptions): ToolSet; // { calendar_create, calendar_delete }
function createCalendarWriteClient(accounts: CalendarAccount[], options?: CalendarClientOptions): ICalendarWriteClient;

type CalendarWriteToolsOptions = CalendarClientOptions & {
    accounts?: CalendarAccount[];
    client?: ICalendarWriteClient;
    classifier?: { model?: ModelRef };            // judges a routine delete, default the agent's model
    createLimit?: CalendarLimitSettings | false;  // default 20 an hour, bucket 'creates'
    deleteLimit?: CalendarLimitSettings | false;  // default 20 an hour, bucket 'deletes'
    calendars?: string[];                         // the calendar ids the tools may write to, default every listed one
};

type CalendarLimitSettings = { max?: number; windowMs?: number; bucket?: string };

const CALENDAR_WRITE_ALLOWED_METHODS: readonly ['PROPFIND', 'GET', 'PUT', 'DELETE'];
const CALENDAR_CREATE_LIMIT_MAX: 20;
const CALENDAR_DELETE_LIMIT_MAX: 20;
```

The tools use `client`, else a client of `accounts`, else the write client the module provided on the engine. They need an engine with a `limitService` unless both limits are `false`. Options that are no object, `accounts` and `client` together, a `calendars` that is no list of strings and malformed limits throw `InvalidAgentDefinitionError`.

| Tool | Input | Result |
|---|---|---|
| `calendar_create` | `calendar`, `title`, `start`, `end`, `allDay?`, `location?`, `description?`, `attendees?` (at most 50) | `{ calendar, uid, event?, start, end, allDay, invited }` |
| `calendar_delete` | `event`, `series?` | `{ event, calendar, status: 'deleted' \| 'missing', backup? }` |

- **Write guard.** A separate client with its own fetch: only `PROPFIND`, `GET`, `PUT` and `DELETE` pass (never `REPORT`), a `PUT` carries `If-None-Match: *`, a `DELETE` `If-Match` with one version (never `*` or a list), and writes use `redirect: 'manual'`. An event resource is a name directly inside a listed `VEVENT` calendar; names with a slash, backslash, dot segment or percent-encoded slash or dot are refused before any request.
- **Create.** The UID and the resource name derive from the call (its effect key), so a replay finds the event (`If-None-Match` answered `412`, or a `GET`) instead of creating it twice. Times without an offset are read in the configured zone; the wire carries UTC or plain dates and results and approvals use the zone. With `attendees` it always asks, showing the organizer (`From:`), every attendee and the whole description; attendees need a calendar address of the account and are plain printable ASCII. Without attendees it runs unapproved. Every create, invitations included, counts in `createLimit` (bucket `creates`).
- **Delete.** The limit runs first, before the tool (its approval lists the event and covers the call); a call that passed it counts even when the tool then refuses it (a changed ETag, a missing `series`, a calendar outside `calendars`, a malformed input). Then the tool reads the event; a changed ETag, or a repeating event without `series: true`, is refused. An event that repeats, has other attendees or another organizer, lies in a calendar shared with the account by someone else, or has not ended asks (the listing names who the server may notify), and the owner's own ended one-person events go to the classifier (any failure asks). The event's iCalendar is saved as a `text/calendar` run artifact (`backup`) before the `DELETE`. Approvals go to the source chat only when it is a direct chat, else to the inbox and API.
- **Buckets.** `calendar_delete` and `mail_delete` both count in `deletes`: their `deleteLimit` must be equal when one agent has both, else the run fails when the tools are bound.
- **Accepted risks.** A create without attendees in a calendar shared with other people is visible to its members (`calendars` narrows where the tools write). A server with weak ETags makes every delete refuse as changed. A shared calendar is recognized from CalendarServer sharing or `DAV:owner`; a server that reports neither makes it count as the account's own. Calendar addresses come from the server and discovery follows redirects, as on the read side.

The tools opt out of the taint guard (`guardWhenTainted: false`): their own approvals gate them.

## toolCalendarModule

```ts
// @chamvi/tool-calendar/module
function toolCalendarModule(options?: ToolCalendarModuleOptions): ToolCalendarModule; // 'chamvi:tool-calendar'

type ToolCalendarModuleOptions = {
    env?: Record<string, string | undefined>; // where CHAMVI_CALENDAR_* is read, default process.env
    accounts?: CalendarAccount[];              // given, CHAMVI_CALENDAR_ACCOUNTS is not read
    timezone?: string;                         // CHAMVI_CALENDAR_TIMEZONE wins
    fetch?: typeof fetch;
};

const TOOL_CALENDAR_MODULE_NAME: 'chamvi:tool-calendar';
const CALENDAR_ACCOUNTS_VARIABLE: 'CHAMVI_CALENDAR_ACCOUNTS';
const CALENDAR_TIMEZONE_VARIABLE: 'CHAMVI_CALENDAR_TIMEZONE';
```

| Variable | |
|---|---|
| `CHAMVI_CALENDAR_ACCOUNTS` | A JSON array of `{ "id"?, "url", "address"? }`; `id` defaults to the address with `@` and `.` as `-` and is required without one |
| `CHAMVI_CALENDAR_<ID>_USER` | The account's user, default the address; `<ID>` is the id upper-cased, `-` as `_` |
| `CHAMVI_CALENDAR_<ID>_PASSWORD` | Required |
| `CHAMVI_CALENDAR_TIMEZONE` | The IANA zone event times are given in, default `Europe/Berlin` |

For an account listed in `CHAMVI_CALENDAR_ACCOUNTS` each credential can come from a file instead: `CHAMVI_CALENDAR_<ID>_PASSWORD_FILE` (one trailing newline trimmed; setting both forms is an error). The variables are read and checked when the factory is called; an error names the variable, never its value. Accounts stored in the connection store (added on the dashboard through [`toolCalendarUiModule()`](/guide/ui#connection-pages)) are added at start (`accounts` pins the set). For an account listed in `CHAMVI_CALENDAR_ACCOUNTS` a variable wins per field over its stored value, and a password in neither env nor store fails at startup naming the variable. An account that exists only in the store takes every value from the store: a `CHAMVI_CALENDAR_<ID>_*` variable named after it is ignored with a warning naming the variable, and a missing password lists it `incomplete`. Without any account the context stays provided and tools return a `connection_not_configured` tool error. In start and job mode and a check it builds one read client and one write client on the app's clock, provides them on the engine (`injectCalendarContext(ctx)`, `injectCalendarWriteContext(ctx)`) and drops their sessions once the engine drained; both use the same accounts and credentials; migrate mode does nothing.

## Types

```ts
type CalendarAccount = {
    id: string;
    url: string;       // the server root, e.g. https://caldav.icloud.com
    user: string;
    password: string;  // iCloud: an app-specific password
};

type CalendarClientOptions = {
    fetch?: typeof fetch;  // default the global fetch; the read client lets only PROPFIND, REPORT and GET pass
    clock?: IClock;
    timeoutMs?: number;    // default 30 s per call and account
    timezone?: string;     // default Europe/Berlin
};

type CalendarToolsOptions = CalendarClientOptions & {
    accounts?: CalendarAccount[];
    client?: ICalendarClient;
};

type CalendarView = { calendar: string; account: string; name: string; color?: string; timezone?: string };

type CalendarEvent = {
    calendar: string;
    uid: string;
    id?: string;             // for calendar_delete
    recurrenceId?: string;   // the occurrence's original start
    title: string;           // at most 500 characters, as location and organizer
    start: string;           // ISO with the zone's offset, a plain date when allDay
    end: string;             // exclusive
    allDay: boolean;
    location?: string;
    description?: string;    // at most 2000 characters
    status?: string;         // e.g. CANCELLED
    organizer?: string;
    attendees?: { count: number; self?: string }; // self: your own PARTSTAT
};

type CalendarEventsResult = { events: CalendarEvent[]; truncated: boolean };

interface ICalendarClient {
    calendars(options?: { signal?: AbortSignal }): Promise<CalendarView[]>;
    events(input: CalendarEventsInput): Promise<CalendarEventsResult>; // { from, to, calendar?, limit?, signal? }
    close(): Promise<void>; // forgets every session
}

function provideCalendarContext(provider: IContextProvider, client: ICalendarClient): void;
function injectCalendarContext(ctx: ToolContext): ICalendarClient; // ContextNotProvidedError without one
```
