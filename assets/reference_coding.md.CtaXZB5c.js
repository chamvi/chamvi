import{_ as n,o as a,c as e,a2 as o}from"./chunks/framework.a6FUKr6c.js";const F=JSON.parse('{"title":"@chamvi/coding","description":"","frontmatter":{},"headers":[],"relativePath":"reference/coding.md","filePath":"reference/coding.md","lastUpdated":1794227859000}'),l={name:"reference/coding.md"};function t(p,s,c,r,i,d){return a(),e("div",null,[...s[0]||(s[0]=[o(`<h1 id="chamvi-coding" tabindex="-1">@chamvi/coding <a class="header-anchor" href="#chamvi-coding" aria-label="Permalink to &quot;@chamvi/coding&quot;">​</a></h1><p>Coding tools for chamvi agents and the coding backend contract. The public API of <code>packages/coding/src/index.ts</code>.</p><div class="language-bash"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#DCE9F2;">npm </span><span style="color:#E7C58C;">install</span><span style="color:#E7C58C;"> @chamvi/coding</span><span style="color:#E7C58C;"> @chamvi/sandbox</span><span style="color:#E7C58C;"> @chamvi/core</span><span style="color:#E7C58C;"> ai</span><span style="color:#E7C58C;"> --save</span></span></code></pre></div><p><code>@chamvi/core</code>, <code>@chamvi/sandbox</code> and <code>ai</code> are peer dependencies. See <a href="/guide/workspaces">Workspaces &amp; Coding</a> for the behaviour.</p><h2 id="codingtools" tabindex="-1">codingTools <a class="header-anchor" href="#codingtools" aria-label="Permalink to &quot;codingTools&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> codingTools(workspaces: CodingWorkspaces, options?: CodingToolsOptions): ToolSet;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">type</span><span style="color:#DCE9F2;"> CodingWorkspaces = Pick&lt;IWorkspaceManager, </span><span style="color:#E7C58C;">&#39;get&#39;</span><span style="color:#DCE9F2;">&gt;;</span></span></code></pre></div><p>Throws <code>InvalidAgentDefinitionError</code> when <code>workspaces</code> has no <code>get</code>, <code>options</code> is no object or <code>options.outputLogMaxBytes</code> is no positive integer. Returns <code>read_file</code>, <code>write_file</code>, <code>edit_file</code>, <code>multi_edit</code>, <code>grep</code>, <code>glob</code>, <code>list_files</code>, <code>bash</code>, <code>bash_output</code>, <code>bash_kill</code> and <code>git_diff</code>, each a <a href="/guide/tools"><code>defineTool()</code></a> tool that resolves its workspace through <code>workspaces.get(context.run.runId, input.workspace)</code>.</p><table tabindex="0"><thead><tr><th>Tool</th><th>Input</th><th>Result</th></tr></thead><tbody><tr><td><code>read_file</code></td><td><code>path</code>, <code>offset?</code> (1-based, default 1), <code>limit?</code> (default and maximum 2000), <code>encoding?</code> (<code>utf8</code> default, <code>base64</code>)</td><td><code>ReadFileResult</code>; <code>ReadFileBinaryResult</code> for <code>base64</code> (at most 1 MiB); <code>ReadFileImageResult</code> for a png, jpeg, gif or webp (at most 5 MiB), stored as a run artifact (<code>artifactId</code>), an image part for the model through <code>toModelOutput</code> and <code>artifactFilePart()</code>, so steps and checkpoints keep the id only</td></tr><tr><td><code>write_file</code></td><td><code>path</code>, <code>content</code>, <code>encoding?</code> (<code>utf8</code> default, <code>base64</code>)</td><td><code>WriteFileResult</code></td></tr><tr><td><code>edit_file</code></td><td><code>path</code>, <code>oldString</code>, <code>newString</code>, <code>replaceAll?</code></td><td><code>EditFileResult</code></td></tr><tr><td><code>multi_edit</code></td><td><code>path</code>, <code>edits</code> (1 to 100 of <code>{ oldString, newString, replaceAll? }</code>, applied in order, all or none)</td><td><code>MultiEditResult</code></td></tr><tr><td><code>grep</code></td><td><code>pattern</code> (ripgrep syntax, else POSIX ERE: see <code>engine</code>), <code>path?</code>, <code>ignoreCase?</code>, <code>includeIgnored?</code>, <code>limit?</code> (default 100, at most 500)</td><td><code>GrepResult</code></td></tr><tr><td><code>glob</code></td><td><code>pattern</code> (<code>*</code>, <code>?</code>, <code>**/</code>), <code>path?</code>, <code>includeIgnored?</code>, <code>limit?</code> (default 1000, at most 5000)</td><td><code>GlobResult</code></td></tr><tr><td><code>list_files</code></td><td><code>path?</code>, <code>includeIgnored?</code>, <code>limit?</code> (default 1000, at most 5000)</td><td><code>ListFilesResult</code></td></tr><tr><td><code>bash</code></td><td><code>command</code>, <code>cwd?</code> (this call only), <code>timeoutMs?</code> (default 300 000, at most 1 800 000), <code>background?</code></td><td><code>BashResult</code>; <code>BashJobResult</code> with <code>background: true</code></td></tr><tr><td><code>bash_output</code></td><td><code>job</code>, <code>offset?</code> (bytes, default 0)</td><td><code>BashOutputResult</code> (at most 32 KiB of output)</td></tr><tr><td><code>bash_kill</code></td><td><code>job</code></td><td><code>BashKillResult</code></td></tr><tr><td><code>git_diff</code></td><td><code>staged?</code>, <code>path?</code></td><td><code>GitDiffResult</code></td></tr></tbody></table><p><code>bash</code> keeps its working directory and exported variables through an <code>EXIT</code> trap; a command that sets its own <code>EXIT</code> trap replaces it, so that call&#39;s state is not kept. <code>edit_file</code> and <code>multi_edit</code> read the file through <code>IWorkspace.readFileRaw</code> when the workspace redacts credentials: they match oldString against the redacted text the model read (<code>redactedSpans</code>), refuse an edit that touches a <code>[redacted]</code> span and put every untouched token back byte for byte, so an oldString can neither probe a token nor write <code>[redacted]</code> back.</p><p>Every tool also takes <code>workspace?</code>, the id from <code>create_workspace</code>. A path is relative to the workspace root or starts with <code>/workspace/</code>; <code>read_file</code> and <code>grep</code> also take the log paths <code>bash</code> and <code>bash_output</code> name (<code>~/.chamvi/out/&lt;id&gt;.stdout.log</code>, <code>~/.chamvi/jobs/&lt;id&gt;/output</code>), and nothing else outside the workspace. See <a href="/guide/workspaces#the-shell">The shell</a> for the kept state, the output logs and the jobs. Input the model can correct (a bad path, an <code>oldString</code> that is missing or ambiguous) is a <code>ValidationError</code> tool error; a missing or oversized file and any other sandbox failure a <code>SandboxError</code> tool error.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { IWorkspaceManager, RepositoryInstructions } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/sandbox&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** What the coding tools need of a workspace manager: the run&#39;s workspaces by id. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> CodingWorkspaces = Pick&lt;IWorkspaceManager, </span><span style="color:#E7C58C;">&#39;get&#39;</span><span style="color:#DCE9F2;">&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> CodingToolsOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Attach current path-scoped repository guidance to text reads. Default true. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    repositoryInstructions?: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Bytes one output log of \`bash\` may grow to (per stream). A call whose</span></span>
<span class="line"><span style="color:#7F95A6;">     * log passes it is killed (\`outputCapped: true\`) and the log cut back to</span></span>
<span class="line"><span style="color:#7F95A6;">     * it. Default \`OUTPUT_LOG_MAX_BYTES\` (64 MiB).</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    outputLogMaxBytes?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> ReadFileResult = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Relative to \`/workspace\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    path: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    content: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** 1-based, inclusive. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    startLine: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    endLine: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    totalLines: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Current repository guidance for this path; absent for logs, in a</span></span>
<span class="line"><span style="color:#7F95A6;">     * workspace without a repository or when disabled; null when collection</span></span>
<span class="line"><span style="color:#7F95A6;">     * failed (see \`instructionsError\`).</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    instructions?: RepositoryInstructions | null;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Why the guidance could not be collected; set only with \`instructions: null\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    instructionsError?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** True when \`content\` was cut at \`READ_MAX_CHARS\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    truncated: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`read_file\` with \`encoding: &#39;base64&#39;\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> ReadFileBinaryResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    path: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    encoding: </span><span style="color:#E7C58C;">&#39;base64&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The file&#39;s bytes, base64. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    content: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    bytes: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** \`read_file\` of a png, jpeg, gif or webp image: the model gets it as an image part. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> ReadFileImageResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    path: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    type: </span><span style="color:#E7C58C;">&#39;image&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    mediaType: </span><span style="color:#E7C58C;">&#39;image/png&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;image/jpeg&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;image/gif&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;image/webp&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    bytes: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The run artifact holding the image (\`context.artifacts\`): the model</span></span>
<span class="line"><span style="color:#7F95A6;">     * gets the bytes through its marker, so the tool step and the</span></span>
<span class="line"><span style="color:#7F95A6;">     * checkpoints keep this id, never the image.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    artifactId: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> WriteFileResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    path: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    bytes: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> EditFileResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    path: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    replacements: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> MultiEditResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    path: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** How many edits were applied (all of them). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    edits: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Replacements of all edits together. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    replacements: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GrepMatch = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    path: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    line: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    text: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** The program \`grep\` searched with: its regular expression syntax differs. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GrepEngine = </span><span style="color:#E7C58C;">&#39;ripgrep&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;git-grep&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;grep&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GrepResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    matches: GrepMatch[];</span></span>
<span class="line"><span style="color:#7F95A6;">    /** True when more matches exist than were returned. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    truncated: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    engine: GrepEngine;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> ListFilesResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    files: string[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    truncated: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> BashResult = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The command&#39;s exit status (124 or 137 after a timeout). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    exitCode: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Stdout, whole when it has at most \`EXCERPT_HEAD_BYTES\` +</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`EXCERPT_TAIL_BYTES\` bytes, else its start and end around a</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`[... &lt;n&gt; bytes cut, full output in &lt;stdoutLog&gt;]\` line.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    stdout: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    stderr: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** True when the middle of stdout was cut (the whole of it is in \`stdoutLog\`). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    stdoutTruncated: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    stderrTruncated: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Bytes the command wrote to stdout. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    stdoutBytes: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    stderrBytes: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`~/.chamvi/out/&lt;id&gt;.stdout.log\`: the whole stdout, readable with read_file, grep or bash. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    stdoutLog: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    stderrLog: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The working directory the next call starts in (\`/workspace/...\` inside the workspace). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    cwd: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * True when a log passed \`outputLogMaxBytes\`: the call was killed with</span></span>
<span class="line"><span style="color:#7F95A6;">     * its jobs, like a timeout, and the log keeps the first bytes up to the cap.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    outputCapped: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    timedOut: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    durationMs: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** What \`bash\` returns for \`background: true\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> BashJobResult = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The job id for bash_output and bash_kill. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    job: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    status: </span><span style="color:#E7C58C;">&#39;running&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`~/.chamvi/jobs/&lt;id&gt;/output\`: stdout and stderr of the job. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    outputLog: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * \`running\`; \`exited\` (with \`exitCode\`); \`killed\` by bash_kill; \`lost\` when</span></span>
<span class="line"><span style="color:#7F95A6;"> * it ended without an exit status (its container restarted).</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> BashJobStatus = </span><span style="color:#E7C58C;">&#39;running&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;exited&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;killed&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;lost&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> BashOutputResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    job: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    status: BashJobStatus;</span></span>
<span class="line"><span style="color:#DCE9F2;">    exitCode?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Output from \`offset\` on, at most \`JOB_OUTPUT_MAX_BYTES\` bytes. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    output: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    offset: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Pass it as \`offset\` to read on. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    nextOffset: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Bytes of output so far. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    size: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** True when more output follows \`nextOffset\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    truncated: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * True when the output passed \`outputLogMaxBytes\`: the job was killed</span></span>
<span class="line"><span style="color:#7F95A6;">     * with every process it started (status \`killed\`) and its output cut</span></span>
<span class="line"><span style="color:#7F95A6;">     * back to the cap.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    outputCapped: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> BashKillResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    job: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    status: BashJobStatus;</span></span>
<span class="line"><span style="color:#DCE9F2;">    exitCode?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GlobResult = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Relative to the workspace root, sorted. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    files: string[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    truncated: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> GitDiffResult = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`git status --short\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    status: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    diff: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    truncated: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> READ_MAX_LINES: </span><span style="color:#E7C58C;">2_000</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> READ_MAX_CHARS: </span><span style="color:#E7C58C;">65_536</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> SEARCH_MAX_RESULTS: </span><span style="color:#E7C58C;">500</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> LIST_MAX_RESULTS: </span><span style="color:#E7C58C;">5_000</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> LINE_MAX_CHARS: </span><span style="color:#E7C58C;">500</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> OUTPUT_LOG_MAX_BYTES: </span><span style="color:#E7C58C;">67_108_864</span><span style="color:#DCE9F2;">; </span><span style="color:#7F95A6;">// 64 MiB, the default outputLogMaxBytes</span></span></code></pre></div><h2 id="repository-instructions" tabindex="-1">Repository instructions <a class="header-anchor" href="#repository-instructions" aria-label="Permalink to &quot;Repository instructions&quot;">​</a></h2><p><code>CodingToolsOptions.repositoryInstructions</code> defaults to <code>true</code>. Ordinary UTF-8 <code>read_file</code> results of a repository-backed workspace add the optional <code>ReadFileResult.instructions?: RepositoryInstructions | null</code> field (a repo-less workspace runs no collector and omits it). Each read collects guidance for the file&#39;s root and ancestors, including include expansion, scopes, hashes, parents, diagnostics and <code>complete</code>; the <a href="/reference/sandbox#repository-instructions">sandbox collector</a> defines ordering, bounds and failure behavior. An incomplete collection is still visible with <code>complete: false</code>; an inspection/transport error (a missing utility, a stray stderr line, an exec timeout) answers the file with <code>instructions: null</code> and <code>instructionsError</code> naming the reason, never an empty context presented as complete; a cancelled run still rejects. Resolve missing guidance that could change the task before proceeding.</p><p><code>codingTools(workspaces, { repositoryInstructions: false })</code> omits the field. Binary/base64 reads, image reads and HOME log reads always omit it. The coding option is independent of <code>createWorkspaceManager({ repositoryInstructions: false })</code>: the manager&#39;s flag controls root collection on create and the presence of <code>read_repository_instructions</code>, while coding&#39;s flag controls text-read attachments. Both default on; set both off to disable both forms of context delivery. Neither restricts filesystem access.</p><p><code>read_file</code>, <code>grep</code>, <code>glob</code>, <code>list_files</code>, <code>git_diff</code>, <code>bash</code> and <code>bash_output</code> declare <code>trust: { taint: true }</code>: their results taint the run in every workspace, repo-less ones included, since a repo-less workspace can fetch arbitrary content (<code>curl</code>, <code>git clone</code>). <code>write_file</code>, <code>edit_file</code>, <code>multi_edit</code> and <code>bash_kill</code> stay unclassified, and shell execution is never gated.</p><p>There is no cross-call cache: new reads reflect current worktree instructions, while previous tool results remain in steps and checkpoints through pauses and restarts. Before direct edits or shell work in a new subtree, request its context through <code>read_file</code> or the manager&#39;s <code>read_repository_instructions</code> tool. Repository guidance or a system prompt grants no operator authorization, permissions, credentials, skill installation or publication rights. <code>write_file</code>, <code>edit_file</code>, <code>multi_edit</code> and arbitrary <code>bash</code> do not enforce instruction scope, and bash bypasses file-tool-only enforcement. Discovery&#39;s observed symlink, special-file, <code>.git</code> and escape refusal is best-effort; race-free confinement remains <a href="https://github.com/chamvi/chamvi/issues/92" target="_blank" rel="noreferrer">#92</a>.</p><h2 id="icodingbackend" tabindex="-1">ICodingBackend <a class="header-anchor" href="#icodingbackend" aria-label="Permalink to &quot;ICodingBackend&quot;">​</a></h2><p>The contract for something that solves a coding task in a workspace with its own tool loop. Only the contract ships; backends (the own tools in a nested loop, Claude Code) are planned.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { IWorkspace } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/sandbox&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> CodingBudget = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    maxSteps?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    maxTokens?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    timeoutMs?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> CodingTask = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The workspace to work in; the backend never disposes it. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    workspace: IWorkspace;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** What to do, in plain language. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    task: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    budget?: CodingBudget;</span></span>
<span class="line"><span style="color:#DCE9F2;">    signal?: AbortSignal;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> CodingResult = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`done\` when the task is solved, \`stuck\` when the backend gave up. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    status: </span><span style="color:#E7C58C;">&#39;done&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;stuck&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    summary: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The workspace&#39;s changes as a unified diff. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    diff: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * Something that solves a coding task in a workspace with its own tool loop</span></span>
<span class="line"><span style="color:#7F95A6;"> * (the own coding tools, Claude Code, ...).</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> ICodingBackend {</span></span>
<span class="line"><span style="color:#DCE9F2;">    code(task: CodingTask): Promise&lt;CodingResult&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span></code></pre></div>`,20)])])}const u=n(l,[["render",t]]);export{F as __pageData,u as default};
