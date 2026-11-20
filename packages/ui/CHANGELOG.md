# Changelog

## [0.10.0](https://github.com/chamvi/chamvi/compare/v0.9.0...v0.10.0) (2026-11-20)


### Features

* **core:** run remote agents as stand-in runs ([#250](https://github.com/chamvi/chamvi/issues/250)) ([4cfc60e](https://github.com/chamvi/chamvi/commit/4cfc60e7556afbc11622c5c907622a7564a33d4c))
* **peer:** connect chamvi apps as peers ([#251](https://github.com/chamvi/chamvi/issues/251)) ([98d539b](https://github.com/chamvi/chamvi/commit/98d539b6d598ddb631406c3c7f441430a6a74abe))
* switch the brand to the Cobalt palette and Geist ([396a5ca](https://github.com/chamvi/chamvi/commit/396a5caa1dcc428d1eecd68a763077c23dc3d3bd))


### Bug Fixes

* **deps:** bump authup to 1.0.0-beta.76 ([#244](https://github.com/chamvi/chamvi/issues/244)) ([4a04438](https://github.com/chamvi/chamvi/commit/4a04438a9cda88bfbd37ae07ad5eedc3f566b25f))
* **deps:** bump the minorandpatch group across 1 directory with 34 updates ([#258](https://github.com/chamvi/chamvi/issues/258)) ([50866c4](https://github.com/chamvi/chamvi/commit/50866c4e5bab2152f8e6cf7c84ba80ca17833689))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/access bumped from ^0.9.0 to ^0.10.0
    * @chamvi/app bumped from ^0.9.0 to ^0.10.0
    * @chamvi/channel-cron bumped from ^0.9.0 to ^0.10.0
    * @chamvi/core bumped from ^0.9.0 to ^0.10.0
    * @chamvi/http bumped from ^0.9.0 to ^0.10.0
    * @chamvi/http-kit bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store-memory bumped from ^0.9.0 to ^0.10.0
    * @chamvi/test-kit bumped from ^0.9.0 to ^0.10.0
    * @chamvi/ui-kit bumped from ^0.9.0 to ^0.10.0
  * peerDependencies
    * @chamvi/app bumped from ^0.9.0 to ^0.10.0
    * @chamvi/core bumped from ^0.9.0 to ^0.10.0
    * @chamvi/http bumped from ^0.9.0 to ^0.10.0

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


### ⚠ BREAKING CHANGES

* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237))
* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236))
* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222))
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217))
* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214))
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **access,knowledge,http:** the knowledge permission names.
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205))
* **github-ui,chat-discord-ui,chat-whatsapp-ui:** an app using `whatsappModule()` must add `chatWhatsappUiModule()` to pair or re-pair.

### Features

* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214)) ([9bb9619](https://github.com/chamvi/chamvi/commit/9bb961913855b0dca5298f21affda2acf774a0af))
* **access,knowledge,http:** static knowledge permissions and review follow-ups ([#209](https://github.com/chamvi/chamvi/issues/209)) ([ae17b2e](https://github.com/chamvi/chamvi/commit/ae17b2ea9e1ce1e7eed8b0132ae0bfc78fd67370))
* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236)) ([ac9cc0b](https://github.com/chamvi/chamvi/commit/ac9cc0b80d1ef1e065694caa4b0379a7f8b3c4ea))
* **github-ui,chat-discord-ui,chat-whatsapp-ui:** add provider pages ([#191](https://github.com/chamvi/chamvi/issues/191)) ([be7f7c0](https://github.com/chamvi/chamvi/commit/be7f7c0c2dda8efc2a6af1abd68f407c2316c202))
* **http-kit,ui-kit,ui:** move the API client into @chamvi/http-kit ([#237](https://github.com/chamvi/chamvi/issues/237)) ([3b4054a](https://github.com/chamvi/chamvi/commit/3b4054a090144d6e4c43cbc5d06061735eeee275))
* **http,app:** let an app's modules contribute controllers ([#226](https://github.com/chamvi/chamvi/issues/226)) ([40c22ba](https://github.com/chamvi/chamvi/commit/40c22ba5f150ad0a3af05c55c65963f827d7bc63))
* **http,tool-mail,tool-calendar:** add the connection config API ([#185](https://github.com/chamvi/chamvi/issues/185)) ([96b1222](https://github.com/chamvi/chamvi/commit/96b1222171ada44ab5b35b42edd2f0d406789448))
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217)) ([708791a](https://github.com/chamvi/chamvi/commit/708791ac34ef3d51fd92f34dc7716fc9cbcebbc2))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222)) ([0d0fc35](https://github.com/chamvi/chamvi/commit/0d0fc3515da029944b0f0584e6b4dcbfb4f4f896))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))
* **tool-mail-ui,tool-calendar-ui:** add the mail and calendar pages ([#190](https://github.com/chamvi/chamvi/issues/190)) ([5d43bb9](https://github.com/chamvi/chamvi/commit/5d43bb9442f3735c130489220391c1f3cd14dc5d))
* **ui,ui-kit:** add the package sidebar and provider page serving ([#189](https://github.com/chamvi/chamvi/issues/189)) ([cafc140](https://github.com/chamvi/chamvi/commit/cafc1408a48bc9376e3dc3fbaecb693ecae8e191))
* **ui:** gate the dashboard with permission bindings ([#205](https://github.com/chamvi/chamvi/issues/205)) ([3611193](https://github.com/chamvi/chamvi/commit/361119317a7e9eff10a05c3cad997c7163285654))


### Bug Fixes

* close the 0.9.0 release review findings ([#240](https://github.com/chamvi/chamvi/issues/240)) ([ab400cd](https://github.com/chamvi/chamvi/commit/ab400cd55d185bd294f8c6ccc734a789b09b3397))
* **deps:** bump authup packages to 1.0.0-beta.74 ([1d7d6bd](https://github.com/chamvi/chamvi/commit/1d7d6bd7c00f759efb70513e42894d205ce3090e))
* harden connection create, tests and static serving ([#201](https://github.com/chamvi/chamvi/issues/201)) ([7f1518f](https://github.com/chamvi/chamvi/commit/7f1518fb9a1e4485960e404a25547fc23531c3c8))
* **http:** adopt routup decorators 5.1, body 4.1, swagger-ui 5, trapi 2.3 ([#224](https://github.com/chamvi/chamvi/issues/224)) ([556e569](https://github.com/chamvi/chamvi/commit/556e569207610bf2d9317ab830b3d2e5ab6f76bd))
* keep env secrets from stored accounts and close audit findings ([#198](https://github.com/chamvi/chamvi/issues/198)) ([f717a57](https://github.com/chamvi/chamvi/commit/f717a57725b2b532b1c3e4746b5a3fbd4c49e197))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))
* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/access bumped from ^0.8.0 to ^0.9.0
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/channel-cron bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http-kit bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
    * @chamvi/ui-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/app bumped from ^0.8.0 to ^0.9.0
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/http bumped from ^0.8.0 to ^0.9.0

## [0.8.0](https://github.com/chamvi/chamvi/compare/v0.7.3...v0.8.0) (2026-11-08)


### Features

* **ui:** pair WhatsApp connections in the dashboard ([#167](https://github.com/chamvi/chamvi/issues/167)) ([7e5191a](https://github.com/chamvi/chamvi/commit/7e5191aa96522022557f25303c3f59fa24cecad9))


### Bug Fixes

* distinguish uuid v7 run ids and document the 0.8 upgrade ([#176](https://github.com/chamvi/chamvi/issues/176)) ([bd15f1b](https://github.com/chamvi/chamvi/commit/bd15f1be483dcddcfe7bdada5993e8c0cf3f51ec))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.7.3 to ^0.8.0
    * @chamvi/channel-cron bumped from ^0.7.3 to ^0.8.0
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
    * @chamvi/channel-cron bumped from ^0.7.2 to ^0.7.3
    * @chamvi/core bumped from ^0.7.2 to ^0.7.3
    * @chamvi/http bumped from ^0.7.2 to ^0.7.3
    * @chamvi/test-kit bumped from ^0.7.2 to ^0.7.3
  * peerDependencies
    * @chamvi/app bumped from ^0.7.2 to ^0.7.3
    * @chamvi/core bumped from ^0.7.2 to ^0.7.3
    * @chamvi/http bumped from ^0.7.2 to ^0.7.3

## [0.7.2](https://github.com/chamvi/chamvi/compare/v0.7.1...v0.7.2) (2026-11-05)


### Features

* private agents readable only with agent:&lt;name&gt;:read ([#157](https://github.com/chamvi/chamvi/issues/157)) ([b0500ae](https://github.com/chamvi/chamvi/commit/b0500ae86e37e2fd78c3f4f48107a401ebe4bbda))


### Bug Fixes

* **deps:** bump minor and patch dependencies ([ea05be6](https://github.com/chamvi/chamvi/commit/ea05be6b3069e818d9c57c036186213d3ccff266))
* **ui:** add the logo as favicon ([#153](https://github.com/chamvi/chamvi/issues/153)) ([ceb2de6](https://github.com/chamvi/chamvi/commit/ceb2de6a332307caba7f8e0046c5171c3a37a6e2))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.7.1 to ^0.7.2
    * @chamvi/channel-cron bumped from ^0.7.1 to ^0.7.2
    * @chamvi/core bumped from ^0.7.1 to ^0.7.2
    * @chamvi/http bumped from ^0.7.1 to ^0.7.2
    * @chamvi/test-kit bumped from ^0.7.1 to ^0.7.2
  * peerDependencies
    * @chamvi/app bumped from ^0.7.1 to ^0.7.2
    * @chamvi/core bumped from ^0.7.1 to ^0.7.2
    * @chamvi/http bumped from ^0.7.1 to ^0.7.2

## [0.7.1](https://github.com/chamvi/chamvi/compare/v0.7.0...v0.7.1) (2026-11-04)


### Features

* switch the brand to Glacier and the seal logo ([#149](https://github.com/chamvi/chamvi/issues/149)) ([6b79ede](https://github.com/chamvi/chamvi/commit/6b79ede3f5ab2b02b1dfee58ab4e6143e144b02c))


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 3 updates ([#143](https://github.com/chamvi/chamvi/issues/143)) ([4da222f](https://github.com/chamvi/chamvi/commit/4da222f5a2acc4aa1ca400d18dc01f159596fdc0))
* **ui:** keep the authup session across a reload ([#150](https://github.com/chamvi/chamvi/issues/150)) ([0736e55](https://github.com/chamvi/chamvi/commit/0736e55c2b78268f818a8ad693eec6235fbb5be3))
* **ui:** pass the authup cookie path in the kit's normalized form ([5f96c67](https://github.com/chamvi/chamvi/commit/5f96c67dfb5d93042e872546905c3ef189d6c66b))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.7.0 to ^0.7.1
    * @chamvi/channel-cron bumped from ^0.7.0 to ^0.7.1
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
* **core:** generated dispatch tools and simple agents ([#136](https://github.com/chamvi/chamvi/issues/136))

### Features

* **core:** generated dispatch tools and simple agents ([#136](https://github.com/chamvi/chamvi/issues/136)) ([711ea7a](https://github.com/chamvi/chamvi/commit/711ea7abbe3126817222793d1f3a38edca30b95a))


### Code Refactoring

* replace defineAgent with defineModelAgent ([#140](https://github.com/chamvi/chamvi/issues/140)) ([96a0aa1](https://github.com/chamvi/chamvi/commit/96a0aa188da9af5f78ff65c41df0f0314e57418f))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.6.1 to ^0.7.0
    * @chamvi/channel-cron bumped from ^0.6.1 to ^0.7.0
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
    * @chamvi/channel-cron bumped from ^0.6.0 to ^0.6.1
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
* **core:** attach artifacts to approvals (keyed artifacts) ([#126](https://github.com/chamvi/chamvi/issues/126))

### Features

* **core:** attach artifacts to approvals (keyed artifacts) ([#126](https://github.com/chamvi/chamvi/issues/126)) ([94cf46b](https://github.com/chamvi/chamvi/commit/94cf46ba53ed714a2f8773ac6a5a5bd059cd1e00))
* **core:** awaited dispatch, cross-agent and deeper hand-offs, dispatch roles ([#130](https://github.com/chamvi/chamvi/issues/130)) ([562106c](https://github.com/chamvi/chamvi/commit/562106c09ed861d9ad12360110001f27aac29684))


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 17 updates ([#127](https://github.com/chamvi/chamvi/issues/127)) ([2829a3b](https://github.com/chamvi/chamvi/commit/2829a3b756ba21e267fcc7f50883bc4ac81cee44))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.5.1 to ^0.6.0
    * @chamvi/channel-cron bumped from ^0.5.1 to ^0.6.0
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
    * @chamvi/channel-cron bumped from ^0.5.0 to ^0.5.1
    * @chamvi/core bumped from ^0.5.0 to ^0.5.1
    * @chamvi/http bumped from ^0.5.0 to ^0.5.1
    * @chamvi/test-kit bumped from ^0.5.0 to ^0.5.1
  * peerDependencies
    * @chamvi/app bumped from ^0.5.0 to ^0.5.1
    * @chamvi/core bumped from ^0.5.0 to ^0.5.1
    * @chamvi/http bumped from ^0.5.0 to ^0.5.1

## [0.5.0](https://github.com/chamvi/chamvi/compare/v0.4.0...v0.5.0) (2026-11-02)


### ⚠ BREAKING CHANGES

* require node 26 and run ci on one version ([#113](https://github.com/chamvi/chamvi/issues/113))

### Build System

* require node 26 and run ci on one version ([#113](https://github.com/chamvi/chamvi/issues/113)) ([0bf352f](https://github.com/chamvi/chamvi/commit/0bf352f63e3f13433396e6ba12ae3b667f8746e4))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.4.0 to ^0.5.0
    * @chamvi/channel-cron bumped from ^0.4.0 to ^0.5.0
    * @chamvi/core bumped from ^0.4.0 to ^0.5.0
    * @chamvi/http bumped from ^0.4.0 to ^0.5.0
    * @chamvi/test-kit bumped from ^0.4.0 to ^0.5.0
  * peerDependencies
    * @chamvi/app bumped from ^0.4.0 to ^0.5.0
    * @chamvi/core bumped from ^0.4.0 to ^0.5.0
    * @chamvi/http bumped from ^0.4.0 to ^0.5.0

## [0.4.0](https://github.com/chamvi/chamvi/compare/v0.3.1...v0.4.0) (2026-11-01)


### ⚠ BREAKING CHANGES

* **store-db,core:** migrations from the pre-release window are replaced by `ConversationsRunTaint1792713600000`, so recreate or reconcile development databases. Writes for unknown runs reject with `RunNotFoundError`. Upgrading from 0.3 needs downtime, as described in the upgrade guide.
* Node.js 22 is no longer supported. All packages require Node.js >=24.3.0.
* add durable conversation memory and composable repositories ([#96](https://github.com/chamvi/chamvi/issues/96))

### Features

* add durable conversation memory and composable repositories ([#96](https://github.com/chamvi/chamvi/issues/96)) ([a183f1c](https://github.com/chamvi/chamvi/commit/a183f1c723b573603ee50533dd4ff25fc2efcc20))
* gate untrusted runs and add allowlisted file proposals ([#101](https://github.com/chamvi/chamvi/issues/101)) ([d49d07f](https://github.com/chamvi/chamvi/commit/d49d07f7b3555100857207abe778ce238b2cfe49))


### Bug Fixes

* **deps:** bump authup to 1.0.0-beta.72, vuecs, ilingo, vueuse 15, nx 24 and @types/node 26 ([0582ff2](https://github.com/chamvi/chamvi/commit/0582ff263dc48d7d339dbccf51d4fc7c68bb744f))
* **store-db,core:** bundle the 0.4 migrations and finish the release audit ([#105](https://github.com/chamvi/chamvi/issues/105)) ([d8c671a](https://github.com/chamvi/chamvi/commit/d8c671a0afc81d85b0bcf627206b0cf74f5cb580))


### Build System

* upgrade eslint config to 3.2.0 and require Node 24 ([00fa9b4](https://github.com/chamvi/chamvi/commit/00fa9b463c9e78ec783d3352c8ba8d16b7191758))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.3.1 to ^0.4.0
    * @chamvi/channel-cron bumped from ^0.3.1 to ^0.4.0
    * @chamvi/core bumped from ^0.3.1 to ^0.4.0
    * @chamvi/http bumped from ^0.3.1 to ^0.4.0
    * @chamvi/test-kit bumped from ^0.3.1 to ^0.4.0
  * peerDependencies
    * @chamvi/app bumped from ^0.3.1 to ^0.4.0
    * @chamvi/core bumped from ^0.3.1 to ^0.4.0
    * @chamvi/http bumped from ^0.3.1 to ^0.4.0

## [0.3.1](https://github.com/chamvi/chamvi/compare/v0.3.0...v0.3.1) (2026-10-27)


### Features

* **core:** approvals with options ([#65](https://github.com/chamvi/chamvi/issues/65)) ([994da69](https://github.com/chamvi/chamvi/commit/994da698399a0b3c08e7aa9d3d4a55f82ff23169))
* **core:** start runs of the same agent from a tool ([#64](https://github.com/chamvi/chamvi/issues/64)) ([083c385](https://github.com/chamvi/chamvi/commit/083c3852f1a0c494193e9e6ae36ca5739d1b275c))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.3.0 to ^0.3.1
    * @chamvi/channel-cron bumped from ^0.2.2 to ^0.3.1
    * @chamvi/core bumped from ^0.3.0 to ^0.3.1
    * @chamvi/http bumped from ^0.2.2 to ^0.3.1
    * @chamvi/test-kit bumped from ^0.3.0 to ^0.3.1
  * peerDependencies
    * @chamvi/app bumped from ^0.3.0 to ^0.3.1
    * @chamvi/core bumped from ^0.3.0 to ^0.3.1
    * @chamvi/http bumped from ^0.2.2 to ^0.3.1

## [0.3.0](https://github.com/chamvi/chamvi/compare/v0.2.1...v0.3.0) (2026-10-26)


### ⚠ BREAKING CHANGES

* **app:** resolve models through declared providers and add chamvi doctor ([#58](https://github.com/chamvi/chamvi/issues/58))

### Features

* **app:** resolve models through declared providers and add chamvi doctor ([#58](https://github.com/chamvi/chamvi/issues/58)) ([04309b9](https://github.com/chamvi/chamvi/commit/04309b93b217c270639d0951eb1d5f00009d4ce0))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.2.1 to ^0.3.0
    * @chamvi/channel-cron bumped from ^0.2.1 to ^0.2.2
    * @chamvi/core bumped from ^0.2.1 to ^0.3.0
    * @chamvi/http bumped from ^0.2.1 to ^0.2.2
    * @chamvi/test-kit bumped from ^0.2.1 to ^0.3.0
  * peerDependencies
    * @chamvi/app bumped from ^0.2.1 to ^0.3.0
    * @chamvi/core bumped from ^0.2.1 to ^0.3.0
    * @chamvi/http bumped from ^0.2.1 to ^0.2.2

## [0.2.1](https://github.com/chamvi/chamvi/compare/v0.2.0...v0.2.1) (2026-10-25)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.2.0 to ^0.2.1
    * @chamvi/channel-cron bumped from ^0.2.0 to ^0.2.1
    * @chamvi/core bumped from ^0.2.0 to ^0.2.1
    * @chamvi/http bumped from ^0.2.0 to ^0.2.1
    * @chamvi/test-kit bumped from ^0.2.0 to ^0.2.1
  * peerDependencies
    * @chamvi/app bumped from ^0.2.0 to ^0.2.1
    * @chamvi/core bumped from ^0.2.0 to ^0.2.1
    * @chamvi/http bumped from ^0.2.0 to ^0.2.1

## [0.2.0](https://github.com/chamvi/chamvi/compare/ui-v0.1.0...ui-v0.2.0) (2026-10-25)


### ⚠ BREAKING CHANGES

* provider/model strings, entry-less apps and approvals without resume tokens ([#38](https://github.com/chamvi/chamvi/issues/38))
* replace triggers and notifiers with channels ([#36](https://github.com/chamvi/chamvi/issues/36))
* add agent folders and a live agent registry ([#34](https://github.com/chamvi/chamvi/issues/34))

### Features

* add @chamvi/app and @chamvi/cli ([#29](https://github.com/chamvi/chamvi/issues/29)) ([b6f618f](https://github.com/chamvi/chamvi/commit/b6f618f1fbefe76d7afa075d2e644bf1745c7c98))
* add agent folders and a live agent registry ([#34](https://github.com/chamvi/chamvi/issues/34)) ([fe96152](https://github.com/chamvi/chamvi/commit/fe9615226c3ca2af96457d9fa9ffa03dc46c20b2))
* add the web ui ([#25](https://github.com/chamvi/chamvi/issues/25)) ([27d7642](https://github.com/chamvi/chamvi/commit/27d7642abb3faeefddde3153bc4a72f15c6afac6))
* provider/model strings, entry-less apps and approvals without resume tokens ([#38](https://github.com/chamvi/chamvi/issues/38)) ([9ce771e](https://github.com/chamvi/chamvi/commit/9ce771ed4255e667d5592e70239ef6f44f937afe))
* replace triggers and notifiers with channels ([#36](https://github.com/chamvi/chamvi/issues/36)) ([78e8e7e](https://github.com/chamvi/chamvi/commit/78e8e7edc02e21da1dddec493887847eb4e61c7f))
* switch to self-hosted instrument sans and jetbrains mono ([7942db1](https://github.com/chamvi/chamvi/commit/7942db125d6e2325f665503403dfa71381303e88))


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 4 updates ([#37](https://github.com/chamvi/chamvi/issues/37)) ([655adfc](https://github.com/chamvi/chamvi/commit/655adfcb7807d233a218fc62458f52e92dda0853))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/app bumped from ^0.1.0 to ^0.2.0
    * @chamvi/channel-cron bumped from ^0.1.0 to ^0.2.0
    * @chamvi/core bumped from ^0.1.0 to ^0.2.0
    * @chamvi/http bumped from ^0.1.0 to ^0.2.0
    * @chamvi/test-kit bumped from ^0.1.0 to ^0.2.0
  * peerDependencies
    * @chamvi/app bumped from ^0.1.0 to ^0.2.0
    * @chamvi/core bumped from ^0.1.0 to ^0.2.0
    * @chamvi/http bumped from ^0.1.0 to ^0.2.0
