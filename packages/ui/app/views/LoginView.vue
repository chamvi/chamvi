<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { IFieldValidation } from '@ilingo/validup-vue';
import { useValidup } from '@validup/vue';
import { Container } from 'validup';
import {
    computed,
    reactive,
    ref,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
    ApiError,
    BrandLogo,
    isPagePath,
    safeReturnPath,
    useAppContext,
} from '@chamvi/ui-kit';
import { UI_VERSION } from '../config/constants.ts';
import { isFilled } from '../forms/validators.ts';

const { config, session } = useAppContext();
const route = useRoute();
const router = useRouter();

const form = reactive({ token: '' });
const tokenForm = new Container<{ token: string }>();

tokenForm.mount('token', isFilled());

// lazy: an untouched sign-in page shows no message
const v = useValidup(tokenForm, form, { lazy: true });
/** A refused or failed sign-in; an empty token is the field's issue. */
const error = ref<string>();
const busy = ref(false);

const returnTo = computed(() => safeReturnPath(route.query.redirect, '/', config.uiBase));
const authupHost = computed(() => (config.auth.authup ? new URL(config.auth.authup.url).host : ''));
const { host } = globalThis.location;

async function useToken(): Promise<void> {
    error.value = undefined;

    const checked = await v.$validate();

    if (!checked.success) {
        return;
    }

    busy.value = true;

    try {
        await session.signInWithToken(checked.data.token);
        form.token = '';
        v.$reset();

        // a *-ui page is outside this router: only a full navigation reaches it
        if (isPagePath(returnTo.value, config.uiBase)) {
            globalThis.location.assign(returnTo.value);

            return;
        }

        await router.replace(returnTo.value);
    } catch (e) {
        error.value = e instanceof ApiError && e.status === 401 ?
            'The API refused this token.' :
            `Sign-in failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
        busy.value = false;
    }
}

async function useAuthup(): Promise<void> {
    busy.value = true;
    error.value = undefined;

    try {
        await session.startAuthup(returnTo.value);
    } catch (e) {
        error.value = `Sign-in failed: ${e instanceof Error ? e.message : String(e)}`;
        busy.value = false;
    }
}
</script>

<template>
    <div class="login">
        <div class="login-wrap">
            <div class="card login-card">
                <BrandLogo />
                <div>
                    <p class="eyebrow">
                        Dashboard
                    </p>
                    <h1 class="display">
                        Sign in
                    </h1>
                </div>
                <template v-if="config.auth.authup">
                    <VCButton
                        class="btn btn-primary btn-block"
                        :loading="busy"
                        @click="useAuthup"
                    >
                        Continue with authup
                    </VCButton>
                    <p
                        class="hint"
                        style="text-align: center; margin-top: -8px"
                    >
                        Redirects to {{ authupHost }} and back (OIDC code flow).
                    </p>
                </template>
                <div
                    v-if="config.auth.authup && config.auth.tokens"
                    class="or"
                >
                    or paste a token
                </div>
                <form
                    v-if="config.auth.tokens"
                    @submit.prevent="useToken"
                >
                    <IFieldValidation
                        v-slot="{ value: validation }"
                        :field="v.fields.token"
                    >
                        <VCFormGroup
                            label-tag="span"
                            :validation="validation"
                        >
                            <template #label>
                                <label for="login-token">Bearer token</label>
                            </template>
                            <VCFormInput
                                id="login-token"
                                v-model="v.fields.token.$model.value"
                                class="mono"
                                type="password"
                                placeholder="paste a static token"
                                autocomplete="off"
                                name="token"
                            />
                        </VCFormGroup>
                    </IFieldValidation>
                    <VCButton
                        type="submit"
                        :class="['btn', 'btn-block', { 'btn-primary': !config.auth.authup }]"
                        :loading="busy"
                    >
                        Use token
                    </VCButton>
                    <p class="hint">
                        A static token from <span class="mono">staticTokens()</span>. Kept in sessionStorage for this tab only.
                    </p>
                </form>
                <p
                    v-if="error"
                    class="form-err"
                    role="alert"
                >
                    {{ error }}
                </p>
            </div>
            <p class="login-foot">
                chamvi {{ UI_VERSION }} · self-hosted at {{ host }}
            </p>
        </div>
    </div>
</template>
