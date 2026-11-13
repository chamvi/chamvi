import{_ as n,o as a,c as e,a2 as o}from"./chunks/framework.a6FUKr6c.js";const F=JSON.parse('{"title":"Sandboxes","description":"","frontmatter":{},"headers":[],"relativePath":"reference/sandbox.md","filePath":"reference/sandbox.md","lastUpdated":1794560227000}'),l={name:"reference/sandbox.md"};function p(t,s,c,r,i,d){return a(),e("div",null,[...s[0]||(s[0]=[o(`<h1 id="sandboxes" tabindex="-1">Sandboxes <a class="header-anchor" href="#sandboxes" aria-label="Permalink to &quot;Sandboxes&quot;">​</a></h1><p>The sandbox packages: <code>@chamvi/sandbox</code> (contracts, rules, the workspace manager) and the three providers. See <a href="/guide/workspaces">Workspaces &amp; Coding</a> for the behaviour.</p><h2 id="chamvi-sandbox" tabindex="-1">@chamvi/sandbox <a class="header-anchor" href="#chamvi-sandbox" aria-label="Permalink to &quot;@chamvi/sandbox&quot;">​</a></h2><div class="language-bash"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#DCE9F2;">npm </span><span style="color:#E7C58C;">install</span><span style="color:#E7C58C;"> @chamvi/sandbox</span><span style="color:#E7C58C;"> @chamvi/core</span><span style="color:#E7C58C;"> ai</span><span style="color:#E7C58C;"> --save</span></span></code></pre></div><p><code>@chamvi/core</code> and <code>ai</code> are peer dependencies.</p><h3 id="createworkspacemanager" tabindex="-1">createWorkspaceManager <a class="header-anchor" href="#createworkspacemanager" aria-label="Permalink to &quot;createWorkspaceManager&quot;">​</a></h3><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> createWorkspaceManager(options: WorkspaceManagerOptions): IWorkspaceManager;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> MAX_WORKSPACES_PER_RUN: </span><span style="color:#E7C58C;">3</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> GC_INTERVAL_MS: </span><span style="color:#E7C58C;">600_000</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> CLOSE_TIMEOUT_MS: </span><span style="color:#E7C58C;">30_000</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> CREDENTIAL_INSTALL_TIMEOUT_MS: </span><span style="color:#E7C58C;">30_000</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> PUSH_LOG_MAX_COMMITS: </span><span style="color:#E7C58C;">50</span><span style="color:#DCE9F2;">;</span></span></code></pre></div><p>Throws <code>InvalidAgentDefinitionError</code> for a provider without <code>create</code>, <code>find</code> and <code>collectGarbage</code>, an empty <code>image</code>, invalid <code>env</code> or <code>limits</code>, a <code>deployment</code> that is no label value, an <code>allowRepo</code>, <code>allowImage</code>, <code>isSettled</code> or <code>onError</code> that is no function, a <code>maxWorkspacesPerRun</code> below 1, a negative <code>gcIntervalMs</code>, <code>credentials</code> that are no sources with <code>get()</code>, a <code>depth</code> below 1, an <code>author</code> without a non-empty <code>name</code> and <code>email</code> (no line break, <code>&lt;</code> or <code>&gt;</code>) or a malformed <code>push</code>.</p><p>With <code>credentials</code> the manager looks up a read credential for every checkout (<code>checkout.credential</code> of the create; a failing source fails the create with a <code>SandboxError</code> naming the repository) and hands out each workspace through a view whose exec results, file reads and errors carry <code>[redacted]</code> in place of every issued token and whose <code>redact(text)</code> does the same for text a tool decodes itself. Only the tokens this process issued are redacted, each until <code>REDACT_GRACE_MS</code> after its <code>expiresAt</code> (a static token without expiry stays); the credentials file of a workspace found again (after a restart or on another replica) is never read back, since the model can write it. The view also has <code>readFileRaw(path)</code>, the unredacted text, and <code>redactedSpans(text)</code>, which the edit tools use: they match oldString against the redacted text the model read (<code>redactedSpans</code>), refuse an edit that touches a <code>[redacted]</code> span and put every untouched token back byte for byte, so an oldString can neither probe a token nor write <code>[redacted]</code> back. Without an image allow-list (<code>allowImage</code>), and on the local provider, <code>create_workspace</code> has no <code>image</code> parameter and a requested image is a <code>ValidationError</code> before any create. It writes the credential helper and the credentials file of an https workspace after the create and before the first exec of a workspace this process has not written yet (one found again), and again before an exec once a token expires within <code>CREDENTIAL_REFRESH_MS</code> (at most once per <code>CREDENTIAL_RETRY_MS</code> while a source keeps answering a token inside that window); a failing write goes to <code>onError</code> and is tried again <code>CREDENTIAL_RETRY_MS</code> later, never failing the exec. The file holds the repository&#39;s write credential (else its read one, also when the write lookup fails, which goes to <code>onError</code>) and the host&#39;s (a request with an empty <code>path</code>).</p><p>On a miss (<code>get</code> without a held workspace that fits, <code>acquire</code> of a repository it does not hold) the manager asks <code>provider.find(runId, { deployment })</code> once per run at a time and adopts what it finds, so a run reaches its workspaces after a restart or on another replica. With <code>isSuspendable</code>, <code>collectGarbage()</code> forgets (never disposes) the held workspaces of a run that waited long enough and passes <code>isSuspendable</code> to the provider, which suspends them; the next lookup gets them back (<code>find</code> with <code>rebuild</code>, the manager&#39;s <code>env</code> and <code>limits</code>). <code>release(runId)</code> (and <code>attach</code> for a settled run) disposes the held workspaces and every one <code>find</code> reports; <code>release(runId, id)</code> and <code>dispose(runId, id?)</code> (by id, or the only one; answers its id) dispose one; all of them ask <code>find</code> with <code>restore: false</code> and adopt nothing, so a suspended workspace is never rebuilt only to be removed; with <code>isSettled</code>, <code>attach</code> skips the <code>find</code> for a settled run this process neither holds nor looks up and starts a garbage collection instead (at most one per <code>gcIntervalMs</code>), which removes what other processes left for it; <code>close()</code> disposes nothing a live run holds, <code>close({ dispose: true })</code> disposes those too.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { ToolSet } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;ai&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { IClock, IEngine, ToolContext } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> {</span></span>
<span class="line"><span style="color:#DCE9F2;">    GitAccess,</span></span>
<span class="line"><span style="color:#DCE9F2;">    GitCredential,</span></span>
<span class="line"><span style="color:#DCE9F2;">    IGitCredentials,</span></span>
<span class="line"><span style="color:#DCE9F2;">    Redactor,</span></span>
<span class="line"><span style="color:#DCE9F2;">} </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../credentials/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { RepositoryInstructions } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../instructions/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { ISandboxProvider, SandboxLimits } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../provider/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { IWorkspace } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../workspace/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The credential handling of one manager; only built when it has credential sources. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> CredentialSupport = {</span></span>
<span class="line"><span style="color:#8FD0F2;">    readonly</span><span style="color:#DCE9F2;"> redactor: Redactor;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The first credential the sources answer for an https \`url\` (redacted</span></span>
<span class="line"><span style="color:#7F95A6;">     * from then on), else undefined; undefined for a \`file://\` repository.</span></span>
<span class="line"><span style="color:#7F95A6;">     * SandboxError for a failing source.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    lookup(url: string, access: GitAccess, runId: string, signal?: AbortSignal): Promise&lt;GitCredential | undefined&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Writes the credentials file of \`workspace\` (raw,</span></span>
<span class="line"><span style="color:#7F95A6;">     * not wrapped) when it has none from this process yet, or one of its</span></span>
<span class="line"><span style="color:#7F95A6;">     * credentials expires within \`CREDENTIAL_REFRESH_MS\`: the repository&#39;s</span></span>
<span class="line"><span style="color:#7F95A6;">     * write credential, else (none, or a failing write lookup, reported to</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`onError\`) its read credential. A credential already inside that</span></span>
<span class="line"><span style="color:#7F95A6;">     * window is rewritten \`CREDENTIAL_RETRY_MS\` later at the earliest. A failure goes to</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`onError\` and is retried \`CREDENTIAL_RETRY_MS\` later; it never throws.</span></span>
<span class="line"><span style="color:#7F95A6;">     * A workspace this process created anonymously (\`fresh\`) holds no file</span></span>
<span class="line"><span style="color:#7F95A6;">     * yet; one whose checkout was authenticated holds the read credential,</span></span>
<span class="line"><span style="color:#7F95A6;">     * and one it found again may hold an earlier process&#39;s: the first</span></span>
<span class="line"><span style="color:#7F95A6;">     * install overwrites (or clears) both. The file is never read back: it</span></span>
<span class="line"><span style="color:#7F95A6;">     * is writable from inside the workspace, so its content is no secret to</span></span>
<span class="line"><span style="color:#7F95A6;">     * redact.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    refresh(workspace: IWorkspace, options?: { fresh?: boolean }): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The workspace the manager hands out: redacting and refreshing before each call. One per raw workspace. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    wrap(workspace: IWorkspace): IWorkspace;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GitToolsContext = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    manager: Pick&lt;IWorkspaceManager, </span><span style="color:#E7C58C;">&#39;get&#39;</span><span style="color:#DCE9F2;">&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The credential of an https repository, or undefined (anonymous). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    lookup: (url: string, access: GitAccess, runId: string, signal?: AbortSignal) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> Promise&lt;GitCredential | undefined&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`normalizeRepo\` with the manager&#39;s rules (\`allowFileRepos\`, \`allowRepo\`). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    normalize: (repo: string) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    push: PushPolicy;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> WorkspaceManagerOptions = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    provider: ISandboxProvider;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Passed to every \`create\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    image?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Passed to every \`create\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    env?: Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Passed to every \`create\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    limits?: SandboxLimits;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Accept \`file:///absolute/path\` repositories (local development and tests). Default false. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    allowFileRepos?: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Narrows the accepted repositories further; gets the normalized URL. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    allowRepo?: (url: string) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Collect root repository guidance and offer path-scoped guidance tools. Default true. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    repositoryInstructions?: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The images \`create_workspace\` may ask for; gets the reference as</span></span>
<span class="line"><span style="color:#7F95A6;">     * requested. Without it, and on the local provider (it runs no images),</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`create_workspace\` has no \`image\` parameter and a requested image is a</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`ValidationError\`. Never asked for the manager&#39;s or the provider&#39;s own</span></span>
<span class="line"><span style="color:#7F95A6;">     * image.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    allowImage?: (image: string) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Workspaces one run may hold at once. Default MAX_WORKSPACES_PER_RUN (3). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    maxWorkspacesPerRun?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Minimum interval between the garbage collections \`acquire\` starts. Default GC_INTERVAL_MS; 0 disables them. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    gcIntervalMs?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The deployment the workspaces belong to (a label value): \`find\` and the</span></span>
<span class="line"><span style="color:#7F95A6;">     * garbage collection only see their own. Default \`DEFAULT_DEPLOYMENT\`.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    deployment?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * True when a run settled or no longer exists; the garbage collection then</span></span>
<span class="line"><span style="color:#7F95A6;">     * disposes its workspaces, also ones another process created. Without</span></span>
<span class="line"><span style="color:#7F95A6;">     * it only expired workspaces are collected.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    isSettled?: (runId: string) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * True when a run has waited long enough to give up its compute: the</span></span>
<span class="line"><span style="color:#7F95A6;">     * garbage collection forgets the run&#39;s held workspaces without disposing</span></span>
<span class="line"><span style="color:#7F95A6;">     * them and passes it to the provider, which may suspend them (their next</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`get\` or \`acquire\` finds them again through \`provider.find\`). Without</span></span>
<span class="line"><span style="color:#7F95A6;">     * it nothing is suspended.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    isSuspendable?: (runId: string) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Git credentials for private repositories and pushes: the first source</span></span>
<span class="line"><span style="color:#7F95A6;">     * that answers wins, none answering is anonymous.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    credentials?: IGitCredentials | IGitCredentials[];</span></span>
<span class="line"><span style="color:#7F95A6;">    /** A shallow checkout of this many commits for huge repositories; default the full history. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    depth?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The commit identity, set as \`GIT_AUTHOR_*\` and \`GIT_COMMITTER_*\` in every workspace&#39;s environment. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    author?: GitAuthor;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** What \`git_push\` may push; default every branch but the default branch, no force, no approval. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    push?: PushPolicy;</span></span>
<span class="line"><span style="color:#DCE9F2;">    clock?: IClock;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Background failures (disposal, garbage collection, credential refreshes). Default console.error. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    onError?: (error: unknown) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> void;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GitAuthor = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    name: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    email: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** Applies to git_push only; other tools and shell commands can bypass it. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> PushPolicy = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`auto\` (default) pushes; \`approve\` asks the owner through \`approve()\` before every push. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    mode?: </span><span style="color:#E7C58C;">&#39;auto&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;approve&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Allow \`git_push({ force: true })\` (always \`--force-with-lease\`). Default false. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    allowForce?: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The branches \`git_push\` may push to; default every branch but the repository&#39;s default branch. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    allowBranch?: (branch: string, ctx: ToolContext) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> boolean | Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The channel an approval goes through; default the run&#39;s source channel when it has an \`out\`, else none (inbox only). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    channel?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> AcquireInput = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`owner/name\`, an https URL, or \`file:///absolute/path\` with \`allowFileRepos\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    repo?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    ref?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * An image reference (\`assertImage\`), only with \`allowImage\` and not on</span></span>
<span class="line"><span style="color:#7F95A6;">     * the local provider, checked by \`allowImage\`; default the manager&#39;s,</span></span>
<span class="line"><span style="color:#7F95A6;">     * else the provider&#39;s.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    image?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    signal?: AbortSignal;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> CloseOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** How long close() waits for disposals and creates in flight. Default CLOSE_TIMEOUT_MS (30 s). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    timeoutMs?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Also dispose the workspaces of live runs (default false: they stay for</span></span>
<span class="line"><span style="color:#7F95A6;">     * their runs to find again). For in-memory run storage, nothing can resume after the process exits.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    dispose?: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> AcquireResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    workspace: IWorkspace;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** True when the run already held (or was creating) the workspace of this repository. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    reused: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * Run-scoped workspaces: one per run and repository (or none), created</span></span>
<span class="line"><span style="color:#7F95A6;"> * through the provider and disposed when the run settles (\`attach\`).</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> IWorkspaceManager {</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The run&#39;s workspace of \`repo\` (none: the repo-less one): held, else</span></span>
<span class="line"><span style="color:#7F95A6;">     * found through \`provider.find\` (adopted, \`reused\`), else created when</span></span>
<span class="line"><span style="color:#7F95A6;">     * missing, expired or gone (\`IWorkspace.disposed\`). Concurrent calls share one create. ValidationError for a</span></span>
<span class="line"><span style="color:#7F95A6;">     * repository, ref or image the rules refuse; SandboxError for another ref</span></span>
<span class="line"><span style="color:#7F95A6;">     * or image of a held repository, a reached per-run cap or a failed create.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    acquire(runId: string, input: AcquireInput): Promise&lt;AcquireResult&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The run&#39;s workspace by id, or its only live one when id is omitted</span></span>
<span class="line"><span style="color:#7F95A6;">     * (expired and gone ones are disposed first). A run that holds none that</span></span>
<span class="line"><span style="color:#7F95A6;">     * fits is looked up through \`provider.find\` (one lookup per run at a</span></span>
<span class="line"><span style="color:#7F95A6;">     * time) and the found ones adopted. SandboxError: unknown, expired or gone</span></span>
<span class="line"><span style="color:#7F95A6;">     * (disposed then), none, a failed lookup; ValidationError: several and no id.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    get(runId: string, workspaceId?: string): Promise&lt;IWorkspace&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Disposes one workspace (as \`dispose\`, SandboxError /not found/ for an id</span></span>
<span class="line"><span style="color:#7F95A6;">     * the run neither holds nor finds), or all of the run (never rejects for</span></span>
<span class="line"><span style="color:#7F95A6;">     * none): the held ones and every one \`provider.find\` reports for the run;</span></span>
<span class="line"><span style="color:#7F95A6;">     * this aborts the run&#39;s creates and lookups in flight and waits for the</span></span>
<span class="line"><span style="color:#7F95A6;">     * creates. Never restores a suspended workspace to remove it (\`find\` with</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`restore: false\`).</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    release(runId: string, workspaceId?: string): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Disposes one workspace of the run and answers its id: by id, or its</span></span>
<span class="line"><span style="color:#7F95A6;">     * only one when id is omitted (the held ones, else what</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`provider.find(runId, { restore: false })\` reports; nothing found is</span></span>
<span class="line"><span style="color:#7F95A6;">     * adopted, a suspended one is never restored). SandboxError: unknown id,</span></span>
<span class="line"><span style="color:#7F95A6;">     * none, a failed lookup or dispose; ValidationError: several and no id.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    dispose(runId: string, workspaceId?: string): Promise&lt;string&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Disposes a run&#39;s workspaces on completed | failed | cancelled (\`release\`,</span></span>
<span class="line"><span style="color:#7F95A6;">     * so also those other processes created). With \`isSettled\`, a run this</span></span>
<span class="line"><span style="color:#7F95A6;">     * process neither holds nor looks up is not looked up (no \`provider.find\`</span></span>
<span class="line"><span style="color:#7F95A6;">     * per settled run): it starts a garbage collection instead (at most one</span></span>
<span class="line"><span style="color:#7F95A6;">     * per \`gcIntervalMs\`), which removes what other processes left for it.</span></span>
<span class="line"><span style="color:#7F95A6;">     * Returns the unsubscribe; after close() it subscribes nothing.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    attach(engine: Pick&lt;IEngine, </span><span style="color:#E7C58C;">&#39;on&#39;</span><span style="color:#DCE9F2;">&gt;): () </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> void;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Workspace lifecycle, structured Git and (unless disabled) repository guidance tools (no bash tool). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    tools(): ToolSet;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Disposes the manager&#39;s expired workspaces and, with \`isSettled\`, the</span></span>
<span class="line"><span style="color:#7F95A6;">     * ones of settled runs; with \`isSuspendable\`, forgets (never disposes)</span></span>
<span class="line"><span style="color:#7F95A6;">     * the held workspaces of suspendable runs; then runs the provider&#39;s</span></span>
<span class="line"><span style="color:#7F95A6;">     * collection (deployment, \`isSettled\` and \`isSuspendable\` passed on);</span></span>
<span class="line"><span style="color:#7F95A6;">     * returns how many went.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    collectGarbage(): Promise&lt;number&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Unsubscribes every attach, aborts the creates in flight (disposing what</span></span>
<span class="line"><span style="color:#7F95A6;">     * they made) and forgets the held workspaces without disposing them: they</span></span>
<span class="line"><span style="color:#7F95A6;">     * belong to live runs, which find them again after a restart (with</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`dispose: true\` it disposes them too). Waits for</span></span>
<span class="line"><span style="color:#7F95A6;">     * the creates, for disposals started earlier and for the creates in</span></span>
<span class="line"><span style="color:#7F95A6;">     * flight of runs released before (call after engine.drain()); afterwards</span></span>
<span class="line"><span style="color:#7F95A6;">     * acquire, get and lookups reject and attach subscribes nothing. Resolves</span></span>
<span class="line"><span style="color:#7F95A6;">     * after \`timeoutMs\` at the latest, reporting what is still being disposed</span></span>
<span class="line"><span style="color:#7F95A6;">     * to \`onError\`.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    close(options?: CloseOptions): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> WorkspaceToolResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    workspace: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    root: </span><span style="color:#E7C58C;">&#39;/workspace&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    repo: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    ref: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    commit: string | null;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The remote&#39;s default branch, fetched as \`origin/&lt;name&gt;\` (the base to merge or rebase onto). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    defaultBranch: string | null;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The image of a container or pod workspace; null on local. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    image: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    expiresAt: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    reused: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Current root guidance; null without a repository, when collection is disabled or when it failed. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    instructions: RepositoryInstructions | null;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Why the guidance could not be collected (a missing utility, a stray</span></span>
<span class="line"><span style="color:#7F95A6;">     * line, an exec timeout); set only with \`instructions: null\` after a</span></span>
<span class="line"><span style="color:#7F95A6;">     * failure. The workspace is usable; \`read_repository_instructions\` retries.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    instructionsError?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> DisposeWorkspaceResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    workspace: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    disposed: true;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** What \`git_fetch\`, \`git_pull\` and \`git_push\` answer: the git call&#39;s outcome, redacted. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GitToolResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    workspace: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The repository URL git talked to (never a remote name of the repository config). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    remote: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    exitCode: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    stdout: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    stderr: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    timedOut: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GitFetchResult = GitToolResult &amp; {</span></span>
<span class="line"><span style="color:#DCE9F2;">    refspec: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GitPullResult = GitToolResult &amp; {</span></span>
<span class="line"><span style="color:#DCE9F2;">    branch: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    rebase: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The step the result is of: the fetch when it failed, else the merge or rebase. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    step: </span><span style="color:#E7C58C;">&#39;fetch&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;merge&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;rebase&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GitPushResult = GitToolResult &amp; {</span></span>
<span class="line"><span style="color:#DCE9F2;">    branch: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The commit pushed. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    commit: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    pushed: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    forced: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><h3 id="repository-instructions" tabindex="-1">Repository instructions <a class="header-anchor" href="#repository-instructions" aria-label="Permalink to &quot;Repository instructions&quot;">​</a></h3><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> readRepositoryInstructions(</span></span>
<span class="line"><span style="color:#DCE9F2;">    workspace: IWorkspace,</span></span>
<span class="line"><span style="color:#DCE9F2;">    paths?: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[],</span></span>
<span class="line"><span style="color:#DCE9F2;">    options?: ReadRepositoryInstructionsOptions,</span></span>
<span class="line"><span style="color:#DCE9F2;">): Promise&lt;RepositoryInstructions&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">type</span><span style="color:#DCE9F2;"> ReadRepositoryInstructionsOptions = { signal?: AbortSignal; clock?: IClock };</span></span>
<span class="line"><span style="color:#8FD0F2;">type</span><span style="color:#DCE9F2;"> RepositoryInstructionSource = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    path: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    sha256: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    content: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    scopes: string[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    includedBy: string[];</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"><span style="color:#8FD0F2;">type</span><span style="color:#DCE9F2;"> RepositoryInstructionDiagnosticCode = </span><span style="color:#E7C58C;">&#39;missing-include&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;unreadable&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;invalid-utf8&#39;</span></span>
<span class="line"><span style="color:#DCE9F2;">    | </span><span style="color:#E7C58C;">&#39;outside-workspace&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;unsupported-file&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;cycle&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;limit&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">type</span><span style="color:#DCE9F2;"> RepositoryInstructionDiagnostic = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    path: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    code: RepositoryInstructionDiagnosticCode;</span></span>
<span class="line"><span style="color:#DCE9F2;">    message: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"><span style="color:#8FD0F2;">type</span><span style="color:#DCE9F2;"> RepositoryInstructions = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    commit: string | null;</span></span>
<span class="line"><span style="color:#DCE9F2;">    paths: string[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    sources: RepositoryInstructionSource[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    diagnostics: RepositoryInstructionDiagnostic[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    complete: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><p><code>clock</code> defaults to <code>systemClock</code> and measures the request deadline; <code>signal</code> cancels collection. The function works through <code>IWorkspace.exec</code>, without host filesystem reads or repository program execution. The manager&#39;s <code>read_repository_instructions({ paths?, workspace? })</code> resolves the calling run&#39;s workspace and forwards its cancellation signal. Paths default to <code>[&#39;.&#39;]</code>, follow workspace path normalization (relative or <code>/workspace/...</code>), and existing directories include themselves; files and missing targets use their parent.</p><p><code>create_workspace</code> adds <code>instructions: RepositoryInstructions | null</code> to <code>WorkspaceToolResult</code>. Repository-backed creates, including reuse or adoption, collect root guidance afresh. Repo-less creates return <code>null</code>. A collection failure (a missing utility, a stray stderr line, an exec timeout) returns <code>instructions: null</code> plus <code>instructionsError</code> (the redacted reason) rather than failing the create; a cancelled run still rejects. With <code>createWorkspaceManager({ provider, repositoryInstructions: false })</code>, <code>create_workspace</code> returns <code>instructions: null</code> and the explicit tool is omitted; the default is <code>true</code>. <code>sandboxModule({ repositoryInstructions: false })</code> forwards this manager option. There is no corresponding environment variable. The separate <a href="/reference/coding#repository-instructions"><code>codingTools</code> option</a> controls text-read attachments independently.</p><p>Entrypoint discovery visits root and requested ancestors only, ordered by directory depth then JavaScript string order; explicit includes may reference permitted files elsewhere in the workspace. Each directory reads <code>AGENTS.md</code> before <code>CLAUDE.md</code>, each immediately followed by its included files in depth-first textual order. Only standalone <code>@relative/path</code> lines count, with surrounding whitespace allowed and none within the path. Ordinary links, inline <code>@</code> text and fenced code are ignored. Fences use at least three backticks or tildes; a closing fence uses the same character with at least the opening length. Includes resolve relative to their source, allowing <code>..</code> only inside the workspace and refusing absolute paths, home paths, URLs, NUL and escapes.</p><p>Sources are deduplicated by canonical workspace-relative path; <code>scopes</code> retains every applicable entrypoint directory (<code>.</code> for root) and <code>includedBy</code> every including parent. Included guides inherit their entrypoint&#39;s scope. <code>sha256</code> hashes exact original bytes, before credential redaction; <code>content</code> is strictly decoded UTF-8 and redacted before include parsing. Outward paths and diagnostics are redacted too. The collector preserves provenance rather than resolving contradictory prose. <code>commit</code> is <code>workspace.info.commit ?? null</code>, the recorded checkout commit, not necessarily current HEAD; hashes identify the bytes actually read. There is no transactionally frozen snapshot and no cache across calls.</p><table tabindex="0"><thead><tr><th>Exported bound</th><th>Value</th></tr></thead><tbody><tr><td><code>INSTRUCTION_FILES</code></td><td><code>[&#39;AGENTS.md&#39;, &#39;CLAUDE.md&#39;]</code></td></tr><tr><td><code>INSTRUCTION_SOURCE_MAX_BYTES</code></td><td>32 768 (32 KiB), each source whole or omitted</td></tr><tr><td><code>INSTRUCTION_TOTAL_MAX_BYTES</code></td><td>131 072 (128 KiB), total source bytes</td></tr><tr><td><code>INSTRUCTION_SOURCES_MAX</code></td><td>32 distinct sources</td></tr><tr><td><code>INSTRUCTION_INCLUDE_DEPTH_MAX</code></td><td>8 include edges from an entrypoint</td></tr><tr><td><code>INSTRUCTION_PATHS_MAX</code></td><td>32 requested paths</td></tr><tr><td><code>INSTRUCTION_DIRECTORIES_MAX</code></td><td>64 distinct ancestor directories, root included</td></tr><tr><td><code>INSTRUCTION_REFERENCES_MAX</code></td><td>512 attempted inspections and include references</td></tr><tr><td><code>INSTRUCTION_DIAGNOSTICS_MAX</code></td><td>64 entries, including a closing limit diagnostic</td></tr><tr><td><code>INSTRUCTION_DIAGNOSTICS_MAX_BYTES</code></td><td>8192 UTF-8 bytes of diagnostic paths and messages together</td></tr><tr><td><code>INSTRUCTION_PATH_MAX_BYTES</code></td><td>4096 UTF-8 bytes per path</td></tr><tr><td><code>INSTRUCTION_REQUEST_TIMEOUT_MS</code></td><td>30 000 (30 s) per request</td></tr><tr><td><code>INSTRUCTION_EXEC_TIMEOUT_MS</code></td><td>5000 (5 s) per exec</td></tr></tbody></table><p>Missing optional entrypoints are normal. Missing explicit includes, unreadable files, invalid UTF-8, refused paths, cycles and bound exhaustion add diagnostics; any diagnostic makes <code>complete: false</code>. Sources are never silently truncated. Invalid input shapes throw <code>ValidationError</code>; cancellation, workspace lookup failures, transport errors, exec timeouts, missing inspection capabilities and malformed or truncated protocol responses reject through the existing error path, never a successful empty result. The overall request deadline produces a <code>limit</code> diagnostic with the sources collected so far.</p><p>Fixed discovery scripts run in the physical workspace cwd and resolve utilities on <code>/usr/bin:/bin</code>, excluding repository executables. Each read is bounded to 32 KiB + 1 byte with framed base64 output, checked against the 65 536-byte transport cap, exit status, timeout, truncation flags, lengths and completion marker. Missing utilities produce an explicit failure; there is no interpreter or image-contract expansion. Every observed symlink component (including aliases within the workspace), special file and <code>.git</code> component is refused. Checks are best-effort against the observed filesystem; concurrent changes can race them. Strict race-free confinement is deferred to <a href="https://github.com/chamvi/chamvi/issues/92" target="_blank" rel="noreferrer">#92</a>.</p><p>Delivered context is ordinary tool output retained in model messages, steps and checkpoints across approval pauses and recovery. The next create, explicit context call or applicable file read collects current guidance, including changed files in a reused or recovered workspace, without replacing older messages. These tools are not effect tools. See <a href="/guide/workspaces#repository-instructions">Repository instructions</a> for the pre-edit workflow and authorization boundaries.</p><h3 id="git-credentials" tabindex="-1">Git credentials <a class="header-anchor" href="#git-credentials" aria-label="Permalink to &quot;Git credentials&quot;">​</a></h3><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> staticGitCredentials(entries: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> StaticGitCredential[]): IGitCredentials;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> REDACTED: </span><span style="color:#E7C58C;">&#39;[redacted]&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> CREDENTIAL_REFRESH_MS: </span><span style="color:#E7C58C;">600_000</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> CREDENTIAL_RETRY_MS: </span><span style="color:#E7C58C;">60_000</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> CREDENTIALS_FILE: </span><span style="color:#E7C58C;">&#39;.chamvi/credentials&#39;</span><span style="color:#DCE9F2;">; </span><span style="color:#7F95A6;">// below $HOME, mode 0600</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> REDACT_MIN_LENGTH: </span><span style="color:#E7C58C;">4</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> REDACT_GRACE_MS: </span><span style="color:#E7C58C;">3_600_000</span><span style="color:#DCE9F2;">;   </span><span style="color:#7F95A6;">// an expired token stays redacted this long</span></span></code></pre></div><p><code>staticGitCredentials</code> throws <code>InvalidAgentDefinitionError</code> for an entry without a host name (an optional port), a token or username with NUL, CR, LF or tab, or a <code>path</code> that is no owner or repository, naming the entry and never a token. A source&#39;s answer must be non-empty strings without those characters (<code>expiresAt</code> a <code>Date</code>), else the lookup is a <code>SandboxError</code>.</p><p>The structured Git tools run every remote call as <code>git -c credential.helper= -c core.hooksPath=/dev/null ...</code>, or with a credential as <code>sh -c &lt;script&gt; sh &lt;url&gt; &lt;origin&gt; &lt;path&gt; &lt;git args&gt;</code> with <code>&lt;username&gt;\\n&lt;password&gt;\\n</code> on stdin: the script hands the credential to git through a one-shot helper on fd 3 that answers only for that origin and path. A URL-specific key in the repository&#39;s or the global git config beats a generic <code>-c</code>, so the script cannot force settings on; it checks the config for the URL first and refuses (a <code>SandboxError</code> naming the keys, nothing sent) when it sets a proxy (<code>http.proxy</code>, <code>remote.&lt;name&gt;.proxy</code>), turns <code>http.sslVerify</code> off, names another CA (<code>http.sslCAInfo</code>, <code>http.sslCAPath</code>), overrides name resolution (<code>http.curloptResolve</code>) or rewrites URLs (<code>url.&lt;base&gt;.insteadOf</code>, <code>pushInsteadOf</code>). It also allows git only the https transport (<code>GIT_ALLOW_PROTOCOL=https</code>, which no config can override), so a transport the config names for the URL (<code>remote.&lt;url&gt;.vcs</code>) never starts and cannot read the credential git hands its helpers. The workspace helper (<code>$HOME/.chamvi/git-credential</code>, set as the global <code>credential.helper</code> with <code>credential.useHttpPath</code>) answers from the credentials file, the repository&#39;s line first, else the host&#39;s.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GitAccess = </span><span style="color:#E7C58C;">&#39;read&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;write&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** What a credential source is asked: one repository (or, with an empty \`path\`, its host) and an access. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GitCredentialRequest = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The normalized repository URL (\`https://host/owner/name.git\`), or \`https://host/\` for the host itself. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    url: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Lower case, with the port when the URL names one. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    host: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Without leading or trailing \`/\` and without \`.git\`, e.g. \`owner/name\`; empty for the host itself. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    path: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    access: GitAccess;</span></span>
<span class="line"><span style="color:#DCE9F2;">    runId: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    signal?: AbortSignal;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** HTTP basic credentials for git; \`expiresAt\` for a short-lived token (refreshed before it runs out). */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GitCredential = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    username: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    password: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    expiresAt?: Date;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * A source of git credentials. \`get\` answers credentials for the</span></span>
<span class="line"><span style="color:#7F95A6;"> * repository, or \`undefined\` to try the next source (none: anonymous).</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> IGitCredentials {</span></span>
<span class="line"><span style="color:#DCE9F2;">    get(input: GitCredentialRequest): Promise&lt;GitCredential | undefined&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** One token of \`staticGitCredentials()\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> StaticGitCredential = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The host, e.g. \`github.com\` or \`gitlab.example.com:8443\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    host: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** An owner, group or repository prefix (whole segments, case-insensitive), e.g. \`octo\` or \`octo/demo\`; default the whole host. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    path?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Default \`oauth2\` on a host whose name contains \`gitlab\`, else \`x-access-token\` (GitHub). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    username?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    token: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** Replaces issued credentials with \`REDACTED\`. */</span></span>
<span class="line"><span style="color:#7F95A6;">/** A span of a text, \`start\` inclusive and \`end\` exclusive (UTF-16 code units). */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> RedactedSpan = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    start: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    end: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> Redactor = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Redacts \`secret\` from now on; with \`expiresAt\` only until</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`REDACT_GRACE_MS\` after it (adding it again keeps the later expiry,</span></span>
<span class="line"><span style="color:#7F95A6;">     * none wins).</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    add(secret: string, expiresAt?: Date): void;</span></span>
<span class="line"><span style="color:#DCE9F2;">    redact(text: string): string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The spans of \`text\` that \`redact\` replaces, in order and without overlap. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    redactedSpans(text: string): RedactedSpan[];</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The same bytes when they hold no secret. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    redactBytes(bytes: Uint8Array): Uint8Array;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The same error when its message holds no secret, else a SandboxError with the redacted message and no cause. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    redactError(error: unknown): unknown;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><h3 id="workspaces-and-providers" tabindex="-1">Workspaces and providers <a class="header-anchor" href="#workspaces-and-providers" aria-label="Permalink to &quot;Workspaces and providers&quot;">​</a></h3><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** What a provider knows about a workspace; \`commit\` is set after the checkout. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> WorkspaceInfo = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    runId: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`ISandboxProvider.name\` of the provider that created it. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    provider: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The normalized repository URL. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    repo?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    ref?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** HEAD after the checkout. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    commit?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The remote&#39;s default branch (its HEAD), fetched next to \`ref\`: the base of a merge or rebase. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    defaultBranch?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The image of a container or pod workspace. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    image?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    createdAt: Date;</span></span>
<span class="line"><span style="color:#DCE9F2;">    expiresAt: Date;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> ExecOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Relative to the workspace root or under \`/workspace/\`; default the root. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    cwd?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Default \`EXEC_TIMEOUT_MS\`, at most \`EXEC_TIMEOUT_MAX_MS\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    timeoutMs?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    stdin?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    signal?: AbortSignal;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> ExecResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    exitCode: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** At most \`OUTPUT_MAX_BYTES\` bytes of UTF-8. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    stdout: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    stderr: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    stdoutTruncated: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    stderrTruncated: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    timedOut: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    durationMs: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * A disposable directory a run executes commands in. Exec takes argv only,</span></span>
<span class="line"><span style="color:#7F95A6;"> * never a shell string.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> IWorkspace {</span></span>
<span class="line"><span style="color:#8FD0F2;">    readonly</span><span style="color:#DCE9F2;"> id: string;</span></span>
<span class="line"><span style="color:#8FD0F2;">    readonly</span><span style="color:#DCE9F2;"> info: WorkspaceInfo;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * True after \`dispose()\`, or once the workspace found its container, pod</span></span>
<span class="line"><span style="color:#7F95A6;">     * or directory gone (stopped, killed or removed outside chamvi). Every</span></span>
<span class="line"><span style="color:#7F95A6;">     * call then rejects with SandboxError; the manager drops such a workspace</span></span>
<span class="line"><span style="color:#7F95A6;">     * and disposes it, which removes what is left of it.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#8FD0F2;">    readonly</span><span style="color:#DCE9F2;"> disposed: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    exec(argv: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[], options?: ExecOptions): Promise&lt;ExecResult&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** UTF-8 text of at most \`FILE_MAX_BYTES\`; SandboxError for a file that is not UTF-8. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    readFile(path: string): Promise&lt;string&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The raw bytes of a file of at most \`FILE_MAX_BYTES\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    readBytes(path: string): Promise&lt;Uint8Array&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** A string is written as UTF-8, bytes as they are; at most \`FILE_MAX_BYTES\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    writeFile(path: string, content: string | Uint8Array): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Idempotent. Every call after it rejects with SandboxError. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    dispose(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Replaces the git credentials issued for the workspace with</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`[redacted]\`: set on the workspaces a manager with credentials hands</span></span>
<span class="line"><span style="color:#7F95A6;">     * out, whose results and errors are already redacted. A tool that decodes</span></span>
<span class="line"><span style="color:#7F95A6;">     * output itself (base64 from an exec) passes the decoded text through it.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    redact?(text: string): string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The unredacted text of a file (as \`readFile\` without the redaction):</span></span>
<span class="line"><span style="color:#7F95A6;">     * set beside \`redact\` on the workspaces a manager with credentials hands</span></span>
<span class="line"><span style="color:#7F95A6;">     * out, for tools that write the text back (an edit), so a file holding</span></span>
<span class="line"><span style="color:#7F95A6;">     * an issued token never gets \`[redacted]\` written into it. Never for</span></span>
<span class="line"><span style="color:#7F95A6;">     * text shown to the model.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    readFileRaw?(path: string): Promise&lt;string&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The spans of \`text\` that \`redact\` replaces with \`[redacted]\`, in order</span></span>
<span class="line"><span style="color:#7F95A6;">     * and without overlap: set beside \`redact\`, so a tool working on the raw</span></span>
<span class="line"><span style="color:#7F95A6;">     * text (an edit of \`readFileRaw\`) can match what the model read and keep</span></span>
<span class="line"><span style="color:#7F95A6;">     * every issued token byte for byte.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    redactedSpans?(text: string): Array&lt;{ start: number; end: number }&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { CheckoutOptions } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../repo/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { IWorkspace } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../workspace/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> SandboxLimits = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Kubernetes quantity, e.g. \`&#39;1&#39;\`, \`&#39;500m&#39;\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    cpu?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Bytes as a Kubernetes quantity, e.g. \`&#39;2Gi&#39;\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    memory?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Disk of \`/workspace\`, e.g. \`&#39;4Gi&#39;\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    storage?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    pids?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Hard cap of a workspace&#39;s lifetime (its \`expiresAt\`), from its creation,</span></span>
<span class="line"><span style="color:#7F95A6;">     * never renewed. Nothing kills a workspace earlier while its run lives;</span></span>
<span class="line"><span style="color:#7F95A6;">     * garbage collection removes it once expired or its run settled.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    maxLifetimeMs?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> WorkspaceCreateOptions = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    runId: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** A normalized repository URL (\`normalizeRepo\`); without it the workspace is only \`git init\`-ed. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    repo?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    ref?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Passed to \`prepareWorkspace\`: a shallow \`depth\`, the read \`credential\` of a private repository. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    checkout?: CheckoutOptions;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The image of a container or pod workspace; default the provider&#39;s. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    image?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    env?: Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    limits?: SandboxLimits;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The deployment the workspace belongs to; default \`DEFAULT_DEPLOYMENT\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    deployment?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    signal?: AbortSignal;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> WorkspaceFindOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Only workspaces of this deployment; default \`DEFAULT_DEPLOYMENT\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    deployment?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    signal?: AbortSignal;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * What a provider that rebuilds a suspended workspace (Kubernetes with</span></span>
<span class="line"><span style="color:#7F95A6;">     * persistence) needs of the create&#39;s configuration: the \`env\` and</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`limits\` the manager passes to every \`create\`. Never stored with the</span></span>
<span class="line"><span style="color:#7F95A6;">     * workspace (the env may hold secrets), so a rebuild after a redeploy</span></span>
<span class="line"><span style="color:#7F95A6;">     * gets the current configuration.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    rebuild?: {</span></span>
<span class="line"><span style="color:#DCE9F2;">        env?: Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">        limits?: SandboxLimits;</span></span>
<span class="line"><span style="color:#DCE9F2;">    };</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * False for a lookup that only removes what it finds (the manager&#39;s</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`release\`): a provider that rebuilds a suspended workspace answers it</span></span>
<span class="line"><span style="color:#7F95A6;">     * as it is, a handle whose \`dispose\` removes it and whose commands fail.</span></span>
<span class="line"><span style="color:#7F95A6;">     * Default true.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    restore?: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GarbageCollectOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Only workspaces of this deployment; default \`DEFAULT_DEPLOYMENT\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    deployment?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * True when the run settled or no longer exists: its workspaces go too,</span></span>
<span class="line"><span style="color:#7F95A6;">     * expired or not. A rejection keeps them and counts as a failure.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    isSettled?(runId: string): Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * True when the run has waited long enough: a provider that can suspend</span></span>
<span class="line"><span style="color:#7F95A6;">     * stops that run&#39;s running workspaces without removing them (their files</span></span>
<span class="line"><span style="color:#7F95A6;">     * stay, \`find\` brings them back), one that cannot ignores it. Removal</span></span>
<span class="line"><span style="color:#7F95A6;">     * (expiry, \`isSettled\`) wins over suspension. A rejection keeps them</span></span>
<span class="line"><span style="color:#7F95A6;">     * running and counts as a failure.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    isSuspendable?(runId: string): Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> ISandboxProvider {</span></span>
<span class="line"><span style="color:#8FD0F2;">    readonly</span><span style="color:#DCE9F2;"> name: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * A ready workspace (id \`randomUUID()\`), checked out when \`repo\` is given</span></span>
<span class="line"><span style="color:#7F95A6;">     * (via \`prepareWorkspace\` with \`checkout\`, then \`info.commit\` and</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`info.defaultBranch\` from its result).</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    create(options: WorkspaceCreateOptions): Promise&lt;IWorkspace&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Every live, unexpired workspace of the run in the deployment this</span></span>
<span class="line"><span style="color:#7F95A6;">     * provider can reach (labels, folders), reconnected: the instance this</span></span>
<span class="line"><span style="color:#7F95A6;">     * process holds, else a new one rebuilt from what lives with the</span></span>
<span class="line"><span style="color:#7F95A6;">     * workspace. Never creates a workspace; may restart one (a stopped</span></span>
<span class="line"><span style="color:#7F95A6;">     * Docker container) or rebuild its pod (Kubernetes persistence, with</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`rebuild\`).</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    find(runId: string, options?: WorkspaceFindOptions): Promise&lt;IWorkspace[]&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Deletes this provider&#39;s workspaces of the deployment past their expiry</span></span>
<span class="line"><span style="color:#7F95A6;">     * and, with \`isSettled\`, those whose run settled; returns how many. With</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`isSuspendable\` it may suspend the running workspaces of long-waiting</span></span>
<span class="line"><span style="color:#7F95A6;">     * runs (not counted, never removed). One</span></span>
<span class="line"><span style="color:#7F95A6;">     * that cannot be removed never keeps the others: the pass goes on and</span></span>
<span class="line"><span style="color:#7F95A6;">     * rejects with one SandboxError at the end.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    collectGarbage(options?: GarbageCollectOptions): Promise&lt;number&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The workspace root as the model sees it, on every provider. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> WORKSPACE_ROOT = </span><span style="color:#E7C58C;">&#39;/workspace&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** Cap per output stream of one exec. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> OUTPUT_MAX_BYTES = </span><span style="color:#E7C58C;">65_536</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** Cap of \`readFile\`, \`readBytes\` and \`writeFile\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> FILE_MAX_BYTES = </span><span style="color:#E7C58C;">16_777_216</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> EXEC_TIMEOUT_MS = </span><span style="color:#E7C58C;">300_000</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> EXEC_TIMEOUT_MAX_MS = </span><span style="color:#E7C58C;">1_800_000</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * The HOME of a container or pod workspace: a disk-backed volume of its own</span></span>
<span class="line"><span style="color:#7F95A6;"> * (Docker: an anonymous volume, Kubernetes: an emptyDir), kept across a</span></span>
<span class="line"><span style="color:#7F95A6;"> * restart of a stopped container and removed with the workspace. Never</span></span>
<span class="line"><span style="color:#7F95A6;"> * \`/tmp\`, which is memory-backed and charged to the memory limit: the</span></span>
<span class="line"><span style="color:#7F95A6;"> * homes of cargo, rustup, Maven, Gradle and mise&#39;s global config and</span></span>
<span class="line"><span style="color:#7F95A6;"> * shims live here.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> WORKSPACE_HOME = </span><span style="color:#E7C58C;">&#39;/home/sandbox&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * The whole environment of a container or pod workspace (plus the configured</span></span>
<span class="line"><span style="color:#7F95A6;"> * \`env\`). \`safe.directory\` because \`/workspace\` is a root-owned volume.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> SANDBOX_ENV: Readonly&lt;Record&lt;string, string&gt;&gt; = Object.freeze({</span></span>
<span class="line"><span style="color:#DCE9F2;">    HOME: WORKSPACE_HOME,</span></span>
<span class="line"><span style="color:#DCE9F2;">    GIT_TERMINAL_PROMPT: </span><span style="color:#E7C58C;">&#39;0&#39;</span><span style="color:#DCE9F2;">,</span></span>
<span class="line"><span style="color:#DCE9F2;">    GIT_CONFIG_NOSYSTEM: </span><span style="color:#E7C58C;">&#39;1&#39;</span><span style="color:#DCE9F2;">,</span></span>
<span class="line"><span style="color:#DCE9F2;">    GIT_CONFIG_COUNT: </span><span style="color:#E7C58C;">&#39;1&#39;</span><span style="color:#DCE9F2;">,</span></span>
<span class="line"><span style="color:#DCE9F2;">    GIT_CONFIG_KEY_0: </span><span style="color:#E7C58C;">&#39;safe.directory&#39;</span><span style="color:#DCE9F2;">,</span></span>
<span class="line"><span style="color:#DCE9F2;">    GIT_CONFIG_VALUE_0: WORKSPACE_ROOT,</span></span>
<span class="line"><span style="color:#DCE9F2;">    NPM_CONFIG_UPDATE_NOTIFIER: </span><span style="color:#E7C58C;">&#39;false&#39;</span><span style="color:#DCE9F2;">,</span></span>
<span class="line"><span style="color:#DCE9F2;">    CI: </span><span style="color:#E7C58C;">&#39;true&#39;</span><span style="color:#DCE9F2;">,</span></span>
<span class="line"><span style="color:#DCE9F2;">});</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { SandboxLimits } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;./types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> DEFAULT_LIMITS: Readonly&lt;Required&lt;SandboxLimits&gt;&gt; = Object.freeze({</span></span>
<span class="line"><span style="color:#DCE9F2;">    cpu: </span><span style="color:#E7C58C;">&#39;1&#39;</span><span style="color:#DCE9F2;">,</span></span>
<span class="line"><span style="color:#DCE9F2;">    memory: </span><span style="color:#E7C58C;">&#39;2Gi&#39;</span><span style="color:#DCE9F2;">,</span></span>
<span class="line"><span style="color:#DCE9F2;">    storage: </span><span style="color:#E7C58C;">&#39;4Gi&#39;</span><span style="color:#DCE9F2;">,</span></span>
<span class="line"><span style="color:#DCE9F2;">    pids: </span><span style="color:#E7C58C;">512</span><span style="color:#DCE9F2;">,</span></span>
<span class="line"><span style="color:#DCE9F2;">    maxLifetimeMs: </span><span style="color:#E7C58C;">604_800_000</span><span style="color:#DCE9F2;">,</span></span>
<span class="line"><span style="color:#DCE9F2;">});</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * The workspace image of Docker and Kubernetes: Debian with git, the build</span></span>
<span class="line"><span style="color:#7F95A6;"> * tools and mise, which installs toolchains at runtime (\`images/sandbox-dev\`).</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> DEFAULT_SANDBOX_IMAGE = </span><span style="color:#E7C58C;">&#39;ghcr.io/chamvi/sandbox-dev:trixie&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** Default size of the \`/tmp\` tmpfs of a container or pod workspace (toolchains go to the cache). */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> TMP_SIZE = </span><span style="color:#E7C58C;">&#39;1Gi&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** Labels every container or pod workspace carries. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> SANDBOX_LABELS: Readonly&lt;Record&lt;string, string&gt;&gt; = Object.freeze({</span></span>
<span class="line"><span style="color:#E7C58C;">    &#39;app.kubernetes.io/managed-by&#39;</span><span style="color:#DCE9F2;">: </span><span style="color:#E7C58C;">&#39;chamvi&#39;</span><span style="color:#DCE9F2;">,</span></span>
<span class="line"><span style="color:#E7C58C;">    &#39;app.kubernetes.io/component&#39;</span><span style="color:#DCE9F2;">: </span><span style="color:#E7C58C;">&#39;sandbox&#39;</span><span style="color:#DCE9F2;">,</span></span>
<span class="line"><span style="color:#DCE9F2;">});</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`SANDBOX_LABELS\` as \`key=value\` selectors: a Docker label filter, joined by \`,\` a Kubernetes label selector. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> SANDBOX_LABEL_SELECTORS: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[] = Object.freeze(Object.entries(SANDBOX_LABELS).map(([key, value]) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#E7C58C;"> \`</span><span style="color:#DCE9F2;">\${</span><span style="color:#E7C58C;">key</span><span style="color:#DCE9F2;">}</span><span style="color:#E7C58C;">=</span><span style="color:#DCE9F2;">\${</span><span style="color:#E7C58C;">value</span><span style="color:#DCE9F2;">}</span><span style="color:#E7C58C;">\`</span><span style="color:#DCE9F2;">));</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> RUN_LABEL = </span><span style="color:#E7C58C;">&#39;chamvi.dev/run&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> WORKSPACE_LABEL = </span><span style="color:#E7C58C;">&#39;chamvi.dev/workspace&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The deployment a workspace belongs to (\`find\` and garbage collection see only their own). */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> DEPLOYMENT_LABEL = </span><span style="color:#E7C58C;">&#39;chamvi.dev/deployment&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The deployment of a manager or provider call without one. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> DEFAULT_DEPLOYMENT = </span><span style="color:#E7C58C;">&#39;default&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`repoKey()\` of the workspace&#39;s repository (a label value; the URL itself may be longer). */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> REPO_KEY_LABEL = </span><span style="color:#E7C58C;">&#39;chamvi.dev/repo-key&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** Expiry in epoch milliseconds: a Docker label, a Kubernetes annotation. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> EXPIRES_AT_KEY = </span><span style="color:#E7C58C;">&#39;chamvi.dev/expires-at&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** Creation in epoch milliseconds: a Docker label, a Kubernetes annotation. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> CREATED_AT_KEY = </span><span style="color:#E7C58C;">&#39;chamvi.dev/created-at&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The normalized repository URL: a Docker label, a Kubernetes annotation. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> REPO_URL_KEY = </span><span style="color:#E7C58C;">&#39;chamvi.dev/repo&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The requested ref: a Docker label, a Kubernetes annotation. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> REF_KEY = </span><span style="color:#E7C58C;">&#39;chamvi.dev/ref&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The image: a Docker label, a Kubernetes annotation. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> IMAGE_KEY = </span><span style="color:#E7C58C;">&#39;chamvi.dev/image&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * The command of a workspace container or pod (\`sh -c\` with the deadline,</span></span>
<span class="line"><span style="color:#7F95A6;"> * epoch seconds, as \`$1\`): it sleeps until the workspace&#39;s \`expiresAt\`,</span></span>
<span class="line"><span style="color:#7F95A6;"> * also when Docker starts the container again after a restart or a pod is</span></span>
<span class="line"><span style="color:#7F95A6;"> * scheduled late, and exits at once past it. An absolute deadline, since a</span></span>
<span class="line"><span style="color:#7F95A6;"> * fixed \`sleep &lt;lifetime&gt;\` would start over on every start.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> const</span><span style="color:#DCE9F2;"> SLEEP_UNTIL_SCRIPT = </span><span style="color:#E7C58C;">&#39;d=$(( $1 - $(date +%s) )); if [ &quot;$d&quot; -gt 0 ]; then exec sleep &quot;$d&quot;; fi&#39;</span><span style="color:#DCE9F2;">;</span></span></code></pre></div><h3 id="rules" tabindex="-1">Rules <a class="header-anchor" href="#rules" aria-label="Permalink to &quot;Rules&quot;">​</a></h3><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> normalizeRepo(input: string, options?: NormalizeRepoOptions): string;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> assertGitRef(ref: string): void;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> resolveWorkspacePath(path: string): string;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> resolveLimits(...layers: Array&lt;SandboxLimits | undefined&gt;): Required&lt;SandboxLimits&gt;;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> parseCpu(value: string): number;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> parseMemory(value: string): number;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> assertSandboxEnv(env: Record&lt;string, string&gt; | undefined): void;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> prepareWorkspace(</span></span>
<span class="line"><span style="color:#DCE9F2;">    workspace: IWorkspace,</span></span>
<span class="line"><span style="color:#DCE9F2;">    input: { repo?: string; ref?: string; depth?: number; credential?: GitCredential; signal?: AbortSignal },</span></span>
<span class="line"><span style="color:#DCE9F2;">): Promise&lt;{ commit?: string; defaultBranch?: string }&gt;;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> readCheckout(workspace: IWorkspace, signal?: AbortSignal, clock?: IClock, options?: { failOnError?: boolean }): Promise&lt;{ commit?: string; defaultBranch?: string } | undefined&gt;;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> createOutputCollector(maxBytes: number): IOutputCollector;</span></span></code></pre></div><p>For provider authors, the workspace metadata <code>find</code> rebuilds the info from:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> assertDeployment(value: unknown): string; </span><span style="color:#7F95A6;">// DEFAULT_DEPLOYMENT for undefined, else a label value or ValidationError</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> repoKey(repo: string): string;            </span><span style="color:#7F95A6;">// 32 hex of the URL&#39;s sha256, a label value</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> workspaceLabels(input: { id: string; runId: string; deployment: string; repo?: string }): Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> workspaceMetadata(info: WorkspaceInfo): Record&lt;string, string&gt;; </span><span style="color:#7F95A6;">// created, expiry, repo, ref, image</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> readWorkspaceInfo(values: Readonly&lt;Record&lt;string, string | undefined&gt;&gt;, provider: string): WorkspaceInfo | undefined;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> createSettledCheck(isSettled?: (runId: string) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> Promise&lt;boolean&gt;): (runId: string) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> Promise&lt;boolean | SandboxError&gt;;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> lifetimeSeconds(info: Pick&lt;WorkspaceInfo, </span><span style="color:#E7C58C;">&#39;createdAt&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;expiresAt&#39;</span><span style="color:#DCE9F2;">&gt;): number; </span><span style="color:#7F95A6;">// whole seconds, rounded up, at least 1: how long a container or pod sleeps</span></span></code></pre></div><p><code>normalizeRepo</code>, <code>assertGitRef</code> and <code>resolveWorkspacePath</code> throw <code>ValidationError</code> (model input); <code>resolveLimits</code>, <code>parseCpu</code>, <code>parseMemory</code> and <code>assertSandboxEnv</code> throw <code>InvalidAgentDefinitionError</code> (configuration); <code>prepareWorkspace</code> throws <code>SandboxError</code> with git&#39;s stderr when a checkout step fails, records the default branch as <code>git config chamvi.defaultBranch</code> and, as its last step, the checkout as <code>git config chamvi.checkout</code> (the commit, or <code>none</code> without a repo). <code>readCheckout</code> reads both back: <code>{ commit, defaultBranch? }</code>, <code>{}</code> for a repo-less workspace, <code>undefined</code> for a create that died before its checkout finished, which <code>find</code> must skip, and (after a few retries) for a workspace it cannot read; with <code>failOnError</code> that unreadable one is a <code>SandboxError</code> instead.</p><h3 id="images-privileges-and-the-cache" tabindex="-1">Images, privileges and the cache <a class="header-anchor" href="#images-privileges-and-the-cache" aria-label="Permalink to &quot;Images, privileges and the cache&quot;">​</a></h3><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> assertImage(value: unknown): string;               </span><span style="color:#7F95A6;">// an image reference, else ValidationError (never echoed)</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> probeImage(transport: IExecTransport, options: { image: string; clock?: IClock; signal?: AbortSignal }): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> cacheEnv(dir: string): Record&lt;string, string&gt;;     </span><span style="color:#7F95A6;">// CACHE_ENV&#39;s variables under another folder (local)</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> isRootUser(user: string | number): boolean;        </span><span style="color:#7F95A6;">// 0, &#39;0:&lt;gid&gt;&#39;, &#39;root&#39;, &#39;root:&lt;group&gt;&#39;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> assertTmpSizeOption(value: unknown): void;         </span><span style="color:#7F95A6;">// a positive memory quantity, else InvalidAgentDefinitionError</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> CACHE_DIR: </span><span style="color:#E7C58C;">&#39;/cache&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> WORKSPACE_HOME: </span><span style="color:#E7C58C;">&#39;/home/sandbox&#39;</span><span style="color:#DCE9F2;">;                      </span><span style="color:#7F95A6;">// HOME of a container or pod workspace, a disk-backed volume of its own</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> CACHE_ENV: Readonly&lt;Record&lt;string, string&gt;&gt;;          </span><span style="color:#7F95A6;">// XDG_CACHE_HOME, npm_config_cache, PIP_CACHE_DIR, GOMODCACHE, GOCACHE, COMPOSER_CACHE_DIR</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> ROOT_CAPABILITIES: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[];                 </span><span style="color:#7F95A6;">// CHOWN, DAC_OVERRIDE, FOWNER, FSETID, SETUID, SETGID, KILL</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> IMAGE_REQUIREMENTS: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[];                </span><span style="color:#7F95A6;">// sh, git, timeout (with -k), head, base64, tr</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> IMAGE_PROBE_TIMEOUT_MS: </span><span style="color:#E7C58C;">30_000</span><span style="color:#DCE9F2;">;</span></span></code></pre></div><p><code>probeImage</code> runs one <code>sh -c</code> script straight on the transport (every workspace exec goes through <code>timeout</code>, which may be what is missing), right after the container or pod started and before the checkout: a <code>SandboxError</code> names what the image lacks (<code>git</code>, <code>timeout</code>, <code>a timeout that supports -k</code>, <code>sh</code> when the script cannot start, <code>sh at /bin/sh</code>, or <code>head</code>, <code>base64</code> or <code>tr</code> missing from <code>/usr/bin</code> and <code>/bin</code>, the only directories the repository guidance collector resolves them in), or why the probe failed (no answer within <code>IMAGE_PROBE_TIMEOUT_MS</code> on the clock). Docker and Kubernetes add <code>ROOT_CAPABILITIES</code> back for a root user only and mount <code>/cache</code> with <code>CACHE_ENV</code> in every workspace.</p><h3 id="remote-workspaces" tabindex="-1">Remote workspaces <a class="header-anchor" href="#remote-workspaces" aria-label="Permalink to &quot;Remote workspaces&quot;">​</a></h3><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> createRemoteWorkspace(input: RemoteWorkspaceInput): IWorkspace;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> TIMEOUT_KILL_AFTER_SECONDS: </span><span style="color:#E7C58C;">5</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> EXEC_GRACE_MS: </span><span style="color:#E7C58C;">15_000</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> ALIVE_PROBE_TIMEOUT_MS: </span><span style="color:#E7C58C;">5_000</span><span style="color:#DCE9F2;">;</span></span></code></pre></div><p>A provider that can run argv in a container implements <code>IExecTransport</code>: it runs argv, streams stdout and stderr into the sinks it is given and resolves the exit code. <code>createRemoteWorkspace</code> adds the rest: the <code>sh -c</code> script that enters the working directory, runs the command behind the timeout wrapper and reports its exit on stderr (so an exec returns about 2 s after the command exited, even when a background job holds its output), the guard, path checks, output caps, file reads and writes, dispose. After a failed exec it asks <code>alive()</code> (at most <code>ALIVE_PROBE_TIMEOUT_MS</code>); <code>false</code> marks the workspace gone (<code>disposed</code>).</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { IClock } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { IOutputSink } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../output/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { WorkspaceInfo } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../workspace/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> TransportExecOptions = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    stdin?: Uint8Array;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Gets every stdout chunk as it arrives; the workspace caps and keeps it. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    stdout: IOutputSink;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Gets every stderr chunk as it arrives; the workspace caps and keeps it. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    stderr: IOutputSink;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Aborted on a caller abort, a dispose, the client-side guard, or once the</span></span>
<span class="line"><span style="color:#7F95A6;">     * workspace settled the exec itself (the command exited, a background job</span></span>
<span class="line"><span style="color:#7F95A6;">     * still holds its output): stop waiting and detach.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    signal: AbortSignal;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> TransportExecResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    exitCode: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The connection closed before the stream ended (e.g. the daemon reset it</span></span>
<span class="line"><span style="color:#7F95A6;">     * after the command exited with stdin still queued): the output may be</span></span>
<span class="line"><span style="color:#7F95A6;">     * cut, so the workspace accepts the result only after the exit marker.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    closed?: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * Runs argv in one container or pod. The remote workspace wraps argv itself</span></span>
<span class="line"><span style="color:#7F95A6;"> * (the working directory, GNU \`timeout\`, the exit status reported on</span></span>
<span class="line"><span style="color:#7F95A6;"> * stderr); a transport only executes and streams the output.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> IExecTransport {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** A command that cannot start reports exit 127. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    exec(argv: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[], options: TransportExecOptions): Promise&lt;TransportExecResult&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Whether the container or pod still runs; asked after a failed exec. False</span></span>
<span class="line"><span style="color:#7F95A6;">     * marks the workspace gone. A rejection, or no answer within</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`ALIVE_PROBE_TIMEOUT_MS\` (the signal then aborts), reads as alive.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    alive?(signal: AbortSignal): Promise&lt;boolean&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Deletes the container or pod; idempotent, a missing one is fine. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    remove(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> RemoteWorkspaceInput = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`randomUUID()\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    id: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** A mutable object the provider owns (it sets \`commit\` after the checkout). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    info: WorkspaceInfo;</span></span>
<span class="line"><span style="color:#DCE9F2;">    transport: IExecTransport;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Default \`systemClock\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    clock?: IClock;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><h3 id="context" tabindex="-1">Context <a class="header-anchor" href="#context" aria-label="Permalink to &quot;Context&quot;">​</a></h3><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> provideSandboxContext(provider: IContextProvider, manager: IWorkspaceManager): void; </span><span style="color:#7F95A6;">// engine.provide under the key &#39;sandbox&#39;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> injectSandboxContext(ctx: ToolContext): IWorkspaceManager;                         </span><span style="color:#7F95A6;">// else ContextNotProvidedError</span></span></code></pre></div><p><code>sandboxModule()</code> provides its manager; with a hand-built engine call <code>provideSandboxContext(engine, manager)</code> after <code>new Engine()</code>. A tools factory then builds the workspace and coding tools per execution: <code>tools: (ctx) =&gt; { const manager = injectSandboxContext(ctx); return { ...manager.tools(), ...codingTools(manager) }; }</code>. See <a href="/guide/tools#context-shared-instances-for-tools">Context</a>.</p><h3 id="module" tabindex="-1">Module <a class="header-anchor" href="#module" aria-label="Permalink to &quot;Module&quot;">​</a></h3><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">// @chamvi/sandbox/module, needs @chamvi/app</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> sandboxModule(options?: SandboxModuleOptions): SandboxModule; </span><span style="color:#7F95A6;">// name SANDBOX_MODULE_NAME &#39;chamvi:sandbox&#39;, .manager: IWorkspaceManager</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> SANDBOX_PROVIDER_NAMES: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> SandboxProviderName[]; </span><span style="color:#7F95A6;">// [&#39;local&#39;, &#39;docker&#39;, &#39;kubernetes&#39;]</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> SUSPEND_AFTER_MS: </span><span style="color:#E7C58C;">1_800_000</span><span style="color:#DCE9F2;">;</span></span></code></pre></div><p>Git credentials: the <code>credentials</code> option, then the tokens of <code>CHAMVI_GIT_TOKENS</code> (a JSON list of <code>StaticGitCredential</code>; an error names the variable and the entry, never a token), then every source other modules contribute to <code>AppToken.GIT_CREDENTIALS</code> (<code>githubModule()</code>&#39;s App), asked on each lookup. The provider is <code>CHAMVI_SANDBOX_PROVIDER</code>, else <code>options.provider</code>, else <code>local</code>, read from <code>options.env ?? process.env</code> when the factory is called; <code>CHAMVI_SANDBOX_NAMESPACE</code>, <code>CHAMVI_SANDBOX_IMAGE</code> and <code>CHAMVI_DEPLOYMENT</code> (the manager&#39;s <code>deployment</code>) win over the options too. <code>isSuspendable</code> defaults to a run <code>waiting</code> for at least <code>suspendAfterMs</code> (<code>CHAMVI_SANDBOX_SUSPEND_AFTER_MS</code>, default <code>SUSPEND_AFTER_MS</code> 30 minutes, <code>0</code> disables this default only: an <code>isSuspendable</code> option replaces it and still applies). On <code>kubernetes</code>, <code>CHAMVI_SANDBOX_PERSISTENCE</code> (<code>true</code>/<code>false</code>, over whether <code>persistence</code> is set) and <code>CHAMVI_SANDBOX_STORAGE_CLASS</code> (over <code>persistence.storageClassName</code>) build the provider&#39;s <code>persistence</code>; other providers ignore them. On <code>docker</code>, <code>CHAMVI_SANDBOX_DOCKER_SUSPEND</code> (<code>true</code>/<code>false</code>, over the <code>suspend</code> option, default false) turns suspension on. <code>isSettled</code> defaults to the engine&#39;s <code>getRun</code>: a settled run&#39;s workspaces are collected, and a missing run&#39;s only with a named deployment (<code>CHAMVI_DEPLOYMENT</code> or <code>deployment</code>), since in <code>default</code> an unknown run may be another app&#39;s on the same host; give each app sharing a host its own name. In start and job mode <code>setup</code> imports the provider package (<code>@chamvi/sandbox-local</code>, <code>@chamvi/sandbox-docker</code> or <code>@chamvi/sandbox-k8s</code>, installed beside <code>@chamvi/sandbox</code> and resolved from there; they are no declared peers, since every provider depends on <code>@chamvi/sandbox</code> and release-please refuses the cycle; a missing one throws <code>InvalidAgentDefinitionError</code> naming it, and under a strict layout that hides undeclared packages (Yarn PnP, pnpm with <code>hoist=false</code>) pass a built provider as <code>options.provider</code>), and the lifecycle hooks attach the manager to the engine, provide it (<code>engineCreated</code>; in start mode also starting the garbage collection every <code>gcIntervalMs</code> on the engine&#39;s clock) and close it after the engine drained (the collection timer stopped first); <code>CHAMVI_SANDBOX_IMAGES</code> (a comma list of exact image references; an entry that is none is an <code>InvalidAgentDefinitionError</code> naming the variable) is the image allow-list and wins over <code>allowImage</code>; migrate mode does nothing. <code>@chamvi/app</code> is an optional peer: the main entry never imports it.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> SandboxProviderName = </span><span style="color:#E7C58C;">&#39;local&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;docker&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;kubernetes&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The kubernetes provider&#39;s \`persistence\`, structurally (a claim per workspace). */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> SandboxPersistence = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** A DNS-1123 subdomain; default the cluster&#39;s default storage class. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    storageClassName?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The claim&#39;s storage request (a quantity); default the resolved \`limits.storage\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    size?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * \`createWorkspaceManager()\` options; the manager&#39;s \`env\` is \`workspaceEnv\`</span></span>
<span class="line"><span style="color:#7F95A6;"> * here, since \`env\` is the process env the factory reads. \`deployment\`:</span></span>
<span class="line"><span style="color:#7F95A6;"> * \`CHAMVI_DEPLOYMENT\` wins; \`isSettled\` defaults to the engine&#39;s \`getRun\`</span></span>
<span class="line"><span style="color:#7F95A6;"> * (a settled run, and with a named deployment also a missing one), and</span></span>
<span class="line"><span style="color:#7F95A6;"> * \`isSuspendable\` to a run \`waiting\` for at least \`suspendAfterMs\` (a</span></span>
<span class="line"><span style="color:#7F95A6;"> * given \`isSuspendable\` replaces that default).</span></span>
<span class="line"><span style="color:#7F95A6;"> * \`allowImage\`: \`CHAMVI_SANDBOX_IMAGES\` (a comma list of exact image</span></span>
<span class="line"><span style="color:#7F95A6;"> * references) wins; without either, \`create_workspace\` offers no \`image\`.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> SandboxModuleOptions = Omit&lt;WorkspaceManagerOptions, </span><span style="color:#E7C58C;">&#39;provider&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;env&#39;</span><span style="color:#DCE9F2;">&gt; &amp; {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** A provider name (\`CHAMVI_SANDBOX_PROVIDER\` wins) or an instance; default \`&#39;local&#39;\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    provider?: SandboxProviderName | ISandboxProvider;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Used as is; no provider is built then. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    manager?: IWorkspaceManager;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Kubernetes namespace of the workspace pods; \`CHAMVI_SANDBOX_NAMESPACE\` wins. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    namespace?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Docker and Kubernetes image; \`CHAMVI_SANDBOX_IMAGE\` wins, default \`DEFAULT_SANDBOX_IMAGE\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    image?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Kubernetes only: a claim per workspace keeping \`/workspace\` and</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`/home/sandbox\`, so a suspended run&#39;s files survive its pod.</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`CHAMVI_SANDBOX_PERSISTENCE\` (\`true\`/\`false\`) wins over whether it is</span></span>
<span class="line"><span style="color:#7F95A6;">     * set, \`CHAMVI_SANDBOX_STORAGE_CLASS\` over \`storageClassName\` (default</span></span>
<span class="line"><span style="color:#7F95A6;">     * the cluster&#39;s default class); \`size\` default the storage limit.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    persistence?: SandboxPersistence;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Docker only: stop the containers of long-waiting runs (files kept,</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`/tmp\` and background jobs lost). \`CHAMVI_SANDBOX_DOCKER_SUSPEND\`</span></span>
<span class="line"><span style="color:#7F95A6;">     * (\`true\`/\`false\`) wins; default false, since a sleeping container</span></span>
<span class="line"><span style="color:#7F95A6;">     * reserves nothing.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    suspend?: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Added to every workspace&#39;s environment. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    workspaceEnv?: Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * How long a run waits (status \`waiting\`, since its \`updatedAt\`) before</span></span>
<span class="line"><span style="color:#7F95A6;">     * the collection suspends its workspaces, in ms; \`0\` disables the</span></span>
<span class="line"><span style="color:#7F95A6;">     * default predicate only (a given \`isSuspendable\` replaces it and still</span></span>
<span class="line"><span style="color:#7F95A6;">     * applies). \`CHAMVI_SANDBOX_SUSPEND_AFTER_MS\` wins, default \`SUSPEND_AFTER_MS\`.</span></span>
<span class="line"><span style="color:#7F95A6;">     * Takes effect with the start-mode collector, so up to \`gcIntervalMs\`</span></span>
<span class="line"><span style="color:#7F95A6;">     * later.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    suspendAfterMs?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Default \`process.env\`, read when the factory is called. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    env?: Env;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><h2 id="chamvi-sandbox-local" tabindex="-1">@chamvi/sandbox-local <a class="header-anchor" href="#chamvi-sandbox-local" aria-label="Permalink to &quot;@chamvi/sandbox-local&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> createLocalSandbox(options?: LocalSandboxOptions): ISandboxProvider; </span><span style="color:#7F95A6;">// name &#39;local&#39;</span></span></code></pre></div><p>No isolation: development and tests only. Workspaces are folders under <code>root</code> (default <code>&lt;os tmpdir&gt;/chamvi-workspaces</code>); of the limits only <code>maxLifetimeMs</code> applies. The cache variables point into <code>&lt;root&gt;/.cache</code> (<code>cache: false</code> sets none). <code>find</code> rebuilds a workspace from its <code>workspace.json</code>, so a restarted process reaches it; the record holds the create&#39;s <code>env</code> on disk, so the folder is <code>0700</code> and the record <code>0600</code>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { IClock } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { SandboxLimits, WorkspaceInfo } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/sandbox&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> LocalSandboxOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Directory holding one folder per workspace. Default \`join(os.tmpdir(), &#39;chamvi-workspaces&#39;)\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    root?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Added to every workspace&#39;s environment (after the defaults, so it wins). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    env?: Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The only limit local enforces: the workspace lifetime (expiry, \`maxLifetimeMs\`). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    limits?: Pick&lt;SandboxLimits, </span><span style="color:#E7C58C;">&#39;maxLifetimeMs&#39;</span><span style="color:#DCE9F2;">&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Point the package caches (\`CACHE_ENV\`&#39;s variables) into \`&lt;root&gt;/.cache\`,</span></span>
<span class="line"><span style="color:#7F95A6;">     * shared by every workspace of the root. Default true.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    cache?: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    clock?: IClock;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** What \`LocalWorkspace\` is built from (internal). */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> LocalWorkspaceInput = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    id: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The workspace folder \`&lt;root&gt;/&lt;id&gt;\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    dir: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    info: WorkspaceInfo;</span></span>
<span class="line"><span style="color:#DCE9F2;">    env: Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    clock: IClock;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Called once when the workspace starts disposing. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    onDispose: () </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> void;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * \`workspace.json\` of a workspace folder (internal): what \`find\` rebuilds</span></span>
<span class="line"><span style="color:#7F95A6;"> * the workspace from and the garbage collection reads. Times are ISO strings.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> WorkspaceRecord = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    runId: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    deployment: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    repo?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    ref?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The create&#39;s \`env\` (the provider&#39;s own is added again on every exec). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    env?: Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    createdAt: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    expiresAt: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** A readable workspace record (internal). */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> ParsedRecord = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    runId: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    deployment: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    env?: Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    info: WorkspaceInfo;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><h2 id="chamvi-sandbox-docker" tabindex="-1">@chamvi/sandbox-docker <a class="header-anchor" href="#chamvi-sandbox-docker" aria-label="Permalink to &quot;@chamvi/sandbox-docker&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> createDockerSandbox(options?: DockerSandboxOptions): ISandboxProvider; </span><span style="color:#7F95A6;">// name &#39;docker&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> DEFAULT_NETWORK: </span><span style="color:#E7C58C;">&#39;bridge&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> CONTAINER_NAME_PREFIX: </span><span style="color:#E7C58C;">&#39;chamvi-ws-&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> DEFAULT_USER: </span><span style="color:#E7C58C;">&#39;0:0&#39;</span><span style="color:#DCE9F2;">;</span></span></code></pre></div><p>One container per workspace (<code>sh -c</code> sleeping until <code>expiresAt</code>, also after a restart, under docker-init, <code>Init: true</code>, which reaps orphans for any image, with the image&#39;s entrypoint replaced: it stops itself at <code>expiresAt</code>), removed with its volume on dispose or by the garbage collection. Root with a writable root and <code>ROOT_CAPABILITIES</code> by default; <code>{ user: &#39;1000:1000&#39;, readOnlyRoot: true }</code> is the hardened mode. <code>/cache</code> is an anonymous volume per workspace, or with <code>cache: { volume }</code> that named volume, shared by every workspace using it (a trust boundary). <code>pull</code> applies to every image, also one a run asked for. <code>find</code> lists a run&#39;s containers by label and starts a stopped one again (with <code>restore: false</code> it starts nothing). Only with <code>suspend</code> does the collection stop the containers of suspendable runs. Creating the provider contacts nothing.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { IClock } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { SandboxLimits, WorkspaceInfo } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/sandbox&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> Dockerode </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;dockerode&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> DockerSandboxOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The Docker client; default \`new Docker()\` (\`DOCKER_HOST\` or \`/var/run/docker.sock\`). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    docker?: Dockerode;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Default \`DEFAULT_SANDBOX_IMAGE\`; pin a digest in production. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    image?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Default \`DEFAULT_NETWORK\` (\`&#39;bridge&#39;\`); \`&#39;none&#39;\` (repo-less workspaces only,</span></span>
<span class="line"><span style="color:#7F95A6;">     * the clone runs inside) or any user-created network name, passed through.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    network?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`&#39;missing&#39;\` (default) pulls once when the image is not present, \`&#39;always&#39;\`</span></span>
<span class="line"><span style="color:#7F95A6;">     * before every create (a mutable tag then follows its rebuilds), \`&#39;never&#39;\`</span></span>
<span class="line"><span style="color:#7F95A6;">     * never. It covers every image: the provider&#39;s \`image\`, the manager&#39;s and</span></span>
<span class="line"><span style="color:#7F95A6;">     * one a run asked for (\`create_workspace({ image })\`).</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    pull?: </span><span style="color:#E7C58C;">&#39;missing&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;always&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;never&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Added to every workspace&#39;s environment, after \`SANDBOX_ENV\` and \`CACHE_ENV\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    env?: Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    limits?: SandboxLimits;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The container user and the user of every command; default \`DEFAULT_USER\`</span></span>
<span class="line"><span style="color:#7F95A6;">     * (\`&#39;0:0&#39;\`, root with the \`ROOT_CAPABILITIES\`). \`&#39;1000:1000&#39;\` with</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`readOnlyRoot: true\` is the hardened mode (no capability at all).</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    user?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** A read-only root filesystem (only \`/workspace\`, \`/cache\` and \`/tmp\` writable). Default false. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    readOnlyRoot?: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The \`/cache\` mount. Default: an anonymous volume per workspace,</span></span>
<span class="line"><span style="color:#7F95A6;">     * removed with it. \`{ volume }\` mounts that named volume in every</span></span>
<span class="line"><span style="color:#7F95A6;">     * workspace instead: a trust boundary shared by every run and agent on</span></span>
<span class="line"><span style="color:#7F95A6;">     * the host (a package one run fetched can be used by another). Never</span></span>
<span class="line"><span style="color:#7F95A6;">     * point a non-root \`user\` at a volume a root workspace wrote to.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    cache?: { volume: string };</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Stop the running container of a suspendable run in \`collectGarbage\`</span></span>
<span class="line"><span style="color:#7F95A6;">     * (its volume and root filesystem kept, \`/tmp\` and background jobs</span></span>
<span class="line"><span style="color:#7F95A6;">     * lost); \`find\` starts it again. Default false: a sleeping container</span></span>
<span class="line"><span style="color:#7F95A6;">     * reserves nothing on Docker, so it keeps running.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    suspend?: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Size of the \`/tmp\` tmpfs; default \`TMP_SIZE\` (\`&#39;1Gi&#39;\`). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    tmpSize?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    clock?: IClock;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> ContainerOptionsInput = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    id: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    deployment: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Run, image, repo, ref and times: labels a provider&#39;s \`find\` rebuilds the info from. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    info: WorkspaceInfo &amp; { image: string };</span></span>
<span class="line"><span style="color:#DCE9F2;">    network: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    user: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    readOnlyRoot: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The shared cache volume (\`cache.volume\`); undefined mounts an anonymous one per workspace. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    cacheVolume?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    tmpSize: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    env: Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    limits: Required&lt;SandboxLimits&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><h2 id="chamvi-sandbox-k8s" tabindex="-1">@chamvi/sandbox-k8s <a class="header-anchor" href="#chamvi-sandbox-k8s" aria-label="Permalink to &quot;@chamvi/sandbox-k8s&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> createKubernetesSandbox(options: KubernetesSandboxOptions): ISandboxProvider; </span><span style="color:#7F95A6;">// name &#39;k8s&#39;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> createPodClient(input: CreatePodClientInput): IPodClient;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> CONTAINER_NAME: </span><span style="color:#E7C58C;">&#39;sandbox&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> POD_NAME_PREFIX: </span><span style="color:#E7C58C;">&#39;chamvi-ws-&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> START_TIMEOUT_MS: </span><span style="color:#E7C58C;">120_000</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> POLL_MS: </span><span style="color:#E7C58C;">1_000</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> FATAL_WAITING_REASONS: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[];</span></span></code></pre></div><p>One pod per workspace, sleeping for its lifetime with that <code>activeDeadlineSeconds</code> (the image&#39;s entrypoint replaced), so it ends itself at <code>expiresAt</code>; <code>imagePullPolicy</code> applies to every image; <code>find</code> lists a run&#39;s running pods by label. Root with a writable root and <code>ROOT_CAPABILITIES</code> by default (Pod Security <code>baseline</code>); <code>{ user: { uid: 1000, gid: 1000 }, readOnlyRoot: true }</code> is the hardened mode (<code>restricted</code>). <code>/cache</code> is the claim of <code>cache.claimName</code> or an emptyDir. With <code>persistence</code> each workspace gets a ReadWriteOnce claim <code>chamvi-ws-&lt;id&gt;</code> for <code>/workspace</code> and <code>/home/sandbox</code>: the collection suspends a waiting run&#39;s pod by deleting it (the claim stays) and <code>find</code> rebuilds it (a failed rebuild is a <code>SandboxError</code>); the claim goes with the workspace (dispose, expiry, a settled run). A node-local storage class pins the rebuilt pod to its node. The Role needs <code>pods</code> <code>create</code>, <code>get</code>, <code>list</code>, <code>delete</code> and <code>pods/exec</code> <code>get</code> and <code>create</code> in the sandbox namespace, with <code>persistence</code> also <code>persistentvolumeclaims</code> <code>create</code>, <code>get</code>, <code>list</code>, <code>delete</code>. See <a href="/deployment/kubernetes#sandboxes-in-the-cluster">Kubernetes &amp; Flux</a>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { KubeConfig } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@kubernetes/client-node&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { IClock } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { SandboxLimits, WorkspaceInfo } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/sandbox&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { IPodClient } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../client/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> ImagePullPolicy = </span><span style="color:#E7C58C;">&#39;Always&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;IfNotPresent&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> PodUser = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    uid: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    gid: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * A ReadWriteOnce claim per workspace (\`chamvi-ws-&lt;id&gt;\`, like its pod)</span></span>
<span class="line"><span style="color:#7F95A6;"> * holding \`/workspace\` and \`/home/sandbox\`, so the files outlive the pod.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> KubernetesPersistence = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** A DNS-1123 subdomain; default the cluster&#39;s default storage class. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    storageClassName?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The claim&#39;s storage request (a quantity); default the resolved \`limits.storage\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    size?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> KubernetesSandboxOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Namespace of the workspace pods (required). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    namespace: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Default \`new KubeConfig()\` with \`loadFromDefault()\` (in-cluster or \`KUBECONFIG\`). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    kubeConfig?: KubeConfig;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Default \`DEFAULT_SANDBOX_IMAGE\`; pin a digest in production. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    image?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Added to every workspace&#39;s environment, after \`SANDBOX_ENV\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    env?: Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    limits?: SandboxLimits;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Extra pod labels (e.g. for a NetworkPolicy); may not name a managed label. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    podLabels?: Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Pull policy of every workspace image (the provider&#39;s, the manager&#39;s</span></span>
<span class="line"><span style="color:#7F95A6;">     * and one a run asked for through \`create_workspace({ image })\`):</span></span>
<span class="line"><span style="color:#7F95A6;">     * default \`&#39;IfNotPresent&#39;\`, \`&#39;Always&#39;\` for a mutable tag.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    imagePullPolicy?: ImagePullPolicy;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * uid and gid of the pod; default \`{ uid: 0, gid: 0 }\` (root with the</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`ROOT_CAPABILITIES\`, which needs a namespace whose Pod Security admits</span></span>
<span class="line"><span style="color:#7F95A6;">     * root pods, i.e. \`baseline\`). \`{ uid: 1000, gid: 1000 }\` with</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`readOnlyRoot: true\` is the hardened mode, which \`restricted\` admits.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    user?: PodUser;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** A read-only root filesystem (only \`/workspace\`, \`/cache\` and \`/tmp\` writable). Default false. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    readOnlyRoot?: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * A ReadWriteMany claim every workspace mounts at \`/cache\`, shared by every</span></span>
<span class="line"><span style="color:#7F95A6;">     * run and agent of the namespace (a package one run fetched can be used by</span></span>
<span class="line"><span style="color:#7F95A6;">     * another). Without it each pod gets an emptyDir \`/cache\` of its own.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    cache?: { claimName: string };</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Keep each workspace&#39;s files on a claim of its own (see</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`KubernetesPersistence\`); a custom \`client\` then needs the claim</span></span>
<span class="line"><span style="color:#7F95A6;">     * methods. Default none: the files live in emptyDirs and go with the pod.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    persistence?: KubernetesPersistence;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Size of the in-memory \`/tmp\`; default \`TMP_SIZE\` (\`&#39;1Gi&#39;\`). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    tmpSize?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Default \`START_TIMEOUT_MS\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    startTimeoutMs?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Default \`POLL_MS\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    pollMs?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    clock?: IClock;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Test seam; default \`createPodClient({ kubeConfig, namespace })\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    client?: IPodClient;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> PodInput = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    id: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    deployment: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    namespace: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Run, image, repo, ref and times: labels and annotations a provider&#39;s \`find\` rebuilds the info from. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    info: WorkspaceInfo &amp; { image: string };</span></span>
<span class="line"><span style="color:#DCE9F2;">    env: Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    limits: Required&lt;SandboxLimits&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The \`podLabels\`; the managed labels win. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    labels: Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    imagePullPolicy: ImagePullPolicy;</span></span>
<span class="line"><span style="color:#DCE9F2;">    user: PodUser;</span></span>
<span class="line"><span style="color:#DCE9F2;">    readOnlyRoot: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The shared cache claim; undefined mounts an emptyDir. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    cacheClaim?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The workspace&#39;s own claim for \`/workspace\` and the home; undefined mounts emptyDirs. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    claim?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    tmpSize: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Default \`lifetimeSeconds(info)\`; a pod rebuilt from its claim gets what is left. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    activeDeadlineSeconds?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> ClaimInput = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    id: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    deployment: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    namespace: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The same labels and annotations as the pod&#39;s, so \`readWorkspaceInfo()\` works on the claim. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    info: WorkspaceInfo &amp; { image: string };</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The storage request, a quantity. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    size: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    storageClassName?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { Writable } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;node:stream&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> {</span></span>
<span class="line"><span style="color:#DCE9F2;">    CoreV1Api,</span></span>
<span class="line"><span style="color:#DCE9F2;">    Exec,</span></span>
<span class="line"><span style="color:#DCE9F2;">    KubeConfig,</span></span>
<span class="line"><span style="color:#DCE9F2;">    V1PersistentVolumeClaim,</span></span>
<span class="line"><span style="color:#DCE9F2;">    V1Pod,</span></span>
<span class="line"><span style="color:#DCE9F2;">} </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@kubernetes/client-node&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> PodExecInput = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    argv: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[];</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Written to the command; closed only on the \`v5.channel.k8s.io\` protocol. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    stdin?: Uint8Array;</span></span>
<span class="line"><span style="color:#DCE9F2;">    stdout: Writable;</span></span>
<span class="line"><span style="color:#DCE9F2;">    stderr: Writable;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Closes the socket: the command runs on until its \`timeout\` or the pod&#39;s deletion. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    signal: AbortSignal;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * The pod operations the Kubernetes sandbox needs, in one namespace. Every</span></span>
<span class="line"><span style="color:#7F95A6;"> * failure is a \`SandboxError\`; deleting a missing pod is fine. The claim</span></span>
<span class="line"><span style="color:#7F95A6;"> * methods are needed only with the provider&#39;s \`persistence\`.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> IPodClient {</span></span>
<span class="line"><span style="color:#DCE9F2;">    create(pod: V1Pod): Promise&lt;V1Pod&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    read(name: string): Promise&lt;V1Pod&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Without a grace period; a missing pod is fine. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    delete(name: string): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    list(labelSelector: string): Promise&lt;V1Pod[]&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Runs argv in the pod&#39;s sandbox container; the exit code from the exec status. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    exec(name: string, input: PodExecInput): Promise&lt;{ exitCode: number }&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    createClaim?(claim: V1PersistentVolumeClaim): Promise&lt;V1PersistentVolumeClaim&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** A missing claim is fine. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    deleteClaim?(name: string): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    listClaims?(labelSelector: string): Promise&lt;V1PersistentVolumeClaim[]&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> CreatePodClientInput = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    kubeConfig: KubeConfig;</span></span>
<span class="line"><span style="color:#DCE9F2;">    namespace: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> PodClientParts = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    core: Pick&lt;</span></span>
<span class="line"><span style="color:#DCE9F2;">        CoreV1Api,</span></span>
<span class="line"><span style="color:#E7C58C;">        &#39;createNamespacedPod&#39;</span><span style="color:#DCE9F2;"> |</span></span>
<span class="line"><span style="color:#E7C58C;">        &#39;readNamespacedPod&#39;</span><span style="color:#DCE9F2;"> |</span></span>
<span class="line"><span style="color:#E7C58C;">        &#39;deleteNamespacedPod&#39;</span><span style="color:#DCE9F2;"> |</span></span>
<span class="line"><span style="color:#E7C58C;">        &#39;listNamespacedPod&#39;</span><span style="color:#DCE9F2;"> |</span></span>
<span class="line"><span style="color:#E7C58C;">        &#39;createNamespacedPersistentVolumeClaim&#39;</span><span style="color:#DCE9F2;"> |</span></span>
<span class="line"><span style="color:#E7C58C;">        &#39;deleteNamespacedPersistentVolumeClaim&#39;</span><span style="color:#DCE9F2;"> |</span></span>
<span class="line"><span style="color:#E7C58C;">        &#39;listNamespacedPersistentVolumeClaim&#39;</span></span>
<span class="line"><span style="color:#DCE9F2;">    &gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    exec: Pick&lt;Exec, </span><span style="color:#E7C58C;">&#39;exec&#39;</span><span style="color:#DCE9F2;">&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    namespace: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The part of the exec WebSocket the client uses. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> ExecSocket = {</span></span>
<span class="line"><span style="color:#8FD0F2;">    readonly</span><span style="color:#DCE9F2;"> protocol: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    close(): void;</span></span>
<span class="line"><span style="color:#DCE9F2;">    on(event: </span><span style="color:#E7C58C;">&#39;close&#39;</span><span style="color:#DCE9F2;">, listener: () </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> void): unknown;</span></span>
<span class="line"><span style="color:#DCE9F2;">    on(event: </span><span style="color:#E7C58C;">&#39;error&#39;</span><span style="color:#DCE9F2;">, listener: (error: Error) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> void): unknown;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><h3 id="bash-first-migration" tabindex="-1">Bash-first migration <a class="header-anchor" href="#bash-first-migration" aria-label="Permalink to &quot;Bash-first migration&quot;">​</a></h3><p>Remove <code>credentialMode</code>, its <code>CredentialMode</code> type and <code>CHAMVI_GIT_CREDENTIAL_MODE</code>. Workspace-installed credentials are the only mode; a set <code>CHAMVI_GIT_CREDENTIAL_MODE</code> or a <code>credentialMode</code> option is refused with <code>InvalidAgentDefinitionError</code> instead of being ignored (a former <code>tools</code> mode would otherwise hand <code>bash</code> the write token). The structured Git tools, their result types and <code>PushPolicy</code> remain available. Push checks govern <code>git_push</code> only; sandbox code with another execution path can bypass them.</p><h3 id="structured-git-tools-and-policy-scope" tabindex="-1">Structured Git tools and policy scope <a class="header-anchor" href="#structured-git-tools-and-policy-scope" aria-label="Permalink to &quot;Structured Git tools and policy scope&quot;">​</a></h3><p><code>manager.tools()</code> includes <code>git_fetch</code>, <code>git_pull</code> and <code>git_push</code> without granting a bash tool. They retain structured results, per-target credential lookup, force-with-lease, branch checks and the optional durable approval flow through <code>push: { mode: &#39;approve&#39;, channel?, allowBranch?, allowForce? }</code>. The push policy applies only to <code>git_push</code>: bash with write credentials can bypass it. In a tainted run <code>git_push</code> asks once: the untrusted-content gate&#39;s approval (private, in the inbox and API, with only a generic notice on the run&#39;s source channel) carries the same <code>Push &lt;n&gt; commits to &lt;branch&gt;</code> title and commit log, and the push asks nothing more, so <code>push.channel</code> is not asked in a tainted run. A push the policy refuses (a force push without <code>allowForce</code>, a branch <code>allowBranch</code> refuses) is denied before the gate asks. Separately, fetch/pull and push taint the run before exposing their results, including remote hook output from push. Push is always guarded in tainted runs; fetch/pull are classified outbound when their normalized target differs from the workspace&#39;s configured origin. Tainted runs therefore need approval (or are denied) before contacting a non-origin target. Origin requests remain exempt. This is not general SSRF prevention; constrain allowed repositories and network access separately. Disabling bash narrows the offered capabilities, but writable Git configuration, hooks and other indirect execution still require a threat model; the tools are not a credential-secrecy boundary. Enforce hard restrictions through token scope and forge rules.</p>`,67)])])}const h=n(l,[["render",p]]);export{F as __pageData,h as default};
