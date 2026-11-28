<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="chamvi" width="96" height="96" />
</p>

<h1 align="center">@chamvi/core-kit</h1>

<p align="center">
    <b>chamvi's domain records, shared by server and clients.</b>
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/core-kit"><img src="https://img.shields.io/npm/v/@chamvi/core-kit" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/core-kit/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/core-kit" alt="License" /></a>
</p>

---

## Installation

```bash
npm install @chamvi/core-kit
```

The package is browser-safe and depends only on `@chamvi/access` (for the `Invoker` grant types and `MeView`'s identity). `Checkpoint` and `ConversationSnapshot` hold AI SDK `ModelMessage`s: `ai` is an optional peer dependency, needed for those types only.

## Domains

One folder per domain under `src/domains/`, each with its record types and, where it has them, constants and helpers.

| Domain | Exports |
|--------|---------|
| `account` | `MeView` |
| `agent` | `AgentSummary`, `AgentIssue`, `ScheduleSummary`, `ScheduleOverlap` |
| `agent-revision` | `AgentRevision`, `AgentRevisionRecord` |
| `approval` | `ApprovalOption` |
| `artifact` | `Artifact`, `ArtifactInput`, `ArtifactRecord` |
| `authorization` | `AuthorizationCheckView` |
| `checkpoint` | `Checkpoint`, `CheckpointRecord` |
| `component` | `ComponentView` |
| `connection` | `Connection`, `ConnectionInput`, `ConnectionRecord`, `ConnectionEntryRecord`, `ConnectionSecretRecord`, `ConnectionStatus`, `ConnectionState`, `ConnectionWidget` and the connection views and bodies (`ConnectionView`, `ConnectionTypeView`, `ConnectionSettingsView`, `ConnectionSaveBody`, `ConnectionCreateBody`, ...) |
| `conversation` | `ConversationIdentity`, `ConversationScope`, `ConversationBinding`, `ConversationItem`, `ConversationNote`, `ConversationNoteSource`, `ConversationNoteOperation`, `ConversationSnapshot`, the `Conversation*Record` rows, `CONVERSATION_ITEM_STORED_ORDER` |
| `effect` | `EffectRecord` |
| `idempotency` | `IdempotencyKey` |
| `limit` | `LimitUse` |
| `lock` | `Lock` |
| `peer` | `PeerStartInput`, `PeerRunView` |
| `run` | `Run`, `RunView`, `InvokerView`, `RunStatus`, `RunStatusLiteral`, `Usage`, `Budget`, `RunTaint`, the `WaitPoint`s, `RemoteApproval`, `normalizeWaitPoint()` |
| `state` | `StateEntry`, `StateDocument` |
| `step` | `Step`, `StepRecord`, `STEP_STORED_ORDER` |
| `trigger` | `TriggerEnvelope`, `Invoker`, `TriggerParent` (`DispatchParent`, `PeerParent`), `TriggerSource`, `normalizeEnvelope()` |
| `ui-page` | `UiPage` |

`normalizeEnvelope()` and `normalizeWaitPoint()` read a legacy stored envelope or wait point back in the current shape. The repository ports over these records live in `@chamvi/store`.

## License

Made with 💚

Published under [Apache License 2.0](./LICENSE).
