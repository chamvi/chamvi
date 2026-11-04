# Agent State

Each agent has state that outlives its runs: a key-value store and typed document collections. State is scoped to the agent name and lives in the store.

## Declaring collections

Declare collections with any [Standard Schema](https://standardschema.dev), such as a zod schema:

<<< @/snippets/state.ts#schema

<<< @/snippets/state.ts#agent

A `tools` factory receives `state`, typed by the declared schema. A tool built with `defineTool()` reads it as `context.state` (`defineTool<Input, Output, typeof schema>` types it).

## The state API

| Method | Description |
|---|---|
| `state.get<T>(key)` | Reads a value, `undefined` when absent |
| `state.set(key, value)` | Writes a value |
| `state.collection(name).list({ where?, limit? })` | Lists documents as `{ id, ...doc }`; `where` matches top-level fields by equality |
| `state.collection(name).upsert(id, doc)` | Validates `doc` with the collection's schema, then creates or replaces it |
| `state.collection(name).remove(id)` | Deletes a document |

`upsert` stores the schema's output. A document that fails validation throws `ValidationError` and nothing is stored; its `issues` hold the validation issues with their paths. Only declared collections are writable. Once the execution ended (the run settled or paused), a write from work a tool left behind throws `InvalidRunStateError` and stores nothing; a call that has not returned yet, such as a cleanup after the abort, can still write. Reads stay open.

<<< @/snippets/state.ts#invalid

`createAgentState(agent, schema, store)` builds the same API outside a run, for scripts, admin tasks and tests:

<<< @/snippets/state.ts#direct

## Generated tools

With a `state` schema, the model gets three tools per collection:

| Tool | Kind | Input |
|---|---|---|
| `state_<collection>_list` | plain tool | `{ where?, limit? }` |
| `state_<collection>_upsert` | effect tool | `{ id, doc }` (the doc's JSON Schema, when the schema can produce one) |
| `state_<collection>_remove` | effect tool | `{ id }` |

An invalid document becomes a tool error the model can correct. Each write gets its own effect key, so a replayed `upsert A, upsert B, upsert A` sequence still ends on the last write. Your own tools win on a name clash. `createStateTools(schema)` builds these tools directly; they read the state from their `context.state`, so call them with a `ToolContext` (see [`wrapToolsForRun`](/guide/effect-tools#outside-the-engine)).
