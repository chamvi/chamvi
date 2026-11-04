/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/*
 * One code theme for both color modes: code blocks stay on the fixed-dark
 * surface (`--ch-code-bg`), so they need the same token colors in light and
 * dark mode. The colors are the `code` tokens of the site palette.
 */

const INK = '#dce9f2';
const KEYWORD = '#b5e3f8';
const STRING = '#e7c58c';
const COMMENT = '#7f95a6';

export const chamviCodeTheme = {
    name: 'chamvi',
    type: 'dark' as const,
    colors: {
        'editor.background': '#0a1620',
        'editor.foreground': INK,
    },
    fg: INK,
    bg: '#0a1620',
    tokenColors: [
        {
            scope: ['comment', 'punctuation.definition.comment'],
            settings: { foreground: COMMENT },
        },
        {
            scope: [
                'keyword',
                'storage',
                'storage.type',
                'storage.modifier',
                'keyword.control',
                'keyword.operator.new',
                'keyword.operator.expression',
                'keyword.operator.logical',
                'variable.language',
                'constant.language',
            ],
            settings: { foreground: KEYWORD },
        },
        {
            scope: [
                'string',
                'punctuation.definition.string',
                'string.template',
                'constant.numeric',
                'constant.other',
                'markup.inline.raw',
            ],
            settings: { foreground: STRING },
        },
        {
            scope: ['keyword.operator', 'punctuation', 'meta.brace'],
            settings: { foreground: INK },
        },
    ],
};
