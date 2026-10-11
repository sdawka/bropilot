<script setup lang="ts">
import { computed } from 'vue';
import { ArrowUpRight, LoaderCircle, RotateCcw } from '@lucide/vue';
import { deploymentEligibility, latestDeploymentObservation, type DeploymentTargetView, type RuntimeObservationView } from '../deployment-state';
import type { DeploymentRecord } from '@bropilot/contracts';

const props = defineProps<{
  revisionId: string;
  headRevisionId: string;
  packageRef?: unknown;
  target?: DeploymentTargetView;
  connectionStatus?: string;
  deployments: DeploymentRecord[];
  observations: RuntimeObservationView[];
  pending?: boolean;
}>();
const emit = defineEmits<{ connect: []; createTarget: []; deploy: []; resume: [deployment: DeploymentRecord]; rollback: [deployment: DeploymentRecord] }>();
const activeDeployment = computed(() => props.deployments.find(deployment => deployment.targetId === props.target?.targetId && (deployment.status === 'queued' || deployment.status === 'running' || deployment.status === 'uncertain')));
const eligibility = computed(() => deploymentEligibility({ revisionId: props.revisionId, headRevisionId: props.headRevisionId, packageRef: props.packageRef, target: props.target, connectionStatus: props.connectionStatus, activeDeployment: activeDeployment.value }));
const currentDeployment = computed(() => props.deployments.filter(deployment => deployment.targetId === props.target?.targetId).at(-1));
const observation = computed(() => currentDeployment.value ? latestDeploymentObservation(currentDeployment.value.deploymentId, props.observations) : undefined);
const rollbackCandidate = computed(() => props.deployments.filter(deployment => deployment.targetId === props.target?.targetId && deployment.status === 'succeeded' && deployment.providerVersionId && deployment.deploymentId !== currentDeployment.value?.deploymentId).at(-1));
</script>

<template>
  <section class="surface deployment-panel" aria-labelledby="deployment-title">
    <div class="run-heading"><div><p class="quiet-status">Deployment</p><h2 id="deployment-title">Publish this verified version</h2></div><span v-if="currentDeployment" class="quiet-status"><LoaderCircle v-if="currentDeployment.status === 'queued' || currentDeployment.status === 'running'" class="loading-icon" :size="15" />{{ currentDeployment.status }}</span></div>
    <p v-if="!target">A Cloudflare connection is required before this World can create a deployment target.</p>
    <p v-else>Worker name: <strong>{{ target.workerName }}</strong></p>
    <p v-if="!eligibility.eligible" class="empty-note">{{ eligibility.reason }}</p>
    <div class="actions">
      <button v-if="!target" class="secondary" :disabled="pending" @click="connectionStatus === 'connected' ? emit('createTarget') : emit('connect')">{{ connectionStatus === 'connected' ? 'Create deployment target' : 'Connect Cloudflare' }}</button>
      <button v-else class="primary" :disabled="pending || !eligibility.eligible" @click="emit('deploy')">{{ pending ? 'Requesting…' : 'Deploy verified version' }}</button>
    </div>
    <template v-if="currentDeployment">
      <p v-if="currentDeployment.failure" class="field-error">{{ currentDeployment.failure }}</p>
      <p v-if="currentDeployment.url" class="deployment-url"><a :href="currentDeployment.url" target="_blank" rel="noopener noreferrer">Open deployed Worker <ArrowUpRight :size="14" /></a></p>
      <p v-if="currentDeployment.status === 'succeeded' && !observation" class="empty-note">Published. Runtime health has not been observed yet.</p>
      <p v-else-if="observation" :class="observation.healthy ? 'candidate-note' : 'field-error'">{{ observation.healthy ? 'Observed healthy' : 'Observed unhealthy' }}: {{ observation.summary }}</p>
      <div v-if="currentDeployment.status === 'queued' || currentDeployment.status === 'running' || currentDeployment.status === 'uncertain'" class="resume-action"><button class="secondary" :disabled="pending" @click="emit('resume', currentDeployment)">{{ pending ? 'Resuming…' : 'Resume deployment' }}</button></div>
    </template>
    <div v-if="rollbackCandidate && currentDeployment?.status === 'succeeded'" class="rollback-action"><p>Roll back to the previously published verified version.</p><button class="secondary" :disabled="pending" @click="emit('rollback', rollbackCandidate)"><RotateCcw :size="15" />{{ pending ? 'Requesting…' : 'Roll back' }}</button></div>
  </section>
</template>
