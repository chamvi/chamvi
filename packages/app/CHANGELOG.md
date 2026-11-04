# Changelog

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
