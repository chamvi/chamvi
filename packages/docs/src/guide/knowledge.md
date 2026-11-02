# Knowledge

Knowledge gives an agent a large body of reference material (handbooks, docs, API references, release notes) without putting it into the model context. The agent searches it by meaning through the `knowledge_search` tool when a question needs it and gets back only a few relevant passages. It lives in the optional `@chamvi/knowledge` package.

## Knowledge, skills or conversation memory?

| | [Skills](/guide/skills) | Knowledge | [Conversation memory](/guide/conversations) |
|---|---|---|---|
| What | *How* to do something (procedures) | *What* is true (reference facts, documents) | *What was said* in one chat |
| Written by | Agent creator, reviewed and pinned | Agent creator, in code or over REST | Chat participants and the agent |
| Size | Small (16 skills, ~1 MiB) | Large (thousands of documents) | One chat |
| Found by | Name: listed, loaded whole | Meaning: searched, a few passages | Recalled automatically, in order |

**If the agent should follow it, it is a skill; if it should look it up, it is knowledge; if someone said it in this chat, it is conversation.**

Knowledge never adds system instructions: it reaches the model only as the result of a search the model chose to make. It never reads or writes conversation data, and conversation memory stays as it is.

## Declare collections

A collection is a named set of documents, fed by sources and bound to one embedding model. Declare the app's collections with `knowledgeModule()` from `@chamvi/knowledge/module`, and give each agent `knowledgeTools({ collections })` naming the ones it may search:

<<< @/snippets/knowledge.ts

```bash
npm install @chamvi/knowledge
```

Collections are declared at app level only; agent definitions, folder agents included, never declare one. Names follow the agent-name rule. A string model such as `'openai/text-embedding-3-small'` resolves through the app's [model providers](/guide/models) and their keys, like chat models; an AI SDK `EmbeddingModel` object is used as is. A name declared twice, a model that does not resolve or an invalid source (a `folder()` path that is no directory) fails the boot, and `chamvi start --check` reports it.

Without `repository` the vectors live in memory, which the module warns about outside dev: every restart re-embeds, and replicas index separately. A persistent repository (pgvector) is planned.

## Sources

- **`folder(path, { extensions?, trusted? })`**: every `.md`, `.markdown`, `.mdx` and `.txt` file below `path` (resolved against the working directory when called), in path order, dot entries skipped. The document id and source are the relative POSIX path, the title the first `# ` heading outside fenced code blocks, else the file name. A symbolic link (to a file or a directory: never followed), a file that is no regular file (a FIFO, a device), a file over 1 MiB, a file that is not UTF-8 or a relative path over 255 characters is reported through the app log and skipped; the rest of the collection indexes, and a document skipped so is deleted. A subdirectory that cannot be listed and a file that cannot be read are reported and skipped too, but mark the read incomplete, so the documents they held stay indexed. A missing directory fails the boot.
- **`defineKnowledgeSource({ kind?, trusted?, check?, documents })`**: your own source. `documents({ signal, onError, incomplete })` yields `{ id, content, title?, source?, metadata? }`. An item with an empty id, an id over 255 characters or with NUL, content that is no string, or metadata that is no plain object or cannot be cloned, is reported by its id (never its content) and skipped. Call `incomplete(reason)` when a transient failure kept documents out of this read (an API page that failed): the pass then deletes no document and a re-embed does not switch (a failure, retried on the backoff). An optional `check()` validates the source's configuration at the boot and in `start --check`; an `InvalidAgentDefinitionError` it (or `documents()`) throws is a configuration error: stored on the collection and logged once, never retried.

`documents()` returns any async iterable; an `async*` function is the plain way. It gets the context on every pass, so a source that needs none of it can leave the parameter out. Each pass yields the whole set (a snapshot, not a feed of changes): content hashes keep unchanged documents from being embedded again, so a pass over a large table only costs the read.

A database table your team maintains, read in pages:

<<< @/snippets/knowledge-sources.ts#database

A paginated API others write to (untrusted), where a failed page must not delete what was indexed:

<<< @/snippets/knowledge-sources.ts#api

A document id is stable: yielding it again with new content replaces the document, so a re-run never duplicates. A document no source yields any more is deleted, unless a source marked its read incomplete (reported once). When two sources yield the same id, the first is kept.

## Indexing

The module indexes once `chamvi start` is up, in the background: it never blocks the start or readiness. `run-job`, `start --check` and `migrate` never embed; a check only reads the store.

A pass reads every source in full and compares it with the index (a snapshot, so deletions are found too). It runs at start, then again:

