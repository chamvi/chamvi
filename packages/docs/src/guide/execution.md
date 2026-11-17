# Execution & Checkpoints

One execution is one call of an AI SDK `ToolLoopAgent` for one claimed, `running` run. A run may take several executions: one before an approval pause and one after, or one before a crash and one after recovery.

## What an execution does

1. **Load the start point.** The latest checkpoint's messages, or, for a new run, a single user message with the rendered envelope (and a file part per [attachment](/guide/channels#attachments)). File parts that refer to an artifact get its bytes for this call only; a missing artifact fails the run with `ArtifactNotFoundError`.
2. **Run pending tool calls.** Tool calls the checkpoint holds without a result (suspended by [`approve()`](/guide/approvals)) run first, without a model call, through the same checks as a model's call (tool policy, input schema, hooks); their results join the checkpoint. One that suspends again sends the run back to `waiting`.
3. **Check the step budget.** If an earlier execution already used every step, the run settles right away (see [Budgets](/guide/budgets)).
4. **Assemble the tools.** Generated [state tools](/guide/state) plus the result of your `tools` factory; every call runs inside a tool-call frame with the agent [hooks](/guide/approvals#gating-tools-you-did-not-write), and every [effect tool](/guide/effect-tools) is wrapped.
5. **Run the loop.** `ToolLoopAgent.stream()` with your model and instructions, the agent's `output`, and stop conditions for the step and token budgets and for a suspended call (the loop ends after the step in which a tool called `approve()`). Text and reasoning are emitted as `run.delta` events while they stream (see [Streaming](#streaming)).
6. **After every step:** append the `llm` step and one `tool` step per tool result or error, save a checkpoint, and update the run's token usage. A model call that fails (an `error` part in its stream) still ends its step: the `llm` step (with the text so far and finish reason `error`) and its checkpoint are written, then the run fails with that error. A stream that ends without a finish part fails the run with `IncompleteResponseError` (`incomplete_response`), since the AI SDK would otherwise skip the step's tool calls.
7. **Settle.** `completed` (with the final text, or the parsed [structured output](/guide/agents#structured-output), as `output`), `failed`, `cancelled`, `waiting` (a tool awaits an approval; the suspended calls stay pending in the checkpoint) or, during a drain, `interrupted`.

## Checkpoints

A `Checkpoint` holds the full message history after a step, the step index and the AI SDK finish reason of that step.

<<< ../../../store/src/checkpoint/types.ts{ts}

Checkpoints never hold the bytes of an artifact: a file part keeps a reference (`data: 'chamvi-artifact:<id>'`) and every execution reads the bytes again.

The store keeps the checkpoint with the highest `stepIndex` per run; saving one with an equal index replaces it. That is how the results of pending calls that ran after an approval join the history of the step that asked for it.

Because the engine saves a checkpoint after every completed step, a recovered run repeats at most the step that was in progress when the process died. If that step called tools, they run again, which is why tools with side effects should be [effect tools](/guide/effect-tools).

### Writes around an abort

A cancel or drain aborts the model call, but the writes of a step that already completed (its tool rows and checkpoint) are allowed to finish before the run settles. A recovery then does not redo a step whose tools already ran. Once the run has settled, a model call that is still running cannot write anymore.

## Streaming

The engine always streams (every AI SDK provider does). Each text and reasoning delta becomes a local `run.delta` event:

<<< @/snippets/lifecycle.ts#deltas

`delta` is `{ runId, step, kind: 'text' | 'reasoning', text }`; `step` is the checkpoint `stepIndex` the step is saved under. Deltas arrive in order, and their concatenated text equals the text of the stored `llm` step. They are never stored and only reach listeners in the process that executes the run; after a cancel, drain or lost lease settled the run, no more arrive. A model error during the stream fails the run, after the errored step's `llm` row (finish reason `error`) and checkpoint are written. So does a stream that closes without the provider's finish part (a cut connection): the run fails with `incomplete_response` instead of completing with a partial answer, and a tool call of that step never runs. `@chamvi/http` forwards them on the run's SSE stream as `delta` events.

## Ownership

Every write of a `running` run is conditional on the status and on the engine holding the run's claim. If another engine took the run over (because this one's lease expired), the execution is aborted, writes nothing more and reports a `LeaseLostError` to `onError`. The run is not failed: its new owner carries it on. See [Concurrency, Leases & Multi-Replica](/guide/concurrency).

## The first message

The model sees the envelope as a JSON block:

````md
```json
{
  "channel": "http",
  "trigger": "http",
  "payload": {
    "title": "App crashes on start"
  }
}
```
````

`id`, keys, `address`, the invoker and `receivedAt` are not part of the message; they are available to tools through `run.trigger`. With attachments the message content is that text followed by one `file` part per attachment (its `mediaType` and `filename`).
