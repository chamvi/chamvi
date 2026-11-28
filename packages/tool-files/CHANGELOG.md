# Changelog

## [0.13.0](https://github.com/chamvi/chamvi/compare/v0.12.0...v0.13.0) (2026-11-28)


### ⚠ BREAKING CHANGES

* **core:** move the domain rules to @chamvi/core-kit ([#322](https://github.com/chamvi/chamvi/issues/322))
* add @chamvi/core-kit ([#321](https://github.com/chamvi/chamvi/issues/321))
* add @chamvi/errors ([#319](https://github.com/chamvi/chamvi/issues/319))

### Features

* add @chamvi/core-kit ([#321](https://github.com/chamvi/chamvi/issues/321)) ([f1df1cd](https://github.com/chamvi/chamvi/commit/f1df1cdac762082478aea30182cbbf9002e18da5))
* add @chamvi/errors ([#319](https://github.com/chamvi/chamvi/issues/319)) ([4eef92f](https://github.com/chamvi/chamvi/commit/4eef92f2501207a86e605431e19f55337dfcaac5))


### Code Refactoring

* **core:** move the domain rules to @chamvi/core-kit ([#322](https://github.com/chamvi/chamvi/issues/322)) ([0ceb9ca](https://github.com/chamvi/chamvi/commit/0ceb9ca3c42bb2faf5757a0580ad11f415e590dd))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.12.0 to ^0.13.0
    * @chamvi/core-kit bumped from ^0.12.0 to ^0.13.0
    * @chamvi/errors bumped from ^0.12.0 to ^0.13.0
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
    * @chamvi/test-kit bumped from ^0.10.0 to ^0.11.0
  * peerDependencies
    * @chamvi/core bumped from ^0.10.0 to ^0.11.0
    * @chamvi/store bumped from ^0.10.0 to ^0.11.0

## [0.10.0](https://github.com/chamvi/chamvi/compare/v0.9.0...v0.10.0) (2026-11-20)


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 34 updates ([#258](https://github.com/chamvi/chamvi/issues/258)) ([50866c4](https://github.com/chamvi/chamvi/commit/50866c4e5bab2152f8e6cf7c84ba80ca17833689))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store bumped from ^0.9.0 to ^0.10.0
    * @chamvi/test-kit bumped from ^0.9.0 to ^0.10.0
  * peerDependencies
    * @chamvi/core bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store bumped from ^0.9.0 to ^0.10.0

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


### ⚠ BREAKING CHANGES

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
