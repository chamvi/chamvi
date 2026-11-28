import{_ as n,o as a,c as e,a2 as l}from"./chunks/framework.DiXyETtc.js";const d=JSON.parse('{"title":"@chamvi/core","description":"","frontmatter":{},"headers":[],"relativePath":"reference/index.md","filePath":"reference/index.md","lastUpdated":1795877638000}'),p={name:"reference/index.md"};function o(t,s,c,r,i,E){return a(),e("div",null,[...s[0]||(s[0]=[l(`<h1 id="chamvi-core" tabindex="-1">@chamvi/core <a class="header-anchor" href="#chamvi-core" aria-label="Permalink to &quot;@chamvi/core&quot;">​</a></h1><p>The public API of <code>@chamvi/core</code>, taken from <code>packages/core/src/index.ts</code>. Contract interfaces carry an <code>I</code> prefix (<code>IClock</code>, <code>IChannel</code>, <code>IAgentState</code>, <code>IEngine</code>); data shapes are unprefixed types.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#E3E5EA;"> { Engine, defineModelAgent } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E3E5EA;">;</span></span></code></pre></div><p>Test helpers live in <a href="/reference/test-kit"><code>@chamvi/test-kit</code></a>.</p><h2 id="agents" tabindex="-1">Agents <a class="header-anchor" href="#agents" aria-label="Permalink to &quot;Agents&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> defineModelAgent&lt;S </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StateSchema = StateSchema&gt;(def: ModelAgentDefinition&lt;S&gt;): ModelAgent&lt;S&gt;;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> defineSimpleAgent&lt;S </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StateSchema = StateSchema, T </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> ToolSet = ToolSet&gt;(def: SimpleAgentDefinition&lt;S, T&gt;): SimpleAgent&lt;S, T&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> DEFAULT_MAX_STEPS: </span><span style="color:#E7C58C;">20</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> DEFAULT_TIMEOUT_MS: </span><span style="color:#E7C58C;">900_000</span><span style="color:#E3E5EA;">; </span><span style="color:#80858F;">// 15 minutes</span></span></code></pre></div><p>Throws <code>InvalidAgentDefinitionError</code> for an invalid name, instruction outer shape or role, duplicate subscription ids, a tool with <code>needsApproval</code> or a <code>toolsContext</code> entry naming a chamvi tool or no tool of a plain tool set (both in a plain tool set; a tools factory fails the run instead), <code>defineModelAgent()</code> also for <code>run</code>. <code>Agent</code> is <code>ModelAgent | SimpleAgent | RemoteAgent</code>, told apart (and narrowed, the definition too) by <code>kind</code> (<code>&#39;model&#39;</code>, <code>&#39;simple&#39;</code> or <code>&#39;remote&#39;</code>); <code>AgentDefinition</code> is <code>ModelAgentDefinition | SimpleAgentDefinition | RemoteAgentDefinition</code>. The engine refuses an agent whose <code>kind</code> is none of these or disagrees with its definition (a simple agent needs a function <code>run</code>, a model agent has none). <code>defineSimpleAgent()</code> also throws for a non-function <code>run</code>, a tools factory or any of <code>model</code>, <code>instructions</code>, <code>skills</code>, <code>output</code>, <code>conversation</code>, <code>toolsContext</code>; its <code>run(payload, ctx: SimpleRunContext)</code> gets the tool context plus <code>ctx.tools</code>. See <a href="/guide/agents#simple-agents">Agents</a>.</p><p>A folder agent&#39;s <code>agent.ts</code> default-exports <code>defineModelAgent()</code>&#39;s or <code>defineSimpleAgent()</code>&#39;s result, named like its folder (rebuilt through the factory of its <code>kind</code>; one without <code>kind</code>, from an older core, as a model agent unless it has <code>run</code>); <code>AgentRevision</code> (<code>@chamvi/core-kit</code>) is the store&#39;s revision marker of a folder agent (see <a href="/guide/agent-folders">Agent Folders</a>):</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { StandardSchemaV1 } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@standard-schema/spec&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> {</span></span>
<span class="line"><span style="color:#E3E5EA;">    AssistantModelMessage,</span></span>
<span class="line"><span style="color:#E3E5EA;">    InferToolOutput,</span></span>
<span class="line"><span style="color:#E3E5EA;">    OutputInterface,</span></span>
<span class="line"><span style="color:#E3E5EA;">    SystemModelMessage,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ToolSet,</span></span>
<span class="line"><span style="color:#E3E5EA;">    UserModelMessage,</span></span>
<span class="line"><span style="color:#E3E5EA;">} </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;ai&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ChannelSubscription } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../channel/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { AgentLimits } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../limit/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ModelRef } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../model/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { RunContext } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../run/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Budget } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core-kit&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { StateSchema } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../state/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { SkillInput } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../skill/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { AgentTrust, ToolContext } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../tool/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The factory&#39;s argument: the same ToolContext the run&#39;s chamvi tools get. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ToolFactoryContext&lt;S </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StateSchema = StateSchema&gt; = ToolContext&lt;S&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * Decides per tool name whether a run may use a tool. A refused tool is not</span></span>
<span class="line"><span style="color:#80858F;"> * offered to the model (it is left out of \`activeTools\`). A call to it that</span></span>
<span class="line"><span style="color:#80858F;"> * still arrives is a tool error, never a run failure, and its tool step</span></span>
<span class="line"><span style="color:#80858F;"> * records \`tool_not_allowed\` (ToolNotAllowedError) on both paths:</span></span>
<span class="line"><span style="color:#80858F;"> * - the model calls it anyway: the AI SDK answers the model with its</span></span>
<span class="line"><span style="color:#80858F;"> *   unavailable-tool error (NoSuchToolError), the engine records the step</span></span>
<span class="line"><span style="color:#80858F;"> *   as ToolNotAllowedError;</span></span>
<span class="line"><span style="color:#80858F;"> * - a call pending on an approval (the policy changed before the resume)</span></span>
<span class="line"><span style="color:#80858F;"> *   reaches the engine&#39;s per-call re-check, which answers the model with</span></span>
<span class="line"><span style="color:#80858F;"> *   ToolNotAllowedError.</span></span>
<span class="line"><span style="color:#80858F;"> * May return a promise: the engine awaits every verdict when it builds the</span></span>
<span class="line"><span style="color:#80858F;"> * offered tools of an execution and again in the per-call re-check; a</span></span>
<span class="line"><span style="color:#80858F;"> * rejecting policy fails the run. \`now\` is the engine clock&#39;s time at that</span></span>
<span class="line"><span style="color:#80858F;"> * check (date and time policies). Should depend only on the run snapshot</span></span>
<span class="line"><span style="color:#80858F;"> * (e.g. \`run.trigger.invoker\`) and \`now\`.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ToolPolicy = (toolName: string, ctx: ToolPolicyContext) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> boolean | Promise&lt;boolean&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** What a ToolPolicy decides on. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ToolPolicyContext = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    run: RunContext;</span></span>
<span class="line"><span style="color:#80858F;">    /** The engine clock&#39;s time at this check. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    now: Date;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A tool call as the agent hooks see it. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ToolCallInfo = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    toolName: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    toolCallId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    input: unknown;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * Gates and rewrites for every tool call of the agent&#39;s merged set (user,</span></span>
<span class="line"><span style="color:#80858F;"> * chamvi, state and third-party tools alike), run inside the tool-call frame</span></span>
<span class="line"><span style="color:#80858F;"> * with the execution&#39;s ToolContext (\`inject\` works there).</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AgentHooks = {</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Runs before the effect lookup and returns the input to execute with</span></span>
<span class="line"><span style="color:#80858F;">     * (\`undefined\` keeps it). A changed input is re-validated against the</span></span>
<span class="line"><span style="color:#80858F;">     * tool&#39;s input schema (a failure is a ValidationError tool error) and is</span></span>
<span class="line"><span style="color:#80858F;">     * what the effect key is computed from. A throw is a tool error</span></span>
<span class="line"><span style="color:#80858F;">     * (ToolDeniedError for a refusal); a FatalToolError fails the run.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    beforeToolExecution?(call: ToolCallInfo, ctx: ToolContext): unknown | Promise&lt;unknown&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Runs on a fresh result and on a recorded effect result alike and returns</span></span>
<span class="line"><span style="color:#80858F;">     * the output the model sees (\`undefined\` keeps it). A streaming tool&#39;s</span></span>
<span class="line"><span style="color:#80858F;">     * hook gets its final value. Not called for a tool error.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    afterToolExecution?(call: ToolCallInfo &amp; { output: unknown }, ctx: ToolContext): unknown | Promise&lt;unknown&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Trusted configured messages; tool-role messages are never instruction inputs. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AgentInstruction = SystemModelMessage | UserModelMessage | AssistantModelMessage;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A string is shorthand for one system message. Arrays retain their authored order. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AgentInstructions = string | </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> AgentInstruction[];</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** An agent whose runs call a language model: defineModelAgent()&#39;s input. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ModelAgentDefinition&lt;S </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StateSchema = StateSchema&gt; = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    name: string;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** The text of the agent&#39;s MCP run tool; default: its leading system instruction. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    description?: string;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** Only a simple agent has it (defineSimpleAgent()). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    run?: never;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * \`&#39;&lt;provider&gt;/&lt;model id&gt;&#39;\` (resolved through EngineOptions.models) or a</span></span>
<span class="line"><span style="color:#80858F;">     * LanguageModel object; without it the agent uses EngineOptions.model.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    model?: ModelRef,</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    instructions: AgentInstructions,</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> skills?: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> SkillInput[],</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The channels that start the agent&#39;s runs (e.g. \`cron.on(&#39;0 8 * * 1-5&#39;)\`);</span></span>
<span class="line"><span style="color:#80858F;">     * every subscription names a channel registered on the engine, ids are</span></span>
<span class="line"><span style="color:#80858F;">     * unique per agent.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    channels?: ChannelSubscription[];</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** Shared-store execution cap across all channels; omitted or false adds no cap. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    concurrencyMaxRuns?: number | false;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** Only principals granted \`chamvi_agent_read\` for this agent read its runs (and state). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    private?: boolean;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The agent&#39;s tools: a plain \`ToolSet\` (the default), or a factory for</span></span>
<span class="line"><span style="color:#80858F;">     * dynamic sets, called once per execution with the same ToolContext the</span></span>
<span class="line"><span style="color:#80858F;">     * tools get. Tools built with \`defineTool\`/\`defineEffectTool\` receive that</span></span>
<span class="line"><span style="color:#80858F;">     * context as \`context\` in \`execute\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    tools?: ToolSet | ((ctx: ToolContext&lt;S&gt;) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> ToolSet);</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    trust?: AgentTrust;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Per tool name, a rate limit replacing the tool&#39;s own \`limit\`, or</span></span>
<span class="line"><span style="color:#80858F;">     * false to turn it off. A non-empty record needs an engine with a</span></span>
<span class="line"><span style="color:#80858F;">     * \`limitService\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    limits?: AgentLimits;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Per tool name, the context of a tool that is not chamvi&#39;s (e.g. a</span></span>
<span class="line"><span style="color:#80858F;">     * third-party tool with its own \`contextSchema\`), passed through unchanged</span></span>
<span class="line"><span style="color:#80858F;">     * by reference to every call of every run: treat it as immutable. An entry</span></span>
<span class="line"><span style="color:#80858F;">     * naming a chamvi tool or no tool is an InvalidAgentDefinitionError (at</span></span>
<span class="line"><span style="color:#80858F;">     * defineModelAgent for a plain set, a failed run for a factory).</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    toolsContext?: Record&lt;string, unknown&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Tool hooks (see AgentHooks). AI SDK tools declaring their own</span></span>
<span class="line"><span style="color:#80858F;">     * \`needsApproval\` are refused (nothing answers that request).</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    hooks?: AgentHooks;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** Filters the merged tool set (state tools included) per run, e.g. requireToolPermission(). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    toolPolicy?: ToolPolicy;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** Record&lt;collection, StandardSchemaV1&gt;. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    state?: S;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    budget?: Partial&lt;Budget&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Structured output (AI SDK \`Output\`, e.g. \`Output.object({ schema })\`):</span></span>
<span class="line"><span style="color:#80858F;">     * a completed run&#39;s \`output\` is the parsed value instead of the text; a</span></span>
<span class="line"><span style="color:#80858F;">     * final answer that does not parse fails the run with a ValidationError.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    output?: OutputInterface;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Opts the agent into conversation memory (needs</span></span>
<span class="line"><span style="color:#80858F;">     * EngineOptions.conversations); runs that come with no conversation still</span></span>
<span class="line"><span style="color:#80858F;">     * execute as before. Omitted or false: no conversation behaviour.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    conversation?: boolean | {</span></span>
<span class="line"><span style="color:#80858F;">        /** Stable memory identity across agent renames; default is the agent name. */</span></span>
<span class="line"><span style="color:#E3E5EA;">        key: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    };</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * What a simple agent&#39;s \`run()\` gets: the ToolContext its tools would get, plus</span></span>
<span class="line"><span style="color:#80858F;"> * its own tools (wrapped like a model&#39;s calls: effect-recorded,</span></span>
<span class="line"><span style="color:#80858F;"> * trust-classified, gated) as plain functions by name.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> SimpleRunContext&lt;S </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StateSchema = StateSchema, T </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> ToolSet = ToolSet&gt; = ToolContext&lt;S&gt; &amp; {</span></span>
<span class="line"><span style="color:#E3E5EA;">    tools: Record&lt;string, (input: unknown) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> Promise&lt;unknown&gt;&gt; &amp; (string </span><span style="color:#8EA7FF;">extends</span><span style="color:#8EA7FF;"> keyof</span><span style="color:#E3E5EA;"> T ? unknown : {</span></span>
<span class="line"><span style="color:#E3E5EA;">        [K </span><span style="color:#8EA7FF;">in</span><span style="color:#8EA7FF;"> keyof</span><span style="color:#E3E5EA;"> T]: (input: unknown) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> Promise&lt;InferToolOutput&lt;T[K]&gt;&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    });</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * A model-free agent, defineSimpleAgent()&#39;s input: the engine runs \`run(payload, ctx)\` as a durable run</span></span>
<span class="line"><span style="color:#80858F;"> * inside one tool-call frame, so dispatch(), waitForDispatch(), approve(),</span></span>
<span class="line"><span style="color:#80858F;"> * ctx.channels and the agent&#39;s tools work as inside a tool call. A suspended</span></span>
<span class="line"><span style="color:#80858F;"> * run re-runs \`run()\` from the start on resume (the replay rule).</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> SimpleAgentDefinition&lt;S </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StateSchema = StateSchema, T </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> ToolSet = ToolSet&gt; = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    name: string;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** The run&#39;s body; its JSON-serialisable return value is the run&#39;s \`output\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    run(payload: unknown, ctx: SimpleRunContext&lt;S, NoInfer&lt;T&gt;&gt;): unknown | Promise&lt;unknown&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** The text of the agent&#39;s MCP run tool. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    description?: string;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    channels?: ChannelSubscription[];</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    concurrencyMaxRuns?: number | false;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** Only principals granted \`chamvi_agent_read\` for this agent read its runs (and state). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    private?: boolean;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** A plain set only: a factory is refused. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    tools?: T;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    trust?: AgentTrust;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    hooks?: AgentHooks;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    toolPolicy?: ToolPolicy;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    state?: S;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** \`timeoutMs\` and the subtree budget apply; \`maxSteps\` and \`maxTokens\` do not. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    budget?: Partial&lt;Budget&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    model?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">    instructions?: never;</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> skills?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">    output?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">    conversation?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">    toolsContext?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">    limits?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * An agent whose runs another chamvi app (a peer) executes: defineRemoteAgent()&#39;s input.</span></span>
<span class="line"><span style="color:#80858F;"> * A run here is a stand-in that waits on the remote run.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RemoteAgentDefinition = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    name: string;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** A configured peer (EngineOptions.peers). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    peer: string;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** The agent at the peer; default \`name\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent?: string;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** Its \`agent.on()\` role at the peer; default \`default\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    role?: string;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** The text of the agent&#39;s MCP run tool. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    description?: string;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    channels?: ChannelSubscription[];</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** The remote run&#39;s output, validated here (a failure is a ValidationError). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    output?: StandardSchemaV1;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** The deadline of the whole remote run: 1 to APPROVAL_TIMEOUT_MAX_MS, default 24 h. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    timeoutMs?: number;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** Where approvals of the remote run are announced (a channel with \`out\`, fixed in code). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    approvals?: { channel: string; address: string };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** Only principals granted \`chamvi_agent_read\` for this agent read its runs. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    private?: boolean;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    concurrencyMaxRuns?: number | false;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    run?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">    model?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">    instructions?: never;</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> skills?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">    tools?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">    trust?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">    hooks?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">    toolPolicy?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">    state?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">    budget?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">    conversation?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">    toolsContext?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">    limits?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AgentDefinition&lt;S </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StateSchema = StateSchema&gt; = ModelAgentDefinition&lt;S&gt; | SimpleAgentDefinition&lt;S&gt; | RemoteAgentDefinition;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** defineModelAgent()&#39;s result: its definition with the budget defaults applied. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ModelAgent&lt;S </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StateSchema = StateSchema&gt; = {</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> kind: </span><span style="color:#E7C58C;">&#39;model&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> name: string;</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> definition: Required&lt;Pick&lt;ModelAgentDefinition&lt;S&gt;, </span><span style="color:#E7C58C;">&#39;budget&#39;</span><span style="color:#E3E5EA;">&gt;&gt; &amp; ModelAgentDefinition&lt;S&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** defineSimpleAgent()&#39;s result: its definition with the budget defaults applied. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> SimpleAgent&lt;S </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StateSchema = StateSchema, T </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> ToolSet = ToolSet&gt; = {</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> kind: </span><span style="color:#E7C58C;">&#39;simple&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> name: string;</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> definition: Required&lt;Pick&lt;SimpleAgentDefinition&lt;S, T&gt;, </span><span style="color:#E7C58C;">&#39;budget&#39;</span><span style="color:#E3E5EA;">&gt;&gt; &amp; SimpleAgentDefinition&lt;S, T&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** defineRemoteAgent()&#39;s result: its definition with \`agent\`, \`role\` and \`timeoutMs\` defaulted. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RemoteAgent = {</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> kind: </span><span style="color:#E7C58C;">&#39;remote&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> name: string;</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> definition: Required&lt;Pick&lt;RemoteAgentDefinition, </span><span style="color:#E7C58C;">&#39;agent&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;role&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;timeoutMs&#39;</span><span style="color:#E3E5EA;">&gt;&gt; &amp; RemoteAgentDefinition;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A registrable agent; \`kind\` tells them apart and narrows the definition. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> Agent&lt;S </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StateSchema = StateSchema&gt; = ModelAgent&lt;S&gt; | SimpleAgent&lt;S&gt; | RemoteAgent;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The agents a permission check reads by name (an app&#39;s view of the registered agents). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> interface</span><span style="color:#E3E5EA;"> IAgentRegistry {</span></span>
<span class="line"><span style="color:#E3E5EA;">    get(name: string): Agent | undefined;</span></span>
<span class="line"><span style="color:#80858F;">    /** In registration order, a new array. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    names(): string[];</span></span>
<span class="line"><span style="color:#E3E5EA;">}</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * The revision marker of a folder agent: the content hash of its folder</span></span>
<span class="line"><span style="color:#80858F;"> * (never its code) and when that hash was recorded.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AgentRevision = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    hash: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    changedAt: Date;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A stored revision marker: the marker and the row&#39;s storage id. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AgentRevisionRecord = AgentRevision &amp; {</span></span>
<span class="line"><span style="color:#80858F;">    /** The row&#39;s storage id (a uuid), kept by every later \`upsert\` of the same \`agent\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    id: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><h2 id="native-messages-and-instructions" tabindex="-1">Native messages and instructions <a class="header-anchor" href="#native-messages-and-instructions" aria-label="Permalink to &quot;Native messages and instructions&quot;">​</a></h2><p>Core exports the unchanged native SDK types <code>SystemModelMessage</code>, <code>UserModelMessage</code>, <code>AssistantModelMessage</code>, <code>ModelMessage</code>, <code>UserContent</code>, <code>AssistantContent</code>, <code>TextPart</code>, <code>ImagePart</code> and <code>FilePart</code>. App re-exports these through its normal core barrel. System content is a string; user/assistant multipart content and provider options retain their native SDK types.</p><p><code>AgentInstruction</code> is the union of native system/user/assistant messages; <code>AgentInstructions</code> accepts a string or readonly array of that union. Tool roles and a single-object shorthand are refused. Leading system blocks use SDK instructions; all remaining configured messages stay ordered in a transient prefix. Skills runtime metadata adds a separate system block, while manual catalog metadata stays a string. Prefixes hydrate files without entering checkpoints or pending-tool replay; restored transcript system roles are rejected. See the <a href="/guide/agents#instructions">typed instructions example</a>.</p><h2 id="permissions" tabindex="-1">Permissions <a class="header-anchor" href="#permissions" aria-label="Permalink to &quot;Permissions&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> requireToolPermission(opts?: RequireToolPermissionOptions): ToolPolicy;</span></span></code></pre></div><p><code>requireToolPermission()</code> offers a tool when the run&#39;s invoker holds <code>chamvi_tool_use</code> for <code>{ agent, name }</code> (the agent and the tool), checked with <code>can()</code> of <code>@chamvi/access</code> at the engine clock&#39;s time; runs without an invoker follow <code>withoutInvoker</code> (default <code>&#39;deny&#39;</code>). An invoker&#39;s <code>permissions</code> are permission bindings (<a href="/guide/permissions">Permissions and authup</a>); an entry that is not one grants nothing. See <a href="/guide/tools#restricting-tools-per-invoker">Restricting tools per invoker</a>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IAgentRegistry } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../agent/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RequireToolPermissionOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** What a run without an invoker (cron, webhook) may use. Default \`&#39;deny&#39;\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    withoutInvoker?: </span><span style="color:#E7C58C;">&#39;allow&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;deny&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The agents a read rule decides over, passed per call (an http app&#39;s allowlisted view). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AgentScope = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    agents: IAgentRegistry;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><h2 id="channels" tabindex="-1">Channels <a class="header-anchor" href="#channels" aria-label="Permalink to &quot;Channels&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> consoleChannel(options?: ConsoleChannelOptions): IChannel;           </span><span style="color:#80858F;">// out only, name &#39;console&#39;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> normalizeEnvelope(raw: Record&lt;string, unknown&gt;): TriggerEnvelope;    </span><span style="color:#80858F;">// for repositories: legacy source/thread read back as channel/address</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> assertTriggerKey(name: string, value: string | undefined): void;     </span><span style="color:#80858F;">// 255 characters, no NUL</span></span></code></pre></div><p><code>IChannel</code>, <code>ChannelRequest</code>, <code>ChannelContext</code>, <code>ChannelDispatchEnvelope</code>, <code>DispatchResult</code>, <code>ChannelMessage</code>, <code>ChannelSendOptions</code>, <code>ChannelSubscription</code>, <code>EmitMessage</code>, <code>ChannelHandle</code>, <code>ToolChannels</code> (<code>ToolContext.channels</code>) and <code>ConsoleChannelOptions</code>:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ApprovalDecision, ApprovalRequestInput } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../approval/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ApprovalOption, TriggerEnvelope } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core-kit&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ConversationTarget } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../conversation/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { DispatchEnvelope, IEngine } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../engine/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The HTTP input of a channel: the raw web request (body unread) and the raw subpath after \`/channels/&lt;name&gt;\`. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ChannelRequest = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    request: Request;</span></span>
<span class="line"><span style="color:#E3E5EA;">    subpath: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** What a channel may dispatch: the engine sets \`channel\` to the channel&#39;s own name. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ChannelDispatchEnvelope = Omit&lt;DispatchEnvelope, </span><span style="color:#E7C58C;">&#39;channel&#39;</span><span style="color:#E3E5EA;">&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** What \`engine.dispatch()\` resolves. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> DispatchResult = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    runId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    deduplicated: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ChannelContext = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    engine: IEngine;</span></span>
<span class="line"><span style="color:#80858F;">    /** engine.dispatch with \`channel\` set to this channel&#39;s name (a channel cannot dispatch as another). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    dispatch(envelope: ChannelDispatchEnvelope): Promise&lt;DispatchResult&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** Trusted, registered-channel intake; the channel supplies canonical identity and accepted text. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    dispatchConversation(envelope: ChannelDispatchEnvelope, target: ConversationTarget): Promise&lt;DispatchResult&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** One outbound message; \`key\` is stable per logical message and the transport&#39;s dedupe key. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ChannelMessage = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    kind: </span><span style="color:#E7C58C;">&#39;message&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;approval&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    key: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    runId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    title?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    body: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Named persistent message where supported (GitHub); omitted messages append. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    slot?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Set for kind \`approval\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    approvalId?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Set for kind \`approval\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    expiresAt?: Date;</span></span>
<span class="line"><span style="color:#80858F;">    /** Set for kind \`approval\` with options (without their artifacts, which stay in the inbox and API). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    options?: Omit&lt;ApprovalOption, </span><span style="color:#E7C58C;">&#39;artifacts&#39;</span><span style="color:#E3E5EA;">&gt;[];</span></span>
<span class="line"><span style="color:#80858F;">    /** Set (true) for kind \`approval\` with options of which several may be selected. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    multiple?: boolean;</span></span>
<span class="line"><span style="color:#80858F;">    /** Set for kind \`approval\` when the body is a generic notification; the request&#39;s details stay in the inbox and API. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    generic?: true;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ChannelSendOptions = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    signal: AbortSignal;</span></span>
<span class="line"><span style="color:#80858F;">    /** The run&#39;s stored envelope: a transport may read the source payload, never write it. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    trigger: TriggerEnvelope;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * What a channel&#39;s optional \`status()\` answers, in epoch milliseconds; each</span></span>
<span class="line"><span style="color:#80858F;"> * time is absent until it happened (\`runningSince\` while a pass is in flight).</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ChannelStatus = {</span></span>
<span class="line"><span style="color:#80858F;">    /** The last pass that completed without error ended. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    lastSuccessAt?: number;</span></span>
<span class="line"><span style="color:#80858F;">    /** The last pass that failed ended. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    lastErrorAt?: number;</span></span>
<span class="line"><span style="color:#80858F;">    /** The last pass ended, however it ended. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    lastRunAt?: number;</span></span>
<span class="line"><span style="color:#80858F;">    /** The pass in flight started. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    runningSince?: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * Anything a run can come from or talk to. The presence of \`start\`, \`in\`</span></span>
<span class="line"><span style="color:#80858F;"> * and \`out\` is the only capability; \`name\` follows the agent-name rules</span></span>
<span class="line"><span style="color:#80858F;"> * and is unique per engine.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> interface</span><span style="color:#E3E5EA;"> IChannel&lt;TInput = ChannelRequest, TOutput = Response&gt; {</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> name: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Intake authored by external parties taints every triggered run. */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> untrusted?: boolean;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Where \`emit()\` and \`approve()\` send when the tool names no address and</span></span>
<span class="line"><span style="color:#80858F;">     * the run did not come from this channel (e.g. OpenClaw&#39;s \`deliver.to\`);</span></span>
<span class="line"><span style="color:#80858F;">     * a non-empty string. Without it such a call needs an address.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> defaultAddress?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Background inbound (cron ticks, sockets, polling); called by engine.start() after the first recover. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    start?(ctx: ChannelContext): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** Called first by engine.drain() and engine.stop(): no new inbound. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    stop?(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** The channel&#39;s single inbound entry; transports feed it (the http route, a socket loop, tests). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    in?(input: TInput, ctx: ChannelContext): Promise&lt;TOutput&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** Sends a message to an address the channel defines; idempotent on \`message.key\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    out?(message: ChannelMessage, address: string, opts: ChannelSendOptions): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Throws (a ValidationError) when \`out\` would refuse \`message\` to</span></span>
<span class="line"><span style="color:#80858F;">     * \`address\`: an approval request the channel cannot deliver fails the</span></span>
<span class="line"><span style="color:#80858F;">     * tool call instead of leaving the run waiting. It checks only what is</span></span>
<span class="line"><span style="color:#80858F;">     * known before sending (the rendering, the target); a delivery failure,</span></span>
<span class="line"><span style="color:#80858F;">     * such as an offline channel, keeps the approval waiting and retried.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    fits?(message: ChannelMessage, address: string): void | Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Whether \`address\` reaches the owner alone (a direct message): a tool</span></span>
<span class="line"><span style="color:#80858F;">     * limit&#39;s private \`detail\` goes to the source of a tainted run only then.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    direct?(address: string): boolean | Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** The status of its background work (\`GET /components\`); synchronous and cheap. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    status?(): ChannelStatus;</span></span>
<span class="line"><span style="color:#E3E5EA;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * An agent&#39;s subscription to a channel (replaces the trigger definition):</span></span>
<span class="line"><span style="color:#80858F;"> * \`channel\` names a channel registered on the engine, \`id\` is unique</span></span>
<span class="line"><span style="color:#80858F;"> * within the agent, \`options\` belong to the channel.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ChannelSubscription&lt;P = unknown&gt; = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    channel: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    id: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Shared-store execution cap within this agent; omitted or false adds no cap. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    concurrencyMaxRuns?: number | false;</span></span>
<span class="line"><span style="color:#E3E5EA;">    options: Record&lt;string, unknown&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    // method signatures (bivariant): a ChannelSubscription&lt;P&gt; fits AgentDefinition.channels</span></span>
<span class="line"><span style="color:#E3E5EA;">    concurrencyKey?(payload: P): string | undefined;</span></span>
<span class="line"><span style="color:#E3E5EA;">    idempotencyKey?(payload: P): string | undefined;</span></span>
<span class="line"><span style="color:#80858F;">    /** The run&#39;s address from its payload; read by the agent channel only (\`agent.on()\`). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    address?(payload: P): string | undefined;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A message a tool emits; \`key\` overrides the content-addressed dedupe key. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> EmitMessage = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    title?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    body: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    key?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Named persistent message where supported (GitHub); omitted messages append. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    slot?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * A channel bound to the run (\`ToolContext.channels\`). \`address\` is</span></span>
<span class="line"><span style="color:#80858F;"> * the run&#39;s source address when this is the run&#39;s source channel, else the</span></span>
<span class="line"><span style="color:#80858F;"> * channel&#39;s \`defaultAddress\`.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ChannelHandle = {</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> name: string;</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> address?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Sends \`message\` through the channel&#39;s \`out\` to \`address\` (default: the</span></span>
<span class="line"><span style="color:#80858F;">     * bound address), at most once per key; only inside a tool call.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    emit(message: EmitMessage, address?: string): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Whether the bound address reaches the owner alone: true only when the</span></span>
<span class="line"><span style="color:#80858F;">     * channel implements \`direct()\` and it answers true for that address;</span></span>
<span class="line"><span style="color:#80858F;">     * false without an address and when \`direct()\` throws.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    direct(): Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** Asks the owner to approve, durably (suspends the tool call until answered). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    approve(request: ApprovalRequestInput &amp; { address?: string; slot?: string }): Promise&lt;ApprovalDecision&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * \`ToolContext.channels\`: run-bound handles on the engine&#39;s channels with</span></span>
<span class="line"><span style="color:#80858F;"> * \`out\`. On the run&#39;s source channel a handle defaults to the source address.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ToolChannels = {</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The channel \`name\` (default: the run&#39;s source channel); undefined when</span></span>
<span class="line"><span style="color:#80858F;">     * the engine has no such channel or it has no \`out\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    findOne(name?: string): ChannelHandle | undefined;</span></span>
<span class="line"><span style="color:#80858F;">    /** As findOne(), but ChannelNotFoundError instead of undefined. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    findOneOrFail(name?: string): ChannelHandle;</span></span>
<span class="line"><span style="color:#80858F;">    /** Every engine channel with \`out\`, in registration order. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    find(): ChannelHandle[];</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ConsoleChannelOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Default \`&#39;console&#39;\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    name?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Receives each line; default \`console.log\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    write?: (line: string) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> void;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><p><code>consoleChannel()</code> writes <code>[chamvi] &lt;kind&gt;: &lt;title or the body&#39;s first line&gt; (agent &lt;agent&gt;, run &lt;runId&gt;, key &lt;key&gt;)</code>, then the body lines and, for an approval, with options <code>select one:</code> (or <code>select one or more:</code>) and one <code>option &lt;id&gt;: &lt;label&gt;</code> line per option, then <code>approval &lt;approvalId&gt; waits until &lt;ISO&gt;</code>, one <code>write</code> call per line. It never throws; an invalid <code>name</code> throws <code>InvalidAgentDefinitionError</code>.</p><p>The envelope (<code>TriggerEnvelope</code>, <code>Invoker</code>, from <code>@chamvi/core-kit</code>):</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { PermissionAuthorization, PermissionBinding, PermissionIdentity } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/access&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Artifact } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../artifact/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * Who started a run (or answered an approval), as an authenticator resolved</span></span>
<span class="line"><span style="color:#80858F;"> * it: a snapshot of identity and grants taken at dispatch, never a token.</span></span>
<span class="line"><span style="color:#80858F;"> * Revoking a grant later does not reach a run that already holds it.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> Invoker = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    id: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The authenticator&#39;s label: \`@chamvi/http\`&#39;s staticTokens() sets</span></span>
<span class="line"><span style="color:#80858F;">     * &#39;token&#39; and authup() sets &#39;authup&#39;; oidc() keeps the kind its</span></span>
<span class="line"><span style="color:#80858F;">     * \`principal\` mapper returns (the docs use &#39;oidc&#39;); a custom authenticator</span></span>
<span class="line"><span style="color:#80858F;">     * or a direct dispatch may use its own (e.g. &#39;user&#39;).</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    kind: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    name?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The grants, as authup permission bindings with resolved policies;</span></span>
<span class="line"><span style="color:#80858F;">     * checked with \`can()\` of \`@chamvi/access\`. An entry that is not a</span></span>
<span class="line"><span style="color:#80858F;">     * binding (a run stored with the older string grants) grants nothing.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    bindings: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> PermissionBinding[];</span></span>
<span class="line"><span style="color:#80858F;">    /** authup&#39;s snapshot of the grants (plain JSON), checked together with \`identity\`; set for authup logins. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    authorization?: PermissionAuthorization;</span></span>
<span class="line"><span style="color:#80858F;">    /** What an \`identity\` policy evaluates; set for authup logins. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    identity?: PermissionIdentity;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * The run that dispatched this one. Only the engine-internal host sets it;</span></span>
<span class="line"><span style="color:#80858F;"> * a dispatch() envelope never carries one, so no caller forges lineage.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> DispatchParent = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    kind: </span><span style="color:#E7C58C;">&#39;dispatch&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    runId: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The parent run&#39;s agent. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The dispatch role of the child agent this run was started through. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    role: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    depth: number;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The one channel and address the dispatching code named for this run</span></span>
<span class="line"><span style="color:#80858F;">     * (\`dispatch(ctx, { source })\`): its outbound gate exempts that</span></span>
<span class="line"><span style="color:#80858F;">     * destination like a run&#39;s own source. Never from a generated dispatch tool.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    source?: TriggerSource;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * The run of another chamvi app that started this one through a peer. Its</span></span>
<span class="line"><span style="color:#80858F;"> * ids name runs of that app, so the run gets no \`parentRunId\`.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> PeerParent = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    kind: </span><span style="color:#E7C58C;">&#39;peer&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#80858F;">    /** The peer name, taken from the credential the start arrived with, never from the request. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    peer: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The calling run on the peer. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    runId: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The stand-in run on the peer that waits on this run (the wake target). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    standIn: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The calling run&#39;s agent on the peer. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The \`agent.on()\` role this run was started through. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    role: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    depth: number;</span></span>
<span class="line"><span style="color:#80858F;">    /** The name of the person behind the call, for display only; never a grant. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    origin?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Where a run came from when another run started it: a local dispatch or a peer. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> TriggerParent = DispatchParent | PeerParent;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A channel and an address on it, as \`dispatch()\`&#39;s \`source\` names it. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> TriggerSource = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    channel: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    address: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> TriggerEnvelope&lt;P = unknown&gt; = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    id: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The id of the agent&#39;s subscription that started the run. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    trigger: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The name of the channel the run came from. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    channel: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    payload: P;</span></span>
<span class="line"><span style="color:#E3E5EA;">    idempotencyKey?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    concurrencyKey?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Where the run came from on that channel (an issue, a thread, a caller); the channel defines it. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    address?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Files the run was started with, stored as artifacts of the run; the model gets them as file parts. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    attachments?: Artifact[];</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Who started the run; only ever set from an authenticator (never from a</span></span>
<span class="line"><span style="color:#80858F;">     * payload). Absent for runs a channel started without one (cron, webhooks). With an invoker the</span></span>
<span class="line"><span style="color:#80858F;">     * idempotency key is scoped to it, so only the same invoker&#39;s dispatch</span></span>
<span class="line"><span style="color:#80858F;">     * is deduplicated (and gets its own first run).</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    invoker?: Invoker;</span></span>
<span class="line"><span style="color:#80858F;">    /** The run that started this one; set only by dispatch() or the peer intake, never from engine.dispatch(). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    parent?: TriggerParent;</span></span>
<span class="line"><span style="color:#E3E5EA;">    receivedAt: Date;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><p><code>agent.on()</code> (dispatch roles) is in core, see <a href="#dispatch">Dispatch</a>. The other subscription builders live in the channel packages: <code>http.on()</code> and <code>webhook.on()</code> in <a href="/reference/http"><code>@chamvi/http</code></a>, <code>cron.on()</code> in <a href="/reference/channel-cron"><code>@chamvi/channel-cron</code></a>, <code>github.on()</code> in <a href="/reference/github"><code>@chamvi/github</code></a>. See <a href="/guide/channels">Channels &amp; the Envelope</a>.</p><h2 id="engine" tabindex="-1">Engine <a class="header-anchor" href="#engine" aria-label="Permalink to &quot;Engine&quot;">​</a></h2><p>Use <code>IEngine</code> for engine type annotations and <code>Engine</code> for construction or extension. <code>IEngine</code> describes every public engine member and extends <code>IContextProvider</code>; it is also re-exported by <code>@chamvi/app</code>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">class</span><span style="color:#E3E5EA;"> Engine {</span></span>
<span class="line"><span style="color:#8EA7FF;">    constructor</span><span style="color:#E3E5EA;">(opts: EngineOptions);</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> clock: IClock;</span></span>
<span class="line"><span style="color:#E3E5EA;">    getAgent(name: string): Agent | undefined;</span></span>
<span class="line"><span style="color:#E3E5EA;">    listAgents(): Agent[];</span></span>
<span class="line"><span style="color:#E3E5EA;">    getChannel(name: string): IChannel | undefined;</span></span>
<span class="line"><span style="color:#E3E5EA;">    listChannels(): IChannel[];</span></span>
<span class="line"><span style="color:#E3E5EA;">    putAgent(agent: Agent, options?: { revision?: string; formerRevision?: string; reload?: boolean; signal?: AbortSignal }): Promise&lt;</span><span style="color:#E7C58C;">&#39;added&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;replaced&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;unchanged&#39;</span><span style="color:#E3E5EA;">&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    checkAgent(agent: Agent): void;</span></span>
<span class="line"><span style="color:#E3E5EA;">    removeAgent(name: string): Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    releaseRevision(name: string): Promise&lt;string[] | undefined&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    agentRevision(name: string): string | undefined;</span></span>
<span class="line"><span style="color:#E3E5EA;">    provide&lt;T&gt;(key: ContextKey&lt;T&gt;, value: T): void; </span><span style="color:#80858F;">// IContextProvider, see Context</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    dispatch(envelope: DispatchEnvelope): Promise&lt;{ runId: string; deduplicated: boolean }&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    getRun(id: string): Promise&lt;Run | undefined&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    on&lt;T </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> EngineEvent[</span><span style="color:#E7C58C;">&#39;type&#39;</span><span style="color:#E3E5EA;">]&gt;(event: T, listener: (e: Extract&lt;EngineEvent, { type: T }&gt;) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> void): () </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> void;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    start(options?: { channels?: boolean }): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    stop(): void;</span></span>
<span class="line"><span style="color:#E3E5EA;">    drain(opts?: { timeoutMs?: number }): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    idle(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> isDraining: boolean;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    cancel(runId: string): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    approve(runId: string, answer: ApprovalAnswer): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    tick(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    recover(): Promise&lt;number&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">}</span></span></code></pre></div><table tabindex="0"><thead><tr><th>Method</th><th>Description</th><th>Guide</th></tr></thead><tbody><tr><td><code>store</code>, <code>clock</code></td><td>The store and clock the engine was built with (<code>clock</code> defaults to <code>systemClock</code>)</td><td></td></tr><tr><td><code>getAgent</code>, <code>listAgents</code></td><td>One registered agent by name; all of them in registration order (a new array), read at call time</td><td></td></tr><tr><td><code>getChannel</code>, <code>listChannels</code></td><td>One registered channel by name; all of them in registration order</td><td><a href="/guide/channels">Channels</a></td></tr><tr><td><code>putAgent</code></td><td>Registers an agent or replaces the one of the same name in place (a new one goes last); refuses a subscription to an unknown channel like the constructor. Replacing cancels the agent&#39;s unsettled runs created before now. With a <code>revision</code> (a folder&#39;s content hash) the store&#39;s marker is brought to it under the lock <code>agents:&lt;name&gt;</code> instead, cancelling once across replicas and only when a marker existed (swept before and again after the marker write; no run of the agent starts on this engine meanwhile). Each cancelled run stores <code>agent_replaced</code> as its <code>error</code> (<a href="/guide/errors#run-errors">Errors</a>), and the sweep emits <code>agents.cancelled</code>. With <code>reload: false</code> (a process that never reloads, a job) nothing is cancelled: a missing marker is written, a different one moved only while the agent has no unsettled run, else <code>InvalidRunStateError</code> and the agent stays unregistered. A marker at <code>formerRevision</code> (the same content hashed by an earlier algorithm) counts as equal and is moved to <code>revision</code> without a cancel. Optional <code>signal</code> cancels preparation and rejects with its reason before registry mutation, retaining the previous agent, marker and runs. Once the registry operation starts, cancellation waits for consistent completion and local publication. Resolves <code>unchanged</code> (no event) for the same agent object at the same revision</td><td><a href="/guide/agent-folders">Agent Folders</a></td></tr><tr><td><code>checkAgent</code></td><td>What <code>putAgent</code> refuses before any store access (a model that does not resolve, a subscription to an unknown channel), as <code>InvalidAgentDefinitionError</code>; registers and writes nothing</td><td><a href="/guide/agent-folders">Agent Folders</a></td></tr><tr><td><code>removeAgent</code></td><td>Unregisters the agent here first (no further dispatch), then under the same lock cancels its unsettled runs and deletes its marker (when it has one, unless this engine had it at another revision: a newer one registered elsewhere stays), or without a marker cancels the runs of an agent registered here; each cancelled run stores <code>agent_removed</code> (<a href="/guide/errors#run-errors">Errors</a>) and the sweep emits <code>agents.cancelled</code>; resolves whether it was registered here</td><td><a href="/guide/agent-folders">Agent Folders</a></td></tr><tr><td><code>releaseRevision</code></td><td>For an agent held without a revision (passed in code), clears a stored revision marker of its name left by a folder or package agent of an earlier deployment, as a revision change under the lock <code>agents:&lt;name&gt;</code>: its unsettled runs are cancelled with <code>agent_replaced</code> and the marker deleted, so no run waits for a revision no replica holds; emits <code>agents.cancelled</code>. A start of <code>@chamvi/app</code> calls it for every agent passed in code. Nothing happens without a marker, or for an agent held at a revision or not held</td><td><a href="/guide/agent-folders">Agent Folders</a></td></tr><tr><td><code>agentRevision</code></td><td>The revision an agent was registered at; <code>undefined</code> for an agent without a revision</td><td></td></tr><tr><td><code>dispatch</code></td><td>Stores a <code>queued</code> run (and its attachments as artifacts); deduplicates by <code>idempotencyKey</code> under <code>&lt;agent&gt;:&lt;channel&gt;[:&lt;kind&gt;:&lt;id&gt;]</code></td><td><a href="/guide/channels#idempotency-keys">Channels</a></td></tr><tr><td><code>getRun</code></td><td>Reads a run from the store</td><td><a href="/guide/run-lifecycle">Run Lifecycle</a></td></tr><tr><td><code>on</code></td><td>Subscribes to <code>run.updated</code>, <code>step.appended</code>, <code>run.delta</code>, <code>agents.changed</code> or <code>agents.cancelled</code> (<code>AgentRunsCancelled { name, reason: &#39;agent_replaced&#39; | &#39;agent_removed&#39;, revision?, runIds }</code>, the runs whose cancel went through: a run on another replica only gets a cancel request and may still complete); returns an unsubscribe function</td><td><a href="/guide/run-lifecycle#watching-runs">Run Lifecycle</a></td></tr><tr><td><code>start</code></td><td>Recovers, starts every channel (unless <code>{ channels: false }</code>; a throwing <code>start</code> stops those already started and rejects), starts polling and starts queued runs: only runs of an agent it holds, a folder agent only at the stored revision (the others stay <code>queued</code>)</td><td><a href="/guide/recovery">Recovery</a></td></tr><tr><td><code>stop</code></td><td>Stops every channel, then polling only</td><td><a href="/guide/recovery">Recovery</a></td></tr><tr><td><code>drain</code></td><td>Stops every channel first (a throwing <code>stop</code> goes to <code>onError</code>), waits for in-flight runs (default 30 s), then marks the rest <code>interrupted</code></td><td><a href="/guide/recovery#drain">Recovery</a></td></tr><tr><td><code>idle</code></td><td>Resolves when nothing runs and nothing more can start</td><td></td></tr><tr><td><code>cancel</code></td><td>Cancels locally, in the store, or requests it from the owning replica</td><td><a href="/guide/recovery#cancel">Recovery</a></td></tr><tr><td><code>approve</code></td><td>Answers the current wait point by <code>approvalId</code>, once</td><td><a href="/guide/approvals#answering">Approvals</a></td></tr><tr><td><code>tick</code></td><td>Denies expired approvals and re-sends approval messages a channel has not delivered; runs every poll</td><td><a href="/guide/approvals#asking-through-a-channel">Approvals</a></td></tr><tr><td><code>recover</code></td><td>Requeues abandoned runs; runs on start and every poll</td><td><a href="/guide/recovery#recovery">Recovery</a></td></tr></tbody></table><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { LanguageModel, TranscriptionModel } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;ai&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Agent } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../agent/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IArtifactService } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../artifact/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> {</span></span>
<span class="line"><span style="color:#E3E5EA;">    ArtifactInput,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ConversationIdentity,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ConversationScope,</span></span>
<span class="line"><span style="color:#E3E5EA;">    Invoker,</span></span>
<span class="line"><span style="color:#E3E5EA;">    PeerStartInput,</span></span>
<span class="line"><span style="color:#E3E5EA;">    Run,</span></span>
<span class="line"><span style="color:#E3E5EA;">    Step,</span></span>
<span class="line"><span style="color:#E3E5EA;">    TriggerEnvelope,</span></span>
<span class="line"><span style="color:#E3E5EA;">} </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core-kit&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ChannelContext, DispatchResult, IChannel } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../channel/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IClock } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../clock/index.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IContextProvider } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../context/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ConversationInspection, ConversationOptions, IConversationService  } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../conversation/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IModelResolver, ModelRef, TranscriptionModelRef } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../model/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IPeerResolver } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../peer/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { SkillInput } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../skill/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IAgentRevisionService } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../agent-revision/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IConnectionService } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../connection/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ICheckpointService } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../checkpoint/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IEffectService } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../effect/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IIdempotencyService } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../idempotency/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ILimitService } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../limit/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ILockService } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../lock/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IRunService } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../run/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IStateService } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../state/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IStepService } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../step/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Public engine contract; use Engine only for construction or extension. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> interface</span><span style="color:#E3E5EA;"> IEngine </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> IContextProvider {</span></span>
<span class="line"><span style="color:#80858F;">    /** The rules of runs over the run repository. */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> runService: IRunService;</span></span>
<span class="line"><span style="color:#80858F;">    /** The steps of runs over the step repository. */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> stepService: IStepService;</span></span>
<span class="line"><span style="color:#80858F;">    /** The latest checkpoint of each run over the checkpoint repository. */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> checkpointService: ICheckpointService;</span></span>
<span class="line"><span style="color:#80858F;">    /** Recorded effect results over the effect repository. */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> effectService: IEffectService;</span></span>
<span class="line"><span style="color:#80858F;">    /** The files of runs over the artifact repository. */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> artifactService: IArtifactService;</span></span>
<span class="line"><span style="color:#80858F;">    /** Agent state over the key-value and document repositories. */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> stateService: IStateService;</span></span>
<span class="line"><span style="color:#80858F;">    /** The revision markers of folder agents over the agent revision repository. */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> agentRevisionService: IAgentRevisionService;</span></span>
<span class="line"><span style="color:#80858F;">    /** Leases on keys over the lock repository (keyed runs, admission, the registry, approval deliveries). */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> lockService: ILockService;</span></span>
<span class="line"><span style="color:#80858F;">    /** The idempotency keys of dispatches over the idempotency repository. */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> idempotencyService: IIdempotencyService;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Connections over the connection repository, when the store keeps</span></span>
<span class="line"><span style="color:#80858F;">     * them; the engine itself uses none, code that holds an engine</span></span>
<span class="line"><span style="color:#80858F;">     * (\`createHttpApp\`) reads them through it.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> connectionService: IConnectionService | undefined;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The counted uses of tool limits over the limit repository, when the</span></span>
<span class="line"><span style="color:#80858F;">     * engine has it; an agent with \`limits\` needs it.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> limitService: ILimitService | undefined;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Conversations over the conversation repository, when the store keeps</span></span>
<span class="line"><span style="color:#80858F;">     * them; the conversation capability (\`conversations\`) needs it.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> conversationService: IConversationService | undefined;</span></span>
<span class="line"><span style="color:#80858F;">    /** The configured peers remote agents run at, when the app has any. */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> peers: IPeerResolver | undefined;</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> clock: IClock;</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> isDraining: boolean;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    dispatch(envelope: DispatchEnvelope): Promise&lt;{ runId: string; deduplicated: boolean }&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Starts a run a peer asked for: the peer is the one \`peers.recognize()\`</span></span>
<span class="line"><span style="color:#80858F;">     * names for \`envelope.invoker\`, the target its \`agent.on()\` role</span></span>
<span class="line"><span style="color:#80858F;">     * \`fields.role\`, checked like a local cross-agent dispatch (\`from\` entry</span></span>
<span class="line"><span style="color:#80858F;">     * \`&lt;peer&gt;/&lt;parent.agent&gt;\`); a refusal writes nothing (an unknown or</span></span>
<span class="line"><span style="color:#80858F;">     * ungranted agent: AgentNotFoundError, else ValidationError).</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    dispatchPeer(envelope: DispatchEnvelope, fields: PeerStartInput[</span><span style="color:#E7C58C;">&#39;peer&#39;</span><span style="color:#E3E5EA;">] &amp; { role: string }): Promise&lt;DispatchResult&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    inspectConversation(identity: ConversationIdentity, query?: { limit?: number; offset?: number }): Promise&lt;ConversationInspection | undefined&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    resetConversation(identity: ConversationIdentity, options?: { keepNotes?: boolean }): Promise&lt;ConversationScope&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    deleteConversation(identity: ConversationIdentity): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    pruneConversations(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The LanguageModel for \`ref\`, else the model of \`agent\` in the live</span></span>
<span class="line"><span style="color:#80858F;">     * registry, else the default (EngineOptions.model): a model outside a</span></span>
<span class="line"><span style="color:#80858F;">     * tool call (e.g. a channel&#39;s). A string goes through</span></span>
<span class="line"><span style="color:#80858F;">     * EngineOptions.models; without a resolver, or with no model at all,</span></span>
<span class="line"><span style="color:#80858F;">     * it is an InvalidAgentDefinitionError.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    resolveModel(ref?: ModelRef, agent?: string): LanguageModel;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The TranscriptionModel for \`ref\` (e.g. a channel&#39;s voice model): an</span></span>
<span class="line"><span style="color:#80858F;">     * object as is, a string through EngineOptions.models&#39; \`transcription()\`;</span></span>
<span class="line"><span style="color:#80858F;">     * without a resolver or transcription models it is an</span></span>
<span class="line"><span style="color:#80858F;">     * InvalidAgentDefinitionError.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    resolveTranscriptionModel(ref: TranscriptionModelRef): TranscriptionModel;</span></span>
<span class="line"><span style="color:#E3E5EA;">    getAgent(name: string): Agent | undefined;</span></span>
<span class="line"><span style="color:#E3E5EA;">    listAgents(): Agent[];</span></span>
<span class="line"><span style="color:#E3E5EA;">    channelContext(channel: IChannel): ChannelContext;</span></span>
<span class="line"><span style="color:#E3E5EA;">    getChannel(name: string): IChannel | undefined;</span></span>
<span class="line"><span style="color:#E3E5EA;">    listChannels(): IChannel[];</span></span>
<span class="line"><span style="color:#E3E5EA;">    agentRevision(name: string): string | undefined;</span></span>
<span class="line"><span style="color:#E3E5EA;">    putAgent(agent: Agent, options?: {</span></span>
<span class="line"><span style="color:#E3E5EA;">        revision?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">        formerRevision?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">        reload?: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">        signal?: AbortSignal;</span></span>
<span class="line"><span style="color:#E3E5EA;">    }): Promise&lt;</span><span style="color:#E7C58C;">&#39;added&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;replaced&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;unchanged&#39;</span><span style="color:#E3E5EA;">&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    removeAgent(name: string): Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    releaseRevision(name: string): Promise&lt;string[] | undefined&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    getRun(id: string): Promise&lt;Run | undefined&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    on&lt;T </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> EngineEvent[</span><span style="color:#E7C58C;">&#39;type&#39;</span><span style="color:#E3E5EA;">]&gt;(event: T, listener: (e: Extract&lt;EngineEvent, { type: T }&gt;) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> void): () </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> void;</span></span>
<span class="line"><span style="color:#E3E5EA;">    prepare(options?: { signal?: AbortSignal; agents?: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> Agent[] }): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    start(options?: EngineStartOptions): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    stop(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    recover(): Promise&lt;number&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    drain(options?: { timeoutMs?: number }): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    idle(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    cancel(runId: string): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    approve(runId: string, answer: ApprovalAnswer): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * A peer&#39;s content-free wake of stand-in \`runId\` waiting on the peer</span></span>
<span class="line"><span style="color:#80858F;">     * \`invoker\` authenticates as (the next tick polls it at once): \`marked\`</span></span>
<span class="line"><span style="color:#80858F;">     * when this call set the mark, \`pending\` when it was set already;</span></span>
<span class="line"><span style="color:#80858F;">     * \`undefined\`, with nothing written, for any other run or invoker.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    wake(runId: string, invoker: Invoker | undefined): Promise&lt;WakeOutcome | undefined&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    tick(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    checkAgent(agent: Agent): void;</span></span>
<span class="line"><span style="color:#E3E5EA;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * A piece of model output while it streams; never stored. \`step\` is the</span></span>
<span class="line"><span style="color:#80858F;"> * checkpoint step index the step it belongs to is saved under.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RunDelta = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    runId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    step: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">    kind: </span><span style="color:#E7C58C;">&#39;text&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;reasoning&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    text: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RunEvent = { type: </span><span style="color:#E7C58C;">&#39;run.updated&#39;</span><span style="color:#E3E5EA;">; run: Run } |</span></span>
<span class="line"><span style="color:#E3E5EA;">    { type: </span><span style="color:#E7C58C;">&#39;step.appended&#39;</span><span style="color:#E3E5EA;">; step: Step } |</span></span>
<span class="line"><span style="color:#E3E5EA;">    { type: </span><span style="color:#E7C58C;">&#39;run.delta&#39;</span><span style="color:#E3E5EA;">; delta: RunDelta };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** An agent was added, replaced or removed on this engine; local like the run events. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AgentChange = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    type: </span><span style="color:#E7C58C;">&#39;agents.changed&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    name: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    kind: </span><span style="color:#E7C58C;">&#39;added&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;replaced&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;removed&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * The unsettled runs a registry change cancelled: a revision change or a</span></span>
<span class="line"><span style="color:#80858F;"> * replaced agent without a revision (\`agent_replaced\`), a removal (\`agent_removed\`).</span></span>
<span class="line"><span style="color:#80858F;"> * Emitted once per sweep, by the engine that swept (so once across replicas),</span></span>
<span class="line"><span style="color:#80858F;"> * also with no run ids. \`runIds\` are the runs whose cancel went through,</span></span>
<span class="line"><span style="color:#80858F;"> * which is a request for a run executing on another replica (it may still</span></span>
<span class="line"><span style="color:#80858F;"> * complete before that replica sees it) or being drained here (it settles</span></span>
<span class="line"><span style="color:#80858F;"> * \`interrupted\`).</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AgentRunsCancelled = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    type: </span><span style="color:#E7C58C;">&#39;agents.cancelled&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    name: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    reason: </span><span style="color:#E7C58C;">&#39;agent_replaced&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;agent_removed&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#80858F;">    /** The revision the agent was reloaded at (a folder agent&#39;s replacement only). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    revision?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The runs whose cancel went through (cancelled, or a cancel requested; see above). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    runIds: string[];</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Every event Engine.on() delivers. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> EngineEvent = RunEvent | AgentChange | AgentRunsCancelled;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> EngineOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Runs: built on the same clock as the engine&#39;s (\`clock\`). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    runService: IRunService;</span></span>
<span class="line"><span style="color:#E3E5EA;">    stepService: IStepService;</span></span>
<span class="line"><span style="color:#E3E5EA;">    checkpointService: ICheckpointService;</span></span>
<span class="line"><span style="color:#E3E5EA;">    effectService: IEffectService;</span></span>
<span class="line"><span style="color:#E3E5EA;">    artifactService: IArtifactService;</span></span>
<span class="line"><span style="color:#E3E5EA;">    stateService: IStateService;</span></span>
<span class="line"><span style="color:#E3E5EA;">    agentRevisionService: IAgentRevisionService;</span></span>
<span class="line"><span style="color:#80858F;">    /** Leases: built on the same clock as the engine&#39;s (\`clock\`). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    lockService: ILockService;</span></span>
<span class="line"><span style="color:#80858F;">    /** Dispatch idempotency keys: built on the same clock as the engine&#39;s (\`clock\`). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    idempotencyService: IIdempotencyService;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Connections, when the store keeps them (optional); the engine uses</span></span>
<span class="line"><span style="color:#80858F;">     * none, it exposes the service to code that holds the engine. Its</span></span>
<span class="line"><span style="color:#80858F;">     * fence reads the lock rows \`lockService\` writes.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    connectionService?: IConnectionService;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The counted uses of tool limits (optional): an agent with non-empty</span></span>
<span class="line"><span style="color:#80858F;">     * \`limits\` is refused without it; built on the engine&#39;s clock, its</span></span>
<span class="line"><span style="color:#80858F;">     * check locks through \`lockService\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    limitService?: ILimitService;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Conversations, when the store keeps them (optional): required by the</span></span>
<span class="line"><span style="color:#80858F;">     * conversation capability (\`conversations\`), built on the engine&#39;s</span></span>
<span class="line"><span style="color:#80858F;">     * clock.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    conversationService?: IConversationService;</span></span>
<span class="line"><span style="color:#E3E5EA;">    agents: Agent[];</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> skills?: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> SkillInput[];</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The channels runs come from and talk to; names unique. start() starts</span></span>
<span class="line"><span style="color:#80858F;">     * them after the first recover, drain() and stop() stop them first.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    channels?: IChannel&lt;any, any&gt;[];</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The default model of agents without one; a string default is checked</span></span>
<span class="line"><span style="color:#80858F;">     * through \`models\` at construction.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    model?: ModelRef;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Resolves \`&#39;&lt;provider&gt;/&lt;model id&gt;&#39;\` strings. Registration (constructor,</span></span>
<span class="line"><span style="color:#80858F;">     * putAgent) checks every string ref through it; without it a string ref is</span></span>
<span class="line"><span style="color:#80858F;">     * an \`InvalidAgentDefinitionError\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    models?: IModelResolver;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The peers remote agents run at; registration (constructor, putAgent)</span></span>
<span class="line"><span style="color:#80858F;">     * refuses a remote agent whose peer it does not have, and any remote</span></span>
<span class="line"><span style="color:#80858F;">     * agent without it (InvalidAgentDefinitionError).</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    peers?: IPeerResolver;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The conversation capability agents with \`conversation: true\` need: the</span></span>
<span class="line"><span style="color:#80858F;">     * authorizer and the limits. Persistence comes from \`conversationService\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    conversations?: ConversationOptions;</span></span>
<span class="line"><span style="color:#80858F;">    /** Default \`\${hostname}-\${pid}\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    owner?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Default 4. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    concurrencyMaxRuns?: number;</span></span>
<span class="line"><span style="color:#80858F;">    /** Default 60_000, renewed every ttl/3 while running. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    claimTtlMs?: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">    clock?: IClock;</span></span>
<span class="line"><span style="color:#80858F;">    /** Receives errors that have no caller to throw to. Default console.error. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    onError?: (error: unknown, run?: Run) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> void;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** What a peer&#39;s wake did to a stand-in&#39;s remote wait: set the mark, or found it set. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> WakeOutcome = </span><span style="color:#E7C58C;">&#39;marked&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;pending&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A run to create; \`parent\` is no field: only the dispatch host (dispatch()) sets the lineage. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> DispatchEnvelope = Omit&lt;TriggerEnvelope, </span><span style="color:#E7C58C;">&#39;id&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;receivedAt&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;attachments&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;parent&#39;</span><span style="color:#E3E5EA;">&gt; &amp;</span></span>
<span class="line"><span style="color:#E3E5EA;">    Partial&lt;Pick&lt;TriggerEnvelope, </span><span style="color:#E7C58C;">&#39;id&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;receivedAt&#39;</span><span style="color:#E3E5EA;">&gt;&gt; &amp; {</span></span>
<span class="line"><span style="color:#80858F;">        /** Files to start the run with; stored as artifacts of the run before it is created. */</span></span>
<span class="line"><span style="color:#E3E5EA;">        attachments?: ArtifactInput[];</span></span>
<span class="line"><span style="color:#80858F;">        /**</span></span>
<span class="line"><span style="color:#80858F;">         * The agent object the caller&#39;s permission check saw; never stored.</span></span>
<span class="line"><span style="color:#80858F;">         * Another registered object for the name refuses the dispatch</span></span>
<span class="line"><span style="color:#80858F;">         * (AgentReplacedError) before any store write; a replacement while</span></span>
<span class="line"><span style="color:#80858F;">         * the run is created cancels that run (\`agent_replaced\`).</span></span>
<span class="line"><span style="color:#80858F;">         */</span></span>
<span class="line"><span style="color:#E3E5EA;">        checked?: Agent;</span></span>
<span class="line"><span style="color:#E3E5EA;">    };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** An answer to the run&#39;s current wait point (\`Engine.approve()\`). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ApprovalAnswer = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Must equal \`run.waiting.approvalId\`, else InvalidRunStateError. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    approvalId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    approved: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">    reason?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Who answered; recorded on the wait step (\\\`output.approver\\\`). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    approver?: Invoker;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The chosen option ids of a wait point with options: exactly one for a</span></span>
<span class="line"><span style="color:#80858F;">     * single choice, at least one for a multiple choice; none on a denial.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    selected?: string[];</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> EngineStartOptions = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    signal?: AbortSignal;</span></span>
<span class="line"><span style="color:#80858F;">    /** Default true; false starts no channel (a one-shot job never starts schedules or sockets). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    channels?: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><table tabindex="0"><thead><tr><th>Option</th><th>Default</th></tr></thead><tbody><tr><td><code>channels</code></td><td><code>[]</code></td></tr><tr><td><code>owner</code></td><td><code>\`\${hostname}-\${pid}\`</code></td></tr><tr><td><code>concurrencyMaxRuns</code></td><td><code>4</code></td></tr><tr><td><code>claimTtlMs</code></td><td><code>60_000</code>, renewed and polled every <code>claimTtlMs / 3</code></td></tr><tr><td><code>clock</code></td><td><code>systemClock</code></td></tr><tr><td><code>onError</code></td><td>logs to <code>console.error</code></td></tr></tbody></table><h2 id="runs" tabindex="-1">Runs <a class="header-anchor" href="#runs" aria-label="Permalink to &quot;Runs&quot;">​</a></h2><p><code>RunContext</code>:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { EntityFindManyResult, IRunRepository } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/store&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IFilter, IQuery } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@rapiq/core&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> {</span></span>
<span class="line"><span style="color:#E3E5EA;">    Run,</span></span>
<span class="line"><span style="color:#E3E5EA;">    RunStatusLiteral,</span></span>
<span class="line"><span style="color:#E3E5EA;">    TriggerEnvelope,</span></span>
<span class="line"><span style="color:#E3E5EA;">    WaitPoint,</span></span>
<span class="line"><span style="color:#E3E5EA;">} </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core-kit&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ActorContext } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../actor/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IClock } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../clock/index.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { AgentScope } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../permission/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RunContext = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    runId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    trigger: TriggerEnvelope;</span></span>
<span class="line"><span style="color:#80858F;">    /** Aborts on cancel, drain, a lost lease or the run timeout, and once the execution has ended. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    signal: AbortSignal;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RunServiceContext = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    repository: IRunRepository;</span></span>
<span class="line"><span style="color:#E3E5EA;">    clock: IClock;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RunFindOptions = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Only the runs of these agents (an empty list matches none; an AND with \`agent\`). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    agents?: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> string[];</span></span>
<span class="line"><span style="color:#E3E5EA;">    status?: RunStatusLiteral[];</span></span>
<span class="line"><span style="color:#E3E5EA;">    concurrencyKey?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Only these run ids (an empty list matches none). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    ids?: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> string[];</span></span>
<span class="line"><span style="color:#80858F;">    /** Only the runs dispatched by this run (\`Run.parentRunId\`). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    parentRunId?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Only the runs dispatched by one of these runs (an empty list matches none). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    parentRunIds?: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> string[];</span></span>
<span class="line"><span style="color:#80858F;">    /** Only the runs dispatched by some run (\`true\`, \`Run.parentRunId\` set) or by none (\`false\`). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    hasParent?: boolean;</span></span>
<span class="line"><span style="color:#80858F;">    /** Only the runs whose wait point (\`Run.waiting\`) is of this kind. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    waitKind?: WaitPoint[</span><span style="color:#E7C58C;">&#39;kind&#39;</span><span style="color:#E3E5EA;">];</span></span>
<span class="line"><span style="color:#E3E5EA;">    limit?: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">    offset?: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">    order?: </span><span style="color:#E7C58C;">&#39;asc&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;desc&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A checked run listing (an API query, decoded): its filters, an optional agent, the page and the sorts. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RunListInput = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    filters: IFilter[];</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    limit: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">    offset: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">    sorts: Record&lt;string, </span><span style="color:#E7C58C;">&#39;ASC&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;DESC&#39;</span><span style="color:#E3E5EA;">&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RunUpdateOptions = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    expectStatus?: RunStatusLiteral[];</span></span>
<span class="line"><span style="color:#E3E5EA;">    expectOwner?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    expectWaitId?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Keep the stored updatedAt when the patch sets none (default: stamped with now), for derived fields such as subtreeUsage. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    keepUpdatedAt?: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * The operations of \`RunService\`. Anything that satisfies it can stand in</span></span>
<span class="line"><span style="color:#80858F;"> * for the service: the engine, the channels and the HTTP API take this type.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> interface</span><span style="color:#E3E5EA;"> IRunService {</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Insert-if-absent: false when a run with that id is stored (the stored</span></span>
<span class="line"><span style="color:#80858F;">     * run is left as it is). \`parentRunId\` comes from \`trigger.parent.runId\`,</span></span>
<span class="line"><span style="color:#80858F;">     * never from the caller; a parent the store does not hold is</span></span>
<span class="line"><span style="color:#80858F;">     * RunNotFoundError and nothing is written.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    create(run: Run): Promise&lt;boolean&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    findOne(id: string): Promise&lt;Run | undefined&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E3E5EA;">    findOneOrFail(id: string): Promise&lt;Run&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Throws InvalidRunStateError when \`expectStatus\` does not hold the</span></span>
<span class="line"><span style="color:#80858F;">     * current status, when \`expectOwner\` is given and the claim is absent or</span></span>
<span class="line"><span style="color:#80858F;">     * held by another owner (expiry is not checked: a lease is lost once</span></span>
<span class="line"><span style="color:#80858F;">     * taken over), or when \`expectWaitId\` is given and the wait id (\`id\`,</span></span>
<span class="line"><span style="color:#80858F;">     * else \`approvalId\`) differs. \`updatedAt\` is stamped with now unless the</span></span>
<span class="line"><span style="color:#80858F;">     * patch sets one or \`keepUpdatedAt\`; \`id\` and \`parentRunId\` never</span></span>
<span class="line"><span style="color:#80858F;">     * change; a property set to \`undefined\` is cleared.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    update(id: string, patch: Partial&lt;Run&gt;, expect?: RunUpdateOptions): Promise&lt;Run&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * update() with the patch derived from a copy of the locked row, after</span></span>
<span class="line"><span style="color:#80858F;">     * the checks (\`derive\` may throw to abort the write): a change to a</span></span>
<span class="line"><span style="color:#80858F;">     * nested field (\`waiting\`) keeps what a concurrent write stored next to it.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    updateWith(id: string, derive: (run: Run) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> Partial&lt;Run&gt;, expect?: RunUpdateOptions): Promise&lt;Run&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Ordered by createdAt, ties broken by id, both ascending (\`order\`</span></span>
<span class="line"><span style="color:#80858F;">     * \`asc\`, the default) or both descending; \`total\` ignores limit and</span></span>
<span class="line"><span style="color:#80858F;">     * offset. Without \`limit\`, every matching run (from \`offset\`).</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    find(options?: RunFindOptions): Promise&lt;{ data: Run[]; total: number }&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** As \`find\`; RepositoryNotFoundError when the selected page is empty, even with a nonzero total. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    findOrFail(options?: RunFindOptions): Promise&lt;{ data: Run[]; total: number }&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * A rapiq query over the public run fields (filters, sorts, pagination),</span></span>
<span class="line"><span style="color:#80858F;">     * for an API listing. A top-level \`waiting\` filter (\`eq\` with \`approval\`</span></span>
<span class="line"><span style="color:#80858F;">     * or \`dispatch\`) selects the runs whose wait point is of that kind; a</span></span>
<span class="line"><span style="color:#80858F;">     * \`waiting\` condition of any other shape is a ValidationError. Ordered</span></span>
<span class="line"><span style="color:#80858F;">     * by the query&#39;s sorts, then by \`id\` in the direction of the last one</span></span>
<span class="line"><span style="color:#80858F;">     * (createdAt, then id, ascending without sorts); \`meta.total\` ignores</span></span>
<span class="line"><span style="color:#80858F;">     * the pagination.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    list(query: IQuery): Promise&lt;EntityFindManyResult&lt;Run&gt;&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** Succeeds only when the run is unleased or its lease expired (at exactly \`expiresAt\`). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    claim(id: string, owner: string, ttlMs: number): Promise&lt;boolean&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** Extends the lease to now + ttlMs; only for the current, unexpired owner. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    renewClaim(id: string, owner: string, ttlMs: number): Promise&lt;boolean&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The run for the actor: RunNotFoundError for a missing run and for one</span></span>
<span class="line"><span style="color:#80858F;">     * of an agent the actor may not read under the private-agent rule (the</span></span>
<span class="line"><span style="color:#80858F;">     * same error, so run ids are not probed), else 403 \`chamvi_run_read\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    getOne(id: string, actor: ActorContext, options: AgentScope): Promise&lt;Run&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The runs of a checked listing the actor may list, else 403: one</span></span>
<span class="line"><span style="color:#80858F;">     * \`list()\` query with the permission scope (an \`agent\` filter) joined</span></span>
<span class="line"><span style="color:#80858F;">     * to the input&#39;s filters, so \`total\` and the page stay exact.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    getMany(input: RunListInput, actor: ActorContext, options: AgentScope): Promise&lt;EntityFindManyResult&lt;Run&gt;&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The run the actor may cancel: 403 without \`chamvi_run_cancel\` for some</span></span>
<span class="line"><span style="color:#80858F;">     * run, then for the found run&#39;s \`{ agent }\`; \`undefined\` for a missing run.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    getCancelable(id: string, actor: ActorContext): Promise&lt;Run | undefined&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The run the actor may answer approvals of: RunNotFoundError for a</span></span>
<span class="line"><span style="color:#80858F;">     * missing run (no read permission needed), 403 without</span></span>
<span class="line"><span style="color:#80858F;">     * \`chamvi_agent_approve\` for its agent.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    getAnswerable(id: string, actor: ActorContext, options: AgentScope): Promise&lt;Run&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">}</span></span></code></pre></div><p>The records <code>Run</code>, <code>RunStatusLiteral</code>, <code>WaitPoint</code>, <code>Usage</code>, <code>Budget</code>, <code>Step</code> and <code>Checkpoint</code>, from <code>@chamvi/core-kit</code>:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ApprovalOption } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../approval/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { AttachmentRequestBody } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../artifact/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ConversationBinding } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../conversation/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Invoker, TriggerEnvelope } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../trigger/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { RunStatus } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;./constants.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RunStatusLiteral = </span><span style="color:#E7C58C;">\`</span><span style="color:#E3E5EA;">\${</span><span style="color:#E7C58C;">RunStatus</span><span style="color:#E3E5EA;">}</span><span style="color:#E7C58C;">\`</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> Usage = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    inputTokens: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">    outputTokens: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RunTaint = { at: Date; source: string };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The approval a \`waiting\` run waits on, as approve() requested it. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ApprovalWaitPoint = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    kind: </span><span style="color:#E7C58C;">&#39;approval&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#80858F;">    /** The generic wait id, always equal to \`approvalId\` (a stored wait point without it reads back with it). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    id: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** \`&lt;stepIndex&gt;:&lt;toolCallId&gt;:&lt;n&gt;\` of the stored checkpoint&#39;s pending call: never changes after the pause. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    approvalId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    toolName: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    toolCallId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    title: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    body?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Safe channel notification instead of private approval arguments. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    notification?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The run&#39;s artifact ids shown with the request; absent when none. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    artifacts?: string[];</span></span>
<span class="line"><span style="color:#80858F;">    /** The choices of the request; absent for a plain yes or no. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    options?: ApprovalOption[];</span></span>
<span class="line"><span style="color:#80858F;">    /** Set (true) only when several options may be selected. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    multiple?: boolean;</span></span>
<span class="line"><span style="color:#80858F;">    /** The channel the request is delivered through; none for the inbox and API only. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    channel?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    address?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The named delivery slot, if requested. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    slot?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    expiresAt: Date;</span></span>
<span class="line"><span style="color:#80858F;">    /** Set once the approval message went out through \`channel\`; tick() re-sends while it is missing. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    notifiedAt?: Date;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The dispatched runs a \`waiting\` run waits on to settle. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> DispatchWaitPoint = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    kind: </span><span style="color:#E7C58C;">&#39;dispatch&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#80858F;">    /** \`&lt;stepIndex&gt;:&lt;toolCallId&gt;:w&lt;n&gt;\`: never changes after the pause. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    id: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    toolName: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    toolCallId: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The runs waited on, in the caller&#39;s order (duplicates allowed). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    runIds: string[];</span></span>
<span class="line"><span style="color:#E3E5EA;">    expiresAt: Date;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** An approval pending in a remote run or below it, as the last poll showed it. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RemoteApproval = {</span></span>
<span class="line"><span style="color:#80858F;">    /** The remote run that waits on the approval. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    runId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    approvalId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    title: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The owning app&#39;s own approval link. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    url?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Set once the notification to the configured destination went out. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    notifiedAt?: Date;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The run of another chamvi app a stand-in run waits on to settle. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RemoteWaitPoint = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    kind: </span><span style="color:#E7C58C;">&#39;remote&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    id: </span><span style="color:#E7C58C;">&#39;remote&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#80858F;">    /** The configured peer that owns the remote run. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    peer: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The remote agent&#39;s name on the peer. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    remoteRunId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    expiresAt: Date;</span></span>
<span class="line"><span style="color:#80858F;">    /** Set by a wake from the peer: the next tick polls at once. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    wakeRequested?: boolean;</span></span>
<span class="line"><span style="color:#80858F;">    /** The remote run as the last poll showed it. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    remote?: {</span></span>
<span class="line"><span style="color:#E3E5EA;">        status: RunStatusLiteral;</span></span>
<span class="line"><span style="color:#E3E5EA;">        approval?: RemoteApproval;</span></span>
<span class="line"><span style="color:#E3E5EA;">    };</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** What a \`waiting\` run waits on, by \`kind\`. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> WaitPoint = ApprovalWaitPoint | DispatchWaitPoint | RemoteWaitPoint;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> Run = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    id: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    status: RunStatusLiteral;</span></span>
<span class="line"><span style="color:#80858F;">    /** First exposure to untrusted content; never cleared by execution. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    taint?: RunTaint;</span></span>
<span class="line"><span style="color:#E3E5EA;">    trigger: TriggerEnvelope;</span></span>
<span class="line"><span style="color:#E3E5EA;">    concurrencyKey?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Where the run came from on its channel (\`trigger.address\`). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    address?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    output?: unknown;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Why the run failed, or why the registry cancelled it (\`agent_replaced\`,</span></span>
<span class="line"><span style="color:#80858F;">     * \`agent_removed\`); a run cancelled on another replica keeps the reason</span></span>
<span class="line"><span style="color:#80858F;">     * through the owner&#39;s settle, a run that completes anyway loses it.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    error?: { code: string; message: string };</span></span>
<span class="line"><span style="color:#E3E5EA;">    usage: Usage;</span></span>
<span class="line"><span style="color:#80858F;">    /** The sum of every descendant&#39;s usage, recomputed from the children (never incremented). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    subtreeUsage?: Usage;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The run that dispatched this one (\`trigger.parent.runId\` of a</span></span>
<span class="line"><span style="color:#80858F;">     * \`dispatch\` parent; a peer parent names another app&#39;s run and sets</span></span>
<span class="line"><span style="color:#80858F;">     * none); set by the run service at create, never from the caller.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    parentRunId?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    waiting?: WaitPoint;</span></span>
<span class="line"><span style="color:#E3E5EA;">    claim?: { owner: string; expiresAt: Date };</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Set by cancel() on a replica that does not execute the run: the owner</span></span>
<span class="line"><span style="color:#80858F;">     * aborts it on its next poll, and a later execution settles it cancelled.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    cancelRequested?: boolean;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The revision the agent was registered at when the run was created</span></span>
<span class="line"><span style="color:#80858F;">     * (a folder agent&#39;s content hash); absent for an agent without one.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    agentRevision?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The conversation the run belongs to; set by the trusted conversation intake only, never by dispatch(). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    conversation?: ConversationBinding;</span></span>
<span class="line"><span style="color:#E3E5EA;">    createdAt: Date;</span></span>
<span class="line"><span style="color:#E3E5EA;">    updatedAt: Date;</span></span>
<span class="line"><span style="color:#E3E5EA;">    startedAt?: Date;</span></span>
<span class="line"><span style="color:#E3E5EA;">    finishedAt?: Date;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> Budget = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    maxSteps: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">    maxTokens?: number;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Wall-clock limit per execution (not cumulative across resumes): each</span></span>
<span class="line"><span style="color:#80858F;">     * execution of the run gets the full timeout again.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    timeoutMs?: number;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Total tokens (input + output) of every descendant dispatched below a</span></span>
<span class="line"><span style="color:#80858F;">     * run of this agent: at or over it, dispatch() and dispatchTo() refuse</span></span>
<span class="line"><span style="color:#80858F;">     * (checked at dispatch time only, running children are not stopped).</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    maxSubtreeTokens?: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** An invoker or approver as the API serves it: its identity only, never its grants. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> InvokerView = Omit&lt;Invoker, </span><span style="color:#E7C58C;">&#39;bindings&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;authorization&#39;</span><span style="color:#E3E5EA;">&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * A run as the API serves it (REST, SSE, MCP): its invoker carries the</span></span>
<span class="line"><span style="color:#80858F;"> * identity only, never the grants.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RunView = Omit&lt;Run, </span><span style="color:#E7C58C;">&#39;claim&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;trigger&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;conversation&#39;</span><span style="color:#E3E5EA;">&gt; &amp; {</span></span>
<span class="line"><span style="color:#80858F;">    /** What started the run; \`payload\` is absent when the run was started without one. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    trigger: Omit&lt;TriggerEnvelope, </span><span style="color:#E7C58C;">&#39;invoker&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;payload&#39;</span><span style="color:#E3E5EA;">&gt; &amp; { payload?: unknown; invoker?: InvokerView };</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The run&#39;s agent is private (or not held by the app), as the server</span></span>
<span class="line"><span style="color:#80858F;">     * checks it: \`{ name: agent, private: agentPrivate }\` are the attributes</span></span>
<span class="line"><span style="color:#80858F;">     * of the agent permissions (\`chamvi_agent_approve\`, ...). Read when the</span></span>
<span class="line"><span style="color:#80858F;">     * run is serialized.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    agentPrivate: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** \`POST /agents/{name}/runs\` after validation: unknown keys dropped, attachment data still base64. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> StartRunBody = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    payload?: unknown;</span></span>
<span class="line"><span style="color:#E3E5EA;">    idempotencyKey?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Where the run came from on the http channel (a caller-defined thread or conversation). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    address?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    attachments?: AttachmentRequestBody[];</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> Step = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    runId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    index: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">    kind: </span><span style="color:#E7C58C;">&#39;llm&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;tool&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;wait&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    name?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    input?: unknown;</span></span>
<span class="line"><span style="color:#E3E5EA;">    output?: unknown;</span></span>
<span class="line"><span style="color:#E3E5EA;">    error?: unknown;</span></span>
<span class="line"><span style="color:#E3E5EA;">    startedAt: Date;</span></span>
<span class="line"><span style="color:#E3E5EA;">    finishedAt: Date;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A stored step: the step and the row&#39;s id (a uuid v7 the step service assigns when it appends the step). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> StepRecord = Step &amp; {</span></span>
<span class="line"><span style="color:#E3E5EA;">    id: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ModelMessage } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;ai&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> Checkpoint = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    runId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    stepIndex: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">    messages: ModelMessage[];</span></span>
<span class="line"><span style="color:#80858F;">    /** AI SDK finish reason of the step this checkpoint was taken after. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    finishReason?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Provenance of a conversation run&#39;s recalled context (not an authorization). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    conversation?: {</span></span>
<span class="line"><span style="color:#E3E5EA;">        scopeId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">        generation: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">    };</span></span>
<span class="line"><span style="color:#E3E5EA;">    createdAt: Date;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A stored checkpoint: the checkpoint and the row&#39;s storage id (a uuid). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> CheckpointRecord = Checkpoint &amp; {</span></span>
<span class="line"><span style="color:#E3E5EA;">    id: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><p>The <code>RunStatus</code> enum (<code>@chamvi/core-kit</code>), whose values <code>RunStatusLiteral</code> is built from:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> enum</span><span style="color:#E3E5EA;"> RunStatus {</span></span>
<span class="line"><span style="color:#E3E5EA;">    QUEUED = </span><span style="color:#E7C58C;">&#39;queued&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    RUNNING = </span><span style="color:#E7C58C;">&#39;running&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    WAITING = </span><span style="color:#E7C58C;">&#39;waiting&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    COMPLETED = </span><span style="color:#E7C58C;">&#39;completed&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    FAILED = </span><span style="color:#E7C58C;">&#39;failed&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    CANCELLED = </span><span style="color:#E7C58C;">&#39;cancelled&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    INTERRUPTED = </span><span style="color:#E7C58C;">&#39;interrupted&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">}</span></span></code></pre></div><h2 id="services-and-repositories" tabindex="-1">Services and repositories <a class="header-anchor" href="#services-and-repositories" aria-label="Permalink to &quot;Services and repositories&quot;">​</a></h2><p>There is no store aggregate: <code>RunService</code>, <code>StepService</code>, <code>CheckpointService</code>, <code>EffectService</code>, <code>ArtifactService</code>, <code>StateService</code>, <code>LockService</code>, <code>IdempotencyService</code> and <code>AgentRevisionService</code> hold the rules of runs, steps, checkpoints, effect results, artifacts, agent state, locks, idempotency keys and agent revision markers over the ports of <code>@chamvi/store</code>; <code>EngineOptions</code> takes each (<code>runService</code>, <code>stepService</code>, <code>checkpointService</code>, <code>effectService</code>, <code>artifactService</code>, <code>stateService</code>, <code>lockService</code>, <code>idempotencyService</code>, <code>agentRevisionService</code>). <code>ConnectionService</code> holds the connection rules over <code>IConnectionRepository</code>; <code>EngineOptions</code> takes it as an optional <code>connectionService</code> (exposed, unused by the engine), the connection vault and config store take it. <code>ConversationService</code> holds the conversation rules over <code>IConversationRepository</code>; <code>EngineOptions</code> takes it as an optional <code>conversationService</code>, required by the <code>conversations</code> capability. The ports are listed on the <a href="/repositories/">Repository Contract</a> page.</p><h2 id="artifacts" tabindex="-1">Artifacts <a class="header-anchor" href="#artifacts" aria-label="Permalink to &quot;Artifacts&quot;">​</a></h2><p><code>Artifact</code> (metadata) and <code>ArtifactInput</code> (a file to store), from <code>@chamvi/core-kit</code>, and <code>IRunArtifacts</code> (the tool context&#39;s <code>artifacts</code>):</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Metadata of a file stored for a run (an attachment or a tool output); the bytes are read separately. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> Artifact = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    id: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    runId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    mediaType: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    filename?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Byte length of the data. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    size: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">    createdAt: Date;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * A stored artifact: the metadata, and beside it the two write-only</span></span>
<span class="line"><span style="color:#80858F;"> * properties of the row. A read never returns either.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ArtifactRecord = Artifact &amp; {</span></span>
<span class="line"><span style="color:#80858F;">    /** The private write identity within the run (unique per \`runId\`); matched by a where, never read back. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    key?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The bytes \`save\`/\`upsert\` write when set; read only through \`readData\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    data?: Uint8Array;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A file to store: an attachment at dispatch or a tool&#39;s \`artifacts.put()\`. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ArtifactInput = {</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * \`artifacts.put()\` only (a dispatch attachment takes none): a stable name</span></span>
<span class="line"><span style="color:#80858F;">     * within the run, 1 to 255 characters without NUL. A repeated put with that</span></span>
<span class="line"><span style="color:#80858F;">     * key replaces the artifact and keeps its id. The key is private to the</span></span>
<span class="line"><span style="color:#80858F;">     * store and never part of an \`Artifact\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    key?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** \`type/subtype\`, e.g. \`image/png\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    mediaType: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    filename?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    data: Uint8Array;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** One attachment of \`POST /agents/{name}/runs\` as sent. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AttachmentRequestBody = {</span></span>
<span class="line"><span style="color:#80858F;">    /** \`type/subtype\`, e.g. \`image/png\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    mediaType: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    filename?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The bytes in base64. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    data: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ToolResultPart } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;ai&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IArtifactRepository } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/store&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Artifact, ArtifactInput } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core-kit&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * The artifacts of one run, part of the tool context. Not an effect by</span></span>
<span class="line"><span style="color:#80858F;"> * itself: put \`put()\` inside a \`defineEffectTool\` to store a file exactly once.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * The file item of a tool&#39;s \`toModelOutput\` content for an artifact</span></span>
<span class="line"><span style="color:#80858F;"> * (\`artifactFilePart()\`): its data is the artifact&#39;s marker, which the</span></span>
<span class="line"><span style="color:#80858F;"> * engine swaps for the bytes before each model call.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ArtifactFilePart = Extract&lt;</span></span>
<span class="line"><span style="color:#E3E5EA;">    Extract&lt;ToolResultPart[</span><span style="color:#E7C58C;">&#39;output&#39;</span><span style="color:#E3E5EA;">], { type: </span><span style="color:#E7C58C;">&#39;content&#39;</span><span style="color:#E3E5EA;"> }&gt;[</span><span style="color:#E7C58C;">&#39;value&#39;</span><span style="color:#E3E5EA;">][number],</span></span>
<span class="line"><span style="color:#E3E5EA;">    { type: </span><span style="color:#E7C58C;">&#39;file&#39;</span><span style="color:#E3E5EA;"> }</span></span>
<span class="line"><span style="color:#E3E5EA;">&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> interface</span><span style="color:#E3E5EA;"> IRunArtifacts {</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Stores a file as an artifact of the run (with \`key\`: replacing an artifact</span></span>
<span class="line"><span style="color:#80858F;">     * stored with that key before and keeping its id).</span></span>
<span class="line"><span style="color:#80858F;">     * Throws ValidationError for an invalid input.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    put(input: ArtifactInput): Promise&lt;Artifact&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** An artifact of this run with its bytes; undefined for an unknown id or another run&#39;s artifact. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    get(id: string): Promise&lt;{ artifact: Artifact; data: Uint8Array } | undefined&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** The run&#39;s artifacts, by createdAt then id. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    list(): Promise&lt;Artifact[]&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ArtifactServiceContext = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    repository: IArtifactRepository;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * The operations of \`ArtifactService\`. Anything that satisfies it can stand in</span></span>
<span class="line"><span style="color:#80858F;"> * for the service: the engine, the channels and the HTTP API take this type.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> interface</span><span style="color:#E3E5EA;"> IArtifactService {</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Insert-if-absent: resolves false and keeps the stored artifact</span></span>
<span class="line"><span style="color:#80858F;">     * (metadata and bytes) when an artifact with that id, or with \`key\` in</span></span>
<span class="line"><span style="color:#80858F;">     * that run, exists.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    create(artifact: Artifact, data: Uint8Array, key?: string): Promise&lt;boolean&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Upsert by \`(runId, key)\`: an absent key inserts the artifact as</span></span>
<span class="line"><span style="color:#80858F;">     * given; an existing one keeps its \`id\`, \`agent\` and \`createdAt\`,</span></span>
<span class="line"><span style="color:#80858F;">     * replaces \`mediaType\`, \`filename\` (removed when absent), \`size\` and the</span></span>
<span class="line"><span style="color:#80858F;">     * bytes. Resolves the stored metadata.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    save(artifact: Artifact, data: Uint8Array, key: string): Promise&lt;Artifact&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** Metadata only. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    findOne(id: string): Promise&lt;Artifact | undefined&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** As \`findOne\`; ArtifactNotFoundError when absent. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    findOneOrFail(id: string): Promise&lt;Artifact&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** Metadata of the run&#39;s artifact stored under \`key\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    findOneByKey(runId: string, key: string): Promise&lt;Artifact | undefined&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** The bytes, as a plain Uint8Array (no Buffer or other subclass). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    read(id: string): Promise&lt;Uint8Array | undefined&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** Metadata of a run&#39;s artifacts, ordered by createdAt ascending, ties broken by id ascending. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    find(runId: string): Promise&lt;Artifact[]&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** As \`find\`; RepositoryNotFoundError when the run has no artifact. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    findOrFail(runId: string): Promise&lt;Artifact[]&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">}</span></span></code></pre></div><p><code>isArtifactMediaType(value: unknown): value is string</code> (<code>@chamvi/core-kit</code>) is the media type rule <code>dispatch</code> and <code>artifacts.put()</code> apply: <code>type/subtype</code> (RFC 6838 restricted names) without parameters. An intake layer can check attachments with it before dispatching (<code>@chamvi/http</code> does).</p><p><code>artifactFilePart(artifact)</code> is the file item a tool&#39;s <code>toModelOutput</code> returns to show an artifact of the run to the model (an image it stored with <code>artifacts.put()</code>): its data is the artifact&#39;s marker, so the tool step and the checkpoints keep the id while the engine hands the model the bytes before each model call.</p><p>See <a href="/guide/agents#files">Files</a> and <a href="/guide/channels#attachments">Attachments</a>.</p><p>Optional artifact discovery and processing tools are in <a href="/reference/tool-files"><code>@chamvi/tool-files</code></a>. They use these native artifact types.</p><h2 id="tools" tabindex="-1">Tools <a class="header-anchor" href="#tools" aria-label="Permalink to &quot;Tools&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> defineTool&lt;I, O, S </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StateSchema = StateSchema&gt;(</span></span>
<span class="line"><span style="color:#E3E5EA;">    def: Tool&lt;I, O, ToolContext&lt;S&gt;&gt; &amp; {</span></span>
<span class="line"><span style="color:#E3E5EA;">        execute: ToolExecuteFunction&lt;I, O, ToolContext&lt;S&gt;&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">        contextSchema?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">    },</span></span>
<span class="line"><span style="color:#E3E5EA;">): Tool&lt;I, O, ToolContext&lt;S&gt;&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> toolCallKey(ctx: Pick&lt;ToolContext, </span><span style="color:#E7C58C;">&#39;run&#39;</span><span style="color:#E3E5EA;">&gt;): string;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> toolContextSchema: StandardSchemaV1&lt;ToolContext, ToolContext&gt;; </span><span style="color:#80858F;">// vendor &#39;chamvi&#39;</span></span></code></pre></div><p><code>defineTool()</code> is <code>tool()</code> with <code>contextSchema: toolContextSchema</code>; the engine hands the run&#39;s <code>ToolContext</code> to every tool carrying that schema (by reference, so a copy of the tool keeps it). Its <code>validate</code> returns the context unchanged and rejects a missing one, which fails the run (<code>validation_error</code>) with <code>Type validation failed for tool context (&lt;tool&gt;): No chamvi tool context: the tool was built by another copy of @chamvi/core, or runs outside a chamvi agent.</code> (the marker is the schema object itself, so a tool from a second copy of <code>@chamvi/core</code> gets no context).</p><p><code>toolCallKey(ctx)</code> returns an opaque key for the active run, model step and tool call. It stays the same when that call replays and differs for calls in later steps even if a provider reuses <code>toolCallId</code>. Use it when run-local artifact keys must preserve earlier results. It throws <code>InvalidRunStateError</code> outside an active call or with another run&#39;s context. It does not record an effect or prevent computation from repeating.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IRunArtifacts } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../artifact/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ToolChannels } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../channel/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { RunContext } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../run/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IAgentState, StateSchema } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../state/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Run-level trust flags, evaluated on final validated input; omitted flags are false. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ToolTrust&lt;I = any, S </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StateSchema = StateSchema&gt; = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Taint the whole run before exposing this call&#39;s potentially untrusted result or execution error. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    taint?: boolean | ((input: I, ctx: ToolContext&lt;S&gt;) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> boolean | Promise&lt;boolean&gt;);</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** Apply the agent&#39;s approval-or-deny policy before execution if the run is already tainted. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    guardWhenTainted?: boolean | ((input: I, ctx: ToolContext&lt;S&gt;) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> boolean | Promise&lt;boolean&gt;);</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Extra private detail of the outbound gate&#39;s approval (e.g. the commits</span></span>
<span class="line"><span style="color:#80858F;">     * a push sends), computed on the final input when the gate asks: it goes</span></span>
<span class="line"><span style="color:#80858F;">     * into the private approval body (inbox and API, never the source</span></span>
<span class="line"><span style="color:#80858F;">     * channel&#39;s notification) and into the decision&#39;s binding, so a changed</span></span>
<span class="line"><span style="color:#80858F;">     * detail on replay asks again. The tool reads \`outboundApproved(ctx)\` to</span></span>
<span class="line"><span style="color:#80858F;">     * skip an approval of its own the gate already covered.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    approvalDetail?: (input: I, ctx: ToolContext&lt;S&gt;) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> string | undefined | Promise&lt;string | undefined&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AgentTrust = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Policy for guarded calls in tainted runs; defaults to &#39;approve&#39;. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    onTainted?: </span><span style="color:#E7C58C;">&#39;approve&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;deny&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#80858F;">    /** Boolean overrides by tool name; false disables the corresponding tool flag. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    tools?: Record&lt;string, { taint?: boolean; guardWhenTainted?: boolean }&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * What a chamvi tool gets as \`context\`: one object per execution, shared by</span></span>
<span class="line"><span style="color:#80858F;"> * every call and the tools factory. Treat it as immutable. Engine-provided</span></span>
<span class="line"><span style="color:#80858F;"> * values are reached with \`inject(ctx, key)\`, never as a field.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ToolContext&lt;S </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StateSchema = StateSchema&gt; = {</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Run-bound handles on the engine&#39;s channels with \`out\`: \`findOne(name?)\`</span></span>
<span class="line"><span style="color:#80858F;">     * (no name: the channel the run came from), \`findOneOrFail(name?)\`, \`find()\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    channels: ToolChannels;</span></span>
<span class="line"><span style="color:#E3E5EA;">    run: RunContext;</span></span>
<span class="line"><span style="color:#E3E5EA;">    state: IAgentState&lt;S&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The run&#39;s artifacts (its attachments and files tools stored). Not an</span></span>
<span class="line"><span style="color:#80858F;">     * effect: put \`put()\` inside a \`defineEffectTool\` to store a file exactly once.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    artifacts: IRunArtifacts;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><p>See <a href="/guide/agents#tools-and-their-context">Tools and their context</a>.</p><h2 id="context" tabindex="-1">Context <a class="header-anchor" href="#context" aria-label="Permalink to &quot;Context&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> defineContextKey&lt;T&gt;(name: string): ContextKey&lt;T&gt;;                      </span><span style="color:#80858F;">// a new frozen key per call; empty name -&gt; InvalidAgentDefinitionError</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> inject&lt;T&gt;(ctx: ToolContext, key: ContextKey&lt;T&gt;): T;                    </span><span style="color:#80858F;">// else ContextNotProvidedError (&#39;context_not_provided&#39;)</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> tryInject&lt;T&gt;(ctx: ToolContext, key: ContextKey&lt;T&gt;): T | undefined;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> injectClock(ctx: ToolContext): IClock;                               </span><span style="color:#80858F;">// the engine&#39;s clock inside a tool; ContextNotProvidedError on a context the engine did not pass</span></span></code></pre></div><p><code>engine.provide(key, value)</code> (<code>Engine</code> implements <code>IContextProvider</code>) keeps the value by reference and refuses a foreign key, <code>undefined</code> and a second value for one key (<code>InvalidAgentDefinitionError</code> naming the key). <code>inject</code> reads the engine&#39;s values for the <code>ToolContext</code> the engine built for the execution (tool <code>execute</code>, the tools factory, <code>alreadyApplied</code>, <code>effectKey</code>); <code>ToolContext</code> (<code>{ run, state, artifacts, channels }</code>) gains no field for a provided value, and nothing provided is stored or serialized. A missing value is a tool error in <code>execute</code> and the effect hooks and fails the run in the factory. See <a href="/guide/tools#context-shared-instances-for-tools">Context</a>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">declare</span><span style="color:#8EA7FF;"> const</span><span style="color:#E3E5EA;"> CONTEXT_VALUE: unique symbol;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * A typed key for a value provided on the engine; unique per</span></span>
<span class="line"><span style="color:#80858F;"> * \`defineContextKey()\` call, its name is used in messages only.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ContextKey&lt;T&gt; = {</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> name: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Carries the value type only; never set. */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> [CONTEXT_VALUE]?: T;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Holds values tools reach through \`inject(ctx, key)\`. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> interface</span><span style="color:#E3E5EA;"> IContextProvider {</span></span>
<span class="line"><span style="color:#80858F;">    /** Stores \`value\` by reference under \`key\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    provide&lt;T&gt;(key: ContextKey&lt;T&gt;, value: T): void;</span></span>
<span class="line"><span style="color:#E3E5EA;">}</span></span></code></pre></div><h2 id="models" tabindex="-1">Models <a class="header-anchor" href="#models" aria-label="Permalink to &quot;Models&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> resolveModel&lt;S </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StateSchema = StateSchema&gt;(ctx: ToolContext&lt;S&gt;, ref?: ModelRef): LanguageModel;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> checkAgentModel(agent: Agent, options: ModelCheckOptions): void;      </span><span style="color:#80858F;">// InvalidAgentDefinitionError</span></span></code></pre></div><p>A <code>ModelRef</code> is a <code>&#39;&lt;provider&gt;/&lt;model id&gt;&#39;</code> string or an AI SDK <code>LanguageModel</code> object (used as is). An agent&#39;s <code>model</code> falls back to <code>EngineOptions.model</code>; the engine refuses an agent with neither, a ref of another shape, a string without <code>EngineOptions.models</code> (<code>IModelResolver</code>; pass a <code>LanguageModel</code> object then) and a string the resolver refuses, at construction and in <code>putAgent</code> (<code>checkAgentModel</code> is that check; a string default without a resolver is refused at construction too). Strings resolve through <code>models.resolve()</code> when an execution starts; the engine never hands the AI SDK a string. <code>@chamvi/app</code> passes both from its <a href="/guide/models">model settings</a> (<code>MODEL</code>, <code>chamvi.json</code>, <code>createApp({ model, providers })</code>).</p><p><code>resolveModel(ctx, ref?)</code> gives tool code (<code>execute</code>, the tools factory, the effect hooks) a model: <code>ref</code>, else the run&#39;s agent model from the live registry, else the default. An object is returned as is; a string needs <code>models</code> (<code>resolveModel(): the model string &quot;&lt;ref&gt;&quot; needs a model resolver (EngineOptions.models).</code>) and a ref it cannot resolve is an <code>InvalidAgentDefinitionError</code> too, a tool error in <code>execute</code>. It reads the engine&#39;s models through the context mechanism, so <code>ToolContext</code> keeps its shape and a hand-built context throws <code>ContextNotProvidedError</code>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * A model: \`&#39;&lt;provider&gt;/&lt;model id&gt;&#39;\` (split at the first \`/\`, resolved</span></span>
<span class="line"><span style="color:#80858F;"> * through the engine&#39;s IModelResolver) or an AI SDK LanguageModel object,</span></span>
<span class="line"><span style="color:#80858F;"> * used as is.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ModelRef = string | LanguageModel;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * A transcription (speech to text) model: \`&#39;&lt;provider&gt;/&lt;model id&gt;&#39;\`</span></span>
<span class="line"><span style="color:#80858F;"> * (resolved through IModelResolver.transcription()) or an AI SDK</span></span>
<span class="line"><span style="color:#80858F;"> * TranscriptionModel object, used as is.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> TranscriptionModelRef = string | TranscriptionModel;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Turns \`&#39;&lt;provider&gt;/&lt;model id&gt;&#39;\` strings into LanguageModel (and, optionally, EmbeddingModel) objects. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> interface</span><span style="color:#E3E5EA;"> IModelResolver {</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Refuses a ref that cannot resolve (unknown provider, missing setting)</span></span>
<span class="line"><span style="color:#80858F;">     * with InvalidAgentDefinitionError; \`agent\` is undefined for the app&#39;s</span></span>
<span class="line"><span style="color:#80858F;">     * default model.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    check(ref: string, agent?: string): void;</span></span>
<span class="line"><span style="color:#80858F;">    /** The LanguageModel for \`ref\`; InvalidAgentDefinitionError when it cannot resolve. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    resolve(ref: string): LanguageModel;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The EmbeddingModel for \`ref\` (\`&#39;&lt;provider&gt;/&lt;model id&gt;&#39;\`), for packages</span></span>
<span class="line"><span style="color:#80858F;">     * that embed text; InvalidAgentDefinitionError when it cannot resolve.</span></span>
<span class="line"><span style="color:#80858F;">     * Optional: a resolver without it hands out no embedding models.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    embedding?(ref: string): EmbeddingModel;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The TranscriptionModel for \`ref\` (\`&#39;&lt;provider&gt;/&lt;model id&gt;&#39;\`), for</span></span>
<span class="line"><span style="color:#80858F;">     * packages that transcribe audio; InvalidAgentDefinitionError when it</span></span>
<span class="line"><span style="color:#80858F;">     * cannot resolve. Optional: a resolver without it hands out no</span></span>
<span class="line"><span style="color:#80858F;">     * transcription models.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    transcription?(ref: string): TranscriptionModel;</span></span>
<span class="line"><span style="color:#E3E5EA;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** What checkAgentModel() reads besides the agent: the engine&#39;s default and resolver. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ModelCheckOptions = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    model?: ModelRef;</span></span>
<span class="line"><span style="color:#E3E5EA;">    models?: IModelResolver;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><h2 id="effect-tools" tabindex="-1">Effect tools <a class="header-anchor" href="#effect-tools" aria-label="Permalink to &quot;Effect tools&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> defineEffectTool&lt;I, O, S </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StateSchema = StateSchema&gt;(def: Tool&lt;I, O, ToolContext&lt;S&gt;&gt; &amp; {</span></span>
<span class="line"><span style="color:#E3E5EA;">    execute: ToolExecuteFunction&lt;I, O, ToolContext&lt;S&gt;&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    contextSchema?: never;</span></span>
<span class="line"><span style="color:#E3E5EA;">    effectKey?: (input: I, ctx: ToolContext&lt;S&gt;, options: ToolExecutionOptions&lt;ToolContext&lt;S&gt;&gt;) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    alreadyApplied?: (effectKey: string, input: I, ctx: ToolContext&lt;S&gt;) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> Promise&lt;O | undefined&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">}): EffectTool&lt;I, O, S&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> effectMarker(effectKey: string): string; </span><span style="color:#80858F;">// &#39;&lt;!-- chamvi:effect=&lt;key&gt; --&gt;&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> wrapToolsForRun(</span></span>
<span class="line"><span style="color:#E3E5EA;">    tools: ToolSet,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ctx: ToolContext,</span></span>
<span class="line"><span style="color:#E3E5EA;">    effects: Pick&lt;EffectService, </span><span style="color:#E7C58C;">&#39;findOne&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;save&#39;</span><span style="color:#E3E5EA;">&gt;,</span></span>
<span class="line"><span style="color:#E3E5EA;">    options?: { allow?: (toolName: string) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> boolean; hooks?: AgentHooks },</span></span>
<span class="line"><span style="color:#E3E5EA;">): ToolSet;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> EFFECT: unique symbol; </span><span style="color:#80858F;">// marks a tool as an effect tool</span></span></code></pre></div><p>See <a href="/guide/effect-tools">Effect Tools &amp; Reconciliation</a>.</p><h2 id="approvals" tabindex="-1">Approvals <a class="header-anchor" href="#approvals" aria-label="Permalink to &quot;Approvals&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> approve(ctx: ToolContext, request: ApprovalRequestInput): Promise&lt;ApprovalDecision&gt;; </span><span style="color:#80858F;">// inside a tool call only</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> DEFAULT_APPROVAL_TIMEOUT_MS: </span><span style="color:#E7C58C;">86_400_000</span><span style="color:#E3E5EA;">; </span><span style="color:#80858F;">// 24 hours</span></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> APPROVAL_TIMEOUT_MAX_MS: </span><span style="color:#E7C58C;">2_147_483_647</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> APPROVAL_OPTIONS_MAX: </span><span style="color:#E7C58C;">20</span><span style="color:#E3E5EA;">; </span><span style="color:#80858F;">// @chamvi/core-kit</span></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> APPROVAL_OPTION_ID_PATTERN: RegExp; </span><span style="color:#80858F;">// /^[A-Za-z0-9@][\\w.:/@+-]{0,127}$/</span></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> APPROVAL_OPTION_LABEL_MAX_LENGTH: </span><span style="color:#E7C58C;">200</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> APPROVAL_OPTION_DETAIL_MAX_LENGTH: </span><span style="color:#E7C58C;">20_000</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> APPROVAL_OPTIONS_DETAIL_MAX_LENGTH: </span><span style="color:#E7C58C;">100_000</span><span style="color:#E3E5EA;">; </span><span style="color:#80858F;">// all details of one request</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** One choice of an approval request; \`detail\` is shown in the UI only (e.g. a diff). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ApprovalOption = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    id: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    label: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    detail?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Ids of this run&#39;s artifacts to show with the option (e.g. from</span></span>
<span class="line"><span style="color:#80858F;">     * \`ctx.artifacts.put()\`), at most APPROVAL_ARTIFACTS_PER_OPTION_MAX,</span></span>
<span class="line"><span style="color:#80858F;">     * unique. Not part of channel messages.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    artifacts?: string[];</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** \`POST /runs/{id}/approve\`. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ApproveBody = {</span></span>
<span class="line"><span style="color:#80858F;">    /** The wait point being answered. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    approvalId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    approved: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">    reason?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The chosen option ids of a wait point with options; none on a denial. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    selected?: string[];</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ToolCallFrame } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../effect/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ApprovalRequest } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../engine/execute/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ApprovalOption, Invoker } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core-kit&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** What a tool asks the owner to approve (\`approve()\`, \`ChannelHandle.approve()\`). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ApprovalRequestInput = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    title: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    body?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Ids of this run&#39;s artifacts to show with the request (e.g. from</span></span>
<span class="line"><span style="color:#80858F;">     * \`ctx.artifacts.put()\`), unique; together with the options&#39; at most</span></span>
<span class="line"><span style="color:#80858F;">     * APPROVAL_ARTIFACTS_MAX. Not part of channel messages.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    artifacts?: string[];</span></span>
<span class="line"><span style="color:#80858F;">    /** Choices to pick from; without them the approval is a plain yes or no. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    options?: ApprovalOption[];</span></span>
<span class="line"><span style="color:#80858F;">    /** Several options may be selected; default one. Needs \`options\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    multiple?: boolean;</span></span>
<span class="line"><span style="color:#80858F;">    /** How long the approval waits before it is denied; default 24 h. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    timeoutMs?: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The owner&#39;s answer to an approval request. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ApprovalDecision = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    approved: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">    reason?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Who answered, when known. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    approver?: Invoker;</span></span>
<span class="line"><span style="color:#80858F;">    /** The selected option ids in the request&#39;s option order; only on an approval of a request with options. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    selected?: string[];</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A plain approval ordinal taken before any await (internal, not exported): see reserveApproval(). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ApprovalReservation = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    frame: ToolCallFrame;</span></span>
<span class="line"><span style="color:#E3E5EA;">    choice: Pick&lt;ApprovalRequest, </span><span style="color:#E7C58C;">&#39;options&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;multiple&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;artifacts&#39;</span><span style="color:#E3E5EA;">&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    ordinal: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><p><code>approve()</code> outside a tool call, or in a streaming tool&#39;s body, throws <code>InvalidRunStateError</code>; a <code>timeoutMs</code> that is no positive integer up to <code>APPROVAL_TIMEOUT_MAX_MS</code> is a <code>ValidationError</code>, as are options outside the limits above (see <a href="/guide/approvals#offering-options">Offering options</a>). <code>ChannelHandle.approve()</code> is the same with the request delivered through the channel. The agent hooks (<code>AgentHooks</code>, <code>ToolCallInfo</code>) are on <code>AgentDefinition</code> above. See <a href="/guide/approvals">Approvals &amp; Hooks</a>.</p><h2 id="dispatch" tabindex="-1">Dispatch <a class="header-anchor" href="#dispatch" aria-label="Permalink to &quot;Dispatch&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> agent: AgentSubscriber; </span><span style="color:#80858F;">// agent.on(options?): a role of the channel &#39;agent&#39;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> agentChannel(): IChannel; </span><span style="color:#80858F;">// name &#39;agent&#39;, no in, no out</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> dispatch(ctx: ToolContext, input: DispatchInput): Promise&lt;DispatchResult&gt;; </span><span style="color:#80858F;">// the own agent</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> dispatchTo(ctx: ToolContext, input: DispatchToInput): Promise&lt;DispatchResult&gt;; </span><span style="color:#80858F;">// another agent</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> waitForDispatch(ctx: ToolContext, run: string | DispatchResult, options?: DispatchWaitOptions): Promise&lt;DispatchOutcome&gt;;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> waitForDispatch(ctx: ToolContext, runs: Array&lt;string | DispatchResult&gt;, options?: DispatchWaitOptions): Promise&lt;DispatchOutcome[]&gt;;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> normalizeWaitPoint(raw: Record&lt;string, unknown&gt;): WaitPoint; </span><span style="color:#80858F;">// for repositories: a legacy approval gets its id</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> waitIdOf(waiting: WaitPoint | undefined): string | undefined; </span><span style="color:#80858F;">// id, else approvalId</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> dispatchTools(options: DispatchToolsOptions): ToolSet; </span><span style="color:#80858F;">// dispatch_&lt;role&gt;, dispatch_&lt;agent&gt;_&lt;role&gt;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> DEFAULT_DISPATCH_ROLE: </span><span style="color:#E7C58C;">&#39;default&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> DEFAULT_DISPATCH_MAX_DEPTH: </span><span style="color:#E7C58C;">1</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> DISPATCH_DEPTH_MAX: </span><span style="color:#E7C58C;">8</span><span style="color:#E3E5EA;">; </span><span style="color:#80858F;">// @chamvi/core-kit</span></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> DEFAULT_MAX_DISPATCHES_PER_RUN: </span><span style="color:#E7C58C;">100</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> DEFAULT_DISPATCH_WAIT_TIMEOUT_MS: </span><span style="color:#E7C58C;">86_400_000</span><span style="color:#E3E5EA;">; </span><span style="color:#80858F;">// 24 hours</span></span></code></pre></div><p><code>AgentSubscriptionOptions</code>, <code>AgentSubscriber</code>, <code>DispatchInput</code>, <code>DispatchToInput</code>, <code>DispatchOutcome</code>, <code>DispatchWaitOptions</code> and <code>DispatchToolsOptions</code> (<code>DispatchHost</code>, <code>DispatchRunSnapshot</code>, <code>DispatchWaitRecord</code>, <code>RoleToolInput</code> and <code>DispatchToolTarget</code> are internal):</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { StandardSchemaV1 } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@standard-schema/spec&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { FlexibleSchema } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;ai&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Agent } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../agent/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ChannelSubscription, DispatchResult } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../channel/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IClock } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../clock/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { DispatchEnvelope } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../engine/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IEffectService } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../effect/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ILockService } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../lock/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IRunService } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../run/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IPeerResolver } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../peer/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> {</span></span>
<span class="line"><span style="color:#E3E5EA;">    Invoker,</span></span>
<span class="line"><span style="color:#E3E5EA;">    PeerParent,</span></span>
<span class="line"><span style="color:#E3E5EA;">    PeerStartInput,</span></span>
<span class="line"><span style="color:#E3E5EA;">    TriggerParent,</span></span>
<span class="line"><span style="color:#E3E5EA;">    TriggerSource,</span></span>
<span class="line"><span style="color:#E3E5EA;">} </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core-kit&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AgentSubscriptionOptions&lt;P = unknown&gt; = {</span></span>
<span class="line"><span style="color:#80858F;">    /** The role (the subscription id), following the channel-name rule; default \`default\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    role?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Parses the payload a tool dispatches; the parsed value is the child&#39;s payload. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    schema?: StandardSchemaV1&lt;unknown, P&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** How many dispatches of this role one run may start (all executions together), default 100. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    maxPerRun?: number;</span></span>
<span class="line"><span style="color:#80858F;">    /** The other agents whose runs may dispatch to this role (agent names); the own agent always may. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    from?: string[];</span></span>
<span class="line"><span style="color:#80858F;">    /** The deepest a run of this role may sit in a dispatch tree (a root run has depth 0), 1 to 8, default 1. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    maxDepth?: number;</span></span>
<span class="line"><span style="color:#80858F;">    /** Shared-store execution cap within the agent; omitted or false adds no cap. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    concurrencyMaxRuns?: number | false;</span></span>
<span class="line"><span style="color:#80858F;">    /** The child&#39;s concurrency key when the call gives none. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    concurrencyKey?(payload: P): string | undefined;</span></span>
<span class="line"><span style="color:#80858F;">    /** The child&#39;s idempotency key when the call gives none. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    idempotencyKey?(payload: P): string | undefined;</span></span>
<span class="line"><span style="color:#80858F;">    /** The child&#39;s address when the call gives none; deterministic (it feeds the dispatch&#39;s dedupe key). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    address?(payload: P): string | undefined;</span></span>
<span class="line"><span style="color:#80858F;">    /** What the role does, for a generated dispatch tool&#39;s description. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    description?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Makes a role of the \`agent\` channel (subscription id = role): the opt-in for dispatch(). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AgentSubscriber = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    on&lt;P = unknown&gt;(options?: AgentSubscriptionOptions&lt;P&gt;): ChannelSubscription&lt;P&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> DispatchInput = {</span></span>
<span class="line"><span style="color:#80858F;">    /** The receiving \`agent.on()\` role; default \`default\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    role?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The child run&#39;s payload (required), parsed by the role&#39;s schema. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    payload: unknown;</span></span>
<span class="line"><span style="color:#80858F;">    /** Dedupes across runs: a second dispatch under the same key gets the first child. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    idempotencyKey?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    concurrencyKey?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The child&#39;s \`trigger.address\` (and \`Run.address\`). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    address?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * A channel and address the child may \`emit()\` and \`approve()\` to</span></span>
<span class="line"><span style="color:#80858F;">     * without the outbound gate, as if it were the child&#39;s own source</span></span>
<span class="line"><span style="color:#80858F;">     * (stored as \`trigger.parent.source\`). The exemption is only as safe as</span></span>
<span class="line"><span style="color:#80858F;">     * the code choosing it: take the address from trusted data (an API</span></span>
<span class="line"><span style="color:#80858F;">     * response read in code), never from model input. Generated dispatch</span></span>
<span class="line"><span style="color:#80858F;">     * tools never set it.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    source?: TriggerSource;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** dispatchTo()&#39;s input: a dispatch to the \`agent.on()\` role of \`agent\`. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> DispatchToInput = DispatchInput &amp; {</span></span>
<span class="line"><span style="color:#80858F;">    /** The receiving agent (the calling run&#39;s own agent behaves as dispatch()). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** How a dispatched run ended, as waitForDispatch() reports it. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> DispatchOutcome = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    runId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    role: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** \`timeout\`: the wait expired on a run another run dispatched (it keeps running), or on one whose cancel did not land within one claim TTL. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    status: </span><span style="color:#E7C58C;">&#39;completed&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;failed&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;cancelled&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;timeout&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#80858F;">    /** A completed run&#39;s output. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    output?: unknown;</span></span>
<span class="line"><span style="color:#80858F;">    /** A failed or cancelled run&#39;s error (a wait that expired: code \`Timeout\`). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    error?: { code: string; message: string };</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> DispatchWaitOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** How long the run waits before the wait expires; 1 to APPROVAL_TIMEOUT_MAX_MS, default 24 h. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    timeoutMs?: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** What \`dispatch-wait:&lt;runId&gt;:&lt;waitId&gt;\` records (internal): the outcomes in \`runIds\` order, the tainted run ids. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> DispatchWaitRecord = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    outcomes: DispatchOutcome[];</span></span>
<span class="line"><span style="color:#E3E5EA;">    tainted: string[];</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The engine&#39;s copy of a run dispatch() reads (internal). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> DispatchRunSnapshot = {</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> runId: string;</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> agent: string;</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> invoker?: Invoker;</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> parent?: TriggerParent;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The engine side of dispatch() (internal, provided under DISPATCH_CONTEXT). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> DispatchHost = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    getAgent(name: string): Agent | undefined;</span></span>
<span class="line"><span style="color:#80858F;">    /** True for a channel registered on the engine. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    hasChannel(name: string): boolean;</span></span>
<span class="line"><span style="color:#80858F;">    /** The engine clock: the time a permission check of a cross-agent dispatch evaluates at. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    clock: IClock;</span></span>
<span class="line"><span style="color:#E3E5EA;">    effects: Pick&lt;IEffectService, </span><span style="color:#E7C58C;">&#39;findOne&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;save&#39;</span><span style="color:#E3E5EA;">&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    runs: Pick&lt;IRunService, </span><span style="color:#E7C58C;">&#39;findOne&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;find&#39;</span><span style="color:#E3E5EA;">&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** Creates the run with \`parent\` as its lineage (engine.dispatch() never sets one). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    createRun(envelope: DispatchEnvelope, parent: TriggerParent): Promise&lt;DispatchResult&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** Runs \`fn\` after every earlier call of the same run settled (the count and children read-check-write). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    serial&lt;T&gt;(runId: string, fn: () </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> Promise&lt;T&gt;): Promise&lt;T&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** Dispatches in flight by effect key, so identical parallel calls share one. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    inflight: Map&lt;string, Promise&lt;DispatchResult&gt;&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** What a peer&#39;s start names besides the envelope: the caller&#39;s lineage, its taint and the receiving role. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> PeerDispatchFields = PeerStartInput[</span><span style="color:#E7C58C;">&#39;peer&#39;</span><span style="color:#E3E5EA;">] &amp; {</span></span>
<span class="line"><span style="color:#80858F;">    /** The receiving \`agent.on()\` role. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    role: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** The engine side of a peer&#39;s start (internal): dispatchPeer() checks, counts and creates through it. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> PeerDispatchHost = Pick&lt;DispatchHost, </span><span style="color:#E7C58C;">&#39;getAgent&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;clock&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;effects&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;serial&#39;</span><span style="color:#E3E5EA;">&gt; &amp; {</span></span>
<span class="line"><span style="color:#E3E5EA;">    peers: IPeerResolver | undefined;</span></span>
<span class="line"><span style="color:#80858F;">    /** The store lock of the \`peer-count:\` read-check-write across replicas. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    locks: Pick&lt;ILockService, </span><span style="color:#E7C58C;">&#39;acquire&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;release&#39;</span><span style="color:#E3E5EA;">&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** That lock&#39;s TTL. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    lockTtlMs: number;</span></span>
<span class="line"><span style="color:#80858F;">    /** Creates the run with the peer lineage; \`taintSource\` taints it from the start. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    createRun(envelope: DispatchEnvelope, parent: PeerParent, taintSource: string | undefined): Promise&lt;DispatchResult&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * A role schema as a generated tool&#39;s input: the AI SDK schema the model</span></span>
<span class="line"><span style="color:#80858F;"> * sees and validates against, and how a validated input becomes the payload.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RoleToolInput = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    inputSchema: FlexibleSchema&lt;unknown&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    toPayload(input: unknown): unknown;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> DispatchToolsOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Roles of the calling agent: one \`dispatch_&lt;role&gt;\` tool each, calling dispatch(). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    roles?: string[];</span></span>
<span class="line"><span style="color:#80858F;">    /** Roles of other agents: one \`dispatch_&lt;agent&gt;_&lt;role&gt;\` tool each, calling dispatchTo(). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    agents?: { agent: string; roles: string[] }[];</span></span>
<span class="line"><span style="color:#80858F;">    /** Every generated tool waits for its child (waitForDispatch()) and returns the DispatchOutcome. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    wait?: boolean | DispatchWaitOptions;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** What a dispatchTools() placeholder stands for (internal): \`agent\` unset for the calling agent. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> DispatchToolTarget = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    role: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    wait: false | DispatchWaitOptions;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><p><code>dispatch()</code>, <code>dispatchTo()</code> and <code>waitForDispatch()</code> run inside a tool call (or a simple agent&#39;s <code>run()</code>) only (<code>InvalidRunStateError</code> elsewhere; <code>waitForDispatch()</code> also in a streaming tool&#39;s body). A missing role, a caller not in <code>from</code>, a too deep child, the per-run limit, an invoker without <code>chamvi_agent_run</code> for the target, a held concurrency key and a run this run did not dispatch are <code>ValidationError</code> tool errors (a simple agent&#39;s run fails instead); a reached <code>budget.maxSubtreeTokens</code> is a <code>BudgetExceededError</code> tool error. <code>dispatchTools()</code> throws <code>InvalidAgentDefinitionError</code> for no role, a bad name, a name over 64 characters, a role listed twice or a bad <code>wait</code>. See <a href="/guide/dispatch">Dispatch</a> and <a href="/guide/dispatch#generated-dispatch-tools">Generated dispatch tools</a>.</p><h2 id="state" tabindex="-1">State <a class="header-anchor" href="#state" aria-label="Permalink to &quot;State&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> createAgentState&lt;S </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StateSchema = StateSchema&gt;(</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string,</span></span>
<span class="line"><span style="color:#E3E5EA;">    schema: S | undefined,</span></span>
<span class="line"><span style="color:#E3E5EA;">    state: Pick&lt;StateService, </span><span style="color:#E7C58C;">&#39;findOne&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;set&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;findDocuments&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;upsertDocument&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;deleteDocument&#39;</span><span style="color:#E3E5EA;">&gt;,</span></span>
<span class="line"><span style="color:#E3E5EA;">): IAgentState&lt;S&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> createStateTools&lt;S </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StateSchema&gt;(schema: S): ToolSet; </span><span style="color:#80858F;">// the tools read context.state</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { StandardSchemaV1 } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@standard-schema/spec&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IStateDocumentRepository, IStateRepository } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/store&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IQuery } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@rapiq/core&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ActorContext } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../actor/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { AgentScope } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../permission/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> StateSchema = Record&lt;string, StandardSchemaV1&gt;;</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> Infer&lt;T </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StandardSchemaV1&gt; = StandardSchemaV1.InferOutput&lt;T&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> interface</span><span style="color:#E3E5EA;"> IAgentState&lt;S </span><span style="color:#8EA7FF;">extends</span><span style="color:#E3E5EA;"> StateSchema = StateSchema&gt; {</span></span>
<span class="line"><span style="color:#E3E5EA;">    get&lt;T = unknown&gt;(key: string): Promise&lt;T | undefined&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    set(key: string, value: unknown): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    collection&lt;K </span><span style="color:#8EA7FF;">extends</span><span style="color:#8EA7FF;"> keyof</span><span style="color:#E3E5EA;"> S &amp; string&gt;(name: K): {</span></span>
<span class="line"><span style="color:#E3E5EA;">        list(q?: { where?: Partial&lt;Infer&lt;S[K]&gt;&gt;; limit?: number }): Promise&lt;Array&lt;{ id: string } &amp; Infer&lt;S[K]&gt;&gt;&gt;;</span></span>
<span class="line"><span style="color:#80858F;">        /** Validates \`doc\` via the collection&#39;s Standard Schema; throws ValidationError and stores nothing on failure. */</span></span>
<span class="line"><span style="color:#E3E5EA;">        upsert(id: string, doc: Infer&lt;S[K]&gt;): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">        remove(id: string): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    };</span></span>
<span class="line"><span style="color:#E3E5EA;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> StateServiceContext = {</span></span>
<span class="line"><span style="color:#80858F;">    /** The key-value port. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    repository: IStateRepository;</span></span>
<span class="line"><span style="color:#80858F;">    /** The document port. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    documentRepository: IStateDocumentRepository;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> StateFindOptions = { limit?: number; offset?: number };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> StateDocumentFindOptions = { where?: Record&lt;string, unknown&gt;; limit?: number };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** One key of an agent&#39;s state. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> StateEntryValue = { key: string; value: unknown };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** One document of a collection: its id and the document. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> StateDocumentValue = { id: string; doc: unknown };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * The rapiq query of an actor listing, or a function that builds it: a</span></span>
<span class="line"><span style="color:#80858F;"> * function runs only after the checks pass, so a caller&#39;s malformed-query</span></span>
<span class="line"><span style="color:#80858F;"> * 400 never precedes the 403 or 404.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> StateQueryInput = IQuery | (() </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> IQuery);</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * The operations of \`StateService\`. Anything that satisfies it can stand in</span></span>
<span class="line"><span style="color:#80858F;"> * for the service: the engine, the channels and the HTTP API take this type.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> interface</span><span style="color:#E3E5EA;"> IStateService {</span></span>
<span class="line"><span style="color:#80858F;">    /** The value of the key; \`undefined\` when the agent holds none (a stored falsy value is present). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    findOne(agent: string, key: string): Promise&lt;unknown&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** As \`findOne\`; RepositoryNotFoundError when the key is absent. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    findOneOrFail(agent: string, key: string): Promise&lt;unknown&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** Stores \`value\` under the key, replacing a stored one; \`undefined\` removes the key. Resolves the stored value. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    set(agent: string, key: string, value: unknown): Promise&lt;unknown&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * One agent&#39;s entries ordered by key in code-point order; every entry</span></span>
<span class="line"><span style="color:#80858F;">     * (from \`offset\`) without \`limit\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    find(agent: string, options?: StateFindOptions): Promise&lt;StateEntryValue[]&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * An agent&#39;s keys by a rapiq query over the entry fields (\`key\`,</span></span>
<span class="line"><span style="color:#80858F;">     * \`value\`), for an API listing: its filters joined with the agent&#39;s,</span></span>
<span class="line"><span style="color:#80858F;">     * its sorts, then \`key\` in code-point order, its pagination.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    list(agent: string, query: IQuery): Promise&lt;StateEntryValue[]&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** As \`find\`; RepositoryNotFoundError when the selected page is empty. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    findOrFail(agent: string, options?: StateFindOptions): Promise&lt;StateEntryValue[]&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The documents of a collection, ordered by document id in code-point</span></span>
<span class="line"><span style="color:#80858F;">     * order; \`where\` matches by top-level equality (an \`undefined\` value</span></span>
<span class="line"><span style="color:#80858F;">     * matches an object document lacking the key).</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    findDocuments(</span></span>
<span class="line"><span style="color:#E3E5EA;">        agent: string,</span></span>
<span class="line"><span style="color:#E3E5EA;">        collection: string,</span></span>
<span class="line"><span style="color:#E3E5EA;">        options?: StateDocumentFindOptions,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ): Promise&lt;StateDocumentValue[]&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * A collection&#39;s documents by a rapiq query, for an API listing: its</span></span>
<span class="line"><span style="color:#80858F;">     * top-level \`eq\` filters as the top-level equality of \`findDocuments\`</span></span>
<span class="line"><span style="color:#80858F;">     * (a field path is a document key), its limit and offset, ordered by</span></span>
<span class="line"><span style="color:#80858F;">     * document id. Any other condition and any sort is a ValidationError.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    listDocuments(agent: string, collection: string, query: IQuery): Promise&lt;StateDocumentValue[]&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** As \`findDocuments\`; RepositoryNotFoundError when the selected page is empty. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    findDocumentsOrFail(</span></span>
<span class="line"><span style="color:#E3E5EA;">        agent: string,</span></span>
<span class="line"><span style="color:#E3E5EA;">        collection: string,</span></span>
<span class="line"><span style="color:#E3E5EA;">        options?: StateDocumentFindOptions,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ): Promise&lt;StateDocumentValue[]&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** Stores the document, replacing a stored one of that id; \`undefined\` is stored as \`null\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    upsertDocument(agent: string, collection: string, id: string, doc: unknown): Promise&lt;StateDocumentValue&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** Removes the document; a missing one is a no-op. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    deleteDocument(agent: string, collection: string, id: string): Promise&lt;void&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The agent&#39;s keys by a rapiq query (\`list\`), for the actor. Each actor</span></span>
<span class="line"><span style="color:#80858F;">     * method checks, in this order: \`chamvi_state_read\` (\`save\`:</span></span>
<span class="line"><span style="color:#80858F;">     * \`chamvi_state_write\`) for \`{ name }\` (403), the agent in</span></span>
<span class="line"><span style="color:#80858F;">     * \`options.agents\` (404), then for a private agent \`chamvi_agent_read\` (403).</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    getMany(agent: string, query: StateQueryInput, actor: ActorContext, options: AgentScope): Promise&lt;StateEntryValue[]&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** The value of the key (\`findOne\`), for the actor, after the checks of \`getMany\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    getOne(agent: string, key: string, actor: ActorContext, options: AgentScope): Promise&lt;unknown&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Validates the untrusted body (\`{ value }\`, 400) after the checks of \`getMany\`, then</span></span>
<span class="line"><span style="color:#80858F;">     * \`set\`s its value; resolves the validated value.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    save(agent: string, key: string, data: unknown, actor: ActorContext, options: AgentScope): Promise&lt;unknown&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">    /** A collection&#39;s documents (\`listDocuments\`) after the checks of \`getMany\`; 404 for a collection the agent does not declare. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    getDocuments(agent: string, collection: string, query: StateQueryInput, actor: ActorContext, options: AgentScope): Promise&lt;StateDocumentValue[]&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">}</span></span></code></pre></div><p>See <a href="/guide/state">Agent State</a>.</p><h2 id="clock" tabindex="-1">Clock <a class="header-anchor" href="#clock" aria-label="Permalink to &quot;Clock&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> systemClock: IClock;</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ClockTimer = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    clear(): void;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Lets the process exit while the timer is pending; a fake clock</span></span>
<span class="line"><span style="color:#80858F;">     * leaves it out.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    unref?(): void;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> interface</span><span style="color:#E3E5EA;"> IClock {</span></span>
<span class="line"><span style="color:#80858F;">    /** Epoch milliseconds, wall time. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    now(): number;</span></span>
<span class="line"><span style="color:#E3E5EA;">    setTimeout(fn: () </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> void, ms: number): ClockTimer;</span></span>
<span class="line"><span style="color:#E3E5EA;">}</span></span></code></pre></div><p><code>now()</code> is wall time in epoch milliseconds. A <code>systemClock</code> timer keeps the process alive until its <code>unref()</code> is called; chamvi unrefs every timer of its own except the drain deadline, the <code>runJob()</code> poll and the shutdown and force-exit deadlines.</p><h2 id="errors" tabindex="-1">Errors <a class="header-anchor" href="#errors" aria-label="Permalink to &quot;Errors&quot;">​</a></h2><p><code>ChamviError</code>, <code>InvalidAgentDefinitionError</code>, <code>AgentNotFoundError</code>, <code>ChannelNotFoundError</code>, <code>ContextNotProvidedError</code>, <code>InvalidRunStateError</code>, <code>RunNotFoundError</code>, <code>ArtifactNotFoundError</code>, <code>BudgetExceededError</code>, <code>TimeoutError</code>, <code>FatalToolError</code>, <code>IncompleteResponseError</code>, <code>ToolNotAllowedError</code>, <code>ToolDeniedError</code>, <code>LeaseLostError</code>, <code>SandboxError</code>, <code>ValidationError</code> and <code>ErrorCode</code>:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> const</span><span style="color:#E3E5EA;"> ErrorCode = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    AGENT_NOT_FOUND: </span><span style="color:#E7C58C;">&#39;agent_not_found&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    AGENT_REMOVED: </span><span style="color:#E7C58C;">&#39;agent_removed&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    AGENT_REPLACED: </span><span style="color:#E7C58C;">&#39;agent_replaced&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ARTIFACT_NOT_FOUND: </span><span style="color:#E7C58C;">&#39;artifact_not_found&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    BAD_REQUEST: </span><span style="color:#E7C58C;">&#39;bad_request&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    BUDGET_EXCEEDED: </span><span style="color:#E7C58C;">&#39;BudgetExceeded&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    CHANNEL_NOT_FOUND: </span><span style="color:#E7C58C;">&#39;channel_not_found&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONFLICT: </span><span style="color:#E7C58C;">&#39;conflict&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONNECTION_CHANGED: </span><span style="color:#E7C58C;">&#39;connection_changed&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONNECTION_HELD: </span><span style="color:#E7C58C;">&#39;connection_held&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONNECTION_NOT_CONFIGURED: </span><span style="color:#E7C58C;">&#39;connection_not_configured&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONTEXT_NOT_PROVIDED: </span><span style="color:#E7C58C;">&#39;context_not_provided&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    DECRYPTION_FAILED: </span><span style="color:#E7C58C;">&#39;decryption_failed&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ENTITY_CONFLICT: </span><span style="color:#E7C58C;">&#39;entity_conflict&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ENTITY_DEADLOCK: </span><span style="color:#E7C58C;">&#39;entity_deadlock&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ENTITY_INVALID: </span><span style="color:#E7C58C;">&#39;entity_invalid&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ENTITY_NOT_FOUND: </span><span style="color:#E7C58C;">&#39;entity_not_found&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ENTITY_QUERY_INVALID: </span><span style="color:#E7C58C;">&#39;entity_query_invalid&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    ENTITY_RELATION_INVALID: </span><span style="color:#E7C58C;">&#39;entity_relation_invalid&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    FATAL_TOOL: </span><span style="color:#E7C58C;">&#39;FatalToolError&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    FORBIDDEN: </span><span style="color:#E7C58C;">&#39;forbidden&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    INCOMPLETE_RESPONSE: </span><span style="color:#E7C58C;">&#39;incomplete_response&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    INTERNAL_ERROR: </span><span style="color:#E7C58C;">&#39;internal_error&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    INVALID_AGENT_DEFINITION: </span><span style="color:#E7C58C;">&#39;invalid_agent_definition&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    INVALID_RUN_STATE: </span><span style="color:#E7C58C;">&#39;invalid_run_state&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    LEASE_LOST: </span><span style="color:#E7C58C;">&#39;lease_lost&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    NOT_FOUND: </span><span style="color:#E7C58C;">&#39;not_found&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    PEER_START_BUSY: </span><span style="color:#E7C58C;">&#39;peer_start_busy&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    REMOTE_FAILED: </span><span style="color:#E7C58C;">&#39;remote_failed&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    REPOSITORY_NOT_FOUND: </span><span style="color:#E7C58C;">&#39;repository_not_found&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    REQUEST_ENTITY_TOO_LARGE: </span><span style="color:#E7C58C;">&#39;request_entity_too_large&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    RUN_NOT_FOUND: </span><span style="color:#E7C58C;">&#39;run_not_found&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    SANDBOX: </span><span style="color:#E7C58C;">&#39;sandbox_error&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    SERVICE_UNAVAILABLE: </span><span style="color:#E7C58C;">&#39;service_unavailable&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    TIMEOUT: </span><span style="color:#E7C58C;">&#39;Timeout&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    TOO_MANY_REQUESTS: </span><span style="color:#E7C58C;">&#39;too_many_requests&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    TOOL_DENIED: </span><span style="color:#E7C58C;">&#39;tool_denied&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    TOOL_NOT_ALLOWED: </span><span style="color:#E7C58C;">&#39;tool_not_allowed&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    UNAUTHORIZED: </span><span style="color:#E7C58C;">&#39;unauthorized&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    UNSUPPORTED_MEDIA_TYPE: </span><span style="color:#E7C58C;">&#39;unsupported_media_type&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">    VALIDATION: </span><span style="color:#E7C58C;">&#39;validation_error&#39;</span><span style="color:#E3E5EA;">,</span></span>
<span class="line"><span style="color:#E3E5EA;">} </span><span style="color:#8EA7FF;">as</span><span style="color:#8EA7FF;"> const</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">// eslint-disable-next-line @tada5hi/type-declaration-location -- Keep the enum-like value and its same-name type contract together.</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ErrorCode = </span><span style="color:#8EA7FF;">typeof</span><span style="color:#E3E5EA;"> ErrorCode[keyof </span><span style="color:#8EA7FF;">typeof</span><span style="color:#E3E5EA;"> ErrorCode];</span></span></code></pre></div><p>See <a href="/guide/errors">Errors</a> for when each is thrown.</p>`,90)])])}const A=n(p,[["render",o]]);export{d as __pageData,A as default};
