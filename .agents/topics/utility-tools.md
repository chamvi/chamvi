# Utility Tools

Read before changing `@chamvi/tool-utils`.

`utilityTools({ timezone?, include?, env? })` returns plain `defineTool()` tools with no `trust` flags; it peers on core and `ai` and depends on `decimal.js` and `smob`. Options are checked when called (`InvalidAgentDefinitionError`); there is no `/module`, nothing needs app wiring.

- **Purity**: no tool touches the network or a secret, and `run_info` returns no payload (it reads `payload.scheduledAt` only), so none taints a run and none is gated; that is why they are safe in tainted runs. A tool that reads outside the run belongs in another package.
- **Clock**: tools read time through `injectClock(ctx)` (core), never `new Date()` or `systemClock`; there is no fallback, because one would hide a wrong test clock. Clock tools are tested through an `Engine`. `startTime` and `run_info.receivedAt` read `trigger.receivedAt` with `new Date(...)`, since a stored run may hold it serialized.
- **Zone**: option `timezone`, else `CHAMVI_TIMEZONE`, else UTC; one helper turns Temporal's `RangeError` into a `ValidationError` naming the field.
- **`calculate`**: a hand-written parser over tokens evaluated with `decimal.js`; no identifier, property access or function value is reachable. Bounds: 1000 characters, nesting 64, `^` exponent an integer of magnitude at most 1000, 40 significant digits, every value's exponent within 1000 (checked after each operation). `100 + 10%` is refused (two readings). Rejected: `mathjs` (its evaluator exposes functions and property access) and `expr-eval` (an RCE advisory).
- **`run_info`**: an explicit field list, never a spread of the trigger, so a field added to `TriggerEnvelope` stays hidden. `scheduledAt` comes only from a `cron` run (`CRON_CHANNEL`, a local constant: no dependency on `@chamvi/channel-cron`). It adds no taint of its own: a channel relaying third-party identifiers must be `untrusted` so the run taints at intake (http and mcp are trusted unless configured).
- **Schemas** stay flat objects: a top-level union is rejected by some providers.

## Testing

`test/utils/run.ts` (`runTool`) drives a real `Engine` on a memory store with `mockModel`; a `parent` option dispatches through a subclass, since `engine.dispatch()` drops lineage.
