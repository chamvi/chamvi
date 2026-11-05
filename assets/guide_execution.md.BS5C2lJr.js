import{_ as n,o as a,c as e,a2 as t}from"./chunks/framework.a6FUKr6c.js";const y=JSON.parse('{"title":"Execution & Checkpoints","description":"","frontmatter":{},"headers":[],"relativePath":"guide/execution.md","filePath":"guide/execution.md","lastUpdated":1793904267000}'),o={name:"guide/execution.md"};function l(p,s,r,c,i,d){return a(),e("div",null,[...s[0]||(s[0]=[t(`<h1 id="execution-checkpoints" tabindex="-1">Execution &amp; Checkpoints <a class="header-anchor" href="#execution-checkpoints" aria-label="Permalink to &quot;Execution &amp; Checkpoints&quot;">​</a></h1><p>One execution is one call of an AI SDK <code>ToolLoopAgent</code> for one claimed, <code>running</code> run. A run may take several executions: one before an approval pause and one after, or one before a crash and one after recovery.</p><h2 id="what-an-execution-does" tabindex="-1">What an execution does <a class="header-anchor" href="#what-an-execution-does" aria-label="Permalink to &quot;What an execution does&quot;">​</a></h2><ol><li><strong>Load the start point.</strong> The latest checkpoint&#39;s messages, or, for a new run, a single user message with the rendered envelope (and a file part per <a href="/guide/channels#attachments">attachment</a>). File parts that refer to an artifact get its bytes for this call only; a missing artifact fails the run with <code>ArtifactNotFoundError</code>.</li><li><strong>Run pending tool calls.</strong> Tool calls the checkpoint holds without a result (suspended by <a href="/guide/approvals"><code>approve()</code></a>) run first, without a model call, through the same checks as a model&#39;s call (tool policy, input schema, hooks); their results join the checkpoint. One that suspends again sends the run back to <code>waiting</code>.</li><li><strong>Check the step budget.</strong> If an earlier execution already used every step, the run settles right away (see <a href="/guide/budgets">Budgets</a>).</li><li><strong>Assemble the tools.</strong> Generated <a href="/guide/state">state tools</a> plus the result of your <code>tools</code> factory; every call runs inside a tool-call frame with the agent <a href="/guide/approvals#gating-tools-you-did-not-write">hooks</a>, and every <a href="/guide/effect-tools">effect tool</a> is wrapped.</li><li><strong>Run the loop.</strong> <code>ToolLoopAgent.stream()</code> with your model and instructions, the agent&#39;s <code>output</code>, and stop conditions for the step and token budgets and for a suspended call (the loop ends after the step in which a tool called <code>approve()</code>). Text and reasoning are emitted as <code>run.delta</code> events while they stream (see <a href="#streaming">Streaming</a>).</li><li><strong>After every step:</strong> append the <code>llm</code> step and one <code>tool</code> step per tool result or error, save a checkpoint, and update the run&#39;s token usage. A model call that fails (an <code>error</code> part in its stream) still ends its step: the <code>llm</code> step (with the text so far and finish reason <code>error</code>) and its checkpoint are written, then the run fails with that error. A stream that ends without a finish part fails the run with <code>IncompleteResponseError</code> (<code>incomplete_response</code>), since the AI SDK would otherwise skip the step&#39;s tool calls.</li><li><strong>Settle.</strong> <code>completed</code> (with the final text, or the parsed <a href="/guide/agents#structured-output">structured output</a>, as <code>output</code>), <code>failed</code>, <code>cancelled</code>, <code>waiting</code> (a tool awaits an approval; the suspended calls stay pending in the checkpoint) or, during a drain, <code>interrupted</code>.</li></ol><h2 id="checkpoints" tabindex="-1">Checkpoints <a class="header-anchor" href="#checkpoints" aria-label="Permalink to &quot;Checkpoints&quot;">​</a></h2><p>A <code>Checkpoint</code> holds the full message history after a step, the step index and the AI SDK finish reason of that step.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { ModelMessage } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;ai&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { ApprovalOption } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../approval/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { ConversationBinding } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../conversation/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { TriggerEnvelope } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../trigger/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { RunStatus } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;./constants.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> RunStatusLiteral = </span><span style="color:#E7C58C;">\`</span><span style="color:#DCE9F2;">\${</span><span style="color:#E7C58C;">RunStatus</span><span style="color:#DCE9F2;">}</span><span style="color:#E7C58C;">\`</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> Usage = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    inputTokens: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    outputTokens: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> Budget = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    maxSteps: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    maxTokens?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Wall-clock limit per execution (not cumulative across resumes): each</span></span>
<span class="line"><span style="color:#7F95A6;">     * execution of the run gets the full timeout again.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    timeoutMs?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Total tokens (input + output) of every descendant dispatched below a</span></span>
<span class="line"><span style="color:#7F95A6;">     * run of this agent: at or over it, dispatch() and dispatchTo() refuse</span></span>
<span class="line"><span style="color:#7F95A6;">     * (checked at dispatch time only, running children are not stopped).</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    maxSubtreeTokens?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> RunTaint = { at: Date; source: string };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> RunContext = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    runId: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    agent: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    trigger: TriggerEnvelope;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Aborts on cancel, drain, a lost lease or the run timeout, and once the execution has ended. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    signal: AbortSignal;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The approval a \`waiting\` run waits on, as approve() requested it. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> ApprovalWaitPoint = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    kind: </span><span style="color:#E7C58C;">&#39;approval&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The generic wait id, always equal to \`approvalId\` (a stored wait point without it reads back with it). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    id: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`&lt;stepIndex&gt;:&lt;toolCallId&gt;:&lt;n&gt;\` of the stored checkpoint&#39;s pending call: never changes after the pause. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    approvalId: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    toolName: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    toolCallId: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    title: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    body?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Safe channel notification instead of private approval arguments. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    notification?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The run&#39;s artifact ids shown with the request; absent when none. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    artifacts?: string[];</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The choices of the request; absent for a plain yes or no. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    options?: ApprovalOption[];</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Set (true) only when several options may be selected. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    multiple?: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The channel the request is delivered through; none for the inbox and API only. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    channel?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    address?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The named delivery slot, if requested. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    slot?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    expiresAt: Date;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Set once the approval message went out through \`channel\`; tick() re-sends while it is missing. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    notifiedAt?: Date;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The dispatched runs a \`waiting\` run waits on to settle. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> DispatchWaitPoint = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    kind: </span><span style="color:#E7C58C;">&#39;dispatch&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`&lt;stepIndex&gt;:&lt;toolCallId&gt;:w&lt;n&gt;\`: never changes after the pause. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    id: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    toolName: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    toolCallId: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The runs waited on, in the caller&#39;s order (duplicates allowed). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    runIds: string[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    expiresAt: Date;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** What a \`waiting\` run waits on, by \`kind\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> WaitPoint = ApprovalWaitPoint | DispatchWaitPoint;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> Run = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    id: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    agent: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    status: RunStatusLiteral;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** First exposure to untrusted content; never cleared by execution. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    taint?: RunTaint;</span></span>
<span class="line"><span style="color:#DCE9F2;">    trigger: TriggerEnvelope;</span></span>
<span class="line"><span style="color:#DCE9F2;">    concurrencyKey?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Where the run came from on its channel (\`trigger.address\`). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    address?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    output?: unknown;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Why the run failed, or why the registry cancelled it (\`agent_replaced\`,</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`agent_removed\`); a run cancelled on another replica keeps the reason</span></span>
<span class="line"><span style="color:#7F95A6;">     * through the owner&#39;s settle, a run that completes anyway loses it.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    error?: { code: string; message: string };</span></span>
<span class="line"><span style="color:#DCE9F2;">    usage: Usage;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The sum of every descendant&#39;s usage, recomputed from the children (never incremented). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    subtreeUsage?: Usage;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The run that dispatched this one (\`trigger.parent.runId\`); set by the</span></span>
<span class="line"><span style="color:#7F95A6;">     * repository at insert, never from the caller.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    parentRunId?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    waiting?: WaitPoint;</span></span>
<span class="line"><span style="color:#DCE9F2;">    claim?: { owner: string; expiresAt: Date };</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Set by cancel() on a replica that does not execute the run: the owner</span></span>
<span class="line"><span style="color:#7F95A6;">     * aborts it on its next poll, and a later execution settles it cancelled.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    cancelRequested?: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The conversation the run belongs to; set by the trusted conversation intake only, never by dispatch(). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    conversation?: ConversationBinding;</span></span>
<span class="line"><span style="color:#DCE9F2;">    createdAt: Date;</span></span>
<span class="line"><span style="color:#DCE9F2;">    updatedAt: Date;</span></span>
<span class="line"><span style="color:#DCE9F2;">    startedAt?: Date;</span></span>
<span class="line"><span style="color:#DCE9F2;">    finishedAt?: Date;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> Step = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    runId: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    index: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    kind: </span><span style="color:#E7C58C;">&#39;llm&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;tool&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;wait&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    name?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    input?: unknown;</span></span>
<span class="line"><span style="color:#DCE9F2;">    output?: unknown;</span></span>
<span class="line"><span style="color:#DCE9F2;">    error?: unknown;</span></span>
<span class="line"><span style="color:#DCE9F2;">    startedAt: Date;</span></span>
<span class="line"><span style="color:#DCE9F2;">    finishedAt: Date;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> Checkpoint = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    runId: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    stepIndex: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    messages: ModelMessage[];</span></span>
<span class="line"><span style="color:#7F95A6;">    /** AI SDK finish reason of the step this checkpoint was taken after. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    finishReason?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Provenance of a conversation run&#39;s recalled context (not an authorization). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    conversation?: {</span></span>
<span class="line"><span style="color:#DCE9F2;">        scopeId: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">        generation: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    };</span></span>
<span class="line"><span style="color:#DCE9F2;">    createdAt: Date;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><p>Checkpoints never hold the bytes of an artifact: a file part keeps a reference (<code>data: &#39;chamvi-artifact:&lt;id&gt;&#39;</code>) and every execution reads the bytes again.</p><p>The store keeps the checkpoint with the highest <code>stepIndex</code> per run; saving one with an equal index replaces it. That is how the results of pending calls that ran after an approval join the history of the step that asked for it.</p><p>Because the engine saves a checkpoint after every completed step, a recovered run repeats at most the step that was in progress when the process died. If that step called tools, they run again, which is why tools with side effects should be <a href="/guide/effect-tools">effect tools</a>.</p><h3 id="writes-around-an-abort" tabindex="-1">Writes around an abort <a class="header-anchor" href="#writes-around-an-abort" aria-label="Permalink to &quot;Writes around an abort&quot;">​</a></h3><p>A cancel or drain aborts the model call, but the writes of a step that already completed (its tool rows and checkpoint) are allowed to finish before the run settles. A recovery then does not redo a step whose tools already ran. Once the run has settled, a model call that is still running cannot write anymore.</p><h2 id="streaming" tabindex="-1">Streaming <a class="header-anchor" href="#streaming" aria-label="Permalink to &quot;Streaming&quot;">​</a></h2><p>The engine always streams (every AI SDK provider does). Each text and reasoning delta becomes a local <code>run.delta</code> event:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> offDelta = engine.on(</span><span style="color:#E7C58C;">&#39;run.delta&#39;</span><span style="color:#DCE9F2;">, ({ delta }) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> {</span></span>
<span class="line"><span style="color:#7F95A6;">    // text or reasoning as the model streams it; never stored</span></span>
<span class="line"><span style="color:#8FD0F2;">    if</span><span style="color:#DCE9F2;"> (delta.kind === </span><span style="color:#E7C58C;">&#39;text&#39;</span><span style="color:#DCE9F2;">) {</span></span>
<span class="line"><span style="color:#DCE9F2;">        process.stdout.write(delta.text);</span></span>
<span class="line"><span style="color:#DCE9F2;">    }</span></span>
<span class="line"><span style="color:#DCE9F2;">});</span></span></code></pre></div><p><code>delta</code> is <code>{ runId, step, kind: &#39;text&#39; | &#39;reasoning&#39;, text }</code>; <code>step</code> is the checkpoint <code>stepIndex</code> the step is saved under. Deltas arrive in order, and their concatenated text equals the text of the stored <code>llm</code> step. They are never stored and only reach listeners in the process that executes the run; after a cancel, drain or lost lease settled the run, no more arrive. A model error during the stream fails the run, after the errored step&#39;s <code>llm</code> row (finish reason <code>error</code>) and checkpoint are written. So does a stream that closes without the provider&#39;s finish part (a cut connection): the run fails with <code>incomplete_response</code> instead of completing with a partial answer, and a tool call of that step never runs. <code>@chamvi/http</code> forwards them on the run&#39;s SSE stream as <code>delta</code> events.</p><h2 id="ownership" tabindex="-1">Ownership <a class="header-anchor" href="#ownership" aria-label="Permalink to &quot;Ownership&quot;">​</a></h2><p>Every write of a <code>running</code> run is conditional on the status and on the engine holding the run&#39;s claim. If another engine took the run over (because this one&#39;s lease expired), the execution is aborted, writes nothing more and reports a <code>LeaseLostError</code> to <code>onError</code>. The run is not failed: its new owner carries it on. See <a href="/guide/concurrency">Concurrency, Leases &amp; Multi-Replica</a>.</p><h2 id="the-first-message" tabindex="-1">The first message <a class="header-anchor" href="#the-first-message" aria-label="Permalink to &quot;The first message&quot;">​</a></h2><p>The model sees the envelope as a JSON block:</p><div class="language-md"><button title="Copy Code" class="copy"></button><span class="lang">md</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#DCE9F2;">\`\`\`json</span></span>
<span class="line"><span style="color:#DCE9F2;">{</span></span>
<span class="line"><span style="color:#DCE9F2;">  &quot;</span><span style="color:#E7C58C;">channel</span><span style="color:#DCE9F2;">&quot;</span><span style="color:#DCE9F2;">: </span><span style="color:#E7C58C;">&quot;http&quot;</span><span style="color:#DCE9F2;">,</span></span>
<span class="line"><span style="color:#DCE9F2;">  &quot;</span><span style="color:#E7C58C;">trigger</span><span style="color:#DCE9F2;">&quot;</span><span style="color:#DCE9F2;">: </span><span style="color:#E7C58C;">&quot;http&quot;</span><span style="color:#DCE9F2;">,</span></span>
<span class="line"><span style="color:#DCE9F2;">  &quot;</span><span style="color:#E7C58C;">payload</span><span style="color:#DCE9F2;">&quot;</span><span style="color:#DCE9F2;">: {</span></span>
<span class="line"><span style="color:#DCE9F2;">    &quot;</span><span style="color:#E7C58C;">title</span><span style="color:#DCE9F2;">&quot;</span><span style="color:#DCE9F2;">: </span><span style="color:#E7C58C;">&quot;App crashes on start&quot;</span></span>
<span class="line"><span style="color:#DCE9F2;">  }</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span>
<span class="line"><span style="color:#DCE9F2;">\`\`\`</span></span></code></pre></div><p><code>id</code>, keys, <code>address</code>, the invoker and <code>receivedAt</code> are not part of the message; they are available to tools through <code>run.trigger</code>. With attachments the message content is that text followed by one <code>file</code> part per attachment (its <code>mediaType</code> and <code>filename</code>).</p>`,22)])])}const u=n(o,[["render",l]]);export{y as __pageData,u as default};
