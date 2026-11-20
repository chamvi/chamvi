# Changelog

## [0.10.0](https://github.com/chamvi/chamvi/compare/v0.9.0...v0.10.0) (2026-11-20)


### ⚠ BREAKING CHANGES

* issue lock fencing tokens and harden knowledge passes ([#259](https://github.com/chamvi/chamvi/issues/259))
* identify connection rows by generation and refuse stale saves ([#243](https://github.com/chamvi/chamvi/issues/243))

### Features

* **core:** run remote agents as stand-in runs ([#250](https://github.com/chamvi/chamvi/issues/250)) ([4cfc60e](https://github.com/chamvi/chamvi/commit/4cfc60e7556afbc11622c5c907622a7564a33d4c))
* identify connection rows by generation and refuse stale saves ([#243](https://github.com/chamvi/chamvi/issues/243)) ([5f14b6c](https://github.com/chamvi/chamvi/commit/5f14b6c564227231fefe62eb154fbb2e69bffb22))
* issue lock fencing tokens and harden knowledge passes ([#259](https://github.com/chamvi/chamvi/issues/259)) ([52384cd](https://github.com/chamvi/chamvi/commit/52384cdb36e3029935e2b773dd0858993adf5056))


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 34 updates ([#258](https://github.com/chamvi/chamvi/issues/258)) ([50866c4](https://github.com/chamvi/chamvi/commit/50866c4e5bab2152f8e6cf7c84ba80ca17833689))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/access bumped from ^0.9.0 to ^0.10.0

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


### ⚠ BREAKING CHANGES

* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.

### Features

* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/access bumped from ^0.8.0 to ^0.9.0
