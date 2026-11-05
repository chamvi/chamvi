# @chamvi/tool-mail

Read-only mail tools for chamvi agents: search, read and thread mails and extract attachment text over IMAP (Gmail, dovecot, Cyrus, ...), without ever changing a mailbox. The public API of `packages/tool-mail/src/index.ts` and its `/module` entry. See [Mail tools](/guide/tools#mail-tools) for an example.

```bash
npm install @chamvi/tool-mail @chamvi/core ai --save
```

`@chamvi/core` and `ai` are peer dependencies; `@chamvi/app` is an optional peer of `@chamvi/tool-mail/module`.

## mailTools

```ts
function mailTools(options?: MailToolsOptions): ToolSet; // { mail_accounts, mail_search, mail_get, mail_attachment, mail_thread }
function createMailClient(accounts: MailAccount[], options?: MailClientOptions): IMailClient;

const MAIL_REQUEST_ERROR_CODE: 'mail_request';
const MAIL_TIMEOUT_MS: 30_000;
const MAIL_SEARCH_DEFAULT_LIMIT: 20;
const MAIL_SEARCH_MAX_LIMIT: 50;
const MAIL_THREAD_MAX_REFERENCES: 10;
const MAIL_BODY_MAX_CHARS: 50_000;
const MAIL_ATTACHMENT_MAX_CHARS: 20_000;
const MAIL_HTML_MAX_CHARS: 1_000_000;
const MAIL_PDF_MAX_PAGES: 50;
const MAIL_ZIP_PART_MAX_BYTES: 10_485_760;
const MAIL_ZIP_TOTAL_MAX_BYTES: 20_971_520;
const MAIL_OOXML_MAX_SLIDES: 200;
const MAIL_SUBJECT_MAX_CHARS: 1000;
const MAIL_ADDRESSES_MAX_CHARS: 2000;
const MAIL_INVITE_FIELD_MAX_CHARS: 500;
const MAIL_INVITES_MAX: 10;
const MAIL_FETCH_MAX_BYTES: 26_214_400;
```

The tools use `client`, else a client of `accounts`, else the client the module [provided on the engine](#toolmailmodule) (without one, each call fails with `context_not_provided`). Throws `InvalidAgentDefinitionError` for options that are no object, a `client` that is no mail client, an account without `id` (`^[a-z0-9]+(-[a-z0-9]+)*$`), `host`, `user` or `password`, a bad `security`, `port`, `address`, `folders` or `gmail`, a duplicate id, a `timeoutMs` that is no integer from 1 to 2^31 - 1 and a clock without `now()` and `setTimeout()`. No message echoes a value.

| Tool | Input | Result |
|---|---|---|
| `mail_accounts` | none | `MailAccountView[]`: each account with its folders (path, special use) |
| `mail_search` | `account`, `query?`, `folder?`, `from?`, `to?`, `subject?`, `since?`, `before?` (ISO dates), `unread?`, `limit?` (default 20, at most 50) | `MailSearchResult`: summaries newest first, `truncated` when more matched |
| `mail_get` | `id`, `offset?` | `MailMessage`: headers (subject cut at 1 000 characters, address lists at 2 000), the text body (HTML stripped) in pages of 50 000 characters, up to 10 invite summaries, the attachment list |
| `mail_attachment` | `id`, `index`, `offset?` | `MailAttachmentText`: the text of a PDF (the first 50 pages), docx, xlsx, pptx or text file in pages of 20 000 characters; `(text extraction failed)` for a broken file |
| `mail_thread` | `id`, `limit?` | `MailSearchResult`: the other mails of the thread, across the folders and Sent |

- **Read-only.** Folders are opened with `EXAMINE`, never `SELECT`; every body fetch is `BODY.PEEK`, so `\Seen` stays as it is; IDLE is off. The client has no method that writes.
- **Mail ids** are `<account>:<folder>:<uidValidity>:<uid>` (the folder base64url-encoded), issued by the tools. An unknown account, a folder outside the account's folders (refused before it is opened), a changed `UIDVALIDITY` or a missing uid is a `ValidationError` (`mail id is stale, search again`).
- **Folders.** Without `folder`, a search covers `account.folders`, else on Gmail All Mail, else every folder but trash and spam. On Gmail `query` is Gmail search syntax and threads follow `X-GM-THRID`; elsewhere `query` is IMAP full text and threads follow `Message-ID`, `In-Reply-To` and the last 10 `References`.
- **Caps.** A mail above 25 MiB is not fetched (`truncated: true`, headers and attachments only). HTML is cut at 1 000 000 characters before stripping; OOXML parts above 10 MiB are skipped. Attachment bytes are never returned or stored.
- **Errors.** A malformed input is a `ValidationError`; a failed request (login, connection, a timeout after `timeoutMs` on the clock) a `ChamviError` with code `mail_request` and the message `<tool>: <account>: <reason>`, never the server's text or a credential. Both are tool errors the model reads.

Every tool declares `trust: { taint: true }`: a result taints the run.

## toolMailModule

```ts
// @chamvi/tool-mail/module
function toolMailModule(options?: ToolMailModuleOptions): ToolMailModule; // 'chamvi:tool-mail'

type ToolMailModuleOptions = {
    env?: Record<string, string | undefined>; // where CHAMVI_MAIL_* is read, default process.env
    accounts?: MailAccount[];                  // given, CHAMVI_MAIL_ACCOUNTS is not read
};

const TOOL_MAIL_MODULE_NAME: 'chamvi:tool-mail';
const MAIL_ACCOUNTS_VARIABLE: 'CHAMVI_MAIL_ACCOUNTS';
```

| Variable | |
|---|---|
| `CHAMVI_MAIL_ACCOUNTS` | A JSON array of `{ "id"?, "address", "host", "port"?, "security"?, "folders"?, "gmail"? }`; `id` defaults to the address with `@` and `.` as `-` |
| `CHAMVI_MAIL_<ID>_USER` | The account's user, default the address; `<ID>` is the id upper-cased, `-` as `_` |
| `CHAMVI_MAIL_<ID>_PASSWORD` | Required |

Each credential can come from a file instead: `CHAMVI_MAIL_<ID>_PASSWORD_FILE` (one trailing newline trimmed; setting both forms is an error). The variables are read and checked when the factory is called; an error names the variable and index, never a value. Without accounts the module does nothing. In start and job mode and a check it builds one client on the app's clock, provides it on the engine (`injectMailContext(ctx)`) and logs out once the engine drained; migrate mode does nothing.

## Types

```ts
type MailAccount = {
    id: string;
    host: string;
    port?: number;                                // default 993 with tls, else 143
    security?: 'tls' | 'starttls' | 'plain';      // default tls
    user: string;
    password: string;                             // Gmail: an app password
    address?: string;                             // default user
    folders?: string[];                           // the folders searched and read
    gmail?: boolean;                              // default host === 'imap.gmail.com'
};

type MailToolsOptions = {
    accounts?: MailAccount[];
    client?: IMailClient;   // wins over accounts
    clock?: IClock;
    timeoutMs?: number;     // default 30 s per call, connecting included
};

type MailClientOptions = { clock?: IClock; timeoutMs?: number };

interface IMailClient {
    accounts(signal?: AbortSignal): Promise<MailAccountView[]>;
    search(input: MailSearchInput, signal?: AbortSignal): Promise<MailSearchResult>;
    get(id: string, offset?: number, signal?: AbortSignal): Promise<MailMessage>;
    attachment(id: string, index: number, offset?: number, signal?: AbortSignal): Promise<MailAttachmentText>;
    thread(id: string, limit?: number, signal?: AbortSignal): Promise<MailSearchResult>;
    close(): Promise<void>; // logs out of every account
}

function provideMailContext(provider: IContextProvider, client: IMailClient): void;
function injectMailContext(ctx: ToolContext): IMailClient; // ContextNotProvidedError without one
function encodeMailId(parts: MailIdParts): string;
function parseMailId(id: unknown): MailIdParts;            // ValidationError for anything else
```

`MailSummary`, `MailMessage`, `MailAttachmentInfo`, `MailAttachmentText`, `MailAccountView`, `MailFolderView`, `MailSearchInput`, `MailSearchResult` and `MailIdParts` are exported too; the [package README](https://github.com/chamvi/chamvi/tree/master/packages/tool-mail#the-tools) lists their fields.
