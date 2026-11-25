# Changelog

## [0.11.0](https://github.com/chamvi/chamvi/compare/v0.10.0...v0.11.0) (2026-11-25)


### ⚠ BREAKING CHANGES

* own the chamvi permissions by the realm or the dashboard client ([#288](https://github.com/chamvi/chamvi/issues/288))
* **deps:** bump authup, routup, rapiq, validup and adopt their features ([#287](https://github.com/chamvi/chamvi/issues/287))

### Features

* own the chamvi permissions by the realm or the dashboard client ([#288](https://github.com/chamvi/chamvi/issues/288)) ([813c5d3](https://github.com/chamvi/chamvi/commit/813c5d3946b49ff1437ef4dbc8a63b440d2b4e7c))
* **store:** add the limit use aggregate for tool rate limits ([#291](https://github.com/chamvi/chamvi/issues/291)) ([15ac793](https://github.com/chamvi/chamvi/commit/15ac7930918f4b1e3a9fcc8adf1c164b8755e237))


### Bug Fixes

* **deps:** bump authup, routup, rapiq, validup and adopt their features ([#287](https://github.com/chamvi/chamvi/issues/287)) ([98cac0e](https://github.com/chamvi/chamvi/commit/98cac0ec18811859ced7f07dee8307b22bc3891a))
* **deps:** bump the minorandpatch group across 1 directory with 4 updates ([#279](https://github.com/chamvi/chamvi/issues/279)) ([02cce84](https://github.com/chamvi/chamvi/commit/02cce84e56cedec3ffe38b5c19ea806c3e6065a1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/access bumped from ^0.10.0 to ^0.11.0
    * @chamvi/channel-cron bumped from ^0.10.0 to ^0.11.0
    * @chamvi/core bumped from ^0.10.0 to ^0.11.0
    * @chamvi/http bumped from ^0.10.0 to ^0.11.0
    * @chamvi/store bumped from ^0.10.0 to ^0.11.0
    * @chamvi/store-db bumped from ^0.10.0 to ^0.11.0
    * @chamvi/store-memory bumped from ^0.10.0 to ^0.11.0
  * devDependencies
    * @chamvi/test-kit bumped from ^0.10.0 to ^0.11.0

## [0.10.0](https://github.com/chamvi/chamvi/compare/v0.9.0...v0.10.0) (2026-11-20)


### ⚠ BREAKING CHANGES

* issue lock fencing tokens and harden knowledge passes ([#259](https://github.com/chamvi/chamvi/issues/259))
* **knowledge:** fence pass writes and move storage onto a knowledge service ([#247](https://github.com/chamvi/chamvi/issues/247))
* identify connection rows by generation and refuse stale saves ([#243](https://github.com/chamvi/chamvi/issues/243))

### Features

* **app:** export TypedToken, and create the knowledge repository token with it ([6e1c1fc](https://github.com/chamvi/chamvi/commit/6e1c1fc1f5518128e9df54a0e3ab6ed3f4d6f527))
* **core:** run remote agents as stand-in runs ([#250](https://github.com/chamvi/chamvi/issues/250)) ([4cfc60e](https://github.com/chamvi/chamvi/commit/4cfc60e7556afbc11622c5c907622a7564a33d4c))
* identify connection rows by generation and refuse stale saves ([#243](https://github.com/chamvi/chamvi/issues/243)) ([5f14b6c](https://github.com/chamvi/chamvi/commit/5f14b6c564227231fefe62eb154fbb2e69bffb22))
* issue lock fencing tokens and harden knowledge passes ([#259](https://github.com/chamvi/chamvi/issues/259)) ([52384cd](https://github.com/chamvi/chamvi/commit/52384cdb36e3029935e2b773dd0858993adf5056))
* **knowledge:** fence pass writes and move storage onto a knowledge service ([#247](https://github.com/chamvi/chamvi/issues/247)) ([e711cfa](https://github.com/chamvi/chamvi/commit/e711cfa0fc0c6948d5df4f6205f99d4e3a237cfb))
* **peer:** connect chamvi apps as peers ([#251](https://github.com/chamvi/chamvi/issues/251)) ([98d539b](https://github.com/chamvi/chamvi/commit/98d539b6d598ddb631406c3c7f441430a6a74abe))
* **store-db-vector:** add a pgvector knowledge store ([#248](https://github.com/chamvi/chamvi/issues/248)) ([1604a6e](https://github.com/chamvi/chamvi/commit/1604a6e8248cc5b252487a6a78205c9b43f26846))


### Bug Fixes

* **app:** read the schema-behind code without loading typeorm ([8dfe883](https://github.com/chamvi/chamvi/commit/8dfe8833a94a48b8f157e965ac59dc4224117573))
* **deps:** bump authup to 1.0.0-beta.76 ([#244](https://github.com/chamvi/chamvi/issues/244)) ([4a04438](https://github.com/chamvi/chamvi/commit/4a04438a9cda88bfbd37ae07ad5eedc3f566b25f))
* **deps:** bump the minorandpatch group across 1 directory with 34 updates ([#258](https://github.com/chamvi/chamvi/issues/258)) ([50866c4](https://github.com/chamvi/chamvi/commit/50866c4e5bab2152f8e6cf7c84ba80ca17833689))
* **deps:** bump typeorm-extension to ^4.6.0 and use its error and row-lock helpers ([7a6023b](https://github.com/chamvi/chamvi/commit/7a6023b2c2e1ec86060f29b58c2dffdd77d327d7))
* remote agent follow-ups and findOneBy bind limit splitting ([#276](https://github.com/chamvi/chamvi/issues/276)) ([dbdc213](https://github.com/chamvi/chamvi/commit/dbdc2138479ae1e04240f01d8f611515c7dec221))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/access bumped from ^0.9.0 to ^0.10.0
    * @chamvi/channel-cron bumped from ^0.9.0 to ^0.10.0
    * @chamvi/core bumped from ^0.9.0 to ^0.10.0
    * @chamvi/http bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store-db bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store-memory bumped from ^0.9.0 to ^0.10.0
  * devDependencies
    * @chamvi/test-kit bumped from ^0.9.0 to ^0.10.0

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


### ⚠ BREAKING CHANGES

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

## [0.8.0](https://github.com/chamvi/chamvi/compare/v0.7.3...v0.8.0) (2026-11-08)


### ⚠ BREAKING CHANGES

* use uuid v7 ids and one primary key per table ([#174](https://github.com/chamvi/chamvi/issues/174))

### Features

* **chat-whatsapp,http,app:** store-backed WhatsApp sessions and connection routes ([#166](https://github.com/chamvi/chamvi/issues/166)) ([ba03375](https://github.com/chamvi/chamvi/commit/ba0337575e2ba53af5306795f3b78c16e1f84679))
* use uuid v7 ids and one primary key per table ([#174](https://github.com/chamvi/chamvi/issues/174)) ([20392bc](https://github.com/chamvi/chamvi/commit/20392bcf9c068383a81577d46fcd08369d206f25))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/channel-cron bumped from ^0.7.3 to ^0.8.0
    * @chamvi/core bumped from ^0.7.3 to ^0.8.0
    * @chamvi/http bumped from ^0.7.3 to ^0.8.0
    * @chamvi/store-db bumped from ^0.7.3 to ^0.8.0
  * devDependencies
    * @chamvi/test-kit bumped from ^0.7.3 to ^0.8.0

## [0.7.3](https://github.com/chamvi/chamvi/compare/v0.7.2...v0.7.3) (2026-11-05)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/channel-cron bumped from ^0.7.2 to ^0.7.3
    * @chamvi/core bumped from ^0.7.2 to ^0.7.3
    * @chamvi/http bumped from ^0.7.2 to ^0.7.3
    * @chamvi/store-db bumped from ^0.7.2 to ^0.7.3
  * devDependencies
    * @chamvi/test-kit bumped from ^0.7.2 to ^0.7.3

## [0.7.2](https://github.com/chamvi/chamvi/compare/v0.7.1...v0.7.2) (2026-11-05)


### Bug Fixes

* **deps:** bump minor and patch dependencies ([ea05be6](https://github.com/chamvi/chamvi/commit/ea05be6b3069e818d9c57c036186213d3ccff266))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/channel-cron bumped from ^0.7.1 to ^0.7.2
    * @chamvi/core bumped from ^0.7.1 to ^0.7.2
    * @chamvi/http bumped from ^0.7.1 to ^0.7.2
    * @chamvi/store-db bumped from ^0.7.1 to ^0.7.2
  * devDependencies
    * @chamvi/test-kit bumped from ^0.7.1 to ^0.7.2

## [0.7.1](https://github.com/chamvi/chamvi/compare/v0.7.0...v0.7.1) (2026-11-04)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/channel-cron bumped from ^0.7.0 to ^0.7.1
    * @chamvi/core bumped from ^0.7.0 to ^0.7.1
    * @chamvi/http bumped from ^0.7.0 to ^0.7.1
    * @chamvi/store-db bumped from ^0.7.0 to ^0.7.1
  * devDependencies
    * @chamvi/test-kit bumped from ^0.7.0 to ^0.7.1

## [0.7.0](https://github.com/chamvi/chamvi/compare/v0.6.1...v0.7.0) (2026-11-04)


### ⚠ BREAKING CHANGES

* replace defineAgent with defineModelAgent ([#140](https://github.com/chamvi/chamvi/issues/140))
* **core:** generated dispatch tools and simple agents ([#136](https://github.com/chamvi/chamvi/issues/136))

### Features

* **core:** generated dispatch tools and simple agents ([#136](https://github.com/chamvi/chamvi/issues/136)) ([711ea7a](https://github.com/chamvi/chamvi/commit/711ea7abbe3126817222793d1f3a38edca30b95a))


### Code Refactoring

* replace defineAgent with defineModelAgent ([#140](https://github.com/chamvi/chamvi/issues/140)) ([96a0aa1](https://github.com/chamvi/chamvi/commit/96a0aa188da9af5f78ff65c41df0f0314e57418f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/channel-cron bumped from ^0.6.1 to ^0.7.0
    * @chamvi/core bumped from ^0.6.1 to ^0.7.0
    * @chamvi/http bumped from ^0.6.1 to ^0.7.0
    * @chamvi/store-db bumped from ^0.6.1 to ^0.7.0
  * devDependencies
    * @chamvi/test-kit bumped from ^0.6.1 to ^0.7.0

## [0.6.1](https://github.com/chamvi/chamvi/compare/v0.6.0...v0.6.1) (2026-11-03)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/channel-cron bumped from ^0.6.0 to ^0.6.1
    * @chamvi/core bumped from ^0.6.0 to ^0.6.1
    * @chamvi/http bumped from ^0.6.0 to ^0.6.1
    * @chamvi/store-db bumped from ^0.6.0 to ^0.6.1
  * devDependencies
    * @chamvi/test-kit bumped from ^0.6.0 to ^0.6.1

## [0.6.0](https://github.com/chamvi/chamvi/compare/v0.5.1...v0.6.0) (2026-11-03)


### ⚠ BREAKING CHANGES

* **core:** awaited dispatch, cross-agent and deeper hand-offs, dispatch roles ([#130](https://github.com/chamvi/chamvi/issues/130))

### Features

* **core:** awaited dispatch, cross-agent and deeper hand-offs, dispatch roles ([#130](https://github.com/chamvi/chamvi/issues/130)) ([562106c](https://github.com/chamvi/chamvi/commit/562106c09ed861d9ad12360110001f27aac29684))


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 17 updates ([#127](https://github.com/chamvi/chamvi/issues/127)) ([2829a3b](https://github.com/chamvi/chamvi/commit/2829a3b756ba21e267fcc7f50883bc4ac81cee44))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/channel-cron bumped from ^0.5.1 to ^0.6.0
    * @chamvi/core bumped from ^0.5.1 to ^0.6.0
    * @chamvi/http bumped from ^0.5.1 to ^0.6.0
    * @chamvi/store-db bumped from ^0.5.1 to ^0.6.0
  * devDependencies
    * @chamvi/test-kit bumped from ^0.5.1 to ^0.6.0

## [0.5.1](https://github.com/chamvi/chamvi/compare/v0.5.0...v0.5.1) (2026-11-02)


### Features

* **app:** load agents from npm packages by name ([#121](https://github.com/chamvi/chamvi/issues/121)) ([1a1262f](https://github.com/chamvi/chamvi/commit/1a1262f1a4dbd5f0b561653c52c0b91937ca83db))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/channel-cron bumped from ^0.5.0 to ^0.5.1
    * @chamvi/core bumped from ^0.5.0 to ^0.5.1
    * @chamvi/http bumped from ^0.5.0 to ^0.5.1
    * @chamvi/store-db bumped from ^0.5.0 to ^0.5.1
  * devDependencies
    * @chamvi/test-kit bumped from ^0.5.0 to ^0.5.1

## [0.5.0](https://github.com/chamvi/chamvi/compare/v0.4.0...v0.5.0) (2026-11-02)


### ⚠ BREAKING CHANGES

* require node 26 and run ci on one version ([#113](https://github.com/chamvi/chamvi/issues/113))

### Features

* **core,app:** resolve embedding models ([#107](https://github.com/chamvi/chamvi/issues/107)) ([d0e56b4](https://github.com/chamvi/chamvi/commit/d0e56b46c814037b55117e7163fa482dbb49519b))


### Build System

* require node 26 and run ci on one version ([#113](https://github.com/chamvi/chamvi/issues/113)) ([0bf352f](https://github.com/chamvi/chamvi/commit/0bf352f63e3f13433396e6ba12ae3b667f8746e4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/channel-cron bumped from ^0.4.0 to ^0.5.0
    * @chamvi/core bumped from ^0.4.0 to ^0.5.0
    * @chamvi/http bumped from ^0.4.0 to ^0.5.0
    * @chamvi/store-db bumped from ^0.4.0 to ^0.5.0
  * devDependencies
    * @chamvi/test-kit bumped from ^0.4.0 to ^0.5.0

## [0.4.0](https://github.com/chamvi/chamvi/compare/v0.3.1...v0.4.0) (2026-11-01)


### ⚠ BREAKING CHANGES

* **store-db,core:** migrations from the pre-release window are replaced by `ConversationsRunTaint1792713600000`, so recreate or reconcile development databases. Writes for unknown runs reject with `RunNotFoundError`. Upgrading from 0.3 needs downtime, as described in the upgrade guide.
* harden trust gates, github, sandbox and coding before 0.4 ([#104](https://github.com/chamvi/chamvi/issues/104))
* Node.js 22 is no longer supported. All packages require Node.js >=24.3.0.
* add durable conversation memory and composable repositories ([#96](https://github.com/chamvi/chamvi/issues/96))

### Features

* add agent execution caps and channel HTTP limit policies ([#93](https://github.com/chamvi/chamvi/issues/93)) ([422a9e9](https://github.com/chamvi/chamvi/commit/422a9e9d80a48b0b7b057de51b078c598da7423c))
* add durable conversation memory and composable repositories ([#96](https://github.com/chamvi/chamvi/issues/96)) ([a183f1c](https://github.com/chamvi/chamvi/commit/a183f1c723b573603ee50533dd4ff25fc2efcc20))
* **skills:** add verified agent skills and startup installation ([#94](https://github.com/chamvi/chamvi/issues/94)) ([2c44e21](https://github.com/chamvi/chamvi/commit/2c44e21b57a9263e40ecc10d514079f90aa4ec1f))


### Bug Fixes

* **deps:** bump authup to 1.0.0-beta.72, vuecs, ilingo, vueuse 15, nx 24 and @types/node 26 ([0582ff2](https://github.com/chamvi/chamvi/commit/0582ff263dc48d7d339dbccf51d4fc7c68bb744f))
* harden trust gates, github, sandbox and coding before 0.4 ([#104](https://github.com/chamvi/chamvi/issues/104)) ([1fccd8a](https://github.com/chamvi/chamvi/commit/1fccd8afcc4b122e875c47b0bcf45d65d4b9cd9a))
* **store-db,core:** bundle the 0.4 migrations and finish the release audit ([#105](https://github.com/chamvi/chamvi/issues/105)) ([d8c671a](https://github.com/chamvi/chamvi/commit/d8c671a0afc81d85b0bcf627206b0cf74f5cb580))


### Build System

* upgrade eslint config to 3.2.0 and require Node 24 ([00fa9b4](https://github.com/chamvi/chamvi/commit/00fa9b463c9e78ec783d3352c8ba8d16b7191758))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/channel-cron bumped from ^0.3.1 to ^0.4.0
    * @chamvi/core bumped from ^0.3.1 to ^0.4.0
    * @chamvi/http bumped from ^0.3.1 to ^0.4.0
    * @chamvi/store-db bumped from ^0.3.1 to ^0.4.0
  * devDependencies
    * @chamvi/test-kit bumped from ^0.3.1 to ^0.4.0

## [0.3.1](https://github.com/chamvi/chamvi/compare/v0.3.0...v0.3.1) (2026-10-27)


### Features

* **core:** start runs of the same agent from a tool ([#64](https://github.com/chamvi/chamvi/issues/64)) ([083c385](https://github.com/chamvi/chamvi/commit/083c3852f1a0c494193e9e6ae36ca5739d1b275c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/channel-cron bumped from ^0.2.2 to ^0.3.1
    * @chamvi/core bumped from ^0.3.0 to ^0.3.1
    * @chamvi/http bumped from ^0.2.2 to ^0.3.1
    * @chamvi/store-typeorm bumped from ^0.3.0 to ^0.3.1
  * devDependencies
    * @chamvi/test-kit bumped from ^0.3.0 to ^0.3.1

## [0.3.0](https://github.com/chamvi/chamvi/compare/v0.2.1...v0.3.0) (2026-10-26)


### ⚠ BREAKING CHANGES

* **app:** replace doctor with start --check and make agent reloads visible ([#61](https://github.com/chamvi/chamvi/issues/61))
* **app:** resolve models through declared providers and add chamvi doctor ([#58](https://github.com/chamvi/chamvi/issues/58))
* **sandbox:** root workspaces, any image, a shared package cache and sandbox-dev ([#48](https://github.com/chamvi/chamvi/issues/48))
* **sandbox:** find workspaces again across approvals, restarts and replicas ([#47](https://github.com/chamvi/chamvi/issues/47))

### Features

* **app:** replace doctor with start --check and make agent reloads visible ([#61](https://github.com/chamvi/chamvi/issues/61)) ([6c971ec](https://github.com/chamvi/chamvi/commit/6c971ec381b01895dc32f34902c1be52d4090f33))
* **app:** resolve models through declared providers and add chamvi doctor ([#58](https://github.com/chamvi/chamvi/issues/58)) ([04309b9](https://github.com/chamvi/chamvi/commit/04309b93b217c270639d0951eb1d5f00009d4ce0))
* **sandbox:** find workspaces again across approvals, restarts and replicas ([#47](https://github.com/chamvi/chamvi/issues/47)) ([0f9bcb3](https://github.com/chamvi/chamvi/commit/0f9bcb3c0055be8730050365afb1693a1a3cc512))
* **sandbox:** full git checkouts, pluggable credentials and git tools with a push policy ([#50](https://github.com/chamvi/chamvi/issues/50)) ([9f457bb](https://github.com/chamvi/chamvi/commit/9f457bb7ca64be5e90ebafbe840e6698f156d6f1))
* **sandbox:** root workspaces, any image, a shared package cache and sandbox-dev ([#48](https://github.com/chamvi/chamvi/issues/48)) ([b7131c0](https://github.com/chamvi/chamvi/commit/b7131c0e58fe8c5e2e88bd34248f6208517d9159))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/channel-cron bumped from ^0.2.1 to ^0.2.2
    * @chamvi/core bumped from ^0.2.1 to ^0.3.0
    * @chamvi/http bumped from ^0.2.1 to ^0.2.2
    * @chamvi/store-typeorm bumped from ^0.2.1 to ^0.3.0
  * devDependencies
    * @chamvi/test-kit bumped from ^0.2.1 to ^0.3.0

## [0.2.1](https://github.com/chamvi/chamvi/compare/v0.2.0...v0.2.1) (2026-10-25)


### Bug Fixes

* **app:** mark the default provider as v4 so string models are not converted twice ([#41](https://github.com/chamvi/chamvi/issues/41)) ([5780984](https://github.com/chamvi/chamvi/commit/5780984f9ec66790af1bf2c5b3a7b4adff077039))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/channel-cron bumped from ^0.2.0 to ^0.2.1
    * @chamvi/core bumped from ^0.2.0 to ^0.2.1
    * @chamvi/http bumped from ^0.2.0 to ^0.2.1
    * @chamvi/store-typeorm bumped from ^0.2.0 to ^0.2.1
  * devDependencies
    * @chamvi/test-kit bumped from ^0.2.0 to ^0.2.1

## [0.2.0](https://github.com/chamvi/chamvi/compare/app-v0.1.0...app-v0.2.0) (2026-10-25)


### ⚠ BREAKING CHANGES

* provider/model strings, entry-less apps and approvals without resume tokens ([#38](https://github.com/chamvi/chamvi/issues/38))
* replace triggers and notifiers with channels ([#36](https://github.com/chamvi/chamvi/issues/36))
* add agent folders and a live agent registry ([#34](https://github.com/chamvi/chamvi/issues/34))

### Features

* add @chamvi/app and @chamvi/cli ([#29](https://github.com/chamvi/chamvi/issues/29)) ([b6f618f](https://github.com/chamvi/chamvi/commit/b6f618f1fbefe76d7afa075d2e644bf1745c7c98))
* add agent folders and a live agent registry ([#34](https://github.com/chamvi/chamvi/issues/34)) ([fe96152](https://github.com/chamvi/chamvi/commit/fe9615226c3ca2af96457d9fa9ffa03dc46c20b2))
* provider/model strings, entry-less apps and approvals without resume tokens ([#38](https://github.com/chamvi/chamvi/issues/38)) ([9ce771e](https://github.com/chamvi/chamvi/commit/9ce771ed4255e667d5592e70239ef6f44f937afe))
* replace triggers and notifiers with channels ([#36](https://github.com/chamvi/chamvi/issues/36)) ([78e8e7e](https://github.com/chamvi/chamvi/commit/78e8e7edc02e21da1dddec493887847eb4e61c7f))


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 4 updates ([#37](https://github.com/chamvi/chamvi/issues/37)) ([655adfc](https://github.com/chamvi/chamvi/commit/655adfcb7807d233a218fc62458f52e92dda0853))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/channel-cron bumped from ^0.1.0 to ^0.2.0
    * @chamvi/core bumped from ^0.1.0 to ^0.2.0
    * @chamvi/http bumped from ^0.1.0 to ^0.2.0
    * @chamvi/store-typeorm bumped from ^0.1.0 to ^0.2.0
  * devDependencies
    * @chamvi/test-kit bumped from ^0.1.0 to ^0.2.0
