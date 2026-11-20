# Changelog

## [0.10.1](https://github.com/chamvi/chamvi/compare/v0.10.0...v0.10.1) (2026-11-20)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.10.0 to ^0.10.1
    * @chamvi/store bumped from ^0.10.0 to ^0.10.1
    * @chamvi/store-memory bumped from ^0.10.0 to ^0.10.1
    * @chamvi/test-kit bumped from ^0.10.0 to ^0.10.1
  * peerDependencies
    * @chamvi/core bumped from ^0.10.0 to ^0.10.1
    * @chamvi/store bumped from ^0.10.0 to ^0.10.1

## [0.10.0](https://github.com/chamvi/chamvi/compare/v0.9.0...v0.10.0) (2026-11-20)


### Features

* **core:** run remote agents as stand-in runs ([#250](https://github.com/chamvi/chamvi/issues/250)) ([4cfc60e](https://github.com/chamvi/chamvi/commit/4cfc60e7556afbc11622c5c907622a7564a33d4c))


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 34 updates ([#258](https://github.com/chamvi/chamvi/issues/258)) ([50866c4](https://github.com/chamvi/chamvi/commit/50866c4e5bab2152f8e6cf7c84ba80ca17833689))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store-memory bumped from ^0.9.0 to ^0.10.0
    * @chamvi/test-kit bumped from ^0.9.0 to ^0.10.0
  * peerDependencies
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
