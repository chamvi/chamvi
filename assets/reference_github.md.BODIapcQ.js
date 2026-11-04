import{_ as n,o as a,c as e,a2 as l}from"./chunks/framework.Di-jvWLj.js";const u=JSON.parse('{"title":"@chamvi/github","description":"","frontmatter":{},"headers":[],"relativePath":"reference/github.md","filePath":"reference/github.md","lastUpdated":1793807845000}'),p={name:"reference/github.md"};function o(t,s,c,r,i,y){return a(),e("div",null,[...s[0]||(s[0]=[l(`<h1 id="chamvi-github" tabindex="-1">@chamvi/github <a class="header-anchor" href="#chamvi-github" aria-label="Permalink to &quot;@chamvi/github&quot;">​</a></h1><p>The GitHub channel (webhook deliveries in, issue comments out) and GitHub tools for chamvi agents. The public API of <code>packages/github/src/index.ts</code>.</p><div class="language-bash"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#DCE9F2;">npm </span><span style="color:#E7C58C;">install</span><span style="color:#E7C58C;"> @chamvi/github</span><span style="color:#E7C58C;"> @chamvi/http</span><span style="color:#E7C58C;"> @chamvi/core</span><span style="color:#E7C58C;"> ai</span><span style="color:#E7C58C;"> --save</span></span></code></pre></div><p><code>@chamvi/core</code>, <code>@chamvi/http</code> and <code>ai</code> are peer dependencies. See <a href="/deployment/github-app">GitHub App</a> for setup and behaviour.</p><h2 id="creategithubapp" tabindex="-1">createGithubApp <a class="header-anchor" href="#creategithubapp" aria-label="Permalink to &quot;createGithubApp&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> createGithubApp(options: GithubAppOptions): IGithubApp;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> DEFAULT_GITHUB_API_URL: </span><span style="color:#E7C58C;">&#39;https://api.github.com&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> INSTALLATION_CACHE_TTL_MS: </span><span style="color:#E7C58C;">600_000</span><span style="color:#DCE9F2;">;</span></span></code></pre></div><p>Throws <code>InvalidAgentDefinitionError</code> for an empty <code>appId</code>, a key that is no RSA private key, an empty webhook secret, an <code>installationId</code> that is no positive integer, a <code>baseUrl</code> that is no absolute https URL without query (empty means <code>https://api.github.com</code>) and a <code>slug</code> that is not the App&#39;s lower-case slug (<code>^[a-z0-9]+(-[a-z0-9]+)*$</code>, as in the App&#39;s URL; a miscased one would silently disable the self guard).</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { ToolSet } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;ai&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { IClock } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { PaginatedOctokit } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;./helpers.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubAppOptions = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    appId: string | number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** PEM (PKCS#1 or PKCS#8); literal &quot;\\n&quot; sequences become newlines. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    privateKey: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Several during a secret rotation; a delivery verifies under any. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    webhookSecret: string | </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[];</span></span>
<span class="line"><span style="color:#7F95A6;">    /** For runs not started by a delivery (cron, http, mcp) and comments on their behalf. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    installationId?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The App&#39;s slug; skips \`GET /app\` for the bot login. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    slug?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Default DEFAULT_GITHUB_API_URL (&#39;https://api.github.com&#39;). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    baseUrl?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    clock?: IClock;</span></span>
<span class="line"><span style="color:#DCE9F2;">    fetch?: </span><span style="color:#8FD0F2;">typeof</span><span style="color:#DCE9F2;"> globalThis.fetch;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Opt in to file proposals, limited to these repositories and repository-relative globs. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    proposals?: GithubProposalsOptions;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The allowlist for \`github_propose_change\`; \`.github/**\` is always forbidden. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubProposalsOptions = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    repos: Record&lt;string, { paths: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[] }&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** An Octokit (\`@octokit/core\` with \`paginate\`). */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubOctokit = InstanceType&lt;</span><span style="color:#8FD0F2;">typeof</span><span style="color:#DCE9F2;"> PaginatedOctokit&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** GitHub App permissions of a token, e.g. \`{ contents: &#39;write&#39;, workflows: &#39;write&#39; }\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubPermissions = Record&lt;string, </span><span style="color:#E7C58C;">&#39;read&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;write&#39;</span><span style="color:#DCE9F2;">&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** A short-lived token of one repository (\`IGithubApp.repositoryToken\`). */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubRepositoryToken = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    token: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    expiresAt: Date;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The App&#39;s bot as a git commit identity. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubBotIdentity = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`&lt;slug&gt;[bot]\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    name: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`&lt;bot user id&gt;+&lt;slug&gt;[bot]@users.noreply.github.com\`, which GitHub links to the bot. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    email: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** An installation of the App (\`IGithubApp.installations()\`). */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubInstallation = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    id: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The account login, e.g. \`tada5hi\` or an org. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    account: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`User\` or \`Organization\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    accountType: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    repositorySelection: </span><span style="color:#E7C58C;">&#39;all&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;selected&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    permissions: GithubPermissions;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Whether the account suspended the App (\`suspended_at\` set): its token exchange answers 403. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    suspended: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** A merge method of \`github_merge_pull_request\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubMergeMethod = </span><span style="color:#E7C58C;">&#39;merge&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;squash&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;rebase&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** Options of \`IGithubApp.writeTools()\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubWriteToolsOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The merge method when a call names none (default DEFAULT_MERGE_METHOD, \`squash\`). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    mergeMethod?: GithubMergeMethod;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> IGithubApp {</span></span>
<span class="line"><span style="color:#8FD0F2;">    readonly</span><span style="color:#DCE9F2;"> appId: string;</span></span>
<span class="line"><span style="color:#8FD0F2;">    readonly</span><span style="color:#DCE9F2;"> installationId?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** An Octokit authenticated as the installation (cached token). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    octokit(installationId: number): Promise&lt;GithubOctokit&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`&lt;slug&gt;[bot]\`, from \`slug\` or one \`GET /app\`; cached, single-flight. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    botLogin(): Promise&lt;string&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The bot as a commit identity (\`GET /users/&lt;login&gt;\` for its user id,</span></span>
<span class="line"><span style="color:#7F95A6;">     * once; a failure is not cached), e.g. the workspace manager&#39;s \`author\`.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    botIdentity(): Promise&lt;GithubBotIdentity&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * A token limited to one repository and \`permissions\` (the deferred</span></span>
<span class="line"><span style="color:#7F95A6;">     * scoped token of plan 014): the App&#39;s installation on the repository</span></span>
<span class="line"><span style="color:#7F95A6;">     * (\`GET /repos/{owner}/{repo}/installation\`), then an exchange with</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`repositories: [repo]\`. Cached per repository and permissions until 5</span></span>
<span class="line"><span style="color:#7F95A6;">     * minutes before it expires, concurrent callers share one exchange, a</span></span>
<span class="line"><span style="color:#7F95A6;">     * failure is not cached. Undefined when the App is not installed there.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    repositoryToken(target: { owner: string; repo: string }, options: { permissions: GithubPermissions }): Promise&lt;GithubRepositoryToken | undefined&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The App&#39;s installation on the repository (App JWT \`GET</span></span>
<span class="line"><span style="color:#7F95A6;">     * /repos/{owner}/{repo}/installation\`), cached per lower-cased</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`owner/repo\` for INSTALLATION_CACHE_TTL_MS on the clock; concurrent</span></span>
<span class="line"><span style="color:#7F95A6;">     * callers share one lookup. Undefined (not cached) when the App is not</span></span>
<span class="line"><span style="color:#7F95A6;">     * installed there; a failure is a \`github_request\` ChamviError and not</span></span>
<span class="line"><span style="color:#7F95A6;">     * cached.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    installationFor(target: { owner: string; repo: string }): Promise&lt;number | undefined&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The whole installation \`installationFor()\` looked up (account,</span></span>
<span class="line"><span style="color:#7F95A6;">     * permissions), from the same cache; undefined where the App is not</span></span>
<span class="line"><span style="color:#7F95A6;">     * installed.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    repositoryInstallation(target: { owner: string; repo: string }): Promise&lt;GithubInstallation | undefined&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Every installation of the App (\`GET /app/installations\`, paginated), not cached. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    installations(): Promise&lt;GithubInstallation[]&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`sha256=&lt;hex&gt;\` of the raw body under any webhook secret, compared in constant time. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    verifySignature(body: Uint8Array, signature: string | null): boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The read-only tools (\`github_get_issue\`, \`github_search_issues\`,</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`github_list_pull_requests\`, ...), each acting as the installation of</span></span>
<span class="line"><span style="color:#7F95A6;">     * the repository it names.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    readTools(): ToolSet;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The write tools (\`github_add_labels\`, \`github_create_comment\`,</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`github_close_issue\`, \`github_create_issue\`,</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`github_create_pull_request\`, \`github_merge_pull_request\`), effect</span></span>
<span class="line"><span style="color:#7F95A6;">     * tools applied at most once per run. An unknown \`mergeMethod\` is an</span></span>
<span class="line"><span style="color:#7F95A6;">     * InvalidAgentDefinitionError.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    writeTools(options?: GithubWriteToolsOptions): ToolSet;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span></code></pre></div><p><code>installationFor({ owner, repo })</code> answers the App&#39;s installation on a repository (App JWT, cached per lower-cased <code>owner/repo</code> for <code>INSTALLATION_CACHE_TTL_MS</code> on the clock, concurrent callers sharing one lookup; <code>undefined</code>, not cached, where the App is not installed); <code>repositoryInstallation({ owner, repo })</code> answers the whole installation of that lookup (<code>GithubInstallation</code>, permissions included) from the same cache; <code>installations()</code> lists every installation (<code>GET /app/installations</code>, not cached). <code>writeTools({ mergeMethod })</code> throws <code>InvalidAgentDefinitionError</code> for a method outside <code>MERGE_METHODS</code>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> GITHUB_REQUEST_ERROR_CODE: </span><span style="color:#E7C58C;">&#39;github_request&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> REPO_PATTERN: string; </span><span style="color:#7F95A6;">// &#39;^([\\\\w.-]*[\\\\w-][\\\\w.-]*)/([\\\\w.-]*[\\\\w-][\\\\w.-]*)$&#39;</span></span></code></pre></div><p><code>GITHUB_REQUEST_ERROR_CODE</code> is the <code>code</code> of every failed GitHub request (the tools&#39; errors and the channel&#39;s send failures); <code>REPO_PATTERN</code> is the <code>owner/name</code> rule the tools apply (GitHub&#39;s name characters, each segment with one that is not a dot, so <code>.</code> and <code>..</code> never fold the URL into another API path). Build a <code>RegExp</code> from it.</p><h2 id="githubchannel" tabindex="-1">githubChannel <a class="header-anchor" href="#githubchannel" aria-label="Permalink to &quot;githubChannel&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> githubChannel(options: GithubChannelOptions): GithubChannel; </span><span style="color:#7F95A6;">// IChannel with in and out, plus on() and to() bound to its name</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> GITHUB_CHANNEL_NAME: </span><span style="color:#E7C58C;">&#39;github&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> GITHUB_CHANNEL_TIMEOUT_MS: </span><span style="color:#E7C58C;">30_000</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> COMMENT_BODY_MAX_LENGTH: </span><span style="color:#E7C58C;">60_000</span><span style="color:#DCE9F2;">;</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/** What \`approvalUrl\` gets: ids only, never a token. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubApprovalRef = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    runId: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    approvalId: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    agent: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubChannelOptions = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    app: IGithubApp;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The channel name; default \`&#39;github&#39;\`. A second instance needs its own. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    name?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Persistent-comment coordination; defaults to local memory. Share across replicas. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    locks?: IStore[</span><span style="color:#E7C58C;">&#39;locks&#39;</span><span style="color:#DCE9F2;">];</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Logins mentioned at the top of every comment (without \`@\`). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    mention?: string | </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[];</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * A link to the approval in the chamvi UI, e.g.</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`https://&lt;app&gt;/ui/approvals?run=&lt;runId&gt;&amp;approval=&lt;approvalId&gt;\`, where the</span></span>
<span class="line"><span style="color:#7F95A6;">     * signed-in owner answers it; it carries no token.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    approvalUrl?: (ref: GithubApprovalRef) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Bound of one comment send; default \`GITHUB_CHANNEL_TIMEOUT_MS\` (30 s). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    timeoutMs?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Bytes a delivery may have (413 above); default 1 MiB. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    bodyLimit?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Receives each agent a delivery could not be dispatched to (a throwing</span></span>
<span class="line"><span style="color:#7F95A6;">     * filter or key function, a refused key, a failed dispatch); the delivery</span></span>
<span class="line"><span style="color:#7F95A6;">     * is then answered 500. Default \`console.error(&#39;[chamvi]&#39;, error)\`.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    onError?: (error: unknown) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> void;</span></span>
<span class="line"><span style="color:#DCE9F2;">    clock?: IClock;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The GitHub channel: deliveries \`in\`, issue and pull request comments \`out\`, with \`on()\` and \`to()\` bound to its name. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubChannel = IChannel&lt;ChannelRequest, Response&gt; &amp; GithubSubscriber;</span></span></code></pre></div><p>Every option is checked when <code>githubChannel()</code> is called (<code>InvalidAgentDefinitionError</code>). Register the channel on the engine and list it in <code>createHttpApp({ channels })</code>, which serves its <code>in</code> at <code>POST /channels/&lt;name&gt;</code> (the deliveries: signature, self guard, one run per matching agent, <code>202</code> with a <code>GithubWebhookResult</code>). Its <code>out(message, address)</code> comments on the issue or pull request <code>address</code> names (<code>owner/repo#n</code>, else a <code>ValidationError</code>), deduplicated by the marker <code>effectMarker(message.key)</code>. An approval with options lists them fenced as <code>- &lt;id&gt;: &lt;label&gt;</code> under <code>Options (choose one):</code> (or <code>Options (choose one or more):</code>), the body is cut by that block&#39;s length, and the link line reads <code>Choose and approve or deny: &lt;link&gt;</code>. See <a href="/deployment/github-app">GitHub App</a> for both directions.</p><p>Send <code>emit({ body, slot: &#39;status&#39; })</code> or <code>approve({ title, slot: &#39;status&#39; })</code> to create/update one persistent comment per GitHub App, repository, issue/PR, channel, agent and named slot. <code>slot</code> must be a non-empty, well-formed Unicode string without NUL characters; omitting it appends an ordinary comment. A channel and agent can mix ordinary comments and multiple slots. Approval slots survive notification retries and recovery. <code>locks?: ILockRepository</code> coordinates slot lookup and write; standalone channels default to local memory, while <code>githubModule()</code> supplies the app store&#39;s locks when needed. A busy slot is waited for with backoff within <code>timeoutMs</code>, then fails with <code>github_request</code> for retry; the lock release runs in the background (failures to <code>onError</code>) and never fails a delivered comment. Persistent lookup has no time cutoff and pages every comment (no durable comment id cache), so very long threads can outlast <code>timeoutMs</code>; it requires the stable marker and App bot identity, and PATCH errors never create a replacement in the same attempt. See <a href="/deployment/github-app#persistent-status-comments">persistent status comments</a> for replica and ordering limits.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The \`202\` answer to a delivery: the run each matching agent got (deduplicated on a redelivery). */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubWebhookResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    delivery: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    runs: Array&lt;{</span></span>
<span class="line"><span style="color:#DCE9F2;">        agent: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">        runId: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">        deduplicated: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    }&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><h2 id="github-on-github-to" tabindex="-1">github.on, github.to <a class="header-anchor" href="#github-on-github-to" aria-label="Permalink to &quot;github.on, github.to&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> github: GithubSubscriber; </span><span style="color:#7F95A6;">// github.on(events, options?), github.to({ repo, number }) for the channel named &#39;github&#39;</span></span></code></pre></div><p><code>github.on()</code> throws <code>InvalidAgentDefinitionError</code> without events or for an event that is not <code>name</code> or <code>name.action</code> (lower case letters, digits and underscores, e.g. <code>projects_v2_item.created</code>), and for a <code>selfEvents</code> entry of that shape naming <code>issue_comment</code>, <code>issues</code> or <code>pull_request_review_comment</code> (the bot&#39;s own comment would start the agent again). A bot-sent delivery starts each agent&#39;s first matching subscription whose <code>selfEvents</code> name it; a bare <code>pull_request</code> there also takes the <code>labeled</code>, <code>closed</code> and <code>synchronize</code> deliveries the agent&#39;s own tools and pushes cause, so name the actions (<code>pull_request.opened</code>). A delivery the App&#39;s bot sent reaches only subscriptions whose <code>selfEvents</code> name its event. <code>github.to({ repo, number })</code> returns the address <code>&lt;owner&gt;/&lt;repo&gt;#&lt;number&gt;</code>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { ChannelSubscription } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The parts of a GitHub webhook body chamvi reads; the rest passes through. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubPayload = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    action?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    installation?: { id: number };</span></span>
<span class="line"><span style="color:#DCE9F2;">    repository?: {</span></span>
<span class="line"><span style="color:#DCE9F2;">        id?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">        full_name: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">        [key: string]: unknown</span></span>
<span class="line"><span style="color:#DCE9F2;">    };</span></span>
<span class="line"><span style="color:#DCE9F2;">    sender?: {</span></span>
<span class="line"><span style="color:#DCE9F2;">        login: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">        type: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">        [key: string]: unknown</span></span>
<span class="line"><span style="color:#DCE9F2;">    };</span></span>
<span class="line"><span style="color:#DCE9F2;">    issue?: { number: number; [key: string]: unknown };</span></span>
<span class="line"><span style="color:#DCE9F2;">    pull_request?: { number: number; [key: string]: unknown };</span></span>
<span class="line"><span style="color:#DCE9F2;">    [key: string]: unknown;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The envelope payload of a run the GitHub channel started. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubEvent = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** X-GitHub-Event, e.g. &#39;issues&#39;; not covered by the signature, so never a key on its own. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    name: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    action?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** X-GitHub-Delivery; not covered by the signature. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    delivery: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    installationId?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    payload: GithubPayload;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubSubscriptionOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Shared-store execution cap within the agent; omitted or false adds no cap. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    concurrencyMaxRuns?: number | false;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Default \`github:&lt;events joined by &#39;,&#39;&gt;\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    id?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Runs after the event match; a delivery it refuses starts no run of this subscription. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    filter?: (event: GithubEvent) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Default: the delivery id (applied by the channel). The signature does not</span></span>
<span class="line"><span style="color:#7F95A6;">     * cover that header, so a replayed body under a new id is a new run;</span></span>
<span class="line"><span style="color:#7F95A6;">     * derive the key from the content on an exposed endpoint.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    idempotencyKey?: (event: GithubEvent) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> string | undefined;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Default: \`&lt;full_name&gt;#&lt;issue|pull_request number&gt;\` (a check suite or</span></span>
<span class="line"><span style="color:#7F95A6;">     * check run: its one pull request of the repository), else \`&lt;full_name&gt;\`.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    concurrencyKey?: (event: GithubEvent) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> string | undefined;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Events (\`name\` or \`name.action\`) the App&#39;s own bot may start this</span></span>
<span class="line"><span style="color:#7F95A6;">     * subscription with, e.g. \`[&#39;pull_request.opened&#39;,</span></span>
<span class="line"><span style="color:#7F95A6;">     * &#39;pull_request.synchronize&#39;, &#39;check_suite.completed&#39;]\` for the pull</span></span>
<span class="line"><span style="color:#7F95A6;">     * requests the agent opens or pushes to. Every other delivery the bot</span></span>
<span class="line"><span style="color:#7F95A6;">     * sent dispatches nothing (the loop guard). A bare \`pull_request\` also</span></span>
<span class="line"><span style="color:#7F95A6;">     * takes the \`labeled\`, \`closed\`, ... the agent&#39;s own tools cause, so it</span></span>
<span class="line"><span style="color:#7F95A6;">     * starts again after each of its writes: name the actions. The agent&#39;s</span></span>
<span class="line"><span style="color:#7F95A6;">     * first subscription matching the event whose \`selfEvents\` name it is</span></span>
<span class="line"><span style="color:#7F95A6;">     * the one started.</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`issue_comment\`, \`issues\` and \`pull_request_review_comment\` are</span></span>
<span class="line"><span style="color:#7F95A6;">     * refused (InvalidAgentDefinitionError): the bot&#39;s own comment would</span></span>
<span class="line"><span style="color:#7F95A6;">     * start the agent again.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    selfEvents?: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[];</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** An issue or pull request, for \`github.to()\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubTarget = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`owner/name\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    repo: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The issue or pull request number. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    number: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** Makes GitHub subscriptions and addresses for one channel name. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubSubscriber = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * A subscription to deliveries of \`events\`: \`&#39;issues&#39;\` (every action) or</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`&#39;issues.opened&#39;\`, one or several.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    on(events: string | </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[], options?: GithubSubscriptionOptions): ChannelSubscription&lt;GithubEvent&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The address of an issue or pull request, \`&lt;owner&gt;/&lt;repo&gt;#&lt;number&gt;\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    to(target: GithubTarget): string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><h2 id="tools" tabindex="-1">Tools <a class="header-anchor" href="#tools" aria-label="Permalink to &quot;Tools&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> DEFAULT_MERGE_METHOD: </span><span style="color:#E7C58C;">&#39;squash&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> MERGE_METHODS: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> [</span><span style="color:#E7C58C;">&#39;merge&#39;</span><span style="color:#DCE9F2;">, </span><span style="color:#E7C58C;">&#39;squash&#39;</span><span style="color:#DCE9F2;">, </span><span style="color:#E7C58C;">&#39;rebase&#39;</span><span style="color:#DCE9F2;">];</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> MERGE_STATES: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> [</span><span style="color:#E7C58C;">&#39;clean&#39;</span><span style="color:#DCE9F2;">, </span><span style="color:#E7C58C;">&#39;unstable&#39;</span><span style="color:#DCE9F2;">, </span><span style="color:#E7C58C;">&#39;has_hooks&#39;</span><span style="color:#DCE9F2;">];</span></span></code></pre></div><p><code>gh.readTools()</code> (<code>github_get_issue</code>, <code>github_search_issues</code>, <code>github_list_labels</code>, <code>github_get_pull_request</code>, <code>github_get_file</code>, <code>github_get_latest_release</code>, <code>github_list_releases</code>, <code>github_compare</code>, <code>github_list_repositories</code>, <code>github_list_issues</code>, <code>github_list_pull_requests</code>, <code>github_get_pull_request_checks</code>, <code>github_get_push_target</code>) and <code>gh.writeTools(options?)</code> (<code>github_add_labels</code>, <code>github_create_comment</code>, <code>github_close_issue</code>, <code>github_create_issue</code>, <code>github_create_pull_request</code>, <code>github_merge_pull_request</code>) return plain AI SDK <code>ToolSet</code>s. Each tool acts as the installation of the repository it names: the delivery&#39;s for a run of the GitHub channel on that repository, else <code>installationFor()</code>, else the delivery&#39;s or <code>installationId</code> (a public repository the App is not installed on stays readable); without any a <code>github_request</code> tool error. <code>github_merge_pull_request</code> refuses with <code>ToolDeniedError</code>, before the merge request, a closed pull request, a head that moved from <code>sha</code>, a draft, a mergeability not computed yet, a <code>mergeable_state</code> outside <code>MERGE_STATES</code> any required check that is not green or has not reported, required checks it cannot read (a 403 or 404 on the branch or its rules, <code>required.known</code> false), a head without any check yet and any check still running; a failing check that is not required does not stop it. The results are these shapes.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { GithubMergeMethod } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../app/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The input of a tool on a repository. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> RepoInput = { repo: string };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_propose_change\`: replacement content for one allowlisted file. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubProposeChangeInput = RepoInput &amp; {</span></span>
<span class="line"><span style="color:#DCE9F2;">    path: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    content: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    reason: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The input of a tool on an issue or pull request. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> NumberInput = RepoInput &amp; { number: number };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** A parsed repository (\`parseRepo\`), the target an installation is resolved for. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> RepoTarget = { owner: string; repo: string };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_get_issue\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubIssue = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    number: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    title: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    body: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    state: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    labels: string[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    author: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    url: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    createdAt: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    comments: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    isPullRequest: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_search_issues\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubIssueSearch = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    total: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    items: Array&lt;{</span></span>
<span class="line"><span style="color:#DCE9F2;">        repo: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">        number: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">        title: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">        state: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">        url: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    }&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** One entry of \`github_list_labels\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubLabel = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    name: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    description: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_get_pull_request\`; \`base\` and \`head\` are branch names. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubPullRequest = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    number: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    title: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    body: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    state: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    draft: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    merged: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    base: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    head: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    author: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    url: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    changedFiles: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    headSha: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`owner/name\` of the head repository; null when the fork was deleted. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    headRepo: string | null;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The head lives in another repository than the base (or was deleted). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    fork: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The author&#39;s account type, e.g. \`Bot\` or \`User\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    authorType: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    labels: string[];</span></span>
<span class="line"><span style="color:#7F95A6;">    /** null while GitHub is still computing it. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    mergeable: boolean | null;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** GitHub&#39;s \`mergeable_state\` (\`clean\`, \`unstable\`, \`dirty\`, \`blocked\`, \`behind\`, \`draft\`, \`has_hooks\`, \`unknown\`). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    mergeableState: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    maintainerCanModify: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    mergeCommitSha: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_get_file\` for a file: UTF-8 text, cut at FILE_MAX_CHARS characters. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubFile = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    path: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    size: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    content: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    truncated: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_get_file\` for a directory. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubDirectory = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    path: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    entries: Array&lt;{</span></span>
<span class="line"><span style="color:#DCE9F2;">        name: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">        type: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">        path: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    }&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_get_latest_release\`; \`{ none: true }\` when the repository has no release. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubRelease = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    tag: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    name: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    publishedAt: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    url: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    body: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">} | { none: true };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** One release of \`github_list_releases\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubReleaseNote = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    tag: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    name: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    publishedAt: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    url: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    prerelease: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Cut at RELEASE_BODY_MAX_CHARS characters. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    body: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    bodyTruncated: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_list_releases\`: oldest first; \`truncated\` when more matched than RELEASES_MAX or the pages read did not reach \`from\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubReleaseList = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    releases: GithubReleaseNote[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    truncated: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_compare\`: commits oldest first, both lists capped. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubComparison = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    status: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    aheadBy: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    behindBy: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    totalCommits: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    url: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    commits: Array&lt;{</span></span>
<span class="line"><span style="color:#DCE9F2;">        sha: string;</span></span>
<span class="line"><span style="color:#7F95A6;">        /** The first line, cut at 300 characters. */</span></span>
<span class="line"><span style="color:#DCE9F2;">        message: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">        author: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">        date: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    }&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    files: Array&lt;{</span></span>
<span class="line"><span style="color:#DCE9F2;">        path: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">        status: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">        additions: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">        deletions: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    }&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** True when commits were cut or the files reached GitHub&#39;s cap of 300 (more may exist). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    truncated: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_create_comment\`: the posted (or found) comment. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubComment = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    id: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    url: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_add_labels\`: every label the issue carries afterwards. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubIssueLabels = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    labels: string[];</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_close_issue\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubClosedIssue = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    number: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    state: </span><span style="color:#E7C58C;">&#39;closed&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    stateReason: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** One repository of \`github_list_repositories\`: \`repo\` is \`owner/name\`, \`account\` the installation&#39;s account. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubRepository = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    repo: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    installationId: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    account: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    private: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    archived: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    fork: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    defaultBranch: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    url: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_list_repositories\`, sorted by \`repo\`; \`truncated\` when REPOSITORIES_MAX cut it. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubRepositoryList = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    repositories: GithubRepository[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    truncated: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** One open issue of \`github_list_issues\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubIssueSummary = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    number: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    title: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    author: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    labels: string[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    comments: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    createdAt: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    updatedAt: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    url: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_list_issues\`, newest updated first; \`truncated\` when more remained. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubIssueList = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    issues: GithubIssueSummary[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    truncated: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** One open pull request of \`github_list_pull_requests\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubPullRequestSummary = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    number: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    title: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    author: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    authorType: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    draft: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    base: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    head: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    headSha: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    headRepo: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    fork: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    labels: string[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    createdAt: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    updatedAt: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    url: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_list_pull_requests\`; \`truncated\` when more remained. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubPullRequestList = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    pullRequests: GithubPullRequestSummary[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    truncated: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_get_push_target\`: whether the App can push fix commits onto a pull request&#39;s branch. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubPushTarget = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    number: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    headRepo: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    headBranch: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    headSha: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    fork: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The App&#39;s installation on the head repository, null when not installed. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    installationId: number | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    contents: </span><span style="color:#E7C58C;">&#39;read&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;write&#39;</span><span style="color:#DCE9F2;"> | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    workflows: </span><span style="color:#E7C58C;">&#39;read&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;write&#39;</span><span style="color:#DCE9F2;"> | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    maintainerCanModify: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** headRepo set, installed, contents write. A fork the App is not installed on is never pushable (App tokens cannot use maintainer edits). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    canPush: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Why \`canPush\` is false, else null. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    reason: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** How a check reads: green, red, or not finished. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubCheckOutcome = </span><span style="color:#E7C58C;">&#39;success&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;failure&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;pending&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** One check run or commit status of a pull request&#39;s head. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubCheck = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    name: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    kind: </span><span style="color:#E7C58C;">&#39;check_run&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;status&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** check run: queued | in_progress | completed | waiting | requested | pending; status: its state. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    status: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    conclusion: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    outcome: GithubCheckOutcome;</span></span>
<span class="line"><span style="color:#DCE9F2;">    required: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    url: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`none\` while no check reported at all (a push seconds ago): never read as green. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubChecksState = </span><span style="color:#E7C58C;">&#39;success&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;failure&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;pending&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;none&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_get_pull_request_checks\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubPullRequestChecks = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    number: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    headSha: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    base: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    state: GithubChecksState;</span></span>
<span class="line"><span style="color:#DCE9F2;">    pending: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    failing: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    checks: GithubCheck[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    required: {</span></span>
<span class="line"><span style="color:#7F95A6;">        /** false when branch protection or the rulesets could not be read (403, 404): required checks may exist that are not listed. */</span></span>
<span class="line"><span style="color:#DCE9F2;">        known: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">        contexts: string[];</span></span>
<span class="line"><span style="color:#7F95A6;">        /** Required contexts with no report yet; counted as pending. */</span></span>
<span class="line"><span style="color:#DCE9F2;">        missing: string[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    };</span></span>
<span class="line"><span style="color:#DCE9F2;">    truncated: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_create_issue\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubCreatedIssue = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    number: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    url: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_create_pull_request\`; \`head\` as \`owner:branch\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubCreatedPullRequest = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    number: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    url: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    base: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    head: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`github_merge_pull_request\`: \`sha\` is the merge commit. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubMergeResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    number: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    sha: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    method: GithubMergeMethod;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** It was merged at the given head before this call (a redone step). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    alreadyMerged: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><h2 id="opt-in-file-proposals" tabindex="-1">Opt-in file proposals <a class="header-anchor" href="#opt-in-file-proposals" aria-label="Permalink to &quot;Opt-in file proposals&quot;">​</a></h2><p><code>createGithubApp({ ..., proposals: { repos: { &#39;acme/agents&#39;: { paths: [&#39;agents/**&#39;, &#39;skills/**&#39;] } } } })</code> enables <code>github_propose_change</code> in <code>app.writeTools()</code>. Without <code>proposals</code>, <code>app.writeTools()</code> does not include it. <code>GithubAppOptions.proposals</code> uses <code>GithubProposalsOptions</code>; configuration is validated and copied at app construction.</p><p>The input is <code>GithubProposeChangeInput</code>: <code>{ repo, path, content, reason }</code>. It returns <code>{ number, url, base, head }</code> after creating or updating one stable branch and open PR for the agent/path, based on the repository&#39;s default branch. Every repository/path must match the configured allowlist; unsafe/ambiguous paths, <code>.github/**</code>, <code>.husky/**</code>, <code>CODEOWNERS</code> and <code>.gitmodules</code> (in any folder) and paths holding Unicode format characters (category Cf, e.g. bidi overrides and zero-width characters, which would also reach the PR title) are always refused before GitHub requests, also as allowlist globs. There is no general file-write tool, automatic merge or local config hot reload. Review and merge through the existing PR flow; normal folder reload picks up merged configuration.</p><p>This is an outbound effect tool, subject to <a href="/guide/tools#untrusted-content-and-outbound-tools">untrusted-run approval</a>. The initial branch is <code>chamvi/&lt;agent&gt;/&lt;path-slug&gt;-&lt;path-hash&gt;</code>, and the effect key <code>&lt;runId&gt;:propose:&lt;repo&gt;:&lt;path&gt;:&lt;sha256 of content&gt;:&lt;model step&gt;</code> permits one proposal per run, path, content and model step: a corrected content for the same path in one run (approved again by the outbound gate) is applied as a new commit, never answered with the first proposal&#39;s record. Proposal PRs are found per branch (<code>head=&lt;owner&gt;:&lt;branch&gt;</code>, one request per generation), so a repository&#39;s total PR count does not matter. Later runs reuse its open PR. After closure or merge, new proposals use a fresh <code>-g-&lt;previous-pr-number&gt;</code> branch from the current default branch. Content already matching that base produces a no-change validation error, not an empty PR. Paginated commit ancestry reconciles lost effects without reverting newer content, including closed/merged PRs whose branches were deleted. Preserve proposal commits and PR ownership markers for recovery.</p><p>Pinned Git-tree reads reject symlinks, submodules and non-directory parents; regular-file executable mode is preserved. Diffs use observed base/head SHAs, include rename sources, and reject missing/truncated data and the 300-file comparison cap. Commits have the observed head as their sole parent and refs advance without force. Proposal-branch movement detected before or after PR publication fails closed, but can leave an already published PR to review. Base movement is checked before publication only, so a busy default branch never reports an applied proposal as failed.</p><p><strong>Exclusive tool ownership of proposal branches is required.</strong> Serialize runs for the same agent/repository/path; external writes, force resets and deletion of active branches are unsupported. Checks cover an observed head, not an immutable branch. Ref updates and PR publication are not atomic, and no check guarantees future PR contents after its final observation. Review the current head before merging. GitHub App permissions must allow contents and pull-request writes. See the <a href="https://github.com/chamvi/chamvi/blob/master/packages/github/README.md#tools" target="_blank" rel="noreferrer">package README&#39;s tools section</a> for details.</p><p>Proposal reconciliation scans each historical PR independently and returns immediately on a matching run marker. A missing marker at GitHub&#39;s 250-commit PR cap fails closed. New updates stop at 249 commits: close or merge the proposal to allow a fresh generation. Already-capped historical PRs may require manual recovery. Unpublished branches are checked back to the pinned comparison&#39;s merge base, so independent base advancement does not invalidate proposal ownership.</p><h2 id="content-trust" tabindex="-1">Content trust <a class="header-anchor" href="#content-trust" aria-label="Permalink to &quot;Content trust&quot;">​</a></h2><p>The GitHub channel opts into untrusted ingress, and GitHub reads return untrusted content. Creating issues, pull requests and file proposals, merging, and commenting on another issue/PR are outbound. A comment on the source issue/PR is exempt. Adding only labels that already exist in the target repository is also exempt; introducing a new label name, or failing to resolve the repository&#39;s label vocabulary, remains outbound. Closing an issue is not classified outbound. Adding labels still taints the run: GitHub returns all labels on the issue, including externally controlled existing names. These destination/finite-label exemptions do not sanitize message content or replace authorization. See <a href="/guide/tools#untrusted-content-and-outbound-tools">Tools</a> and <a href="/guide/approvals#automatic-outbound-gates">Approvals</a>.</p><h2 id="git-credentials" tabindex="-1">Git credentials <a class="header-anchor" href="#git-credentials" aria-label="Permalink to &quot;Git credentials&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> githubAppCredentials(app: IGithubApp, options?: GithubAppCredentialsOptions): IGithubGitCredentials;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> DEFAULT_GITHUB_GIT_HOST: </span><span style="color:#E7C58C;">&#39;github.com&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> GITHUB_TOKEN_USERNAME: </span><span style="color:#E7C58C;">&#39;x-access-token&#39;</span><span style="color:#DCE9F2;">;</span></span></code></pre></div><p>The workspace manager&#39;s <code>credentials</code> source for the App (typed structurally against <code>@chamvi/sandbox</code>&#39;s <code>IGitCredentials</code>, which this package does not depend on): for a request of its <code>host</code> (default <code>github.com</code>) and an <code>owner/name</code> path it answers <code>app.repositoryToken()</code> as <code>x-access-token</code>, with <code>contents: read</code> for read and <code>contents: write</code> plus <code>options.permissions</code> for write; nothing for another host, the host itself or a repository the App is not installed on, so the next source (or an anonymous call) follows. Throws <code>InvalidAgentDefinitionError</code> for an app without <code>repositoryToken</code>, permissions that are not <code>read</code> or <code>write</code> and a host that is no host name. <code>app.repositoryToken({ owner, repo }, { permissions })</code> finds the installation (<code>GET /repos/{owner}/{repo}/installation</code>, a 404 answers <code>undefined</code>) and exchanges a token with <code>repositories: [repo]</code>, cached per installation, repository and permissions until 5 minutes before it expires (one exchange for concurrent callers, failures not cached); <code>app.botIdentity()</code> is <code>{ name: &#39;&lt;slug&gt;[bot]&#39;, email: &#39;&lt;user id&gt;+&lt;slug&gt;[bot]@users.noreply.github.com&#39; }</code> (one public <code>GET /users/&lt;login&gt;</code>), for the manager&#39;s <code>author</code>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { GithubPermissions } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../app/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * What a git credential source is asked (structurally the</span></span>
<span class="line"><span style="color:#7F95A6;"> * \`GitCredentialRequest\` of \`@chamvi/sandbox\`, which this package does not</span></span>
<span class="line"><span style="color:#7F95A6;"> * depend on).</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubGitCredentialRequest = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    url: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Lower case, with the port when the URL names one. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    host: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`owner/name\`; empty for the host itself. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    path: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    access: </span><span style="color:#E7C58C;">&#39;read&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;write&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    runId: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    signal?: AbortSignal;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** Structurally \`@chamvi/sandbox\`&#39;s \`GitCredential\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubGitCredential = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    username: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    password: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    expiresAt?: Date;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** Structurally \`@chamvi/sandbox\`&#39;s \`IGitCredentials\`: pass it as the workspace manager&#39;s \`credentials\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> IGithubGitCredentials {</span></span>
<span class="line"><span style="color:#DCE9F2;">    get(input: GithubGitCredentialRequest): Promise&lt;GithubGitCredential | undefined&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubAppCredentialsOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Added to write tokens (\`contents: write\` always), e.g.</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`{ workflows: &#39;write&#39; }\` to push changes under \`.github/workflows\`.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    permissions?: GithubPermissions;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The git host the App serves; default \`github.com\` (a GitHub Enterprise Server host otherwise). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    host?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><h2 id="context" tabindex="-1">Context <a class="header-anchor" href="#context" aria-label="Permalink to &quot;Context&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> provideGithubContext(provider: IContextProvider, app: IGithubApp): void; </span><span style="color:#7F95A6;">// engine.provide under the key &#39;github&#39;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> injectGithubContext(ctx: ToolContext): IGithubApp;                    </span><span style="color:#7F95A6;">// else ContextNotProvidedError</span></span></code></pre></div><p><code>githubModule()</code> provides its app; with a hand-built engine call <code>provideGithubContext(engine, gh)</code> after <code>new Engine()</code>. Inject in a tools factory (<code>tools: (ctx) =&gt; injectGithubContext(ctx).readTools()</code>), in a tool&#39;s <code>execute</code> or in an effect hook; see <a href="/guide/tools#context-shared-instances-for-tools">Context</a>. One app per engine: a second provide throws <code>InvalidAgentDefinitionError</code>.</p><h2 id="module" tabindex="-1">Module <a class="header-anchor" href="#module" aria-label="Permalink to &quot;Module&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">// @chamvi/github/module, needs @chamvi/app</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> githubModule(options?: GithubModuleOptions): GithubModule; </span><span style="color:#7F95A6;">// name GITHUB_MODULE_NAME &#39;chamvi:github&#39;, .app: IGithubApp</span></span></code></pre></div><p>Reads <code>GITHUB_APP_ID</code>, <code>GITHUB_APP_PRIVATE_KEY</code>, <code>GITHUB_WEBHOOK_SECRET</code> (comma-separated), <code>GITHUB_INSTALLATION_ID</code>, <code>GITHUB_APP_SLUG</code> and <code>GITHUB_API_URL</code> from <code>options.env ?? process.env</code> when it is called, unless <code>options.app</code> is given; explicit options win. <code>setup</code> contributes <code>githubChannel()</code> (<code>options.channel</code>, the approval link from <code>CHAMVI_PUBLIC_URL</code> unless <code>channel.approvalUrl</code> is given, the app&#39;s clock) to the app&#39;s channels, which the http module serves at <code>/channels/&lt;name&gt;</code>, and <code>githubAppCredentials(app, options.credentials)</code> to <code>AppToken.GIT_CREDENTIALS</code>, which <code>sandboxModule()</code> asks after its own sources (<code>credentials: false</code> contributes none), and the <code>engineCreated</code> hook provides <code>.app</code>. <code>@chamvi/app</code> is an optional peer: the main entry never imports it. See <a href="/guide/app#modules">Apps &amp; Modules</a>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { Env } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/app&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { GithubAppOptions, IGithubApp } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../app/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { GithubChannelOptions } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../channel/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { GithubAppCredentialsOptions } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../credentials/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`githubChannel()\` options; \`approvalUrl\` defaults to the UI link from \`CHAMVI_PUBLIC_URL\`, \`clock\` is the app&#39;s. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubModuleChannelOptions = Omit&lt;GithubChannelOptions, </span><span style="color:#E7C58C;">&#39;app&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;clock&#39;</span><span style="color:#DCE9F2;">&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GithubModuleOptions = Partial&lt;GithubAppOptions&gt; &amp; {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Used as is; no env is read then. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    app?: IGithubApp;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Default \`process.env\`, read when the factory is called. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    env?: Env;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The channel&#39;s options; named comment slots use the app store&#39;s locks by default. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    channel?: GithubModuleChannelOptions;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The App&#39;s git credentials (\`githubAppCredentials()\`), contributed to</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`AppToken.GIT_CREDENTIALS\` for \`sandboxModule()\`&#39;s workspaces; \`false\`</span></span>
<span class="line"><span style="color:#7F95A6;">     * contributes none. Default on, with no permission beyond \`contents\`.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    credentials?: false | GithubAppCredentialsOptions;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div>`,45)])])}const h=n(p,[["render",o]]);export{u as __pageData,h as default};
