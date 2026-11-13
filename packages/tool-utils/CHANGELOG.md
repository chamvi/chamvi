# Changelog

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-13)


### ⚠ BREAKING CHANGES

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **app,ui-kit:** the token format in `CHAMVI_TOKENS` and `chamvi.json`.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **app,ui-kit:** configure tokens as permission bindings ([#204](https://github.com/chamvi/chamvi/issues/204)) ([b715aa5](https://github.com/chamvi/chamvi/commit/b715aa55588097506ba062a4fb9d89999ced5400))
* **tool-utils:** add utility tools for time, dates and arithmetic ([#182](https://github.com/chamvi/chamvi/issues/182)) ([e071f4b](https://github.com/chamvi/chamvi/commit/e071f4b1d4aef7f4fd6122be7246b74aa03f91b5))


### Bug Fixes

* keep env secrets from stored accounts and close audit findings ([#198](https://github.com/chamvi/chamvi/issues/198)) ([f717a57](https://github.com/chamvi/chamvi/commit/f717a57725b2b532b1c3e4746b5a3fbd4c49e197))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.8.1
  * peerDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
