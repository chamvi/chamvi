import{_ as n,o as a,c as e,a2 as p}from"./chunks/framework.a6FUKr6c.js";const h=JSON.parse('{"title":"@chamvi/http","description":"","frontmatter":{},"headers":[],"relativePath":"reference/http.md","filePath":"reference/http.md","lastUpdated":1793883579000}'),l={name:"reference/http.md"};function o(t,s,c,r,i,y){return a(),e("div",null,[...s[0]||(s[0]=[p(`<h1 id="chamvi-http" tabindex="-1">@chamvi/http <a class="header-anchor" href="#chamvi-http" aria-label="Permalink to &quot;@chamvi/http&quot;">​</a></h1><p>REST, SSE, MCP, the <code>http</code>, <code>mcp</code> and <code>webhook</code> channels and the <code>/channels/&lt;name&gt;</code> mount for chamvi agents, on routup. The public API of <code>packages/http/src/index.ts</code>.</p><div class="language-bash"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#DCE9F2;">npm </span><span style="color:#E7C58C;">install</span><span style="color:#E7C58C;"> @chamvi/http</span><span style="color:#E7C58C;"> @chamvi/core</span><span style="color:#E7C58C;"> --save</span></span></code></pre></div><p><code>@chamvi/core</code> is a peer dependency. See <a href="/guide/http">HTTP API &amp; MCP</a> for the behaviour.</p><h2 id="createhttpapp" tabindex="-1">createHttpApp <a class="header-anchor" href="#createhttpapp" aria-label="Permalink to &quot;createHttpApp&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> createHttpApp(options: HttpAppOptions): App; </span><span style="color:#7F95A6;">// routup App</span></span></code></pre></div><p>The store, the agents and the clock come from <code>engine</code> (<code>engine.store</code>, <code>engine.listAgents()</code>, <code>engine.clock</code>). The agents are read from the engine on every request, so an agent registered, replaced or removed at runtime gets (or loses) its routes, webhook subscriptions, <code>GET /agents</code> entry, schedules and MCP <code>run_&lt;agent&gt;</code> tool at once; a <code>run_&lt;agent&gt;</code> definition is built once per agent object, and one that fails for an agent registered after construction goes to <code>onError</code> and that tool is left out. <code>agents</code> narrows the served agents to the named ones, checked at construction: the others, also agents registered later, get no routes or MCP tools in this app (a mounted channel serves every agent subscribing to it), and a named agent removed from the engine answers 404. <code>agentIssues</code> lists agents that failed to load as <code>GET /agents</code> <code>issues</code>. <code>HttpRouteContext.agents</code> is read from the engine on every access. Throws <code>InvalidAgentDefinitionError</code> for a name in <code>agents</code> the engine lacks or that is given twice, an empty <code>auth</code> array and an invalid <code>routes</code> entry (a path that is not static, a duplicate method and path, a first segment of a built-in route such as <code>agents</code>, <code>runs</code> or <code>channels</code>, or the metrics path, all compared case-insensitively).</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> CorsOptions = CorsPluginOptions;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> RateLimitOptions = RateLimitPluginOptions;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** A mounted channel&#39;s independent per-client HTTP request limit. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> ChannelRateLimitOptions = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    max: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Positive timer-safe milliseconds. Default: 60,000. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    windowMs?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> PrometheusOptions = PrometheusPluginOptions;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** routup&#39;s trust-proxy input: a predicate, CIDRs, \`&#39;loopback&#39;\`, a hop count or a boolean. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> TrustProxyInput = NonNullable&lt;AppOptionsInput[</span><span style="color:#E7C58C;">&#39;trustProxy&#39;</span><span style="color:#DCE9F2;">]&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> McpOptions = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    name?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    version?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    maxWaitSeconds?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> HttpAppOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Its \`store\`, agents and \`clock\` serve every route. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    engine: IEngine;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Names of the engine&#39;s agents to serve (routes, MCP tools, extra</span></span>
<span class="line"><span style="color:#7F95A6;">     * routes), checked at construction; the others, also agents registered</span></span>
<span class="line"><span style="color:#7F95A6;">     * later, are unknown to this app. A named agent removed from the engine</span></span>
<span class="line"><span style="color:#7F95A6;">     * answers 404. Default: every agent the engine holds, at request time.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    agents?: string[];</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Agents that failed to load (e.g. from an agents folder), read per</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`GET /agents\` and listed as its \`issues\`. Default: none.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    agentIssues?: () </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#8FD0F2;"> readonly</span><span style="color:#DCE9F2;"> AgentIssue[];</span></span>
<span class="line"><span style="color:#7F95A6;">    /** One authenticator or a chain; the first principal wins. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    auth: Authenticator | Authenticator[];</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Prefix of every route, e.g. \`/api\`. Default: none. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    basePath?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Which proxies \`getRequestIP\` trusts (and so the rate-limit key). Default: none. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    trustProxy?: TrustProxyInput;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Fails \`/readyz\` once shutting down; the app ends its streams on shutdown. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    shutdown?: IShutdown;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Bytes a request body may have. Default: 1 MiB. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    bodyLimit?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    stream?: {</span></span>
<span class="line"><span style="color:#7F95A6;">        /** How often a stream polls the store for runs executing elsewhere. Default: 2 s. */</span></span>
<span class="line"><span style="color:#DCE9F2;">        pollMs?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">        /**</span></span>
<span class="line"><span style="color:#7F95A6;">         * Open SSE run streams plus waiting MCP \`run_&lt;agent&gt;\` calls, per app</span></span>
<span class="line"><span style="color:#7F95A6;">         * (a positive integer). Over it a stream answers 503 with</span></span>
<span class="line"><span style="color:#7F95A6;">         * \`Retry-After\`, an MCP call answers without waiting. Default: 1000.</span></span>
<span class="line"><span style="color:#7F95A6;">         */</span></span>
<span class="line"><span style="color:#DCE9F2;">        maxOpen?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">    };</span></span>
<span class="line"><span style="color:#DCE9F2;">    mcp?: false | McpOptions;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** CORS is off unless given. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    cors?: false | CorsOptions;</span></span>
<span class="line"><span style="color:#DCE9F2;">    rateLimit?: false | Partial&lt;RateLimitOptions&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Policies for mounted POST /channels/&lt;name&gt; paths (including subpaths).</span></span>
<span class="line"><span style="color:#7F95A6;">     * An omitted name shares the general limit; false exempts the channel;</span></span>
<span class="line"><span style="color:#7F95A6;">     * an explicit policy replaces it with a separate per-channel/client bucket,</span></span>
<span class="line"><span style="color:#7F95A6;">     * also when rateLimit is false. Authentication and body limits are unchanged.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    channelRateLimits?: Record&lt;string, false | ChannelRateLimitOptions&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    metrics?: false | Partial&lt;PrometheusOptions&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** How long \`/readyz\` waits for the store. Default: 2 s. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    readyTimeoutMs?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Receives 5xx causes and background failures. Default: \`console.error\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    onError?: (error: unknown) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> void;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Extra routes other packages contribute (e.g. the dashboard), served under \`basePath\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    routes?: HttpRoute[];</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Channels to serve at \`POST /channels/&lt;name&gt;\` and below (e.g. the</span></span>
<span class="line"><span style="color:#7F95A6;">     * webhook and GitHub channels), unauthenticated: each checks its own</span></span>
<span class="line"><span style="color:#7F95A6;">     * credentials. Each needs an \`in\` and must be the object the engine holds</span></span>
<span class="line"><span style="color:#7F95A6;">     * under its name, else InvalidAgentDefinitionError. Default: none.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    channels?: IChannel[];</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><p><code>channels</code> lists the channels mounted at <code>POST /channels/&lt;name&gt;</code> (each needs an <code>in</code> and must be the object the engine holds under its name, else <code>InvalidAgentDefinitionError</code>). <code>routes</code> takes extra routes from other packages, such as the dashboard of <code>@chamvi/ui</code>:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> HttpRouteMethod = </span><span style="color:#E7C58C;">&#39;GET&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;POST&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;PUT&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;PATCH&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;DELETE&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> HttpRouteRequest = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** URL, method, headers and signal; without the body, which only readBody() reads. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    request: Request;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Runs the app&#39;s authenticators over the request, once per request (every</span></span>
<span class="line"><span style="color:#7F95A6;">     * call, and a built-in route&#39;s check, shares the result): 401 with</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`WWW-Authenticate: Bearer\` without a principal, 403 when \`permission\`</span></span>
<span class="line"><span style="color:#7F95A6;">     * is given and not granted. A route that never calls it stays unauthenticated.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    authorize(permission?: string): Promise&lt;Principal&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The raw body, at most \`bodyLimit\` bytes: 413 above it (content-length</span></span>
<span class="line"><span style="color:#7F95A6;">     * refused unread, else drained like readJsonBody), 415 for a non-JSON</span></span>
<span class="line"><span style="color:#7F95A6;">     * media type with a non-empty body; an empty body is a 0-length array.</span></span>
<span class="line"><span style="color:#7F95A6;">     * Memoized: every call answers the same bytes (or the same error).</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    readBody(): Promise&lt;Uint8Array&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The path below the route&#39;s \`path\`: \`&#39;&#39;\` for \`path\` itself, else the raw</span></span>
<span class="line"><span style="color:#7F95A6;">     * (still percent-encoded, case kept) rest starting with \`/\`, e.g.</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`/assets/app-1a2b.js\`; never the query. Only a \`prefix\` route sees more than \`&#39;&#39;\`.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    subpath: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> HttpRouteResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    status: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Set on the response; a \`content-type\` here wins over the body&#39;s default. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    headers?: Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * A \`Uint8Array\` is sent as is (\`application/octet-stream\` unless</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`headers\` names a \`content-type\`); objects, arrays, numbers and booleans</span></span>
<span class="line"><span style="color:#7F95A6;">     * as JSON, a string as \`text/plain\`; \`undefined\` or \`null\` answer an empty body.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    body?: unknown;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> HttpRouteContext = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    engine: IEngine;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The agents the app serves, read from the engine on every access. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    agents: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> Agent[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    clock: IClock;</span></span>
<span class="line"><span style="color:#DCE9F2;">    onError: (error: unknown) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> void;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The app&#39;s \`basePath\` (\`&#39;&#39;\` by default), e.g. to build absolute links. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    basePath: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> HttpRoute = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    method: HttpRouteMethod;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Static path under basePath (no &#39;:&#39; &#39;*&#39; &#39;{&#39;), e.g. &#39;/ui&#39;; also its metrics label. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    path: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** false: skipped by the app&#39;s rate limiter (callers that never retry, e.g. webhook senders). Default: limited. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    rateLimit?: false;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * true: the route also serves every path below \`path/\` (same method),</span></span>
<span class="line"><span style="color:#7F95A6;">     * handing the rest as \`request.subpath\`; labelled \`&lt;path&gt;/*\` in metrics.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    prefix?: true;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Not authenticated by the app&#39;s authenticators unless the handler calls</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`request.authorize()\`. Thrown @ebec/http and core errors render like any route&#39;s.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    handler: (request: HttpRouteRequest, ctx: HttpRouteContext) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> Promise&lt;HttpRouteResult&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><p>The app&#39;s authenticators do not guard an extra route. A handler that needs them calls <code>request.authorize(permission?)</code>: it resolves the caller&#39;s <code>Principal</code> (the authenticator chain runs once per request), answers 401 with <code>WWW-Authenticate: Bearer</code> without one and 403 when the principal lacks <code>permission</code>.</p><h2 id="channel-http-request-limits" tabindex="-1">Channel HTTP request limits <a class="header-anchor" href="#channel-http-request-limits" aria-label="Permalink to &quot;Channel HTTP request limits&quot;">​</a></h2><p><code>channelRateLimits?: Record&lt;string, false | ChannelRateLimitOptions&gt;</code> selects the HTTP intake policy for each mounted channel, without changing run execution capacity:</p><ul><li>An omitted entry inherits the general <code>rateLimit</code> bucket (default 300 requests per 60 seconds per client IP), shared with REST and other unconfigured channels.</li><li><code>{ max, windowMs? }</code> replaces that bucket for the channel with its own per-client bucket, separate from REST and other configured channels. <code>windowMs</code> defaults to 60,000. Explicit channel limits also work when the general <code>rateLimit</code> is <code>false</code>.</li><li><code>false</code> removes request limiting only for that channel&#39;s mounted <code>POST /channels/&lt;name&gt;</code> and subpaths. It does not disable authentication, signatures or body-size checks. Other methods and unknown channel paths do not gain the exemption.</li></ul><p>The keys must exactly name mounted input channels. <code>max</code> must be a positive safe integer; <code>windowMs</code> a positive integer no greater than 2,147,483,647. Invalid policies throw <code>InvalidAgentDefinitionError</code> before serving. Buckets are local to this HTTP app, not coordinated through the run store. Refusals remain JSON <code>429</code> responses with <code>Retry-After</code> and rate-limit headers.</p><p>The same options pass through <code>httpModule()</code> in <code>@chamvi/app</code>. See <a href="/deployment/github-app#bursts-and-http-intake">GitHub intake behind an ingress</a> for finite and disabled examples. <code>trustProxy</code> defaults to trusting no forwarded headers; restrict it to known proxy source addresses or CIDRs, never blindly trust arbitrary client headers.</p><h2 id="channels" tabindex="-1">Channels <a class="header-anchor" href="#channels" aria-label="Permalink to &quot;Channels&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> httpChannel(options?: HttpChannelOptions): IChannel;   </span><span style="color:#7F95A6;">// name &#39;http&#39;: REST runs; no in, no out</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> mcpChannel(options?: HttpChannelOptions): IChannel;    </span><span style="color:#7F95A6;">// name &#39;mcp&#39;: MCP run_&lt;agent&gt; runs; no in, no out</span></span>
<span class="line"><span style="color:#7F95A6;">// HttpChannelOptions { untrusted?: boolean }: true taints every run the channel starts (default trusted)</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> webhookChannel(options: WebhookChannelOptions): WebhookChannel; </span><span style="color:#7F95A6;">// in at /channels/&lt;name&gt;/&lt;agent&gt;&lt;path&gt;; on() bound to its name</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> readRequestBody(request: Request, options: ReadRequestBodyOptions): Promise&lt;Uint8Array&gt;; </span><span style="color:#7F95A6;">// for a channel&#39;s in: 413 above options.limit</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> http: HttpSubscriber;       </span><span style="color:#7F95A6;">// http.on({ schema? }): id &#39;http&#39;, at most one per agent</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> webhook: WebhookSubscriber; </span><span style="color:#7F95A6;">// webhook.on(path, options?): id &#39;webhook:&lt;path&gt;&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> HTTP_CHANNEL_NAME: </span><span style="color:#E7C58C;">&#39;http&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> MCP_CHANNEL_NAME: </span><span style="color:#E7C58C;">&#39;mcp&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> WEBHOOK_CHANNEL_NAME: </span><span style="color:#E7C58C;">&#39;webhook&#39;</span><span style="color:#DCE9F2;">;</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { ChannelRequest, IChannel } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { Authenticator } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../auth/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { WebhookSubscriber } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;../subscriptions/types.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** Options of \`httpChannel()\` and \`mcpChannel()\`. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> HttpChannelOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Taint every run started through this channel (\`channel:&lt;name&gt;\`), so</span></span>
<span class="line"><span style="color:#7F95A6;">     * classified outbound tools need approval; default false (the caller is</span></span>
<span class="line"><span style="color:#7F95A6;">     * an authenticated principal). Set it when principals relay content you</span></span>
<span class="line"><span style="color:#7F95A6;">     * do not trust.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    untrusted?: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> WebhookChannelOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The channel name; default \`webhook\`. A second instance needs its own. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    name?: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Who may deliver: the first principal wins (as the http app&#39;s \`auth\`),</span></span>
<span class="line"><span style="color:#7F95A6;">     * and it needs \`agent:&lt;agent&gt;:run\`. Required, since the http app never</span></span>
<span class="line"><span style="color:#7F95A6;">     * authenticates channel routes.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    auth: Authenticator | Authenticator[];</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Bytes a delivery may have (413 above). Default: 1 MiB, the http app&#39;s default. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    bodyLimit?: number;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** A webhook channel: \`in\` only, with \`on()\` bound to its name. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> WebhookChannel = IChannel&lt;ChannelRequest, Response&gt; &amp; WebhookSubscriber;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** A webhook delivery&#39;s target, parsed from the subpath; internal. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> WebhookTarget = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    agent: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Starts with \`/\`, the decoded segments joined with \`/\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    path: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { ChannelSubscription } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { StandardSchemaV1 } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@standard-schema/spec&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> HttpSubscriptionOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Shared-store execution cap for REST, UI and MCP starts; omitted or false adds no cap. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    concurrencyMaxRuns?: number | false;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Validates the payload of a REST, UI or MCP start. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    schema?: StandardSchemaV1;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** Makes the \`http\` subscription (id \`http\`, at most one per agent). */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> HttpSubscriber = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    on(options?: HttpSubscriptionOptions): ChannelSubscription;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> WebhookSubscriptionOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Shared-store execution cap within the agent; omitted or false adds no cap. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    concurrencyMaxRuns?: number | false;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Validates the delivered payload. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    schema?: StandardSchemaV1;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The run&#39;s idempotency key when the delivery has no \`Idempotency-Key\` header. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    idempotencyKey?: (payload: unknown) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> string | undefined;</span></span>
<span class="line"><span style="color:#DCE9F2;">    concurrencyKey?: (payload: unknown) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> string | undefined;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** Makes webhook subscriptions for one channel name. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> WebhookSubscriber = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** \`path\` starts with \`/\`; the subscription id is \`webhook:&lt;path&gt;\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    on(path: string, options?: WebhookSubscriptionOptions): ChannelSubscription;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><p><code>httpChannel({ untrusted: true })</code> and <code>mcpChannel({ untrusted: true })</code> opt the REST and MCP intake into the <a href="/guide/tools#untrusted-content-and-outbound-tools">run-taint boundary</a>, for callers that relay text written by others (an OpenClaw MCP principal forwarding chat messages): every run they start is tainted (<code>channel:http</code>/<code>channel:mcp</code>), so outbound tools wait for approval. Both default to trusted, since the caller is an authenticated principal. In an <code>@chamvi/app</code> app, configure the built-in http module: <code>httpModule({ untrusted: { mcp: true } })</code> (or <code>http: true</code>) in <code>createApp({ modules })</code>.</p><p>The engine refuses an <code>http.on()</code> subscription unless it holds <code>httpChannel()</code> (REST and MCP keep separate idempotency scopes through the two channel names), and a <code>webhook.on()</code> one unless it holds the webhook channel. <code>webhook.on()</code> throws <code>InvalidAgentDefinitionError</code> for a path that does not start with <code>/</code>. See <a href="/guide/http#channels">Channels</a>.</p><h2 id="authenticators" tabindex="-1">Authenticators <a class="header-anchor" href="#authenticators" aria-label="Permalink to &quot;Authenticators&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">type</span><span style="color:#DCE9F2;"> Authenticator = (request: Request) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> Promise&lt;Principal | undefined&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> staticTokens(options: StaticTokensOptions): Authenticator;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> authup(options: AuthupOptions): Authenticator;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> oidc(options: OidcOptions): Authenticator;</span></span></code></pre></div><p>An authenticator resolves <code>undefined</code> for a request it does not recognize and throws a 401 for credentials it rejects. <code>staticTokens</code> throws <code>InvalidAgentDefinitionError</code> for an empty <code>tokens</code> array, a token <code>value</code> shorter than 16 characters, a missing <code>id</code> or a <code>value</code> given twice; <code>oidc</code> for an empty <code>issuers</code> list, an issuer without <code>audience</code> or a missing <code>principal</code>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { Permission } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;./constants.ts&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> PermissionName = </span><span style="color:#8FD0F2;">typeof</span><span style="color:#DCE9F2;"> Permission[keyof </span><span style="color:#8FD0F2;">typeof</span><span style="color:#DCE9F2;"> Permission];</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> AgentAction = </span><span style="color:#E7C58C;">&#39;run&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;approve&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;read&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> Principal = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    id: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    kind: </span><span style="color:#E7C58C;">&#39;token&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;authup&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;oidc&#39;</span><span style="color:#DCE9F2;"> | (string &amp; {});</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Granted permissions, e.g. \`agent:triage:run\`, \`run:read\` or \`*\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    permissions: </span><span style="color:#8FD0F2;">readonly</span><span style="color:#DCE9F2;"> string[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    claims?: Record&lt;string, unknown&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/**</span></span>
<span class="line"><span style="color:#7F95A6;"> * Resolves \`undefined\` when the request carries no credentials it</span></span>
<span class="line"><span style="color:#7F95A6;"> * recognizes, throws \`UnauthorizedError\` for credentials it rejects.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> Authenticator = (request: Request) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> Promise&lt;Principal | undefined&gt;;</span></span></code></pre></div><h2 id="permissions" tabindex="-1">Permissions <a class="header-anchor" href="#permissions" aria-label="Permalink to &quot;Permissions&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> Permission: {</span></span>
<span class="line"><span style="color:#DCE9F2;">    ALL: </span><span style="color:#E7C58C;">&#39;*&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    RUN_READ: </span><span style="color:#E7C58C;">&#39;run:read&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    RUN_CANCEL: </span><span style="color:#E7C58C;">&#39;run:cancel&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    STATE_READ: </span><span style="color:#E7C58C;">&#39;state:read&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    STATE_WRITE: </span><span style="color:#E7C58C;">&#39;state:write&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> agentPermission(agent: string, action: </span><span style="color:#E7C58C;">&#39;run&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;approve&#39;</span><span style="color:#DCE9F2;">): string; </span><span style="color:#7F95A6;">// agent:&lt;agent&gt;:&lt;action&gt;</span></span>
<span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> assertMcpRunTool(agent: Agent): void; </span><span style="color:#7F95A6;">// throws InvalidAgentDefinitionError like createHttpApp</span></span></code></pre></div><p><code>assertMcpRunTool</code> builds the agent&#39;s <code>run_&lt;agent&gt;</code> MCP tool definition and throws what <code>createHttpApp</code> would throw for it (a tool name above 64 characters, a payload schema MCP cannot compile); the app runs it on every folder agent before registering it. <code>createHttpApp</code> reports a folder agent&#39;s failure (one the engine holds at a revision) to <code>onError</code> and skips its tool instead of throwing.</p><p>Matching uses core&#39;s <a href="/reference/#permissions"><code>hasPermission(principal.permissions, permission)</code></a>: true for a granted <code>*</code>, or for a grant with the same number of <code>:</code> segments whose every segment is equal or <code>*</code>.</p><h2 id="createshutdown" tabindex="-1">createShutdown <a class="header-anchor" href="#createshutdown" aria-label="Permalink to &quot;createShutdown&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">function</span><span style="color:#DCE9F2;"> createShutdown(options: ShutdownOptions): IShutdown;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> DEFAULT_SHUTDOWN_DRAIN_TIMEOUT_MS: </span><span style="color:#E7C58C;">30_000</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#8FD0F2;">const</span><span style="color:#DCE9F2;"> DEFAULT_SHUTDOWN_CLOSE_TIMEOUT_MS: </span><span style="color:#E7C58C;">5_000</span><span style="color:#DCE9F2;">;</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/*</span></span>
<span class="line"><span style="color:#7F95A6;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#7F95A6;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#7F95A6;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#7F95A6;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#7F95A6;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">import</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> { IEngine } </span><span style="color:#8FD0F2;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> interface</span><span style="color:#DCE9F2;"> IShutdown {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** True from the first \`shutdown()\` call on; \`/readyz\` then fails. */</span></span>
<span class="line"><span style="color:#8FD0F2;">    readonly</span><span style="color:#DCE9F2;"> shuttingDown: boolean;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * Runs \`fn\` during the shutdown, in the order added, after readiness</span></span>
<span class="line"><span style="color:#7F95A6;">     * failed and before the server closes; returns an unsubscribe.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    onShutdown(fn: () </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> void | Promise&lt;void&gt;): () </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> void;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Idempotent: every call returns the same promise. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    shutdown(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> ShutdownOptions = {</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Drained on shutdown; its \`clock\` times the delays. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    engine: IEngine;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** srvx \`Server\` (pass \`gracefulShutdown: false\` to \`serve\`). */</span></span>
<span class="line"><span style="color:#DCE9F2;">    server?: { close(closeActiveConnections?: boolean): Promise&lt;void&gt; };</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Time for load balancers to see the failing readiness. Default 0. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    readinessDelayMs?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Default 30 s. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    drainTimeoutMs?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Wait for open connections after the drain, then close them. Default 5 s. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    closeTimeoutMs?: number;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Default \`console.error\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    onError?: (error: unknown) </span><span style="color:#8FD0F2;">=&gt;</span><span style="color:#DCE9F2;"> void;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><h2 id="wire-types" tabindex="-1">Wire types <a class="header-anchor" href="#wire-types" aria-label="Permalink to &quot;Wire types&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8FD0F2;">type</span><span style="color:#DCE9F2;"> InvokerView = Omit&lt;Invoker, </span><span style="color:#E7C58C;">&#39;permissions&#39;</span><span style="color:#DCE9F2;">&gt;;</span></span>
<span class="line"><span style="color:#8FD0F2;">type</span><span style="color:#DCE9F2;"> RunView = Omit&lt;Run, </span><span style="color:#E7C58C;">&#39;claim&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;trigger&#39;</span><span style="color:#DCE9F2;">&gt; &amp; {</span></span>
<span class="line"><span style="color:#DCE9F2;">    trigger: Omit&lt;TriggerEnvelope, </span><span style="color:#E7C58C;">&#39;invoker&#39;</span><span style="color:#DCE9F2;">&gt; &amp; { invoker?: InvokerView };</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"><span style="color:#8FD0F2;">type</span><span style="color:#DCE9F2;"> RunSummary = Pick&lt;Run, </span><span style="color:#E7C58C;">&#39;id&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;agent&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;status&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;createdAt&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;finishedAt&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;error&#39;</span><span style="color:#DCE9F2;">&gt;;</span></span>
<span class="line"><span style="color:#8FD0F2;">type</span><span style="color:#DCE9F2;"> RunToolResult = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    runId: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    status: RunStatusLiteral;</span></span>
<span class="line"><span style="color:#DCE9F2;">    deduplicated: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    output?: unknown;</span></span>
<span class="line"><span style="color:#DCE9F2;">    error?: { code: string; message: string };</span></span>
<span class="line"><span style="color:#DCE9F2;">    waiting?: RunToolApprovalWait | RunToolDispatchWait;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"><span style="color:#8FD0F2;">type</span><span style="color:#DCE9F2;"> RunToolApprovalWait = { </span><span style="color:#7F95A6;">// the run, or a descendant it waits on, waits on an approval</span></span>
<span class="line"><span style="color:#DCE9F2;">    kind: </span><span style="color:#E7C58C;">&#39;approval&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    runId: string; </span><span style="color:#7F95A6;">// the run to answer with approve_run</span></span>
<span class="line"><span style="color:#DCE9F2;">    agent: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    toolName: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    title: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    body?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    artifacts?: string[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    options?: ApprovalOption[]; </span><span style="color:#7F95A6;">// the choices to answer with approve_run&#39;s selected</span></span>
<span class="line"><span style="color:#DCE9F2;">    multiple?: boolean; </span><span style="color:#7F95A6;">// true when several options may be selected</span></span>
<span class="line"><span style="color:#DCE9F2;">    expiresAt: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"><span style="color:#8FD0F2;">type</span><span style="color:#DCE9F2;"> RunToolDispatchWait = { </span><span style="color:#7F95A6;">// the run waits on the runs it dispatched (get_run only: run_&lt;agent&gt; keeps waiting)</span></span>
<span class="line"><span style="color:#DCE9F2;">    kind: </span><span style="color:#E7C58C;">&#39;dispatch&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#DCE9F2;">    toolName: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    runIds: string[];</span></span>
<span class="line"><span style="color:#DCE9F2;">    expiresAt: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"><span style="color:#8FD0F2;">type</span><span style="color:#DCE9F2;"> ApproveBody = { </span><span style="color:#7F95A6;">// POST /runs/:id/approve; approve_run takes the same fields plus runId</span></span>
<span class="line"><span style="color:#DCE9F2;">    approvalId: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    approved: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">    reason?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    selected?: string[]; </span><span style="color:#7F95A6;">// the chosen option ids of a wait point with options, none on a denial</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div><p><code>GET /runs</code> takes <code>filter[parent]=&lt;run id&gt;</code> (once, else 400 <code>filter[parent] takes one run id.</code>) next to <code>filter[agent]</code>, <code>filter[status]</code> and <code>filter[waiting]</code> (<code>approval</code> or <code>dispatch</code>, once, else 400 <code>filter[waiting] takes approval or dispatch.</code>; the wait point&#39;s kind): the runs whose <code>parentRunId</code> it is, under the same read rule (an agent-scoped reader adds <code>filter[agent]</code>). Runs carry <code>parentRunId</code> and <code>subtreeUsage</code> when set; <code>POST /runs/:id/approve</code> answers a run waiting on dispatched runs with 409 <code>invalid_run_state</code>, and <code>approve_run</code> refuses it.</p><p><code>selected</code> follows <code>engine.approve()</code>&#39;s rules (see <a href="/guide/approvals">Approvals</a> and <a href="/guide/http">HTTP</a>): a selection that does not fit the wait point is <code>400 validation_error</code>.</p><p><code>GET /agents</code> answers <code>{ data: AgentSummary[], issues: AgentIssue[] }</code>, <code>GET /schedules</code> <code>{ data: ScheduleSummary[] }</code>:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#7F95A6;">/** An agent as \`GET /agents\` lists it. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> AgentSummary = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    name: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The agent&#39;s \`kind\`: \`simple\` for a simple agent (defineSimpleAgent()), else \`model\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    kind: </span><span style="color:#E7C58C;">&#39;model&#39;</span><span style="color:#DCE9F2;"> | </span><span style="color:#E7C58C;">&#39;simple&#39;</span><span style="color:#DCE9F2;">;</span></span>
<span class="line"><span style="color:#7F95A6;">    /**</span></span>
<span class="line"><span style="color:#7F95A6;">     * The agent&#39;s subscriptions: the channel name and the subscription id;</span></span>
<span class="line"><span style="color:#7F95A6;">     * \`hook\` is the ready-made path of a subscription to a webhook channel</span></span>
<span class="line"><span style="color:#7F95A6;">     * this app mounts.</span></span>
<span class="line"><span style="color:#7F95A6;">     */</span></span>
<span class="line"><span style="color:#DCE9F2;">    channels: Array&lt;{</span></span>
<span class="line"><span style="color:#DCE9F2;">        channel: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">        id: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">        hook?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    }&gt;;</span></span>
<span class="line"><span style="color:#DCE9F2;">    budget: Budget;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** Declared state collections. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    state: string[];</span></span>
<span class="line"><span style="color:#7F95A6;">    /** A private agent: reading its runs and state needs \`agent:&lt;name&gt;:read\`. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    private: boolean;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** An agent that failed to load, as \`GET /agents\` lists it next to the agents. */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> AgentIssue = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    agent: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    message: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    at: Date;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#7F95A6;">/** A cron subscription as \`GET /schedules\` lists it (definitions only, not scheduler health). */</span></span>
<span class="line"><span style="color:#8FD0F2;">export</span><span style="color:#8FD0F2;"> type</span><span style="color:#DCE9F2;"> ScheduleSummary = {</span></span>
<span class="line"><span style="color:#DCE9F2;">    agent: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The cron channel&#39;s name. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    channel: string;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** The subscription id. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    trigger: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    expression: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    timezone?: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">    overlap: ScheduleOverlap;</span></span>
<span class="line"><span style="color:#7F95A6;">    /** ISO time of the next fire after now. */</span></span>
<span class="line"><span style="color:#DCE9F2;">    nextAt: string;</span></span>
<span class="line"><span style="color:#DCE9F2;">};</span></span></code></pre></div>`,39)])])}const F=n(l,[["render",o]]);export{h as __pageData,F as default};
