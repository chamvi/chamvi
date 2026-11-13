# Changelog

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-13)


### ⚠ BREAKING CHANGES

* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222))
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **app,ui-kit:** the token format in `CHAMVI_TOKENS` and `chamvi.json`.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **app,ui-kit:** configure tokens as permission bindings ([#204](https://github.com/chamvi/chamvi/issues/204)) ([b715aa5](https://github.com/chamvi/chamvi/commit/b715aa55588097506ba062a4fb9d89999ced5400))
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222)) ([0d0fc35](https://github.com/chamvi/chamvi/commit/0d0fc3515da029944b0f0584e6b4dcbfb4f4f896))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.8.1
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0

## [0.8.0](https://github.com/chamvi/chamvi/compare/v0.7.3...v0.8.0) (2026-11-08)


### Bug Fixes

* ensure consistent version for release ([#178](https://github.com/chamvi/chamvi/issues/178)) ([98faf1a](https://github.com/chamvi/chamvi/commit/98faf1ad1e7b388509c1e81b31fef9070e50f939))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.7.3 to ^0.8.0
    * @chamvi/core bumped from ^0.7.3 to ^0.8.0
    * @chamvi/http bumped from ^0.7.3 to ^0.8.0
    * @chamvi/test-kit bumped from ^0.7.3 to ^0.8.0
  * peerDependencies
    * @chamvi/app bumped from ^0.7.3 to ^0.8.0
    * @chamvi/core bumped from ^0.7.3 to ^0.8.0
    * @chamvi/http bumped from ^0.7.3 to ^0.8.0

## [0.7.3](https://github.com/chamvi/chamvi/compare/v0.7.2...v0.7.3) (2026-11-05)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.7.2 to ^0.7.3
    * @chamvi/core bumped from ^0.7.2 to ^0.7.3
    * @chamvi/http bumped from ^0.7.2 to ^0.7.3
    * @chamvi/test-kit bumped from ^0.7.2 to ^0.7.3
  * peerDependencies
    * @chamvi/app bumped from ^0.7.2 to ^0.7.3
    * @chamvi/core bumped from ^0.7.2 to ^0.7.3
    * @chamvi/http bumped from ^0.7.2 to ^0.7.3

## [0.7.2](https://github.com/chamvi/chamvi/compare/v0.7.1...v0.7.2) (2026-11-05)


### Bug Fixes

* **deps:** bump minor and patch dependencies ([ea05be6](https://github.com/chamvi/chamvi/commit/ea05be6b3069e818d9c57c036186213d3ccff266))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.7.1 to ^0.7.2
    * @chamvi/core bumped from ^0.7.1 to ^0.7.2
    * @chamvi/http bumped from ^0.7.1 to ^0.7.2
    * @chamvi/test-kit bumped from ^0.7.1 to ^0.7.2
  * peerDependencies
    * @chamvi/app bumped from ^0.7.1 to ^0.7.2
    * @chamvi/core bumped from ^0.7.1 to ^0.7.2
    * @chamvi/http bumped from ^0.7.1 to ^0.7.2

## [0.7.1](https://github.com/chamvi/chamvi/compare/v0.7.0...v0.7.1) (2026-11-04)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.7.0 to ^0.7.1
    * @chamvi/core bumped from ^0.7.0 to ^0.7.1
    * @chamvi/http bumped from ^0.7.0 to ^0.7.1
    * @chamvi/test-kit bumped from ^0.7.0 to ^0.7.1
  * peerDependencies
    * @chamvi/app bumped from ^0.7.0 to ^0.7.1
    * @chamvi/core bumped from ^0.7.0 to ^0.7.1
    * @chamvi/http bumped from ^0.7.0 to ^0.7.1

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
    * @chamvi/core bumped from ^0.6.1 to ^0.7.0
    * @chamvi/http bumped from ^0.6.1 to ^0.7.0
    * @chamvi/test-kit bumped from ^0.6.1 to ^0.7.0
  * peerDependencies
    * @chamvi/app bumped from ^0.6.1 to ^0.7.0
    * @chamvi/core bumped from ^0.6.1 to ^0.7.0
    * @chamvi/http bumped from ^0.6.1 to ^0.7.0

## [0.6.1](https://github.com/chamvi/chamvi/compare/v0.6.0...v0.6.1) (2026-11-03)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.6.0 to ^0.6.1
    * @chamvi/core bumped from ^0.6.0 to ^0.6.1
    * @chamvi/http bumped from ^0.6.0 to ^0.6.1
    * @chamvi/test-kit bumped from ^0.6.0 to ^0.6.1
  * peerDependencies
    * @chamvi/app bumped from ^0.6.0 to ^0.6.1
    * @chamvi/core bumped from ^0.6.0 to ^0.6.1
    * @chamvi/http bumped from ^0.6.0 to ^0.6.1

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
    * @chamvi/app bumped from ^0.5.1 to ^0.6.0
    * @chamvi/core bumped from ^0.5.1 to ^0.6.0
    * @chamvi/http bumped from ^0.5.1 to ^0.6.0
    * @chamvi/test-kit bumped from ^0.5.1 to ^0.6.0
  * peerDependencies
    * @chamvi/app bumped from ^0.5.1 to ^0.6.0
    * @chamvi/core bumped from ^0.5.1 to ^0.6.0
    * @chamvi/http bumped from ^0.5.1 to ^0.6.0

## [0.5.1](https://github.com/chamvi/chamvi/compare/v0.5.0...v0.5.1) (2026-11-02)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.5.0 to ^0.5.1
    * @chamvi/core bumped from ^0.5.0 to ^0.5.1
    * @chamvi/http bumped from ^0.5.0 to ^0.5.1
    * @chamvi/test-kit bumped from ^0.5.0 to ^0.5.1
  * peerDependencies
    * @chamvi/app bumped from ^0.5.0 to ^0.5.1
    * @chamvi/core bumped from ^0.5.0 to ^0.5.1
    * @chamvi/http bumped from ^0.5.0 to ^0.5.1

## [0.5.0](https://github.com/chamvi/chamvi/compare/v0.4.0...v0.5.0) (2026-11-02)


### Features

* **chat:** add Chat SDK channels and WhatsApp Web ([#109](https://github.com/chamvi/chamvi/issues/109)) ([a0b5507](https://github.com/chamvi/chamvi/commit/a0b5507f24a8401f657c4cb571a25504bbe81ef2))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.4.0 to ^0.5.0
    * @chamvi/core bumped from ^0.4.0 to ^0.5.0
    * @chamvi/http bumped from ^0.4.0 to ^0.5.0
    * @chamvi/test-kit bumped from ^0.4.0 to ^0.5.0
  * peerDependencies
    * @chamvi/app bumped from ^0.4.0 to ^0.5.0
    * @chamvi/core bumped from ^0.4.0 to ^0.5.0
    * @chamvi/http bumped from ^0.4.0 to ^0.5.0
