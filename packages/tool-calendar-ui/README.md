<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/tool-calendar-ui" width="128" height="128" />
</p>

<h1 align="center">@chamvi/tool-calendar-ui</h1>

<p align="center">
    <b>Calendar accounts in the chamvi dashboard.</b><br>
    Add, test and remove CalDAV accounts for the read-only calendar tools.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/tool-calendar-ui"><img src="https://img.shields.io/npm/v/@chamvi/tool-calendar-ui" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/tool-calendar-ui/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/tool-calendar-ui" alt="License" /></a>
</p>

---

## Installation

```bash
npm install @chamvi/tool-calendar-ui @chamvi/tool-calendar @chamvi/ui @chamvi/app --save
```

ESM only, Node.js `>=26.0.0`. `@chamvi/app` is an optional peer dependency of the `/module` entry. The page is prebuilt: it ships no runtime dependency of its own.

## Usage

```typescript
import { createApp } from '@chamvi/app';
import { toolCalendarModule } from '@chamvi/tool-calendar/module';
import { toolCalendarUiModule } from '@chamvi/tool-calendar-ui/module';
import { uiModule } from '@chamvi/ui/module';

export const app = createApp({
    modules: [uiModule(), toolCalendarModule(), toolCalendarUiModule()],
});
```

Calendar appears in the dashboard's sidebar and is served at `<uiBase>/ext/tool-calendar`. Viewing needs `chamvi_connection_read`, saving `chamvi_connection_write` for the connection `calendar-<account>`; adding an account needs `chamvi_connection_create` for its type. A grant can be restricted to one connection or type by an `attributes` policy over `name` and `type`. Saved values take effect at the next start.

## Options

| Option | Default | |
|---|---|---|
| `uiBase` | `'/ui'` | The dashboard's path; set it to the value given to `uiModule({ basePath })` |

See [Dashboard](https://chamvi.dev/guide/ui#connection-pages) for the field states and permissions.

## License

Published under [Apache License 2.0](./LICENSE).
