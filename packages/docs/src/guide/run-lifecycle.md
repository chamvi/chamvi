# Run Lifecycle

A run has exactly one of seven statuses. `RunStatus` is an enum of them, and `RunStatusLiteral` is the union of its string values, which is the type of `run.status`: compare against the enum, or against the plain string when that reads better.

| Status | `RunStatus` | Meaning | Final |
|---|---|---|---|
| `queued` | `QUEUED` | Stored, waiting for a free slot, a free concurrency key and a claim | no |
| `running` | `RUNNING` | Claimed by one engine, which drives the model and writes steps and checkpoints | no |
| `waiting` | `WAITING` | Paused on a tool call that needs approval, or waits on the runs it [dispatched](/guide/dispatch) (`run.waiting.kind`); holds no claim and no slot | no |
| `interrupted` | `INTERRUPTED` | Aborted by `drain()`; claim released, waits for `recover()` | no |
| `completed` | `COMPLETED` | The model finished; `output` holds the text of its last answer, or the parsed value when the agent defines [structured `output`](/guide/agents#structured-output) | yes |
| `failed` | `FAILED` | A budget, a timeout, a `FatalToolError`, a failed or incomplete model call, an output that does not parse, or an infrastructure error ended it; `error` holds `{ code, message }` | yes |
| `cancelled` | `CANCELLED` | `cancel()` ended it | yes |

<div class="figure">
    <img class="only-light" src="/run-lifecycle-light.svg" alt="dispatch() stores a queued run, deduplicated by idempotency key. The engine claims it and runs it: every LLM or tool step is followed by a checkpoint in the store. A run ends completed, failed or cancelled. A tool call that needs approval pauses the run in waiting until it is answered; approving or denying it requeues the run. drain() or a crashed process leaves a run interrupted or with an expired claim; recover() requeues it, and the next execution continues from the latest checkpoint." />
    <img class="only-dark" src="/run-lifecycle-dark.svg" alt="" aria-hidden="true" />
</div>

## Transitions

```
dispatch ----------------------------> queued
queued   -- slot, key and claim -----> running
running  -- model finished ----------> completed
running  -- budget, timeout, fatal --> failed
running  -- cancel() ----------------> cancelled
running  -- a tool awaits approve() --> waiting
running  -- a tool awaits waitForDispatch() --> waiting
waiting  -- answered or timed out ---> queued     (then running again)
waiting  -- dispatched runs settled or timed out --> queued
waiting  -- cancel() ----------------> cancelled
running  -- drain() -----------------> interrupted
interrupted -- recover() ------------> queued     (then running again)
running, claim expired (crash) -- recover() --> queued
queued   -- cancel() ----------------> cancelled
```

Every non-final status can come back to `queued`. The next execution always starts from the latest [checkpoint](/guide/execution), so work that completed before the pause, the drain or the crash is not repeated.

## Steps

While a run executes, the engine appends `Step` records to the store:

| Kind | Written when | `name` | `input` / `output` |
|---|---|---|---|
| `llm` | after every model call, a failed one included (finish reason `error`) | the model id | output: text, tool calls, finish reason, token usage |
| `tool` | for every tool result or tool error of that step | the tool name | the tool input and its output, or `error: { code, message }` (`tool_not_allowed` for a call to a tool the [`toolPolicy`](/guide/tools#restricting-tools-per-invoker) refuses) |
| `wait` | when an approval is answered, or the runs a dispatch wait lists settled | the tool name | approval: input `{ toolCallId, title, body? }`, output `{ approvalId, approved, reason, approver? }`; dispatch: input `{ toolCallId, runIds }`, output the outcomes without their `output` (`{ runId, agent, role, status, error? }[]`) |

Steps are append-only and numbered per run (`index`). They are the run's audit log; the checkpoint, not the steps, is what a resumed run continues from.

## Watching runs

`engine.on()` subscribes to `run.updated` (any status, usage or wait point change), `step.appended` and `run.delta` (model output while it streams, see [Streaming](/guide/execution#streaming)). It returns an unsubscribe function. A listener that throws is reported to `onError` and does not affect the run.

<<< @/snippets/lifecycle.ts#events

`engine.getRun(id)` reads the current state from the store. `engine.idle()` resolves once nothing is running in this process and nothing more can be started, which is useful in tests and scripts.
