# Changelog

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-13)


### ⚠ BREAKING CHANGES

* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217))
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205))
* **github-ui,chat-discord-ui,chat-whatsapp-ui:** an app using `whatsappModule()` must add `chatWhatsappUiModule()` to pair or re-pair.

### Features

* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **github-ui,chat-discord-ui,chat-whatsapp-ui:** add provider pages ([#191](https://github.com/chamvi/chamvi/issues/191)) ([be7f7c0](https://github.com/chamvi/chamvi/commit/be7f7c0c2dda8efc2a6af1abd68f407c2316c202))
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217)) ([708791a](https://github.com/chamvi/chamvi/commit/708791ac34ef3d51fd92f34dc7716fc9cbcebbc2))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205)) ([3611193](https://github.com/chamvi/chamvi/commit/361119317a7e9eff10a05c3cad997c7163285654))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/ui-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
