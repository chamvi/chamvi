# @chamvi/ui-kit

The shared base of the chamvi dashboard (`@chamvi/ui`) and its `*-ui` pages: the API client, the session, the shell pieces, the connection components and the page bootstrap.

Vue, vue-router and the vuecs packages are peer dependencies. A page bundles the kit at build time, so nothing but the built page reaches the app.

## Installation

```bash
npm install @chamvi/ui-kit --save-dev
```

ESM only. A `*-ui` package bundles the kit; a page is registered with its own `/module` entry over `uiPageModule()` from `@chamvi/app`.

## A page on the kit

```ts
// vite.config.ts
import { definePageConfig } from '@chamvi/ui-kit/vite';

export default definePageConfig({ root: 'app' });
```

```ts
// app/main.ts
import '@chamvi/ui-kit/style.css';
import { mountPage } from '@chamvi/ui-kit';
import App from './App.vue';

await mountPage(App);
```

`definePageConfig` carries the Vue plugin, Tailwind and the Lucide icons as a bundled collection, so a page stays within the dashboard's content security policy: nothing is fetched at runtime.

`mountPage` reads the config block the server injects, installs authup when configured and vuecs, restores the session and provides the app context (`useAppContext()`). A page without a principal goes to the dashboard's login. The dashboard passes `mountPage(App, { router })` for its own routed navigation.

## Permissions

The browser never evaluates a permission. The session asks the server which `chamvi_*` names the principal may attempt (`POST /authorization/check`) on sign-in, on restore and every `VERDICT_REFRESH_MS` (60 s), and keeps the answer:

```ts
const { session } = useAppContext();

session.allowed('chamvi_agent_run'); // reactive inside computed() and templates
session.permissions.value.size;      // the allowed names
```

Nothing is allowed until the first answer arrives, nor after it failed or after sign-out. A verdict is an upper bound: a control it shows can still meet a 403 for one resource, and the route behind it decides.

## License

Apache-2.0
