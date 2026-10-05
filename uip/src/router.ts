import { createRouter, createWebHistory } from 'vue-router';
import { useGraph } from './store/graph';
import { readLastFocus } from './store/projects';
import { isPersp } from './perspectives';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'picker', component: () => import('./views/Picker.vue') },
    { path: '/p/:project', name: 'home', component: () => import('./views/ProjectHome.vue') },
    { path: '/p/:project/changes/:changesetId?', name: 'changes', component: () => import('./views/Changes.vue') },
    {
      // permalink → the last-used perspective's path to the node (re-root resolver, SPEC §3)
      path: '/p/:project/n/:id', name: 'permalink', component: () => import('./views/Traversal.vue'),
      beforeEnter: async (to) => {
        const g = useGraph();
        const project = to.params.project as string, id = to.params.id as string;
        await g.ensureProject(project);
        const lf = readLastFocus(project);
        const persp = lf && isPersp(lf.persp) ? lf.persp : 'domain';
        const path = g.resolvePath(persp, id);
        // no path on that chain → the node pinned as a floating first column
        return { path: g.buildUrl(persp, path ?? [id], project), query: to.query, hash: to.hash, replace: true };
      },
    },
    { path: '/p/:project/audit', name: 'audit', component: () => import('./views/Audit.vue') },
    { path: '/p/:project/:persp/:path(.*)*', name: 'traversal', component: () => import('./views/Traversal.vue') },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
});

useGraph().setRouter(router);
router.afterEach((to) => { void useGraph().sync(to); });
