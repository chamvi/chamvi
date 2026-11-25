import{_ as a,o as n,c as e,a2 as o}from"./chunks/framework.DiXyETtc.js";const u=JSON.parse('{"title":"@chamvi/ui","description":"","frontmatter":{},"headers":[],"relativePath":"reference/ui.md","filePath":"reference/ui.md","lastUpdated":1795610857000}'),t={name:"reference/ui.md"};function p(l,s,c,i,r,d){return n(),e("div",null,[...s[0]||(s[0]=[o(`<h1 id="chamvi-ui" tabindex="-1">@chamvi/ui <a class="header-anchor" href="#chamvi-ui" aria-label="Permalink to &quot;@chamvi/ui&quot;">​</a></h1><p>The dashboard, served by <code>@chamvi/http</code>. The public API of <code>packages/ui/src/index.ts</code>; the app itself is a prebuilt bundle in <code>dist/app</code>.</p><div class="language-bash"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#E3E5EA;">npm </span><span style="color:#E7C58C;">install</span><span style="color:#E7C58C;"> @chamvi/ui</span><span style="color:#E7C58C;"> @chamvi/http</span><span style="color:#E7C58C;"> @chamvi/core</span><span style="color:#E7C58C;"> --save</span></span></code></pre></div><p><code>@chamvi/core</code> and <code>@chamvi/http</code> are peer dependencies. See <a href="/guide/ui">Dashboard</a> for the pages, sign-in and serving rules. The run page&#39;s lineage view (parent link, dispatched runs, subtree total) reads <code>GET /runs?filter[parent]=&lt;id&gt;</code> from the <code>@chamvi/http</code> version it is served with, so serve both at the same version.</p><h2 id="uiroutes" tabindex="-1">uiRoutes <a class="header-anchor" href="#uiroutes" aria-label="Permalink to &quot;uiRoutes&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> uiRoutes(options?: UiRoutesOptions): HttpRoute[];</span></span></code></pre></div><p>One unauthenticated, not rate-limited <code>GET</code> prefix route at <code>basePath</code> for <code>createHttpApp({ routes })</code>. Throws <code>InvalidAgentDefinitionError</code> for a <code>basePath</code> that is not a lower-case path, an <code>auth.authup.url</code> that is no absolute http(s) URL, an empty <code>clientId</code>, <code>auth.tokens: false</code> without <code>auth.authup</code>, and an empty <code>root</code>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { UiAuthupConfig } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../config/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> UiRoutesOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** The dashboard&#39;s path under the app&#39;s \`basePath\` (lower case). Default \`/ui\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    basePath?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    auth?: {</span></span>
<span class="line"><span style="color:#80858F;">        /** Offer the token-paste sign-in. Default \`true\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">        tokens?: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">        authup?: UiAuthupConfig;</span></span>
<span class="line"><span style="color:#E3E5EA;">    };</span></span>
<span class="line"><span style="color:#80858F;">    /** The build folder. Default the package&#39;s \`dist/app\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    root?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><h2 id="config" tabindex="-1">Config <a class="header-anchor" href="#config" aria-label="Permalink to &quot;Config&quot;">​</a></h2><p>The block <code>uiRoutes()</code> injects into <code>index.html</code> (element id <code>CONFIG_ELEMENT_ID</code>).</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> UiAuthupConfig = {</span></span>
<span class="line"><span style="color:#80858F;">    /** The authup API URL, e.g. \`https://auth.example.com/api\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    url: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The authup client the dashboard signs in as (code flow with PKCE). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    clientId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    realmId?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** What the server injects into \`index.html\` for the SPA. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> UiConfig = {</span></span>
<span class="line"><span style="color:#80858F;">    /** The chamvi API base (the app&#39;s \`basePath\`, \`&#39;&#39;\` by default). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    apiBase: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Where the dashboard is mounted, e.g. \`/ui\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    uiBase: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    auth: {</span></span>
<span class="line"><span style="color:#80858F;">        /** Offer the token-paste sign-in (static bearer tokens). */</span></span>
<span class="line"><span style="color:#E3E5EA;">        tokens: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">        authup?: UiAuthupConfig;</span></span>
<span class="line"><span style="color:#E3E5EA;">    };</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><h2 id="constants" tabindex="-1">Constants <a class="header-anchor" href="#constants" aria-label="Permalink to &quot;Constants&quot;">​</a></h2><table tabindex="0"><thead><tr><th>Constant</th><th>Value</th></tr></thead><tbody><tr><td><code>DEFAULT_UI_BASE_PATH</code></td><td><code>&#39;/ui&#39;</code></td></tr><tr><td><code>ASSET_CACHE_CONTROL</code></td><td><code>&#39;public, max-age=31536000, immutable&#39;</code></td></tr><tr><td><code>DOCUMENT_CACHE_CONTROL</code></td><td><code>&#39;no-cache&#39;</code></td></tr><tr><td><code>CONFIG_ELEMENT_ID</code></td><td><code>&#39;chamvi-config&#39;</code></td></tr></tbody></table><h2 id="module" tabindex="-1">Module <a class="header-anchor" href="#module" aria-label="Permalink to &quot;Module&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">// @chamvi/ui/module, needs @chamvi/app</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> uiModule(options?: UiModuleOptions): IModule; </span><span style="color:#80858F;">// name UI_MODULE_NAME &#39;chamvi:ui&#39;</span></span></code></pre></div><p>Contributes <code>uiRoutes()</code> to the app&#39;s routes (<code>/ui</code> under <code>CHAMVI_BASE_PATH</code>). Reads <code>AUTHUP_URL</code>, <code>CHAMVI_UI_AUTHUP_CLIENT_ID</code>, <code>CHAMVI_UI_AUTHUP_REALM_ID</code> and <code>AUTHUP_REALM</code> from <code>options.env ?? process.env</code> when it is called, unless <code>auth</code> is given (with <code>AUTHUP_URL</code> set, the authup login as the client <code>chamvi</code> of the realm <code>master</code> by default), and shares that sign-in with every <code>*-ui</code> page. It provides no context (tools have nothing to reach). <code>@chamvi/app</code> is an optional peer: the main entry never imports it.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
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
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div>`,17)])])}const E=a(t,[["render",p]]);export{u as __pageData,E as default};
