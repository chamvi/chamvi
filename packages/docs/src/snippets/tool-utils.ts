import type { LanguageModel } from 'ai';
import { defineModelAgent } from '@chamvi/core';
import { utilityTools } from '@chamvi/tool-utils';

export function createBriefingAgent(model: LanguageModel) {
    // #region agent
    return defineModelAgent({
        name: 'morning-briefing',
        model,
        instructions: 'Write the morning briefing. Call current_time before using any relative date ' +
            '("today", "this week"): you have no clock of your own. Use calculate for sums and percentages.',
        tools: utilityTools({ timezone: 'Europe/Berlin' }),
        budget: { maxSteps: 10 },
    });
    // #endregion agent
}
