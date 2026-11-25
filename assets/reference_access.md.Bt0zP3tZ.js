import{_ as n,o as a,c as e,a2 as o}from"./chunks/framework.DiXyETtc.js";const y=JSON.parse('{"title":"@chamvi/access","description":"","frontmatter":{},"headers":[],"relativePath":"reference/access.md","filePath":"reference/access.md","lastUpdated":1795619497000}'),l={name:"reference/access.md"};function p(t,s,c,i,r,E){return a(),e("div",null,[...s[0]||(s[0]=[o(`<h1 id="chamvi-access" tabindex="-1">@chamvi/access <a class="header-anchor" href="#chamvi-access" aria-label="Permalink to &quot;@chamvi/access&quot;">​</a></h1><p>Permission checks over authup permission bindings, the same in Node.js and the browser. The public API of <code>packages/access/src/index.ts</code>; <code>@chamvi/core</code>, <code>@chamvi/http</code>, <code>@chamvi/app</code> (which re-exports it) and the dashboard use it.</p><div class="language-bash"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#E3E5EA;">npm </span><span style="color:#E7C58C;">install</span><span style="color:#E7C58C;"> @chamvi/access</span><span style="color:#E7C58C;"> --save</span></span></code></pre></div><p>It depends on <code>@authup/access</code> and on no other <code>@chamvi/*</code> package. See <a href="/guide/permissions">Permissions and authup</a> for the names, their attributes and the authup setup.</p><h2 id="checks" tabindex="-1">Checks <a class="header-anchor" href="#checks" aria-label="Permalink to &quot;Checks&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> can(holder: PermissionHolder, name: string, options?: PermissionCheckOptions): Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> canSome(holder: PermissionHolder, name: string, options?: PermissionCheckOptions): Promise&lt;boolean&gt;;</span></span></code></pre></div><p><code>can</code> is true when the holder&#39;s <code>bindings</code> or its <code>authorization</code> pass for the resource in <code>options.attributes</code>; without attributes a policy over them fails (the check asks about every resource). Both are evaluated by <code>createAuthorizationSnapshotEvaluator</code> of <code>@authup/access</code>: the bindings as a snapshot without grants (bindings of one name are alternatives), the <code>authorization</code> as authup&#39;s two-layer snapshot with the holder&#39;s <code>identity</code> and <code>realm</code> as the resource realm. <code>canSome</code> counts a policy whose data is missing as passed (may the holder do this to some resource?). <code>options.now</code> feeds the <code>date</code> and <code>time</code> policies (default the real clock), the holder&#39;s <code>identity</code> the <code>identity</code> policies. Both never reject: an entry that is not a binding, a binding with a <code>realmMatch</code> node, a policy that cannot be evaluated, a malformed <code>authorization</code> or one without an <code>identity</code> grants nothing. Built evaluators are cached per holder object; treat a holder as immutable.</p><h2 id="names-and-helpers" tabindex="-1">Names and helpers <a class="header-anchor" href="#names-and-helpers" aria-label="Permalink to &quot;Names and helpers&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> Permission: {</span></span>
<span class="line"><span style="color:#E3E5EA;">    AGENT_READ: </span><span style="color:#E7C58C;">&#39;chamvi_agent_read&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    AGENT_RUN: </span><span style="color:#E7C58C;">&#39;chamvi_agent_run&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    AGENT_APPROVE: </span><span style="color:#E7C58C;">&#39;chamvi_agent_approve&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    RUN_READ: </span><span style="color:#E7C58C;">&#39;chamvi_run_read&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    RUN_CANCEL: </span><span style="color:#E7C58C;">&#39;chamvi_run_cancel&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    STATE_READ: </span><span style="color:#E7C58C;">&#39;chamvi_state_read&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    STATE_WRITE: </span><span style="color:#E7C58C;">&#39;chamvi_state_write&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONNECTION_READ: </span><span style="color:#E7C58C;">&#39;chamvi_connection_read&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONNECTION_WRITE: </span><span style="color:#E7C58C;">&#39;chamvi_connection_write&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    CONNECTION_CREATE: </span><span style="color:#E7C58C;">&#39;chamvi_connection_create&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    TOOL_USE: </span><span style="color:#E7C58C;">&#39;chamvi_tool_use&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    KNOWLEDGE_READ: </span><span style="color:#E7C58C;">&#39;chamvi_knowledge_read&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    KNOWLEDGE_WRITE: </span><span style="color:#E7C58C;">&#39;chamvi_knowledge_write&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    COMPONENT_READ: </span><span style="color:#E7C58C;">&#39;chamvi_component_read&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> PERMISSION_NAMES: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> string[];                     </span><span style="color:#80858F;">// the fourteen, in this order</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> isPermissionBinding(value: unknown): value </span><span style="color:#8EA7FF;">is</span><span style="color:#E3E5EA;"> PermissionBinding;            </span><span style="color:#80858F;">// upstream&#39;s isPermissionPolicyBinding</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> isPermissionAuthorization(value: unknown): value </span><span style="color:#8EA7FF;">is</span><span style="color:#E3E5EA;"> PermissionAuthorization; </span><span style="color:#80858F;">// shallow shape check</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> allPermissions(): PermissionBinding[];                </span><span style="color:#80858F;">// one unrestricted binding per name</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> permissionNames(holder: PermissionHolder): string[];  </span><span style="color:#80858F;">// names of the bindings and of the snapshot&#39;s grants</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { AuthorizationSnapshot, PermissionPolicyBinding } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@authup/access&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * One grant: a permission name and the policies that must pass for it,</span></span>
<span class="line"><span style="color:#80858F;"> * authup&#39;s own binding shape with resolved policy trees (plain data).</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> PermissionBinding = PermissionPolicyBinding;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** What an \`identity\` policy needs; set by authup(), absent for tokens. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> PermissionIdentity = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    type: </span><span style="color:#E7C58C;">&#39;user&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;client&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    id: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    realmId?: string | null;</span></span>
<span class="line"><span style="color:#E3E5EA;">    realmName?: string | null;</span></span>
<span class="line"><span style="color:#E3E5EA;">    clientId?: string | null;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * authup&#39;s two-layer authorization of an identity: the definitions a check</span></span>
<span class="line"><span style="color:#80858F;"> * may ask for and the identity&#39;s grants (plain JSON, \`buildAuthorizationSnapshot\`).</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> PermissionAuthorization = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    snapshot: AuthorizationSnapshot;</span></span>
<span class="line"><span style="color:#80858F;">    /** The realm chamvi&#39;s resources belong to; every check reaches into it. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    realm: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The owner client id. Present, every check asks only that client&#39;s</span></span>
<span class="line"><span style="color:#80858F;">     * definition in \`realm\`; absent, the global then the realm-owned one.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    client?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Anything that holds grants: a principal, a run&#39;s invoker. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> PermissionHolder = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Self-contained bindings (static tokens, oidc mappers, direct dispatch). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    bindings: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> PermissionBinding[];</span></span>
<span class="line"><span style="color:#80858F;">    /** Set by authup(): the identity&#39;s snapshot, evaluated together with \`identity\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    authorization?: PermissionAuthorization;</span></span>
<span class="line"><span style="color:#E3E5EA;">    identity?: PermissionIdentity;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> PermissionCheckOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** The resource. Absent: the check asks about every resource of that kind. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    attributes?: Record&lt;string, unknown&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** Feeds the date and time policies. Default: the real clock. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    now?: Date;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div>`,10)])])}const h=n(l,[["render",p]]);export{y as __pageData,h as default};
