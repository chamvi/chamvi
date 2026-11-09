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
