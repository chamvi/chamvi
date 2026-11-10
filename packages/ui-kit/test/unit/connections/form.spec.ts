/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// @vitest-environment happy-dom

import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import {
    createApp,
    defineComponent,
    h,
    shallowRef,
} from 'vue';
import type { App } from 'vue';
import { ApiError } from '../../../src/api/error.ts';
import type { MeWire } from '../../../src/api/types.ts';
import ConnectionForm from '../../../src/connections/ConnectionForm.vue';
import type { ConnectionSettingsWire, ConnectionTypeWire } from '../../../src/connections/types.ts';
import { APP_CONTEXT } from '../../../src/context/constants.ts';
import type { AppContext } from '../../../src/context/types.ts';
import { ME, fakeClient } from '../../utils/client.ts';
import { installFormKit } from '../../utils/forms.ts';
import { flush } from '../../utils/timers.ts';

const TYPE: ConnectionTypeWire = {
    type: 'mail',
    label: 'Mail',
    multiple: true,
    creatable: true,
    testable: true,
    fields: [
        {
            key: 'host', 
            label: 'IMAP host', 
            kind: 'string', 
            required: true,
        },
        {
            key: 'port', 
            label: 'Port', 
            kind: 'number', 
        },
        {
            key: 'security', 
            label: 'Security', 
            kind: 'select', 
            options: ['tls', 'plain'],
        },
        {
            key: 'user', 
            label: 'User', 
            kind: 'string', 
        },
        {
            key: 'password', 
            label: 'Password', 
            kind: 'secret', 
            required: true,
        },
    ],
};

function view(overrides: Partial<ConnectionSettingsWire> = {}): ConnectionSettingsWire {
    return {
        type: 'mail',
        state: 'configured',
        settings: { host: 'imap.example.com', port: 993 },
        fields: [
            { key: 'host', source: { kind: 'store' } },
            { key: 'port', source: { kind: 'store' } },
            { key: 'security', source: { kind: 'unset' } },
            { key: 'user', source: { kind: 'unset' } },
            {
                key: 'password', 
                source: { kind: 'store' }, 
                set: true,
            },
        ],
        restartRequired: false,
        editable: true,
        deletable: false,
        ...overrides,
    };
}

function withField(base: ConnectionSettingsWire, key: string, field: Partial<ConnectionSettingsWire['fields'][number]>): ConnectionSettingsWire {
    return { ...base, fields: base.fields.map((entry) => (entry.key === key ? { ...entry, ...field } : entry)) };
}

type Responder = (body: unknown) => unknown;
type Call = {
    method: string; 
    url: string; 
    body: unknown 
};

let mounted: App | undefined;

afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.unstubAllGlobals();
});

async function mount(options: {
    name?: string;
    current?: ConnectionSettingsWire;
    routes?: Record<string, Responder>;
    principal?: MeWire;
    type?: ConnectionTypeWire;
}) {
    const name = 'name' in options ? options.name : 'mail-work';
    const calls: Call[] = [];
    const routes: Record<string, Responder> = {
        'GET /connection-types': () => ({ data: [options.type ?? TYPE] }),
        [`GET /connections/${name}/config`]: () => options.current ?? view(),
        ...options.routes,
    };
    const send = async (url: string, init: { method?: string; body?: unknown } = {}) => {
        const method = init.method ?? 'GET';

        calls.push({
            method,
            url,
            body: init.body,
        });

        const responder = routes[`${method} ${url}`];

        if (!responder) {
            throw new Error(`unrouted ${method} ${url}`);
        }

        return new Response(JSON.stringify(await responder(init.body)));
    };
    const emitted: { created: unknown[]; deleted: unknown[] } = { created: [], deleted: [] };
    const root = document.createElement('div');

    document.body.append(root);

    const context = {
        client: fakeClient({ send: send as never }),
        session: { principal: shallowRef(options.principal ?? ME) },
    } as unknown as AppContext;
    const app = createApp(defineComponent(() => () => h(ConnectionForm, {
        type: 'mail',
        ...(name === undefined ? {} : { name }),
        onCreated: (created: unknown) => {
            emitted.created.push(created);
        },
        onDeleted: (deleted: unknown) => {
            emitted.deleted.push(deleted);
        },
    })));

    installFormKit(app);
    app.provide(APP_CONTEXT, context);
    app.mount(root);
    mounted = app;
    await flush();

    return {
        root,
        calls,
        emitted,
        field: (key: string) => root.querySelector<HTMLElement>(`[data-field="${CSS.escape(key)}"]`)!,
        input: (key: string) => root.querySelector<HTMLInputElement>(`[data-field="${CSS.escape(key)}"] input`),
        /** A select's trigger (vuecs/Reka: a button showing the chosen label). */
        select: (key: string) => root.querySelector<HTMLButtonElement>(`[data-field="${CSS.escape(key)}"] [role="combobox"]`),
        /** The validation message under a field. */
        message: (key: string) => root.querySelector(`[data-field="${CSS.escape(key)}"] .field-msg`)?.textContent?.trim(),
        button: (text: string) => Array.from(root.querySelectorAll('button')).find((entry) => entry.textContent?.trim() === text),
        submit: async () => {
            root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
            await flush();
        },
        type: (input: HTMLInputElement, value: string) => {
            input.value = value;
            input.dispatchEvent(new Event('input'));
        },
    };
}

