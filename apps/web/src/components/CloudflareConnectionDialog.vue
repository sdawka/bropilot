<script setup lang="ts">
import { computed, ref } from 'vue';
import { ExternalLink, X } from '@lucide/vue';
import type { CloudflareConnection } from '../services/world-api';
import { isCloudflareAccountId } from '../connection-state';

const props = defineProps<{ open: boolean; connection?: CloudflareConnection; pending?: boolean; error?: string }>();
const emit = defineEmits<{ close: []; start: []; selectAccount: [accountId: string]; disconnect: [] }>();
const accountId = ref('');
const accountIdValid = computed(() => isCloudflareAccountId(accountId.value));
const requiresAccount = computed(() => props.connection?.status === 'account_required');

function selectAccount() {
  if (accountIdValid.value) emit('selectAccount', accountId.value.trim());
}
</script>

<template>
  <dialog :open="open" class="context-panel connection-dialog" aria-labelledby="cloudflare-connection-title" @close="emit('close')">
    <header class="context-header"><h2 id="cloudflare-connection-title">Cloudflare connection</h2><button class="icon-button" aria-label="Close Cloudflare connection" @click="emit('close')"><X :size="18" /></button></header>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <template v-if="connection?.status === 'connected'">
      <p>Connected{{ connection.accountName ? ` to ${connection.accountName}` : '' }}.</p>
      <dl class="metadata"><dt>Account</dt><dd>{{ connection.accountId ?? 'Not selected' }}</dd><dt>Access</dt><dd>{{ connection.expiresAtMs ? 'Expires later' : 'Connected' }}</dd></dl>
      <div class="actions"><button class="secondary" :disabled="pending" @click="emit('disconnect')">{{ pending ? 'Disconnecting…' : 'Disconnect' }}</button></div>
    </template>
    <template v-else-if="requiresAccount">
      <p>Select the Cloudflare account chosen during consent. The account ID is validated against the connected account before it can publish a Worker.</p>
      <label class="dialog-field">Cloudflare account ID<input v-model="accountId" autocomplete="off" inputmode="text" /></label>
      <p v-if="accountId && !accountIdValid" class="field-error">Enter the 32-character hexadecimal Cloudflare account ID.</p>
      <div class="actions"><button class="primary" :disabled="pending || !accountIdValid" @click="selectAccount">{{ pending ? 'Confirming…' : 'Confirm account' }}</button></div>
    </template>
    <template v-else>
      <p>{{ connection?.status === 'reconnect_required' ? 'This connection needs to be renewed before it can publish a Worker.' : 'Connect Cloudflare to create a deployment target.' }}</p>
      <div class="actions"><button class="primary" :disabled="pending" @click="emit('start')">{{ pending ? 'Opening…' : 'Connect Cloudflare' }} <ExternalLink :size="15" /></button></div>
    </template>
  </dialog>
</template>
