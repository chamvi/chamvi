# Changelog

## [0.11.0](https://github.com/chamvi/chamvi/compare/v0.10.0...v0.11.0) (2026-11-25)


### ⚠ BREAKING CHANGES

* **deps:** bump authup, routup, rapiq, validup and adopt their features ([#287](https://github.com/chamvi/chamvi/issues/287))

### Features

* adopt authup and vuecs features and filter runs by date ([#298](https://github.com/chamvi/chamvi/issues/298)) ([76c1b42](https://github.com/chamvi/chamvi/commit/76c1b42faf75fb1f9a7fb0be56ccf36bef848bda))
* **store:** add the limit use aggregate for tool rate limits ([#291](https://github.com/chamvi/chamvi/issues/291)) ([15ac793](https://github.com/chamvi/chamvi/commit/15ac7930918f4b1e3a9fcc8adf1c164b8755e237))


### Bug Fixes

* **deps:** bump authup, routup, rapiq, validup and adopt their features ([#287](https://github.com/chamvi/chamvi/issues/287)) ([98cac0e](https://github.com/chamvi/chamvi/commit/98cac0ec18811859ced7f07dee8307b22bc3891a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/store bumped from ^0.10.0 to ^0.11.0

## [0.10.0](https://github.com/chamvi/chamvi/compare/v0.9.0...v0.10.0) (2026-11-20)


### ⚠ BREAKING CHANGES

* issue lock fencing tokens and harden knowledge passes ([#259](https://github.com/chamvi/chamvi/issues/259))

### Features

* issue lock fencing tokens and harden knowledge passes ([#259](https://github.com/chamvi/chamvi/issues/259)) ([52384cd](https://github.com/chamvi/chamvi/commit/52384cdb36e3029935e2b773dd0858993adf5056))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/store bumped from ^0.9.0 to ^0.10.0

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


### ⚠ BREAKING CHANGES

* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.

### Features

* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))


### Bug Fixes

* **store-memory:** match a list condition with a set lookup ([07c9149](https://github.com/chamvi/chamvi/commit/07c9149326bc222abf28dc4b14a1fe1fd0599908))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
