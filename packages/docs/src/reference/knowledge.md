# @chamvi/knowledge

Knowledge collections an agent searches by meaning through `knowledge_search`: declared in code, fed by sources, embedded in the background through the AI SDK. The public API of `packages/knowledge/src/index.ts` and its `/module` entry. See [Knowledge](/guide/knowledge) for the guide.

```bash
npm install @chamvi/knowledge @chamvi/core ai --save
```

`@chamvi/core` and `ai` are peer dependencies; `@chamvi/app` is an optional peer of `@chamvi/knowledge/module`, `@chamvi/http` an optional one for the types of `knowledgeRoutes()`.

## knowledgeModule

```ts
// @chamvi/knowledge/module
function knowledgeModule(options?: KnowledgeModuleOptions): KnowledgeModule; // 'chamvi:knowledge', .knowledge: IKnowledge once set up

type KnowledgeModuleOptions = {
    collections?: readonly KnowledgeCollectionDefinition[];
    repository?: IKnowledgeCollectionRepository; // else a backend module's (vectorStoreModule()), else in memory, warned outside dev
    owner?: string;                     // the indexer's lock owner, default `${hostname}-${pid}`
    embeddingModel?: string | EmbeddingModel; // managed collections' model; CHAMVI_KNOWLEDGE_MODEL wins
    env?: Record<string, string | undefined>; // where CHAMVI_KNOWLEDGE_MODEL is read, default process.env
    routes?: false;                     // contribute no knowledgeRoutes()
};

const KNOWLEDGE_MODEL_VARIABLE: 'CHAMVI_KNOWLEDGE_MODEL';
const KNOWLEDGE_REPOSITORY_MODULE_NAME: 'chamvi:knowledge-repository';
const KnowledgeToken: { REPOSITORY: TypedToken<IKnowledgeCollectionRepository> };
```

