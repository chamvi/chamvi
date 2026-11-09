<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/tool-utils" width="128" height="128" />
</p>

<h1 align="center">@chamvi/tool-utils</h1>

<p align="center">
    <b>Utility tools for chamvi agents.</b><br>
    The current time, date arithmetic and exact calculation a model cannot do reliably itself.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/tool-utils"><img src="https://img.shields.io/npm/v/@chamvi/tool-utils" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/tool-utils/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/tool-utils" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [Usage](#usage)
- [Tools](#tools)
- [Options](#options)
- [License](#license)

## Installation

```bash
npm install @chamvi/tool-utils @chamvi/core ai --save
```

ESM only, Node.js `>=26.0.0`. `@chamvi/core` and `ai` are peer dependencies.

## Usage

```typescript
import type { LanguageModel } from 'ai';
import { defineModelAgent } from '@chamvi/core';
import { utilityTools } from '@chamvi/tool-utils';

export function createBriefingAgent(model: LanguageModel) {
    return defineModelAgent({
        name: 'morning-briefing',
        model,
        instructions: 'Write the morning briefing. Call current_time first: never guess today\'s date.',
        // current_time and friends, with dates read in Berlin time
        tools: utilityTools({ timezone: 'Europe/Berlin' }),
        budget: { maxSteps: 10 },
    });
}
```

## Tools

| Tool | Result |
|------|--------|
| `current_time` | `{ date, weekday, time, timezone, offset, iso, startTime }`, read through the engine clock; `startTime` is when the run began |

## Options

| Option | Meaning |
|--------|---------|
| `timezone` | The default IANA zone. Wins over `CHAMVI_TIMEZONE`, which wins over `UTC`. |
| `include` | The tool names to build (default all; an empty list is refused). |
| `env` | Where `CHAMVI_TIMEZONE` is read (default `process.env`). |

A misconfigured option throws `InvalidAgentDefinitionError` when `utilityTools()` is called.

## License

Published under [Apache License 2.0](./LICENSE).
