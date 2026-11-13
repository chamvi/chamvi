# Changelog

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-13)


### ⚠ BREAKING CHANGES

* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222))
* **app,ui-kit:** the token format in `CHAMVI_TOKENS` and `chamvi.json`.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **app,ui-kit:** configure tokens as permission bindings ([#204](https://github.com/chamvi/chamvi/issues/204)) ([b715aa5](https://github.com/chamvi/chamvi/commit/b715aa55588097506ba062a4fb9d89999ced5400))
* **http,tool-mail,tool-calendar:** add the connection config API ([#185](https://github.com/chamvi/chamvi/issues/185)) ([96b1222](https://github.com/chamvi/chamvi/commit/96b1222171ada44ab5b35b42edd2f0d406789448))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222)) ([0d0fc35](https://github.com/chamvi/chamvi/commit/0d0fc3515da029944b0f0584e6b4dcbfb4f4f896))


### Bug Fixes

* harden connection create, tests and static serving ([#201](https://github.com/chamvi/chamvi/issues/201)) ([7f1518f](https://github.com/chamvi/chamvi/commit/7f1518fb9a1e4485960e404a25547fc23531c3c8))
* keep env secrets from stored accounts and close audit findings ([#198](https://github.com/chamvi/chamvi/issues/198)) ([f717a57](https://github.com/chamvi/chamvi/commit/f717a57725b2b532b1c3e4746b5a3fbd4c49e197))


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

## [0.7.2](https://github.com/chamvi/chamvi/compare/v0.7.1...v0.7.2) (2026-11-05)


### Features

* **tool-calendar:** add read-only CalDAV calendar tools ([#159](https://github.com/chamvi/chamvi/issues/159)) ([a4f1ced](https://github.com/chamvi/chamvi/commit/a4f1ced2d54570dc04b06eadad289e1009fdbb13))


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
