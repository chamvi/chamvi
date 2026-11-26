import{_ as n,o as a,c as e,a2 as o}from"./chunks/framework.DiXyETtc.js";const y=JSON.parse('{"title":"@chamvi/http","description":"","frontmatter":{},"headers":[],"relativePath":"reference/http.md","filePath":"reference/http.md","lastUpdated":1795697649000}'),l={name:"reference/http.md"};function p(t,s,c,r,i,d){return a(),e("div",null,[...s[0]||(s[0]=[o(`<h1 id="chamvi-http" tabindex="-1">@chamvi/http <a class="header-anchor" href="#chamvi-http" aria-label="Permalink to &quot;@chamvi/http&quot;">​</a></h1><p>REST, SSE, MCP, the <code>http</code>, <code>mcp</code> and <code>webhook</code> channels and the <code>/channels/&lt;name&gt;</code> mount for chamvi agents, on routup. The public API of <code>packages/http/src/index.ts</code>.</p><div class="language-bash"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#E3E5EA;">npm </span><span style="color:#E7C58C;">install</span><span style="color:#E7C58C;"> @chamvi/http</span><span style="color:#E7C58C;"> @chamvi/core</span><span style="color:#E7C58C;"> --save</span></span></code></pre></div><p><code>@chamvi/core</code> is a peer dependency. See <a href="/guide/http">HTTP API &amp; MCP</a> for the behaviour.</p><h2 id="createhttpapp" tabindex="-1">createHttpApp <a class="header-anchor" href="#createhttpapp" aria-label="Permalink to &quot;createHttpApp&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> createHttpApp(options: HttpAppOptions): App; </span><span style="color:#80858F;">// routup App</span></span></code></pre></div><p>The services, the agents and the clock come from <code>engine</code> (<code>engine.runService</code>, <code>engine.stateService</code>, ..., <code>engine.listAgents()</code>, <code>engine.clock</code>). The agents are read from the engine on every request, so an agent registered, replaced or removed at runtime gets (or loses) its routes, webhook subscriptions, <code>GET /agents</code> entry, schedules and MCP <code>run_&lt;agent&gt;</code> tool at once; a <code>run_&lt;agent&gt;</code> definition is built once per agent object, and one that fails for an agent registered after construction goes to <code>onError</code> and that tool is left out. <code>agents</code> narrows the served agents to the named ones, checked at construction: the others, also agents registered later, get no routes or MCP tools in this app (a mounted channel serves every agent subscribing to it), and a named agent removed from the engine answers 404. <code>agentIssues</code> lists agents that failed to load as <code>GET /agents</code> <code>issues</code>. <code>HttpRouteContext.agents</code> is read from the engine on every access. Throws <code>InvalidAgentDefinitionError</code> for a name in <code>agents</code> the engine lacks or that is given twice, an empty <code>auth</code> array and an invalid <code>routes</code> entry (a path that is not static, a duplicate method and path, a first segment of a built-in route such as <code>agents</code>, <code>runs</code> or <code>channels</code>, or the metrics path, all compared case-sensitively, as routup matches).</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> CorsOptions = CorsPluginOptions;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Without the library&#39;s \`trustProxy\`: chamvi keys by \`getRequestIP()\`, so \`HttpAppOptions.trustProxy\` is the one proxy setting. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> RateLimitOptions = Omit&lt;RateLimitPluginOptions, </span><span style="color:#E7C58C;">&#39;trustProxy&#39;</span><span style="color:#E3E5EA;">&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A mounted channel&#39;s independent per-client HTTP request limit. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ChannelRateLimitOptions = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    max: number;</span></span>
<span class="line"><span style="color:#80858F;">    /** Positive timer-safe milliseconds. Default: 60,000. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    windowMs?: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> PrometheusOptions = PrometheusPluginOptions;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** routup&#39;s trust-proxy input: a predicate, CIDRs, \`&#39;loopback&#39;\`, a hop count or a boolean. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> TrustProxyInput = NonNullable&lt;AppOptionsInput[</span><span style="color:#E7C58C;">&#39;trustProxy&#39;</span><span style="color:#E3E5EA;">]&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> McpOptions = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    name?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    version?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    maxWaitSeconds?: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> HttpAppOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Its services (\`runService\`, \`stepService\`, \`artifactService\`, \`stateService\`, \`connectionService\`), agents and \`clock\` serve every route. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    engine: IEngine;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Names of the engine&#39;s agents to serve (routes, MCP tools, extra</span></span>
<span class="line"><span style="color:#80858F;">     * routes), checked at construction; the others, also agents registered</span></span>
<span class="line"><span style="color:#80858F;">     * later, are unknown to this app. A named agent removed from the engine</span></span>
<span class="line"><span style="color:#80858F;">     * answers 404. Default: every agent the engine holds, at request time.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    agents?: string[];</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Agents that failed to load (e.g. from an agents folder), read per</span></span>
<span class="line"><span style="color:#80858F;">     * \`GET /agents\` and listed as its \`issues\`. Default: none.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    agentIssues?: () </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#8EA7FF;"> readonly</span><span style="color:#E3E5EA;"> AgentIssue[];</span></span>
<span class="line"><span style="color:#80858F;">    /** One authenticator or a chain; the first principal wins. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    auth: Authenticator | Authenticator[];</span></span>
<span class="line"><span style="color:#80858F;">    /** Prefix of every route, e.g. \`/api\`. Default: none. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    basePath?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Which proxies \`getRequestIP\` trusts (and so the rate-limit key). Default: none. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    trustProxy?: TrustProxyInput;</span></span>
<span class="line"><span style="color:#80858F;">    /** Fails \`/readyz\` once shutting down; the app ends its streams on shutdown. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    shutdown?: IShutdown;</span></span>
<span class="line"><span style="color:#80858F;">    /** Bytes a request body may have. Default: 1 MiB. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    bodyLimit?: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">    stream?: {</span></span>
<span class="line"><span style="color:#80858F;">        /** How often a stream polls the store for runs executing elsewhere. Default: 2 s. */</span></span>
<span class="line"><span style="color:#E3E5EA;">        pollMs?: number;</span></span>
<span class="line"><span style="color:#80858F;">        /**</span></span>
<span class="line"><span style="color:#80858F;">         * Open SSE run streams plus waiting MCP \`run_&lt;agent&gt;\` calls, per app</span></span>
<span class="line"><span style="color:#80858F;">         * (a positive integer). Over it a stream answers 503 with</span></span>
<span class="line"><span style="color:#80858F;">         * \`Retry-After\`, an MCP call answers without waiting. Default: 1000.</span></span>
<span class="line"><span style="color:#80858F;">         */</span></span>
<span class="line"><span style="color:#E3E5EA;">        maxOpen?: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">    };</span></span>
<span class="line"><span style="color:#E3E5EA;">    mcp?: false | McpOptions;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The OpenAPI document of the REST API at \`GET &lt;basePath&gt;/openapi.json\`</span></span>
<span class="line"><span style="color:#80858F;">     * and a Swagger UI over it at \`&lt;basePath&gt;/docs\` (\`ui: false\` serves the</span></span>
<span class="line"><span style="color:#80858F;">     * document only), both unauthenticated; false serves neither. A missing</span></span>
<span class="line"><span style="color:#80858F;">     * or unreadable document (a build without its last step) mounts neither</span></span>
<span class="line"><span style="color:#80858F;">     * and is reported once to \`onError\`. Default: both.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    openapi?: false | OpenApiOptions;</span></span>
<span class="line"><span style="color:#80858F;">    /** CORS is off unless given. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    cors?: false | CorsOptions;</span></span>
<span class="line"><span style="color:#E3E5EA;">    rateLimit?: false | Partial&lt;RateLimitOptions&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Policies for mounted POST /channels/&lt;name&gt; paths (including subpaths).</span></span>
<span class="line"><span style="color:#80858F;">     * An omitted name shares the general limit; false exempts the channel;</span></span>
<span class="line"><span style="color:#80858F;">     * an explicit policy replaces it with a separate per-channel/client bucket,</span></span>
<span class="line"><span style="color:#80858F;">     * also when rateLimit is false. Authentication and body limits are unchanged.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    channelRateLimits?: Record&lt;string, false | ChannelRateLimitOptions&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    metrics?: false | Partial&lt;PrometheusOptions&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** How long \`/readyz\` waits for the store. Default: 2 s. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    readyTimeoutMs?: number;</span></span>
<span class="line"><span style="color:#80858F;">    /** Receives 5xx causes and background failures. Default: \`console.error\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    onError?: (error: unknown) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> void;</span></span>
<span class="line"><span style="color:#80858F;">    /** Extra routes other packages contribute (e.g. the dashboard), served under \`basePath\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    routes?: HttpRoute[];</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Controller instances an app contributes: objects whose class carries</span></span>
<span class="line"><span style="color:#80858F;">     * \`@DController\` of \`@routup/decorators\`, mounted after the built-in</span></span>
<span class="line"><span style="color:#80858F;">     * controllers and served under \`basePath\`. Each base path must be a</span></span>
<span class="line"><span style="color:#80858F;">     * static path outside the built-in routes and the metrics path, listed</span></span>
<span class="line"><span style="color:#80858F;">     * once per controller, with no extra route at or under it and not at or</span></span>
<span class="line"><span style="color:#80858F;">     * under an extra prefix route (any method), and each method path one</span></span>
<span class="line"><span style="color:#80858F;">     * routup parses; a breach throws InvalidAgentDefinitionError at</span></span>
<span class="line"><span style="color:#80858F;">     * construction. A repeated route is answered by the first. A method is not</span></span>
<span class="line"><span style="color:#80858F;">     * authenticated unless it uses \`ForceLoggedInMiddleware\` (or a body</span></span>
<span class="line"><span style="color:#80858F;">     * middleware) or its service authorizes. Default: none.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    controllers?: object[];</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Channels to serve at \`POST /channels/&lt;name&gt;\` and below (e.g. the</span></span>
<span class="line"><span style="color:#80858F;">     * webhook and GitHub channels), unauthenticated: each checks its own</span></span>
<span class="line"><span style="color:#80858F;">     * credentials. Each needs an \`in\` and must be the object the engine holds</span></span>
<span class="line"><span style="color:#80858F;">     * under its name, else InvalidAgentDefinitionError. Default: none.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    channels?: IChannel[];</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The connection handles to serve at \`/connections\` (status, the</span></span>
<span class="line"><span style="color:#80858F;">     * widgets such as a pairing QR, live events, reset), read per request.</span></span>
<span class="line"><span style="color:#80858F;">     * Default: none, the list is empty.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    connections?: () </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#8EA7FF;"> readonly</span><span style="color:#E3E5EA;"> IConnectionHandle[];</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The configurable connection types (\`/connection-types\`, the declared</span></span>
<span class="line"><span style="color:#80858F;">     * connections listed at \`/connections\`), read per request. Default: none.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    connectionTypes?: () </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#8EA7FF;"> readonly</span><span style="color:#E3E5EA;"> IConnectionTypeProvider[];</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Where connection settings and secrets are saved; it needs an engine</span></span>
<span class="line"><span style="color:#80858F;">     * with a connection service (\`engine.connectionService\`, the stored</span></span>
<span class="line"><span style="color:#80858F;">     * rows), else InvalidAgentDefinitionError. Absent (a store without</span></span>
<span class="line"><span style="color:#80858F;">     * connections): connections are read-only, no save or create is</span></span>
<span class="line"><span style="color:#80858F;">     * accepted.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    connectionConfigs?: IConnectionConfigStore;</span></span>
<span class="line"><span style="color:#80858F;">    /** The separately built pages \`GET /ui-pages\` lists, read per request. Default: none. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    uiPages?: () </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#8EA7FF;"> readonly</span><span style="color:#E3E5EA;"> UiPage[];</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The background jobs \`GET /components\` lists before the engine&#39;s</span></span>
<span class="line"><span style="color:#80858F;">     * channels with a \`status()\`, read per request. Default: none.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    components?: () </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#8EA7FF;"> readonly</span><span style="color:#E3E5EA;"> HttpComponent[];</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><p><code>channels</code> lists the channels mounted at <code>POST /channels/&lt;name&gt;</code> (each needs an <code>in</code> and must be the object the engine holds under its name, else <code>InvalidAgentDefinitionError</code>). <code>connections</code> returns the connection handles (<code>IConnectionHandle</code> of <code>@chamvi/core</code>: <code>name</code>, <code>type</code>, <code>status()</code>, <code>widgets()</code>, <code>subscribe()</code>, <code>actions.reset?</code>) served at <a href="/guide/http#routes"><code>/connections</code></a>; it is called per request, and <code>@chamvi/app</code> passes every <code>AppToken.CONNECTIONS</code> contribution. <code>routes</code> takes extra routes from other packages, such as the dashboard of <code>@chamvi/ui</code>:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> HttpRouteMethod = </span><span style="color:#E7C58C;">&#39;GET&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;POST&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;PUT&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;PATCH&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;DELETE&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> HttpRouteRequest = {</span></span>
<span class="line"><span style="color:#80858F;">    /** URL, method, headers and signal; without the body, which only readBody() reads. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    request: Request;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Runs the app&#39;s authenticators over the request, once per request (every</span></span>
<span class="line"><span style="color:#80858F;">     * call, and a built-in route&#39;s check, shares the result): 401 with</span></span>
<span class="line"><span style="color:#80858F;">     * \`WWW-Authenticate: Bearer\` without a principal, 403 when \`permission\`</span></span>
<span class="line"><span style="color:#80858F;">     * is given and not granted: for the resource \`attributes\` when given,</span></span>
<span class="line"><span style="color:#80858F;">     * else for some resource (a binding whose policies need the missing</span></span>
<span class="line"><span style="color:#80858F;">     * attributes passes). A route that never calls it stays unauthenticated.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    authorize(permission?: string, attributes?: Record&lt;string, unknown&gt;): Promise&lt;Principal&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The raw body, at most \`bodyLimit\` bytes: 413 above it (content-length</span></span>
<span class="line"><span style="color:#80858F;">     * refused unread, else drained like readJsonBody), 415 for a non-JSON</span></span>
<span class="line"><span style="color:#80858F;">     * media type with a non-empty body; an empty body is a 0-length array.</span></span>
<span class="line"><span style="color:#80858F;">     * Memoized: every call answers the same bytes (or the same error).</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    readBody(): Promise&lt;Uint8Array&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The path below the route&#39;s \`path\`: \`&#39;&#39;\` for \`path\` itself, else the raw</span></span>
<span class="line"><span style="color:#80858F;">     * (still percent-encoded, case kept) rest starting with \`/\`, e.g.</span></span>
<span class="line"><span style="color:#80858F;">     * \`/assets/app-1a2b.js\`; never the query. Only a \`prefix\` route sees more than \`&#39;&#39;\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    subpath: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> HttpRouteResult = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    status: number;</span></span>
<span class="line"><span style="color:#80858F;">    /** Set on the response; a \`content-type\` here wins over the body&#39;s default. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    headers?: Record&lt;string, string&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * A \`Uint8Array\` is sent as is (\`application/octet-stream\` unless</span></span>
<span class="line"><span style="color:#80858F;">     * \`headers\` names a \`content-type\`); objects, arrays, numbers and booleans</span></span>
<span class="line"><span style="color:#80858F;">     * as JSON, a string as \`text/plain\`; \`undefined\` or \`null\` answer an empty body.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    body?: unknown;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> HttpRouteContext = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    engine: IEngine;</span></span>
<span class="line"><span style="color:#80858F;">    /** The agents the app serves, read from the engine on every access. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    agents: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> Agent[];</span></span>
<span class="line"><span style="color:#E3E5EA;">    clock: IClock;</span></span>
<span class="line"><span style="color:#E3E5EA;">    onError: (error: unknown) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> void;</span></span>
<span class="line"><span style="color:#80858F;">    /** The app&#39;s \`basePath\` (\`&#39;&#39;\` by default), e.g. to build absolute links. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    basePath: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> HttpRoute = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    method: HttpRouteMethod;</span></span>
<span class="line"><span style="color:#80858F;">    /** Static path under basePath (no &#39;:&#39; &#39;*&#39; &#39;{&#39;), e.g. &#39;/ui&#39;; also its metrics label. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    path: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** false: skipped by the app&#39;s rate limiter (callers that never retry, e.g. webhook senders). Default: limited. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    rateLimit?: false;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * true: the route also serves every path below \`path/\` (same method),</span></span>
<span class="line"><span style="color:#80858F;">     * handing the rest as \`request.subpath\`; labelled \`&lt;path&gt;/*\` in metrics.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    prefix?: true;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Not authenticated by the app&#39;s authenticators unless the handler calls</span></span>
<span class="line"><span style="color:#80858F;">     * \`request.authorize()\`. Thrown @ebec/http and core errors render like any route&#39;s.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    handler: (request: HttpRouteRequest, ctx: HttpRouteContext) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> Promise&lt;HttpRouteResult&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><p>The app&#39;s authenticators do not guard an extra route. A handler that needs them calls <code>request.authorize(permission?)</code>: it resolves the caller&#39;s <code>Principal</code> (the authenticator chain runs once per request), answers 401 with <code>WWW-Authenticate: Bearer</code> without one and 403 when the principal lacks <code>permission</code>.</p><h2 id="channel-http-request-limits" tabindex="-1">Channel HTTP request limits <a class="header-anchor" href="#channel-http-request-limits" aria-label="Permalink to &quot;Channel HTTP request limits&quot;">​</a></h2><p><code>channelRateLimits?: Record&lt;string, false | ChannelRateLimitOptions&gt;</code> selects the HTTP intake policy for each mounted channel, without changing run execution capacity:</p><ul><li>An omitted entry inherits the general <code>rateLimit</code> bucket (default 300 requests per 60 seconds per client IP), shared with REST and other unconfigured channels.</li><li><code>{ max, windowMs? }</code> replaces that bucket for the channel with its own per-client bucket, separate from REST and other configured channels. <code>windowMs</code> defaults to 60,000. Explicit channel limits also work when the general <code>rateLimit</code> is <code>false</code>.</li><li><code>false</code> removes request limiting only for that channel&#39;s mounted <code>POST /channels/&lt;name&gt;</code> and subpaths. It does not disable authentication, signatures or body-size checks. Other methods and unknown channel paths do not gain the exemption.</li></ul><p>The keys must exactly name mounted input channels. <code>max</code> must be a positive safe integer; <code>windowMs</code> a positive integer no greater than 2,147,483,647. Invalid policies throw <code>InvalidAgentDefinitionError</code> before serving. Buckets are local to this HTTP app, not coordinated through the run store. Refusals remain JSON <code>429</code> responses with <code>Retry-After</code> and rate-limit headers.</p><p>The same options pass through <code>httpModule()</code> in <code>@chamvi/app</code>. See <a href="/deployment/github-app#bursts-and-http-intake">GitHub intake behind an ingress</a> for finite and disabled examples. <code>trustProxy</code> defaults to trusting no forwarded headers; restrict it to known proxy source addresses or CIDRs, never blindly trust arbitrary client headers.</p><h2 id="openapi-document" tabindex="-1">OpenAPI document <a class="header-anchor" href="#openapi-document" aria-label="Permalink to &quot;OpenAPI document&quot;">​</a></h2><p>Every app serves the OpenAPI 3.2 document of its REST API at <code>GET &lt;basePath&gt;/openapi.json</code> and a Swagger UI over it at <code>&lt;basePath&gt;/docs</code>. The document describes the built-in REST routes: MCP, the <code>/channels/&lt;name&gt;</code> mount and extra routes are not in it, and an app&#39;s <a href="/guide/controllers">controllers</a> only when the app contributes their document (<code>openapi.documents</code>, see <a href="/guide/controllers#openapi-document">OpenAPI document</a>). It is generated from the controllers when <code>@chamvi/http</code> is built (<code>dist/swagger.json</code> in the published package), never at runtime; its <code>servers</code> entry is the app&#39;s <code>basePath</code>. A missing or unreadable document serves neither path and is reported once to <code>onError</code>; a UI that cannot be mounted leaves only <code>/docs</code> unserved, reported the same way; the API still starts.</p><ul><li><code>openapi: { ui: false }</code> serves the document without the UI; <code>openapi: false</code> serves neither. With <code>@chamvi/app</code>, pass it through <code>httpModule({ openapi: false })</code>; there is no environment variable for it.</li><li>Both are unauthenticated, rate-limited like every other route and labelled <code>/openapi.json</code>, <code>/docs</code> and <code>/docs/*</code> in the metrics. Turn them off, or keep them off the public ingress, if the shape of the API should not be public.</li><li>The UI answers <code>GET</code> and <code>HEAD</code> for its page (<code>&lt;basePath&gt;/docs</code>, <code>/docs/</code>, <code>/docs/index.html</code>, <code>docs</code> in lower case only) and the files the page loads (its generated <code>swagger-initializer.js</code> with the document, <code>index.css</code>, the Swagger UI bundle, styles and icons), everything else under <code>/docs</code> with the JSON 404. The page has no inline script or style and loads nothing from another origin: the page and every file it serves (not the JSON 404 answers) carry a Content-Security-Policy of same-origin files only (<code>default-src &#39;none&#39;</code>, <code>worker-src &#39;none&#39;</code>, <code>frame-ancestors &#39;none&#39;</code>), <code>x-content-type-options: nosniff</code>, <code>referrer-policy: no-referrer</code>, <code>x-frame-options: DENY</code>, <code>cross-origin-resource-policy: same-origin</code> and <code>cache-control: no-cache</code>.</li><li><code>docs</code> and <code>openapi.json</code> are reserved first path segments: an extra route there is refused at construction, also with <code>openapi: false</code>.</li><li>The UI&#39;s npm dependency <code>swagger-ui-dist</code> installs <code>@scarf/scarf</code>, whose install script reports install analytics. Set <code>SCARF_ANALYTICS=false</code> in the environment that runs <code>npm install</code> (an image build stage, CI), or <code>&quot;scarfSettings&quot;: { &quot;enabled&quot;: false }</code> in the app&#39;s <code>package.json</code>, to turn it off.</li></ul><h2 id="channels" tabindex="-1">Channels <a class="header-anchor" href="#channels" aria-label="Permalink to &quot;Channels&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> httpChannel(options?: HttpChannelOptions): IChannel;   </span><span style="color:#80858F;">// name &#39;http&#39;: REST runs; no in, no out</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> mcpChannel(options?: HttpChannelOptions): IChannel;    </span><span style="color:#80858F;">// name &#39;mcp&#39;: MCP run_&lt;agent&gt; runs; no in, no out</span></span>
<span class="line"><span style="color:#80858F;">// HttpChannelOptions { untrusted?: boolean }: true taints every run the channel starts (default trusted)</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> webhookChannel(options: WebhookChannelOptions): WebhookChannel; </span><span style="color:#80858F;">// in at /channels/&lt;name&gt;/&lt;agent&gt;&lt;path&gt;; on() bound to its name</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> readRequestBody(request: Request, options: ReadRequestBodyOptions): Promise&lt;Uint8Array&gt;; </span><span style="color:#80858F;">// for a channel&#39;s in: 413 above options.limit</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> http: HttpSubscriber;       </span><span style="color:#80858F;">// http.on({ schema? }): id &#39;http&#39;, at most one per agent</span></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> webhook: WebhookSubscriber; </span><span style="color:#80858F;">// webhook.on(path, options?): id &#39;webhook:&lt;path&gt;&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> HTTP_CHANNEL_NAME: </span><span style="color:#E7C58C;">&#39;http&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> MCP_CHANNEL_NAME: </span><span style="color:#E7C58C;">&#39;mcp&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> WEBHOOK_CHANNEL_NAME: </span><span style="color:#E7C58C;">&#39;webhook&#39;</span><span style="color:#E3E5EA;">;</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ChannelRequest, IChannel } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { Authenticator } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../auth/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { WebhookSubscriber } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;../subscriptions/types.ts&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Options of \`httpChannel()\` and \`mcpChannel()\`. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> HttpChannelOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Taint every run started through this channel (\`channel:&lt;name&gt;\`), so</span></span>
<span class="line"><span style="color:#80858F;">     * classified outbound tools need approval; default false (the caller is</span></span>
<span class="line"><span style="color:#80858F;">     * an authenticated principal). Set it when principals relay content you</span></span>
<span class="line"><span style="color:#80858F;">     * do not trust.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    untrusted?: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> WebhookChannelOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** The channel name; default \`webhook\`. A second instance needs its own. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    name?: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Who may deliver: the first principal wins (as the http app&#39;s \`auth\`),</span></span>
<span class="line"><span style="color:#80858F;">     * and it needs \`chamvi_agent_run\` for the agent. Required, since the http app never</span></span>
<span class="line"><span style="color:#80858F;">     * authenticates channel routes.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    auth: Authenticator | Authenticator[];</span></span>
<span class="line"><span style="color:#80858F;">    /** Bytes a delivery may have (413 above). Default: 1 MiB, the http app&#39;s default. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    bodyLimit?: number;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A webhook channel: \`in\` only, with \`on()\` bound to its name. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> WebhookChannel = IChannel&lt;ChannelRequest, Response&gt; &amp; WebhookSubscriber;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A webhook delivery&#39;s target, parsed from the subpath; internal. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> WebhookTarget = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** Starts with \`/\`, the decoded segments joined with \`/\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    path: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ChannelSubscription } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { StandardSchemaV1 } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@standard-schema/spec&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> HttpSubscriptionOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Shared-store execution cap for REST, UI and MCP starts; omitted or false adds no cap. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    concurrencyMaxRuns?: number | false;</span></span>
<span class="line"><span style="color:#80858F;">    /** Validates the payload of a REST, UI or MCP start. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    schema?: StandardSchemaV1;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Makes the \`http\` subscription (id \`http\`, at most one per agent). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> HttpSubscriber = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    on(options?: HttpSubscriptionOptions): ChannelSubscription;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> WebhookSubscriptionOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Shared-store execution cap within the agent; omitted or false adds no cap. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    concurrencyMaxRuns?: number | false;</span></span>
<span class="line"><span style="color:#80858F;">    /** Validates the delivered payload. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    schema?: StandardSchemaV1;</span></span>
<span class="line"><span style="color:#80858F;">    /** The run&#39;s idempotency key when the delivery has no \`Idempotency-Key\` header. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    idempotencyKey?: (payload: unknown) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> string | undefined;</span></span>
<span class="line"><span style="color:#E3E5EA;">    concurrencyKey?: (payload: unknown) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> string | undefined;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** Makes webhook subscriptions for one channel name. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> WebhookSubscriber = {</span></span>
<span class="line"><span style="color:#80858F;">    /** \`path\` starts with \`/\`; the subscription id is \`webhook:&lt;path&gt;\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    on(path: string, options?: WebhookSubscriptionOptions): ChannelSubscription;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><p><code>httpChannel({ untrusted: true })</code> and <code>mcpChannel({ untrusted: true })</code> opt the REST and MCP intake into the <a href="/guide/tools#untrusted-content-and-outbound-tools">run-taint boundary</a>, for callers that relay text written by others (an OpenClaw MCP principal forwarding chat messages): every run they start is tainted (<code>channel:http</code>/<code>channel:mcp</code>), so outbound tools wait for approval. Both default to trusted, since the caller is an authenticated principal. In an <code>@chamvi/app</code> app, configure the built-in http module: <code>httpModule({ untrusted: { mcp: true } })</code> (or <code>http: true</code>) in <code>createApp({ modules })</code>.</p><p>The engine refuses an <code>http.on()</code> subscription unless it holds <code>httpChannel()</code> (REST and MCP keep separate idempotency scopes through the two channel names), and a <code>webhook.on()</code> one unless it holds the webhook channel. <code>webhook.on()</code> throws <code>InvalidAgentDefinitionError</code> for a path that does not start with <code>/</code>. See <a href="/guide/http#channels">Channels</a>.</p><h2 id="authenticators" tabindex="-1">Authenticators <a class="header-anchor" href="#authenticators" aria-label="Permalink to &quot;Authenticators&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">type</span><span style="color:#E3E5EA;"> Authenticator = (request: Request) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> Promise&lt;Principal | undefined&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> staticTokens(options: StaticTokensOptions): Authenticator;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> authup(options: AuthupOptions): Authenticator;</span></span>
<span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> oidc(options: OidcOptions): Authenticator;</span></span></code></pre></div><p>An authenticator resolves <code>undefined</code> for a request it does not recognize and throws a 401 for credentials it rejects. <code>staticTokens</code> throws <code>InvalidAgentDefinitionError</code> for an empty <code>tokens</code> array, a token <code>value</code> shorter than 16 characters, a missing <code>id</code> or a <code>value</code> given twice; <code>oidc</code> for an empty <code>issuers</code> list, an issuer without <code>audience</code> or a missing <code>principal</code>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { PermissionAuthorization, PermissionBinding, PermissionIdentity } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/access&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> Principal = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    id: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    kind: </span><span style="color:#E7C58C;">&#39;token&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;authup&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;oidc&#39;</span><span style="color:#E3E5EA;"> | (string &amp; {});</span></span>
<span class="line"><span style="color:#80858F;">    /** Granted permissions: authup bindings with resolved policy trees (plain data). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    bindings: </span><span style="color:#8EA7FF;">readonly</span><span style="color:#E3E5EA;"> PermissionBinding[];</span></span>
<span class="line"><span style="color:#80858F;">    /** authup&#39;s snapshot of the identity&#39;s grants; set by \`authup()\`, which leaves \`bindings\` empty. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    authorization?: PermissionAuthorization;</span></span>
<span class="line"><span style="color:#80858F;">    /** What an \`identity\` policy evaluates; set by \`authup()\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    identity?: PermissionIdentity;</span></span>
<span class="line"><span style="color:#E3E5EA;">    claims?: Record&lt;string, unknown&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/**</span></span>
<span class="line"><span style="color:#80858F;"> * Resolves \`undefined\` when the request carries no credentials it</span></span>
<span class="line"><span style="color:#80858F;"> * recognizes, throws \`UnauthorizedError\` for credentials it rejects.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> Authenticator = (request: Request) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> Promise&lt;Principal | undefined&gt;;</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { ITokenVerifier } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@authup/server-adapter-kit&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IClock } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AuthupOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** An authup \`TokenVerifier\` (remote mode for grants) or any \`ITokenVerifier\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    verifier: ITokenVerifier;</span></span>
<span class="line"><span style="color:#80858F;">    /** RFC 8705: the client certificate&#39;s SHA-256 thumbprint, for certificate-bound tokens. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    certificateThumbprintByRequest?: (request: Request) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> string | undefined | Promise&lt;string | undefined&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Reads authup&#39;s \`GET /authorization\` body (needs \`permission_read\` with a realm scope of \`ownOrNull\` or wider).</span></span>
<span class="line"><span style="color:#80858F;">     * Called once, again once the copy is older than \`catalogMaxAgeMs\`,</span></span>
<span class="line"><span style="color:#80858F;">     * when a grant names a definition or policy the copy lacks, and after a</span></span>
<span class="line"><span style="color:#80858F;">     * failed read (a body that is not a catalog counts as one).</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    catalog: () </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> Promise&lt;unknown&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** How long a read catalog is used before it is read again, so policy edits in authup apply. Default: 60 000. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    catalogMaxAgeMs?: number;</span></span>
<span class="line"><span style="color:#80858F;">    /** The clock the catalog&#39;s age is measured on. Default: \`systemClock\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    clock?: IClock;</span></span>
<span class="line"><span style="color:#80858F;">    /** The realm chamvi&#39;s resources belong to (the realm id of chamvi&#39;s authup client). Called per request with grants; cache it. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    realm: () </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> Promise&lt;string&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The owner client id (#282). Set, every permission name is checked only</span></span>
<span class="line"><span style="color:#80858F;">     * as a definition of this client in \`realm\`; global and realm-owned</span></span>
<span class="line"><span style="color:#80858F;">     * definitions grant nothing. Called per login with grants; cache it.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    client?: () </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> Promise&lt;string&gt;;</span></span>
<span class="line"><span style="color:#80858F;">    /** Receives catalog, realm, client and snapshot failures; the login then grants nothing. Default: \`console.error\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    onError?: (error: unknown) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> void;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><h2 id="permissions" tabindex="-1">Permissions <a class="header-anchor" href="#permissions" aria-label="Permalink to &quot;Permissions&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> assertMcpRunTool(agent: Agent): void; </span><span style="color:#80858F;">// throws InvalidAgentDefinitionError like createHttpApp</span></span></code></pre></div><p><code>assertMcpRunTool</code> builds the agent&#39;s <code>run_&lt;agent&gt;</code> MCP tool definition and throws what <code>createHttpApp</code> would throw for it (a tool name above 64 characters, a payload schema MCP cannot compile); the app runs it on every folder agent before registering it. <code>createHttpApp</code> reports a folder agent&#39;s failure (one the engine holds at a revision) to <code>onError</code> and skips its tool instead of throwing.</p><p>The routes check <code>Permission</code> names of <code>@chamvi/access</code> with <code>can(principal, name, { attributes, now })</code> (one resource) and <code>canSome(principal, name, { now })</code> (a collection), <code>now</code> from the engine clock. The names and their attributes are in <a href="/guide/permissions#names">Permissions and authup</a>.</p><h2 id="createshutdown" tabindex="-1">createShutdown <a class="header-anchor" href="#createshutdown" aria-label="Permalink to &quot;createShutdown&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">function</span><span style="color:#E3E5EA;"> createShutdown(options: ShutdownOptions): IShutdown;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> DEFAULT_SHUTDOWN_DRAIN_TIMEOUT_MS: </span><span style="color:#E7C58C;">30_000</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#8EA7FF;">const</span><span style="color:#E3E5EA;"> DEFAULT_SHUTDOWN_CLOSE_TIMEOUT_MS: </span><span style="color:#E7C58C;">5_000</span><span style="color:#E3E5EA;">;</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/*</span></span>
<span class="line"><span style="color:#80858F;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#80858F;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#80858F;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#80858F;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#80858F;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">import</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> { IEngine } </span><span style="color:#8EA7FF;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> interface</span><span style="color:#E3E5EA;"> IShutdown {</span></span>
<span class="line"><span style="color:#80858F;">    /** True from the first \`shutdown()\` call on; \`/readyz\` then fails. */</span></span>
<span class="line"><span style="color:#8EA7FF;">    readonly</span><span style="color:#E3E5EA;"> shuttingDown: boolean;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Runs \`fn\` during the shutdown, in the order added, after readiness</span></span>
<span class="line"><span style="color:#80858F;">     * failed and before the server closes; returns an unsubscribe.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    onShutdown(fn: () </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> void | Promise&lt;void&gt;): () </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> void;</span></span>
<span class="line"><span style="color:#80858F;">    /** Idempotent: every call returns the same promise. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    shutdown(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ShutdownOptions = {</span></span>
<span class="line"><span style="color:#80858F;">    /** Drained on shutdown; its \`clock\` times the delays. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    engine: IEngine;</span></span>
<span class="line"><span style="color:#80858F;">    /** srvx \`Server\` (pass \`gracefulShutdown: false\` to \`serve\`). */</span></span>
<span class="line"><span style="color:#E3E5EA;">    server?: { close(closeActiveConnections?: boolean): Promise&lt;void&gt; };</span></span>
<span class="line"><span style="color:#80858F;">    /** Time for load balancers to see the failing readiness. Default 0. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    readinessDelayMs?: number;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * Default 30 s. A function is called when the drain begins, so the drain</span></span>
<span class="line"><span style="color:#80858F;">     * can get what remains of a budget earlier shutdown work shared.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    drainTimeoutMs?: number | (() </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> number);</span></span>
<span class="line"><span style="color:#80858F;">    /** Wait for open connections after the drain, then close them. Default 5 s. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    closeTimeoutMs?: number;</span></span>
<span class="line"><span style="color:#80858F;">    /** Default \`console.error\`. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    onError?: (error: unknown) </span><span style="color:#8EA7FF;">=&gt;</span><span style="color:#E3E5EA;"> void;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><h2 id="wire-types" tabindex="-1">Wire types <a class="header-anchor" href="#wire-types" aria-label="Permalink to &quot;Wire types&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#8EA7FF;">type</span><span style="color:#E3E5EA;"> InvokerView = Omit&lt;Invoker, </span><span style="color:#E7C58C;">&#39;bindings&#39;</span><span style="color:#E3E5EA;">&gt;;</span></span>
<span class="line"><span style="color:#8EA7FF;">type</span><span style="color:#E3E5EA;"> RunView = Omit&lt;Run, </span><span style="color:#E7C58C;">&#39;claim&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;trigger&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;conversation&#39;</span><span style="color:#E3E5EA;">&gt; &amp; {</span></span>
<span class="line"><span style="color:#E3E5EA;">    trigger: Omit&lt;TriggerEnvelope, </span><span style="color:#E7C58C;">&#39;invoker&#39;</span><span style="color:#E3E5EA;">&gt; &amp; { invoker?: InvokerView };</span></span>
<span class="line"><span style="color:#E3E5EA;">    agentPrivate: boolean; </span><span style="color:#80858F;">// the agent&#39;s \`private\` as the server checks it (an agent the app does not hold: true)</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"><span style="color:#8EA7FF;">type</span><span style="color:#E3E5EA;"> RunSummary = Pick&lt;Run, </span><span style="color:#E7C58C;">&#39;id&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;agent&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;status&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;createdAt&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;finishedAt&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;error&#39;</span><span style="color:#E3E5EA;">&gt;;</span></span>
<span class="line"><span style="color:#8EA7FF;">type</span><span style="color:#E3E5EA;"> RunToolResult = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    runId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    status: RunStatusLiteral;</span></span>
<span class="line"><span style="color:#E3E5EA;">    deduplicated: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">    output?: unknown;</span></span>
<span class="line"><span style="color:#E3E5EA;">    error?: { code: string; message: string };</span></span>
<span class="line"><span style="color:#E3E5EA;">    waiting?: RunToolApprovalWait | RunToolDispatchWait | RunToolRemoteWait;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"><span style="color:#8EA7FF;">type</span><span style="color:#E3E5EA;"> RunToolApprovalWait = { </span><span style="color:#80858F;">// the run, or a descendant it waits on, waits on an approval</span></span>
<span class="line"><span style="color:#E3E5EA;">    kind: </span><span style="color:#E7C58C;">&#39;approval&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    runId: string; </span><span style="color:#80858F;">// the run to answer with approve_run</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    toolName: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    title: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    body?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    artifacts?: string[];</span></span>
<span class="line"><span style="color:#E3E5EA;">    options?: ApprovalOption[]; </span><span style="color:#80858F;">// the choices to answer with approve_run&#39;s selected</span></span>
<span class="line"><span style="color:#E3E5EA;">    multiple?: boolean; </span><span style="color:#80858F;">// true when several options may be selected</span></span>
<span class="line"><span style="color:#E3E5EA;">    expiresAt: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"><span style="color:#8EA7FF;">type</span><span style="color:#E3E5EA;"> RunToolDispatchWait = { </span><span style="color:#80858F;">// the run waits on the runs it dispatched (get_run only: run_&lt;agent&gt; keeps waiting)</span></span>
<span class="line"><span style="color:#E3E5EA;">    kind: </span><span style="color:#E7C58C;">&#39;dispatch&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    toolName: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    runIds: string[];</span></span>
<span class="line"><span style="color:#E3E5EA;">    expiresAt: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"><span style="color:#8EA7FF;">type</span><span style="color:#E3E5EA;"> RunToolRemoteWait = { </span><span style="color:#80858F;">// a remote agent&#39;s stand-in (runId, agent) waits on its run at a peer</span></span>
<span class="line"><span style="color:#E3E5EA;">    kind: </span><span style="color:#E7C58C;">&#39;remote&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#E3E5EA;">    runId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    peer: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    remoteAgent: string; </span><span style="color:#80858F;">// the agent&#39;s name at the peer</span></span>
<span class="line"><span style="color:#E3E5EA;">    remoteRunId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    expiresAt: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    approval?: { runId: string; approvalId: string; title: string; url?: string }; </span><span style="color:#80858F;">// pending at the peer, answered there (url), never with approve_run</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"><span style="color:#8EA7FF;">type</span><span style="color:#E3E5EA;"> ApproveBody = { </span><span style="color:#80858F;">// POST /runs/:id/approve; approve_run takes the same fields plus runId</span></span>
<span class="line"><span style="color:#E3E5EA;">    approvalId: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    approved: boolean;</span></span>
<span class="line"><span style="color:#E3E5EA;">    reason?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    selected?: string[]; </span><span style="color:#80858F;">// the chosen option ids of a wait point with options, none on a denial</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div><p><code>GET /runs</code> takes <code>filter[parent]=&lt;run id&gt;</code> (once, else 400 <code>filter[parent] takes one run id.</code>) next to <code>filter[agent]</code>, <code>filter[status]</code>, <code>filter[waiting]</code> (<code>approval</code> or <code>dispatch</code>, once, else 400 <code>filter[waiting] takes approval or dispatch.</code>; the wait point&#39;s kind) and <code>filter[createdAt]</code> (an inclusive <code>gte</code>/<code>lte</code> bound per ISO 8601 instant, see <a href="/guide/http">HTTP</a>): the runs whose <code>parentRunId</code> it is, under the same read rule (an agent-scoped reader adds <code>filter[agent]</code>). Runs carry <code>parentRunId</code> and <code>subtreeUsage</code> when set; <code>POST /runs/:id/approve</code> answers a run waiting on dispatched runs with 409 <code>invalid_run_state</code>, and <code>approve_run</code> refuses it.</p><p><code>selected</code> follows <code>engine.approve()</code>&#39;s rules (see <a href="/guide/approvals">Approvals</a> and <a href="/guide/http">HTTP</a>): a selection that does not fit the wait point is <code>400 validation_error</code>.</p><p><code>GET /agents</code> answers <code>{ data: AgentSummary[], issues: AgentIssue[] }</code>, <code>GET /schedules</code> <code>{ data: ScheduleSummary[] }</code>:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#80858F;">/** An agent as \`GET /agents\` lists it. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AgentSummary = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    name: string;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The agent&#39;s \`kind\`: \`simple\` for a simple agent (defineSimpleAgent()),</span></span>
<span class="line"><span style="color:#80858F;">     * \`remote\` for one a peer runs (defineRemoteAgent()), else \`model\`.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    kind: </span><span style="color:#E7C58C;">&#39;model&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;simple&#39;</span><span style="color:#E3E5EA;"> | </span><span style="color:#E7C58C;">&#39;remote&#39;</span><span style="color:#E3E5EA;">;</span></span>
<span class="line"><span style="color:#80858F;">    /**</span></span>
<span class="line"><span style="color:#80858F;">     * The agent&#39;s subscriptions: the channel name and the subscription id;</span></span>
<span class="line"><span style="color:#80858F;">     * \`hook\` is the ready-made path of a subscription to a webhook channel</span></span>
<span class="line"><span style="color:#80858F;">     * this app mounts.</span></span>
<span class="line"><span style="color:#80858F;">     */</span></span>
<span class="line"><span style="color:#E3E5EA;">    channels: Array&lt;{</span></span>
<span class="line"><span style="color:#E3E5EA;">        channel: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">        id: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">        hook?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    }&gt;;</span></span>
<span class="line"><span style="color:#E3E5EA;">    budget: Budget;</span></span>
<span class="line"><span style="color:#80858F;">    /** Declared state collections. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    state: string[];</span></span>
<span class="line"><span style="color:#80858F;">    /** A private agent: reading its runs and state needs \`chamvi_agent_read\` for it. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    private: boolean;</span></span>
<span class="line"><span style="color:#80858F;">    /** A remote agent only: the peer that runs it and the agent&#39;s name there. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    remote?: {</span></span>
<span class="line"><span style="color:#E3E5EA;">        peer: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">        agent: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    };</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** An agent that failed to load, as \`GET /agents\` lists it next to the agents. */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> AgentIssue = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    message: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    at: Date;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#80858F;">/** A cron subscription as \`GET /schedules\` lists it (definitions only, not scheduler health). */</span></span>
<span class="line"><span style="color:#8EA7FF;">export</span><span style="color:#8EA7FF;"> type</span><span style="color:#E3E5EA;"> ScheduleSummary = {</span></span>
<span class="line"><span style="color:#E3E5EA;">    agent: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The cron channel&#39;s name. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    channel: string;</span></span>
<span class="line"><span style="color:#80858F;">    /** The subscription id. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    trigger: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    expression: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    timezone?: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">    overlap: ScheduleOverlap;</span></span>
<span class="line"><span style="color:#80858F;">    /** ISO time of the next fire after now. */</span></span>
<span class="line"><span style="color:#E3E5EA;">    nextAt: string;</span></span>
<span class="line"><span style="color:#E3E5EA;">};</span></span></code></pre></div>`,43)])])}const h=n(l,[["render",p]]);export{y as __pageData,h as default};
