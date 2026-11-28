# Changelog

## [0.13.0](https://github.com/chamvi/chamvi/compare/v0.12.0...v0.13.0) (2026-11-28)


### ⚠ BREAKING CHANGES

* add @chamvi/core-kit ([#321](https://github.com/chamvi/chamvi/issues/321))
* add @chamvi/errors ([#319](https://github.com/chamvi/chamvi/issues/319))

### Features

* add @chamvi/core-kit ([#321](https://github.com/chamvi/chamvi/issues/321)) ([f1df1cd](https://github.com/chamvi/chamvi/commit/f1df1cdac762082478aea30182cbbf9002e18da5))
* add @chamvi/errors ([#319](https://github.com/chamvi/chamvi/issues/319)) ([4eef92f](https://github.com/chamvi/chamvi/commit/4eef92f2501207a86e605431e19f55337dfcaac5))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.12.0 to ^0.13.0
    * @chamvi/core-kit bumped from ^0.12.0 to ^0.13.0
    * @chamvi/errors bumped from ^0.12.0 to ^0.13.0
    * @chamvi/store-memory bumped from ^0.12.0 to ^0.13.0
    * @chamvi/test-kit bumped from ^0.12.0 to ^0.13.0
  * peerDependencies
    * @chamvi/core bumped from ^0.12.0 to ^0.13.0
    * @chamvi/core-kit bumped from ^0.12.0 to ^0.13.0
    * @chamvi/errors bumped from ^0.12.0 to ^0.13.0

## [0.12.0](https://github.com/chamvi/chamvi/compare/v0.11.0...v0.12.0) (2026-11-25)


### Bug Fixes

* ensure consistent version for release ([#311](https://github.com/chamvi/chamvi/issues/311)) ([f723e3a](https://github.com/chamvi/chamvi/commit/f723e3ac146a4895efa2f7cbf1f17cec4d51eee3))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.11.0 to ^0.12.0
    * @chamvi/store bumped from ^0.11.0 to ^0.12.0
    * @chamvi/store-memory bumped from ^0.11.0 to ^0.12.0
    * @chamvi/test-kit bumped from ^0.11.0 to ^0.12.0
  * peerDependencies
    * @chamvi/core bumped from ^0.11.0 to ^0.12.0
    * @chamvi/store bumped from ^0.11.0 to ^0.12.0

## [0.11.0](https://github.com/chamvi/chamvi/compare/v0.10.0...v0.11.0) (2026-11-25)


### ⚠ BREAKING CHANGES

* **deps:** bump authup, routup, rapiq, validup and adopt their features ([#287](https://github.com/chamvi/chamvi/issues/287))

### Bug Fixes

* **deps:** bump authup, routup, rapiq, validup and adopt their features ([#287](https://github.com/chamvi/chamvi/issues/287)) ([98cac0e](https://github.com/chamvi/chamvi/commit/98cac0ec18811859ced7f07dee8307b22bc3891a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.10.0 to ^0.11.0
    * @chamvi/store bumped from ^0.10.0 to ^0.11.0
    * @chamvi/store-memory bumped from ^0.10.0 to ^0.11.0
    * @chamvi/test-kit bumped from ^0.10.0 to ^0.11.0
  * peerDependencies
    * @chamvi/core bumped from ^0.10.0 to ^0.11.0
    * @chamvi/store bumped from ^0.10.0 to ^0.11.0

## [0.10.0](https://github.com/chamvi/chamvi/compare/v0.9.0...v0.10.0) (2026-11-20)


### ⚠ BREAKING CHANGES

* issue lock fencing tokens and harden knowledge passes ([#259](https://github.com/chamvi/chamvi/issues/259))

### Features

* issue lock fencing tokens and harden knowledge passes ([#259](https://github.com/chamvi/chamvi/issues/259)) ([52384cd](https://github.com/chamvi/chamvi/commit/52384cdb36e3029935e2b773dd0858993adf5056))


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 34 updates ([#258](https://github.com/chamvi/chamvi/issues/258)) ([50866c4](https://github.com/chamvi/chamvi/commit/50866c4e5bab2152f8e6cf7c84ba80ca17833689))
* remote agent follow-ups and findOneBy bind limit splitting ([#276](https://github.com/chamvi/chamvi/issues/276)) ([dbdc213](https://github.com/chamvi/chamvi/commit/dbdc2138479ae1e04240f01d8f611515c7dec221))


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

## [0.8.0](https://github.com/chamvi/chamvi/compare/v0.7.3...v0.8.0) (2026-11-08)


### Features

* **core,store-db:** add an encrypted, lease-fenced connection store ([#165](https://github.com/chamvi/chamvi/issues/165)) ([6c7ea55](https://github.com/chamvi/chamvi/commit/6c7ea55963dda044e06aa32964f3e0f813180d88))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.7.3 to ^0.8.0
    * @chamvi/test-kit bumped from ^0.7.3 to ^0.8.0
  * peerDependencies
    * @chamvi/core bumped from ^0.7.3 to ^0.8.0

## [0.7.3](https://github.com/chamvi/chamvi/compare/v0.7.2...v0.7.3) (2026-11-05)


### Features

* run cron subscriptions inside a chat conversation ([#163](https://github.com/chamvi/chamvi/issues/163)) ([ca8a9ed](https://github.com/chamvi/chamvi/commit/ca8a9ede297d26e85cd5a4c04ae85c94573fe019))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.7.2 to ^0.7.3
    * @chamvi/test-kit bumped from ^0.7.2 to ^0.7.3
  * peerDependencies
    * @chamvi/core bumped from ^0.7.2 to ^0.7.3

## [0.7.2](https://github.com/chamvi/chamvi/compare/v0.7.1...v0.7.2) (2026-11-05)


### Bug Fixes

* **deps:** bump minor and patch dependencies ([ea05be6](https://github.com/chamvi/chamvi/commit/ea05be6b3069e818d9c57c036186213d3ccff266))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.7.1 to ^0.7.2
    * @chamvi/test-kit bumped from ^0.7.1 to ^0.7.2
  * peerDependencies
    * @chamvi/core bumped from ^0.7.1 to ^0.7.2

## [0.7.1](https://github.com/chamvi/chamvi/compare/v0.7.0...v0.7.1) (2026-11-04)


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 3 updates ([#143](https://github.com/chamvi/chamvi/issues/143)) ([4da222f](https://github.com/chamvi/chamvi/commit/4da222f5a2acc4aa1ca400d18dc01f159596fdc0))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.7.0 to ^0.7.1
    * @chamvi/test-kit bumped from ^0.7.0 to ^0.7.1
  * peerDependencies
    * @chamvi/core bumped from ^0.7.0 to ^0.7.1

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
  * devDependencies
    * @chamvi/core bumped from ^0.6.1 to ^0.7.0
    * @chamvi/test-kit bumped from ^0.6.1 to ^0.7.0
  * peerDependencies
    * @chamvi/core bumped from ^0.6.1 to ^0.7.0

## [0.6.1](https://github.com/chamvi/chamvi/compare/v0.6.0...v0.6.1) (2026-11-03)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.6.0 to ^0.6.1
    * @chamvi/test-kit bumped from ^0.6.0 to ^0.6.1
  * peerDependencies
    * @chamvi/core bumped from ^0.6.0 to ^0.6.1

## [0.6.0](https://github.com/chamvi/chamvi/compare/v0.5.1...v0.6.0) (2026-11-03)


### ⚠ BREAKING CHANGES

* **core:** awaited dispatch, cross-agent and deeper hand-offs, dispatch roles ([#130](https://github.com/chamvi/chamvi/issues/130))

### Features

* **core:** awaited dispatch, cross-agent and deeper hand-offs, dispatch roles ([#130](https://github.com/chamvi/chamvi/issues/130)) ([562106c](https://github.com/chamvi/chamvi/commit/562106c09ed861d9ad12360110001f27aac29684))


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 17 updates ([#127](https://github.com/chamvi/chamvi/issues/127)) ([2829a3b](https://github.com/chamvi/chamvi/commit/2829a3b756ba21e267fcc7f50883bc4ac81cee44))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.5.1 to ^0.6.0
    * @chamvi/test-kit bumped from ^0.5.1 to ^0.6.0
  * peerDependencies
    * @chamvi/core bumped from ^0.5.1 to ^0.6.0

## [0.5.1](https://github.com/chamvi/chamvi/compare/v0.5.0...v0.5.1) (2026-11-02)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.5.0 to ^0.5.1
    * @chamvi/test-kit bumped from ^0.5.0 to ^0.5.1
  * peerDependencies
    * @chamvi/core bumped from ^0.5.0 to ^0.5.1

## [0.5.0](https://github.com/chamvi/chamvi/compare/v0.4.0...v0.5.0) (2026-11-02)


### ⚠ BREAKING CHANGES

* require node 26 and run ci on one version ([#113](https://github.com/chamvi/chamvi/issues/113))

### Build System

* require node 26 and run ci on one version ([#113](https://github.com/chamvi/chamvi/issues/113)) ([0bf352f](https://github.com/chamvi/chamvi/commit/0bf352f63e3f13433396e6ba12ae3b667f8746e4))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.4.0 to ^0.5.0
    * @chamvi/test-kit bumped from ^0.4.0 to ^0.5.0
  * peerDependencies
    * @chamvi/core bumped from ^0.4.0 to ^0.5.0

## [0.4.0](https://github.com/chamvi/chamvi/compare/v0.3.1...v0.4.0) (2026-11-01)


### ⚠ BREAKING CHANGES

* **store-db,core:** migrations from the pre-release window are replaced by `ConversationsRunTaint1792713600000`, so recreate or reconcile development databases. Writes for unknown runs reject with `RunNotFoundError`. Upgrading from 0.3 needs downtime, as described in the upgrade guide.
* Node.js 22 is no longer supported. All packages require Node.js >=24.3.0.
* add durable conversation memory and composable repositories ([#96](https://github.com/chamvi/chamvi/issues/96))

### Features

* add agent execution caps and channel HTTP limit policies ([#93](https://github.com/chamvi/chamvi/issues/93)) ([422a9e9](https://github.com/chamvi/chamvi/commit/422a9e9d80a48b0b7b057de51b078c598da7423c))
* add durable conversation memory and composable repositories ([#96](https://github.com/chamvi/chamvi/issues/96)) ([a183f1c](https://github.com/chamvi/chamvi/commit/a183f1c723b573603ee50533dd4ff25fc2efcc20))
* **skills:** add verified agent skills and startup installation ([#94](https://github.com/chamvi/chamvi/issues/94)) ([2c44e21](https://github.com/chamvi/chamvi/commit/2c44e21b57a9263e40ecc10d514079f90aa4ec1f))


### Bug Fixes

* **store-db,core:** bundle the 0.4 migrations and finish the release audit ([#105](https://github.com/chamvi/chamvi/issues/105)) ([d8c671a](https://github.com/chamvi/chamvi/commit/d8c671a0afc81d85b0bcf627206b0cf74f5cb580))


### Build System

* upgrade eslint config to 3.2.0 and require Node 24 ([00fa9b4](https://github.com/chamvi/chamvi/commit/00fa9b463c9e78ec783d3352c8ba8d16b7191758))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.3.1 to ^0.4.0
    * @chamvi/test-kit bumped from ^0.3.1 to ^0.4.0
  * peerDependencies
    * @chamvi/core bumped from ^0.3.1 to ^0.4.0

## [0.3.1](https://github.com/chamvi/chamvi/compare/v0.2.2...v0.3.1) (2026-10-27)


### ⚠ BREAKING CHANGES

* provider/model strings, entry-less apps and approvals without resume tokens ([#38](https://github.com/chamvi/chamvi/issues/38))
* replace triggers and notifiers with channels ([#36](https://github.com/chamvi/chamvi/issues/36))

### Features

* provider/model strings, entry-less apps and approvals without resume tokens ([#38](https://github.com/chamvi/chamvi/issues/38)) ([9ce771e](https://github.com/chamvi/chamvi/commit/9ce771ed4255e667d5592e70239ef6f44f937afe))
* replace triggers and notifiers with channels ([#36](https://github.com/chamvi/chamvi/issues/36)) ([78e8e7e](https://github.com/chamvi/chamvi/commit/78e8e7edc02e21da1dddec493887847eb4e61c7f))


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 4 updates ([#37](https://github.com/chamvi/chamvi/issues/37)) ([655adfc](https://github.com/chamvi/chamvi/commit/655adfcb7807d233a218fc62458f52e92dda0853))
* ensure consistent version for release ([#67](https://github.com/chamvi/chamvi/issues/67)) ([c08d0fb](https://github.com/chamvi/chamvi/commit/c08d0fbf89c5083f750ed5c966513aad79bbabe6))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.3.0 to ^0.3.1
    * @chamvi/test-kit bumped from ^0.3.0 to ^0.3.1
  * peerDependencies
    * @chamvi/core bumped from ^0.3.0 to ^0.3.1

## [0.2.2](https://github.com/chamvi/chamvi/compare/v0.2.1...v0.2.2) (2026-10-26)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.2.1 to ^0.3.0
    * @chamvi/test-kit bumped from ^0.2.1 to ^0.3.0
  * peerDependencies
    * @chamvi/core bumped from ^0.2.1 to ^0.3.0

## [0.2.1](https://github.com/chamvi/chamvi/compare/v0.2.0...v0.2.1) (2026-10-25)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.2.0 to ^0.2.1
    * @chamvi/test-kit bumped from ^0.2.0 to ^0.2.1
  * peerDependencies
    * @chamvi/core bumped from ^0.2.0 to ^0.2.1

## [0.2.0](https://github.com/chamvi/chamvi/compare/channel-cron-v0.1.0...channel-cron-v0.2.0) (2026-10-25)


### ⚠ BREAKING CHANGES

* provider/model strings, entry-less apps and approvals without resume tokens ([#38](https://github.com/chamvi/chamvi/issues/38))
* replace triggers and notifiers with channels ([#36](https://github.com/chamvi/chamvi/issues/36))

### Features

* provider/model strings, entry-less apps and approvals without resume tokens ([#38](https://github.com/chamvi/chamvi/issues/38)) ([9ce771e](https://github.com/chamvi/chamvi/commit/9ce771ed4255e667d5592e70239ef6f44f937afe))
* replace triggers and notifiers with channels ([#36](https://github.com/chamvi/chamvi/issues/36)) ([78e8e7e](https://github.com/chamvi/chamvi/commit/78e8e7edc02e21da1dddec493887847eb4e61c7f))


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 4 updates ([#37](https://github.com/chamvi/chamvi/issues/37)) ([655adfc](https://github.com/chamvi/chamvi/commit/655adfcb7807d233a218fc62458f52e92dda0853))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.1.0 to ^0.2.0
    * @chamvi/test-kit bumped from ^0.1.0 to ^0.2.0
  * peerDependencies
    * @chamvi/core bumped from ^0.1.0 to ^0.2.0
