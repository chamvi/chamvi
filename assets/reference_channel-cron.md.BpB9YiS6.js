import{_ as n,o as a,c as e,a2 as l}from"./chunks/framework.DiXyETtc.js";const y=JSON.parse('{"title":"@chamvi/channel-cron","description":"","frontmatter":{},"headers":[],"relativePath":"reference/channel-cron.md","filePath":"reference/channel-cron.md","lastUpdated":1795610857000}'),o={name:"reference/channel-cron.md"};function p(t,s,c,r,i,E){return a(),e("div",null,[...s[0]||(s[0]=[l(`<h1 id="chamvi-channel-cron" tabindex="-1">@chamvi/channel-cron <a class="header-anchor" href="#chamvi-channel-cron" aria-label="Permalink to &quot;@chamvi/channel-cron&quot;">​</a></h1><p>The cron channel: fires <code>cron.on()</code> subscriptions once per tick across replicas, on hubwire. The public API of <code>packages/channel-cron/src/index.ts</code>.</p><div class="language-bash"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#E3E5EA;">npm </span><span style="color:#E7C58C;">install</span><span style="color:#E7C58C;"> @chamvi/channel-cron</span><span style="color:#E7C58C;"> @chamvi/core</span><span style="color:#E7C58C;"> --save</span></span></code></pre></div><p><code>@chamvi/core</code> is a peer dependency. See <a href="/guide/scheduler">Cron Scheduling</a> for the behaviour.</p><h2 id="cronchannel" tabindex="-1">cronChannel <a class="header-anchor" href="#cronchannel" aria-label="Permalink to &quot;cronChannel&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> cronChannel(options?: CronChannelOptions): CronChannel; </span><span style="color:#80858F;">// IChannel with start/stop, plus on() bound to its name</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> CRON_CHANNEL_NAME: </span><span style="color:#E7C58C;">&#39;cron&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> SCHEDULE_LOCK_TTL_MS: </span><span style="color:#E7C58C;">600_000</span><span style="color:#E3E5EA;">;</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ChannelStatus, IChannel } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { CronSubscriber } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../subscription/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> CronChannelErrorContext = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The subscription id. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    subscription: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> CronChannelOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** The channel name; default \`cron\`. A second instance needs its own. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    name?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Owner of the tick locks. Default \`\${hostname()}-\${pid}\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    owner?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * How long a tick&#39;s lock key is held; a tick whose timer fires this late or</span></span>
<span class="line"><span style="color:#80858F;">     * later is skipped. Default SCHEDULE_LOCK_TTL_MS.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    lockTtlMs?: number;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Receives a failing tick (lock store, overlap check or dispatch) and a</span></span>
<span class="line"><span style="color:#80858F;">     * folder agent&#39;s subscription hubwire cannot schedule. Ticks another</span></span>
<span class="line"><span style="color:#80858F;">     * replica won are not errors. Default console.error(&#39;[chamvi]&#39;, error, ctx).</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    onError?: (error: unknown, ctx: CronChannelErrorContext) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> void;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The cron channel: background inbound only (no \`in\`, no \`out\`), with \`on()\` bound to its name and a \`status()\`. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> CronChannel = IChannel &amp; CronSubscriber &amp; { status(): ChannelStatus };</span></span></code></pre></div><p><code>engine.start()</code> starts the channel: it schedules the cron subscriptions <strong>of this channel</strong> (<code>subscription.channel === name</code>) of <code>engine.listAgents()</code> and locks through <code>engine.lockService</code>. The subscription of an agent without a revision (one passed in code) the scheduler cannot use (expression, timezone) fails <code>engine.start()</code> with <code>InvalidAgentDefinitionError</code>; a folder agent&#39;s (one the engine holds at a revision) goes to <code>onError</code> instead and leaves that agent unscheduled. An invalid <code>name</code> (the agent-name rule), an empty <code>owner</code> or a <code>lockTtlMs</code> that is no positive integer throws <code>InvalidAgentDefinitionError</code> when <code>cronChannel()</code> is called.</p><p>It follows the engine&#39;s <code>agents.changed</code> events: an added agent is scheduled, a replaced one rescheduled, a removed one unscheduled. A replacement whose cron subscription hubwire cannot schedule goes to <code>onError</code> and leaves that agent unscheduled. <code>stop()</code> (called first by <code>engine.drain()</code> and <code>engine.stop()</code>) stops following and waits for the ticks in flight, also of replaced and removed agents.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> assertSchedulable(agent: Agent, channel?: string): void; </span><span style="color:#80858F;">// channel default &#39;cron&#39;</span></span></code></pre></div><p>Throws the same error as the start for an agent&#39;s subscriptions of <code>channel</code>, without scheduling anything; the app runs it on every folder agent before registering it.</p><h2 id="cron-on" tabindex="-1">cron.on <a class="header-anchor" href="#cron-on" aria-label="Permalink to &quot;cron.on&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> cron: CronSubscriber; </span><span style="color:#80858F;">// cron.on(expression, options?): a subscription of the channel named &#39;cron&#39;</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ChannelSubscription, ConversationRef } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** What a tick does while a run of the same subscription is active. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> OverlapPolicy = </span><span style="color:#E7C58C;">&#39;skip&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;queue-one&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;allow&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> CronSubscriptionOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Shared-store execution cap within the agent; omitted or false adds no cap. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    concurrencyMaxRuns?: number | false;</span></span>
<span class="line"><span style="color:#80858F;">    /** IANA zone; default the process&#39;s local zone. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    timezone?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Default \`skip\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    overlap?: OverlapPolicy;</span></span>
<span class="line"><span style="color:#80858F;">    /** The run&#39;s payload; default \`{ scheduledAt: &#39;&lt;ISO&gt;&#39; }\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    payload?: unknown;</span></span>
<span class="line"><span style="color:#80858F;">    /** The subscription id, unique per agent; default \`cron:&lt;expression&gt;\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    id?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Starts each run inside this conversation of a registered channel,</span></span>
<span class="line"><span style="color:#80858F;">     * through that channel&#39;s trusted intake (the agent needs \`conversation\`</span></span>
<span class="line"><span style="color:#80858F;">     * enabled): the run&#39;s source is the conversation&#39;s channel and address,</span></span>
<span class="line"><span style="color:#80858F;">     * so its replies there need no tainted-outbound approval and become turns</span></span>
<span class="line"><span style="color:#80858F;">     * of the conversation. Needs \`text\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    conversation?: ConversationRef;</span></span>
<span class="line"><span style="color:#80858F;">    /** The user turn of a conversation run (non-blank); only with \`conversation\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    text?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Makes cron subscriptions for one channel name. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> CronSubscriber = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    on(expression: string, options?: CronSubscriptionOptions): ChannelSubscription;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><p>Throws <code>InvalidAgentDefinitionError</code> for an expression cron-parser refuses, an unknown timezone, an unknown <code>overlap</code>, an empty <code>id</code>, or a <code>conversation</code> without a non-blank <code>text</code> (and vice versa) or with a blank field. The id defaults to <code>cron:&lt;expression&gt;</code>. See <a href="/guide/scheduler#inside-a-conversation">Inside a conversation</a>.</p><h2 id="runjob" tabindex="-1">runJob <a class="header-anchor" href="#runjob" aria-label="Permalink to &quot;runJob&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> runJob(opts: RunJobOptions): Promise&lt;RunJobResult&gt;;</span></span></code></pre></div><p>Starts the engine with <code>start({ channels: false })</code>. It does not return while the run waits on runs it <a href="/guide/dispatch">dispatched</a>; it returns <code>waiting</code> when the run or one of its descendants waits on an approval, with <code>waitingRunId</code> naming the descendant. Rejects with <code>InvalidAgentDefinitionError</code> when the subscription is missing or ambiguous, the engine holds no cron channel for it, or it has a <code>conversation</code> (a job starts no channel to deliver to; such a subscription runs only in the app&#39;s scheduler).</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Agent, IEngine } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { RunStatusLiteral } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/store&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RunJobOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Not started yet; runJob starts it without channels and drains it, also</span></span>
<span class="line"><span style="color:#80858F;">     * when the tick is skipped. It holds the subscription&#39;s cron channel. Its store is polled and its clock gives scheduledAt and drives</span></span>
<span class="line"><span style="color:#80858F;">     * the poll.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    engine: IEngine;</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: Agent;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Cron subscription id; optional when the agent has exactly one</span></span>
<span class="line"><span style="color:#80858F;">     * subscription of a cron channel the engine holds.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    subscription?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Fallback poll of engine.getRun, default 1_000. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    pollMs?: number;</span></span>
<span class="line"><span style="color:#80858F;">    /** Passed to engine.drain, default 30_000. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    drainTimeoutMs?: number;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Stops the job: already aborted, nothing is fired and the engine is never</span></span>
<span class="line"><span style="color:#80858F;">     * started (\`skipped\`); aborted while waiting, the wait ends and the engine</span></span>
<span class="line"><span style="color:#80858F;">     * drains, and the result is the run as stored after the drain. The abort</span></span>
<span class="line"><span style="color:#80858F;">     * reason is never thrown.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    signal?: AbortSignal;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RunJobResult = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    runId?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The run&#39;s status when the job returned: \`completed\`, \`failed\`,</span></span>
<span class="line"><span style="color:#80858F;">     * \`cancelled\`, \`waiting\` (on an approval, its own or a descendant&#39;s), \`queued\` (behind a run of its concurrency key</span></span>
<span class="line"><span style="color:#80858F;">     * that waits for an approval), or &#39;skipped&#39; (overlap, or a signal</span></span>
<span class="line"><span style="color:#80858F;">     * aborted before the call). After an abort while waiting: the status the</span></span>
<span class="line"><span style="color:#80858F;">     * drain left, usually \`interrupted\`, or \`running\` when the drain timed out</span></span>
<span class="line"><span style="color:#80858F;">     * before the run was marked.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    status: RunStatusLiteral | </span><span style="color:#E7C58C;">&#39;skipped&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Set when the run waits on its dispatched runs and a descendant, not the</span></span>
<span class="line"><span style="color:#80858F;">     * run itself, waits on an approval: that descendant&#39;s id.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    waitingRunId?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** 1 for failed and cancelled; 0 otherwise (an interrupted run is resumed by a replica). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    exitCode: </span><span style="color:#E7C58C;">0</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">1</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><h2 id="building-blocks" tabindex="-1">Building blocks <a class="header-anchor" href="#building-blocks" aria-label="Permalink to &quot;Building blocks&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> fireCronSubscription(ctx: CronTickContext): Promise&lt;CronTickResult&gt;;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> readCronOptions(agent: Agent, subscription: ChannelSubscription): CronOptions;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> createRepositoryScheduleLock(locks: Pick&lt;LockService, </span><span style="color:#E7C58C;">&#39;acquire&#39;</span><span style="color:#E3E5EA;">&gt;, owner: string): IScheduleLock;</span></span></code></pre></div><p><code>fireCronSubscription</code> is one tick (overlap check and dispatch, through the conversation channel&#39;s intake for a subscription with <code>conversation</code>) for an explicit <code>scheduledAt</code>; the channel and <code>runJob</code> both call it. <code>createRepositoryScheduleLock</code> adapts core&#39;s <code>LockService</code> to hubwire&#39;s <code>IScheduleLock</code>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> {</span></span>
<span class="line"><span style="color:#E3E5EA;">    Agent,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ChannelContext,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ChannelSubscription,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ConversationRef,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IEngine,</span></span>
<span class="line"><span style="color:#E3E5EA;">} </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { OverlapPolicy } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../subscription/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The options \`cron.on()\` stores on a subscription, read back and checked. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> CronOptions = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    expression: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    timezone?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    overlap: OverlapPolicy;</span></span>
<span class="line"><span style="color:#E3E5EA;">    payload?: unknown;</span></span>
<span class="line"><span style="color:#80858F;">    /** Set together with \`text\`: the conversation each run starts in. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    conversation?: ConversationRef;</span></span>
<span class="line"><span style="color:#E3E5EA;">    text?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> CronTickContext = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    engine: IEngine;</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: Agent;</span></span>
<span class="line"><span style="color:#E3E5EA;">    subscription: ChannelSubscription;</span></span>
<span class="line"><span style="color:#80858F;">    /** The tick&#39;s planned fire time; forms the idempotency key. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    scheduledAt: Date;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The channel&#39;s dispatch (sets the channel name itself). Default</span></span>
<span class="line"><span style="color:#80858F;">     * engine.dispatch with \`channel\` = the subscription&#39;s channel. Not</span></span>
<span class="line"><span style="color:#80858F;">     * used for a subscription with a conversation, which dispatches through</span></span>
<span class="line"><span style="color:#80858F;">     * the conversation channel&#39;s intake.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    dispatch?: ChannelContext[</span><span style="color:#E7C58C;">&#39;dispatch&#39;</span><span style="color:#E3E5EA;">];</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> CronTickDispatched = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    dispatched: true;</span></span>
<span class="line"><span style="color:#E3E5EA;">    runId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    deduplicated: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * \`overlap\`: the policy held the tick back; \`channel\`: the engine holds no</span></span>
<span class="line"><span style="color:#80858F;"> * channel named by the subscription&#39;s conversation.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> CronTickSkipped = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    dispatched: false;</span></span>
<span class="line"><span style="color:#E3E5EA;">    reason: </span><span style="color:#E7C58C;">&#39;overlap&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;channel&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> CronTickResult = CronTickDispatched | CronTickSkipped;</span></span></code></pre></div>`,23)])])}const h=n(o,[["render",p]]);export{y as __pageData,h as default};
