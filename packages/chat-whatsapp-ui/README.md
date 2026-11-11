<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/chat-whatsapp-ui" width="128" height="128" />
</p>

<h1 align="center">@chamvi/chat-whatsapp-ui</h1>

<p align="center">
    <b>WhatsApp pairing in the chamvi dashboard.</b><br>
    The live pairing QR and session status of a `whatsappModule()` connection.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/chat-whatsapp-ui"><img src="https://img.shields.io/npm/v/@chamvi/chat-whatsapp-ui" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/chat-whatsapp-ui/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/chat-whatsapp-ui" alt="License" /></a>
</p>

---

## Installation

```bash
npm install @chamvi/chat-whatsapp-ui @chamvi/chat-whatsapp @chamvi/ui @chamvi/app --save
```

ESM only, Node.js `>=26.0.0`. `@chamvi/app` is an optional peer dependency of the `/module` entry. The page is prebuilt: it ships no runtime dependency of its own.

## Usage

```typescript
import { createApp } from '@chamvi/app';
import { whatsappModule } from '@chamvi/chat-whatsapp/module';
import { chatWhatsappUiModule } from '@chamvi/chat-whatsapp-ui/module';
import { uiModule } from '@chamvi/ui/module';

export const app = createApp({
    modules: [uiModule(), whatsappModule({ connection: 'whatsapp', account: 'assistant', state, policy, resolveInvoker }), chatWhatsappUiModule()],
});
```

WhatsApp appears in the dashboard's sidebar and is served at `<uiBase>/ext/chat-whatsapp`. Viewing needs `chamvi_connection_read`, saving `chamvi_connection_write` for the connection named by `connection`. Pairing and re-pairing need this page: `@chamvi/ui` shows no QR. Saved values take effect at the next start.

## Options

| Option | Default | |
|---|---|---|
| `uiBase` | `'/ui'` | The dashboard's path; set it to the value given to `uiModule({ basePath })` |

See [Dashboard](https://chamvi.dev/guide/ui#connection-pages) for the field states and permissions.

## License

Published under [Apache License 2.0](./LICENSE).
