import { createRouter, createWebHistory } from 'vue-router';
import WorldWorkspace from './views/WorldWorkspace.vue';

export const views = ['overview', 'map', 'theory', 'work', 'evaluations', 'history'] as const;
export type WorkspaceView = typeof views[number];

export function isWorkspaceView(value: unknown): value is WorkspaceView {
  return typeof value === 'string' && (views as readonly string[]).includes(value);
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/worlds/assistant-world/revisions/assistant-valid/overview' },
    {
      path: '/worlds/:worldId/revisions/:revisionId/:view?',
      name: 'world',
      component: WorldWorkspace,
      props: true,
      beforeEnter: (to) => isWorkspaceView(to.params.view ?? 'overview') || { ...to, params: { ...to.params, view: 'overview' } },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
