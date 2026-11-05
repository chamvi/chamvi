# @chamvi/tool-calendar

Read-only calendar tools for chamvi agents: the calendars and events of CalDAV accounts (iCloud, Fastmail, Nextcloud, ...), recurring events expanded in one time zone, without ever changing a calendar. The public API of `packages/tool-calendar/src/index.ts` and its `/module` entry. See [Mail and calendar tools](/guide/tools#mail-and-calendar-tools) for an example.

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
| `calendar_events` | `from`, `to`, `calendar?`, `limit?` (default 100, at most 500) | `CalendarEventsResult`: events sorted by start, `truncated` when more matched |

- **Read-only.** Every request goes through a fetch that lets only `PROPFIND`, `REPORT` and `GET` pass; any other method throws before a request is sent.
- **Calendar ids** are `<account>:<last path segment of the calendar URL>`; reminder lists are not listed.
- **Range.** `from` and `to` are ISO dates (midnight in the zone) or date-times; `to` is exclusive, after `from` and at most 92 days later.
- **Recurrence.** Recurring events are expanded here, not by the server: moved occurrences replace their slot, `EXDATE`s are dropped, cancelled ones are kept with `status: 'CANCELLED'`; a series stops after 10 000 iterations.
- **Zone.** Times are ISO with the offset of `timezone`, whatever the process zone is; a `TZID` without its `VTIMEZONE` is read in that zone when it is an IANA id. All-day events give plain dates, `end` exclusive.
- **Errors.** A malformed input or an unknown calendar is a `ValidationError`; a failed request (credentials, a timeout after `timeoutMs` on the clock, an unreachable server) a `ChamviError` with code `calendar_request` and the message `<tool>: <account>: request failed` (or `timed out`), never the server's text or a credential.

Both tools declare `trust: { taint: true }`: a result taints the run.

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

Each credential can come from a file instead: `CHAMVI_CALENDAR_<ID>_PASSWORD_FILE` (one trailing newline trimmed; setting both forms is an error). The variables are read and checked when the factory is called; an error names the variable, never its value. Without accounts the module does nothing. In start and job mode and a check it builds one client on the app's clock, provides it on the engine (`injectCalendarContext(ctx)`) and drops its sessions once the engine drained; migrate mode does nothing.

## Types

```ts
type CalendarAccount = {
    id: string;
    url: string;       // the server root, e.g. https://caldav.icloud.com
    user: string;
    password: string;  // iCloud: an app-specific password
};

type CalendarClientOptions = {
    fetch?: typeof fetch;  // default the global fetch; only PROPFIND, REPORT and GET pass
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
