# Changelog

## [0.12.1](https://github.com/chamvi/chamvi/compare/v0.12.0...v0.12.1) (2026-11-28)


### Features

* **core:** add ActorContext, the system actor and AbstractEntityService ([#325](https://github.com/chamvi/chamvi/issues/325)) ([32383b8](https://github.com/chamvi/chamvi/commit/32383b858c9bc4d421160151cfa42c42c76dde97))

## [0.12.0](https://github.com/chamvi/chamvi/compare/v0.11.0...v0.12.0) (2026-11-25)


### Bug Fixes

* ensure consistent version for release ([#311](https://github.com/chamvi/chamvi/issues/311)) ([f723e3a](https://github.com/chamvi/chamvi/commit/f723e3ac146a4895efa2f7cbf1f17cec4d51eee3))

## [0.11.0](https://github.com/chamvi/chamvi/compare/v0.10.0...v0.11.0) (2026-11-25)


### ⚠ BREAKING CHANGES

* own the chamvi permissions by the realm or the dashboard client ([#288](https://github.com/chamvi/chamvi/issues/288))
* **deps:** bump authup, routup, rapiq, validup and adopt their features ([#287](https://github.com/chamvi/chamvi/issues/287))

### Features

* own the chamvi permissions by the realm or the dashboard client ([#288](https://github.com/chamvi/chamvi/issues/288)) ([813c5d3](https://github.com/chamvi/chamvi/commit/813c5d3946b49ff1437ef4dbc8a63b440d2b4e7c))


### Bug Fixes

* **deps:** bump authup, routup, rapiq, validup and adopt their features ([#287](https://github.com/chamvi/chamvi/issues/287)) ([98cac0e](https://github.com/chamvi/chamvi/commit/98cac0ec18811859ced7f07dee8307b22bc3891a))

## [0.10.0](https://github.com/chamvi/chamvi/compare/v0.9.0...v0.10.0) (2026-11-20)


### Bug Fixes

* **deps:** bump authup to 1.0.0-beta.76 ([#244](https://github.com/chamvi/chamvi/issues/244)) ([4a04438](https://github.com/chamvi/chamvi/commit/4a04438a9cda88bfbd37ae07ad5eedc3f566b25f))

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


### ⚠ BREAKING CHANGES

* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236))
* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214))
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **access,knowledge,http:** the knowledge permission names.

### Features

* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214)) ([9bb9619](https://github.com/chamvi/chamvi/commit/9bb961913855b0dca5298f21affda2acf774a0af))
* **access,knowledge,http:** static knowledge permissions and review follow-ups ([#209](https://github.com/chamvi/chamvi/issues/209)) ([ae17b2e](https://github.com/chamvi/chamvi/commit/ae17b2ea9e1ce1e7eed8b0132ae0bfc78fd67370))
* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236)) ([ac9cc0b](https://github.com/chamvi/chamvi/commit/ac9cc0b80d1ef1e065694caa4b0379a7f8b3c4ea))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))
