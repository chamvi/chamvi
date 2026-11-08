import{_ as a,o as n,c as e,a2 as o}from"./chunks/framework.a6FUKr6c.js";const u=JSON.parse('{"title":"@chamvi/ui","description":"","frontmatter":{},"headers":[],"relativePath":"reference/ui.md","filePath":"reference/ui.md","lastUpdated":1794163299000}'),p={name:"reference/ui.md"};function l(t,s,c,i,r,d){return n(),e("div",null,[...s[0]||(s[0]=[o(`<h1 id="chamvi-ui" tabindex="-1">@chamvi/ui <a class="header-anchor" href="#chamvi-ui" aria-label="Permalink to &quot;@chamvi/ui&quot;">​</a></h1><p>The dashboard, served by <code>@chamvi/http</code>. The public API of <code>packages/ui/src/index.ts</code>; the app itself is a prebuilt bundle in <code>dist/app</code>.</p><div class="language-bash"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#DCE9F2;">npm </span><span style="color:#E7C58C;">install</span><span style="color:#E7C58C;"> @chamvi/ui</span><span style="color:#E7C58C;"> @chamvi/http</span><span style="color:#E7C58C;"> @chamvi/core</span><span style="color:#E7C58C;"> --save</span></span></code></pre></div><p><code>@chamvi/core</code> and <code>@chamvi/http</code> are peer dependencies. See <a href="/guide/ui">Dashboard</a> for the pages, sign-in and serving rules. The run page&#39;s lineage view (parent link, dispatched runs, subtree total) reads <code>GET /runs?filter[parent]=&lt;id&gt;</code> from the <code>@chamvi/http</code> version it is served with, so serve both at the same version.</p><h2 id="uiroutes" tabindex="-1">uiRoutes <a class="header-anchor" href="#uiroutes" aria-label="Permalink to &quot;uiRoutes&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> uiRoutes(options?: UiRoutesOptions): HttpRoute[];</span></span></code></pre></div><p>One unauthenticated, not rate-limited <code>GET</code> prefix route at <code>basePath</code> for <code>createHttpApp({ routes })</code>. Throws <code>InvalidAgentDefinitionError</code> for a <code>basePath</code> that is not a lower-case path, an <code>auth.authup.url</code> that is no absolute http(s) URL, an empty <code>clientId</code>, <code>auth.tokens: false</code> without <code>auth.authup</code>, and an empty <code>root</code>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { UiAuthupConfig } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../config/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> UiRoutesOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The dashboard&#39;s path under the app&#39;s \`basePath\` (lower case). Default \`/ui\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    basePath?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    auth?: {</span></span>
<span class="line"><span style="color:#7F95A6;">        /** Offer the token-paste sign-in. Default \`true\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">        tokens?: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">        authup?: UiAuthupConfig;</span></span>
<span class="line"><span style="color:#DCE9F2;">    };</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The build folder. Default the package&#39;s \`dist/app\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    root?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** One file of the build. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> BuildFile = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    bytes: Uint8Array;</span></span>
<span class="line"><span style="color:#DCE9F2;">    type: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Under \`assets/\`: content-hashed, cached for a year. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    immutable: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><h2 id="config" tabindex="-1">Config <a class="header-anchor" href="#config" aria-label="Permalink to &quot;Config&quot;">​</a></h2><p>The block <code>uiRoutes()</code> injects into <code>index.html</code> (element id <code>CONFIG_ELEMENT_ID</code>).</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> UiAuthupConfig = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The authup API URL, e.g. \`https://auth.example.com/api\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    url: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The authup client the dashboard signs in as (code flow with PKCE). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    clientId: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    realmId?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** What the server injects into \`index.html\` for the SPA. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> UiConfig = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The chamvi API base (the app&#39;s \`basePath\`, \`&#39;&#39;\` by default). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    apiBase: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Where the dashboard is mounted, e.g. \`/ui\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    uiBase: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    auth: {</span></span>
<span class="line"><span style="color:#7F95A6;">        /** Offer the token-paste sign-in (static bearer tokens). */</span></span>
<span class="line"><span style="color:#DCE9F2;">        tokens: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">        authup?: UiAuthupConfig;</span></span>
<span class="line"><span style="color:#DCE9F2;">    };</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><h2 id="constants" tabindex="-1">Constants <a class="header-anchor" href="#constants" aria-label="Permalink to &quot;Constants&quot;">​</a></h2><table tabindex="0"><thead><tr><th>Constant</th><th>Value</th></tr></thead><tbody><tr><td><code>DEFAULT_UI_BASE_PATH</code></td><td><code>&#39;/ui&#39;</code></td></tr><tr><td><code>ASSET_CACHE_CONTROL</code></td><td><code>&#39;public, max-age=31536000, immutable&#39;</code></td></tr><tr><td><code>DOCUMENT_CACHE_CONTROL</code></td><td><code>&#39;no-cache&#39;</code></td></tr><tr><td><code>CONFIG_ELEMENT_ID</code></td><td><code>&#39;chamvi-config&#39;</code></td></tr></tbody></table><h2 id="module" tabindex="-1">Module <a class="header-anchor" href="#module" aria-label="Permalink to &quot;Module&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">// @chamvi/ui/module, needs @chamvi/app</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> uiModule(options?: UiModuleOptions): IModule; </span><span style="color:#7F95A6;">// name UI_MODULE_NAME &#39;chamvi:ui&#39;</span></span></code></pre></div><p>Contributes <code>uiRoutes()</code> to the app&#39;s routes (<code>/ui</code> under <code>CHAMVI_BASE_PATH</code>). Reads <code>CHAMVI_UI_AUTHUP_CLIENT_ID</code>, <code>CHAMVI_UI_AUTHUP_REALM_ID</code> and <code>AUTHUP_URL</code> from <code>options.env ?? process.env</code> when it is called, unless <code>auth</code> is given. It provides no context (tools have nothing to reach). <code>@chamvi/app</code> is an optional peer: the main entry never imports it.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { Env } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/app&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { UiRoutesOptions } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../routes/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`uiRoutes()\` options; \`auth\` defaults to the token login plus authup from env. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> UiModuleOptions = UiRoutesOptions &amp; {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Default \`process.env\`, read when the factory is called. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    env?: Env;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div>`,17)])])}const y=a(p,[["render",l]]);export{u as __pageData,y as default};