A storage backend is a module named `KNOWLEDGE_REPOSITORY_MODULE_NAME` that registers its repository under `KnowledgeToken.REPOSITORY` in its `setup` (`vectorStoreModule()` of [`@chamvi/store-db-vector`](/guide/knowledge#storage)); the knowledge module depends on it optionally, so it sets up first, and a second one in an app fails as a duplicate module. `repository` wins over it.

The options are checked and `CHAMVI_KNOWLEDGE_MODEL` is read when the factory is called; a variable that does not resolve through the app's providers fails the setup with an error naming it, never its value. In a start (not a check) the module contributes `knowledgeRoutes()` to the http app unless `routes: false`. `setup` (start, job and a check) builds `createKnowledge()` over the app's lock service (`AppToken.LOCK_SERVICE`), the app's model resolver (`AppToken.MODELS`) and clock, its errors logged as `knowledge error`; `onReady` runs `knowledge.check()`, so a folder that is no directory or a declared name the store holds as managed fails the boot and `start --check`. Only a start indexes (the `knowledge-managed` component starts it; it stops in the `stopping` phase, before the drain); the engine gets the knowledge provided, for `injectKnowledgeContext(ctx)`.

## Collections and sources

```ts
function knowledgeCollection(name: string, options: KnowledgeCollectionOptions): KnowledgeCollectionDefinition;
function folder(path: string, options?: FolderSourceOptions): IKnowledgeSource;
function defineKnowledgeSource(input: KnowledgeSourceInput): IKnowledgeSource;

type KnowledgeCollectionOptions = {
    model: string | EmbeddingModel;   // '<provider>/<model id>' through the app's providers, or an object as is
    sources: readonly IKnowledgeSource[];
    trusted?: boolean;                // default: every source is trusted
    resyncMs?: number;                // re-read this long after the last pass, across replicas; default: start and sync() only
};

type FolderSourceOptions = { extensions?: readonly string[]; trusted?: boolean };

type KnowledgeSourceInput = {
    kind?: string;                    // default 'custom'
    trusted?: boolean;                // default true
    check?: () => Promise<void>;      // configuration check at the boot and in start --check
    documents(ctx: { signal: AbortSignal; onError(error: unknown): void }): AsyncIterable<KnowledgeDocumentInput>;
};

type KnowledgeDocumentInput = { id: string; content: string; title?: string; source?: string; metadata?: Record<string, unknown> };

const FOLDER_EXTENSIONS: ['.md', '.markdown', '.mdx', '.txt'];
const FOLDER_FILE_MAX_BYTES: 1_048_576;
const KNOWLEDGE_DOCUMENT_ID_MAX_LENGTH: 255;
const KNOWLEDGE_RESYNC_MIN_MS: 60_000; // resyncMs is an integer from it to 2 147 483 647
```

Every factory throws `InvalidAgentDefinitionError` for bad options. `folder()` never follows a symbolic link (a file or a directory) and reports it, a subdirectory it cannot list, an oversized or non-UTF-8 file through `onError` and skips it.

## createKnowledge

```ts
function createKnowledge(options: KnowledgeOptions): IKnowledge;

type KnowledgeOptions = {
    repository: IKnowledgeCollectionRepository; // createMemoryKnowledgeRepository() or a persistent backend
    locks: Pick<LockService, 'acquire' | 'renew' | 'release'>; // engine.lockService: one indexer per collection across replicas
    collections?: readonly KnowledgeCollectionDefinition[];
    models?: IModelResolver;          // resolves string models (embedding())
    embeddingModel?: string | EmbeddingModel; // managed collections' model; without it none can be created
    clock?: IClock;
    owner?: string;
    onError?: (error: unknown, context: { collection?: string }) => void; // a throwing one is contained
};

interface IKnowledge {
    readonly repository: IKnowledgeCollectionRepository;
    readonly service: IKnowledgeService; // over repository and clock: every read and write goes through it
    collection(name: string): ResolvedKnowledgeCollection | undefined;
    embedding(model: string): EmbeddingModel;
    start(): void;                    // indexes every declared and managed collection in the background
    sync(name: string): void;         // a pass now; calls during a pass coalesce into one more
    createCollection(name: string): Promise<KnowledgeCollection>;  // managed, untrusted, at embeddingModel
    deleteCollection(name: string): Promise<boolean>;              // managed or orphaned only
    putDocument(collection: string, input: KnowledgeDocumentInput): Promise<{ status: KnowledgeDocumentStatus; changed: boolean }>;
    deleteDocument(collection: string, id: string): Promise<boolean>;
    view(record: KnowledgeCollection): KnowledgeCollection;        // `stale` for a managed one off the default model or chunker
    stop(): Promise<void>;
    check(): Promise<void>;           // read-only: the sources' checks, managed name conflicts
}

function provideKnowledgeContext(provider: IContextProvider, knowledge: IKnowledge): void;
function injectKnowledgeContext(ctx: ToolContext): IKnowledge;

const KNOWLEDGE_LOCK_TTL_MS: 300_000;
const KNOWLEDGE_RETRY_MS: 5_000;        // the first wait after a failure, doubling per failure in a row
const KNOWLEDGE_RETRY_MAX_MS: 300_000;
const KNOWLEDGE_EMBED_TIMEOUT_MS: 60_000; // an indexing embedMany call is given up after it
const KNOWLEDGE_REQUEST_ERROR_CODE: 'knowledge_request';
const KNOWLEDGE_MANAGED_POLL_MS: 60_000;  // managed loops look for pending documents and new collections
const MANAGED_CONTENT_MAX_CHARS: 1_048_576;
```

The failure count and the time of the next attempt are stored on the collection, so the backoff holds across replicas. An `InvalidAgentDefinitionError` from a source is stored and reported once, never retried.

`sync()` is an `InvalidRunStateError` before `start()` and a `ValidationError` for a name this instance does not index (also a declared one whose loop a configuration error ended); a stale managed collection is re-embedded at `embeddingModel`. `createCollection()` is a `ValidationError` for a bad name and an `InvalidRunStateError` for a name declared here or held by any stored record, or without `embeddingModel`. `putDocument()` validates like a source item (content 1 to `MANAGED_CONTENT_MAX_CHARS` characters, `ValidationError`); unchanged content and details answer `changed: false`, anything else is stored `pending` (its previous chunks keep serving) and embedded in the background. Both document methods answer `RepositoryNotFoundError` for a missing collection and `InvalidRunStateError` for one that is not managed. A provider rejection of one document (an `APICallError` with status 400, 413 or 422) marks it `failed` with the error; any other embedding error fails the pass and leaves it `pending`.

## REST API

```ts
function knowledgeRoutes(knowledge: IKnowledge): HttpRoute[]; // for createHttpApp({ routes })

const KNOWLEDGE_ROUTE_PATH: '/knowledge';
const KNOWLEDGE_READ_PERMISSION: 'chamvi_knowledge_read';   // Permission.KNOWLEDGE_READ of @chamvi/access
const KNOWLEDGE_WRITE_PERMISSION: 'chamvi_knowledge_write'; // Permission.KNOWLEDGE_WRITE
const KNOWLEDGE_DOCUMENTS_DEFAULT_LIMIT: 50;
const KNOWLEDGE_DOCUMENTS_MAX_LIMIT: 100;
```

Served under the app's `basePath`. Every request is authorized first through [`request.authorize()`](/reference/http): `chamvi_knowledge_read` for `GET`, `chamvi_knowledge_write` for the others (401 without a token, 403 without the permission), with the attributes `{ name }` when the path names one collection. The listing and a create are gated for some collection; the listing then keeps the collections the principal may read, and a create checks the body's `name` after reading it. Path segments are percent-decoded once, so a document id holding `/` is sent as `%2F`; a segment that does not decode, an id that is empty, over 255 characters or holds NUL, and a body that is no JSON object are 400; a body over the http app's `bodyLimit` (default 1 MiB, so it binds before `MANAGED_CONTENT_MAX_CHARS`) is 413. Any other path below `/knowledge` is 404. Errors render through the app's error handler.

| Route | Permission | Answer |
|---|---|---|
| `GET /knowledge/collections` | read | `200 { data: KnowledgeCollectionView[] }` |
| `POST /knowledge/collections` `{ name }` | write | `201` the view; `400` a bad name; `409` the name is taken, or no default model |
| `GET /knowledge/collections/:name` | read | `200` the view; `404` |
| `DELETE /knowledge/collections/:name` | write | `204`; `404`; `409` declared |
| `POST /knowledge/collections/:name/sync` | write | `202 { name }`; `404` not indexed by this instance (also a declared one whose loop a configuration error ended) |
| `GET /knowledge/collections/:name/documents?page[limit]&page[offset]&filter[status]` | read | `200 { data: KnowledgeDocumentView[], meta: { total, limit, offset } }`, limit default 50, at most 100 |
| `GET /knowledge/collections/:name/documents/:id` | read | `200` the view with `content`; `404` |
| `PUT /knowledge/collections/:name/documents/:id` `{ content, title?, source?, metadata? }` | write | `202 { status: 'pending' }`; `200 { status }` when nothing needs embedding; `400`; `404`; `409` not managed |
| `DELETE /knowledge/collections/:name/documents/:id` | write | `204`; `404`; `409` not managed |

<<< ../../../knowledge/src/routes/types.ts{ts}

## knowledgeTools

```ts
function knowledgeTools(options: KnowledgeToolsOptions): ToolSet; // { knowledge_search }

type KnowledgeToolsOptions = { collections: readonly string[]; topK?: number; minScore?: number };
type KnowledgeSearchInput = { query: string; collection?: string; topK?: number };
type KnowledgeSearchResult = { matches: KnowledgeMatch[]; truncated: boolean };

const KNOWLEDGE_SEARCH_DEFAULT_RESULTS: 5;
const KNOWLEDGE_SEARCH_MAX_RESULTS: 20;
const KNOWLEDGE_SEARCH_MAX_CHARS: 20_000;
const KNOWLEDGE_QUERY_MAX_LENGTH: 1000;
```

A search over an untrusted collection, or one without a record that this app does not declare trusted, taints the run (`tool:knowledge_search`).

## Storage

```ts
function createMemoryKnowledgeRepository(): IKnowledgeCollectionRepository;

interface IKnowledgeCollectionRepository extends IEntityRepository<KnowledgeCollectionRecord> {
    readonly documents: IKnowledgeDocumentRepository; // IEntityRepository<KnowledgeDocumentRecord>
    readonly chunks: IKnowledgeChunkRepository;       // IEntityRepository<KnowledgeChunkRecord> with search()
}

type KnowledgeCollectionRecord = KnowledgeCollection & { id: string; fence: number };

class KnowledgeService implements IKnowledgeService {
    constructor(ctx: { repository: IKnowledgeCollectionRepository; clock: IClock });
}

interface IKnowledgeService {
    saveCollection(collection: KnowledgeCollection, options?: KnowledgeWriteOptions): Promise<KnowledgeCollectionRecord>;
    claimFence(name: string, token: number): Promise<KnowledgeFence | undefined>;
    findOneCollection(name: string): Promise<KnowledgeCollection | undefined>;
    findOneCollectionOrFail(name: string): Promise<KnowledgeCollection>;
    findCollections(): Promise<KnowledgeCollection[]>;
    deleteCollection(name: string): Promise<boolean>;
    saveDocument(document: KnowledgeDocument, options?: KnowledgeWriteOptions): Promise<void>;
    findOneDocument(collection: string, id: string): Promise<KnowledgeDocument | undefined>;
    findOneDocumentOrFail(collection: string, id: string): Promise<KnowledgeDocument>;
    findDocumentIds(collection: string): Promise<string[]>;
    findDocuments(collection: string, options?: { status?: KnowledgeDocumentStatus; limit?: number; offset?: number }): Promise<{ data: KnowledgeDocument[]; total: number }>;
    updateDocument(collection: string, id: string, version: KnowledgeDocumentVersion, patch: { status: KnowledgeDocumentStatus; error?: string; generation?: number }, options?: KnowledgeWriteOptions): Promise<boolean>;
    updateDetails(collection: string, id: string, version: KnowledgeDocumentVersion, details: { title?: string; source?: string; metadata?: Record<string, unknown> }): Promise<boolean>;
    requeueGeneration(collection: string, generation: number, target: number, limit: number, options?: KnowledgeWriteOptions): Promise<number>;
    deleteDocument(collection: string, id: string, options?: KnowledgeWriteOptions): Promise<boolean>;
    replaceChunks(collection: string, document: string, generation: number, chunks: KnowledgeChunkInput[], options?: KnowledgeWriteOptions): Promise<void>;
    deleteGeneration(collection: string, generation: number, options?: KnowledgeWriteOptions): Promise<void>;
    deleteGenerationsExcept(collection: string, generation: number, options?: KnowledgeWriteOptions): Promise<void>;
    search(collection: string, generation: number, vector: number[], options: { topK: number; minScore?: number }): Promise<KnowledgeMatch[]>;
}

type KnowledgeFence = { id: string; fence: number };
type KnowledgeWriteOptions = { fence?: KnowledgeFence; create?: boolean };
```

`createMemoryKnowledgeRepository()` keeps collections, documents and chunks in the process, on one registry that enforces the collection reference like a foreign key. The repositories store and read only; `KnowledgeService` holds every rule: code-point orders, the version guards, the errors (`RepositoryNotFoundError` for a missing collection or document) and the timestamps from its clock.

A `KnowledgeCollection` record holds the served `generation`, its `model`, `dimensions` and `chunker`, an optional `pending` re-embed, `lastGeneration` (never reused), `status` (`pending`, `ready`, `stale`, `orphaned`), `trusted`, and after a failure `error`, `failures` and `retryAt` (a `Date`). A `KnowledgeCollection` also holds `syncedAt`, the end of the last successful pass, which `resyncMs` counts from. Its row adds an `id` (a uuid v7 given at creation: a collection deleted and created again is another row) and the `fence`, the lock token the last pass claimed. A `KnowledgeDocument` has a `status` (`pending`, `ready`, `failed` with an `error`); `updateDocument()` writes its patch only while the stored document still has the version's `hash`, `title` and `source` (`KnowledgeDocumentVersion`; an absent value matches only an absent one). `updateDetails()` rewrites a document's title, source and metadata under the same guard and, for a `ready` document, the title and source of its chunks in the same transaction, without re-embedding. `requeueGeneration()` sets at most `limit` documents of one generation back to `pending` at another and answers how many. Each chunk keeps its own `title` and `source`, which search results show.

**The fence.** A pass calls `claimFence(name, token)` once it holds the lock `knowledge:<name>`, with the fencing token the lock service's `acquire()` returned, and passes the answer as `{ fence }` with each write (a declared collection's first pass saves the record with `{ create: true }`, then claims). A token below the stored fence is `LeaseLostError` and changes nothing, so a holder whose lease lapsed never takes the fence back from a newer one. A fenced write locks the collection row first: a missing collection is `RepositoryNotFoundError`, another fence or row id is `LeaseLostError` and nothing is written, so a pass whose lock lapsed writes nothing once another owner claimed the fence, and a collection deleted during a pass is never written back. Tokens are large integers (above 2^31): a custom repository stores the fence as a 64-bit integer. Writes without a fence (the managed API) are never refused.

Every backend runs `describeKnowledgeRepositoryContract()` from [`@chamvi/test-kit`](/reference/test-kit) with a `KnowledgeService` over its repositories.

## Chunking

```ts
function chunkText(text: string): KnowledgeChunk[];
function contentHash(text: string): string;

const CHUNKER_VERSION: 'text-v1';
const CHUNK_MAX_CHARS: 2000;
const CHUNK_OVERLAP_CHARS: 200;
```
