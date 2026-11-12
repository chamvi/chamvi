import{_ as n,o as a,c as e,a2 as o}from"./chunks/framework.a6FUKr6c.js";const h=JSON.parse('{"title":"@chamvi/access","description":"","frontmatter":{},"headers":[],"relativePath":"reference/access.md","filePath":"reference/access.md","lastUpdated":1794504758000}'),l={name:"reference/access.md"};function p(c,s,t,i,r,d){return a(),e("div",null,[...s[0]||(s[0]=[o(`<h1 id="chamvi-access" tabindex="-1">@chamvi/access <a class="header-anchor" href="#chamvi-access" aria-label="Permalink to &quot;@chamvi/access&quot;">​</a></h1><p>Permission checks over authup permission bindings, the same in Node.js and the browser. The public API of <code>packages/access/src/index.ts</code>; <code>@chamvi/core</code>, <code>@chamvi/http</code>, <code>@chamvi/app</code> (which re-exports it) and the dashboard use it.</p><div class="language-bash"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#DCE9F2;">npm </span><span style="color:#E7C58C;">install</span><span style="color:#E7C58C;"> @chamvi/access</span><span style="color:#E7C58C;"> --save</span></span></code></pre></div><p>It depends on <code>@authup/access</code> and on no other <code>@chamvi/*</code> package. See <a href="/guide/permissions">Permissions and authup</a> for the names, their attributes and the authup setup.</p><h2 id="checks" tabindex="-1">Checks <a class="header-anchor" href="#checks" aria-label="Permalink to &quot;Checks&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> can(holder: PermissionHolder, name: string, options?: PermissionCheckOptions): Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> canSome(holder: PermissionHolder, name: string, options?: PermissionCheckOptions): Promise&lt;boolean&gt;;</span></span></code></pre></div><p><code>can</code> is true when one binding of that name passes for the resource in <code>options.attributes</code>; without attributes a policy over them fails (the check asks about every resource). <code>canSome</code> counts a policy whose data is missing as passed (may the holder do this to some resource?). <code>options.now</code> feeds the <code>date</code> and <code>time</code> policies (default the real clock), the holder&#39;s <code>identity</code> the <code>identity</code> policies. Both never reject: an entry that is not a binding or a policy that cannot be evaluated grants nothing.</p><h2 id="names-and-helpers" tabindex="-1">Names and helpers <a class="header-anchor" href="#names-and-helpers" aria-label="Permalink to &quot;Names and helpers&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> Permission: {</span></span>
<span class="line"><span style="color:#DCE9F2;">    AGENT_READ: </span><span style="color:#E7C58C;">&#39;chamvi_agent_read&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    AGENT_RUN: </span><span style="color:#E7C58C;">&#39;chamvi_agent_run&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    AGENT_APPROVE: </span><span style="color:#E7C58C;">&#39;chamvi_agent_approve&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    RUN_READ: </span><span style="color:#E7C58C;">&#39;chamvi_run_read&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    RUN_CANCEL: </span><span style="color:#E7C58C;">&#39;chamvi_run_cancel&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    STATE_READ: </span><span style="color:#E7C58C;">&#39;chamvi_state_read&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    STATE_WRITE: </span><span style="color:#E7C58C;">&#39;chamvi_state_write&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    CONNECTION_READ: </span><span style="color:#E7C58C;">&#39;chamvi_connection_read&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    CONNECTION_WRITE: </span><span style="color:#E7C58C;">&#39;chamvi_connection_write&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    CONNECTION_CREATE: </span><span style="color:#E7C58C;">&#39;chamvi_connection_create&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    TOOL_USE: </span><span style="color:#E7C58C;">&#39;chamvi_tool_use&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    KNOWLEDGE_READ: </span><span style="color:#E7C58C;">&#39;chamvi_knowledge_read&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    KNOWLEDGE_WRITE: </span><span style="color:#E7C58C;">&#39;chamvi_knowledge_write&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> PERMISSION_NAMES: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[];                     </span><span style="color:#7F95A6;">// the thirteen, in this order</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> isPermissionBinding(value: unknown): value </span><span style="color:#8FD0F2;">is</span><span style="color:#DCE9F2;"> PermissionBinding;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> allPermissions(): PermissionBinding[];                </span><span style="color:#7F95A6;">// one unrestricted binding per name</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> permissionNames(holder: PermissionHolder): string[];  </span><span style="color:#7F95A6;">// distinct granted names</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { PermissionPolicyBinding } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@authup/access&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * One grant: a permission name and the policies that must pass for it,</span></span>
<span class="line"><span style="color:#7F95A6;"> * authup&#39;s own binding shape with resolved policy trees (plain data).</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> PermissionBinding = PermissionPolicyBinding;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** What an \`identity\` policy needs; set by authup(), absent for tokens. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> PermissionIdentity = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    type: </span><span style="color:#E7C58C;">&#39;user&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;client&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    id: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    realmId?: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    realmName?: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    clientId?: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** Anything that holds bindings: a principal, a run&#39;s invoker. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> PermissionHolder = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    bindings: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> PermissionBinding[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    identity?: PermissionIdentity;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> PermissionCheckOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The resource. Absent: the check asks about every resource of that kind. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    attributes?: Record&lt;string, unknown&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Feeds the date and time policies. Default: the real clock. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    now?: Date;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div>`,10)])])}const C=n(l,[["render",p]]);export{h as __pageData,C as default};
