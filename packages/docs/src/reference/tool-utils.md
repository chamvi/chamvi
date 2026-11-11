# @chamvi/tool-utils

Utility tools for chamvi agents: the current time, date arithmetic, exact calculation and run info a model cannot do reliably itself. The public API of `packages/tool-utils/src/index.ts`.

```bash
npm install @chamvi/tool-utils @chamvi/core ai --save
```

`@chamvi/core` and `ai` are peer dependencies. See [Utility tools](/guide/tools#utility-tools) for an example.

## utilityTools

```ts
function utilityTools(options?: UtilityToolsOptions): ToolSet;

const UTILITY_TOOL_NAMES: readonly [
    'current_time', 'time_convert', 'date_add', 'date_diff',
    'date_info', 'next_weekday', 'calculate', 'run_info',
];
```

```ts
type UtilityToolsOptions = {
    timezone?: string;   // IANA zone; wins over CHAMVI_TIMEZONE, which wins over UTC
    include?: UtilityToolName[]; // default all tools; an empty list is refused
    env?: Record<string, string | undefined>; // where CHAMVI_TIMEZONE is read, default process.env
};
```

Options are checked when the factory is called: an invalid zone (naming the `timezone` option or `CHAMVI_TIMEZONE`) and an unknown or empty `include` throw `InvalidAgentDefinitionError`. A factory called at module scope fails at startup, one called inside `tools: (ctx) => ...` fails that execution.

## Tools

| Tool | Input | Result |
|---|---|---|
| `current_time` | `timezone?` | `{ date, weekday, time, timezone, offset, iso, startTime }`; `startTime` is when the run began, in the same zone |
| `time_convert` | `dateTime`, `to`, `from?` | `{ from, to }`, each `{ date, weekday, time, timezone, offset, iso }` |
| `date_add` | `date?`, amounts (`years`, `months`, `weeks`, `days`, `hours`, `minutes`), `timezone?` | the resulting date and time |
| `date_diff` | `from`, `to?`, `timezone?` | `{ days, weeks, months, years }`, each a whole signed total |
| `date_info` | `date?`, `timezone?` | `{ date, weekday, isoWeek, isoWeekYear, dayOfYear, daysInMonth, leapYear }` |
| `next_weekday` | `weekday`, `date?`, `timezone?`, `includeToday?` | `{ date, weekday, daysAway }` |
| `calculate` | `expression` | `{ result }`, a decimal string |
| `run_info` | none | `{ runId, agent, channel, subscription, receivedAt, address?, invoker?, parent?, scheduledAt? }` |

- Date units keep the wall-clock time across a DST change; `hours` and `minutes` add exact time. A wall-clock time that does not exist or is ambiguous resolves with Temporal's `compatible` disambiguation.
- `calculate` is decimal arithmetic rounded to 40 significant digits (`0.1 + 0.2` is `0.3`) with `+ - * / ^`, parentheses, a `%` postfix and `sum`, `min`, `max`, `avg`, `round`, `abs`, `floor`, `ceil`. Anything else is a tool error, as is a percentage directly under `+` or `-`, also in parentheses (`100 + 10%`, `100 + (10%)`: two readings; write `100 * 1.1`; a product, power or function argument such as `sum(100, 10%)` is a plain number) and division by zero. Bounds: 1000 characters, nesting 64, a `^` exponent an integer of magnitude at most 1000, every value's decimal exponent at most 1000 in magnitude, 40 significant digits.
- `run_info` returns `scheduledAt` only for a run of the `cron` channel whose payload holds an ISO `scheduledAt`. It never returns the payload, attachments, idempotency or concurrency keys, invoker permissions or `parent.source`.
- Every failure is a tool error naming the bad input. No tool is gated or taints the run.

## CHAMVI_TIMEZONE

The default zone for dates, an IANA id such as `Europe/Berlin`. Optional; without it and without the `timezone` option dates are read in UTC.

A model has no clock of its own: tell it in the agent's instructions to call `current_time` before it uses a relative date such as "today" or "next Friday".
