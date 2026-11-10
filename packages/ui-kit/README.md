# @chamvi/ui-kit

The shared base of the chamvi dashboard (`@chamvi/ui`) and its `*-ui` pages: the API client, the session, the shell pieces, the connection components and the page bootstrap.

Vue, vue-router and the vuecs packages are peer dependencies. A page bundles the kit at build time, so nothing but the built page reaches the app.

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

## License

Apache-2.0
