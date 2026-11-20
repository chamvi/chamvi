# Changelog

## [0.10.0](https://github.com/chamvi/chamvi/compare/v0.9.0...v0.10.0) (2026-11-20)


### ⚠ BREAKING CHANGES

* identify connection rows by generation and refuse stale saves ([#243](https://github.com/chamvi/chamvi/issues/243))

### Features

* identify connection rows by generation and refuse stale saves ([#243](https://github.com/chamvi/chamvi/issues/243)) ([5f14b6c](https://github.com/chamvi/chamvi/commit/5f14b6c564227231fefe62eb154fbb2e69bffb22))
* switch the brand to the Cobalt palette and Geist ([396a5ca](https://github.com/chamvi/chamvi/commit/396a5caa1dcc428d1eecd68a763077c23dc3d3bd))


### Bug Fixes

* **deps:** bump authup to 1.0.0-beta.76 ([#244](https://github.com/chamvi/chamvi/issues/244)) ([4a04438](https://github.com/chamvi/chamvi/commit/4a04438a9cda88bfbd37ae07ad5eedc3f566b25f))
* **deps:** bump the minorandpatch group across 1 directory with 34 updates ([#258](https://github.com/chamvi/chamvi/issues/258)) ([50866c4](https://github.com/chamvi/chamvi/commit/50866c4e5bab2152f8e6cf7c84ba80ca17833689))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/access bumped from ^0.9.0 to ^0.10.0
    * @chamvi/core bumped from ^0.9.0 to ^0.10.0
    * @chamvi/http bumped from ^0.9.0 to ^0.10.0
    * @chamvi/http-kit bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store bumped from ^0.9.0 to ^0.10.0
  * peerDependencies
    * @chamvi/access bumped from ^0.9.0 to ^0.10.0
    * @chamvi/core bumped from ^0.9.0 to ^0.10.0
    * @chamvi/http bumped from ^0.9.0 to ^0.10.0
    * @chamvi/http-kit bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store bumped from ^0.9.0 to ^0.10.0

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


### ⚠ BREAKING CHANGES

* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237))
* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236))
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217))
* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214))
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205))
* **app,ui-kit:** the token format in `CHAMVI_TOKENS` and `chamvi.json`.
* **github-ui,chat-discord-ui,chat-whatsapp-ui:** an app using `whatsappModule()` must add `chatWhatsappUiModule()` to pair or re-pair.

### Features

* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214)) ([9bb9619](https://github.com/chamvi/chamvi/commit/9bb961913855b0dca5298f21affda2acf774a0af))
* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **app,ui-kit:** configure tokens as permission bindings ([#204](https://github.com/chamvi/chamvi/issues/204)) ([b715aa5](https://github.com/chamvi/chamvi/commit/b715aa55588097506ba062a4fb9d89999ced5400))
* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236)) ([ac9cc0b](https://github.com/chamvi/chamvi/commit/ac9cc0b80d1ef1e065694caa4b0379a7f8b3c4ea))
* **github-ui,chat-discord-ui,chat-whatsapp-ui:** add provider pages ([#191](https://github.com/chamvi/chamvi/issues/191)) ([be7f7c0](https://github.com/chamvi/chamvi/commit/be7f7c0c2dda8efc2a6af1abd68f407c2316c202))
* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237)) ([3b4054a](https://github.com/chamvi/chamvi/commit/3b4054a090144d6e4c43cbc5d06061735eeee275))
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217)) ([708791a](https://github.com/chamvi/chamvi/commit/708791ac34ef3d51fd92f34dc7716fc9cbcebbc2))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))
* **tool-mail-ui,tool-calendar-ui:** add the mail and calendar pages ([#190](https://github.com/chamvi/chamvi/issues/190)) ([5d43bb9](https://github.com/chamvi/chamvi/commit/5d43bb9442f3735c130489220391c1f3cd14dc5d))
* **ui,ui-kit:** add the package sidebar and provider page serving ([#189](https://github.com/chamvi/chamvi/issues/189)) ([cafc140](https://github.com/chamvi/chamvi/commit/cafc1408a48bc9376e3dc3fbaecb693ecae8e191))
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205)) ([3611193](https://github.com/chamvi/chamvi/commit/361119317a7e9eff10a05c3cad997c7163285654))


### Bug Fixes

* close the 0.9.0 release review findings ([#240](https://github.com/chamvi/chamvi/issues/240)) ([ab400cd](https://github.com/chamvi/chamvi/commit/ab400cd55d185bd294f8c6ccc734a789b09b3397))
* **deps:** bump authup packages to 1.0.0-beta.74 ([1d7d6bd](https://github.com/chamvi/chamvi/commit/1d7d6bd7c00f759efb70513e42894d205ce3090e))
* keep env secrets from stored accounts and close audit findings ([#198](https://github.com/chamvi/chamvi/issues/198)) ([f717a57](https://github.com/chamvi/chamvi/commit/f717a57725b2b532b1c3e4746b5a3fbd4c49e197))
* **ui-kit:** fail a request the API does not answer in time ([#219](https://github.com/chamvi/chamvi/issues/219)) ([eb3ec8c](https://github.com/chamvi/chamvi/commit/eb3ec8c3500b8fcd44069c8b9ef745e559e5afc5))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/access bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http-kit bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/access bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http-kit bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
