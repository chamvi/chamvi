<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/tool-mail-ui" width="128" height="128" />
</p>

<h1 align="center">@chamvi/tool-mail-ui</h1>

<p align="center">
    <b>Mail accounts in the chamvi dashboard.</b><br>
    Add, test and remove IMAP accounts for the read-only mail tools.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/tool-mail-ui"><img src="https://img.shields.io/npm/v/@chamvi/tool-mail-ui" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/tool-mail-ui/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/tool-mail-ui" alt="License" /></a>
</p>

---

## Installation

```bash
npm install @chamvi/tool-mail-ui @chamvi/tool-mail @chamvi/ui @chamvi/app --save
```

ESM only, Node.js `>=26.0.0`. `@chamvi/app` is an optional peer dependency of the `/module` entry. The page is prebuilt: it ships no runtime dependency of its own.

## Usage

```typescript
import { createApp } from '@chamvi/app';
import { toolMailModule } from '@chamvi/tool-mail/module';
import { toolMailUiModule } from '@chamvi/tool-mail-ui/module';
import { uiModule } from '@chamvi/ui/module';

export const app = createApp({
    modules: [uiModule(), toolMailModule(), toolMailUiModule()],
});
```

Mail appears in the dashboard's sidebar and is served at `<uiBase>/ext/tool-mail`. Viewing needs `connection:<name>:read`, saving `connection:<name>:write` on the connection `mail-<account>`; adding an account needs `connections:create`. Saved values take effect at the next start.

## Options

| Option | Default | |
|---|---|---|
| `uiBase` | `'/ui'` | The dashboard's path; set it to the value given to `uiModule({ basePath })` |

See [Dashboard](https://chamvi.dev/guide/ui#connection-pages) for the field states and permissions.

## License

Published under [Apache License 2.0](./LICENSE).
