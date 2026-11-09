# Changelog

## [0.8.0](https://github.com/chamvi/chamvi/compare/v0.7.3...v0.8.0) (2026-11-08)


### ⚠ BREAKING CHANGES

* use uuid v7 ids and one primary key per table ([#174](https://github.com/chamvi/chamvi/issues/174))

### Features

* **chat-whatsapp,http,app:** store-backed WhatsApp sessions and connection routes ([#166](https://github.com/chamvi/chamvi/issues/166)) ([ba03375](https://github.com/chamvi/chamvi/commit/ba0337575e2ba53af5306795f3b78c16e1f84679))
* **core,store-db:** add an encrypted, lease-fenced connection store ([#165](https://github.com/chamvi/chamvi/issues/165)) ([6c7ea55](https://github.com/chamvi/chamvi/commit/6c7ea55963dda044e06aa32964f3e0f813180d88))
* **ui:** pair WhatsApp connections in the dashboard ([#167](https://github.com/chamvi/chamvi/issues/167)) ([7e5191a](https://github.com/chamvi/chamvi/commit/7e5191aa96522022557f25303c3f59fa24cecad9))
* use uuid v7 ids and one primary key per table ([#174](https://github.com/chamvi/chamvi/issues/174)) ([20392bc](https://github.com/chamvi/chamvi/commit/20392bcf9c068383a81577d46fcd08369d206f25))


### Bug Fixes

* distinguish uuid v7 run ids and document the 0.8 upgrade ([#176](https://github.com/chamvi/chamvi/issues/176)) ([bd15f1b](https://github.com/chamvi/chamvi/commit/bd15f1be483dcddcfe7bdada5993e8c0cf3f51ec))
* ensure consistent version for release ([#178](https://github.com/chamvi/chamvi/issues/178)) ([98faf1a](https://github.com/chamvi/chamvi/commit/98faf1ad1e7b388509c1e81b31fef9070e50f939))

## [0.7.3](https://github.com/chamvi/chamvi/compare/v0.7.2...v0.7.3) (2026-11-05)


### Features

* run cron subscriptions inside a chat conversation ([#163](https://github.com/chamvi/chamvi/issues/163)) ([ca8a9ed](https://github.com/chamvi/chamvi/commit/ca8a9ede297d26e85cd5a4c04ae85c94573fe019))

## [0.7.2](https://github.com/chamvi/chamvi/compare/v0.7.1...v0.7.2) (2026-11-05)


### Features

* private agents readable only with agent:&lt;name&gt;:read ([#157](https://github.com/chamvi/chamvi/issues/157)) ([b0500ae](https://github.com/chamvi/chamvi/commit/b0500ae86e37e2fd78c3f4f48107a401ebe4bbda))
* **sandbox:** suspend the workspaces of long-waiting runs ([#161](https://github.com/chamvi/chamvi/issues/161)) ([f0abd3e](https://github.com/chamvi/chamvi/commit/f0abd3e292562d07d316c89fb61b1602dc36afe3))
* **tool-calendar:** add read-only CalDAV calendar tools ([#159](https://github.com/chamvi/chamvi/issues/159)) ([a4f1ced](https://github.com/chamvi/chamvi/commit/a4f1ced2d54570dc04b06eadad289e1009fdbb13))
* **tool-mail:** add read-only IMAP mail tools ([#158](https://github.com/chamvi/chamvi/issues/158)) ([b545dd4](https://github.com/chamvi/chamvi/commit/b545dd4f83eaf8b60532d4b74e59bee1a855bb32))


### Bug Fixes

* **deps:** bump minor and patch dependencies ([ea05be6](https://github.com/chamvi/chamvi/commit/ea05be6b3069e818d9c57c036186213d3ccff266))
* **ui:** add the logo as favicon ([#153](https://github.com/chamvi/chamvi/issues/153)) ([ceb2de6](https://github.com/chamvi/chamvi/commit/ceb2de6a332307caba7f8e0046c5171c3a37a6e2))

## [0.7.1](https://github.com/chamvi/chamvi/compare/v0.7.0...v0.7.1) (2026-11-04)


### Features

* **core:** let code name a dispatched run's outbound source ([#152](https://github.com/chamvi/chamvi/issues/152)) ([5cb4172](https://github.com/chamvi/chamvi/commit/5cb41727da7d97d1700878d559db28881a4e0255))
* **github:** address check events of one pull request ([#151](https://github.com/chamvi/chamvi/issues/151)) ([be859e3](https://github.com/chamvi/chamvi/commit/be859e357989ab22f0e95c2260912daa947f3ea3))
* switch the brand to Glacier and the seal logo ([#149](https://github.com/chamvi/chamvi/issues/149)) ([6b79ede](https://github.com/chamvi/chamvi/commit/6b79ede3f5ab2b02b1dfee58ab4e6143e144b02c))


### Bug Fixes

* **core:** refuse writes from tool work left running after its execution ended ([#145](https://github.com/chamvi/chamvi/issues/145)) ([2d94254](https://github.com/chamvi/chamvi/commit/2d94254f51abc8adc0531a1dc81b8545b7263104))
* **deps:** bump the minorandpatch group across 1 directory with 3 updates ([#143](https://github.com/chamvi/chamvi/issues/143)) ([4da222f](https://github.com/chamvi/chamvi/commit/4da222f5a2acc4aa1ca400d18dc01f159596fdc0))
* **ui:** keep the authup session across a reload ([#150](https://github.com/chamvi/chamvi/issues/150)) ([0736e55](https://github.com/chamvi/chamvi/commit/0736e55c2b78268f818a8ad693eec6235fbb5be3))
* **ui:** pass the authup cookie path in the kit's normalized form ([5f96c67](https://github.com/chamvi/chamvi/commit/5f96c67dfb5d93042e872546905c3ef189d6c66b))

## [0.7.0](https://github.com/chamvi/chamvi/compare/v0.6.1...v0.7.0) (2026-11-04)


### ⚠ BREAKING CHANGES

* replace defineAgent with defineModelAgent ([#140](https://github.com/chamvi/chamvi/issues/140))
* **core:** generated dispatch tools and simple agents ([#136](https://github.com/chamvi/chamvi/issues/136))

### Features

* **chat-discord:** add the Discord chat channel ([#135](https://github.com/chamvi/chamvi/issues/135)) ([e2f8694](https://github.com/chamvi/chamvi/commit/e2f8694421a3641a9b7d1b4dc64d7df25bf9ab07))
* **core:** generated dispatch tools and simple agents ([#136](https://github.com/chamvi/chamvi/issues/136)) ([711ea7a](https://github.com/chamvi/chamvi/commit/711ea7abbe3126817222793d1f3a38edca30b95a))


### Bug Fixes

* ensure consistent version for release ([#141](https://github.com/chamvi/chamvi/issues/141)) ([a8ca715](https://github.com/chamvi/chamvi/commit/a8ca715dd19fed6a9ed83d9827a0a02791a22565))


### Code Refactoring

* replace defineAgent with defineModelAgent ([#140](https://github.com/chamvi/chamvi/issues/140)) ([96a0aa1](https://github.com/chamvi/chamvi/commit/96a0aa188da9af5f78ff65c41df0f0314e57418f))

## [0.6.1](https://github.com/chamvi/chamvi/compare/v0.6.0...v0.6.1) (2026-11-03)


### Bug Fixes

* **core:** refuse a key-holding child only when its caller waits for it ([#132](https://github.com/chamvi/chamvi/issues/132)) ([f6608a8](https://github.com/chamvi/chamvi/commit/f6608a883a16f067a65e7f16c9c298f12b8ab656))

## [0.6.0](https://github.com/chamvi/chamvi/compare/v0.5.1...v0.6.0) (2026-11-03)


### ⚠ BREAKING CHANGES

* **core:** awaited dispatch, cross-agent and deeper hand-offs, dispatch roles ([#130](https://github.com/chamvi/chamvi/issues/130))
* **core:** attach artifacts to approvals (keyed artifacts) ([#126](https://github.com/chamvi/chamvi/issues/126))

### Features

* **core:** attach artifacts to approvals (keyed artifacts) ([#126](https://github.com/chamvi/chamvi/issues/126)) ([94cf46b](https://github.com/chamvi/chamvi/commit/94cf46ba53ed714a2f8773ac6a5a5bd059cd1e00))
* **core:** awaited dispatch, cross-agent and deeper hand-offs, dispatch roles ([#130](https://github.com/chamvi/chamvi/issues/130)) ([562106c](https://github.com/chamvi/chamvi/commit/562106c09ed861d9ad12360110001f27aac29684))


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 17 updates ([#127](https://github.com/chamvi/chamvi/issues/127)) ([2829a3b](https://github.com/chamvi/chamvi/commit/2829a3b756ba21e267fcc7f50883bc4ac81cee44))
* ensure consistent version for release ([4210928](https://github.com/chamvi/chamvi/commit/42109287c9fbc5863138bc9c29120ab356de0663))

## [0.5.1](https://github.com/chamvi/chamvi/compare/v0.5.0...v0.5.1) (2026-11-02)


### Features

* **app:** load agents from npm packages by name ([#121](https://github.com/chamvi/chamvi/issues/121)) ([1a1262f](https://github.com/chamvi/chamvi/commit/1a1262f1a4dbd5f0b561653c52c0b91937ca83db))
* **knowledge,http:** resync and managed collections ([#119](https://github.com/chamvi/chamvi/issues/119)) ([efd485b](https://github.com/chamvi/chamvi/commit/efd485bb401c39fd95f11852713d2f8cc11a8cdc))

## [0.5.0](https://github.com/chamvi/chamvi/compare/v0.4.0...v0.5.0) (2026-11-02)


### ⚠ BREAKING CHANGES

* require node 26 and run ci on one version ([#113](https://github.com/chamvi/chamvi/issues/113))

### Features

* **chat:** add Chat SDK channels and WhatsApp Web ([#109](https://github.com/chamvi/chamvi/issues/109)) ([a0b5507](https://github.com/chamvi/chamvi/commit/a0b5507f24a8401f657c4cb571a25504bbe81ef2))
* **core,app:** resolve embedding models ([#107](https://github.com/chamvi/chamvi/issues/107)) ([d0e56b4](https://github.com/chamvi/chamvi/commit/d0e56b46c814037b55117e7163fa482dbb49519b))
* **knowledge:** add @chamvi/knowledge ([#108](https://github.com/chamvi/chamvi/issues/108)) ([3415eb7](https://github.com/chamvi/chamvi/commit/3415eb7d2fcafbd127d999a16b596099b1da14cb))


### Build System

* require node 26 and run ci on one version ([#113](https://github.com/chamvi/chamvi/issues/113)) ([0bf352f](https://github.com/chamvi/chamvi/commit/0bf352f63e3f13433396e6ba12ae3b667f8746e4))

## [0.4.0](https://github.com/chamvi/chamvi/compare/v0.3.1...v0.4.0) (2026-11-01)


### ⚠ BREAKING CHANGES

* **store-db,core:** migrations from the pre-release window are replaced by `ConversationsRunTaint1792713600000`, so recreate or reconcile development databases. Writes for unknown runs reject with `RunNotFoundError`. Upgrading from 0.3 needs downtime, as described in the upgrade guide.
* harden trust gates, github, sandbox and coding before 0.4 ([#104](https://github.com/chamvi/chamvi/issues/104))
* Node.js 22 is no longer supported. All packages require Node.js >=24.3.0.
* add durable conversation memory and composable repositories ([#96](https://github.com/chamvi/chamvi/issues/96))
* **sandbox:** use bash-first workspace credentials ([#87](https://github.com/chamvi/chamvi/issues/87))

### Features

* add agent execution caps and channel HTTP limit policies ([#93](https://github.com/chamvi/chamvi/issues/93)) ([422a9e9](https://github.com/chamvi/chamvi/commit/422a9e9d80a48b0b7b057de51b078c598da7423c))
* add durable conversation memory and composable repositories ([#96](https://github.com/chamvi/chamvi/issues/96)) ([a183f1c](https://github.com/chamvi/chamvi/commit/a183f1c723b573603ee50533dd4ff25fc2efcc20))
* gate untrusted runs and add allowlisted file proposals ([#101](https://github.com/chamvi/chamvi/issues/101)) ([d49d07f](https://github.com/chamvi/chamvi/commit/d49d07f7b3555100857207abe778ce238b2cfe49))
* **github:** add persistent per-message comment slots ([#103](https://github.com/chamvi/chamvi/issues/103)) ([437191c](https://github.com/chamvi/chamvi/commit/437191c5e9af548c6a4bd0250f004b3209b2e48d))
* load scoped repository instructions ([#95](https://github.com/chamvi/chamvi/issues/95)) ([5d93bbb](https://github.com/chamvi/chamvi/commit/5d93bbba451f0af9af9809540cfacf8496fd4108))
* **skills:** add verified agent skills and startup installation ([#94](https://github.com/chamvi/chamvi/issues/94)) ([2c44e21](https://github.com/chamvi/chamvi/commit/2c44e21b57a9263e40ecc10d514079f90aa4ec1f))


### Bug Fixes

* **deps:** bump authup to 1.0.0-beta.72, vuecs, ilingo, vueuse 15, nx 24 and @types/node 26 ([0582ff2](https://github.com/chamvi/chamvi/commit/0582ff263dc48d7d339dbccf51d4fc7c68bb744f))
* harden trust gates, github, sandbox and coding before 0.4 ([#104](https://github.com/chamvi/chamvi/issues/104)) ([1fccd8a](https://github.com/chamvi/chamvi/commit/1fccd8afcc4b122e875c47b0bcf45d65d4b9cd9a))
* **release:** align linked workspace release candidates ([#89](https://github.com/chamvi/chamvi/issues/89)) ([68484af](https://github.com/chamvi/chamvi/commit/68484af53538ad465a16651b74e2c8ca0bb5b6ce)), closes [#74](https://github.com/chamvi/chamvi/issues/74) [#75](https://github.com/chamvi/chamvi/issues/75)
* **sandbox:** use bash-first workspace credentials ([#87](https://github.com/chamvi/chamvi/issues/87)) ([1731c74](https://github.com/chamvi/chamvi/commit/1731c74ebe8f876bb8c3749df8643e588a1111cc))
* **store-db,core:** bundle the 0.4 migrations and finish the release audit ([#105](https://github.com/chamvi/chamvi/issues/105)) ([d8c671a](https://github.com/chamvi/chamvi/commit/d8c671a0afc81d85b0bcf627206b0cf74f5cb580))


### Build System

* upgrade eslint config to 3.2.0 and require Node 24 ([00fa9b4](https://github.com/chamvi/chamvi/commit/00fa9b463c9e78ec783d3352c8ba8d16b7191758))

## [0.3.1](https://github.com/chamvi/chamvi/compare/v0.3.0...v0.3.1) (2026-10-27)


### Features

* **core:** approvals with options ([#65](https://github.com/chamvi/chamvi/issues/65)) ([994da69](https://github.com/chamvi/chamvi/commit/994da698399a0b3c08e7aa9d3d4a55f82ff23169))
* **core:** start runs of the same agent from a tool ([#64](https://github.com/chamvi/chamvi/issues/64)) ([083c385](https://github.com/chamvi/chamvi/commit/083c3852f1a0c494193e9e6ae36ca5739d1b275c))
* **github:** pull request tools and per-repository installations ([#66](https://github.com/chamvi/chamvi/issues/66)) ([1a87a3a](https://github.com/chamvi/chamvi/commit/1a87a3a68942aab59f7fe70d52b85b68756f6263))


### Bug Fixes

* **deps:** bump @modelcontextprotocol/server from 2.3.1 to 2.4.0 in the minorandpatch group ([#62](https://github.com/chamvi/chamvi/issues/62)) ([2c2d9db](https://github.com/chamvi/chamvi/commit/2c2d9db795fb23374280150151957ab691a76531))
* ensure consistent version for release ([#67](https://github.com/chamvi/chamvi/issues/67)) ([c08d0fb](https://github.com/chamvi/chamvi/commit/c08d0fbf89c5083f750ed5c966513aad79bbabe6))

## [0.3.0](https://github.com/chamvi/chamvi/compare/v0.2.1...v0.3.0) (2026-10-26)


### ⚠ BREAKING CHANGES

* **app:** replace doctor with start --check and make agent reloads visible ([#61](https://github.com/chamvi/chamvi/issues/61))
* **sandbox:** safe workspace defaults and credential redaction fixes ([#60](https://github.com/chamvi/chamvi/issues/60))
* **app:** resolve models through declared providers and add chamvi doctor ([#58](https://github.com/chamvi/chamvi/issues/58))
* **coding:** stateful shell, background jobs, full output, ripgrep search, glob and multi_edit ([#49](https://github.com/chamvi/chamvi/issues/49))
* **sandbox:** root workspaces, any image, a shared package cache and sandbox-dev ([#48](https://github.com/chamvi/chamvi/issues/48))
* **sandbox:** find workspaces again across approvals, restarts and replicas ([#47](https://github.com/chamvi/chamvi/issues/47))

### Features

* **app:** replace doctor with start --check and make agent reloads visible ([#61](https://github.com/chamvi/chamvi/issues/61)) ([6c971ec](https://github.com/chamvi/chamvi/commit/6c971ec381b01895dc32f34902c1be52d4090f33))
* **app:** resolve models through declared providers and add chamvi doctor ([#58](https://github.com/chamvi/chamvi/issues/58)) ([04309b9](https://github.com/chamvi/chamvi/commit/04309b93b217c270639d0951eb1d5f00009d4ce0))
* **coding:** stateful shell, background jobs, full output, ripgrep search, glob and multi_edit ([#49](https://github.com/chamvi/chamvi/issues/49)) ([eef86ba](https://github.com/chamvi/chamvi/commit/eef86bafc35ee49651a5053cf64eb0ca70583853))
* **core:** add an engine model resolver and an optional agent model ([#57](https://github.com/chamvi/chamvi/issues/57)) ([d279e52](https://github.com/chamvi/chamvi/commit/d279e52834bc2f6b83edfac2d51b7cc84ea8bb29))
* **sandbox:** find workspaces again across approvals, restarts and replicas ([#47](https://github.com/chamvi/chamvi/issues/47)) ([0f9bcb3](https://github.com/chamvi/chamvi/commit/0f9bcb3c0055be8730050365afb1693a1a3cc512))
* **sandbox:** full git checkouts, pluggable credentials and git tools with a push policy ([#50](https://github.com/chamvi/chamvi/issues/50)) ([9f457bb](https://github.com/chamvi/chamvi/commit/9f457bb7ca64be5e90ebafbe840e6698f156d6f1))
* **sandbox:** root workspaces, any image, a shared package cache and sandbox-dev ([#48](https://github.com/chamvi/chamvi/issues/48)) ([b7131c0](https://github.com/chamvi/chamvi/commit/b7131c0e58fe8c5e2e88bd34248f6208517d9159))
* **tool-web:** add a web_fetch tool and GitHub release tools ([#51](https://github.com/chamvi/chamvi/issues/51)) ([a1bfd62](https://github.com/chamvi/chamvi/commit/a1bfd629a66a36637ca3f195c87bff2b0fd5b9f4))


### Bug Fixes

* **sandbox:** safe workspace defaults and credential redaction fixes ([#60](https://github.com/chamvi/chamvi/issues/60)) ([ce751fc](https://github.com/chamvi/chamvi/commit/ce751fc3bafb639d3a8932f3f6e3ca57c2d60417))

## [0.2.1](https://github.com/chamvi/chamvi/compare/v0.2.0...v0.2.1) (2026-10-25)


### Bug Fixes

* **app:** mark the default provider as v4 so string models are not converted twice ([#41](https://github.com/chamvi/chamvi/issues/41)) ([5780984](https://github.com/chamvi/chamvi/commit/5780984f9ec66790af1bf2c5b3a7b4adff077039))