- **On an interval**: `knowledgeCollection(name, { ..., resyncMs })` re-reads the sources that long after the last successful pass (at least 60 000, one minute). The time of the last pass is stored, so however many replicas run, the sources are read once per interval, not once per replica.
- **On demand**: `POST /knowledge/collections/<name>/sync` (see [Managed collections](#managed-collections)), or `knowledge.sync(name)` in code, runs a pass now, for example from a webhook of the system the source reads. Calls made while a pass runs add one more pass after it, never a parallel one.

Without `resyncMs`, a database or API source picks up changes at the next start or sync. A source that can only send changes (a webhook per edited page) belongs in a [managed collection](#managed-collections) instead, written one document at a time. Data an agent needs exact or current (an order status, a price, stock) does not belong in a collection at all: give the agent a tool that queries it when asked.

Documents are split into passages of at most 2000 characters: paragraphs are packed whole, a Markdown heading stays with the paragraph after it and consecutive passages overlap by about 200 characters. Passages are embedded through the AI SDK's `embedMany`, 64 per call. Each document's content hash is stored, so a restart with unchanged sources makes no embedding call and a changed file re-embeds that file only.

Each collection is indexed under the store lock `knowledge:<name>`, so one replica (or one process of several) indexes it while the others wait; each then syncs its own sources once the lock is free, which embeds nothing when they match. A failed pass (a provider error, a rate limit, an unreadable source) is stored on the collection with the time of the next attempt, logged as `knowledge error` with the collection, and retried after 5 seconds, doubling up to 5 minutes per failure in a row. The backoff is stored, so it holds across replicas: however many replicas run, the provider sees one attempt per backoff step (a replica only skips it on its own first attempt after a start). An embedding call that does not answer within 60 seconds is given up and counts as a failure.

### Statuses and re-embedding

| Status | Meaning |
|---|---|
| `pending` | Never indexed yet: a search answers a tool error, `Knowledge collection "<name>" is not ready.` |
| `ready` | Indexed for the declared model and chunker. |
| `stale` | A re-embed is in progress; searches keep reading the previous generation while its model is still available (see below). A [managed collection](#managed-collections) is `stale` while it serves another model than the current default (or was written by an older chunker version), until a sync re-embeds it. |
| `orphaned` | The code no longer declares it: kept with its vectors, searchable by no agent. |

A collection serves one **generation** of passages, embedded by one model with one chunker version. When you change the model, the next generation is written while searches keep serving the current one; once it is complete the collection switches to it and the old generation is deleted. Vectors of two models never mix. A restart in the middle resumes the same generation; a generation abandoned for yet another model (or the previous one coming back) is deleted and its number is never used again.

Searching the previous generation needs the previous model to embed the query. A string model whose provider is still configured keeps working; an `EmbeddingModel` object the code no longer passes, or a string whose provider was removed, is gone, and a search answers the tool error `Knowledge collection "<name>" is being re-embedded; its previous model "<id>" is not available here, ...` until the new generation is complete. Keep the old provider configured until the re-embed finished if the collection must stay searchable throughout.

A collection fed by an untrusted source and then by trusted ones only stays untrusted until its documents were all replaced; a collection that becomes untrusted is untrusted at once.

A declared collection that disappears from the code is marked `orphaned`, never deleted, so a mistaken deploy loses no embeddings; declaring the name again picks it up. A replica that declares the name keeps serving it even when an older replica of a rolling deploy marked it orphaned. A declared name that the store holds as a managed collection fails the boot.

## Managed collections

A managed collection has no sources in code: it is created and filled over REST while the app runs, by a script, a CI job or the webhook handler of another system. Use one when the material changes one document at a time (a ticket, a wiki page) or lives where the app cannot read it. `knowledgeModule()` serves the routes under `/knowledge` (below the app's `basePath`); `routes: false` turns them off.

Managed collections embed with one default model, the app's: `CHAMVI_KNOWLEDGE_MODEL` (a model string such as `openai/text-embedding-3-small`, resolved through the app's [model providers](/guide/models)), else `knowledgeModule({ embeddingModel })`. Without either, creating one answers 409. An agent searches a managed collection like a declared one, by naming it in `knowledgeTools({ collections })`.

Every route needs a bearer token: `knowledge:read` for `GET`, `knowledge:write` for the rest. A static token for a feeding script:

```bash
export CHAMVI_KNOWLEDGE_MODEL=openai/text-embedding-3-small
export CHAMVI_TOKENS="[{ \"value\": \"$(openssl rand -hex 32)\", \"id\": \"feeder\", \"permissions\": [\"knowledge:read\", \"knowledge:write\"] }]"
```

Create a collection, put a document, check it and sync:

```bash
API=http://localhost:3000/knowledge
AUTH="authorization: Bearer $TOKEN"

# 201: the collection, untrusted, at the default model
curl -X POST "$API/collections" -H "$AUTH" -H 'content-type: application/json' \
  -d '{ "name": "tickets" }'

# 202 { "status": "pending" }: stored, embedded in the background
curl -X PUT "$API/collections/tickets/documents/T-1042" -H "$AUTH" -H 'content-type: application/json' \
  -d '{ "content": "Exports over 10 000 rows time out ...", "title": "Export timeout", "source": "https://tracker.example.com/T-1042" }'

# 200 { "data": [...], "meta": { "total", "limit", "offset" } }: ready, pending or failed
curl "$API/collections/tickets/documents?filter[status]=failed" -H "$AUTH"

# 202: embed pending documents now (re-embed when stale)
curl -X POST "$API/collections/tickets/sync" -H "$AUTH"

# 204: gone from the next search
curl -X DELETE "$API/collections/tickets/documents/T-1042" -H "$AUTH"
```

- **`PUT` is idempotent per id**: the same id with new content replaces the document, the same content again answers `200` and embeds nothing. An id with `/`, a space or other special characters goes into the path percent-encoded (`a%2Fb`); ids are 1 to 255 characters, content at most 1 048 576 characters. Over REST the whole JSON body must also fit the http app's `bodyLimit` (default 1 MiB, `413` above it), which binds first at the default: raise `bodyLimit` to send documents near the content limit.
- **`202` means accepted, not embedded**: the document is `pending` until the background pass embedded it, and its previous content keeps answering searches until then. Read it back (`GET .../documents/<id>`) to see `ready`, or `failed` with the `error` when the provider refused it (a request error such as an input too long); a new `PUT` tries again. Any other provider failure leaves documents `pending` and retries on the backoff above.
- **`stale` and `sync`**: changing `CHAMVI_KNOWLEDGE_MODEL` does not re-embed anything by itself. Each managed collection reports `stale` (as after an upgrade that changes the chunker version) and keeps serving its stored model (whose provider must stay configured for searches and new documents); `POST .../sync` re-embeds it into a new generation with the new default and switches once complete.
- **Always untrusted**: anyone holding `knowledge:write` decides what a managed collection says, so a search over one always [taints the run](#untrusted-content); no option makes it trusted.
- **Deleting**: `DELETE /knowledge/collections/<name>` removes a managed collection, or an orphaned declared one, with everything in it; a collection the code declares answers 409.

A collection created on another replica is picked up here within a minute. With the default in-memory repository, managed collections live only in the process that created them and are gone after a restart; they need a persistent repository to be useful in production. The routes and their answers are in the [reference](/reference/knowledge#rest-api).

## The search tool

| Tool | Input | Result |
|---|---|---|
| `knowledge_search` | `{ query, collection?, topK? }` | `{ matches: [{ collection, document, index, text, score, title?, source? }], truncated }` |

`knowledgeTools({ collections, topK?, minScore? })` checks its options when called. The tool searches the named collections only: a call naming another collection, or an orphaned one, is refused without a search. The query is embedded once per model, and matches are ranked by cosine similarity across the collections searched: at most `topK` (default 5, at most 20), at most 20 000 characters in all (`truncated` when matches were left out), none below `minScore`. The tool description tells the model the passages are reference material, not instructions.

It is an ordinary tool: [tool policy and hooks](/guide/approvals) apply, its result is checkpointed, and a run resumed after an approval or a restart reads the recorded result instead of searching again.

## Untrusted content

Every collection has a `trusted` flag. `folder()` and custom sources are trusted by default: you wrote them and they ship with the code. A collection is trusted when all its sources are; `trusted` on a source or on `knowledgeCollection()` overrides it. A [managed collection](#managed-collections) is always untrusted. A search over any untrusted collection [taints the run](/guide/tools#untrusted-content-and-outbound-tools) (`tool:knowledge_search`) before the passages reach the model, so later outbound tools marked `guardWhenTainted` ask for approval first.

This records provenance; it does not filter injected instructions out of the passages, which still reach the model.

## Without the app

`createKnowledge({ repository, locks, collections, models?, embeddingModel?, clock?, owner?, onError? })` builds the same thing over your own engine: `provideKnowledgeContext(engine, knowledge)` lets the tools reach it, `knowledge.start()` begins indexing, `knowledge.sync(name)` runs a pass now and `knowledge.stop()` aborts and awaits it. `embeddingModel` is the managed collections' model; `knowledgeRoutes(knowledge)` returns the REST routes for `createHttpApp({ routes })`. The [package README](https://github.com/chamvi/chamvi/tree/master/packages/knowledge#usage) has a complete example.

## Not built yet

- **`@chamvi/store-db-vector`**: a pgvector repository with its own migrations.
- **More sources**: `git()` and `urls()` (untrusted by default), PDF documents, and per-agent `knowledge/` folders.
