# Compared with Other Runtimes

Other tools also make agent runs durable. They differ in where the runs live and in how much of the agent-specific work (tool side effects, approvals, who may call which tool) they take off your hands. As of October 2026, going by each project's own docs:

| | chamvi | [Workflow DevKit][wf] + `WorkflowAgent` | [Mastra][mastra] | [Inngest][inngest] | [Trigger.dev][trigger] |
|---|---|---|---|---|---|
| **Runs in** | Your Node process, one PostgreSQL database | Your process with the Postgres World (a reference implementation), or Vercel | Your process or a Mastra server, with a storage adapter | The Inngest server, which calls your app's endpoint | The Trigger.dev platform (cloud, or self-hosted with Postgres, Redis, ClickHouse and more) |
| **Checkpoint per LLM and tool step** | Yes | LLM calls; tools only when marked `"use step"` | Durable agents (beta) resume from a snapshot, per step only when enabled | Yes, with `step.ai` | No, a retry restarts the task; waits are snapshotted |
| **Tool side effects after a crash** | Recorded per effect key, `alreadyApplied` checks the remote system | Completed steps memoized; pass `stepId` to the API | May run twice, unless on the Inngest runner | Completed steps memoized; pass a stable key | Repeat in the parent task; child tasks deduped |
| **Approval that waits for days** | `await approve(ctx, { title })` inside the tool, durable across restarts; approver needs `agent:<name>:approve` | Hook tokens, which are not credentials; your route authorizes | Resume by `runId` and `toolCallId` | `waitForEvent` with a timeout | Wait tokens |
| **Deduplicated intake** | Per agent, channel and caller, 7 days | A pattern you build with hooks | Not documented | Yes, 24 hours | Yes, 30 days by default |
| **One run at a time per key** | `concurrencyKey` | Not documented | Not documented | `concurrency.key` | `concurrencyKey` |
| **Cron across replicas** | Once per tick, overlap `skip`, `queue-one` or `allow` | No cron | Yes, overlap not documented | Yes, overlap through concurrency settings | Yes, no skip-if-running policy |
| **Agents as an MCP server** | `/mcp`, one `run_<agent>` tool per agent | No | `MCPServer` | No | No (its MCP server is developer tooling) |
| **Tools restricted per caller** | `requireToolPermission()` reads the run's invoker | No | Tool-level checks are Enterprise | No | No |
| **License** | Apache-2.0 | Apache-2.0 | Apache-2.0, `ee/` source-available | Server SSPL (delayed Apache-2.0) | Apache-2.0 |

Pick one of the others when you want what chamvi does not have yet: a hosted service, a hosted run dashboard, or Mastra's evals. Pick chamvi when the agent lives next to your app and its database, and when a webhook that fires twice must not post twice.

[wf]: https://workflow-sdk.dev/docs/ai/human-in-the-loop
[mastra]: https://mastra.ai/docs/long-running-agents/durable-agents
[inngest]: https://www.inngest.com/docs/self-hosting
[trigger]: https://trigger.dev/docs/how-it-works
