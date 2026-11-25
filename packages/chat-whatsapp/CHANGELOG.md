# Changelog

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
    * @chamvi/chat bumped from ^0.10.0 to ^0.11.0
    * @chamvi/core bumped from ^0.10.0 to ^0.11.0
    * @chamvi/store bumped from ^0.10.0 to ^0.11.0
    * @chamvi/store-db bumped from ^0.10.0 to ^0.11.0
    * @chamvi/store-memory bumped from ^0.10.0 to ^0.11.0
    * @chamvi/test-kit bumped from ^0.10.0 to ^0.11.0
  * peerDependencies
    * @chamvi/app bumped from ^0.10.0 to ^0.11.0
    * @chamvi/chat bumped from ^0.10.0 to ^0.11.0
    * @chamvi/core bumped from ^0.10.0 to ^0.11.0
    * @chamvi/store bumped from ^0.10.0 to ^0.11.0

## [0.10.0](https://github.com/chamvi/chamvi/compare/v0.9.0...v0.10.0) (2026-11-20)


### ⚠ BREAKING CHANGES

* issue lock fencing tokens and harden knowledge passes ([#259](https://github.com/chamvi/chamvi/issues/259))

### Features

* issue lock fencing tokens and harden knowledge passes ([#259](https://github.com/chamvi/chamvi/issues/259)) ([52384cd](https://github.com/chamvi/chamvi/commit/52384cdb36e3029935e2b773dd0858993adf5056))


### Bug Fixes

* close engine, workspace manager, where-split and release scan edge cases ([#275](https://github.com/chamvi/chamvi/issues/275)) ([96f0b67](https://github.com/chamvi/chamvi/commit/96f0b67ab682f3a307c35fa6f55971fac926de81))
* **deps:** bump the minorandpatch group across 1 directory with 34 updates ([#258](https://github.com/chamvi/chamvi/issues/258)) ([50866c4](https://github.com/chamvi/chamvi/commit/50866c4e5bab2152f8e6cf7c84ba80ca17833689))
* **deps:** bump typeorm-extension to ^4.6.0 and use its error and row-lock helpers ([7a6023b](https://github.com/chamvi/chamvi/commit/7a6023b2c2e1ec86060f29b58c2dffdd77d327d7))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.9.0 to ^0.10.0
    * @chamvi/chat bumped from ^0.9.0 to ^0.10.0
    * @chamvi/core bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store-db bumped from ^0.9.0 to ^0.10.0
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

## [0.8.0](https://github.com/chamvi/chamvi/compare/v0.7.3...v0.8.0) (2026-11-08)


### Features

* **chat-whatsapp,http,app:** store-backed WhatsApp sessions and connection routes ([#166](https://github.com/chamvi/chamvi/issues/166)) ([ba03375](https://github.com/chamvi/chamvi/commit/ba0337575e2ba53af5306795f3b78c16e1f84679))
* **ui:** pair WhatsApp connections in the dashboard ([#167](https://github.com/chamvi/chamvi/issues/167)) ([7e5191a](https://github.com/chamvi/chamvi/commit/7e5191aa96522022557f25303c3f59fa24cecad9))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.7.3 to ^0.8.0
    * @chamvi/chat bumped from ^0.7.3 to ^0.8.0
    * @chamvi/core bumped from ^0.7.3 to ^0.8.0
    * @chamvi/store-db bumped from ^0.7.3 to ^0.8.0
    * @chamvi/test-kit bumped from ^0.7.3 to ^0.8.0
  * peerDependencies
    * @chamvi/app bumped from ^0.7.3 to ^0.8.0
    * @chamvi/chat bumped from ^0.7.3 to ^0.8.0
    * @chamvi/core bumped from ^0.7.3 to ^0.8.0

## [0.7.3](https://github.com/chamvi/chamvi/compare/v0.7.2...v0.7.3) (2026-11-05)


### Features

* run cron subscriptions inside a chat conversation ([#163](https://github.com/chamvi/chamvi/issues/163)) ([ca8a9ed](https://github.com/chamvi/chamvi/commit/ca8a9ede297d26e85cd5a4c04ae85c94573fe019))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.7.2 to ^0.7.3
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

## [0.6.1](https://github.com/chamvi/chamvi/compare/v0.6.0...v0.6.1) (2026-11-03)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.6.0 to ^0.6.1
    * @chamvi/chat bumped from ^0.6.0 to ^0.6.1
    * @chamvi/core bumped from ^0.6.0 to ^0.6.1
    * @chamvi/test-kit bumped from ^0.6.0 to ^0.6.1
  * peerDependencies
    * @chamvi/chat bumped from ^0.6.0 to ^0.6.1
    * @chamvi/core bumped from ^0.6.0 to ^0.6.1

## [0.6.0](https://github.com/chamvi/chamvi/compare/v0.5.1...v0.6.0) (2026-11-03)


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 17 updates ([#127](https://github.com/chamvi/chamvi/issues/127)) ([2829a3b](https://github.com/chamvi/chamvi/commit/2829a3b756ba21e267fcc7f50883bc4ac81cee44))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.5.1 to ^0.6.0
    * @chamvi/chat bumped from ^0.5.1 to ^0.6.0
    * @chamvi/core bumped from ^0.5.1 to ^0.6.0
    * @chamvi/test-kit bumped from ^0.5.1 to ^0.6.0
  * peerDependencies
    * @chamvi/chat bumped from ^0.5.1 to ^0.6.0
    * @chamvi/core bumped from ^0.5.1 to ^0.6.0

## [0.5.1](https://github.com/chamvi/chamvi/compare/v0.5.0...v0.5.1) (2026-11-02)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.5.0 to ^0.5.1
    * @chamvi/chat bumped from ^0.5.0 to ^0.5.1
    * @chamvi/core bumped from ^0.5.0 to ^0.5.1
    * @chamvi/test-kit bumped from ^0.5.0 to ^0.5.1
  * peerDependencies
    * @chamvi/chat bumped from ^0.5.0 to ^0.5.1
    * @chamvi/core bumped from ^0.5.0 to ^0.5.1

## [0.5.0](https://github.com/chamvi/chamvi/compare/v0.4.0...v0.5.0) (2026-11-02)


### Features

* **chat:** add Chat SDK channels and WhatsApp Web ([#109](https://github.com/chamvi/chamvi/issues/109)) ([a0b5507](https://github.com/chamvi/chamvi/commit/a0b5507f24a8401f657c4cb571a25504bbe81ef2))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.4.0 to ^0.5.0
    * @chamvi/chat bumped from ^0.4.0 to ^0.5.0
    * @chamvi/core bumped from ^0.4.0 to ^0.5.0
    * @chamvi/test-kit bumped from ^0.4.0 to ^0.5.0
  * peerDependencies
    * @chamvi/chat bumped from ^0.4.0 to ^0.5.0
    * @chamvi/core bumped from ^0.4.0 to ^0.5.0
