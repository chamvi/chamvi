:robot: I have created a release *beep* *boop*
---


<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236))
* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214))
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **access,knowledge,http:** the knowledge permission names.

### Features

* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214)) ([9bb9619](https://github.com/chamvi/chamvi/commit/9bb961913855b0dca5298f21affda2acf774a0af))
* **access,knowledge,http:** static knowledge permissions and review follow-ups ([#209](https://github.com/chamvi/chamvi/issues/209)) ([ae17b2e](https://github.com/chamvi/chamvi/commit/ae17b2ea9e1ce1e7eed8b0132ae0bfc78fd67370))
* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236)) ([ac9cc0b](https://github.com/chamvi/chamvi/commit/ac9cc0b80d1ef1e065694caa4b0379a7f8b3c4ea))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236))
* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222))
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217))
* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214))
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **access,knowledge,http:** the knowledge permission names.
* **app,ui-kit:** the token format in `CHAMVI_TOKENS` and `chamvi.json`.
* **github,chat-discord:** the GitHub module id is `chamvi:github:<name>`, so `GITHUB_MODULE_NAME` is no longer a module id, and missing GitHub env no longer throws at the factory.

### Features

* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214)) ([9bb9619](https://github.com/chamvi/chamvi/commit/9bb961913855b0dca5298f21affda2acf774a0af))
* **access,knowledge,http:** static knowledge permissions and review follow-ups ([#209](https://github.com/chamvi/chamvi/issues/209)) ([ae17b2e](https://github.com/chamvi/chamvi/commit/ae17b2ea9e1ce1e7eed8b0132ae0bfc78fd67370))
* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **app,ui-kit:** configure tokens as permission bindings ([#204](https://github.com/chamvi/chamvi/issues/204)) ([b715aa5](https://github.com/chamvi/chamvi/commit/b715aa55588097506ba062a4fb9d89999ced5400))
* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236)) ([ac9cc0b](https://github.com/chamvi/chamvi/commit/ac9cc0b80d1ef1e065694caa4b0379a7f8b3c4ea))
* **github,chat-discord:** configure GitHub and Discord from the store ([#186](https://github.com/chamvi/chamvi/issues/186)) ([0639e06](https://github.com/chamvi/chamvi/commit/0639e065eb7d8482b4607fda7f8ade3fa034a1cb))
* **http,app:** let an app's modules contribute controllers ([#226](https://github.com/chamvi/chamvi/issues/226)) ([40c22ba](https://github.com/chamvi/chamvi/commit/40c22ba5f150ad0a3af05c55c65963f827d7bc63))
* **http,tool-mail,tool-calendar:** add the connection config API ([#185](https://github.com/chamvi/chamvi/issues/185)) ([96b1222](https://github.com/chamvi/chamvi/commit/96b1222171ada44ab5b35b42edd2f0d406789448))
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217)) ([708791a](https://github.com/chamvi/chamvi/commit/708791ac34ef3d51fd92f34dc7716fc9cbcebbc2))
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222)) ([0d0fc35](https://github.com/chamvi/chamvi/commit/0d0fc3515da029944b0f0584e6b4dcbfb4f4f896))
* **http:** read controller routes from @routup/decorators ([#229](https://github.com/chamvi/chamvi/issues/229)) ([91f361e](https://github.com/chamvi/chamvi/commit/91f361edc2e3f980fef37452e2e9661b6477e767))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Bug Fixes

* close the 0.9.0 release review findings ([#240](https://github.com/chamvi/chamvi/issues/240)) ([ab400cd](https://github.com/chamvi/chamvi/commit/ab400cd55d185bd294f8c6ccc734a789b09b3397))
* **deps:** bump authup packages to 1.0.0-beta.74 ([1d7d6bd](https://github.com/chamvi/chamvi/commit/1d7d6bd7c00f759efb70513e42894d205ce3090e))
* **http:** adopt routup decorators 5.1, body 4.1, swagger-ui 5, trapi 2.3 ([#224](https://github.com/chamvi/chamvi/issues/224)) ([556e569](https://github.com/chamvi/chamvi/commit/556e569207610bf2d9317ab830b3d2e5ab6f76bd))
* keep env secrets from stored accounts and close audit findings ([#198](https://github.com/chamvi/chamvi/issues/198)) ([f717a57](https://github.com/chamvi/chamvi/commit/f717a57725b2b532b1c3e4746b5a3fbd4c49e197))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))
* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/access bumped from ^0.8.0 to ^0.9.0
    * @chamvi/channel-cron bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-db bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
  * devDependencies
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236))
* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236)) ([ac9cc0b](https://github.com/chamvi/chamvi/commit/ac9cc0b80d1ef1e065694caa4b0379a7f8b3c4ea))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Bug Fixes

* **deps:** bump the minorandpatch group with 2 updates ([#194](https://github.com/chamvi/chamvi/issues/194)) ([b40ef2a](https://github.com/chamvi/chamvi/commit/b40ef2a018c01209b010805053cf9b730e3b43a7))


### Code Refactoring

* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **app,ui-kit:** the token format in `CHAMVI_TOKENS` and `chamvi.json`.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **app,ui-kit:** configure tokens as permission bindings ([#204](https://github.com/chamvi/chamvi/issues/204)) ([b715aa5](https://github.com/chamvi/chamvi/commit/b715aa55588097506ba062a4fb9d89999ced5400))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Bug Fixes

* harden connection create, tests and static serving ([#201](https://github.com/chamvi/chamvi/issues/201)) ([7f1518f](https://github.com/chamvi/chamvi/commit/7f1518fb9a1e4485960e404a25547fc23531c3c8))


### Code Refactoring

* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222))
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **app,ui-kit:** the token format in `CHAMVI_TOKENS` and `chamvi.json`.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **app,ui-kit:** configure tokens as permission bindings ([#204](https://github.com/chamvi/chamvi/issues/204)) ([b715aa5](https://github.com/chamvi/chamvi/commit/b715aa55588097506ba062a4fb9d89999ced5400))
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222)) ([0d0fc35](https://github.com/chamvi/chamvi/commit/0d0fc3515da029944b0f0584e6b4dcbfb4f4f896))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))
* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222))
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **app,ui-kit:** the token format in `CHAMVI_TOKENS` and `chamvi.json`.
* **github,chat-discord:** the GitHub module id is `chamvi:github:<name>`, so `GITHUB_MODULE_NAME` is no longer a module id, and missing GitHub env no longer throws at the factory.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **app,ui-kit:** configure tokens as permission bindings ([#204](https://github.com/chamvi/chamvi/issues/204)) ([b715aa5](https://github.com/chamvi/chamvi/commit/b715aa55588097506ba062a4fb9d89999ced5400))
* **github,chat-discord:** configure GitHub and Discord from the store ([#186](https://github.com/chamvi/chamvi/issues/186)) ([0639e06](https://github.com/chamvi/chamvi/commit/0639e065eb7d8482b4607fda7f8ade3fa034a1cb))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222)) ([0d0fc35](https://github.com/chamvi/chamvi/commit/0d0fc3515da029944b0f0584e6b4dcbfb4f4f896))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Bug Fixes

* close the 0.9.0 release review findings ([#240](https://github.com/chamvi/chamvi/issues/240)) ([ab400cd](https://github.com/chamvi/chamvi/commit/ab400cd55d185bd294f8c6ccc734a789b09b3397))
* harden connection create, tests and static serving ([#201](https://github.com/chamvi/chamvi/issues/201)) ([7f1518f](https://github.com/chamvi/chamvi/commit/7f1518fb9a1e4485960e404a25547fc23531c3c8))
* keep env secrets from stored accounts and close audit findings ([#198](https://github.com/chamvi/chamvi/issues/198)) ([f717a57](https://github.com/chamvi/chamvi/commit/f717a57725b2b532b1c3e4746b5a3fbd4c49e197))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))
* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/channel-cron bumped from ^0.8.0 to ^0.9.0
    * @chamvi/chat bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/chat bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237))
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217))
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205))
* **github-ui,chat-discord-ui,chat-whatsapp-ui:** an app using `whatsappModule()` must add `chatWhatsappUiModule()` to pair or re-pair.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **github-ui,chat-discord-ui,chat-whatsapp-ui:** add provider pages ([#191](https://github.com/chamvi/chamvi/issues/191)) ([be7f7c0](https://github.com/chamvi/chamvi/commit/be7f7c0c2dda8efc2a6af1abd68f407c2316c202))
* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237)) ([3b4054a](https://github.com/chamvi/chamvi/commit/3b4054a090144d6e4c43cbc5d06061735eeee275))
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217)) ([708791a](https://github.com/chamvi/chamvi/commit/708791ac34ef3d51fd92f34dc7716fc9cbcebbc2))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205)) ([3611193](https://github.com/chamvi/chamvi/commit/361119317a7e9eff10a05c3cad997c7163285654))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http-kit bumped from ^0.8.0 to ^0.9.0
    * @chamvi/ui-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **app,ui-kit:** the token format in `CHAMVI_TOKENS` and `chamvi.json`.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **app,ui-kit:** configure tokens as permission bindings ([#204](https://github.com/chamvi/chamvi/issues/204)) ([b715aa5](https://github.com/chamvi/chamvi/commit/b715aa55588097506ba062a4fb9d89999ced5400))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Bug Fixes

* **chat-whatsapp:** keep libsignal's session logs out of the console ([#216](https://github.com/chamvi/chamvi/issues/216)) ([730e75c](https://github.com/chamvi/chamvi/commit/730e75c6762fce3929646ea8d34474eafadace58))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))
* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/chat bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-db bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/chat bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237))
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217))
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205))
* **github-ui,chat-discord-ui,chat-whatsapp-ui:** an app using `whatsappModule()` must add `chatWhatsappUiModule()` to pair or re-pair.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **github-ui,chat-discord-ui,chat-whatsapp-ui:** add provider pages ([#191](https://github.com/chamvi/chamvi/issues/191)) ([be7f7c0](https://github.com/chamvi/chamvi/commit/be7f7c0c2dda8efc2a6af1abd68f407c2316c202))
* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237)) ([3b4054a](https://github.com/chamvi/chamvi/commit/3b4054a090144d6e4c43cbc5d06061735eeee275))
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217)) ([708791a](https://github.com/chamvi/chamvi/commit/708791ac34ef3d51fd92f34dc7716fc9cbcebbc2))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205)) ([3611193](https://github.com/chamvi/chamvi/commit/361119317a7e9eff10a05c3cad997c7163285654))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http-kit bumped from ^0.8.0 to ^0.9.0
    * @chamvi/ui bumped from ^0.8.0 to ^0.9.0
    * @chamvi/ui-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236))
* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **cli:** load decorated TypeScript entries ([#225](https://github.com/chamvi/chamvi/issues/225))
* **app,ui-kit:** the token format in `CHAMVI_TOKENS` and `chamvi.json`.
* **github,chat-discord:** the GitHub module id is `chamvi:github:<name>`, so `GITHUB_MODULE_NAME` is no longer a module id, and missing GitHub env no longer throws at the factory.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **app,ui-kit:** configure tokens as permission bindings ([#204](https://github.com/chamvi/chamvi/issues/204)) ([b715aa5](https://github.com/chamvi/chamvi/commit/b715aa55588097506ba062a4fb9d89999ced5400))
* **cli:** load decorated TypeScript entries ([#225](https://github.com/chamvi/chamvi/issues/225)) ([27556d7](https://github.com/chamvi/chamvi/commit/27556d7256d068480387b87e8de2dbaed29550a0))
* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236)) ([ac9cc0b](https://github.com/chamvi/chamvi/commit/ac9cc0b80d1ef1e065694caa4b0379a7f8b3c4ea))
* **github,chat-discord:** configure GitHub and Discord from the store ([#186](https://github.com/chamvi/chamvi/issues/186)) ([0639e06](https://github.com/chamvi/chamvi/commit/0639e065eb7d8482b4607fda7f8ade3fa034a1cb))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Code Refactoring

* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/store-db bumped from ^0.8.0 to ^0.9.0
  * devDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/github bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/sandbox bumped from ^0.8.0 to ^0.9.0
    * @chamvi/sandbox-local bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/sandbox bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236))
* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214))
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **access,knowledge,http:** the knowledge permission names.
* **core,http:** permission names and the shape of `permissions` on principals, invokers, static tokens and the `oidc()` mapper.

### Features

* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214)) ([9bb9619](https://github.com/chamvi/chamvi/commit/9bb961913855b0dca5298f21affda2acf774a0af))
* **access,knowledge,http:** static knowledge permissions and review follow-ups ([#209](https://github.com/chamvi/chamvi/issues/209)) ([ae17b2e](https://github.com/chamvi/chamvi/commit/ae17b2ea9e1ce1e7eed8b0132ae0bfc78fd67370))
* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236)) ([ac9cc0b](https://github.com/chamvi/chamvi/commit/ac9cc0b80d1ef1e065694caa4b0379a7f8b3c4ea))
* **core,http:** check static permissions with authup policies ([#203](https://github.com/chamvi/chamvi/issues/203)) ([f66a41f](https://github.com/chamvi/chamvi/commit/f66a41f08f6050024209ab307b0805b204ff9d93))
* **core,store-db:** store connection settings and sealed secrets ([#192](https://github.com/chamvi/chamvi/issues/192)) ([21ab44f](https://github.com/chamvi/chamvi/commit/21ab44f3b2034fb42ac515eb2d930826d1ce10ba))
* **http,tool-mail,tool-calendar:** add the connection config API ([#185](https://github.com/chamvi/chamvi/issues/185)) ([96b1222](https://github.com/chamvi/chamvi/commit/96b1222171ada44ab5b35b42edd2f0d406789448))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))
* **tool-files:** process run artifacts in memory ([#172](https://github.com/chamvi/chamvi/issues/172)) ([1dc2b29](https://github.com/chamvi/chamvi/commit/1dc2b2926ad15281ac82eed7b7a8d14a179dc810))
* **tool-utils:** add utility tools for time, dates and arithmetic ([#182](https://github.com/chamvi/chamvi/issues/182)) ([e071f4b](https://github.com/chamvi/chamvi/commit/e071f4b1d4aef7f4fd6122be7246b74aa03f91b5))


### Bug Fixes

* close the 0.9.0 release review findings ([#240](https://github.com/chamvi/chamvi/issues/240)) ([ab400cd](https://github.com/chamvi/chamvi/commit/ab400cd55d185bd294f8c6ccc734a789b09b3397))
* **core,http:** bind a dispatched run to the agent revision its check saw ([#213](https://github.com/chamvi/chamvi/issues/213)) ([2479f77](https://github.com/chamvi/chamvi/commit/2479f77a854b469002b65b128502e6001579582d))
* harden connection create, tests and static serving ([#201](https://github.com/chamvi/chamvi/issues/201)) ([7f1518f](https://github.com/chamvi/chamvi/commit/7f1518fb9a1e4485960e404a25547fc23531c3c8))
* keep env secrets from stored accounts and close audit findings ([#198](https://github.com/chamvi/chamvi/issues/198)) ([f717a57](https://github.com/chamvi/chamvi/commit/f717a57725b2b532b1c3e4746b5a3fbd4c49e197))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))
* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/access bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
  * devDependencies
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222))
* **app,ui-kit:** the token format in `CHAMVI_TOKENS` and `chamvi.json`.
* **github-ui,chat-discord-ui,chat-whatsapp-ui:** an app using `whatsappModule()` must add `chatWhatsappUiModule()` to pair or re-pair.
* **github,chat-discord:** the GitHub module id is `chamvi:github:<name>`, so `GITHUB_MODULE_NAME` is no longer a module id, and missing GitHub env no longer throws at the factory.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **app,ui-kit:** configure tokens as permission bindings ([#204](https://github.com/chamvi/chamvi/issues/204)) ([b715aa5](https://github.com/chamvi/chamvi/commit/b715aa55588097506ba062a4fb9d89999ced5400))
* **github-ui,chat-discord-ui,chat-whatsapp-ui:** add provider pages ([#191](https://github.com/chamvi/chamvi/issues/191)) ([be7f7c0](https://github.com/chamvi/chamvi/commit/be7f7c0c2dda8efc2a6af1abd68f407c2316c202))
* **github,chat-discord:** configure GitHub and Discord from the store ([#186](https://github.com/chamvi/chamvi/issues/186)) ([0639e06](https://github.com/chamvi/chamvi/commit/0639e065eb7d8482b4607fda7f8ade3fa034a1cb))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222)) ([0d0fc35](https://github.com/chamvi/chamvi/commit/0d0fc3515da029944b0f0584e6b4dcbfb4f4f896))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Bug Fixes

* close the 0.9.0 release review findings ([#240](https://github.com/chamvi/chamvi/issues/240)) ([ab400cd](https://github.com/chamvi/chamvi/commit/ab400cd55d185bd294f8c6ccc734a789b09b3397))
* harden connection create, tests and static serving ([#201](https://github.com/chamvi/chamvi/issues/201)) ([7f1518f](https://github.com/chamvi/chamvi/commit/7f1518fb9a1e4485960e404a25547fc23531c3c8))
* keep env secrets from stored accounts and close audit findings ([#198](https://github.com/chamvi/chamvi/issues/198)) ([f717a57](https://github.com/chamvi/chamvi/commit/f717a57725b2b532b1c3e4746b5a3fbd4c49e197))


### Code Refactoring

* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237))
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217))
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205))
* **github-ui,chat-discord-ui,chat-whatsapp-ui:** an app using `whatsappModule()` must add `chatWhatsappUiModule()` to pair or re-pair.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **github-ui,chat-discord-ui,chat-whatsapp-ui:** add provider pages ([#191](https://github.com/chamvi/chamvi/issues/191)) ([be7f7c0](https://github.com/chamvi/chamvi/commit/be7f7c0c2dda8efc2a6af1abd68f407c2316c202))
* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237)) ([3b4054a](https://github.com/chamvi/chamvi/commit/3b4054a090144d6e4c43cbc5d06061735eeee275))
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217)) ([708791a](https://github.com/chamvi/chamvi/commit/708791ac34ef3d51fd92f34dc7716fc9cbcebbc2))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205)) ([3611193](https://github.com/chamvi/chamvi/commit/361119317a7e9eff10a05c3cad997c7163285654))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http-kit bumped from ^0.8.0 to ^0.9.0
    * @chamvi/ui-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236))
* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222))
* **http:** serve the REST API from controllers over services ([#220](https://github.com/chamvi/chamvi/issues/220))
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217))
* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214))
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **access,knowledge,http:** the knowledge permission names.
* **core,http:** permission names and the shape of `permissions` on principals, invokers, static tokens and the `oidc()` mapper.

### Features

* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214)) ([9bb9619](https://github.com/chamvi/chamvi/commit/9bb961913855b0dca5298f21affda2acf774a0af))
* **access,knowledge,http:** static knowledge permissions and review follow-ups ([#209](https://github.com/chamvi/chamvi/issues/209)) ([ae17b2e](https://github.com/chamvi/chamvi/commit/ae17b2ea9e1ce1e7eed8b0132ae0bfc78fd67370))
* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236)) ([ac9cc0b](https://github.com/chamvi/chamvi/commit/ac9cc0b80d1ef1e065694caa4b0379a7f8b3c4ea))
* **core,http:** check static permissions with authup policies ([#203](https://github.com/chamvi/chamvi/issues/203)) ([f66a41f](https://github.com/chamvi/chamvi/commit/f66a41f08f6050024209ab307b0805b204ff9d93))
* **http,app:** let an app's modules contribute controllers ([#226](https://github.com/chamvi/chamvi/issues/226)) ([40c22ba](https://github.com/chamvi/chamvi/commit/40c22ba5f150ad0a3af05c55c65963f827d7bc63))
* **http,tool-mail,tool-calendar:** add the connection config API ([#185](https://github.com/chamvi/chamvi/issues/185)) ([96b1222](https://github.com/chamvi/chamvi/commit/96b1222171ada44ab5b35b42edd2f0d406789448))
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217)) ([708791a](https://github.com/chamvi/chamvi/commit/708791ac34ef3d51fd92f34dc7716fc9cbcebbc2))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222)) ([0d0fc35](https://github.com/chamvi/chamvi/commit/0d0fc3515da029944b0f0584e6b4dcbfb4f4f896))
* **http:** read controller routes from @routup/decorators ([#229](https://github.com/chamvi/chamvi/issues/229)) ([91f361e](https://github.com/chamvi/chamvi/commit/91f361edc2e3f980fef37452e2e9661b6477e767))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))
* **ui,ui-kit:** add the package sidebar and provider page serving ([#189](https://github.com/chamvi/chamvi/issues/189)) ([cafc140](https://github.com/chamvi/chamvi/commit/cafc1408a48bc9376e3dc3fbaecb693ecae8e191))


### Bug Fixes

* close the 0.9.0 release review findings ([#240](https://github.com/chamvi/chamvi/issues/240)) ([ab400cd](https://github.com/chamvi/chamvi/commit/ab400cd55d185bd294f8c6ccc734a789b09b3397))
* **core,http:** bind a dispatched run to the agent revision its check saw ([#213](https://github.com/chamvi/chamvi/issues/213)) ([2479f77](https://github.com/chamvi/chamvi/commit/2479f77a854b469002b65b128502e6001579582d))
* **deps:** bump authup packages to 1.0.0-beta.74 ([1d7d6bd](https://github.com/chamvi/chamvi/commit/1d7d6bd7c00f759efb70513e42894d205ce3090e))
* **deps:** bump the minorandpatch group with 2 updates ([#194](https://github.com/chamvi/chamvi/issues/194)) ([b40ef2a](https://github.com/chamvi/chamvi/commit/b40ef2a018c01209b010805053cf9b730e3b43a7))
* harden connection create, tests and static serving ([#201](https://github.com/chamvi/chamvi/issues/201)) ([7f1518f](https://github.com/chamvi/chamvi/commit/7f1518fb9a1e4485960e404a25547fc23531c3c8))
* **http:** adopt routup decorators 5.1, body 4.1, swagger-ui 5, trapi 2.3 ([#224](https://github.com/chamvi/chamvi/issues/224)) ([556e569](https://github.com/chamvi/chamvi/commit/556e569207610bf2d9317ab830b3d2e5ab6f76bd))
* **http:** send the recommended policy of @routup/swagger-ui 5.1 ([3c179e8](https://github.com/chamvi/chamvi/commit/3c179e84551ba4c0b9c5dcae10c336c00744ede0))
* keep env secrets from stored accounts and close audit findings ([#198](https://github.com/chamvi/chamvi/issues/198)) ([f717a57](https://github.com/chamvi/chamvi/commit/f717a57725b2b532b1c3e4746b5a3fbd4c49e197))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))
* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))
* **http:** serve the REST API from controllers over services ([#220](https://github.com/chamvi/chamvi/issues/220)) ([1c86ed0](https://github.com/chamvi/chamvi/commit/1c86ed0d4727022977d5bcca0a6c48f0d4230196))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/access bumped from ^0.8.0 to ^0.9.0
  * devDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237))

### Features

* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237)) ([3b4054a](https://github.com/chamvi/chamvi/commit/3b4054a090144d6e4c43cbc5d06061735eeee275))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236))
* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222))
* **access,knowledge,http:** the knowledge permission names.
* **app,ui-kit:** the token format in `CHAMVI_TOKENS` and `chamvi.json`.

### Features

* **access,knowledge,http:** static knowledge permissions and review follow-ups ([#209](https://github.com/chamvi/chamvi/issues/209)) ([ae17b2e](https://github.com/chamvi/chamvi/commit/ae17b2ea9e1ce1e7eed8b0132ae0bfc78fd67370))
* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **app,ui-kit:** configure tokens as permission bindings ([#204](https://github.com/chamvi/chamvi/issues/204)) ([b715aa5](https://github.com/chamvi/chamvi/commit/b715aa55588097506ba062a4fb9d89999ced5400))
* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236)) ([ac9cc0b](https://github.com/chamvi/chamvi/commit/ac9cc0b80d1ef1e065694caa4b0379a7f8b3c4ea))
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222)) ([0d0fc35](https://github.com/chamvi/chamvi/commit/0d0fc3515da029944b0f0584e6b4dcbfb4f4f896))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Code Refactoring

* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/access bumped from ^0.8.0 to ^0.9.0
  * devDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Code Refactoring

* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Code Refactoring

* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/coding bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/sandbox bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/sandbox bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Code Refactoring

* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/sandbox bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/sandbox bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Code Refactoring

* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/sandbox bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/sandbox bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.

### Features

* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/access bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **core,store-db:** store connection settings and sealed secrets ([#192](https://github.com/chamvi/chamvi/issues/192)) ([21ab44f](https://github.com/chamvi/chamvi/commit/21ab44f3b2034fb42ac515eb2d930826d1ce10ba))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Bug Fixes

* close the 0.9.0 release review findings ([#240](https://github.com/chamvi/chamvi/issues/240)) ([ab400cd](https://github.com/chamvi/chamvi/commit/ab400cd55d185bd294f8c6ccc734a789b09b3397))
* **core,http:** bind a dispatched run to the agent revision its check saw ([#213](https://github.com/chamvi/chamvi/issues/213)) ([2479f77](https://github.com/chamvi/chamvi/commit/2479f77a854b469002b65b128502e6001579582d))


### Code Refactoring

* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
  * devDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.

### Features

* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Bug Fixes

* **store-memory:** match a list condition with a set lookup ([07c9149](https://github.com/chamvi/chamvi/commit/07c9149326bc222abf28dc4b14a1fe1fd0599908))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **core,store-db:** store connection settings and sealed secrets ([#192](https://github.com/chamvi/chamvi/issues/192)) ([21ab44f](https://github.com/chamvi/chamvi/commit/21ab44f3b2034fb42ac515eb2d930826d1ce10ba))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Bug Fixes

* **core,http:** bind a dispatched run to the agent revision its check saw ([#213](https://github.com/chamvi/chamvi/issues/213)) ([2479f77](https://github.com/chamvi/chamvi/commit/2479f77a854b469002b65b128502e6001579582d))
* harden connection create, tests and static serving ([#201](https://github.com/chamvi/chamvi/issues/201)) ([7f1518f](https://github.com/chamvi/chamvi/commit/7f1518fb9a1e4485960e404a25547fc23531c3c8))


### Code Refactoring

* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
  * devDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222))
* **app,ui-kit:** the token format in `CHAMVI_TOKENS` and `chamvi.json`.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **app,ui-kit:** configure tokens as permission bindings ([#204](https://github.com/chamvi/chamvi/issues/204)) ([b715aa5](https://github.com/chamvi/chamvi/commit/b715aa55588097506ba062a4fb9d89999ced5400))
* **http,tool-mail,tool-calendar:** add the connection config API ([#185](https://github.com/chamvi/chamvi/issues/185)) ([96b1222](https://github.com/chamvi/chamvi/commit/96b1222171ada44ab5b35b42edd2f0d406789448))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222)) ([0d0fc35](https://github.com/chamvi/chamvi/commit/0d0fc3515da029944b0f0584e6b4dcbfb4f4f896))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Bug Fixes

* close the 0.9.0 release review findings ([#240](https://github.com/chamvi/chamvi/issues/240)) ([ab400cd](https://github.com/chamvi/chamvi/commit/ab400cd55d185bd294f8c6ccc734a789b09b3397))
* harden connection create, tests and static serving ([#201](https://github.com/chamvi/chamvi/issues/201)) ([7f1518f](https://github.com/chamvi/chamvi/commit/7f1518fb9a1e4485960e404a25547fc23531c3c8))
* keep env secrets from stored accounts and close audit findings ([#198](https://github.com/chamvi/chamvi/issues/198)) ([f717a57](https://github.com/chamvi/chamvi/commit/f717a57725b2b532b1c3e4746b5a3fbd4c49e197))


### Code Refactoring

* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237))
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205))

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237)) ([3b4054a](https://github.com/chamvi/chamvi/commit/3b4054a090144d6e4c43cbc5d06061735eeee275))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))
* **tool-mail-ui,tool-calendar-ui:** add the mail and calendar pages ([#190](https://github.com/chamvi/chamvi/issues/190)) ([5d43bb9](https://github.com/chamvi/chamvi/commit/5d43bb9442f3735c130489220391c1f3cd14dc5d))
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205)) ([3611193](https://github.com/chamvi/chamvi/commit/361119317a7e9eff10a05c3cad997c7163285654))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http-kit bumped from ^0.8.0 to ^0.9.0
    * @chamvi/ui-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))
* **tool-files:** process run artifacts in memory ([#172](https://github.com/chamvi/chamvi/issues/172)) ([1dc2b29](https://github.com/chamvi/chamvi/commit/1dc2b2926ad15281ac82eed7b7a8d14a179dc810))


### Bug Fixes

* keep env secrets from stored accounts and close audit findings ([#198](https://github.com/chamvi/chamvi/issues/198)) ([f717a57](https://github.com/chamvi/chamvi/commit/f717a57725b2b532b1c3e4746b5a3fbd4c49e197))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222))
* **app,ui-kit:** the token format in `CHAMVI_TOKENS` and `chamvi.json`.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **app,ui-kit:** configure tokens as permission bindings ([#204](https://github.com/chamvi/chamvi/issues/204)) ([b715aa5](https://github.com/chamvi/chamvi/commit/b715aa55588097506ba062a4fb9d89999ced5400))
* **http,tool-mail,tool-calendar:** add the connection config API ([#185](https://github.com/chamvi/chamvi/issues/185)) ([96b1222](https://github.com/chamvi/chamvi/commit/96b1222171ada44ab5b35b42edd2f0d406789448))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222)) ([0d0fc35](https://github.com/chamvi/chamvi/commit/0d0fc3515da029944b0f0584e6b4dcbfb4f4f896))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Bug Fixes

* close the 0.9.0 release review findings ([#240](https://github.com/chamvi/chamvi/issues/240)) ([ab400cd](https://github.com/chamvi/chamvi/commit/ab400cd55d185bd294f8c6ccc734a789b09b3397))
* **deps:** bump the minorandpatch group with 2 updates ([#194](https://github.com/chamvi/chamvi/issues/194)) ([b40ef2a](https://github.com/chamvi/chamvi/commit/b40ef2a018c01209b010805053cf9b730e3b43a7))
* harden connection create, tests and static serving ([#201](https://github.com/chamvi/chamvi/issues/201)) ([7f1518f](https://github.com/chamvi/chamvi/commit/7f1518fb9a1e4485960e404a25547fc23531c3c8))
* keep env secrets from stored accounts and close audit findings ([#198](https://github.com/chamvi/chamvi/issues/198)) ([f717a57](https://github.com/chamvi/chamvi/commit/f717a57725b2b532b1c3e4746b5a3fbd4c49e197))


### Code Refactoring

* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237))
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205))

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237)) ([3b4054a](https://github.com/chamvi/chamvi/commit/3b4054a090144d6e4c43cbc5d06061735eeee275))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))
* **tool-mail-ui,tool-calendar-ui:** add the mail and calendar pages ([#190](https://github.com/chamvi/chamvi/issues/190)) ([5d43bb9](https://github.com/chamvi/chamvi/commit/5d43bb9442f3735c130489220391c1f3cd14dc5d))
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205)) ([3611193](https://github.com/chamvi/chamvi/commit/361119317a7e9eff10a05c3cad997c7163285654))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http-kit bumped from ^0.8.0 to ^0.9.0
    * @chamvi/tool-mail bumped from ^0.8.0 to ^0.9.0
    * @chamvi/ui bumped from ^0.8.0 to ^0.9.0
    * @chamvi/ui-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **app,ui-kit:** the token format in `CHAMVI_TOKENS` and `chamvi.json`.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **app,ui-kit:** configure tokens as permission bindings ([#204](https://github.com/chamvi/chamvi/issues/204)) ([b715aa5](https://github.com/chamvi/chamvi/commit/b715aa55588097506ba062a4fb9d89999ced5400))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))
* **tool-utils:** add utility tools for time, dates and arithmetic ([#182](https://github.com/chamvi/chamvi/issues/182)) ([e071f4b](https://github.com/chamvi/chamvi/commit/e071f4b1d4aef7f4fd6122be7246b74aa03f91b5))


### Bug Fixes

* keep env secrets from stored accounts and close audit findings ([#198](https://github.com/chamvi/chamvi/issues/198)) ([f717a57](https://github.com/chamvi/chamvi/commit/f717a57725b2b532b1c3e4746b5a3fbd4c49e197))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))
* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Code Refactoring

* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237))
* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236))
* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222))
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217))
* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214))
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **access,knowledge,http:** the knowledge permission names.
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205))
* **github-ui,chat-discord-ui,chat-whatsapp-ui:** an app using `whatsappModule()` must add `chatWhatsappUiModule()` to pair or re-pair.

### Features

* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214)) ([9bb9619](https://github.com/chamvi/chamvi/commit/9bb961913855b0dca5298f21affda2acf774a0af))
* **access,knowledge,http:** static knowledge permissions and review follow-ups ([#209](https://github.com/chamvi/chamvi/issues/209)) ([ae17b2e](https://github.com/chamvi/chamvi/commit/ae17b2ea9e1ce1e7eed8b0132ae0bfc78fd67370))
* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236)) ([ac9cc0b](https://github.com/chamvi/chamvi/commit/ac9cc0b80d1ef1e065694caa4b0379a7f8b3c4ea))
* **github-ui,chat-discord-ui,chat-whatsapp-ui:** add provider pages ([#191](https://github.com/chamvi/chamvi/issues/191)) ([be7f7c0](https://github.com/chamvi/chamvi/commit/be7f7c0c2dda8efc2a6af1abd68f407c2316c202))
* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237)) ([3b4054a](https://github.com/chamvi/chamvi/commit/3b4054a090144d6e4c43cbc5d06061735eeee275))
* **http,app:** let an app's modules contribute controllers ([#226](https://github.com/chamvi/chamvi/issues/226)) ([40c22ba](https://github.com/chamvi/chamvi/commit/40c22ba5f150ad0a3af05c55c65963f827d7bc63))
* **http,tool-mail,tool-calendar:** add the connection config API ([#185](https://github.com/chamvi/chamvi/issues/185)) ([96b1222](https://github.com/chamvi/chamvi/commit/96b1222171ada44ab5b35b42edd2f0d406789448))
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217)) ([708791a](https://github.com/chamvi/chamvi/commit/708791ac34ef3d51fd92f34dc7716fc9cbcebbc2))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222)) ([0d0fc35](https://github.com/chamvi/chamvi/commit/0d0fc3515da029944b0f0584e6b4dcbfb4f4f896))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))
* **tool-mail-ui,tool-calendar-ui:** add the mail and calendar pages ([#190](https://github.com/chamvi/chamvi/issues/190)) ([5d43bb9](https://github.com/chamvi/chamvi/commit/5d43bb9442f3735c130489220391c1f3cd14dc5d))
* **ui,ui-kit:** add the package sidebar and provider page serving ([#189](https://github.com/chamvi/chamvi/issues/189)) ([cafc140](https://github.com/chamvi/chamvi/commit/cafc1408a48bc9376e3dc3fbaecb693ecae8e191))
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205)) ([3611193](https://github.com/chamvi/chamvi/commit/361119317a7e9eff10a05c3cad997c7163285654))


### Bug Fixes

* close the 0.9.0 release review findings ([#240](https://github.com/chamvi/chamvi/issues/240)) ([ab400cd](https://github.com/chamvi/chamvi/commit/ab400cd55d185bd294f8c6ccc734a789b09b3397))
* **deps:** bump authup packages to 1.0.0-beta.74 ([1d7d6bd](https://github.com/chamvi/chamvi/commit/1d7d6bd7c00f759efb70513e42894d205ce3090e))
* harden connection create, tests and static serving ([#201](https://github.com/chamvi/chamvi/issues/201)) ([7f1518f](https://github.com/chamvi/chamvi/commit/7f1518fb9a1e4485960e404a25547fc23531c3c8))
* **http:** adopt routup decorators 5.1, body 4.1, swagger-ui 5, trapi 2.3 ([#224](https://github.com/chamvi/chamvi/issues/224)) ([556e569](https://github.com/chamvi/chamvi/commit/556e569207610bf2d9317ab830b3d2e5ab6f76bd))
* keep env secrets from stored accounts and close audit findings ([#198](https://github.com/chamvi/chamvi/issues/198)) ([f717a57](https://github.com/chamvi/chamvi/commit/f717a57725b2b532b1c3e4746b5a3fbd4c49e197))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))
* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/access bumped from ^0.8.0 to ^0.9.0
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/channel-cron bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http-kit bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
    * @chamvi/ui-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

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
</details>

<details><summary>0.9.0</summary>

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


###   BREAKING CHANGES

* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237))
* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236))
* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **cli:** load decorated TypeScript entries ([#225](https://github.com/chamvi/chamvi/issues/225))
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222))
* **http:** serve the REST API from controllers over services ([#220](https://github.com/chamvi/chamvi/issues/220))
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217))
* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214))
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **access,knowledge,http:** the knowledge permission names.
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205))
* **app,ui-kit:** the token format in `CHAMVI_TOKENS` and `chamvi.json`.
* **core,http:** permission names and the shape of `permissions` on principals, invokers, static tokens and the `oidc()` mapper.
* **github-ui,chat-discord-ui,chat-whatsapp-ui:** an app using `whatsappModule()` must add `chatWhatsappUiModule()` to pair or re-pair.
* **github,chat-discord:** the GitHub module id is `chamvi:github:<name>`, so `GITHUB_MODULE_NAME` is no longer a module id, and missing GitHub env no longer throws at the factory.

### Features

* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214)) ([9bb9619](https://github.com/chamvi/chamvi/commit/9bb961913855b0dca5298f21affda2acf774a0af))
* **access,knowledge,http:** static knowledge permissions and review follow-ups ([#209](https://github.com/chamvi/chamvi/issues/209)) ([ae17b2e](https://github.com/chamvi/chamvi/commit/ae17b2ea9e1ce1e7eed8b0132ae0bfc78fd67370))
* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **app,ui-kit:** configure tokens as permission bindings ([#204](https://github.com/chamvi/chamvi/issues/204)) ([b715aa5](https://github.com/chamvi/chamvi/commit/b715aa55588097506ba062a4fb9d89999ced5400))
* **cli:** load decorated TypeScript entries ([#225](https://github.com/chamvi/chamvi/issues/225)) ([27556d7](https://github.com/chamvi/chamvi/commit/27556d7256d068480387b87e8de2dbaed29550a0))
* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236)) ([ac9cc0b](https://github.com/chamvi/chamvi/commit/ac9cc0b80d1ef1e065694caa4b0379a7f8b3c4ea))
* **core,http:** check static permissions with authup policies ([#203](https://github.com/chamvi/chamvi/issues/203)) ([f66a41f](https://github.com/chamvi/chamvi/commit/f66a41f08f6050024209ab307b0805b204ff9d93))
* **core,store-db:** store connection settings and sealed secrets ([#192](https://github.com/chamvi/chamvi/issues/192)) ([21ab44f](https://github.com/chamvi/chamvi/commit/21ab44f3b2034fb42ac515eb2d930826d1ce10ba))
* **github-ui,chat-discord-ui,chat-whatsapp-ui:** add provider pages ([#191](https://github.com/chamvi/chamvi/issues/191)) ([be7f7c0](https://github.com/chamvi/chamvi/commit/be7f7c0c2dda8efc2a6af1abd68f407c2316c202))
* **github,chat-discord:** configure GitHub and Discord from the store ([#186](https://github.com/chamvi/chamvi/issues/186)) ([0639e06](https://github.com/chamvi/chamvi/commit/0639e065eb7d8482b4607fda7f8ade3fa034a1cb))
* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237)) ([3b4054a](https://github.com/chamvi/chamvi/commit/3b4054a090144d6e4c43cbc5d06061735eeee275))
* **http,app:** let an app's modules contribute controllers ([#226](https://github.com/chamvi/chamvi/issues/226)) ([40c22ba](https://github.com/chamvi/chamvi/commit/40c22ba5f150ad0a3af05c55c65963f827d7bc63))
* **http,tool-mail,tool-calendar:** add the connection config API ([#185](https://github.com/chamvi/chamvi/issues/185)) ([96b1222](https://github.com/chamvi/chamvi/commit/96b1222171ada44ab5b35b42edd2f0d406789448))
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217)) ([708791a](https://github.com/chamvi/chamvi/commit/708791ac34ef3d51fd92f34dc7716fc9cbcebbc2))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222)) ([0d0fc35](https://github.com/chamvi/chamvi/commit/0d0fc3515da029944b0f0584e6b4dcbfb4f4f896))
* **http:** read controller routes from @routup/decorators ([#229](https://github.com/chamvi/chamvi/issues/229)) ([91f361e](https://github.com/chamvi/chamvi/commit/91f361edc2e3f980fef37452e2e9661b6477e767))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))
* **tool-files:** process run artifacts in memory ([#172](https://github.com/chamvi/chamvi/issues/172)) ([1dc2b29](https://github.com/chamvi/chamvi/commit/1dc2b2926ad15281ac82eed7b7a8d14a179dc810))
* **tool-mail-ui,tool-calendar-ui:** add the mail and calendar pages ([#190](https://github.com/chamvi/chamvi/issues/190)) ([5d43bb9](https://github.com/chamvi/chamvi/commit/5d43bb9442f3735c130489220391c1f3cd14dc5d))
* **tool-utils:** add utility tools for time, dates and arithmetic ([#182](https://github.com/chamvi/chamvi/issues/182)) ([e071f4b](https://github.com/chamvi/chamvi/commit/e071f4b1d4aef7f4fd6122be7246b74aa03f91b5))
* **ui,ui-kit:** add the package sidebar and provider page serving ([#189](https://github.com/chamvi/chamvi/issues/189)) ([cafc140](https://github.com/chamvi/chamvi/commit/cafc1408a48bc9376e3dc3fbaecb693ecae8e191))
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205)) ([3611193](https://github.com/chamvi/chamvi/commit/361119317a7e9eff10a05c3cad997c7163285654))


### Bug Fixes

* **chat-whatsapp:** keep libsignal's session logs out of the console ([#216](https://github.com/chamvi/chamvi/issues/216)) ([730e75c](https://github.com/chamvi/chamvi/commit/730e75c6762fce3929646ea8d34474eafadace58))
* close the 0.9.0 release review findings ([#240](https://github.com/chamvi/chamvi/issues/240)) ([ab400cd](https://github.com/chamvi/chamvi/commit/ab400cd55d185bd294f8c6ccc734a789b09b3397))
* **core,http:** bind a dispatched run to the agent revision its check saw ([#213](https://github.com/chamvi/chamvi/issues/213)) ([2479f77](https://github.com/chamvi/chamvi/commit/2479f77a854b469002b65b128502e6001579582d))
* **deps:** bump authup packages to 1.0.0-beta.74 ([1d7d6bd](https://github.com/chamvi/chamvi/commit/1d7d6bd7c00f759efb70513e42894d205ce3090e))
* **deps:** bump the minorandpatch group with 2 updates ([#194](https://github.com/chamvi/chamvi/issues/194)) ([b40ef2a](https://github.com/chamvi/chamvi/commit/b40ef2a018c01209b010805053cf9b730e3b43a7))
* harden connection create, tests and static serving ([#201](https://github.com/chamvi/chamvi/issues/201)) ([7f1518f](https://github.com/chamvi/chamvi/commit/7f1518fb9a1e4485960e404a25547fc23531c3c8))
* **http:** adopt routup decorators 5.1, body 4.1, swagger-ui 5, trapi 2.3 ([#224](https://github.com/chamvi/chamvi/issues/224)) ([556e569](https://github.com/chamvi/chamvi/commit/556e569207610bf2d9317ab830b3d2e5ab6f76bd))
* **http:** send the recommended policy of @routup/swagger-ui 5.1 ([3c179e8](https://github.com/chamvi/chamvi/commit/3c179e84551ba4c0b9c5dcae10c336c00744ede0))
* keep env secrets from stored accounts and close audit findings ([#198](https://github.com/chamvi/chamvi/issues/198)) ([f717a57](https://github.com/chamvi/chamvi/commit/f717a57725b2b532b1c3e4746b5a3fbd4c49e197))
* **store-memory:** match a list condition with a set lookup ([07c9149](https://github.com/chamvi/chamvi/commit/07c9149326bc222abf28dc4b14a1fe1fd0599908))
* **ui-kit:** fail a request the API does not answer in time ([#219](https://github.com/chamvi/chamvi/issues/219)) ([eb3ec8c](https://github.com/chamvi/chamvi/commit/eb3ec8c3500b8fcd44069c8b9ef745e559e5afc5))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))
* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))
* **http:** serve the REST API from controllers over services ([#220](https://github.com/chamvi/chamvi/issues/220)) ([1c86ed0](https://github.com/chamvi/chamvi/commit/1c86ed0d4727022977d5bcca0a6c48f0d4230196))
</details>

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).