describe('ConnectionForm', () => {
    it('renders a locked field with Set from <VARIABLE>', async () => {
        const form = await mount({ current: withField(view(), 'user', { source: { kind: 'env', variable: 'CHAMVI_MAIL_WORK_USER' } }) });

        expect(form.field('user').textContent).toContain('Set from');
        expect(form.field('user').textContent).toContain('CHAMVI_MAIL_WORK_USER');
        expect(form.input('user')).toBeNull();
    });

    it('renders a field set in code as locked', async () => {
        const form = await mount({ current: withField(view(), 'host', { source: { kind: 'code' } }) });

        expect(form.field('host').textContent).toContain('Set in code');
        expect(form.input('host')).toBeNull();
    });

    it('renders a set secret as Set with Replace and Clear, never a value', async () => {
        const form = await mount({});
        const field = form.field('password');

        expect(field.textContent).toContain('Set');
        expect(form.input('password')).toBeNull();
        expect(Array.from(field.querySelectorAll('button')).map((button) => button.textContent?.trim())).toEqual(['Replace', 'Clear']);

        form.button('Replace')!.click();
        await flush();

        expect(form.input('password')?.type).toBe('password');
        expect(form.input('password')?.value).toBe('');
    });

    it('locks a secret set from the environment without Replace or Clear', async () => {
        const form = await mount({
            current: withField(view(), 'password', {
                source: { kind: 'env', variable: 'CHAMVI_MAIL_WORK_PASSWORD' },
                set: true,
            }),
        });

        expect(form.field('password').textContent).toContain('CHAMVI_MAIL_WORK_PASSWORD');
        expect(form.field('password').querySelectorAll('button')).toHaveLength(0);
    });

    it('clears the secret input after save', async () => {
        const unset = withField(view(), 'password', { source: { kind: 'unset' }, set: false });
        const put = vi.fn(() => withField(unset, 'password', { source: { kind: 'store' }, set: true }));
        const form = await mount({ current: unset, routes: { 'PUT /connections/mail-work/config': put } });

        form.type(form.input('password')!, 'hunter2');
        await form.submit();

        expect(put.mock.calls[0]![0 as never]).toMatchObject({ secrets: { set: { password: 'hunter2' } } });
        expect(form.input('password')).toBeNull();
        expect(form.root.innerHTML).not.toContain('hunter2');

        form.button('Replace')!.click();
        await flush();

        expect(form.input('password')?.value).toBe('');
    });

    it('locks every edit while a save is pending, so no change is lost to its answer', async () => {
        const { promise, resolve: answer } = Promise.withResolvers<ConnectionSettingsWire>();
        const put = vi.fn(() => promise);
        const form = await mount({ routes: { 'PUT /connections/mail-work/config': put } });

        form.type(form.input('host')!, 'imap.other');
        await form.submit();

        expect(put).toHaveBeenCalledTimes(1);
        expect(form.input('host')!.disabled).toBe(true);
        expect(form.select('security')!.disabled).toBe(true);
        expect(form.button('Replace')!.disabled).toBe(true);
        expect(form.button('Clear')!.disabled).toBe(true);

        answer(view({ settings: { host: 'imap.other', port: 993 } }));
        await flush();

        expect(form.input('host')!.disabled).toBe(false);
        expect(form.input('host')!.value).toBe('imap.other');
        expect(form.button('Replace')!.disabled).toBe(false);
    });

    it('sends the complete settings with an empty value unset and a number typed', async () => {
        const put = vi.fn(() => view());
        const form = await mount({ routes: { 'PUT /connections/mail-work/config': put } });

        form.type(form.input('port')!, '143');
        form.type(form.input('host')!, 'imap.other');
        await form.submit();

        expect(put.mock.calls[0]![0 as never]).toEqual({
            settings: {
                host: 'imap.other',
                port: 143,
                security: '',
                user: '',
            },
        });
    });

    it('leaves a locked field out of the settings', async () => {
        const put = vi.fn(() => view());
        const form = await mount({
            current: withField(view(), 'user', { source: { kind: 'env', variable: 'CHAMVI_MAIL_WORK_USER' } }),
            routes: { 'PUT /connections/mail-work/config': put },
        });

        await form.submit();

        expect(put.mock.calls[0]![0 as never]).not.toHaveProperty('settings.user');
    });

    it('sends a list as an array and a boolean as a boolean, reading stored ones back', async () => {
        const type: ConnectionTypeWire = {
            ...TYPE,
            fields: [
                {
                    key: 'guilds', 
                    label: 'Guilds', 
                    kind: 'list', 
                },
                {
                    key: 'dms', 
                    label: 'DMs', 
                    kind: 'boolean', 
                },
                {
                    key: 'other', 
                    label: 'Other', 
                    kind: 'boolean', 
                },
            ],
        };
        const current = view({
            settings: { guilds: ['a', 'b'], dms: false },
            fields: [
                { key: 'guilds', source: { kind: 'store' } },
                { key: 'dms', source: { kind: 'store' } },
                { key: 'other', source: { kind: 'unset' } },
            ],
        });
        const put = vi.fn(() => current);
        const form = await mount({
            type,
            current,
            routes: { 'PUT /connections/mail-work/config': put },
        });

        expect(form.input('guilds')?.value).toBe('a, b');
        expect(form.select('dms')?.textContent).toContain('No');
        expect(form.select('other')?.textContent).toContain('Not set');

        form.type(form.input('guilds')!, 'a, , c');
        await form.submit();

        expect(put.mock.calls[0]![0 as never]).toEqual({
            settings: {
                guilds: ['a', 'c'],
                dms: false,
                other: '',
            },
        });
    });

    it('shows the banner when restartRequired', async () => {
        const form = await mount({ current: view({ restartRequired: true }) });

        expect(form.root.textContent).toContain('Saved. Restart the app to apply.');
    });

    it('shows no banner when nothing is pending, and shows it after a save', async () => {
        const form = await mount({ routes: { 'PUT /connections/mail-work/config': () => view({ restartRequired: true }) } });

        expect(form.root.textContent).not.toContain('Restart the app');

        await form.submit();

        expect(form.root.textContent).toContain('Saved. Restart the app to apply.');
    });

    it('reports a field issue at its field and keeps a typed secret for another try', async () => {
        const unset = withField(view(), 'password', { source: { kind: 'unset' }, set: false });
        const form = await mount({
            current: unset,
            routes: {
                'PUT /connections/mail-work/config': () => {
                    throw new ApiError(400, 'validation_error', 'Invalid input', undefined, [
                        {
                            type: 'item', 
                            code: 'value_invalid', 
                            path: ['settings', 'host'], 
                            message: 'is required',
                        },
                    ]);
                },
            },
        });

        form.type(form.input('password')!, 'hunter2');
        await form.submit();

        // translated by its code (the ilingo validup catalog)
        expect(form.message('host')).toBe('The value is invalid');
        expect(form.root.querySelector('[data-testid="connection-form-failure"]')).toBeNull();
        expect(form.input('password')?.value).toBe('hunter2');

        // editing the field drops the server's issue there
        form.type(form.input('host')!, 'imap.fixed');
        await flush();

        expect(form.message('host')).toBeUndefined();
    });

    it('checks the fields before sending: a required one empty and a number that is none', async () => {
        const put = vi.fn(() => view());
        const form = await mount({ routes: { 'PUT /connections/mail-work/config': put } });

        form.type(form.input('host')!, '  ');
        form.type(form.input('port')!, 'many');
        await form.submit();

        expect(put).not.toHaveBeenCalled();
        expect(form.message('host')).toBe('The value is required');
        expect(form.message('port')).toBe('The value must be numeric');
        expect(form.field('port').querySelector('input')!.classList).toContain('is-invalid');

        form.type(form.input('host')!, 'imap.example.com');
        form.type(form.input('port')!, '993');
        await form.submit();

        expect(put).toHaveBeenCalledOnce();
        expect(form.message('host')).toBeUndefined();
    });

    it('needs an account id and a required secret while adding', async () => {
        const post = vi.fn(() => ({ name: 'mail-work', ...view() }));
        const form = await mount({ name: undefined, routes: { 'POST /connection-types/mail/connections': post } });

        form.type(form.input('host')!, 'imap.example.com');
        await form.submit();

        expect(post).not.toHaveBeenCalled();
        expect(form.message('account')).toBe('The value is required');
        expect(form.message('password')).toBe('The value is required');
        expect(form.emitted.created).toEqual([]);
    });

    it('labels every control by its field', async () => {
        const form = await mount({ name: undefined });

        const labelled = (key: string) => document.getElementById(form.field(key).querySelector('label')!.getAttribute('for')!);

        for (const key of ['account', 'host', 'port', 'password']) {
            expect(labelled(key)).toBe(form.input(key));
        }

        expect(labelled('security')).toBe(form.select('security'));
    });

    it('chooses an option of a select and sends it', async () => {
        const put = vi.fn(() => view());
        const form = await mount({ routes: { 'PUT /connections/mail-work/config': put } });
        const trigger = form.select('security')!;

        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await flush();

        const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((entry) => entry.textContent?.includes('tls'));

        expect(option).toBeDefined();
        option!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await flush();

        expect(trigger.textContent).toContain('tls');

        await form.submit();

        expect(put.mock.calls[0]![0 as never]).toMatchObject({ settings: { security: 'tls' } });
    });

    it('reports a refused save at the form', async () => {
        const form = await mount({
            routes: {
                'PUT /connections/mail-work/config': () => {
                    throw new ApiError(409, 'conflict', 'CHAMVI_ENCRYPTION_KEYS is not set');
                },
            },
        });

        await form.submit();

        expect(form.root.textContent).toContain('CHAMVI_ENCRYPTION_KEYS is not set');
    });

    it('offers delete only when deletable', async () => {
        const fixed = await mount({ current: view({ deletable: false }) });

        expect(fixed.button('Delete')).toBeUndefined();
        fixed.root.remove();
        mounted?.unmount();
        mounted = undefined;

        const stored = await mount({ current: view({ deletable: true }) });

        expect(stored.button('Delete')).toBeDefined();
    });

    it('confirms a delete in the page, never with a browser dialog', async () => {
        const confirm = vi.fn();

        vi.stubGlobal('confirm', confirm);

        const remove = vi.fn(() => ({ restartRequired: true }));
        const form = await mount({
            current: view({ deletable: true }),
            routes: { 'DELETE /connections/mail-work': remove },
        });

        form.button('Delete')!.click();
        await flush();

        expect(remove).not.toHaveBeenCalled();
        expect(form.root.querySelector('[role="alertdialog"]')?.textContent).toContain('work');

        form.button('Keep account')!.click();
        await flush();

        expect(form.root.querySelector('[role="alertdialog"]')).toBeNull();

        form.button('Delete')!.click();
        await flush();
        form.button('Delete account')!.click();
        await flush();

        expect(remove).toHaveBeenCalledOnce();
        expect(form.emitted.deleted).toEqual([{ name: 'mail-work', restartRequired: true }]);
        expect(confirm).not.toHaveBeenCalled();
    });

    it('shows why a delete was refused', async () => {
        const form = await mount({
            current: view({ deletable: true }),
            routes: {
                'DELETE /connections/mail-work': () => {
                    throw new ApiError(409, 'conflict', 'The connection is held.');
                },
            },
        });

        form.button('Delete')!.click();
        await flush();
        form.button('Delete account')!.click();
        await flush();

        expect(form.root.textContent).toContain('The connection is held.');
        expect(form.emitted.deleted).toEqual([]);
    });

    it('clears a secret after a confirmation in the page, leaving unsaved edits alone', async () => {
        const confirm = vi.fn();

        vi.stubGlobal('confirm', confirm);

        const put = vi.fn(() => withField(view({ restartRequired: true, deletable: true }), 'password', { source: { kind: 'unset' }, set: false }));
        const form = await mount({
            current: view({ deletable: true }),
            routes: { 'PUT /connections/mail-work/config': put },
        });

        form.type(form.input('host')!, 'imap.unsaved');
        form.button('Clear')!.click();
        await flush();

        expect(put).not.toHaveBeenCalled();
        expect(form.root.querySelector('[role="alertdialog"]')?.textContent).not.toContain('next start');

        form.button('Clear secret')!.click();
        await flush();

        expect(put.mock.calls[0]![0 as never]).toEqual({ secrets: { clear: ['password'] } });
        expect(form.input('password')?.value).toBe('');
        expect(form.input('host')?.value).toBe('imap.unsaved');
        expect(form.root.textContent).toContain('Saved. Restart the app to apply.');
        expect(confirm).not.toHaveBeenCalled();
    });

    it('warns that clearing a required secret of an env-declared account stops the next start', async () => {
        const form = await mount({ current: view({ deletable: false }) });

        form.button('Clear')!.click();
        await flush();

        expect(form.root.querySelector('[role="alertdialog"]')?.textContent).toContain('stops the next start until it is set again');
    });

    it('warns when another field comes from the environment', async () => {
        const form = await mount({ current: withField(view({ deletable: true }), 'user', { source: { kind: 'env', variable: 'CHAMVI_MAIL_WORK_USER' } }) });

        form.button('Clear')!.click();
        await flush();

        expect(form.root.querySelector('[role="alertdialog"]')?.textContent).toContain('stops the next start until it is set again');
    });

    it('shows the result of Test in the page', async () => {
        const form = await mount({ routes: { 'POST /connections/mail-work/test': () => ({ ok: false, message: 'Login refused.' }) } });

        form.button('Test')!.click();
        await flush();

        expect(form.root.querySelector('[data-testid="connection-test-result"]')?.textContent).toContain('Login refused.');
    });

    it('shows a working test, and a refused one as a failure', async () => {
        const ok = await mount({ routes: { 'POST /connections/mail-work/test': () => ({ ok: true }) } });

        ok.button('Test')!.click();
        await flush();

        expect(ok.root.querySelector('[data-testid="connection-test-result"]')?.textContent).toContain('work');
        ok.root.remove();
        mounted?.unmount();
        mounted = undefined;

        const refused = await mount({
            routes: {
                'POST /connections/mail-work/test': () => {
                    throw new ApiError(409, 'conflict', 'Save Password first.');
                },
            },
        });

        refused.button('Test')!.click();
        await flush();

        expect(refused.root.querySelector('[data-testid="connection-test-result"]')?.textContent).toContain('Save Password first.');
    });

    it('offers no Test for a type without one', async () => {
        const form = await mount({ type: { ...TYPE, testable: false } });

        expect(form.button('Test')).toBeUndefined();
    });

    it('creates an account through POST with an account id', async () => {
        const post = vi.fn(() => ({ name: 'mail-work', ...view() }));
        const form = await mount({ name: undefined, routes: { 'POST /connection-types/mail/connections': post } });

        form.type(form.input('account')!, 'work');
        form.type(form.input('host')!, 'imap.example.com');
        form.type(form.input('password')!, 'hunter2');
        await form.submit();

        expect(post.mock.calls[0]![0 as never]).toEqual({
            account: 'work',
            settings: {
                host: 'imap.example.com',
                port: '',
                security: '',
                user: '',
            },
            secrets: { password: 'hunter2' },
        });
        expect(form.emitted.created).toEqual([{ name: 'mail-work', restartRequired: false }]);
        expect(form.root.innerHTML).not.toContain('hunter2');
    });

    it('offers neither Test nor Delete while adding', async () => {
        const form = await mount({ name: undefined });

        expect(form.button('Test')).toBeUndefined();
        expect(form.button('Delete')).toBeUndefined();
        expect(form.root.textContent).not.toContain('Restart the app');
    });

    it('is read-only without the write grant', async () => {
        const reader: MeWire = {
            id: 'reader',
            kind: 'token',
            permissions: ['connection:mail-work:read'],
        };
        const form = await mount({ principal: reader });

        expect(form.input('host')?.disabled).toBe(true);
        expect(form.button('Save')).toBeUndefined();
        expect(form.button('Test')).toBeUndefined();
        expect(form.button('Replace')).toBeUndefined();
        expect(form.button('Clear')).toBeUndefined();
    });

    it('offers no Save for a connection set in code, Test stays', async () => {
        const form = await mount({ current: view({ editable: false }) });

        expect(form.button('Save')).toBeUndefined();
        expect(form.button('Test')).toBeDefined();
    });

    it('explains a connection it cannot load', async () => {
        const form = await mount({
            routes: {
                'GET /connections/mail-work/config': () => {
                    throw new ApiError(403, 'forbidden', 'Missing permission');
                },
            },
        });

        expect(form.root.textContent).toContain('connection:mail-work:read');
    });
});
