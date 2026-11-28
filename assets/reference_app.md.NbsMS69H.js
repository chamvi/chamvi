import{_ as n,o as a,c as e,a2 as o}from"./chunks/framework.DiXyETtc.js";const y=JSON.parse('{"title":"@chamvi/app","description":"","frontmatter":{},"headers":[],"relativePath":"reference/app.md","filePath":"reference/app.md","lastUpdated":1795874370000}'),l={name:"reference/app.md"};function p(t,s,c,r,i,E){return a(),e("div",null,[...s[0]||(s[0]=[o(`<h1 id="chamvi-app" tabindex="-1">@chamvi/app <a class="header-anchor" href="#chamvi-app" aria-label="Permalink to &quot;@chamvi/app&quot;">​</a></h1><p>Boots chamvi agents as an app. The public API of <code>packages/app/src/index.ts</code> and its subpath entries; see <a href="/guide/app">Apps &amp; Modules</a> for the concepts.</p><div class="language-bash"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#E3E5EA;">npm </span><span style="color:#E7C58C;">install</span><span style="color:#E7C58C;"> @chamvi/app</span><span style="color:#E7C58C;"> ai</span><span style="color:#E7C58C;"> typeorm</span><span style="color:#E7C58C;"> pg</span></span></code></pre></div><p><code>ai</code>, <code>typeorm</code> and <code>pg</code> are peer dependencies. The provider packages (<code>@ai-sdk/anthropic</code>, <code>@ai-sdk/openai</code>, <code>@ai-sdk/openai-compatible</code>, <code>@ai-sdk/google</code>, <code>@ai-sdk/mistral</code>, <code>@ai-sdk/xai</code>) and the <code>@authup/*</code> packages behind <code>@chamvi/app/authup</code> are optional peers. The other optional modules ship with their feature packages (<code>@chamvi/github/module</code>, ...), so <code>@chamvi/app</code> depends on none of them. The main entry re-exports <code>@chamvi/core</code>, <code>@chamvi/access</code> (<code>Permission</code>, <code>can</code>, <code>canSome</code> and the binding types) and the <code>Authenticator</code>, <code>Principal</code>, <code>HttpRoute</code>, <code>HttpRouteContext</code>, <code>HttpRouteRequest</code>, <code>HttpRouteResult</code> and <code>StaticToken</code> types of <code>@chamvi/http</code>.</p><table tabindex="0"><thead><tr><th>Entry</th><th>Exports</th><th>Needs</th></tr></thead><tbody><tr><td><code>@chamvi/app</code></td><td><code>createApp</code>, <code>isApp</code>, the built-in modules, the module contract (tokens, <code>ModuleName</code>, <code>AppContext</code>, <code>ILifecycleHook</code>, the <code>IModule</code> and <code>IContainer</code> types), env readers, <code>approvalUrlOf</code>, <code>readConfig</code>, <code>createLogger</code>, <code>BUILTIN_PROVIDERS</code>, the model and check types (<code>ProviderConfig</code>, <code>SecretValue</code>, <code>AppCheckOptions</code>, <code>AppCheckResult</code>, ...)</td><td></td></tr><tr><td><code>@chamvi/app/authup</code></td><td><code>authupModule</code>, <code>oidcModule</code></td><td><code>@authup/server-adapter-kit</code>, <code>@authup/core-http-kit</code></td></tr><tr><td><code>@chamvi/app/testing</code></td><td><code>buildModuleHarness</code>, <code>createModuleHarness</code>, <code>memoryStoreModule</code></td><td></td></tr></tbody></table><h2 id="createapp" tabindex="-1">createApp <a class="header-anchor" href="#createapp" aria-label="Permalink to &quot;createApp&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> createApp(options: AppOptions): IApp;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> isApp(value: unknown): value </span><span style="color:#8EA7FF;">is</span><span style="color:#E3E5EA;"> IApp;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> APP_BRAND: unique symbol; </span><span style="color:#80858F;">// Symbol.for(&#39;chamvi.app&#39;)</span></span></code></pre></div><p>Synchronous and side-effect free. <code>agents</code> may be omitted or empty: the agents can come from an <a href="/guide/agent-folders">agents folder</a>, and an app with no agent at all still starts (a warning); <code>app.agents</code> holds only the agents passed in code, the live set is <code>engine.listAgents()</code>. Throws <code>InvalidAgentDefinitionError</code> for options that are no object or whose <code>agents</code> is no array, a module list entry that is no <code>IModule</code> and for two modules of one name (a built-in&#39;s name included: list one module to replace a built-in). <code>isApp</code> checks the brand, so an app of another installed copy matches.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> {</span></span>
<span class="line"><span style="color:#E3E5EA;">    Agent,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ConversationOptions,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ModelRef,</span></span>
<span class="line"><span style="color:#E3E5EA;">    SkillInput,</span></span>
<span class="line"><span style="color:#E3E5EA;">} </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { AgentIssue } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core-kit&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IModule } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;orkos&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Env } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../env/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ModelProviders, ProviderConfig } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../models/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { APP_BRAND } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;./constants.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AppOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The agents passed in code and agent packages: an \`Agent\`, or a bare package</span></span>
<span class="line"><span style="color:#80858F;">     * specifier (\`&#39;@acme/agents&#39;\`, \`&#39;@acme/agents/triage&#39;\`) whose default</span></span>
<span class="line"><span style="color:#80858F;">     * export is an agent or an array of agents, resolved from the working</span></span>
<span class="line"><span style="color:#80858F;">     * directory at start. May be omitted or empty when an agents dir,</span></span>
<span class="line"><span style="color:#80858F;">     * \`chamvi.json\` \`agents\` or \`AGENTS\` provides the agents.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    agents?: (Agent | string)[];</span></span>
<span class="line"><span style="color:#80858F;">    /** Additive skill defaults for every code and folder agent, verified before serving. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    skills?: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> SkillInput[];</span></span>
<span class="line"><span style="color:#80858F;">    /** Optional conversation recall and notes; the default store follows the app&#39;s selected data source. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    conversations?: ConversationOptions;</span></span>
<span class="line"><span style="color:#80858F;">    /** Extra modules; one named like a built-in (\`ModuleName\`) replaces it. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    modules?: IModule[];</span></span>
<span class="line"><span style="color:#80858F;">    /** The default model of agents without one; MODEL and the config file win. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    model?: ModelRef;</span></span>
<span class="line"><span style="color:#80858F;">    /** Named providers model strings resolve through; env and the config file win per field. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    providers?: Record&lt;string, ProviderConfig&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** AI SDK providers by id; they win over every provider setting for their ids. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    models?: ModelProviders;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AppLifecycleOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Default \`process.env\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    env?: Env;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AppStartOptions = AppLifecycleOptions &amp; {</span></span>
<span class="line"><span style="color:#E3E5EA;">    dev?: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AppCheckOptions = AppStartOptions;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AppCheckResult = {</span></span>
<span class="line"><span style="color:#80858F;">    /** The agent folders&#39; and packages&#39; load issues (\`AGENT_ISSUES\`), then one per incomplete connection (\`agent\` holds its name). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    issues: AgentIssue[];</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AppRunJobOptions = AppLifecycleOptions &amp; {</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Cron subscription id; optional when the agent has exactly one cron subscription. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    subscription?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AppRunJobResult = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    runId?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    status: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    exitCode: </span><span style="color:#E7C58C;">0</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">1</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * An app: built by createApp, run once by one of \`start\`, \`runJob\` or</span></span>
<span class="line"><span style="color:#80858F;"> * \`migrate\` (a second lifecycle rejects with \`app_in_use\`).</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> interface</span><span style="color:#E3E5EA;"> IApp {</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> [APP_BRAND]: true;</span></span>
<span class="line"><span style="color:#80858F;">    /** The agents passed in code (createApp&#39;s \`agents\` that are no string); package and folder agents are in the engine&#39;s live set. */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> agents: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> Agent[];</span></span>
<span class="line"><span style="color:#80858F;">    /** createApp&#39;s package specifiers, in order (\`chamvi.json\` and \`AGENTS\` add theirs at start). */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> packages: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> string[];</span></span>
<span class="line"><span style="color:#80858F;">    /** Sets every module up; resolves once the HTTP server listens. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    start(options?: AppStartOptions): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Memoized: aborts the lifecycle, waits for it, tears every module down;</span></span>
<span class="line"><span style="color:#80858F;">     * rejects with \`app_stop_failed\` when anything was reported meanwhile.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    stop(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** Fires one cron subscription once and waits for its run (no channel started, no HTTP). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    runJob(options: AppRunJobOptions): Promise&lt;AppRunJobResult&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** Migrates the store (DATABASE_URL required) and closes it. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    migrate(options?: AppLifecycleOptions): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The start path up to its start steps (\`context.check\`, mode \`start\`):</span></span>
<span class="line"><span style="color:#80858F;">     * config, store connection, model settings, every module&#39;s setup and</span></span>
<span class="line"><span style="color:#80858F;">     * onReady and the agent folders&#39; load and checks, then the teardown; no</span></span>
<span class="line"><span style="color:#80858F;">     * engine or channel start, no server, no run, no skill provider calls or</span></span>
<span class="line"><span style="color:#80858F;">     * content verification, no store write (no</span></span>
<span class="line"><span style="color:#80858F;">     * migration, marker, cancel or lock). Resolves the agent folders&#39; load</span></span>
<span class="line"><span style="color:#80858F;">     * issues; the lifecycle hooks \`engineCreated\` and \`drained\` run, never</span></span>
<span class="line"><span style="color:#80858F;">     * \`started\` or \`stopping\`. A configuration error rejects (\`invalid_agent_definition\`), a</span></span>
<span class="line"><span style="color:#80858F;">     * store failure with its own code (\`store_not_migrated\`, a connection</span></span>
<span class="line"><span style="color:#80858F;">     * error). The app&#39;s one lifecycle, like start().</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    check(options?: AppCheckOptions): Promise&lt;AppCheckResult&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">}</span></span></code></pre></div><table tabindex="0"><thead><tr><th>Method</th><th>Builds</th><th>Rejects with</th></tr></thead><tbody><tr><td><code>start</code></td><td>config, store (migrated unless <code>MIGRATE=false</code>), engine with every contributed channel (the cron channel fires unless <code>SCHEDULER=false</code>), http; starts the engine (and so its channels) once every module built, resolves once listening</td><td>the setup error (a module graph error as <code>InvalidAgentDefinitionError</code>); <code>app_stopped</code> when <code>stop()</code> interrupted the setup (the setup&#39;s own error is logged); <code>app_in_use</code> for a second lifecycle or after <code>stop()</code></td></tr><tr><td><code>stop</code></td><td>the shutdown sequence (see <a href="/guide/app#start-and-stop">Start and stop</a>); memoized, waits for a setup in flight</td><td><code>app_stop_failed</code> when a teardown failed (each failure is logged)</td></tr><tr><td><code>runJob</code></td><td>config, store (migrated), engine (not started: <code>@chamvi/channel-cron</code> <code>runJob</code> starts it without channels, ticks and drains it); no http</td><td>the job&#39;s error; <code>app_in_use</code></td></tr><tr><td><code>migrate</code></td><td>config, store (<code>migrateStore</code>), every <a href="/guide/database">database module</a> (its migrations), their teardown</td><td><code>InvalidAgentDefinitionError</code> without <code>DATABASE_URL</code>; <code>app_in_use</code></td></tr><tr><td><code>check</code></td><td>the <code>start</code> path up to its start steps (<code>context.check</code>, mode <code>start</code>): config, store (connected, never migrated: pending migrations reject with <code>store_not_migrated</code> unless <code>MIGRATE</code> is on), the model settings, every module&#39;s setup and onReady, the agent folders loaded and checked (<code>engine.checkAgent()</code>, never <code>putAgent</code>), then the teardown. No engine or channel start, no server, no run, no store write (no migration, revision marker, cancel or lock). Resolves <code>{ issues }</code>, the agent folders&#39; load issues</td><td>the setup error (<code>invalid_agent_definition</code> for a configuration error), the store&#39;s (<code>store_not_migrated</code>, a connection error); <code>app_in_use</code>: it is the app&#39;s one lifecycle</td></tr></tbody></table><p><code>runJob</code> resolves <code>exitCode: 0</code> for a <code>completed</code>, <code>waiting</code>, <code>skipped</code>, queued-behind-an-approval or signal-interrupted run, <code>1</code> for <code>failed</code> or <code>cancelled</code>.</p><h2 id="errors" tabindex="-1">Errors <a class="header-anchor" href="#errors" aria-label="Permalink to &quot;Errors&quot;">​</a></h2><p><code>ChamviError</code> codes in <code>APP_ERROR_CODE</code>:</p><table tabindex="0"><thead><tr><th>Code</th><th>When</th></tr></thead><tbody><tr><td><code>app_stopped</code></td><td>The lifecycle&#39;s abort reason once <code>stop()</code> was called; a start stopped while setting up rejects with it</td></tr><tr><td><code>app_in_use</code></td><td>A second <code>start</code>, <code>runJob</code> or <code>migrate</code> on the same app</td></tr><tr><td><code>app_stop_failed</code></td><td><code>stop()</code> (or a job&#39;s teardown) after one or more teardown errors, each logged</td></tr></tbody></table><p>Configuration errors (a malformed or missing variable, a model string naming a provider that is not configured, an agent with no model and no default, a duplicate module name) are core <code>InvalidAgentDefinitionError</code>s; they name the variable and never echo its value.</p><h2 id="environment" tabindex="-1">Environment <a class="header-anchor" href="#environment" aria-label="Permalink to &quot;Environment&quot;">​</a></h2><p>Read by <code>readConfig(env, { mode, dev })</code> once per lifecycle; the optional module factories read their own variables when they are called. Empty string is unset, integers are <code>/^\\d+$/</code> (every <code>*_MS</code> variable at most <code>TIMER_MAX_MS</code>, 2147483647, since a larger Node timer fires after 1 ms), booleans <code>true</code>, <code>false</code>, <code>1</code> or <code>0</code>.</p><table tabindex="0"><thead><tr><th>Variable</th><th>Module</th><th>Type</th><th>Default</th><th>Required when</th></tr></thead><tbody><tr><td><code>PORT</code></td><td>http</td><td>int 1..65535</td><td><code>3000</code></td><td>never</td></tr><tr><td><code>HOST</code></td><td>http</td><td>string</td><td><code>0.0.0.0</code></td><td>never</td></tr><tr><td><code>BASE_PATH</code></td><td>http</td><td>empty or <code>^(?:\\/[a-z0-9._~-]+)+$</code></td><td><code>&#39;&#39;</code> (health at <code>/healthz</code>, UI at <code>/ui</code>)</td><td>never</td></tr><tr><td><code>PUBLIC_URL</code></td><td>http, ui, channels</td><td>absolute URL</td><td>unset</td><td>an approval link is wanted</td></tr><tr><td><code>LOG_LEVEL</code></td><td>config</td><td><code>error</code>, <code>warn</code>, <code>info</code>, <code>debug</code></td><td><code>info</code></td><td>never</td></tr><tr><td><code>DATABASE_URL</code></td><td>store</td><td><code>postgres://...</code></td><td>unset: memory repositories (warned outside dev)</td><td><code>migrate</code>; any multi-replica or CronJob deployment</td></tr><tr><td><code>MIGRATE</code></td><td>store</td><td>bool</td><td><code>true</code></td><td>never</td></tr><tr><td><code>PURGE_INTERVAL_MS</code></td><td>store</td><td>int, <code>0</code> disables</td><td><code>3600000</code> (the lock, idempotency and limit services&#39; <code>purgeExpired()</code>, on <code>engine.clock</code>)</td><td>never</td></tr><tr><td><code>MAX_CONCURRENT_RUNS</code></td><td>engine</td><td>int &gt;= 1</td><td><code>4</code></td><td>never</td></tr><tr><td><code>SCHEDULER</code></td><td>scheduler</td><td>bool</td><td><code>true</code>; <code>false</code> starts no in-process cron (CronJob mode; <code>cron.on()</code> subscriptions still validate)</td><td>never</td></tr><tr><td><code>AGENTS_DIR</code></td><td>agents</td><td>path of a directory, relative to the working directory</td><td>unset: <code>./agents</code> when it is a directory, else no <a href="/guide/agent-folders">agent folders</a></td><td></td></tr><tr><td><code>AGENTS</code></td><td>agents</td><td>comma-separated bare package specifiers</td><td>unset; added after <code>createApp({ agents })</code>&#39;s and <code>chamvi.json</code>&#39;s (<a href="/guide/agent-packages">agent packages</a>)</td><td>never</td></tr><tr><td><code>AGENTS_POLL_MS</code></td><td>agents</td><td>int 1..<code>TIMER_MAX_MS</code></td><td><code>5000</code> (<code>DEFAULT_AGENTS_POLL_MS</code>)</td><td>never</td></tr><tr><td><code>READINESS_DELAY_MS</code></td><td>http shutdown</td><td>int</td><td><code>0</code></td><td>never</td></tr><tr><td><code>DRAIN_TIMEOUT_MS</code></td><td>http shutdown</td><td>int</td><td><code>30000</code> (dev 5000)</td><td>never</td></tr><tr><td><code>CLOSE_TIMEOUT_MS</code></td><td>http shutdown</td><td>int</td><td><code>5000</code></td><td>never</td></tr><tr><td><code>FORCE_EXIT_MS</code></td><td>cli</td><td>int</td><td><code>90000</code> (dev 15000)</td><td>never</td></tr><tr><td><code>TOKENS</code></td><td>static tokens</td><td>JSON <code>[{ &quot;value&quot;, &quot;id&quot;, &quot;permissions&quot; }]</code>, <code>value</code> at least 16 characters and unique; <code>permissions</code> is <code>&quot;*&quot;</code> (every <code>chamvi_*</code> permission) or an array of <a href="/guide/permissions">permission bindings</a></td><td>unset (dev: one random <code>&quot;*&quot;</code> token, warned)</td><td>no other authenticator is configured, outside dev</td></tr><tr><td><code>AUTHUP_URL</code>, <code>AUTHUP_SERVER_CLIENT_SECRET</code></td><td><code>authupModule</code></td><td>URL, string</td><td>unset</td><td><code>authupModule()</code> without all of <code>verifier</code>, <code>catalog</code> and <code>realm</code>; the client needs <code>permission_read</code> (the catalog) and <code>token_introspect</code>, with a realm scope of <code>ownOrNull</code> or wider, and its realm is chamvi&#39;s realm</td></tr><tr><td><code>AUTHUP_SERVER_CLIENT_ID</code></td><td><code>authupModule</code></td><td>client name or id</td><td><code>chamvi-server</code></td><td>never; the confidential client chamvi reads and verifies as (unless <code>clientId</code> is given)</td></tr><tr><td><code>AUTHUP_REALM</code></td><td><code>authupModule</code>, <code>uiModule</code></td><td>realm name or id</td><td><code>master</code></td><td>never; the realm of the server and dashboard clients, sent as <code>realm_id</code> with the client-credentials request (unless <code>clientRealm</code> is given)</td></tr><tr><td><code>AUTHUP_TIMEOUT_MS</code></td><td><code>authupModule</code></td><td>integer ms, at least 1</td><td><code>10000</code></td><td>the deadline of every catalog read, realm lookup and token verification (unless <code>timeoutMs</code> is given); a verification past it answers 503</td></tr><tr><td><code>AUTHUP_PERMISSION_OWNER</code></td><td><code>authupModule</code></td><td><code>realm</code>, <code>client</code></td><td><code>realm</code></td><td><code>client</code>: the dashboard client (<code>uiModule({ auth })</code>, else <code>AUTHUP_CLIENT_ID</code>, else <code>chamvi</code>, in chamvi&#39;s realm) owns the permissions, see <a href="/guide/permissions#owner-client">Who owns the permissions</a>; a name needs <code>client_read</code> on chamvi&#39;s client; any other value fails the start</td></tr><tr><td><code>AUTHUP_CLIENT_ID</code></td><td><code>uiModule</code></td><td>client name or id</td><td><code>chamvi</code></td><td><code>AUTHUP_URL</code> for <code>AUTHUP_CLIENT_ID</code>; the dashboard signs in through authup whenever <code>AUTHUP_URL</code> is set (token login only without it)</td></tr><tr><td><code>MODEL</code></td><td>engine</td><td><code>&#39;&lt;provider&gt;/&lt;model id&gt;&#39;</code></td><td>the config file&#39;s <code>model</code>, else <code>createApp({ model })</code></td><td>an agent has no model of its own</td></tr><tr><td><code>CONFIG_FILE</code></td><td>engine</td><td>path of a JSON file, relative to the working directory</td><td>unset: <code>./chamvi.json</code> when it exists</td><td>never</td></tr><tr><td><code>PROVIDER_&lt;NAME&gt;_TYPE</code>, <code>_API_KEY</code>, <code>_BASE_URL</code>, <code>_HEADER_&lt;HEADER&gt;</code></td><td>engine</td><td>type, secret, absolute http(s) URL, secret</td><td>unset; each field wins over the config file and code for provider <code>&lt;name&gt;</code> (upper snake case: <code>TEAM_A</code> is <code>team-a</code>)</td><td><code>_TYPE</code> when no other source declares <code>&lt;name&gt;</code>; <code>_API_KEY</code> for every type but <code>openai-compatible</code> (<a href="/guide/models#providers">providers</a>)</td></tr><tr><td><code>ANTHROPIC_API_KEY</code>, <code>OPENAI_API_KEY</code>, <code>GOOGLE_GENERATIVE_AI_API_KEY</code>, <code>MISTRAL_API_KEY</code>, <code>XAI_API_KEY</code></td><td>engine</td><td>string</td><td>unset</td><td>a model string names that implicit provider and nothing declares it; <code>ANTHROPIC_BASE_URL</code>, <code>OPENAI_BASE_URL</code> set its base URL (<a href="/guide/models#implicit-providers">implicit providers</a>)</td></tr><tr><td><code>GITHUB_APP_ID</code>, <code>GITHUB_APP_PRIVATE_KEY</code> (PEM, literal <code>\\n</code> allowed), <code>GITHUB_WEBHOOK_SECRET</code> (comma-separated for rotation); <code>GITHUB_&lt;NAME&gt;_*</code> for a module with <code>name</code></td><td><code>githubModule</code></td><td>string</td><td>none</td><td>any of them set (a partial env fails the start; nothing set in env or the store starts idle)</td></tr><tr><td><code>GITHUB_INSTALLATION_ID</code>, <code>GITHUB_APP_SLUG</code>, <code>GITHUB_API_URL</code></td><td><code>githubModule</code></td><td>int, slug, https URL</td><td>unset</td><td>never</td></tr><tr><td><code>OPENCLAW_BASE_URL</code>, <code>OPENCLAW_HOOKS_TOKEN</code>, <code>OPENCLAW_CHANNEL</code>, <code>OPENCLAW_TO</code></td><td><code>openclawModule</code></td><td>URL, string, string, string</td><td>none</td><td><code>openclawModule()</code> without options</td></tr><tr><td><code>OPENCLAW_HOOKS_PATH</code>, <code>OPENCLAW_AGENT_ID</code>, <code>OPENCLAW_ACCOUNT_ID</code></td><td><code>openclawModule</code></td><td>string</td><td><code>/hooks</code>, unset, unset</td><td>never</td></tr><tr><td><code>SANDBOX_PROVIDER</code></td><td><code>sandboxModule</code></td><td><code>local</code>, <code>docker</code>, <code>kubernetes</code></td><td>the <code>provider</code> option, else <code>local</code></td><td>never</td></tr><tr><td><code>SANDBOX_NAMESPACE</code></td><td><code>sandboxModule</code></td><td>string</td><td>none</td><td>provider <code>kubernetes</code></td></tr><tr><td><code>SANDBOX_IMAGE</code></td><td><code>sandboxModule</code></td><td>image ref</td><td><code>ghcr.io/chamvi/sandbox-dev:trixie</code></td><td>never</td></tr><tr><td><code>SANDBOX_IMAGES</code></td><td><code>sandboxModule</code></td><td>comma list of image refs</td><td>none (also a list without an entry): <code>create_workspace</code> offers no <code>image</code></td><td>never</td></tr><tr><td><code>SANDBOX_SUSPEND_AFTER_MS</code></td><td><code>sandboxModule</code></td><td>int (ms)</td><td>the <code>suspendAfterMs</code> option, else <code>1800000</code> (30 min); <code>0</code> turns off the default rule (an <code>isSuspendable</code> option replaces the rule and still applies)</td><td>never</td></tr><tr><td><code>SANDBOX_PERSISTENCE</code></td><td><code>sandboxModule</code></td><td><code>true</code>, <code>false</code>, <code>1</code>, <code>0</code></td><td>whether the <code>persistence</code> option is set; read only for provider <code>kubernetes</code></td><td>never</td></tr><tr><td><code>SANDBOX_DOCKER_SUSPEND</code></td><td><code>sandboxModule</code></td><td><code>true</code>, <code>false</code>, <code>1</code>, <code>0</code></td><td>the <code>suspend</code> option, else <code>false</code>; read only for provider <code>docker</code></td><td>never</td></tr><tr><td><code>SANDBOX_STORAGE_CLASS</code></td><td><code>sandboxModule</code></td><td>storage class name</td><td>the <code>persistence.storageClassName</code> option, else the cluster default; only with persistence</td><td>never</td></tr><tr><td><code>DEPLOYMENT</code></td><td><code>sandboxModule</code></td><td>label value (at most 63 letters, digits, <code>-</code>, <code>_</code>, <code>.</code>)</td><td>the <code>deployment</code> option, else <code>default</code></td><td>several apps share one Docker host or namespace (one value per app); only with a value are the workspaces of runs the store does not hold collected</td></tr><tr><td><code>KNOWLEDGE_MODEL</code></td><td><code>knowledgeModule</code></td><td><code>&#39;&lt;provider&gt;/&lt;model id&gt;&#39;</code></td><td>the <code>embeddingModel</code> option, else none: creating a <a href="/guide/knowledge#managed-collections">managed collection</a> answers 409</td><td>never</td></tr><tr><td><code>ENCRYPTION_KEYS</code></td><td>config (<code>AppToken.KEYRING</code>)</td><td><code>&lt;id&gt;:&lt;base64 of 32 bytes&gt;[,&lt;id&gt;:&lt;base64&gt;...]</code>, ids by the agent-name rule, the first active</td><td>unset</td><td>a module resolves <code>AppToken.KEYRING</code> (e.g. <a href="/deployment/whatsapp#with-chamvi-app"><code>whatsappModule()</code></a>) or a <a href="/guide/ui#connection-pages">dashboard save</a> stores a connection (plain settings too); read only then, so an env-only app needs no key. Rows wrapped under an older listed key stay readable (<a href="/deployment/whatsapp#session-store">rotation</a>)</td></tr></tbody></table><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> readConfig(env: Env, options: ReadConfigOptions): AppConfig;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> approvalUrlOf(config: AppConfig): ((ref: ApprovalRef) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> string) | undefined; </span><span style="color:#80858F;">// needs PUBLIC_URL</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> readKeyring(env: Env): IKeyring; </span><span style="color:#80858F;">// ENCRYPTION_KEYS, the value of AppToken.KEYRING</span></span></code></pre></div><p>The env readers modules build on, each throwing <code>InvalidAgentDefinitionError</code> that names the variable:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> envString(env: Env, name: string, options?: EnvStringOptions): string | undefined;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> envInteger(env: Env, name: string, options?: EnvIntegerOptions): number | undefined;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> envBoolean(env: Env, name: string, options?: EnvReadOptions&lt;boolean&gt;): boolean | undefined;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> envUrl(env: Env, name: string, options?: EnvUrlOptions): string | undefined;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> envList(env: Env, name: string, options?: EnvReadOptions&lt;string[]&gt;): string[] | undefined; </span><span style="color:#80858F;">// comma-separated</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> envJson(env: Env, name: string, options?: EnvJsonOptions): unknown;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> envOneOf&lt;T </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> string&gt;(env: Env, name: string, values: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> T[], options?: EnvReadOptions&lt;T&gt;): T | undefined;</span></span></code></pre></div><p>With <code>required: true</code> or a <code>default</code> the overloads return a defined value.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> Env = Record&lt;string, string | undefined&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> EnvReadOptions&lt;T&gt; = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Used when the variable is unset or empty. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    default?: T;</span></span>
<span class="line"><span style="color:#80858F;">    /** Throws when the variable is unset or empty and no default is given. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    required?: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Options that make a reader return a defined value. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> EnvDefinedOptions&lt;T&gt; = { required: true } | { default: T };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> EnvStringOptions = EnvReadOptions&lt;string&gt; &amp; { minLength?: number };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> EnvIntegerOptions = EnvReadOptions&lt;number&gt; &amp; { min?: number; max?: number };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> EnvUrlOptions = EnvReadOptions&lt;string&gt; &amp; { protocols?: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> string[] };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> EnvJsonOptions = { required?: boolean };</span></span></code></pre></div><h2 id="http-intake-and-execution-ceilings" tabindex="-1">HTTP intake and execution ceilings <a class="header-anchor" href="#http-intake-and-execution-ceilings" aria-label="Permalink to &quot;HTTP intake and execution ceilings&quot;">​</a></h2><p><code>httpModule({ channelRateLimits, trustProxy })</code> forwards the <a href="/reference/http#channel-http-request-limits">channel request policies</a> to <code>createHttpApp()</code>. Configure a mounted channel by its exact name, with <code>{ max, windowMs? }</code> for a separate per-client bucket or <code>false</code> to disable only that channel&#39;s intake limiter. No environment variable is added for this setting. Trust only known proxy sources.</p><p><code>MAX_CONCURRENT_RUNS</code> is the local engine ceiling. Agent and subscription <code>concurrencyMaxRuns?: number | false</code> add nested shared-store ceilings; see <a href="/guide/concurrency#shared-agent-and-subscription-ceilings">Concurrency</a>.</p><h2 id="built-in-modules" tabindex="-1">Built-in modules <a class="header-anchor" href="#built-in-modules" aria-label="Permalink to &quot;Built-in modules&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> configModule(options?: ConfigModuleOptions): IModule;            </span><span style="color:#80858F;">// &#39;chamvi:config&#39;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> storeModule(options?: StoreModuleOptions): IModule;              </span><span style="color:#80858F;">// &#39;chamvi:store&#39;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> staticTokensModule(options?: StaticTokensModuleOptions): IModule; </span><span style="color:#80858F;">// &#39;chamvi:static-tokens&#39;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> engineModule(options?: EngineModuleOptions): IModule;            </span><span style="color:#80858F;">// &#39;chamvi:engine&#39;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> agentsModule(options?: AgentsModuleOptions): IModule;            </span><span style="color:#80858F;">// &#39;chamvi:agents&#39;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> schedulerModule(options?: SchedulerModuleOptions): IModule;      </span><span style="color:#80858F;">// &#39;chamvi:scheduler&#39;, the cron channel</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> httpModule(options?: HttpModuleOptions): IModule;                </span><span style="color:#80858F;">// &#39;chamvi:http&#39;, the http, mcp and webhook channels</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> consoleChannelModule(options?: ConsoleChannelModuleOptions): IModule; </span><span style="color:#80858F;">// &#39;chamvi:console&#39; (&#39;chamvi:console:&lt;name&gt;&#39; with a name)</span></span></code></pre></div><p>Listing one of them in <code>createApp({ modules })</code> replaces the default instance. <code>engineModule()</code> reads the <a href="/guide/models">model settings</a> in <code>setup</code> (<code>start</code> and <code>job</code> mode: env over the config file over <code>createApp({ model, providers })</code>, <code>models</code> over all for its ids), refusing every settings issue at once (<code>The model settings have &lt;n&gt; issue(s):</code> and one line each), imports the provider packages the settings need and passes the default model and the resolver to the <code>Engine</code> as <code>model</code> and <code>models</code>, which checks every agent when it is registered; it never reads or sets the AI SDK&#39;s global default provider. <code>agentsModule()</code> loads the <a href="/guide/agent-packages">agent packages</a> (createApp&#39;s specifiers, <code>chamvi.json</code> <code>agents</code>, <code>AGENTS</code>; <code>options.cwd</code> is where they and the agents dir resolve from, default the working directory; <code>chamvi.json</code> itself is always read from the working directory, the file the engine module reads) once in <code>onReady</code>, before the folders, then reads <code>AGENTS_DIR</code>, else takes <code>./agents</code> when it is a directory: in <code>start</code> and <code>job</code> mode its <code>onReady</code> loads every folder into the engine before any start step (a dir that is no directory is <code>InvalidAgentDefinitionError</code>), and in <code>start</code> mode a lifecycle hook polls the dir from <code>started</code> until <code>stopping</code>; it registers <code>AppToken.AGENT_ISSUES</code>, which the http module passes on as <code>agentIssues</code>. A folder agent passes every <code>AppToken.AGENT_CHECKS</code> contribution (the scheduler module&#39;s <code>assertSchedulable</code>, the http module&#39;s <code>assertMcpRunTool</code> unless <code>mcp: false</code>) and the engine&#39;s registration checks in <code>putAgent</code> (every subscription names a registered channel, the model resolves through the app&#39;s providers) before it is registered; a refusal is a load issue, never a failed boot. Only <code>start</code> mode removes an agent whose marker has no folder; a job never does. Without a dir or a package it only warns for an app without agents.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IClock } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ILogger } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../../logger/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ConfigModuleOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** \`AppToken.CLOCK\`; default \`systemClock\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    clock?: IClock;</span></span>
<span class="line"><span style="color:#80858F;">    /** \`AppToken.LOGGER\`; default the JSON line logger at \`LOG_LEVEL\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    logger?: ILogger;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><p><code>StoreModuleOptions</code> (<code>dataSource</code> must be initialized, is migrated like a built one and never destroyed; <code>url</code> wins over <code>DATABASE_URL</code>; a data source built from a URL waits at most 10 s for Postgres to accept the first connection). A module named <code>ModuleName.STORE</code> that registers the repository tokens replaces it (<a href="/repositories/writing-a-repository#register-it-with-an-app">Writing a Repository</a>):</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { DataSource } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;typeorm&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> StoreModuleOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** A Postgres URL; default \`DATABASE_URL\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    url?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** An initialized data source, shared by the database repositories and never destroyed. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    dataSource?: DataSource;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Which optional aggregates a memory store keeps (each default \`true\`). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> MemoryStoreAggregates = {</span></span>
<span class="line"><span style="color:#80858F;">    /** \`false\`: no connection repository, so \`CONNECTION_REPOSITORY\` and \`CONNECTION_SERVICE\` are not registered. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    connections?: boolean;</span></span>
<span class="line"><span style="color:#80858F;">    /** \`false\`: no conversation repository, so \`CONVERSATION_REPOSITORY\` and \`CONVERSATION_SERVICE\` are not registered. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    conversations?: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { StaticToken } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/http&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> StaticTokensModuleOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Default \`TOKENS\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    tokens?: StaticToken[];</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> EngineModuleOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Claim owner; default the engine&#39;s \`\${hostname}-\${pid}\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    owner?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Claim lease; default the engine&#39;s 60 s. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    claimTtlMs?: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> SchedulerModuleOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Lock owner; default the cron channel&#39;s \`\${hostname}-\${pid}\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    owner?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Default the cron channel&#39;s SCHEDULE_LOCK_TTL_MS. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    lockTtlMs?: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { HttpAppOptions } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/http&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * Which of the built-in intake channels taint every run they start</span></span>
<span class="line"><span style="color:#80858F;"> * (\`httpChannel({ untrusted })\`, \`mcpChannel({ untrusted })\`), for callers</span></span>
<span class="line"><span style="color:#80858F;"> * that relay text written by others (an OpenClaw MCP principal). Both default</span></span>
<span class="line"><span style="color:#80858F;"> * to trusted.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> HttpModuleUntrustedOptions = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    http?: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">    mcp?: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * \`createHttpApp\` options the module passes through (\`bodyLimit\` also bounds</span></span>
<span class="line"><span style="color:#80858F;"> * the webhook channel&#39;s deliveries), plus \`untrusted\` for the \`http\` and \`mcp\`</span></span>
<span class="line"><span style="color:#80858F;"> * channels; \`engine\`, \`auth\`, \`shutdown\`, \`routes\`, \`channels\`, \`connections\`,</span></span>
<span class="line"><span style="color:#80858F;"> * \`basePath\` and \`onError\` come from the app.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> HttpModuleOptions = Omit&lt;HttpAppOptions, </span><span style="color:#E7C58C;">&#39;engine&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;auth&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;shutdown&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;routes&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;channels&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;connections&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;basePath&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;onError&#39;</span><span style="color:#E3E5EA;">&gt; &amp; {</span></span>
<span class="line"><span style="color:#E3E5EA;">    untrusted?: HttpModuleUntrustedOptions;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><h2 id="database-module" tabindex="-1">Database module <a class="header-anchor" href="#database-module" aria-label="Permalink to &quot;Database module&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> databaseModule(options: DatabaseModuleOptions): IModule;          </span><span style="color:#80858F;">// &#39;chamvi:db:&lt;name&gt;&#39;, default &#39;chamvi:db:default&#39;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> dataSourceToken(name?: string): TypedToken&lt;DataSource&gt;;          </span><span style="color:#80858F;">// one token per name; DatabaseToken.DATA_SOURCE is the default&#39;s</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> readDatabaseDescriptors(app: IApp): DatabaseDescriptor[];        </span><span style="color:#80858F;">// an app&#39;s databases, without connecting</span></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> DatabaseToken: DatabaseTokens;                                       </span><span style="color:#80858F;">// DATA_SOURCE, DESCRIPTORS</span></span></code></pre></div><p>A database for the app&#39;s own tables beside chamvi&#39;s store: PostgreSQL on <code>DATABASE_URL</code>, migrated under the lock <code>chamvi:db:&lt;name&gt;</code> into its own migrations table, else SQLite in memory (refused with <code>NODE_ENV=production</code>). See <a href="/guide/database">Database</a>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ListSchema } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/http&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { DatabaseEntity, DatabaseMigration } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/store-db&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { TypedToken } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;eldin&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { DataSource } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;typeorm&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Env } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../../env/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> DatabaseModuleOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Where \`DATABASE_URL\` and \`NODE_ENV\` are read; default the app&#39;s env</span></span>
<span class="line"><span style="color:#80858F;">     * (\`start({ env })\`, else \`process.env\`). \`DATABASE_URL\` is read as</span></span>
<span class="line"><span style="color:#80858F;">     * chamvi&#39;s config reads it (a \`postgres:\` or \`postgresql:\` URL,</span></span>
<span class="line"><span style="color:#80858F;">     * required in \`migrate\` mode). Without it the database is SQLite in</span></span>
<span class="line"><span style="color:#80858F;">     * memory through \`better-sqlite3\` (install it): it lives as long as</span></span>
<span class="line"><span style="color:#80858F;">     * the process, so a restart loses its rows, as chamvi&#39;s memory store</span></span>
<span class="line"><span style="color:#80858F;">     * does; refused when \`NODE_ENV\` is \`production\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    env?: Env;</span></span>
<span class="line"><span style="color:#80858F;">    /** The decorated entity classes (or \`EntitySchema\`s) of the app&#39;s own tables. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    entities: DatabaseEntity[];</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The migration classes, run on PostgreSQL only (SQLite takes its</span></span>
<span class="line"><span style="color:#80858F;">     * schema from the entities). Classes, not a folder: a built entry</span></span>
<span class="line"><span style="color:#80858F;">     * cannot load \`.ts\` files.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    migrations: DatabaseMigration[];</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The list schemas (\`defineSchema()\`) of the app&#39;s list endpoints over</span></span>
<span class="line"><span style="color:#80858F;">     * these entities. \`setup\` checks each against its entity&#39;s metadata,</span></span>
<span class="line"><span style="color:#80858F;">     * after connecting and before migrating or serving (also in a check):</span></span>
<span class="line"><span style="color:#80858F;">     * a schema naming no entity, an entity the database does not hold, a</span></span>
<span class="line"><span style="color:#80858F;">     * field, filter, sort, default sort or key field that is no column of</span></span>
<span class="line"><span style="color:#80858F;">     * it, or a relation that is no relation of it fails the start with</span></span>
<span class="line"><span style="color:#80858F;">     * an \`InvalidAgentDefinitionError\` naming the database, the schema and</span></span>
<span class="line"><span style="color:#80858F;">     * the name.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    schemas?: ListSchema[];</span></span>
<span class="line"><span style="color:#80858F;">    /** Where \`chamvi migration generate\` writes; nothing else reads it. Relative paths resolve against the working directory. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    migrationsDirectory: URL | string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The table the migrations are recorded in: a plain lower-case</span></span>
<span class="line"><span style="color:#80858F;">     * identifier (no schema, no quotes), never \`migrations\`, which is</span></span>
<span class="line"><span style="color:#80858F;">     * chamvi&#39;s own, and no name starting with \`chamvi_\` (but for</span></span>
<span class="line"><span style="color:#80858F;">     * \`chamvi_vector_migrations\`, chamvi&#39;s knowledge vector store) or</span></span>
<span class="line"><span style="color:#80858F;">     * \`typeorm_metadata\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    migrationsTableName: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The data source closes in a \`drained\` lifecycle hook this module</span></span>
<span class="line"><span style="color:#80858F;">     * registers in its \`onReady\`: a module that uses the data source in</span></span>
<span class="line"><span style="color:#80858F;">     * its own \`drained\` hook registers that hook in its \`setup\` (an</span></span>
<span class="line"><span style="color:#80858F;">     * \`onReady\` registration after this module&#39;s runs after the close).</span></span>
<span class="line"><span style="color:#80858F;">     *</span></span>
<span class="line"><span style="color:#80858F;">     * Names the module (\`chamvi:db:&lt;name&gt;\`), its data source token</span></span>
<span class="line"><span style="color:#80858F;">     * (\`dataSourceToken(name)\`) and the advisory lock its migrations run</span></span>
<span class="line"><span style="color:#80858F;">     * under (\`chamvi:db:&lt;name&gt;\`); default \`default\`. A lower-case slug.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    name?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Require PostgreSQL: without \`DATABASE_URL\` the setup fails with an</span></span>
<span class="line"><span style="color:#80858F;">     * \`InvalidAgentDefinitionError\` instead of running on SQLite in</span></span>
<span class="line"><span style="color:#80858F;">     * memory; default \`false\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    postgres?: boolean;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * PostgreSQL only: whether TypeORM installs the extensions the</span></span>
<span class="line"><span style="color:#80858F;">     * entities&#39; column types need (\`CREATE EXTENSION\`); default TypeORM&#39;s</span></span>
<span class="line"><span style="color:#80858F;">     * (it does). \`false\` for a database whose extensions an operator</span></span>
<span class="line"><span style="color:#80858F;">     * installs.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    installExtensions?: boolean;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * SQLite only (no \`DATABASE_URL\`): how long, in milliseconds, work may</span></span>
<span class="line"><span style="color:#80858F;">     * wait for the one connection behind a single holder (a transaction</span></span>
<span class="line"><span style="color:#80858F;">     * left open, an operation that does not return) before it is refused</span></span>
<span class="line"><span style="color:#80858F;">     * with \`DatabaseBusyError\`; default 30 seconds. A positive integer.</span></span>
<span class="line"><span style="color:#80858F;">     * PostgreSQL ignores it: its pool has a connection per caller.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    waitTimeoutMs?: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** What a database module declares, readable without connecting (\`readDatabaseDescriptors\`). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> DatabaseDescriptor = Readonly&lt;{</span></span>
<span class="line"><span style="color:#E3E5EA;">    name: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    entities: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> DatabaseEntity[];</span></span>
<span class="line"><span style="color:#E3E5EA;">    migrations: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> DatabaseMigration[];</span></span>
<span class="line"><span style="color:#80858F;">    /** An absolute path. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    migrationsDirectory: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    migrationsTableName: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The advisory lock its migrations run under: \`chamvi:db:&lt;name&gt;\`, also the module&#39;s name unless a subclass overrides it. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    lockName: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">}&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> DatabaseTokens = {</span></span>
<span class="line"><span style="color:#80858F;">    /** The data source of the database named \`default\`: \`dataSourceToken()\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    DATA_SOURCE: TypedToken&lt;DataSource&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** A collection: the descriptor of every database module set up. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    DESCRIPTORS: TypedToken&lt;DatabaseDescriptor&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><h2 id="optional-modules" tabindex="-1">Optional modules <a class="header-anchor" href="#optional-modules" aria-label="Permalink to &quot;Optional modules&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">// @chamvi/github/module</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> githubModule(options?: GithubModuleOptions): GithubModule;        </span><span style="color:#80858F;">// .app: IGithubApp and the github channel, &#39;chamvi:github:github&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">// @chamvi/sandbox/module</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> sandboxModule(options?: SandboxModuleOptions): SandboxModule;     </span><span style="color:#80858F;">// .manager: IWorkspaceManager, &#39;chamvi:sandbox&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">// @chamvi/channel-openclaw/module</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> openclawModule(options?: OpenclawModuleOptions): IModule;         </span><span style="color:#80858F;">// &#39;chamvi:channel:&lt;name&gt;&#39;, default name &#39;openclaw&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">// @chamvi/ui/module</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> uiModule(options?: UiModuleOptions): IModule;                     </span><span style="color:#80858F;">// &#39;chamvi:ui&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">// @chamvi/tool-mail-ui/module, and likewise the calendar, GitHub, Discord and WhatsApp pages</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> toolMailUiModule(options?: { uiBase?: string }): IModule;         </span><span style="color:#80858F;">// serves a page at &lt;uiBase&gt;/ext/&lt;slug&gt;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">// @chamvi/app</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> uiPageModule(options: UiPageModuleOptions): IModule;              </span><span style="color:#80858F;">// the helper behind every *-ui module</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">// @chamvi/knowledge/module</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> knowledgeModule(options?: KnowledgeModuleOptions): KnowledgeModule; </span><span style="color:#80858F;">// .knowledge: IKnowledge, &#39;chamvi:knowledge&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">// @chamvi/app/authup</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> authupModule(options?: AuthupModuleOptions): IModule;             </span><span style="color:#80858F;">// &#39;chamvi:authup&#39;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> oidcModule(options: OidcOptions): IModule;                        </span><span style="color:#80858F;">// &#39;chamvi:oidc&#39;, no env form</span></span></code></pre></div><p>Each factory reads <code>options.env ?? process.env</code> when it is called and throws <code>InvalidAgentDefinitionError</code> naming a missing or malformed variable. <code>githubModule()</code> and <code>discordModule()</code> decide a missing value in <code>setup</code>, where the store is readable (malformed values still throw at the factory). Options win over env, except <code>SANDBOX_PROVIDER</code>, <code>SANDBOX_NAMESPACE</code>, <code>SANDBOX_IMAGE</code>, <code>SANDBOX_IMAGES</code> (over <code>allowImage</code>), <code>SANDBOX_SUSPEND_AFTER_MS</code>, <code>SANDBOX_PERSISTENCE</code>, <code>SANDBOX_DOCKER_SUSPEND</code>, <code>SANDBOX_STORAGE_CLASS</code> and <code>DEPLOYMENT</code>, which win over the sandbox options, and <code>KNOWLEDGE_MODEL</code>, which wins over <code>embeddingModel</code>. The GitHub and OpenClaw modules contribute their channel to <code>AppToken.CHANNELS</code>, defaulting <code>approvalUrl</code> to the dashboard link built from <code>PUBLIC_URL</code> and using the app&#39;s clock; tools reach a channel with <code>ctx.channels.findOne(name)</code>. <code>githubModule</code> and <code>sandboxModule</code> provide their instance on the engine in the <code>engineCreated</code> hook; tools reach it through the package&#39;s context pair (<a href="/reference/github#context">github</a>, <a href="/reference/sandbox#context">sandbox</a>).</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Env } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/app&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { DeclaredConnection, IEngine } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { GithubAppOptions, IGithubApp } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../app/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { GithubChannelOptions } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../channel/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { GithubAppCredentialsOptions } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../credentials/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** \`githubChannel()\` options; \`approvalUrl\` defaults to the UI link from \`PUBLIC_URL\`, \`clock\` is the app&#39;s. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> GithubModuleChannelOptions = Omit&lt;GithubChannelOptions, </span><span style="color:#E7C58C;">&#39;app&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;clock&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;locks&#39;</span><span style="color:#E3E5EA;">&gt; &amp; {</span></span>
<span class="line"><span style="color:#80858F;">    /** Default the app&#39;s lock service (\`AppToken.LOCK_SERVICE\`). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    locks?: GithubChannelOptions[</span><span style="color:#E7C58C;">&#39;locks&#39;</span><span style="color:#E3E5EA;">];</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> GithubModuleOptions = Partial&lt;GithubAppOptions&gt; &amp; {</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The instance&#39;s name (agent-name rule), default \`github\`: its stored</span></span>
<span class="line"><span style="color:#80858F;">     * connection, the default channel name and the env prefix</span></span>
<span class="line"><span style="color:#80858F;">     * (\`GITHUB_&lt;NAME&gt;_*\`; the default instance keeps \`GITHUB_*\`).</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    name?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The agents this module serves. Without it the module is the fallback</span></span>
<span class="line"><span style="color:#80858F;">     * for every agent no other module targets; at most one module may omit it.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    agents?: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> string[];</span></span>
<span class="line"><span style="color:#80858F;">    /** Used as is; no env is read then, the connection is listed but not editable. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    app?: IGithubApp;</span></span>
<span class="line"><span style="color:#80858F;">    /** Default \`process.env\`, read when the factory is called; format errors throw there, a missing value in \`setup\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    env?: Env;</span></span>
<span class="line"><span style="color:#80858F;">    /** The channel&#39;s options; named comment slots use the app&#39;s lock service by default. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    channel?: GithubModuleChannelOptions;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The App&#39;s git credentials (\`githubAppCredentials()\`), contributed to</span></span>
<span class="line"><span style="color:#80858F;">     * \`AppToken.GIT_CREDENTIALS\` for \`sandboxModule()\`&#39;s workspaces once</span></span>
<span class="line"><span style="color:#80858F;">     * configured; \`false\` contributes none. Default on for the fallback</span></span>
<span class="line"><span style="color:#80858F;">     * module; a module with \`agents\` contributes only when this is set.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    credentials?: false | GithubAppCredentialsOptions;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The createGithubApp options env and the store can set; one variable and form field each. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> GithubEnvOption = </span><span style="color:#E7C58C;">&#39;appId&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;privateKey&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;webhookSecret&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;installationId&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;slug&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;baseUrl&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** One module&#39;s part in the shared collection. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> GithubInstance = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    name: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    app: IGithubApp;</span></span>
<span class="line"><span style="color:#E3E5EA;">    channelName: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    agents?: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> string[];</span></span>
<span class="line"><span style="color:#80858F;">    /** Set once the instance&#39;s connection is resolved. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    connection?: DeclaredConnection;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The GitHub modules of one app; \`provided\` guards the resolver per engine. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> GithubInstances = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    list: GithubInstance[];</span></span>
<span class="line"><span style="color:#E3E5EA;">    provided: WeakSet&lt;IEngine&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> SandboxProviderName = </span><span style="color:#E7C58C;">&#39;local&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;docker&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;kubernetes&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The kubernetes provider&#39;s \`persistence\`, structurally (a claim per workspace). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> SandboxPersistence = {</span></span>
<span class="line"><span style="color:#80858F;">    /** A DNS-1123 subdomain; default the cluster&#39;s default storage class. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    storageClassName?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The claim&#39;s storage request (a quantity); default the resolved \`limits.storage\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    size?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * \`createWorkspaceManager()\` options; the manager&#39;s \`env\` is \`workspaceEnv\`</span></span>
<span class="line"><span style="color:#80858F;"> * here, since \`env\` is the process env the factory reads. \`deployment\`:</span></span>
<span class="line"><span style="color:#80858F;"> * \`DEPLOYMENT\` wins; \`isSettled\` defaults to the engine&#39;s \`getRun\`</span></span>
<span class="line"><span style="color:#80858F;"> * (a settled run, and with a named deployment also a missing one), and</span></span>
<span class="line"><span style="color:#80858F;"> * \`isSuspendable\` to a run \`waiting\` for at least \`suspendAfterMs\` (a</span></span>
<span class="line"><span style="color:#80858F;"> * given \`isSuspendable\` replaces that default).</span></span>
<span class="line"><span style="color:#80858F;"> * \`allowImage\`: \`SANDBOX_IMAGES\` (a comma list of exact image</span></span>
<span class="line"><span style="color:#80858F;"> * references) wins; without either, \`create_workspace\` offers no \`image\`.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> SandboxModuleOptions = Omit&lt;WorkspaceManagerOptions, </span><span style="color:#E7C58C;">&#39;provider&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;env&#39;</span><span style="color:#E3E5EA;">&gt; &amp; {</span></span>
<span class="line"><span style="color:#80858F;">    /** A provider name (\`SANDBOX_PROVIDER\` wins) or an instance; default \`&#39;local&#39;\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    provider?: SandboxProviderName | ISandboxProvider;</span></span>
<span class="line"><span style="color:#80858F;">    /** Used as is; no provider is built then. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    manager?: IWorkspaceManager;</span></span>
<span class="line"><span style="color:#80858F;">    /** Kubernetes namespace of the workspace pods; \`SANDBOX_NAMESPACE\` wins. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    namespace?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Docker and Kubernetes image; \`SANDBOX_IMAGE\` wins, default \`DEFAULT_SANDBOX_IMAGE\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    image?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Kubernetes only: a claim per workspace keeping \`/workspace\` and</span></span>
<span class="line"><span style="color:#80858F;">     * \`/home/sandbox\`, so a suspended run&#39;s files survive its pod.</span></span>
<span class="line"><span style="color:#80858F;">     * \`SANDBOX_PERSISTENCE\` (\`true\`/\`false\`) wins over whether it is</span></span>
<span class="line"><span style="color:#80858F;">     * set, \`SANDBOX_STORAGE_CLASS\` over \`storageClassName\` (default</span></span>
<span class="line"><span style="color:#80858F;">     * the cluster&#39;s default class); \`size\` default the storage limit.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    persistence?: SandboxPersistence;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Docker only: stop the containers of long-waiting runs (files kept,</span></span>
<span class="line"><span style="color:#80858F;">     * \`/tmp\` and background jobs lost). \`SANDBOX_DOCKER_SUSPEND\`</span></span>
<span class="line"><span style="color:#80858F;">     * (\`true\`/\`false\`) wins; default false, since a sleeping container</span></span>
<span class="line"><span style="color:#80858F;">     * reserves nothing.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    suspend?: boolean;</span></span>
<span class="line"><span style="color:#80858F;">    /** Added to every workspace&#39;s environment. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    workspaceEnv?: Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * How long a run waits (status \`waiting\`, since its \`updatedAt\`) before</span></span>
<span class="line"><span style="color:#80858F;">     * the collection suspends its workspaces, in ms; \`0\` disables the</span></span>
<span class="line"><span style="color:#80858F;">     * default predicate only (a given \`isSuspendable\` replaces it and still</span></span>
<span class="line"><span style="color:#80858F;">     * applies). \`SANDBOX_SUSPEND_AFTER_MS\` wins, default \`SUSPEND_AFTER_MS\`.</span></span>
<span class="line"><span style="color:#80858F;">     * Takes effect with the start-mode collector, so up to \`gcIntervalMs\`</span></span>
<span class="line"><span style="color:#80858F;">     * later.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    suspendAfterMs?: number;</span></span>
<span class="line"><span style="color:#80858F;">    /** Default \`process.env\`, read when the factory is called. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    env?: Env;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Env } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/app&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { OpenclawChannelOptions } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../channel/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * \`openclawChannel()\` options; the ones not given come from env,</span></span>
<span class="line"><span style="color:#80858F;"> * \`approvalUrl\` defaults to the UI link from \`PUBLIC_URL\`, \`clock\` to</span></span>
<span class="line"><span style="color:#80858F;"> * the app&#39;s.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> OpenclawModuleOptions = Partial&lt;OpenclawChannelOptions&gt; &amp; {</span></span>
<span class="line"><span style="color:#80858F;">    /** Default \`process.env\`, read when the factory is called. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    env?: Env;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Env } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/app&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { UiRoutesOptions } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../routes/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** \`uiRoutes()\` options; \`auth\` defaults to the token login plus authup from env. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> UiModuleOptions = UiRoutesOptions &amp; {</span></span>
<span class="line"><span style="color:#80858F;">    /** Default \`process.env\`, read when the factory is called. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    env?: Env;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ITokenVerifier } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@authup/server-adapter-kit&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Env } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../env/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Who owns the permissions chamvi checks on an authup login. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AuthupPermissionOwner = </span><span style="color:#E7C58C;">&#39;realm&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;client&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AuthupModuleOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Used as is. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    verifier?: ITokenVerifier;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Reads authup&#39;s permission catalog (the \`GET /authorization\` body).</span></span>
<span class="line"><span style="color:#80858F;">     * Default: read with a client-credentials token of the configured client</span></span>
<span class="line"><span style="color:#80858F;">     * (needs \`permission_read\` with a realm scope of \`ownOrNull\` or wider).</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    catalog?: () </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> Promise&lt;unknown&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The realm id chamvi&#39;s resources belong to. Default: the realm of the</span></span>
<span class="line"><span style="color:#80858F;">     * configured client, read once from the introspection of its own token.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    realm?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Who owns the permissions chamvi checks (#282). \`realm\` (default): the</span></span>
<span class="line"><span style="color:#80858F;">     * global then the realm-owned definition. \`client\`: the dashboard client</span></span>
<span class="line"><span style="color:#80858F;">     * (the dashboard module&#39;s authup sign-in, else</span></span>
<span class="line"><span style="color:#80858F;">     * \`AUTHUP_CLIENT_ID\`, else \`chamvi\`) owns every name, checked</span></span>
<span class="line"><span style="color:#80858F;">     * only as its definition in chamvi&#39;s realm; global and realm-owned</span></span>
<span class="line"><span style="color:#80858F;">     * definitions grant nothing. A dashboard client given by</span></span>
<span class="line"><span style="color:#80858F;">     * name is resolved once at start (needs \`client_read\`); one that does not</span></span>
<span class="line"><span style="color:#80858F;">     * resolve to exactly one client fails the start. Default</span></span>
<span class="line"><span style="color:#80858F;">     * \`AUTHUP_PERMISSION_OWNER\`; any other value is refused.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    permissionOwner?: AuthupPermissionOwner;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * How long each call to authup may take, in ms: the catalog read, the</span></span>
<span class="line"><span style="color:#80858F;">     * realm lookup, the permission client lookup and each token verification</span></span>
<span class="line"><span style="color:#80858F;">     * (a positive finite number).</span></span>
<span class="line"><span style="color:#80858F;">     * A timed-out verification answers 503; a timed-out catalog or realm</span></span>
<span class="line"><span style="color:#80858F;">     * grants the login nothing. Default \`AUTHUP_TIMEOUT_MS\`, else 10 000.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    timeoutMs?: number;</span></span>
<span class="line"><span style="color:#80858F;">    /** Default \`AUTHUP_URL\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    url?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The confidential client chamvi reads and verifies as, an id or a name.</span></span>
<span class="line"><span style="color:#80858F;">     * Default \`AUTHUP_SERVER_CLIENT_ID\`, else \`chamvi-server\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    clientId?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Default \`AUTHUP_SERVER_CLIENT_SECRET\` (required). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    clientSecret?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The realm (name or id) the client \`clientId\` lives in, sent as</span></span>
<span class="line"><span style="color:#80858F;">     * \`realm_id\` with its client-credentials token request (authup finds a</span></span>
<span class="line"><span style="color:#80858F;">     * client by name only within a realm). Default \`AUTHUP_REALM\`, else</span></span>
<span class="line"><span style="color:#80858F;">     * \`master\` (the env value is the dashboard client.s realm too;</span></span>
<span class="line"><span style="color:#80858F;">     * this option is not). Not chamvi&#39;s</span></span>
<span class="line"><span style="color:#80858F;">     * resource realm: that is \`realm\`, else introspected from this client&#39;s</span></span>
<span class="line"><span style="color:#80858F;">     * token.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    clientRealm?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Default \`process.env\`, read when the factory is called; \`AUTHUP_URL\`,</span></span>
<span class="line"><span style="color:#80858F;">     * \`AUTHUP_SERVER_CLIENT_ID\`, \`AUTHUP_REALM\` and \`AUTHUP_SERVER_CLIENT_SECRET\` are read</span></span>
<span class="line"><span style="color:#80858F;">     * unless \`verifier\`, \`catalog\` and \`realm\` are all given and no owner client</span></span>
<span class="line"><span style="color:#80858F;">     * name is looked up, \`AUTHUP_TIMEOUT_MS\` unless \`timeoutMs\` is,</span></span>
<span class="line"><span style="color:#80858F;">     * \`AUTHUP_PERMISSION_OWNER\` unless \`permissionOwner\` is.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    env?: Env;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><h2 id="tokens-and-hooks" tabindex="-1">Tokens and hooks <a class="header-anchor" href="#tokens-and-hooks" aria-label="Permalink to &quot;Tokens and hooks&quot;">​</a></h2><p><code>AppToken</code> holds the container keys, <code>ModuleName</code> the built-in names, <code>AUTHENTICATOR_ORDER</code> the chain order (static tokens <code>0</code>, authup <code>10</code>, oidc <code>20</code>, lowest first):</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#E3E5EA;"> { TypedToken } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;eldin&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { AppTokens } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;./types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> token&lt;K </span><span style="color:#8EA7FF;">extends</span><span style="color:#8EA7FF;"> keyof</span><span style="color:#E3E5EA;"> AppTokens&gt;(key: K): TypedToken&lt;AppTokens[K]&gt; {</span></span>
<span class="line"><span style="color:#8EA7FF;">    return</span><span style="color:#8EA7FF;"> new</span><span style="color:#E3E5EA;"> TypedToken&lt;AppTokens[K]&gt;(</span><span style="color:#E7C58C;">\`chamvi.</span><span style="color:#E3E5EA;">\${</span><span style="color:#E7C58C;">key</span><span style="color:#E3E5EA;">.</span><span style="color:#E7C58C;">toLowerCase</span><span style="color:#E3E5EA;">().</span><span style="color:#E7C58C;">replace</span><span style="color:#E3E5EA;">(</span><span style="color:#E7C58C;">/_/</span><span style="color:#8EA7FF;">g</span><span style="color:#E3E5EA;">,</span><span style="color:#E7C58C;"> &#39;-&#39;</span><span style="color:#E3E5EA;">)</span><span style="color:#E3E5EA;">}</span><span style="color:#E7C58C;">\`</span><span style="color:#E3E5EA;">);</span></span>
<span class="line"><span style="color:#E3E5EA;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * The container keys modules share. \`HTTP_ROUTES\`, \`HTTP_CONTROLLERS\`,</span></span>
<span class="line"><span style="color:#80858F;"> * \`OPENAPI_DOCUMENTS\`, \`AUTHENTICATORS\`, \`CHANNELS\`, \`COMPONENTS\`,</span></span>
<span class="line"><span style="color:#80858F;"> * \`CONNECTIONS\`, \`CONNECTION_TYPES\`, \`UI_PAGES\`, \`LIFECYCLE_HOOKS\`,</span></span>
<span class="line"><span style="color:#80858F;"> * \`AGENT_CHECKS\` and \`GIT_CREDENTIALS\` are collections (\`registerMany\` in \`setup\`, \`resolveAll\`</span></span>
<span class="line"><span style="color:#80858F;"> * in \`onReady\`); every other token holds one value.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> const</span><span style="color:#E3E5EA;"> AppToken = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONTEXT: token(</span><span style="color:#E7C58C;">&#39;CONTEXT&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONFIG: token(</span><span style="color:#E7C58C;">&#39;CONFIG&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    LOGGER: token(</span><span style="color:#E7C58C;">&#39;LOGGER&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    CLOCK: token(</span><span style="color:#E7C58C;">&#39;CLOCK&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    STORE_KIND: token(</span><span style="color:#E7C58C;">&#39;STORE_KIND&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    RUN_REPOSITORY: token(</span><span style="color:#E7C58C;">&#39;RUN_REPOSITORY&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    RUN_SERVICE: token(</span><span style="color:#E7C58C;">&#39;RUN_SERVICE&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    STEP_REPOSITORY: token(</span><span style="color:#E7C58C;">&#39;STEP_REPOSITORY&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    STEP_SERVICE: token(</span><span style="color:#E7C58C;">&#39;STEP_SERVICE&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    CHECKPOINT_REPOSITORY: token(</span><span style="color:#E7C58C;">&#39;CHECKPOINT_REPOSITORY&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    CHECKPOINT_SERVICE: token(</span><span style="color:#E7C58C;">&#39;CHECKPOINT_SERVICE&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    EFFECT_REPOSITORY: token(</span><span style="color:#E7C58C;">&#39;EFFECT_REPOSITORY&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    EFFECT_SERVICE: token(</span><span style="color:#E7C58C;">&#39;EFFECT_SERVICE&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    ARTIFACT_REPOSITORY: token(</span><span style="color:#E7C58C;">&#39;ARTIFACT_REPOSITORY&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    ARTIFACT_SERVICE: token(</span><span style="color:#E7C58C;">&#39;ARTIFACT_SERVICE&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    STATE_REPOSITORY: token(</span><span style="color:#E7C58C;">&#39;STATE_REPOSITORY&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    STATE_DOCUMENT_REPOSITORY: token(</span><span style="color:#E7C58C;">&#39;STATE_DOCUMENT_REPOSITORY&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    STATE_SERVICE: token(</span><span style="color:#E7C58C;">&#39;STATE_SERVICE&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    LOCK_REPOSITORY: token(</span><span style="color:#E7C58C;">&#39;LOCK_REPOSITORY&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    LOCK_SERVICE: token(</span><span style="color:#E7C58C;">&#39;LOCK_SERVICE&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    IDEMPOTENCY_REPOSITORY: token(</span><span style="color:#E7C58C;">&#39;IDEMPOTENCY_REPOSITORY&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    IDEMPOTENCY_SERVICE: token(</span><span style="color:#E7C58C;">&#39;IDEMPOTENCY_SERVICE&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    LIMIT_REPOSITORY: token(</span><span style="color:#E7C58C;">&#39;LIMIT_REPOSITORY&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    LIMIT_SERVICE: token(</span><span style="color:#E7C58C;">&#39;LIMIT_SERVICE&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    AGENT_REVISION_REPOSITORY: token(</span><span style="color:#E7C58C;">&#39;AGENT_REVISION_REPOSITORY&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    AGENT_REVISION_SERVICE: token(</span><span style="color:#E7C58C;">&#39;AGENT_REVISION_SERVICE&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONNECTION_REPOSITORY: token(</span><span style="color:#E7C58C;">&#39;CONNECTION_REPOSITORY&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONNECTION_SERVICE: token(</span><span style="color:#E7C58C;">&#39;CONNECTION_SERVICE&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONVERSATION_REPOSITORY: token(</span><span style="color:#E7C58C;">&#39;CONVERSATION_REPOSITORY&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONVERSATION_SERVICE: token(</span><span style="color:#E7C58C;">&#39;CONVERSATION_SERVICE&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    DATA_SOURCE: token(</span><span style="color:#E7C58C;">&#39;DATA_SOURCE&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    ENGINE: token(</span><span style="color:#E7C58C;">&#39;ENGINE&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    MODELS: token(</span><span style="color:#E7C58C;">&#39;MODELS&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    PEERS: token(</span><span style="color:#E7C58C;">&#39;PEERS&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    SHUTDOWN: token(</span><span style="color:#E7C58C;">&#39;SHUTDOWN&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    SERVER: token(</span><span style="color:#E7C58C;">&#39;SERVER&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    HTTP_ROUTES: token(</span><span style="color:#E7C58C;">&#39;HTTP_ROUTES&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    HTTP_CONTROLLERS: token(</span><span style="color:#E7C58C;">&#39;HTTP_CONTROLLERS&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    OPENAPI_DOCUMENTS: token(</span><span style="color:#E7C58C;">&#39;OPENAPI_DOCUMENTS&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    AUTHENTICATORS: token(</span><span style="color:#E7C58C;">&#39;AUTHENTICATORS&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    CHANNELS: token(</span><span style="color:#E7C58C;">&#39;CHANNELS&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    COMPONENTS: token(</span><span style="color:#E7C58C;">&#39;COMPONENTS&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    COMPONENT_LIST: token(</span><span style="color:#E7C58C;">&#39;COMPONENT_LIST&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    LIFECYCLE_HOOKS: token(</span><span style="color:#E7C58C;">&#39;LIFECYCLE_HOOKS&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    AGENT_ISSUES: token(</span><span style="color:#E7C58C;">&#39;AGENT_ISSUES&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    AGENT_CHECKS: token(</span><span style="color:#E7C58C;">&#39;AGENT_CHECKS&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    GIT_CREDENTIALS: token(</span><span style="color:#E7C58C;">&#39;GIT_CREDENTIALS&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    KEYRING: token(</span><span style="color:#E7C58C;">&#39;KEYRING&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONNECTIONS: token(</span><span style="color:#E7C58C;">&#39;CONNECTIONS&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONNECTION_TYPES: token(</span><span style="color:#E7C58C;">&#39;CONNECTION_TYPES&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONNECTION_CONFIGS: token(</span><span style="color:#E7C58C;">&#39;CONNECTION_CONFIGS&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    UI_PAGES: token(</span><span style="color:#E7C58C;">&#39;UI_PAGES&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">    UI_AUTH: token(</span><span style="color:#E7C58C;">&#39;UI_AUTH&#39;</span><span style="color:#E3E5EA;">),</span></span>
<span class="line"><span style="color:#E3E5EA;">} </span><span style="color:#8EA7FF;">as</span><span style="color:#8EA7FF;"> const</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * The built-in modules&#39; names; list a module of the same name to replace one.</span></span>
<span class="line"><span style="color:#80858F;"> * \`COMPONENTS\` runs the contributed components. \`CONSOLE\` names the optional \`consoleChannelModule()\`, \`UI\` the dashboard&#39;s</span></span>
<span class="line"><span style="color:#80858F;"> * \`uiModule()\` of \`@chamvi/ui/module\`.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> const</span><span style="color:#E3E5EA;"> ModuleName = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONFIG: </span><span style="color:#E7C58C;">&#39;chamvi:config&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    STORE: </span><span style="color:#E7C58C;">&#39;chamvi:store&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    STATIC_TOKENS: </span><span style="color:#E7C58C;">&#39;chamvi:static-tokens&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ENGINE: </span><span style="color:#E7C58C;">&#39;chamvi:engine&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    AGENTS: </span><span style="color:#E7C58C;">&#39;chamvi:agents&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    SCHEDULER: </span><span style="color:#E7C58C;">&#39;chamvi:scheduler&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    COMPONENTS: </span><span style="color:#E7C58C;">&#39;chamvi:components&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    HTTP: </span><span style="color:#E7C58C;">&#39;chamvi:http&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONSOLE: </span><span style="color:#E7C58C;">&#39;chamvi:console&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    UI: </span><span style="color:#E7C58C;">&#39;chamvi:ui&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">} </span><span style="color:#8EA7FF;">as</span><span style="color:#8EA7FF;"> const</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The order of the authenticator chain (lowest first). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> const</span><span style="color:#E3E5EA;"> AUTHENTICATOR_ORDER = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    STATIC_TOKENS: </span><span style="color:#E7C58C;">0</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    AUTHUP: </span><span style="color:#E7C58C;">10</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    OIDC: </span><span style="color:#E7C58C;">20</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">} </span><span style="color:#8EA7FF;">as</span><span style="color:#8EA7FF;"> const</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> const</span><span style="color:#E3E5EA;"> APP_ERROR_CODE = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    STOPPED: </span><span style="color:#E7C58C;">&#39;app_stopped&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IN_USE: </span><span style="color:#E7C58C;">&#39;app_in_use&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    STOP_FAILED: </span><span style="color:#E7C58C;">&#39;app_stop_failed&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#80858F;">    /** A check (\`IApp.check()\`) found migrations a start would not apply (\`MIGRATE=false\`). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    STORE_NOT_MIGRATED: </span><span style="color:#E7C58C;">&#39;store_not_migrated&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#80858F;">    /** A job&#39;s agent is a package agent that did not load, check or prepare, or a package failed before its agents were known. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    PACKAGE_AGENT_FAILED: </span><span style="color:#E7C58C;">&#39;package_agent_failed&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">} </span><span style="color:#8EA7FF;">as</span><span style="color:#8EA7FF;"> const</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** PostgreSQL&#39;s undefined_table and undefined_column. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> const</span><span style="color:#E3E5EA;"> SCHEMA_BEHIND_SQLSTATES: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> string[] = [</span><span style="color:#E7C58C;">&#39;42P01&#39;</span><span style="color:#E3E5EA;">, </span><span style="color:#E7C58C;">&#39;42703&#39;</span><span style="color:#E3E5EA;">];</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The authup realm (name or id) the server and dashboard clients live in, unless \`AUTHUP_REALM\` names another. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> const</span><span style="color:#E3E5EA;"> AUTHUP_REALM_DEFAULT = </span><span style="color:#E7C58C;">&#39;master&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The public authup client the dashboard signs in with, unless \`AUTHUP_CLIENT_ID\` names another. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> const</span><span style="color:#E3E5EA;"> AUTHUP_CLIENT_ID_DEFAULT = </span><span style="color:#E7C58C;">&#39;chamvi&#39;</span><span style="color:#E3E5EA;">;</span></span></code></pre></div><p><code>AppContext</code>, <code>ILifecycleHook</code>, <code>AuthenticatorEntry</code>, <code>Server</code>, <code>AppTokens</code> (each token&#39;s value type), the re-exported orkos <code>IModule</code> and eldin <code>IContainer</code> types and eldin&#39;s <code>TypedToken</code> class (create a feature module&#39;s container keys with it):</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> {</span></span>
<span class="line"><span style="color:#E3E5EA;">    Agent,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ConnectionValues,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IAgentRevisionService,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IArtifactService,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IChannel,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ICheckpointService,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IClock,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IConnectionConfigStore,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IConnectionHandle,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IConnectionService,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IConnectionTypeProvider,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IConversationService,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IEffectService,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IEngine,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IIdempotencyService,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IKeyring,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ILimitService,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ILockService,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IModelResolver,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IPeerResolver,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IRunService,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IStateService,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IStepService,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ModelRef,</span></span>
<span class="line"><span style="color:#E3E5EA;">    SkillInput,</span></span>
<span class="line"><span style="color:#E3E5EA;">} </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> {</span></span>
<span class="line"><span style="color:#E3E5EA;">    IAgentRevisionRepository,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IArtifactRepository,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ICheckpointRepository,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IConnectionRepository,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IConversationRepository,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IEffectRepository,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IIdempotencyRepository,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ILimitRepository,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ILockRepository,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IRunRepository,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IStateDocumentRepository,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IStateRepository,</span></span>
<span class="line"><span style="color:#E3E5EA;">    IStepRepository,</span></span>
<span class="line"><span style="color:#E3E5EA;">} </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/store&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Authenticator, HttpRoute, IShutdown } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/http&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { AgentIssue, UiPage } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core-kit&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IComponent } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;hubwire&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { DataSource } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;typeorm&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { AppOptions } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../app/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { AppConfig } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../config/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Env } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../env/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ILogger } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../logger/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ModelProviders, ProviderConfig } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../models/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AppMode = </span><span style="color:#E7C58C;">&#39;start&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;job&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;migrate&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AppContext = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    mode: AppMode;</span></span>
<span class="line"><span style="color:#80858F;">    /** Explicit createApp conversation capability; absent by default. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    conversations?: AppOptions[</span><span style="color:#E7C58C;">&#39;conversations&#39;</span><span style="color:#E3E5EA;">];</span></span>
<span class="line"><span style="color:#E3E5EA;">    dev: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">    env: Env;</span></span>
<span class="line"><span style="color:#80858F;">    /** Aborts with the app_stopped ChamviError once stop() is called. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    signal: AbortSignal;</span></span>
<span class="line"><span style="color:#80858F;">    /** Logs through the app logger; during stop() also counts as a stop failure. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    report(error: unknown, context?: Record&lt;string, unknown&gt;): void;</span></span>
<span class="line"><span style="color:#80858F;">    /** createApp&#39;s \`models\`: AI SDK providers by id, winning over every provider setting for their ids. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    models?: ModelProviders;</span></span>
<span class="line"><span style="color:#80858F;">    /** createApp&#39;s \`model\`: the default model of agents without one (MODEL and the config file win). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    model?: ModelRef;</span></span>
<span class="line"><span style="color:#80858F;">    /** createApp&#39;s \`providers\` (env and the config file win per field). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    providers?: Readonly&lt;Record&lt;string, ProviderConfig&gt;&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** createApp&#39;s agents (the agents passed in code); the live set is \`engine.listAgents()\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    agents: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> Agent[];</span></span>
<span class="line"><span style="color:#80858F;">    /** createApp&#39;s agent package specifiers; \`chamvi.json\` \`agents\` and \`AGENTS\` add theirs in the agents module. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    packages?: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> string[];</span></span>
<span class="line"><span style="color:#80858F;">    /** createApp&#39;s additive skill defaults; check and migrate never load sources. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    skills?: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> SkillInput[];</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * \`IApp.check()\` (mode \`start\`): every module sets up and checks as for a</span></span>
<span class="line"><span style="color:#80858F;">     * start, but nothing writes the store and no start step runs. Of the</span></span>
<span class="line"><span style="color:#80858F;">     * lifecycle hooks only the paired \`engineCreated\` and \`drained\` run.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    check?: boolean;</span></span>
<span class="line"><span style="color:#80858F;">    /** \`IApp.runJob()\` (mode \`job\`): the agent the job runs. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    job?: { agent: string };</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * Throws InvalidAgentDefinitionError for an agent a module could not serve</span></span>
<span class="line"><span style="color:#80858F;"> * (the scheduler: a cron subscription hubwire refuses; http: a \`run_&lt;agent&gt;\` MCP</span></span>
<span class="line"><span style="color:#80858F;"> * tool it cannot build). The agents dir runs every check on a folder agent</span></span>
<span class="line"><span style="color:#80858F;"> * before registering it, so a refusal is a load issue, never a failed boot.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AgentCheck = (agent: Agent) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> void;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * A git credential source (structurally \`@chamvi/sandbox\`&#39;s</span></span>
<span class="line"><span style="color:#80858F;"> * \`IGitCredentials\`): modules contribute one to \`AppToken.GIT_CREDENTIALS\`</span></span>
<span class="line"><span style="color:#80858F;"> * (\`githubModule()\` its App&#39;s), and \`sandboxModule()\` asks them after its own.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> GitCredentialSource = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    get(input: {</span></span>
<span class="line"><span style="color:#E3E5EA;">        url: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">        host: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">        path: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">        access: </span><span style="color:#E7C58C;">&#39;read&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;write&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">        runId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">        signal?: AbortSignal;</span></span>
<span class="line"><span style="color:#E3E5EA;">    }): Promise&lt;{</span></span>
<span class="line"><span style="color:#E3E5EA;">        username: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">        password: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">        expiresAt?: Date</span></span>
<span class="line"><span style="color:#E3E5EA;">    } | undefined&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The options of \`readStoredConnections()\`. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ReadStoredConnectionsOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Read only the row of this name; other rows are skipped before decryption. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    name?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A stored connection as \`readStoredConnections()\` returns it. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> StoredConnection = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    name: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The settings and decrypted secrets. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    values: ConnectionValues;</span></span>
<span class="line"><span style="color:#80858F;">    /** The config revision read; the connection&#39;s \`loadedRevision\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    revision: number;</span></span>
<span class="line"><span style="color:#80858F;">    /** The row&#39;s id (its generation); the connection&#39;s \`loadedGeneration\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    id: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Set when the row&#39;s secrets cannot be read (an undecryptable row,</span></span>
<span class="line"><span style="color:#80858F;">     * stored secrets without \`ENCRYPTION_KEYS\`): \`values\` then holds</span></span>
<span class="line"><span style="color:#80858F;">     * the settings only. \`resolveStoredConnection()\` turns it into a \`failed\`</span></span>
<span class="line"><span style="color:#80858F;">     * connection unless env or code set every one of \`secrets\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    unreadable?: StoredConnectionFailure;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Why a stored row&#39;s secrets cannot be read; never a value. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> StoredConnectionFailure = {</span></span>
<span class="line"><span style="color:#80858F;">    /** The fields of the stored secrets, sorted. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    secrets: string[];</span></span>
<span class="line"><span style="color:#80858F;">    /** The cause with its code, naming at most a variable or key id. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    reason: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> interface</span><span style="color:#E3E5EA;"> ILifecycleHook {</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> name: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** After verified preparation, before \`engine.start()\` (start and job); a check skips preparation. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    engineCreated?(engine: IEngine): void | Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** start only: after engine.start() (which starts the channels), before serve(). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    started?(): void | Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** start only: the shutdown&#39;s first step, before the closers, the server close and the drain (which stops the channels). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    stopping?(): void | Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** After the engine drained (start, job and a check; also when the drain failed), before the store closes. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    drained?(): void | Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * A background job a module contributes to \`AppToken.COMPONENTS\` (a hubwire</span></span>
<span class="line"><span style="color:#80858F;"> * component): the components module starts it in start mode (never in a</span></span>
<span class="line"><span style="color:#80858F;"> * check, a job or a migration) and stops it in the \`stopping\` phase (its</span></span>
<span class="line"><span style="color:#80858F;"> * hook runs in setup order among the others), before the engine drains.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AppComponent = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Unique among the app&#39;s components; lower-kebab, at most 64 characters (the agent name rule). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    name: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    component: IComponent;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> LifecyclePhase = </span><span style="color:#E7C58C;">&#39;engineCreated&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;started&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;stopping&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;drained&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AuthenticatorEntry = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    name: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    order: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">    authenticator: Authenticator;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * The part of the HTTP server (srvx, from routup&#39;s \`serve()\`) the app uses,</span></span>
<span class="line"><span style="color:#80858F;"> * typed structurally so srvx&#39;s declarations stay out of the package&#39;s types.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> Server = {</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> url?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    ready(): Promise&lt;unknown&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    close(closeActiveConnections?: boolean): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The dashboard&#39;s sign-in, shared by its \`*-ui\` pages (one session, so one CSP for the authup refresh). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> UiAuth = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Offer the token-paste sign-in (static bearer tokens). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    tokens: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">    authup?: {</span></span>
<span class="line"><span style="color:#80858F;">        /** The authup API URL. */</span></span>
<span class="line"><span style="color:#E3E5EA;">        url: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">        clientId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">        realmId?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    };</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Where the store module keeps the rows. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> StoreKind = </span><span style="color:#E7C58C;">&#39;memory&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;database&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AppTokens = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONTEXT: AppContext;</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONFIG: AppConfig;</span></span>
<span class="line"><span style="color:#E3E5EA;">    LOGGER: ILogger;</span></span>
<span class="line"><span style="color:#E3E5EA;">    CLOCK: IClock;</span></span>
<span class="line"><span style="color:#80858F;">    /** Where the store&#39;s rows live: in this process (\`memory\`) or in a database (\`database\`). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    STORE_KIND: StoreKind;</span></span>
<span class="line"><span style="color:#80858F;">    /** The run repository the store module registers (memory, database or a replacing module&#39;s). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    RUN_REPOSITORY: IRunRepository;</span></span>
<span class="line"><span style="color:#80858F;">    /** The rules of runs over \`RUN_REPOSITORY\`, on the app clock; the engine module passes it to the engine. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    RUN_SERVICE: IRunService;</span></span>
<span class="line"><span style="color:#80858F;">    /** The step repository the store module registers (memory, database or a replacing module&#39;s). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    STEP_REPOSITORY: IStepRepository;</span></span>
<span class="line"><span style="color:#80858F;">    /** The steps of runs over \`STEP_REPOSITORY\`; the engine module passes it to the engine. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    STEP_SERVICE: IStepService;</span></span>
<span class="line"><span style="color:#80858F;">    /** The checkpoint repository the store module registers (memory, database or a replacing module&#39;s). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    CHECKPOINT_REPOSITORY: ICheckpointRepository;</span></span>
<span class="line"><span style="color:#80858F;">    /** The latest checkpoint of each run over \`CHECKPOINT_REPOSITORY\`; the engine module passes it to the engine. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    CHECKPOINT_SERVICE: ICheckpointService;</span></span>
<span class="line"><span style="color:#80858F;">    /** The effect repository the store module registers (memory, database or a replacing module&#39;s). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    EFFECT_REPOSITORY: IEffectRepository;</span></span>
<span class="line"><span style="color:#80858F;">    /** Recorded effect results over \`EFFECT_REPOSITORY\`; the engine module passes it to the engine. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    EFFECT_SERVICE: IEffectService;</span></span>
<span class="line"><span style="color:#80858F;">    /** The artifact repository the store module registers (memory, database or a replacing module&#39;s). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    ARTIFACT_REPOSITORY: IArtifactRepository;</span></span>
<span class="line"><span style="color:#80858F;">    /** The files of runs over \`ARTIFACT_REPOSITORY\`; the engine module passes it to the engine. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    ARTIFACT_SERVICE: IArtifactService;</span></span>
<span class="line"><span style="color:#80858F;">    /** The state key repository the store module registers (memory, database or a replacing module&#39;s). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    STATE_REPOSITORY: IStateRepository;</span></span>
<span class="line"><span style="color:#80858F;">    /** The state document repository the store module registers (memory, database or a replacing module&#39;s). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    STATE_DOCUMENT_REPOSITORY: IStateDocumentRepository;</span></span>
<span class="line"><span style="color:#80858F;">    /** Agent state over \`STATE_REPOSITORY\` and \`STATE_DOCUMENT_REPOSITORY\`; the engine module passes it to the engine. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    STATE_SERVICE: IStateService;</span></span>
<span class="line"><span style="color:#80858F;">    /** The lock repository the store module registers (memory, database or a replacing module&#39;s). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    LOCK_REPOSITORY: ILockRepository;</span></span>
<span class="line"><span style="color:#80858F;">    /** Leases over \`LOCK_REPOSITORY\`, on the app clock; the engine module passes it to the engine, connections and features lock through it. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    LOCK_SERVICE: ILockService;</span></span>
<span class="line"><span style="color:#80858F;">    /** The idempotency key repository the store module registers (memory, database or a replacing module&#39;s). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    IDEMPOTENCY_REPOSITORY: IIdempotencyRepository;</span></span>
<span class="line"><span style="color:#80858F;">    /** Dispatch idempotency keys over \`IDEMPOTENCY_REPOSITORY\`, on the app clock; the engine module passes it to the engine. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    IDEMPOTENCY_SERVICE: IIdempotencyService;</span></span>
<span class="line"><span style="color:#80858F;">    /** The limit use repository the store module registers (memory, database or a replacing module&#39;s). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    LIMIT_REPOSITORY: ILimitRepository;</span></span>
<span class="line"><span style="color:#80858F;">    /** The counted uses of tool limits over \`LIMIT_REPOSITORY\`, on the app clock; the engine module passes it to the engine. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    LIMIT_SERVICE: ILimitService;</span></span>
<span class="line"><span style="color:#80858F;">    /** The agent revision repository the store module registers (memory, database or a replacing module&#39;s). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    AGENT_REVISION_REPOSITORY: IAgentRevisionRepository;</span></span>
<span class="line"><span style="color:#80858F;">    /** The revision markers of folder agents over \`AGENT_REVISION_REPOSITORY\`; the engine module passes it to the engine. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    AGENT_REVISION_SERVICE: IAgentRevisionService;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The connection repository the store module registers (memory,</span></span>
<span class="line"><span style="color:#80858F;">     * database or a replacing module&#39;s); optional (\`container.has()\`).</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONNECTION_REPOSITORY: IConnectionRepository;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Connections, their entries and config over \`CONNECTION_REPOSITORY\`, on</span></span>
<span class="line"><span style="color:#80858F;">     * the app clock, fenced by the leases of \`LOCK_SERVICE\`. Registered only</span></span>
<span class="line"><span style="color:#80858F;">     * while the store keeps connections: a feature asks \`container.has()\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONNECTION_SERVICE: IConnectionService;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The conversation repository the store module registers (memory,</span></span>
<span class="line"><span style="color:#80858F;">     * database or a replacing module&#39;s); optional (\`container.has()\`).</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONVERSATION_REPOSITORY: IConversationRepository;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Conversations, their transcripts and notes over</span></span>
<span class="line"><span style="color:#80858F;">     * \`CONVERSATION_REPOSITORY\`, on the app clock. Registered only while</span></span>
<span class="line"><span style="color:#80858F;">     * the store keeps conversations: the engine module passes it to the</span></span>
<span class="line"><span style="color:#80858F;">     * engine, the conversation capability needs it.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONVERSATION_SERVICE: IConversationService;</span></span>
<span class="line"><span style="color:#E3E5EA;">    DATA_SOURCE: DataSource;</span></span>
<span class="line"><span style="color:#E3E5EA;">    ENGINE: IEngine;</span></span>
<span class="line"><span style="color:#80858F;">    /** The engine module&#39;s model resolver (start and job mode, a check too): chat and, through \`embedding()\`, embedding models. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    MODELS: IModelResolver;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The peers remote agents run at (\`peerModule()\` of \`@chamvi/peer/module\`</span></span>
<span class="line"><span style="color:#80858F;">     * registers it in \`setup\`); optional (\`container.has()\`): the engine</span></span>
<span class="line"><span style="color:#80858F;">     * module passes it to the engine, which refuses a remote agent naming a</span></span>
<span class="line"><span style="color:#80858F;">     * peer it does not hold.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    PEERS: IPeerResolver;</span></span>
<span class="line"><span style="color:#E3E5EA;">    SHUTDOWN: IShutdown;</span></span>
<span class="line"><span style="color:#E3E5EA;">    SERVER: Server;</span></span>
<span class="line"><span style="color:#E3E5EA;">    HTTP_ROUTES: HttpRoute;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * A collection: instances of \`@routup/decorators\` controller classes the</span></span>
<span class="line"><span style="color:#80858F;">     * http app mounts after its own (start mode, a check too). Register a</span></span>
<span class="line"><span style="color:#80858F;">     * \`useFactory\` to build one from the container&#39;s values when the http</span></span>
<span class="line"><span style="color:#80858F;">     * module resolves the token, after every module&#39;s \`setup\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    HTTP_CONTROLLERS: object;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * A collection: OpenAPI documents of the contributed controllers, merged</span></span>
<span class="line"><span style="color:#80858F;">     * into the served \`/openapi.json\` after the \`openapi.documents\` option&#39;s;</span></span>
<span class="line"><span style="color:#80858F;">     * ignored with \`httpModule({ openapi: false })\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    OPENAPI_DOCUMENTS: object;</span></span>
<span class="line"><span style="color:#E3E5EA;">    AUTHENTICATORS: AuthenticatorEntry;</span></span>
<span class="line"><span style="color:#80858F;">    /** A collection: the channels modules contribute (\`registerMany\` in \`setup\`). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    CHANNELS: IChannel&lt;any, any&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    LIFECYCLE_HOOKS: ILifecycleHook;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * A collection: the background jobs modules contribute (\`registerMany\` in</span></span>
<span class="line"><span style="color:#80858F;">     * \`setup\`); the components module runs them in start mode.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    COMPONENTS: AppComponent;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The components the components module runs, in start order (start mode</span></span>
<span class="line"><span style="color:#80858F;">     * outside a check, from its \`onReady\` on); each answers its \`status()\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    COMPONENT_LIST: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> AppComponent[];</span></span>
<span class="line"><span style="color:#80858F;">    /** The agents dir&#39;s and agent packages&#39; load issues (\`chamvi:agents\`, when a dir or a package is configured), at the time of the call. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    AGENT_ISSUES: () </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#8EA7FF;"> readonly</span><span style="color:#E3E5EA;"> AgentIssue[];</span></span>
<span class="line"><span style="color:#80858F;">    /** A collection: every module&#39;s check of a folder agent before it is registered. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    AGENT_CHECKS: AgentCheck;</span></span>
<span class="line"><span style="color:#80858F;">    /** A collection: git credential sources modules contribute for the workspaces (\`sandboxModule()\` reads them). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    GIT_CREDENTIALS: GitCredentialSource;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The app&#39;s keyring from \`ENCRYPTION_KEYS\`, built when first</span></span>
<span class="line"><span style="color:#80858F;">     * resolved: without the variable, or malformed, resolving throws</span></span>
<span class="line"><span style="color:#80858F;">     * InvalidAgentDefinitionError (naming the variable, never the value), so</span></span>
<span class="line"><span style="color:#80858F;">     * only an app with a module that needs it needs the variable.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    KEYRING: IKeyring;</span></span>
<span class="line"><span style="color:#80858F;">    /** A collection: the connection handles modules contribute; the http app serves them at \`/connections\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONNECTIONS: IConnectionHandle;</span></span>
<span class="line"><span style="color:#80858F;">    /** A collection: the connection types modules contribute. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONNECTION_TYPES: IConnectionTypeProvider;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The settings and sealed secrets of connections, over</span></span>
<span class="line"><span style="color:#80858F;">     * \`CONNECTION_SERVICE\`: list \`ModuleName.STORE\` in \`dependencies\` to</span></span>
<span class="line"><span style="color:#80858F;">     * resolve it in \`setup\`. Built lazily; resolving it throws</span></span>
<span class="line"><span style="color:#80858F;">     * InvalidAgentDefinitionError while the store keeps no connections; the</span></span>
<span class="line"><span style="color:#80858F;">     * keyring is resolved only when a secret is touched, so reading plain</span></span>
<span class="line"><span style="color:#80858F;">     * settings needs no \`ENCRYPTION_KEYS\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONNECTION_CONFIGS: IConnectionConfigStore;</span></span>
<span class="line"><span style="color:#80858F;">    /** A collection: the separately built pages modules contribute; the shell lists them from \`GET /ui-pages\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    UI_PAGES: UiPage;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The sign-in the dashboard serves (\`uiModule()\` registers it in \`setup\`);</span></span>
<span class="line"><span style="color:#80858F;">     * a \`*-ui\` page reads it, else \`readUiAuth()\` of the env.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    UI_AUTH: UiAuth;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> runHooks(container: IContainer, phase: LifecyclePhase, ...args: unknown[]): Promise&lt;void&gt;; </span><span style="color:#80858F;">// every LIFECYCLE_HOOKS entry, in order</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> throwIfStopped(context: AppContext): void; </span><span style="color:#80858F;">// throws the app_stopped error once stop() was called</span></span></code></pre></div><h2 id="testing-modules" tabindex="-1">Testing modules <a class="header-anchor" href="#testing-modules" aria-label="Permalink to &quot;Testing modules&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">// @chamvi/app/testing</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> buildModuleHarness(options?: ModuleHarnessOptions): ModuleHarness;          </span><span style="color:#80858F;">// not set up yet</span></span>
<span class="line"><span style="color:#8EA7FF;">async</span><span style="color:#8EA7FF;"> function</span><span style="color:#E3E5EA;"> createModuleHarness(options?: ModuleHarnessOptions): Promise&lt;ModuleHarness&gt;; </span><span style="color:#80858F;">// set up</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> memoryStoreModule(options?: MemoryStoreModuleOptions): IModule;              </span><span style="color:#80858F;">// &#39;chamvi:store&#39; on memory repositories of \`registry\` (default a new one)</span></span></code></pre></div><p>The real module lifecycle without <code>start()</code> and a port, over exactly <code>options.modules</code> (list the built-ins a module needs, e.g. <code>configModule()</code>, <code>storeModule()</code>, <code>engineModule()</code>) on a container holding <code>AppToken.CONTEXT</code> (and <code>CLOCK</code> with <code>clock</code>): <code>setup()</code> runs every <code>setup</code>, every <code>onReady</code> and the start steps like the app and tears down and rethrows when one fails, <code>reported</code> collects every <code>context.report()</code> call (a throwing lifecycle hook lands there), <code>stop()</code> aborts the context signal and tears down.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Agent, IClock, IKeyring } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { MemoryRegistry } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/store-memory&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IContainer } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;eldin&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Application, IModule } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;orkos&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Env } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../env/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { AppContext, AppMode } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../module/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { MemoryStoreAggregates } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../modules/repository/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ModuleHarnessReport = { error: unknown; context?: Record&lt;string, unknown&gt; };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ModuleHarnessOptions = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    mode?: AppMode;</span></span>
<span class="line"><span style="color:#E3E5EA;">    dev?: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">    env?: Env;</span></span>
<span class="line"><span style="color:#E3E5EA;">    modules?: IModule[];</span></span>
<span class="line"><span style="color:#E3E5EA;">    agents?: Agent[];</span></span>
<span class="line"><span style="color:#80858F;">    /** createApp&#39;s package specifiers, copied into the context. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    packages?: string[];</span></span>
<span class="line"><span style="color:#E3E5EA;">    models?: AppContext[</span><span style="color:#E7C58C;">&#39;models&#39;</span><span style="color:#E3E5EA;">];</span></span>
<span class="line"><span style="color:#80858F;">    /** createApp&#39;s \`model\`, copied into the context. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    model?: AppContext[</span><span style="color:#E7C58C;">&#39;model&#39;</span><span style="color:#E3E5EA;">];</span></span>
<span class="line"><span style="color:#80858F;">    /** createApp&#39;s \`providers\`, copied into the context. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    providers?: AppContext[</span><span style="color:#E7C58C;">&#39;providers&#39;</span><span style="color:#E3E5EA;">];</span></span>
<span class="line"><span style="color:#80858F;">    /** Copied into the context: \`IApp.check()\`&#39;s flag (mode stays \`start\`); \`setup()\` then runs no start steps. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    check?: boolean;</span></span>
<span class="line"><span style="color:#80858F;">    /** Copied into the context: the agent a job runs (\`IApp.runJob()\`). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    job?: AppContext[</span><span style="color:#E7C58C;">&#39;job&#39;</span><span style="color:#E3E5EA;">];</span></span>
<span class="line"><span style="color:#80858F;">    /** Registered as \`AppToken.CLOCK\` before setup (a config module may replace it). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    clock?: IClock;</span></span>
<span class="line"><span style="color:#80858F;">    /** Registered as \`AppToken.KEYRING\` (the config module then reads no env for it). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    keyring?: IKeyring;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ModuleHarness = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    application: Application;</span></span>
<span class="line"><span style="color:#E3E5EA;">    container: IContainer;</span></span>
<span class="line"><span style="color:#E3E5EA;">    context: AppContext;</span></span>
<span class="line"><span style="color:#E3E5EA;">    controller: AbortController;</span></span>
<span class="line"><span style="color:#80858F;">    /** Everything \`context.report()\` received, in order. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    reported: ModuleHarnessReport[];</span></span>
<span class="line"><span style="color:#80858F;">    /** Runs \`application.setup()\` and the start steps, like the app; tears down and rethrows when it fails. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    setup(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** Aborts the context signal (app_stopped) and tears every module down. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    stop(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> MemoryStoreModuleOptions = MemoryStoreAggregates &amp; {</span></span>
<span class="line"><span style="color:#80858F;">    /** Where the memory repositories keep their rows (default: a new registry). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    registry?: MemoryRegistry;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><h2 id="approved-local-skills" tabindex="-1">Approved local skills <a class="header-anchor" href="#approved-local-skills" aria-label="Permalink to &quot;Approved local skills&quot;">​</a></h2><p><code>AppOptions.skills?: readonly SkillInput[]</code> forwards additive defaults for every agent passed in code and every folder agent. An agent&#39;s <code>skills</code> adds extras. Factory inputs come from <code>@chamvi/skills</code>: <code>gitSkills()</code> and <code>loadSkillBundle()</code> work directly; custom snapshots/loaders use <code>defineSkill()</code>/<code>defineSkillSource()</code>. Core supplies the generic <code>SkillInput</code> protocol; skill data types, validation, catalogs and caches belong to skills. Core/app have no dependency on <code>@chamvi/skills</code>, and no skills module registration is needed. Startup verifies globals and the sources of agents passed in code before <code>engineCreated</code>; folder-agent extras verify afterward, before channels, HTTP and model execution. <code>check()</code> skips providers and defers content verification; <code>migrate()</code> skips preparation. See <a href="/guide/skills">Approved skills</a> for lifecycle and replay semantics.</p><p>Filesystem review/loading and Git preparation are exported by <a href="/reference/skills"><code>@chamvi/skills</code></a>. App exports no filesystem helpers. Use <code>loadSkillBundle()</code> for a ready snapshot or <code>gitSkills()</code> for an engine-owned source; the manual <code>loadSkillBundles()</code> catalog remains supported by the skills package.</p><h2 id="agent-folders" tabindex="-1">Agent folders <a class="header-anchor" href="#agent-folders" aria-label="Permalink to &quot;Agent folders&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> loadAgent(dir: string, options?: LoadAgentOptions): Promise&lt;LoadedAgent&gt;;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> loadAgents(root: string, options?: LoadAgentOptions): Promise&lt;LoadAgentsResult&gt;;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> listAgentFolders(root: string): Promise&lt;string[]&gt;;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> hashAgentFolder(dir: string): Promise&lt;string&gt;;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> loadAgentPackage(spec: string, options: LoadAgentPackageOptions): Promise&lt;LoadedPackage&gt;; </span><span style="color:#80858F;">// throws InvalidAgentDefinitionError</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> hashAgentPackage(root: string, options?: HashAgentPackageOptions): Promise&lt;string&gt;; </span><span style="color:#80858F;">// the published files and the entry&#39;s folder, package.json without version</span></span></code></pre></div><p><code>loadAgent</code> builds one folder&#39;s agent from its <code>agent.ts</code> (see <a href="/guide/agent-folders#the-folder">the rule</a>) and its content hash, and throws <code>InvalidAgentDefinitionError</code> naming the file relative to the agents dir. <code>loadAgents</code> loads every folder <code>listAgentFolders</code> names (the direct subfolders not starting with <code>.</code> or <code>_</code>, <code>node_modules</code> left out, in code-point order) and returns the failures as <code>issues</code> instead of throwing. <code>hashAgentFolder</code> is sha256 (hex) over every file below the folder, dot-entries skipped, by relative POSIX path. <code>loadAgent</code> also refuses a folder that changed while it was read (<code>&lt;agent&gt;: changed while loading; load it again.</code>), a <code>node_modules</code> folder in the agent folder or the agents dir, and a JavaScript file (<code>.js</code>, <code>.mjs</code> or <code>.cjs</code>) anywhere in the folder. The default reader transpiles <code>agent.ts</code> and every <code>.ts</code>/<code>.mts</code> file it imports on every load and resolves <code>@chamvi/*</code>, <code>ai</code> and <code>@ai-sdk/*</code> to the copies <code>@chamvi/app</code> resolves. The loader and the package loader (<code>loadAgentPackage</code>, <code>hashAgentPackage</code>) hold the only <code>locter</code> imports of chamvi.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Agent } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A folder agent: the agent built from its folder and the folder&#39;s content hash. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> LoadedAgent = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: Agent;</span></span>
<span class="line"><span style="color:#80858F;">    /** \`hashAgentFolder(dir)\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    hash: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    dir: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A folder that did not load; \`message\` names files relative to the agents dir, never an absolute path. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AgentLoadIssue = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    message: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> LoadAgentOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Reads \`agent.ts\` by absolute path and returns its module namespace. Default: a transpiling locter reader without</span></span>
<span class="line"><span style="color:#80858F;">     * module cache, so a re-read sees edits (imported files included), while</span></span>
<span class="line"><span style="color:#80858F;">     * packages from \`node_modules\` load natively (one instance).</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    load?: (path: string) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> Promise&lt;unknown&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> LoadAgentsResult = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    agents: LoadedAgent[];</span></span>
<span class="line"><span style="color:#E3E5EA;">    issues: AgentLoadIssue[];</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** An agent as a default export declares it, checked structurally (another \`@chamvi/core\` copy&#39;s agent passes). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> DeclaredAgent = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    name: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    definition: Record&lt;string, unknown&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><h2 id="models" tabindex="-1">Models <a class="header-anchor" href="#models" aria-label="Permalink to &quot;Models&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> BUILTIN_PROVIDERS: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> BuiltinProvider[]; </span><span style="color:#80858F;">// anthropic, openai, google, mistral, xai: the implicit providers</span></span></code></pre></div><p>See <a href="/guide/models">Pick a Model</a> for the whole picture. <code>createApp({ model, providers, models })</code> sets the default model, the named providers and AI SDK provider objects by id; <code>MODEL</code>, <code>CONFIG_FILE</code> (else <code>./chamvi.json</code>) and <code>PROVIDER_&lt;NAME&gt;_*</code> set the same from the deployment. Sources, highest first: env, the config file, code; providers merge per name and field, a higher source with another <code>type</code> replaces the provider, a <code>PROVIDER_&lt;NAME&gt;_*</code> variable without <code>_TYPE</code> needs another source to declare <code>&lt;name&gt;</code>, and a declared provider replaces the implicit one of its name. <code>models</code> wins over everything for its ids (no package imported), the test seam.</p><p>Model strings are split at the first <code>/</code>. Every provider gets an explicit key and base URL (the type&#39;s public URL when none is set), read from the app&#39;s <code>env</code> only, never from <code>process.env</code> behind its back; <code>{ file }</code> secrets are read relative to the working directory with one trailing newline trimmed. The config file refuses a literal <code>apiKey</code> and literal credential headers. Errors name the variable or file field and never echo a value: <code>Agent &quot;&lt;a&gt;&quot; uses provider &quot;&lt;p&gt;&quot;, which is not configured. Set PROVIDER_&lt;P&gt;_TYPE and PROVIDER_&lt;P&gt;_API_KEY, or declare it in chamvi.json.</code>, <code>Provider &quot;&lt;p&gt;&quot; (&lt;type&gt;) needs PROVIDER_&lt;P&gt;_API_KEY.</code>, <code>Provider type &quot;&lt;type&gt;&quot; needs package &lt;pkg&gt;.</code> Nothing reads or sets the AI SDK&#39;s global default provider, so two apps in one process keep their own providers.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"></span>
<span class="line"><span style="color:#80858F;">/** createApp&#39;s \`models\`: providers by id, as \`createProviderRegistry()\` takes them. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ModelProviders = Parameters&lt;</span><span style="color:#8EA7FF;">typeof</span><span style="color:#E3E5EA;"> createProviderRegistry&gt;[</span><span style="color:#E7C58C;">0</span><span style="color:#E3E5EA;">];</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** What a provider is built with: the AI SDK package and factory behind a provider name. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ProviderType = </span><span style="color:#E7C58C;">&#39;anthropic&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;openai&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;openai-compatible&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;google&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;mistral&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;xai&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;gateway&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A secret: a literal, an env variable of the app&#39;s env, or a file (relative to the cwd, one trailing newline trimmed). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> SecretValue = string | { env: string } | { file: string };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A named provider, as createApp&#39;s \`providers\` and the config file declare it. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ProviderConfig = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    type: ProviderType;</span></span>
<span class="line"><span style="color:#E3E5EA;">    apiKey?: SecretValue;</span></span>
<span class="line"><span style="color:#80858F;">    /** Absolute http(s) URL without credentials, query or fragment; default the type&#39;s public URL. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    baseURL?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Header names match \`^[a-z0-9]+(-[a-z0-9]+)*$\` (lower-cased first). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    headers?: Record&lt;string, SecretValue&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Where a setting came from: an env variable, the config file, createApp&#39;s options, or a bare provider variable. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> SettingSource = </span><span style="color:#E7C58C;">&#39;env&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;file&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;code&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;implicit&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A provider after merging code, config file and env: secrets resolved, header names lower-cased. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ProviderSettings = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    name: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    type: ProviderType;</span></span>
<span class="line"><span style="color:#E3E5EA;">    apiKey?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    baseURL?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    headers: Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** Where each field came from. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    sources: {</span></span>
<span class="line"><span style="color:#E3E5EA;">        type: SettingSource;</span></span>
<span class="line"><span style="color:#E3E5EA;">        apiKey?: SettingSource;</span></span>
<span class="line"><span style="color:#E3E5EA;">        baseURL?: SettingSource;</span></span>
<span class="line"><span style="color:#E3E5EA;">        headers: Record&lt;string, SettingSource&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    };</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The app&#39;s model settings: the default model and the providers that were read without an issue. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ModelSettings = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    model?: { ref: ModelRef; source: SettingSource };</span></span>
<span class="line"><span style="color:#E3E5EA;">    providers: ReadonlyMap&lt;string, ProviderSettings&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** The config file read (absolute), when one was. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    configFile?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A problem found while reading the settings; never holds a secret value. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ModelIssue = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    provider?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    message: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A built-in provider id, its package and the bare env variables it reads. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> BuiltinProvider = {</span></span>
<span class="line"><span style="color:#80858F;">    /** The provider name, the part of a model string before the first \`/\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    id: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The npm package. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    package: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The factory the package exports. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    factory: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The env variable holding the API key. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    apiKey: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The env variable holding a base URL, when the provider reads one. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    baseUrl?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><p><code>app.check({ env? })</code> (<code>chamvi start --check</code>) runs the same settings through the real start path without starting anything or writing to the store; see <a href="/guide/models#check-before-you-deploy">Check before you deploy</a>.</p><h2 id="logger" tabindex="-1">Logger <a class="header-anchor" href="#logger" aria-label="Permalink to &quot;Logger&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> createLogger(options?: LoggerOptions): ILogger;</span></span></code></pre></div><p>One JSON line per entry (<code>{ level, time, msg, ...fields, error? }</code>, the error as <code>{ name, code, message, stack }</code> only, never its <code>cause</code>) on stderr, or through <code>write</code>. The engine&#39;s, the cron channel&#39;s and the HTTP app&#39;s <code>onError</code> all go through it.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IClock } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { LogLevel } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../config/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> interface</span><span style="color:#E3E5EA;"> ILogger {</span></span>
<span class="line"><span style="color:#E3E5EA;">    error(message: string, error?: unknown, fields?: Record&lt;string, unknown&gt;): void;</span></span>
<span class="line"><span style="color:#E3E5EA;">    warn(message: string, fields?: Record&lt;string, unknown&gt;): void;</span></span>
<span class="line"><span style="color:#E3E5EA;">    info(message: string, fields?: Record&lt;string, unknown&gt;): void;</span></span>
<span class="line"><span style="color:#E3E5EA;">    debug(message: string, fields?: Record&lt;string, unknown&gt;): void;</span></span>
<span class="line"><span style="color:#E3E5EA;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> LoggerOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Entries below it are dropped; default \`info\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    level?: LogLevel;</span></span>
<span class="line"><span style="color:#80858F;">    /** The \`time\` of every entry; default \`systemClock\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    clock?: IClock;</span></span>
<span class="line"><span style="color:#80858F;">    /** One call per JSON line (without the newline); default stderr. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    write?: (line: string) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> void;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> SerializedError = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    name?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    code?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    message: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    stack?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div>`,75)])])}const A=n(l,[["render",p]]);export{y as __pageData,A as default};
