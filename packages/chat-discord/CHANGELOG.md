# Changelog

## [0.13.0](https://github.com/chamvi/chamvi/compare/v0.12.0...v0.13.0) (2026-11-28)


### ⚠ BREAKING CHANGES

* **http-kit:** encode path segments and end every method with request options ([#327](https://github.com/chamvi/chamvi/issues/327))
* add @chamvi/core-kit ([#321](https://github.com/chamvi/chamvi/issues/321))
* add @chamvi/errors ([#319](https://github.com/chamvi/chamvi/issues/319))

### Features

* add @chamvi/core-kit ([#321](https://github.com/chamvi/chamvi/issues/321)) ([f1df1cd](https://github.com/chamvi/chamvi/commit/f1df1cdac762082478aea30182cbbf9002e18da5))
* add @chamvi/errors ([#319](https://github.com/chamvi/chamvi/issues/319)) ([4eef92f](https://github.com/chamvi/chamvi/commit/4eef92f2501207a86e605431e19f55337dfcaac5))
* **http-kit:** encode path segments and end every method with request options ([#327](https://github.com/chamvi/chamvi/issues/327)) ([9e2dfec](https://github.com/chamvi/chamvi/commit/9e2dfeca1adf734ce19334de6627af84ad4c93e9))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.12.0 to ^0.13.0
    * @chamvi/channel-cron bumped from ^0.12.0 to ^0.13.0
    * @chamvi/chat bumped from ^0.12.0 to ^0.13.0
    * @chamvi/core bumped from ^0.12.0 to ^0.13.0
    * @chamvi/core-kit bumped from ^0.12.0 to ^0.13.0
    * @chamvi/errors bumped from ^0.12.0 to ^0.13.0
    * @chamvi/store-memory bumped from ^0.12.0 to ^0.13.0
    * @chamvi/test-kit bumped from ^0.12.0 to ^0.13.0
  * peerDependencies
    * @chamvi/app bumped from ^0.12.0 to ^0.13.0
    * @chamvi/chat bumped from ^0.12.0 to ^0.13.0
    * @chamvi/core bumped from ^0.12.0 to ^0.13.0
    * @chamvi/core-kit bumped from ^0.12.0 to ^0.13.0
    * @chamvi/errors bumped from ^0.12.0 to ^0.13.0

## [0.12.0](https://github.com/chamvi/chamvi/compare/v0.11.0...v0.12.0) (2026-11-25)


### ⚠ BREAKING CHANGES

* name env variables after what they configure ([#310](https://github.com/chamvi/chamvi/issues/310))

### Features

* **chat:** transcribe voice messages ([#303](https://github.com/chamvi/chamvi/issues/303)) ([b929160](https://github.com/chamvi/chamvi/commit/b929160d2f5137e15076c13dda50ae6294896385))
* name env variables after what they configure ([#310](https://github.com/chamvi/chamvi/issues/310)) ([64628eb](https://github.com/chamvi/chamvi/commit/64628eb27c4543e8bad96c0318f769b3c6b67231))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.11.0 to ^0.12.0
    * @chamvi/channel-cron bumped from ^0.11.0 to ^0.12.0
    * @chamvi/chat bumped from ^0.11.0 to ^0.12.0
    * @chamvi/core bumped from ^0.11.0 to ^0.12.0
    * @chamvi/store bumped from ^0.11.0 to ^0.12.0
    * @chamvi/store-memory bumped from ^0.11.0 to ^0.12.0
    * @chamvi/test-kit bumped from ^0.11.0 to ^0.12.0
  * peerDependencies
    * @chamvi/app bumped from ^0.11.0 to ^0.12.0
    * @chamvi/chat bumped from ^0.11.0 to ^0.12.0
    * @chamvi/core bumped from ^0.11.0 to ^0.12.0
    * @chamvi/store bumped from ^0.11.0 to ^0.12.0

## [0.11.0](https://github.com/chamvi/chamvi/compare/v0.10.0...v0.11.0) (2026-11-25)


### ⚠ BREAKING CHANGES

* **deps:** bump authup, routup, rapiq, validup and adopt their features ([#287](https://github.com/chamvi/chamvi/issues/287))

### Features

* **chat:** answer approvals from chat replies ([#290](https://github.com/chamvi/chamvi/issues/290)) ([1b583b3](https://github.com/chamvi/chamvi/commit/1b583b3b6da4f769bf1fc69c9d8e865f29a9494f))


### Bug Fixes

* **deps:** bump authup, routup, rapiq, validup and adopt their features ([#287](https://github.com/chamvi/chamvi/issues/287)) ([98cac0e](https://github.com/chamvi/chamvi/commit/98cac0ec18811859ced7f07dee8307b22bc3891a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.10.0 to ^0.11.0
    * @chamvi/channel-cron bumped from ^0.10.0 to ^0.11.0
    * @chamvi/chat bumped from ^0.10.0 to ^0.11.0
    * @chamvi/core bumped from ^0.10.0 to ^0.11.0
    * @chamvi/store bumped from ^0.10.0 to ^0.11.0
    * @chamvi/store-memory bumped from ^0.10.0 to ^0.11.0
    * @chamvi/test-kit bumped from ^0.10.0 to ^0.11.0
  * peerDependencies
    * @chamvi/app bumped from ^0.10.0 to ^0.11.0
    * @chamvi/chat bumped from ^0.10.0 to ^0.11.0
    * @chamvi/core bumped from ^0.10.0 to ^0.11.0
    * @chamvi/store bumped from ^0.10.0 to ^0.11.0

## [0.10.0](https://github.com/chamvi/chamvi/compare/v0.9.0...v0.10.0) (2026-11-20)


### ⚠ BREAKING CHANGES

* identify connection rows by generation and refuse stale saves ([#243](https://github.com/chamvi/chamvi/issues/243))

### Features

* identify connection rows by generation and refuse stale saves ([#243](https://github.com/chamvi/chamvi/issues/243)) ([5f14b6c](https://github.com/chamvi/chamvi/commit/5f14b6c564227231fefe62eb154fbb2e69bffb22))


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 34 updates ([#258](https://github.com/chamvi/chamvi/issues/258)) ([50866c4](https://github.com/chamvi/chamvi/commit/50866c4e5bab2152f8e6cf7c84ba80ca17833689))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.9.0 to ^0.10.0
    * @chamvi/channel-cron bumped from ^0.9.0 to ^0.10.0
    * @chamvi/chat bumped from ^0.9.0 to ^0.10.0
    * @chamvi/core bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store-memory bumped from ^0.9.0 to ^0.10.0
    * @chamvi/test-kit bumped from ^0.9.0 to ^0.10.0
  * peerDependencies
    * @chamvi/app bumped from ^0.9.0 to ^0.10.0
    * @chamvi/chat bumped from ^0.9.0 to ^0.10.0
    * @chamvi/core bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store bumped from ^0.9.0 to ^0.10.0

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


### ⚠ BREAKING CHANGES

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

## [0.8.0](https://github.com/chamvi/chamvi/compare/v0.7.3...v0.8.0) (2026-11-08)


### Bug Fixes

* ensure consistent version for release ([#178](https://github.com/chamvi/chamvi/issues/178)) ([98faf1a](https://github.com/chamvi/chamvi/commit/98faf1ad1e7b388509c1e81b31fef9070e50f939))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.7.3 to ^0.8.0
    * @chamvi/channel-cron bumped from ^0.7.3 to ^0.8.0
    * @chamvi/chat bumped from ^0.7.3 to ^0.8.0
    * @chamvi/core bumped from ^0.7.3 to ^0.8.0
    * @chamvi/test-kit bumped from ^0.7.3 to ^0.8.0
  * peerDependencies
    * @chamvi/chat bumped from ^0.7.3 to ^0.8.0
    * @chamvi/core bumped from ^0.7.3 to ^0.8.0

## [0.7.3](https://github.com/chamvi/chamvi/compare/v0.7.2...v0.7.3) (2026-11-05)


### Features

* run cron subscriptions inside a chat conversation ([#163](https://github.com/chamvi/chamvi/issues/163)) ([ca8a9ed](https://github.com/chamvi/chamvi/commit/ca8a9ede297d26e85cd5a4c04ae85c94573fe019))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.7.2 to ^0.7.3
    * @chamvi/channel-cron bumped from ^0.7.2 to ^0.7.3
    * @chamvi/chat bumped from ^0.7.2 to ^0.7.3
    * @chamvi/core bumped from ^0.7.2 to ^0.7.3
    * @chamvi/test-kit bumped from ^0.7.2 to ^0.7.3
  * peerDependencies
    * @chamvi/chat bumped from ^0.7.2 to ^0.7.3
    * @chamvi/core bumped from ^0.7.2 to ^0.7.3

## [0.7.2](https://github.com/chamvi/chamvi/compare/v0.7.1...v0.7.2) (2026-11-05)


### Bug Fixes

* **deps:** bump minor and patch dependencies ([ea05be6](https://github.com/chamvi/chamvi/commit/ea05be6b3069e818d9c57c036186213d3ccff266))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.7.1 to ^0.7.2
    * @chamvi/chat bumped from ^0.7.1 to ^0.7.2
    * @chamvi/core bumped from ^0.7.1 to ^0.7.2
    * @chamvi/test-kit bumped from ^0.7.1 to ^0.7.2
  * peerDependencies
    * @chamvi/chat bumped from ^0.7.1 to ^0.7.2
    * @chamvi/core bumped from ^0.7.1 to ^0.7.2

## [0.7.1](https://github.com/chamvi/chamvi/compare/v0.7.0...v0.7.1) (2026-11-04)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.7.0 to ^0.7.1
    * @chamvi/chat bumped from ^0.7.0 to ^0.7.1
    * @chamvi/core bumped from ^0.7.0 to ^0.7.1
    * @chamvi/test-kit bumped from ^0.7.0 to ^0.7.1
  * peerDependencies
    * @chamvi/chat bumped from ^0.7.0 to ^0.7.1
    * @chamvi/core bumped from ^0.7.0 to ^0.7.1

## [0.7.0](https://github.com/chamvi/chamvi/compare/v0.6.1...v0.7.0) (2026-11-04)


### ⚠ BREAKING CHANGES

* replace defineAgent with defineModelAgent ([#140](https://github.com/chamvi/chamvi/issues/140))

### Features

* **chat-discord:** add the Discord chat channel ([#135](https://github.com/chamvi/chamvi/issues/135)) ([e2f8694](https://github.com/chamvi/chamvi/commit/e2f8694421a3641a9b7d1b4dc64d7df25bf9ab07))


### Code Refactoring

* replace defineAgent with defineModelAgent ([#140](https://github.com/chamvi/chamvi/issues/140)) ([96a0aa1](https://github.com/chamvi/chamvi/commit/96a0aa188da9af5f78ff65c41df0f0314e57418f))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.6.1 to ^0.7.0
    * @chamvi/chat bumped from ^0.6.1 to ^0.7.0
    * @chamvi/core bumped from ^0.6.1 to ^0.7.0
    * @chamvi/test-kit bumped from ^0.6.1 to ^0.7.0
  * peerDependencies
    * @chamvi/chat bumped from ^0.6.1 to ^0.7.0
    * @chamvi/core bumped from ^0.6.1 to ^0.7.0
