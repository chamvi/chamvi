import{_ as s,o as n,c as a,a2 as t}from"./chunks/framework.a6FUKr6c.js";const u=JSON.parse('{"title":"Stores and repositories","description":"","frontmatter":{},"headers":[],"relativePath":"repositories/index.md","filePath":"repositories/index.md","lastUpdated":1794499165000}'),o={name:"repositories/index.md"};function r(l,e,c,p,i,d){return n(),a("div",null,[...e[0]||(e[0]=[t(`<h1 id="stores-and-repositories" tabindex="-1">Stores and repositories <a class="header-anchor" href="#stores-and-repositories" aria-label="Permalink to &quot;Stores and repositories&quot;">​</a></h1><p>The engine receives an <code>IStore</code> object with one implementation per persistence capability. Each role has its own small interface and can be built and tested independently.</p><table tabindex="0"><thead><tr><th>Interface</th><th>Holds</th><th>Key operations</th></tr></thead><tbody><tr><td><code>IRunRepository</code></td><td>Runs</td><td><code>insert</code> (insert-if-absent), <code>findOne</code>, <code>update</code> with <code>expectStatus</code>/<code>expectOwner</code> guards, <code>find</code>, <code>claim</code>/<code>renewClaim</code> leases</td></tr><tr><td><code>IStepRepository</code></td><td>Append-only steps per run</td><td><code>insert</code>, <code>find</code></td></tr><tr><td><code>ICheckpointRepository</code></td><td>The latest checkpoint per run</td><td><code>save</code>, <code>findOne</code></td></tr><tr><td><code>IIdempotencyRepository</code></td><td>Intake keys</td><td><code>claim(scope, key, runId, ttlMs)</code>: the first caller wins</td></tr><tr><td><code>ILockRepository</code></td><td>Keyed leases</td><td><code>acquire(key, owner, ttlMs)</code>, <code>renew(key, owner, ttlMs)</code> (extends a held, unexpired lease only, never recreates one), <code>release(key, owner)</code></td></tr><tr><td><code>IEffectRepository</code></td><td>Recorded effect results</td><td><code>findOne</code>, <code>save</code></td></tr><tr><td><code>IStateRepository</code></td><td>Per-agent state</td><td><code>findOne</code>/<code>set</code> (<code>undefined</code> removes the key), <code>find</code> (key code-point order, <code>limit</code>/<code>offset</code>), <code>findDocuments</code>/<code>upsertDocument</code>/<code>deleteDocument</code></td></tr><tr><td><code>IArtifactRepository</code></td><td>Files of a run (attachments, files tools stored)</td><td><code>insert(artifact, data, key?)</code> (insert-if-absent), <code>save(artifact, data, key)</code> (upsert by run and key), <code>findOne</code> (metadata), <code>findOneByKey(runId, key)</code> (metadata), <code>read</code> (bytes), <code>find(runId)</code></td></tr><tr><td><code>IAgentRevisionRepository</code></td><td>One revision marker per <a href="/guide/agent-folders">folder agent</a>: <code>{ agent, hash, changedAt }</code>, no code</td><td><code>findOne</code>, <code>save</code> (upsert), <code>delete</code> (a missing one is a no-op), <code>find</code> (agent code-point order)</td></tr><tr><td><code>IConnectionRepository</code> (optional)</td><td><a href="/deployment/whatsapp#session-store">Connections</a>: sealed entries and the wrapped data key, never a plaintext or a key</td><td><code>insert</code> (insert-if-absent), <code>findOne</code>, <code>find</code>, <code>delete</code> (entries cascade), <code>findEntry</code>, <code>findEntries</code>, <code>writeEntries(name, { clear?, set?, delete? }, fence)</code>: atomic, and refused with <code>LeaseLostError</code> (nothing written) unless <code>fence.owner</code> holds the lock <code>fence.lock</code> in the same transaction</td></tr><tr><td><code>IConversationRepository</code> (optional)</td><td>Conversation generations, turn ownership, recall, journal and explicit notes</td><td><code>findOne</code>, <code>findItems</code>, <code>findNotes</code>, <code>findOneNote</code>; <code>resolve</code>, <code>beginTurn</code>, <code>endTurn</code>, <code>prepareEmit</code>, <code>confirmEmit</code>, <code>applyNote</code>, <code>reset</code>, <code>delete</code>, <code>prune</code></td></tr></tbody></table><p><code>IStore</code> has nine required fields: <code>runs</code>, <code>steps</code>, <code>checkpoints</code>, <code>idempotency</code>, <code>locks</code>, <code>effects</code>, <code>state</code>, <code>artifacts</code> and <code>agentRevisions</code>. Its optional <code>conversations</code> field implements <code>IConversationRepository</code>, its optional <code>connections</code> field <code>IConnectionRepository</code> (needed by <code>createConnectionVault()</code>, e.g. for the WhatsApp session store). Pass the aggregate as <code>new Engine({ store, agents })</code>; use <code>store.runs.findOne(id)</code> or <code>store.state.findOne(agent, key)</code> for direct access. <code>IStore</code> is a plain aggregate, not a facade with forwarding methods. Conversation storage alone does not enable memory: configure <code>conversations: { authorize, limits? }</code> on the engine and opt agents in.</p><h2 id="updating-existing-callers" tabindex="-1">Updating existing callers <a class="header-anchor" href="#updating-existing-callers" aria-label="Permalink to &quot;Updating existing callers&quot;">​</a></h2><p>This changes the storage API. <code>IStore</code> now aggregates individual repository interfaces rather than forwarding all operations through one facade. The <code>MemoryStore</code> and <code>TypeormStore</code> classes are removed; custom adapters assemble their capabilities into an <code>IStore</code> object.</p><table tabindex="0"><thead><tr><th>Previous API (0.3)</th><th>Store aggregate API (0.4)</th></tr></thead><tbody><tr><td><code>new MemoryStore(options)</code></td><td><code>createMemoryStore(options)</code></td></tr><tr><td><code>new TypeormStore(options)</code></td><td><code>createDatabaseStore(options)</code></td></tr><tr><td><code>TypeormStoreOptions</code></td><td><code>DatabaseStoreOptions</code></td></tr><tr><td><code>IStore extends IRunStore, IStepStore, ...</code></td><td><code>IStore</code> is a plain aggregate: <code>runs</code>, <code>steps</code>, <code>checkpoints</code>, <code>idempotency</code>, <code>locks</code>, <code>effects</code>, <code>state</code>, <code>artifacts</code>, <code>agentRevisions</code>, optional <code>conversations</code></td></tr><tr><td><code>IRunStore</code>, <code>IStepStore</code>, <code>ICheckpointStore</code>, <code>IIdempotencyStore</code>, <code>ILockStore</code>, <code>IEffectStore</code>, <code>IStateStore</code>, <code>IArtifactStore</code>, <code>IAgentRevisionStore</code></td><td><code>IRunRepository</code>, <code>IStepRepository</code>, <code>ICheckpointRepository</code>, <code>IIdempotencyRepository</code>, <code>ILockRepository</code>, <code>IEffectRepository</code>, <code>IStateRepository</code>, <code>IArtifactRepository</code>, <code>IAgentRevisionRepository</code></td></tr><tr><td><code>store.createRun(run)</code></td><td><code>store.runs.insert(run)</code></td></tr><tr><td><code>store.getRun(id)</code></td><td><code>store.runs.findOne(id)</code></td></tr><tr><td><code>store.updateRun(id, patch, opts)</code></td><td><code>store.runs.update(id, patch, opts)</code></td></tr><tr><td><code>store.listRuns(q)</code></td><td><code>store.runs.find(q)</code></td></tr><tr><td><code>store.claimRun(id, owner, ttlMs)</code></td><td><code>store.runs.claim(id, owner, ttlMs)</code></td></tr><tr><td><code>store.renewClaim(id, owner, ttlMs)</code></td><td><code>store.runs.renewClaim(id, owner, ttlMs)</code></td></tr><tr><td><code>store.appendStep(step)</code></td><td><code>store.steps.insert(step)</code></td></tr><tr><td><code>store.listSteps(runId)</code></td><td><code>store.steps.find(runId)</code></td></tr><tr><td><code>store.saveCheckpoint(cp)</code></td><td><code>store.checkpoints.save(cp)</code></td></tr><tr><td><code>store.latestCheckpoint(runId)</code></td><td><code>store.checkpoints.findOne(runId)</code></td></tr><tr><td><code>store.claimKey(scope, key, runId, ttlMs)</code></td><td><code>store.idempotency.claim(scope, key, runId, ttlMs)</code></td></tr><tr><td><code>store.acquire(key, owner, ttlMs)</code>, <code>store.release(key, owner)</code></td><td><code>store.locks.acquire(...)</code>, <code>store.locks.release(...)</code></td></tr><tr><td><code>store.getEffect(key)</code>, <code>store.putEffect(key, result)</code></td><td><code>store.effects.findOne(key)</code>, <code>store.effects.save(key, result)</code></td></tr><tr><td><code>store.kvGet(agent, key)</code>, <code>store.kvSet(agent, key, value)</code>, <code>store.kvList(agent, q)</code></td><td><code>store.state.findOne(agent, key)</code>, <code>store.state.set(agent, key, value)</code>, <code>store.state.find(agent, q)</code></td></tr><tr><td><code>store.docList(...)</code>, <code>store.docUpsert(...)</code>, <code>store.docDelete(...)</code></td><td><code>store.state.findDocuments(...)</code>, <code>store.state.upsertDocument(...)</code>, <code>store.state.deleteDocument(...)</code></td></tr><tr><td><code>store.putArtifact(artifact, data)</code>, <code>store.getArtifact(id)</code>, <code>store.readArtifact(id)</code>, <code>store.listArtifacts(runId)</code></td><td><code>store.artifacts.insert(artifact, data)</code>, <code>store.artifacts.findOne(id)</code>, <code>store.artifacts.read(id)</code>, <code>store.artifacts.find(runId)</code></td></tr><tr><td><code>store.getAgentRevision(agent)</code>, <code>store.setAgentRevision(revision)</code>, <code>store.deleteAgentRevision(agent)</code>, <code>store.listAgentRevisions()</code></td><td><code>store.agentRevisions.findOne(agent)</code>, <code>store.agentRevisions.save(revision)</code>, <code>store.agentRevisions.delete(agent)</code>, <code>store.agentRevisions.find()</code></td></tr><tr><td><code>store.purgeExpired(now?)</code> resolving <code>PurgeResult</code></td><td><code>store.idempotency.purgeExpired(now?)</code> and <code>store.locks.purgeExpired(now?)</code>, each resolving the number of rows deleted (database store)</td></tr></tbody></table><p>Conversation memory is new in 0.4: its storage is <code>store.conversations</code> (both built-in stores carry it) and its policy is <code>createApp({ conversations: { authorize } })</code> or <code>EngineOptions.conversations</code>. There is nothing to migrate from 0.3.</p><p>Keep passing the aggregate through <code>new Engine({ store, agents })</code>, <code>storeModule({ store })</code> and <code>AppToken.STORE</code>. Factory option types are <code>MemoryStoreOptions</code> and <code>DatabaseStoreOptions</code>; <code>createDatabaseStore()</code> returns <code>DatabaseStore</code>.</p><p>The package is now <code>@chamvi/store-db</code> (previously <code>@chamvi/store-typeorm</code>). Replace package imports and dependencies; database tables and migration history keep their names. The class split itself changes no database schema; 0.4&#39;s conversation and taint migration does, and it needs downtime: follow <a href="/guide/upgrading#upgrading-to-0-4">Upgrading to 0.4</a>. Existing TypeORM roles must keep sharing the same DataSource so their relationships remain valid.</p><h2 id="query-methods" tabindex="-1">Query methods <a class="header-anchor" href="#query-methods" aria-label="Permalink to &quot;Query methods&quot;">​</a></h2><p><code>findOne(...)</code> returns one record or <code>undefined</code>. <code>find(...)</code> returns the repository&#39;s existing collection shape: run queries return <code>{ data, total }</code>, while steps, artifacts, state and agent revisions return arrays. Conversation item/note queries return <code>{ data, total }</code> through <code>findItems</code> and <code>findNotes</code>.</p><p>The matching <code>OrFail</code> method returns the same result when it exists. <code>findOneOrFail(...)</code> throws for <code>undefined</code>; stored state values such as <code>null</code>, <code>false</code>, <code>0</code> and <code>&#39;&#39;</code> are valid results. <code>findOrFail(...)</code> throws when the selected array or page is empty, including a run query with <code>limit: 0</code> or an offset beyond the last result even when <code>total</code> is nonzero. Query validation is unchanged: conversation queries require <code>limit &gt;= 1</code>, so their <code>limit: 0</code> is a validation error. Qualified queries follow the same rule: <code>findDocumentsOrFail</code>, <code>findItemsOrFail</code>, <code>findNotesOrFail</code> and <code>findOneNoteOrFail</code>.</p><p>A missing single run or artifact uses <code>RunNotFoundError</code> or <code>ArtifactNotFoundError</code>; other missing repository results use <code>RepositoryNotFoundError</code>. Backend failures and validation errors pass through unchanged. Leases and mutations retain their domain operations, such as <code>claim</code>, <code>renewClaim</code> and <code>beginTurn</code>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> run = </span><span style="color:#8FD0F2;">await</span><span style="color:#DCE9F2;"> store.runs.findOneOrFail(runId);</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> { data, total } = </span><span style="color:#8FD0F2;">await</span><span style="color:#DCE9F2;"> store.runs.find({ agent: run.agent, limit: </span><span style="color:#E7C58C;">20</span><span style="color:#DCE9F2;"> });</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> artifacts = </span><span style="color:#8FD0F2;">await</span><span style="color:#DCE9F2;"> store.artifacts.find(runId);</span></span></code></pre></div><h2 id="rules-every-repository-keeps" tabindex="-1">Rules every repository keeps <a class="header-anchor" href="#rules-every-repository-keeps" aria-label="Permalink to &quot;Rules every repository keeps&quot;">​</a></h2><ol><li><strong>One expiry rule.</strong> A claim, key or lock created at time <code>T</code> with <code>ttlMs</code> is expired at exactly <code>T + ttlMs</code> and can be taken over at that instant.</li><li><strong>Time comes from the clock.</strong> Expiry decisions use an injected <code>IClock</code>, never the database&#39;s clock, so tests can drive time and replicas agree on one rule.</li><li><strong>No aliasing.</strong> Values are copied in and out. Mutating an object after passing it to the store, or one the store returned, never changes what the store holds.</li><li><strong>Atomic means atomic across callers.</strong> <code>runs.insert</code>, <code>idempotency.claim</code>, <code>runs.claim</code>, <code>runs.renewClaim</code>, <code>locks.acquire</code>, <code>artifacts.insert</code> and <code>artifacts.save</code> must hold under concurrency, also across processes.</li><li><strong>Ordering.</strong> <code>runs.find</code> orders by <code>createdAt</code> ascending, ties broken by <code>id</code> ascending, or both descending with <code>order: &#39;desc&#39;</code> (newest first); <code>total</code> ignores <code>limit</code> and <code>offset</code>. <code>artifacts.find</code> orders the same way. <code>agentRevisions.find</code> orders by agent name in code-point order.</li><li><strong>Guards throw.</strong> <code>runs.update</code> throws <code>InvalidRunStateError</code> when <code>expectStatus</code> does not match, or when <code>expectOwner</code> is given and the claim is absent or held by another owner (expiry is not checked there: a lease is lost once taken over), or when <code>expectWaitId</code> is given and the run&#39;s wait id differs or it has no wait point. It throws <code>RunNotFoundError</code> for an unknown run.</li><li><strong>Checkpoints.</strong> <code>checkpoints.save</code> keeps the highest <code>stepIndex</code>; an equal index replaces.</li><li><strong>State filters.</strong> <code>state.findDocuments</code> <code>where</code> matches top-level fields by equality.</li><li><strong>Run references.</strong> <code>steps.insert</code>, <code>checkpoints.save</code> and <code>conversations.beginTurn</code> for a run the store does not hold throw <code>RunNotFoundError</code> and write nothing. <code>createMemoryStore()</code> checks its own run repository; the database store maps the foreign key violation.</li><li><strong>Artifacts.</strong> <code>artifacts.insert</code> resolves <code>false</code> and keeps the stored metadata and bytes when the id exists, or when <code>key</code> is given and the run already holds an artifact under that key. <code>artifacts.save</code> is an atomic upsert by <code>(runId, key)</code> and resolves the stored metadata: an absent key inserts the artifact as given, an existing one keeps its <code>id</code>, <code>agent</code> and <code>createdAt</code> and replaces <code>mediaType</code>, <code>filename</code> (a missing one removes it), <code>size</code> and the bytes. The key is private to the store: no read returns it, and <code>findOneByKey(runId, key)</code> is the only lookup by it. Bytes are copied in and out like every other value, and <code>read</code> returns a plain <code>Uint8Array</code> (no <code>Buffer</code> or other subclass). <code>findOne</code> and <code>find</code> return metadata only.</li></ol><h2 id="the-interfaces" tabindex="-1">The interfaces <a class="header-anchor" href="#the-interfaces" aria-label="Permalink to &quot;The interfaces&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { AgentRevision } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../agent/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { Artifact } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../artifact/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> {</span></span>
<span class="line"><span style="color:#DCE9F2;">    Connection,</span></span>
<span class="line"><span style="color:#DCE9F2;">    ConnectionConfig,</span></span>
<span class="line"><span style="color:#DCE9F2;">    ConnectionConfigWrite,</span></span>
<span class="line"><span style="color:#DCE9F2;">    ConnectionEntryWrite,</span></span>
<span class="line"><span style="color:#DCE9F2;">    ConnectionFence,</span></span>
<span class="line"><span style="color:#DCE9F2;">} </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../connection/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { IConversationRepository } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../conversation/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> {</span></span>
<span class="line"><span style="color:#DCE9F2;">    Checkpoint,</span></span>
<span class="line"><span style="color:#DCE9F2;">    Run,</span></span>
<span class="line"><span style="color:#DCE9F2;">    RunStatusLiteral,</span></span>
<span class="line"><span style="color:#DCE9F2;">    Step,</span></span>
<span class="line"><span style="color:#DCE9F2;">    WaitPoint,</span></span>
<span class="line"><span style="color:#DCE9F2;">} </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../run/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> RunFindOptions = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    agent?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Only the runs of these agents (an empty list matches none; an AND with \`agent\`). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    agents?: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    status?: RunStatusLiteral[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    concurrencyKey?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Only these run ids (an empty list matches none). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    ids?: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[];</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Only the runs dispatched by this run (\`Run.parentRunId\`). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    parentRunId?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Only the runs dispatched by one of these runs (an empty list matches none). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    parentRunIds?: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[];</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Only the runs dispatched by some run (\`true\`, \`Run.parentRunId\` set) or by none (\`false\`). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    hasParent?: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Only the runs whose wait point (\`Run.waiting\`) is of this kind. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    waitKind?: WaitPoint[</span><span style="color:#E7C58C;">&#39;kind&#39;</span><span style="color:#DCE9F2;">];</span></span>
<span class="line"><span style="color:#DCE9F2;">    limit?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    offset?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    order?: </span><span style="color:#E7C58C;">&#39;asc&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;desc&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> RunUpdateOptions = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    expectStatus?: RunStatusLiteral[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    expectOwner?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    expectWaitId?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Keep the stored updatedAt when the patch sets none (default: stamped with now), for derived fields such as subtreeUsage. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    keepUpdatedAt?: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> StateFindOptions = { limit?: number; offset?: number };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> StateDocumentFindOptions = { where?: Record&lt;string, unknown&gt;; limit?: number };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * Query contract: findOne returns undefined when absent; find returns an empty</span></span>
<span class="line"><span style="color:#7F95A6;"> * result when nothing matches. Their OrFail counterparts throw on absence or an</span></span>
<span class="line"><span style="color:#7F95A6;"> * empty selected page, even if records exist outside that page. Falsy values</span></span>
<span class="line"><span style="color:#7F95A6;"> * (including null) count as present. They preserve each query&#39;s ordering and copies.</span></span>
<span class="line"><span style="color:#7F95A6;"> *</span></span>
<span class="line"><span style="color:#7F95A6;"> * Expiry rule shared by every TTL (run claims, idempotency keys, locks):</span></span>
<span class="line"><span style="color:#7F95A6;"> * a lease/key created at time T with ttlMs expires AT T + ttlMs, i.e. at exactly</span></span>
<span class="line"><span style="color:#7F95A6;"> * \`expiresAt\` it already counts as expired and can be taken over.</span></span>
<span class="line"><span style="color:#7F95A6;"> *</span></span>
<span class="line"><span style="color:#7F95A6;"> * Implementations must return copies: mutating a value passed in after the call,</span></span>
<span class="line"><span style="color:#7F95A6;"> * or a value returned from a repository, must never change what it holds.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> IRunRepository {</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Atomic insert-if-absent: resolves false and keeps the stored run when a run</span></span>
<span class="line"><span style="color:#7F95A6;">     * with that id exists (two dispatches may create the run an idempotency key names).</span></span>
<span class="line"><span style="color:#7F95A6;">     * Sets \`parentRunId\` from \`trigger.parent.runId\` (a given \`parentRunId\` is</span></span>
<span class="line"><span style="color:#7F95A6;">     * ignored); a parent run the store does not hold throws RunNotFoundError</span></span>
<span class="line"><span style="color:#7F95A6;">     * and writes nothing.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    insert(run: Run): Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOne(id: string): Promise&lt;Run | undefined&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOneOrFail(id: string): Promise&lt;Run&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Throws InvalidRunStateError when \`expectStatus\` does not match the current</span></span>
<span class="line"><span style="color:#7F95A6;">     * status, or when \`expectOwner\` is given and the run&#39;s claim is absent or held</span></span>
<span class="line"><span style="color:#7F95A6;">     * by another owner (expiry is not checked: a lease is lost once taken over),</span></span>
<span class="line"><span style="color:#7F95A6;">     * or when \`expectWaitId\` is given and the run has no wait point or its wait</span></span>
<span class="line"><span style="color:#7F95A6;">     * id (\`id\`, else \`approvalId\`) differs. A stored wait point without \`id\`</span></span>
<span class="line"><span style="color:#7F95A6;">     * reads back with \`id = approvalId\`.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    update(id: string, patch: Partial&lt;Run&gt;, opts?: RunUpdateOptions): Promise&lt;Run&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Ordered by createdAt, ties broken by id, both ascending (\`order\` \`asc\`,</span></span>
<span class="line"><span style="color:#7F95A6;">     * the default) or both descending (\`desc\`). \`total\` ignores limit/offset.</span></span>
<span class="line"><span style="color:#7F95A6;">     * Without \`limit\`, every matching run (from \`offset\`) is returned: there is</span></span>
<span class="line"><span style="color:#7F95A6;">     * no default page size.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    find(q: RunFindOptions): Promise&lt;{ data: Run[]; total: number }&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOrFail(q: RunFindOptions): Promise&lt;{ data: Run[]; total: number }&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Atomic: only succeeds when unleased or the lease expired. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    claim(id: string, owner: string, ttlMs: number): Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Extends the lease; only succeeds for the current, unexpired owner. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    renewClaim(id: string, owner: string, ttlMs: number): Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> IStepRepository {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The parent run must already exist. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    insert(step: Step): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    find(runId: string): Promise&lt;Step[]&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOrFail(runId: string): Promise&lt;Step[]&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> ICheckpointRepository {</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Keeps the highest stepIndex; an equal stepIndex replaces (approval responses are appended that way).</span></span>
<span class="line"><span style="color:#7F95A6;">     * The parent run must already exist.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    save(cp: Checkpoint): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOne(runId: string): Promise&lt;Checkpoint | undefined&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOneOrFail(runId: string): Promise&lt;Checkpoint&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> IIdempotencyRepository {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Atomic: the first caller per (scope, key) creates; others get the winner&#39;s runId. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    claim(scope: string, key: string, runId: string, ttlMs: number): Promise&lt;{ created: boolean; runId: string }&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> ILockRepository {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Atomic: only succeeds when the key is unleased or its lease expired. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    acquire(key: string, owner: string, ttlMs: number): Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Atomic: extends the lease to \`now + ttlMs\` and resolves true only while</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`owner\` holds it unexpired; false when absent, expired, released or held</span></span>
<span class="line"><span style="color:#7F95A6;">     * by another owner (the lease is never re-created).</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    renew(key: string, owner: string, ttlMs: number): Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Releasing a lease held by another owner (or none) is a no-op. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    release(key: string, owner: string): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> IEffectRepository {</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOne(key: string): Promise&lt;{ result: unknown } | undefined&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOneOrFail(key: string): Promise&lt;{ result: unknown }&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    save(key: string, result: unknown): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> IStateRepository {</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOne(agent: string, key: string): Promise&lt;unknown&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOneOrFail(agent: string, key: string): Promise&lt;unknown&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`undefined\` removes the key. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    set(agent: string, key: string, value: unknown): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * One agent&#39;s entries ordered by key in code-point order (\`COLLATE &quot;C&quot;\`),</span></span>
<span class="line"><span style="color:#7F95A6;">     * values copied out; every entry (from \`offset\`) without \`limit\`.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    find(agent: string, q?: StateFindOptions): Promise&lt;Array&lt;{ key: string; value: unknown }&gt;&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOrFail(agent: string, q?: StateFindOptions): Promise&lt;Array&lt;{ key: string; value: unknown }&gt;&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`where\` matches by top-level equality. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    findDocuments(</span></span>
<span class="line"><span style="color:#DCE9F2;">        agent: string,</span></span>
<span class="line"><span style="color:#DCE9F2;">        coll: string,</span></span>
<span class="line"><span style="color:#DCE9F2;">        q?: StateDocumentFindOptions,</span></span>
<span class="line"><span style="color:#DCE9F2;">    ): Promise&lt;Array&lt;{ id: string; doc: unknown }&gt;&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    findDocumentsOrFail(</span></span>
<span class="line"><span style="color:#DCE9F2;">        agent: string,</span></span>
<span class="line"><span style="color:#DCE9F2;">        coll: string,</span></span>
<span class="line"><span style="color:#DCE9F2;">        q?: StateDocumentFindOptions,</span></span>
<span class="line"><span style="color:#DCE9F2;">    ): Promise&lt;Array&lt;{ id: string; doc: unknown }&gt;&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    upsertDocument(agent: string, coll: string, id: string, doc: unknown): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    deleteDocument(agent: string, coll: string, id: string): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** Files of runs (attachments and tool outputs): metadata and bytes, both copied in and out. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> IArtifactRepository {</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Atomic insert-if-absent: resolves false and keeps the stored artifact</span></span>
<span class="line"><span style="color:#7F95A6;">     * (metadata and bytes) when an artifact with that id, or with \`key\` in</span></span>
<span class="line"><span style="color:#7F95A6;">     * that run, exists. The key is private to the store: no read returns it.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    insert(artifact: Artifact, data: Uint8Array, key?: string): Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Atomic upsert by \`(runId, key)\`. An absent key inserts the artifact as given;</span></span>
<span class="line"><span style="color:#7F95A6;">     * an existing one keeps its \`id\`, \`agent\` and \`createdAt\`, replaces \`mediaType\`,</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`filename\` (removed when absent), \`size\` and the bytes, and resolves the stored</span></span>
<span class="line"><span style="color:#7F95A6;">     * metadata.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    save(artifact: Artifact, data: Uint8Array, key: string): Promise&lt;Artifact&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Metadata only. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOne(id: string): Promise&lt;Artifact | undefined&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOneOrFail(id: string): Promise&lt;Artifact&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Metadata of the run&#39;s artifact stored under \`key\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOneByKey(runId: string, key: string): Promise&lt;Artifact | undefined&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The bytes, as a plain Uint8Array (no Buffer or other subclass). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    read(id: string): Promise&lt;Uint8Array | undefined&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Metadata of a run&#39;s artifacts, ordered by createdAt ascending, ties broken by id ascending. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    find(runId: string): Promise&lt;Artifact[]&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOrFail(runId: string): Promise&lt;Artifact[]&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** One revision marker per folder agent, keyed by agent name, copied in and out. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> IAgentRevisionRepository {</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOne(agent: string): Promise&lt;AgentRevision | undefined&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOneOrFail(agent: string): Promise&lt;AgentRevision&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Upsert: replaces the hash and \`changedAt\` of an existing marker. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    save(revision: AgentRevision): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Deleting a missing marker is a no-op. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    delete(agent: string): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Every marker, ordered by agent in code-point order (\`COLLATE &quot;C&quot;\`). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    find(): Promise&lt;AgentRevision[]&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOrFail(): Promise&lt;AgentRevision[]&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * Connections, their runtime-state entries (opaque sealed bytes: the</span></span>
<span class="line"><span style="color:#7F95A6;"> * repository never sees plaintext) and their config (plain settings and sealed</span></span>
<span class="line"><span style="color:#7F95A6;"> * secrets, kept apart from the entries). Values are copied in and out as plain</span></span>
<span class="line"><span style="color:#7F95A6;"> * Uint8Arrays. A name breaking the agent-name rule, an entry key outside 1 to</span></span>
<span class="line"><span style="color:#7F95A6;"> * 255 characters or with NUL, a secret field outside 1 to 64 characters or</span></span>
<span class="line"><span style="color:#7F95A6;"> * with NUL, or a malformed batch throws ValidationError before anything is</span></span>
<span class="line"><span style="color:#7F95A6;"> * written; entry calls on an unknown connection throw RepositoryNotFoundError.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> IConnectionRepository {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Atomic insert-if-absent: resolves false and keeps the stored connection when the name is taken. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    insert(connection: Connection): Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOne(name: string): Promise&lt;Connection | undefined&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    findOneOrFail(name: string): Promise&lt;Connection&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Every connection, ordered by name in code-point order (\`COLLATE &quot;C&quot;\`). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    find(): Promise&lt;Connection[]&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Removes the connection with its entries and config; a missing name is a</span></span>
<span class="line"><span style="color:#7F95A6;">     * no-op. With \`fence\`, it must name the lease \`connection:&lt;name&gt;\` its owner</span></span>
<span class="line"><span style="color:#7F95A6;">     * holds unexpired at write time, checked atomically with the delete;</span></span>
<span class="line"><span style="color:#7F95A6;">     * otherwise LeaseLostError and nothing is deleted.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    delete(name: string, fence?: ConnectionFence): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Atomic, all or nothing: swaps the connection of \`connection.name\` for</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`connection\` (inserts it if absent), dropping its entries and secrets</span></span>
<span class="line"><span style="color:#7F95A6;">     * (they are sealed under the replaced data key) and keeping its settings</span></span>
<span class="line"><span style="color:#7F95A6;">     * and config revision. The replacement is</span></span>
<span class="line"><span style="color:#7F95A6;">     * validated as by \`insert\` (ValidationError) before anything else; \`fence\`</span></span>
<span class="line"><span style="color:#7F95A6;">     * must name the lease \`connection:&lt;name&gt;\` its owner holds unexpired at</span></span>
<span class="line"><span style="color:#7F95A6;">     * write time, checked atomically with the write; otherwise LeaseLostError</span></span>
<span class="line"><span style="color:#7F95A6;">     * and nothing changes.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    replace(connection: Connection, fence: ConnectionFence): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    findEntry(name: string, key: string): Promise&lt;Uint8Array | undefined&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The stored ones of \`keys\`; missing keys are absent from the map. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    findEntries(name: string, keys: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[]): Promise&lt;Map&lt;string, Uint8Array&gt;&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Atomic, all or nothing: \`clear\`, then \`set\`, then \`delete\`, and</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`updatedAt\` set to now. \`fence\` must name the lease \`connection:&lt;name&gt;\` its owner holds</span></span>
<span class="line"><span style="color:#7F95A6;">     * unexpired at write time, checked atomically with the write; otherwise</span></span>
<span class="line"><span style="color:#7F95A6;">     * LeaseLostError and nothing is written.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    writeEntries(name: string, write: ConnectionEntryWrite, fence: ConnectionFence): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * A consistent read of the data key (\`keyId\`, \`wrappedKey\`), settings,</span></span>
<span class="line"><span style="color:#7F95A6;">     * sealed secrets and revision; undefined when the connection is absent.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    findConfig(name: string): Promise&lt;ConnectionConfig | undefined&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Atomic; bumps \`revision\` and \`updatedAt\` and returns the new revision.</span></span>
<span class="line"><span style="color:#7F95A6;">     * RepositoryNotFoundError when absent; ConnectionChangedError when the</span></span>
<span class="line"><span style="color:#7F95A6;">     * stored wrappedKey differs from \`expectedWrappedKey\`, or the stored</span></span>
<span class="line"><span style="color:#7F95A6;">     * revision from a given \`expectedRevision\` (another save landed since it</span></span>
<span class="line"><span style="color:#7F95A6;">     * was read; nothing is written). Takes no fence: any replica may write</span></span>
<span class="line"><span style="color:#7F95A6;">     * while a session holds the lease, and entries and the data key stay</span></span>
<span class="line"><span style="color:#7F95A6;">     * untouched.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    writeConfig(name: string, write: ConnectionConfigWrite, expectedWrappedKey: Uint8Array, expectedRevision?: number): Promise&lt;number&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** A store of repositories that may use independent storage implementations. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> IStore {</span></span>
<span class="line"><span style="color:#DCE9F2;">    runs: IRunRepository;</span></span>
<span class="line"><span style="color:#DCE9F2;">    steps: IStepRepository;</span></span>
<span class="line"><span style="color:#DCE9F2;">    checkpoints: ICheckpointRepository;</span></span>
<span class="line"><span style="color:#DCE9F2;">    idempotency: IIdempotencyRepository;</span></span>
<span class="line"><span style="color:#DCE9F2;">    locks: ILockRepository;</span></span>
<span class="line"><span style="color:#DCE9F2;">    effects: IEffectRepository;</span></span>
<span class="line"><span style="color:#DCE9F2;">    state: IStateRepository;</span></span>
<span class="line"><span style="color:#DCE9F2;">    artifacts: IArtifactRepository;</span></span>
<span class="line"><span style="color:#DCE9F2;">    agentRevisions: IAgentRevisionRepository;</span></span>
<span class="line"><span style="color:#DCE9F2;">    conversations?: IConversationRepository;</span></span>
<span class="line"><span style="color:#DCE9F2;">    connections?: IConnectionRepository;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span></code></pre></div><h2 id="store-implementations" tabindex="-1">Store implementations <a class="header-anchor" href="#store-implementations" aria-label="Permalink to &quot;Store implementations&quot;">​</a></h2><table tabindex="0"><thead><tr><th>Store</th><th>Package</th><th>Status</th></tr></thead><tbody><tr><td><a href="/repositories/memory"><code>createMemoryStore()</code></a></td><td><code>@chamvi/core</code></td><td>Shipped. Development and tests</td></tr><tr><td><a href="/repositories/database">Database (store-db)</a></td><td><code>@chamvi/store-db</code></td><td>Shipped. PostgreSQL, production</td></tr></tbody></table><p>Redis is never required. Any store that passes the <a href="/repositories/writing-a-repository">contract suite</a> from <code>@chamvi/test-kit</code> works with the engine.</p>`,22)])])}const F=s(o,[["render",r]]);export{u as __pageData,F as default};
