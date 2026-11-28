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
    * @chamvi/app bumped from ^0.12.0 to ^0.13.0
    * @chamvi/core bumped from ^0.12.0 to ^0.13.0
    * @chamvi/http bumped from ^0.12.0 to ^0.13.0
    * @chamvi/http-kit bumped from ^0.12.0 to ^0.13.0
    * @chamvi/tool-mail bumped from ^0.12.0 to ^0.13.0
    * @chamvi/ui bumped from ^0.12.0 to ^0.13.0
    * @chamvi/ui-kit bumped from ^0.12.0 to ^0.13.0
  * peerDependencies
    * @chamvi/app bumped from ^0.12.0 to ^0.13.0

## [0.12.0](https://github.com/chamvi/chamvi/compare/v0.11.0...v0.12.0) (2026-11-25)


### ⚠ BREAKING CHANGES

* name env variables after what they configure ([#310](https://github.com/chamvi/chamvi/issues/310))

### Features

* name env variables after what they configure ([#310](https://github.com/chamvi/chamvi/issues/310)) ([64628eb](https://github.com/chamvi/chamvi/commit/64628eb27c4543e8bad96c0318f769b3c6b67231))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.11.0 to ^0.12.0
    * @chamvi/core bumped from ^0.11.0 to ^0.12.0
    * @chamvi/http bumped from ^0.11.0 to ^0.12.0
    * @chamvi/http-kit bumped from ^0.11.0 to ^0.12.0
    * @chamvi/tool-mail bumped from ^0.11.0 to ^0.12.0
    * @chamvi/ui bumped from ^0.11.0 to ^0.12.0
    * @chamvi/ui-kit bumped from ^0.11.0 to ^0.12.0
  * peerDependencies
    * @chamvi/app bumped from ^0.11.0 to ^0.12.0

## [0.11.0](https://github.com/chamvi/chamvi/compare/v0.10.0...v0.11.0) (2026-11-25)


### ⚠ BREAKING CHANGES

* **deps:** bump authup, routup, rapiq, validup and adopt their features ([#287](https://github.com/chamvi/chamvi/issues/287))

### Bug Fixes

* **deps:** bump authup, routup, rapiq, validup and adopt their features ([#287](https://github.com/chamvi/chamvi/issues/287)) ([98cac0e](https://github.com/chamvi/chamvi/commit/98cac0ec18811859ced7f07dee8307b22bc3891a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.10.0 to ^0.11.0
    * @chamvi/core bumped from ^0.10.0 to ^0.11.0
    * @chamvi/http bumped from ^0.10.0 to ^0.11.0
    * @chamvi/http-kit bumped from ^0.10.0 to ^0.11.0
    * @chamvi/tool-mail bumped from ^0.10.0 to ^0.11.0
    * @chamvi/ui bumped from ^0.10.0 to ^0.11.0
    * @chamvi/ui-kit bumped from ^0.10.0 to ^0.11.0
  * peerDependencies
    * @chamvi/app bumped from ^0.10.0 to ^0.11.0

## [0.10.0](https://github.com/chamvi/chamvi/compare/v0.9.0...v0.10.0) (2026-11-20)


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 34 updates ([#258](https://github.com/chamvi/chamvi/issues/258)) ([50866c4](https://github.com/chamvi/chamvi/commit/50866c4e5bab2152f8e6cf7c84ba80ca17833689))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.9.0 to ^0.10.0
    * @chamvi/core bumped from ^0.9.0 to ^0.10.0
    * @chamvi/http bumped from ^0.9.0 to ^0.10.0
    * @chamvi/http-kit bumped from ^0.9.0 to ^0.10.0
    * @chamvi/tool-mail bumped from ^0.9.0 to ^0.10.0
    * @chamvi/ui bumped from ^0.9.0 to ^0.10.0
    * @chamvi/ui-kit bumped from ^0.9.0 to ^0.10.0
  * peerDependencies
    * @chamvi/app bumped from ^0.9.0 to ^0.10.0

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


### ⚠ BREAKING CHANGES

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
