# Changelog

## [0.13.0](https://github.com/chamvi/chamvi/compare/v0.12.0...v0.13.0) (2026-11-28)


### ⚠ BREAKING CHANGES

* **core:** check run, state and connection permissions in core's services ([#326](https://github.com/chamvi/chamvi/issues/326))
* **store-db:** uuid v7 primary keys for steps, conversation items and lock tokens ([#324](https://github.com/chamvi/chamvi/issues/324))
* **core:** move the domain rules to @chamvi/core-kit ([#322](https://github.com/chamvi/chamvi/issues/322))
* add @chamvi/core-kit ([#321](https://github.com/chamvi/chamvi/issues/321))
* add @chamvi/errors ([#319](https://github.com/chamvi/chamvi/issues/319))

### Features

* add @chamvi/core-kit ([#321](https://github.com/chamvi/chamvi/issues/321)) ([f1df1cd](https://github.com/chamvi/chamvi/commit/f1df1cdac762082478aea30182cbbf9002e18da5))
* add @chamvi/errors ([#319](https://github.com/chamvi/chamvi/issues/319)) ([4eef92f](https://github.com/chamvi/chamvi/commit/4eef92f2501207a86e605431e19f55337dfcaac5))
* **core-kit:** validate request bodies with zod validators ([#323](https://github.com/chamvi/chamvi/issues/323)) ([cdc5246](https://github.com/chamvi/chamvi/commit/cdc52467f00eb5d1d0d058328d06b738b6a87579))
* **core:** add ActorContext, the system actor and AbstractEntityService ([#325](https://github.com/chamvi/chamvi/issues/325)) ([32383b8](https://github.com/chamvi/chamvi/commit/32383b858c9bc4d421160151cfa42c42c76dde97))
* **core:** check run, state and connection permissions in core's services ([#326](https://github.com/chamvi/chamvi/issues/326)) ([f70d918](https://github.com/chamvi/chamvi/commit/f70d91862643b789fa07cd99269166914b24376e))
* **store-db:** uuid v7 primary keys for steps, conversation items and lock tokens ([#324](https://github.com/chamvi/chamvi/issues/324)) ([9c20832](https://github.com/chamvi/chamvi/commit/9c20832eb8fe24006f9e463d75006353daed4994))


### Code Refactoring

* **core:** move the domain rules to @chamvi/core-kit ([#322](https://github.com/chamvi/chamvi/issues/322)) ([0ceb9ca](https://github.com/chamvi/chamvi/commit/0ceb9ca3c42bb2faf5757a0580ad11f415e590dd))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/access bumped from ^0.12.0 to ^0.12.1
  * devDependencies
    * @chamvi/core bumped from ^0.12.0 to ^0.13.0
    * @chamvi/core-kit bumped from ^0.12.0 to ^0.13.0
    * @chamvi/errors bumped from ^0.12.0 to ^0.13.0
    * @chamvi/store-memory bumped from ^0.12.0 to ^0.13.0
    * @chamvi/test-kit bumped from ^0.12.0 to ^0.13.0
  * peerDependencies
    * @chamvi/core bumped from ^0.12.0 to ^0.13.0
    * @chamvi/core-kit bumped from ^0.12.0 to ^0.13.0
    * @chamvi/errors bumped from ^0.12.0 to ^0.13.0

## [0.12.0](https://github.com/chamvi/chamvi/compare/v0.11.0...v0.12.0) (2026-11-25)


### ⚠ BREAKING CHANGES

* name env variables after what they configure ([#310](https://github.com/chamvi/chamvi/issues/310))

### Features

* name env variables after what they configure ([#310](https://github.com/chamvi/chamvi/issues/310)) ([64628eb](https://github.com/chamvi/chamvi/commit/64628eb27c4543e8bad96c0318f769b3c6b67231))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/access bumped from ^0.11.0 to ^0.12.0
  * devDependencies
    * @chamvi/core bumped from ^0.11.0 to ^0.12.0
    * @chamvi/store bumped from ^0.11.0 to ^0.12.0
    * @chamvi/store-memory bumped from ^0.11.0 to ^0.12.0
    * @chamvi/test-kit bumped from ^0.11.0 to ^0.12.0
  * peerDependencies
    * @chamvi/core bumped from ^0.11.0 to ^0.12.0
    * @chamvi/store bumped from ^0.11.0 to ^0.12.0

## [0.11.0](https://github.com/chamvi/chamvi/compare/v0.10.0...v0.11.0) (2026-11-25)


### ⚠ BREAKING CHANGES

* own the chamvi permissions by the realm or the dashboard client ([#288](https://github.com/chamvi/chamvi/issues/288))
* **deps:** bump authup, routup, rapiq, validup and adopt their features ([#287](https://github.com/chamvi/chamvi/issues/287))

### Features

* adopt authup and vuecs features and filter runs by date ([#298](https://github.com/chamvi/chamvi/issues/298)) ([76c1b42](https://github.com/chamvi/chamvi/commit/76c1b42faf75fb1f9a7fb0be56ccf36bef848bda))
* own the chamvi permissions by the realm or the dashboard client ([#288](https://github.com/chamvi/chamvi/issues/288)) ([813c5d3](https://github.com/chamvi/chamvi/commit/813c5d3946b49ff1437ef4dbc8a63b440d2b4e7c))


### Bug Fixes

* **deps:** bump authup, routup, rapiq, validup and adopt their features ([#287](https://github.com/chamvi/chamvi/issues/287)) ([98cac0e](https://github.com/chamvi/chamvi/commit/98cac0ec18811859ced7f07dee8307b22bc3891a))
* **deps:** bump the minorandpatch group across 1 directory with 4 updates ([#279](https://github.com/chamvi/chamvi/issues/279)) ([02cce84](https://github.com/chamvi/chamvi/commit/02cce84e56cedec3ffe38b5c19ea806c3e6065a1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/access bumped from ^0.10.0 to ^0.11.0
  * devDependencies
    * @chamvi/core bumped from ^0.10.0 to ^0.11.0
    * @chamvi/store bumped from ^0.10.0 to ^0.11.0
    * @chamvi/store-memory bumped from ^0.10.0 to ^0.11.0
    * @chamvi/test-kit bumped from ^0.10.0 to ^0.11.0
  * peerDependencies
    * @chamvi/core bumped from ^0.10.0 to ^0.11.0
    * @chamvi/store bumped from ^0.10.0 to ^0.11.0

## [0.10.0](https://github.com/chamvi/chamvi/compare/v0.9.0...v0.10.0) (2026-11-20)


### ⚠ BREAKING CHANGES

* issue lock fencing tokens and harden knowledge passes ([#259](https://github.com/chamvi/chamvi/issues/259))
* identify connection rows by generation and refuse stale saves ([#243](https://github.com/chamvi/chamvi/issues/243))

### Features

* **core:** run remote agents as stand-in runs ([#250](https://github.com/chamvi/chamvi/issues/250)) ([4cfc60e](https://github.com/chamvi/chamvi/commit/4cfc60e7556afbc11622c5c907622a7564a33d4c))
* identify connection rows by generation and refuse stale saves ([#243](https://github.com/chamvi/chamvi/issues/243)) ([5f14b6c](https://github.com/chamvi/chamvi/commit/5f14b6c564227231fefe62eb154fbb2e69bffb22))
* issue lock fencing tokens and harden knowledge passes ([#259](https://github.com/chamvi/chamvi/issues/259)) ([52384cd](https://github.com/chamvi/chamvi/commit/52384cdb36e3029935e2b773dd0858993adf5056))
* **peer:** connect chamvi apps as peers ([#251](https://github.com/chamvi/chamvi/issues/251)) ([98d539b](https://github.com/chamvi/chamvi/commit/98d539b6d598ddb631406c3c7f441430a6a74abe))


### Bug Fixes

* **core:** cancel lost remote starts, validate peer views and fail refused polls ([#277](https://github.com/chamvi/chamvi/issues/277)) ([ee33360](https://github.com/chamvi/chamvi/commit/ee333605660b92d4c72befc9a223a2c91a21f67f))
* **deps:** bump authup to 1.0.0-beta.76 ([#244](https://github.com/chamvi/chamvi/issues/244)) ([4a04438](https://github.com/chamvi/chamvi/commit/4a04438a9cda88bfbd37ae07ad5eedc3f566b25f))
* **deps:** bump the minorandpatch group across 1 directory with 34 updates ([#258](https://github.com/chamvi/chamvi/issues/258)) ([50866c4](https://github.com/chamvi/chamvi/commit/50866c4e5bab2152f8e6cf7c84ba80ca17833689))
* remote agent follow-ups and findOneBy bind limit splitting ([#276](https://github.com/chamvi/chamvi/issues/276)) ([dbdc213](https://github.com/chamvi/chamvi/commit/dbdc2138479ae1e04240f01d8f611515c7dec221))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/access bumped from ^0.9.0 to ^0.10.0
  * devDependencies
    * @chamvi/core bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store-memory bumped from ^0.9.0 to ^0.10.0
    * @chamvi/test-kit bumped from ^0.9.0 to ^0.10.0
  * peerDependencies
    * @chamvi/core bumped from ^0.9.0 to ^0.10.0
    * @chamvi/store bumped from ^0.9.0 to ^0.10.0

## [0.9.0](https://github.com/chamvi/chamvi/compare/v0.8.0...v0.9.0) (2026-11-18)


### ⚠ BREAKING CHANGES

* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236))
* IClock.now() returns epoch milliseconds (a number), not a Date. IClock.setTimeout(fn, ms) takes no options and returns ClockTimer { clear(), unref?() }; ClockTimerOptions is removed. Timers of systemClock hold the process unless unref() is called (chamvi's own timers unref). ControllableClock.now() returns milliseconds.
* IStore, createMemoryStore(), createDatabaseStore(), engine.store and describeRepositoryContract() are removed. An engine takes services, a custom store implements the ports of @chamvi/store, and a start with CHAMVI_MIGRATE=false refuses an unmigrated store.
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222))
* **http:** serve the REST API from controllers over services ([#220](https://github.com/chamvi/chamvi/issues/220))
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217))
* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214))
* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212))
* **access,knowledge,http:** the knowledge permission names.
* **core,http:** permission names and the shape of `permissions` on principals, invokers, static tokens and the `oidc()` mapper.

### Features

* **access,core,http,app,ui-kit:** carry authup authorization snapshots and bound authup calls ([#214](https://github.com/chamvi/chamvi/issues/214)) ([9bb9619](https://github.com/chamvi/chamvi/commit/9bb961913855b0dca5298f21affda2acf774a0af))
* **access,knowledge,http:** static knowledge permissions and review follow-ups ([#209](https://github.com/chamvi/chamvi/issues/209)) ([ae17b2e](https://github.com/chamvi/chamvi/commit/ae17b2ea9e1ce1e7eed8b0132ae0bfc78fd67370))
* **access:** add the permission check over authup bindings ([#202](https://github.com/chamvi/chamvi/issues/202)) ([9304038](https://github.com/chamvi/chamvi/commit/930403896b0db5e7bc3c34b9230dabdefca7c17c))
* **core,http,app,knowledge,channel-cron,ui:** run background jobs as hubwire components and list their status ([#236](https://github.com/chamvi/chamvi/issues/236)) ([ac9cc0b](https://github.com/chamvi/chamvi/commit/ac9cc0b80d1ef1e065694caa4b0379a7f8b3c4ea))
* **core,http:** check static permissions with authup policies ([#203](https://github.com/chamvi/chamvi/issues/203)) ([f66a41f](https://github.com/chamvi/chamvi/commit/f66a41f08f6050024209ab307b0805b204ff9d93))
* **http,app:** let an app's modules contribute controllers ([#226](https://github.com/chamvi/chamvi/issues/226)) ([40c22ba](https://github.com/chamvi/chamvi/commit/40c22ba5f150ad0a3af05c55c65963f827d7bc63))
* **http,tool-mail,tool-calendar:** add the connection config API ([#185](https://github.com/chamvi/chamvi/issues/185)) ([96b1222](https://github.com/chamvi/chamvi/commit/96b1222171ada44ab5b35b42edd2f0d406789448))
* **http,ui-kit,ui:** answer dashboard permission checks on the server ([#217](https://github.com/chamvi/chamvi/issues/217)) ([708791a](https://github.com/chamvi/chamvi/commit/708791ac34ef3d51fd92f34dc7716fc9cbcebbc2))
* **http,ui-kit:** test saved connections and show configuration state ([#193](https://github.com/chamvi/chamvi/issues/193)) ([18cd2dc](https://github.com/chamvi/chamvi/commit/18cd2dc6b65bb6ce4c74fecff3c4fb6a4ba26387))
* **http:** generate and serve an OpenAPI document ([#222](https://github.com/chamvi/chamvi/issues/222)) ([0d0fc35](https://github.com/chamvi/chamvi/commit/0d0fc3515da029944b0f0584e6b4dcbfb4f4f896))
* **http:** read controller routes from @routup/decorators ([#229](https://github.com/chamvi/chamvi/issues/229)) ([91f361e](https://github.com/chamvi/chamvi/commit/91f361edc2e3f980fef37452e2e9661b6477e767))
* services over repository ports, and a database layer for apps ([0eb684e](https://github.com/chamvi/chamvi/commit/0eb684e8469dc49f740114aa57e55af797479f1b))
* **ui,ui-kit:** add the package sidebar and provider page serving ([#189](https://github.com/chamvi/chamvi/issues/189)) ([cafc140](https://github.com/chamvi/chamvi/commit/cafc1408a48bc9376e3dc3fbaecb693ecae8e191))


### Bug Fixes

* close the 0.9.0 release review findings ([#240](https://github.com/chamvi/chamvi/issues/240)) ([ab400cd](https://github.com/chamvi/chamvi/commit/ab400cd55d185bd294f8c6ccc734a789b09b3397))
* **core,http:** bind a dispatched run to the agent revision its check saw ([#213](https://github.com/chamvi/chamvi/issues/213)) ([2479f77](https://github.com/chamvi/chamvi/commit/2479f77a854b469002b65b128502e6001579582d))
* **deps:** bump authup packages to 1.0.0-beta.74 ([1d7d6bd](https://github.com/chamvi/chamvi/commit/1d7d6bd7c00f759efb70513e42894d205ce3090e))
* **deps:** bump the minorandpatch group with 2 updates ([#194](https://github.com/chamvi/chamvi/issues/194)) ([b40ef2a](https://github.com/chamvi/chamvi/commit/b40ef2a018c01209b010805053cf9b730e3b43a7))
* harden connection create, tests and static serving ([#201](https://github.com/chamvi/chamvi/issues/201)) ([7f1518f](https://github.com/chamvi/chamvi/commit/7f1518fb9a1e4485960e404a25547fc23531c3c8))
* **http:** adopt routup decorators 5.1, body 4.1, swagger-ui 5, trapi 2.3 ([#224](https://github.com/chamvi/chamvi/issues/224)) ([556e569](https://github.com/chamvi/chamvi/commit/556e569207610bf2d9317ab830b3d2e5ab6f76bd))
* **http:** send the recommended policy of @routup/swagger-ui 5.1 ([3c179e8](https://github.com/chamvi/chamvi/commit/3c179e84551ba4c0b9c5dcae10c336c00744ede0))
* keep env secrets from stored accounts and close audit findings ([#198](https://github.com/chamvi/chamvi/issues/198)) ([f717a57](https://github.com/chamvi/chamvi/commit/f717a57725b2b532b1c3e4746b5a3fbd4c49e197))


### Code Refactoring

* **access,core,http:** name a holder's binding list bindings ([#212](https://github.com/chamvi/chamvi/issues/212)) ([6e9bc29](https://github.com/chamvi/chamvi/commit/6e9bc296025967123e2fc55738e770db47a09c88))
* align IClock with hubwire's clock shape ([9f112db](https://github.com/chamvi/chamvi/commit/9f112db437a6b5060d56226a76a756c620c7aabe))
* **http:** serve the REST API from controllers over services ([#220](https://github.com/chamvi/chamvi/issues/220)) ([1c86ed0](https://github.com/chamvi/chamvi/commit/1c86ed0d4727022977d5bcca0a6c48f0d4230196))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @chamvi/access bumped from ^0.8.0 to ^0.9.0
  * devDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store-memory bumped from ^0.8.0 to ^0.9.0
    * @chamvi/test-kit bumped from ^0.8.0 to ^0.9.0
  * peerDependencies
    * @chamvi/core bumped from ^0.8.0 to ^0.9.0
    * @chamvi/store bumped from ^0.8.0 to ^0.9.0

## [0.8.0](https://github.com/chamvi/chamvi/compare/v0.7.3...v0.8.0) (2026-11-08)


### ⚠ BREAKING CHANGES

* use uuid v7 ids and one primary key per table ([#174](https://github.com/chamvi/chamvi/issues/174))

### Features

* **chat-whatsapp,http,app:** store-backed WhatsApp sessions and connection routes ([#166](https://github.com/chamvi/chamvi/issues/166)) ([ba03375](https://github.com/chamvi/chamvi/commit/ba0337575e2ba53af5306795f3b78c16e1f84679))
* **ui:** pair WhatsApp connections in the dashboard ([#167](https://github.com/chamvi/chamvi/issues/167)) ([7e5191a](https://github.com/chamvi/chamvi/commit/7e5191aa96522022557f25303c3f59fa24cecad9))
* use uuid v7 ids and one primary key per table ([#174](https://github.com/chamvi/chamvi/issues/174)) ([20392bc](https://github.com/chamvi/chamvi/commit/20392bcf9c068383a81577d46fcd08369d206f25))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.7.3 to ^0.8.0
    * @chamvi/test-kit bumped from ^0.7.3 to ^0.8.0
  * peerDependencies
    * @chamvi/core bumped from ^0.7.3 to ^0.8.0

## [0.7.3](https://github.com/chamvi/chamvi/compare/v0.7.2...v0.7.3) (2026-11-05)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.7.2 to ^0.7.3
    * @chamvi/test-kit bumped from ^0.7.2 to ^0.7.3
  * peerDependencies
    * @chamvi/core bumped from ^0.7.2 to ^0.7.3

## [0.7.2](https://github.com/chamvi/chamvi/compare/v0.7.1...v0.7.2) (2026-11-05)


### Features

* private agents readable only with agent:&lt;name&gt;:read ([#157](https://github.com/chamvi/chamvi/issues/157)) ([b0500ae](https://github.com/chamvi/chamvi/commit/b0500ae86e37e2fd78c3f4f48107a401ebe4bbda))


### Bug Fixes

* **deps:** bump minor and patch dependencies ([ea05be6](https://github.com/chamvi/chamvi/commit/ea05be6b3069e818d9c57c036186213d3ccff266))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.7.1 to ^0.7.2
    * @chamvi/test-kit bumped from ^0.7.1 to ^0.7.2
  * peerDependencies
    * @chamvi/core bumped from ^0.7.1 to ^0.7.2

## [0.7.1](https://github.com/chamvi/chamvi/compare/v0.7.0...v0.7.1) (2026-11-04)


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 3 updates ([#143](https://github.com/chamvi/chamvi/issues/143)) ([4da222f](https://github.com/chamvi/chamvi/commit/4da222f5a2acc4aa1ca400d18dc01f159596fdc0))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.7.0 to ^0.7.1
    * @chamvi/test-kit bumped from ^0.7.0 to ^0.7.1
  * peerDependencies
    * @chamvi/core bumped from ^0.7.0 to ^0.7.1

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
    * @chamvi/core bumped from ^0.6.1 to ^0.7.0
    * @chamvi/test-kit bumped from ^0.6.1 to ^0.7.0
  * peerDependencies
    * @chamvi/core bumped from ^0.6.1 to ^0.7.0

## [0.6.1](https://github.com/chamvi/chamvi/compare/v0.6.0...v0.6.1) (2026-11-03)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.6.0 to ^0.6.1
    * @chamvi/test-kit bumped from ^0.6.0 to ^0.6.1
  * peerDependencies
    * @chamvi/core bumped from ^0.6.0 to ^0.6.1

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
    * @chamvi/core bumped from ^0.5.1 to ^0.6.0
    * @chamvi/test-kit bumped from ^0.5.1 to ^0.6.0
  * peerDependencies
    * @chamvi/core bumped from ^0.5.1 to ^0.6.0

## [0.5.1](https://github.com/chamvi/chamvi/compare/v0.5.0...v0.5.1) (2026-11-02)


### Features

* **knowledge,http:** resync and managed collections ([#119](https://github.com/chamvi/chamvi/issues/119)) ([efd485b](https://github.com/chamvi/chamvi/commit/efd485bb401c39fd95f11852713d2f8cc11a8cdc))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.5.0 to ^0.5.1
    * @chamvi/test-kit bumped from ^0.5.0 to ^0.5.1
  * peerDependencies
    * @chamvi/core bumped from ^0.5.0 to ^0.5.1

## [0.5.0](https://github.com/chamvi/chamvi/compare/v0.4.0...v0.5.0) (2026-11-02)


### ⚠ BREAKING CHANGES

* require node 26 and run ci on one version ([#113](https://github.com/chamvi/chamvi/issues/113))

### Build System

* require node 26 and run ci on one version ([#113](https://github.com/chamvi/chamvi/issues/113)) ([0bf352f](https://github.com/chamvi/chamvi/commit/0bf352f63e3f13433396e6ba12ae3b667f8746e4))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.4.0 to ^0.5.0
    * @chamvi/test-kit bumped from ^0.4.0 to ^0.5.0
  * peerDependencies
    * @chamvi/core bumped from ^0.4.0 to ^0.5.0

## [0.4.0](https://github.com/chamvi/chamvi/compare/v0.3.1...v0.4.0) (2026-11-01)


### ⚠ BREAKING CHANGES

* harden trust gates, github, sandbox and coding before 0.4 ([#104](https://github.com/chamvi/chamvi/issues/104))
* Node.js 22 is no longer supported. All packages require Node.js >=24.3.0.
* add durable conversation memory and composable repositories ([#96](https://github.com/chamvi/chamvi/issues/96))

### Features

* add agent execution caps and channel HTTP limit policies ([#93](https://github.com/chamvi/chamvi/issues/93)) ([422a9e9](https://github.com/chamvi/chamvi/commit/422a9e9d80a48b0b7b057de51b078c598da7423c))
* add durable conversation memory and composable repositories ([#96](https://github.com/chamvi/chamvi/issues/96)) ([a183f1c](https://github.com/chamvi/chamvi/commit/a183f1c723b573603ee50533dd4ff25fc2efcc20))
* gate untrusted runs and add allowlisted file proposals ([#101](https://github.com/chamvi/chamvi/issues/101)) ([d49d07f](https://github.com/chamvi/chamvi/commit/d49d07f7b3555100857207abe778ce238b2cfe49))
* **skills:** add verified agent skills and startup installation ([#94](https://github.com/chamvi/chamvi/issues/94)) ([2c44e21](https://github.com/chamvi/chamvi/commit/2c44e21b57a9263e40ecc10d514079f90aa4ec1f))


### Bug Fixes

* **deps:** bump authup to 1.0.0-beta.72, vuecs, ilingo, vueuse 15, nx 24 and @types/node 26 ([0582ff2](https://github.com/chamvi/chamvi/commit/0582ff263dc48d7d339dbccf51d4fc7c68bb744f))
* harden trust gates, github, sandbox and coding before 0.4 ([#104](https://github.com/chamvi/chamvi/issues/104)) ([1fccd8a](https://github.com/chamvi/chamvi/commit/1fccd8afcc4b122e875c47b0bcf45d65d4b9cd9a))


### Build System

* upgrade eslint config to 3.2.0 and require Node 24 ([00fa9b4](https://github.com/chamvi/chamvi/commit/00fa9b463c9e78ec783d3352c8ba8d16b7191758))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.3.1 to ^0.4.0
    * @chamvi/test-kit bumped from ^0.3.1 to ^0.4.0
  * peerDependencies
    * @chamvi/core bumped from ^0.3.1 to ^0.4.0

## [0.3.1](https://github.com/chamvi/chamvi/compare/v0.2.2...v0.3.1) (2026-10-27)


### ⚠ BREAKING CHANGES

* provider/model strings, entry-less apps and approvals without resume tokens ([#38](https://github.com/chamvi/chamvi/issues/38))
* replace triggers and notifiers with channels ([#36](https://github.com/chamvi/chamvi/issues/36))
* add agent folders and a live agent registry ([#34](https://github.com/chamvi/chamvi/issues/34))
* rename chamberu to chamvi ([#22](https://github.com/chamvi/chamvi/issues/22))
* rename RunEngine to Engine and read store, agents and clock from it ([#17](https://github.com/chamvi/chamvi/issues/17))
* **core:** stream model output, run attachments and structured output ([#11](https://github.com/chamvi/chamvi/issues/11))
* **http:** add http control api, webhooks, sse and mcp ([#10](https://github.com/chamvi/chamvi/issues/10))

### Features

* add agent folders and a live agent registry ([#34](https://github.com/chamvi/chamvi/issues/34)) ([fe96152](https://github.com/chamvi/chamvi/commit/fe9615226c3ca2af96457d9fa9ffa03dc46c20b2))
* add the github app connector ([#16](https://github.com/chamvi/chamvi/issues/16)) ([4de91e4](https://github.com/chamvi/chamvi/commit/4de91e45dd3ebb1cbedd576aec09e58b418c1115))
* add the web ui ([#25](https://github.com/chamvi/chamvi/issues/25)) ([27d7642](https://github.com/chamvi/chamvi/commit/27d7642abb3faeefddde3153bc4a72f15c6afac6))
* **core:** approvals with options ([#65](https://github.com/chamvi/chamvi/issues/65)) ([994da69](https://github.com/chamvi/chamvi/commit/994da698399a0b3c08e7aa9d3d4a55f82ff23169))
* **core:** stream model output, run attachments and structured output ([#11](https://github.com/chamvi/chamvi/issues/11)) ([1b22d15](https://github.com/chamvi/chamvi/commit/1b22d156995de529ee0e5055eeb2f7c7836bce39))
* **http:** add http control api, webhooks, sse and mcp ([#10](https://github.com/chamvi/chamvi/issues/10)) ([a53cc31](https://github.com/chamvi/chamvi/commit/a53cc31958594718e60d7593f3e10b4a233f284e))
* provider/model strings, entry-less apps and approvals without resume tokens ([#38](https://github.com/chamvi/chamvi/issues/38)) ([9ce771e](https://github.com/chamvi/chamvi/commit/9ce771ed4255e667d5592e70239ef6f44f937afe))
* record the run invoker and restrict tools per invoker ([#12](https://github.com/chamvi/chamvi/issues/12)) ([a0326e7](https://github.com/chamvi/chamvi/commit/a0326e7111880882cff8a9772b99773f874cc1fb))
* rename chamberu to chamvi ([#22](https://github.com/chamvi/chamvi/issues/22)) ([8c049d9](https://github.com/chamvi/chamvi/commit/8c049d9861daa97640b2307f8481f06bab4cef9c))
* rename RunEngine to Engine and read store, agents and clock from it ([#17](https://github.com/chamvi/chamvi/issues/17)) ([bfdc437](https://github.com/chamvi/chamvi/commit/bfdc4370bc9655aa858518cc36fea2e759733232))
* replace triggers and notifiers with channels ([#36](https://github.com/chamvi/chamvi/issues/36)) ([78e8e7e](https://github.com/chamvi/chamvi/commit/78e8e7edc02e21da1dddec493887847eb4e61c7f))


### Bug Fixes

* **deps:** bump @modelcontextprotocol/server from 2.3.1 to 2.4.0 in the minorandpatch group ([#62](https://github.com/chamvi/chamvi/issues/62)) ([2c2d9db](https://github.com/chamvi/chamvi/commit/2c2d9db795fb23374280150151957ab691a76531))
* **deps:** bump the minorandpatch group across 1 directory with 4 updates ([#37](https://github.com/chamvi/chamvi/issues/37)) ([655adfc](https://github.com/chamvi/chamvi/commit/655adfcb7807d233a218fc62458f52e92dda0853))
* ensure consistent version for release ([#67](https://github.com/chamvi/chamvi/issues/67)) ([c08d0fb](https://github.com/chamvi/chamvi/commit/c08d0fbf89c5083f750ed5c966513aad79bbabe6))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.3.0 to ^0.3.1
    * @chamvi/test-kit bumped from ^0.3.0 to ^0.3.1
  * peerDependencies
    * @chamvi/core bumped from ^0.3.0 to ^0.3.1

## [0.2.2](https://github.com/chamvi/chamvi/compare/v0.2.1...v0.2.2) (2026-10-26)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.2.1 to ^0.3.0
    * @chamvi/test-kit bumped from ^0.2.1 to ^0.3.0
  * peerDependencies
    * @chamvi/core bumped from ^0.2.1 to ^0.3.0

## [0.2.1](https://github.com/chamvi/chamvi/compare/v0.2.0...v0.2.1) (2026-10-25)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.2.0 to ^0.2.1
    * @chamvi/test-kit bumped from ^0.2.0 to ^0.2.1
  * peerDependencies
    * @chamvi/core bumped from ^0.2.0 to ^0.2.1

## [0.2.0](https://github.com/chamvi/chamvi/compare/http-v0.1.0...http-v0.2.0) (2026-10-25)


### ⚠ BREAKING CHANGES

* provider/model strings, entry-less apps and approvals without resume tokens ([#38](https://github.com/chamvi/chamvi/issues/38))
* replace triggers and notifiers with channels ([#36](https://github.com/chamvi/chamvi/issues/36))
* add agent folders and a live agent registry ([#34](https://github.com/chamvi/chamvi/issues/34))
* rename chamberu to chamvi ([#22](https://github.com/chamvi/chamvi/issues/22))
* rename RunEngine to Engine and read store, agents and clock from it ([#17](https://github.com/chamvi/chamvi/issues/17))
* **core:** stream model output, run attachments and structured output ([#11](https://github.com/chamvi/chamvi/issues/11))
* **http:** add http control api, webhooks, sse and mcp ([#10](https://github.com/chamvi/chamvi/issues/10))

### Features

* add agent folders and a live agent registry ([#34](https://github.com/chamvi/chamvi/issues/34)) ([fe96152](https://github.com/chamvi/chamvi/commit/fe9615226c3ca2af96457d9fa9ffa03dc46c20b2))
* add the github app connector ([#16](https://github.com/chamvi/chamvi/issues/16)) ([4de91e4](https://github.com/chamvi/chamvi/commit/4de91e45dd3ebb1cbedd576aec09e58b418c1115))
* add the web ui ([#25](https://github.com/chamvi/chamvi/issues/25)) ([27d7642](https://github.com/chamvi/chamvi/commit/27d7642abb3faeefddde3153bc4a72f15c6afac6))
* **core:** stream model output, run attachments and structured output ([#11](https://github.com/chamvi/chamvi/issues/11)) ([1b22d15](https://github.com/chamvi/chamvi/commit/1b22d156995de529ee0e5055eeb2f7c7836bce39))
* **http:** add http control api, webhooks, sse and mcp ([#10](https://github.com/chamvi/chamvi/issues/10)) ([a53cc31](https://github.com/chamvi/chamvi/commit/a53cc31958594718e60d7593f3e10b4a233f284e))
* provider/model strings, entry-less apps and approvals without resume tokens ([#38](https://github.com/chamvi/chamvi/issues/38)) ([9ce771e](https://github.com/chamvi/chamvi/commit/9ce771ed4255e667d5592e70239ef6f44f937afe))
* record the run invoker and restrict tools per invoker ([#12](https://github.com/chamvi/chamvi/issues/12)) ([a0326e7](https://github.com/chamvi/chamvi/commit/a0326e7111880882cff8a9772b99773f874cc1fb))
* rename chamberu to chamvi ([#22](https://github.com/chamvi/chamvi/issues/22)) ([8c049d9](https://github.com/chamvi/chamvi/commit/8c049d9861daa97640b2307f8481f06bab4cef9c))
* rename RunEngine to Engine and read store, agents and clock from it ([#17](https://github.com/chamvi/chamvi/issues/17)) ([bfdc437](https://github.com/chamvi/chamvi/commit/bfdc4370bc9655aa858518cc36fea2e759733232))
* replace triggers and notifiers with channels ([#36](https://github.com/chamvi/chamvi/issues/36)) ([78e8e7e](https://github.com/chamvi/chamvi/commit/78e8e7edc02e21da1dddec493887847eb4e61c7f))


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 4 updates ([#37](https://github.com/chamvi/chamvi/issues/37)) ([655adfc](https://github.com/chamvi/chamvi/commit/655adfcb7807d233a218fc62458f52e92dda0853))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @chamvi/core bumped from ^0.1.0 to ^0.2.0
    * @chamvi/test-kit bumped from ^0.1.0 to ^0.2.0
  * peerDependencies
    * @chamvi/core bumped from ^0.1.0 to ^0.2.0
