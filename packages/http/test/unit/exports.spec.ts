/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    describe,
    expect,
    expectTypeOf,
    it,
} from 'vitest';
import type { PermissionAuthorization, PermissionBinding, PermissionIdentity } from '@chamvi/access';
import * as http from '@chamvi/http';

describe('public api', () => {
    it('exports the openapi option type', () => {
        expectTypeOf<http.OpenApiOptions>().toEqualTypeOf<{ ui?: boolean; documentPath?: string }>();
        expectTypeOf<http.HttpAppOptions['openapi']>().toEqualTypeOf<false | http.OpenApiOptions | undefined>();
        expect(http).not.toHaveProperty('registerOpenApiRoutes');
        expect(http).not.toHaveProperty('loadOpenApiDocument');
        expect(http).not.toHaveProperty('OPENAPI_DOCUMENT_PATH');
    });

    it('exports the channel HTTP rate-limit policy type', () => {
        expectTypeOf<http.ChannelRateLimitOptions>().toEqualTypeOf<{ max: number; windowMs?: number }>();
        expectTypeOf<http.HttpAppOptions['channelRateLimits']>()
            .toEqualTypeOf<Record<string, false | http.ChannelRateLimitOptions> | undefined>();
    });

    it.each([
        'assertMcpRunTool',
        'authup',
        'buildCsp',
        'createHttpApp',
        'createShutdown',
        'httpChannel',
        'isFileLike',
        'loadBuild',
        'mcpChannel',
        'oidc',
        'renderStaticIndex',
        'resolveBuildPath',
        'staticRoutes',
        'staticTokens',
        'webhookChannel',
    ])('exports %s', (name) => {
        expect(http).toHaveProperty(name);
        expect(http[name as keyof typeof http]).toBeTypeOf('function');
    });

    it('exports the subscription builders and channel names', () => {
        expect(http.http.on).toBeTypeOf('function');
        expect(http.webhook.on).toBeTypeOf('function');
        expect(http.HTTP_CHANNEL_NAME).toBe('http');
        expect(http.MCP_CHANNEL_NAME).toBe('mcp');
        expect(http.WEBHOOK_CHANNEL_NAME).toBe('webhook');
    });

    it.each([
        'agentPermission',
        'connectionPermission',
        'CONNECTIONS_CREATE_PERMISSION',
        'Permission',
        'hasPermission',
    ])('leaves %s to @chamvi/access', (name) => {
        expect(http).not.toHaveProperty(name);
    });

    it('types principals with permission bindings', () => {
        expectTypeOf<http.Principal['bindings']>().toEqualTypeOf<readonly PermissionBinding[]>();
        expectTypeOf<http.Principal['authorization']>().toEqualTypeOf<PermissionAuthorization | undefined>();
        expectTypeOf<http.Principal['identity']>().toEqualTypeOf<PermissionIdentity | undefined>();
        expectTypeOf<http.StaticToken['permissions']>().toEqualTypeOf<readonly PermissionBinding[] | '*'>();
    });

    it('exports the shutdown defaults', () => {
        expect(http.DEFAULT_SHUTDOWN_DRAIN_TIMEOUT_MS).toBe(30_000);
        expect(http.DEFAULT_SHUTDOWN_CLOSE_TIMEOUT_MS).toBe(5_000);
    });

    it('exports the MeView, AuthorizationCheckBody, AuthorizationCheckView and ApproveBody types', () => {
        expectTypeOf<http.MeView>().toEqualTypeOf<{
            id: string;
            kind: string;
            name?: string;
            identity?: PermissionIdentity;
        }>();
        expectTypeOf<http.AuthorizationCheckBody>().toEqualTypeOf<{ names?: string[] }>();
        expectTypeOf<http.AuthorizationCheckView>().toEqualTypeOf<{ permissions: string[] }>();
        expectTypeOf<http.ApproveBody>().toEqualTypeOf<{
            approvalId: string;
            approved: boolean;
            reason?: string;
            selected?: string[];
        }>();
    });
});
