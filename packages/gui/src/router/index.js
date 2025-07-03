import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('../views/Dashboard.vue'),
  },
  {
    path: '/entities',
    name: 'Entities',
    component: () => import('../views/Entities.vue'),
  },
  {
    path: '/graph',
    name: 'KnowledgeGraph',
    component: () => import('../views/KnowledgeGraph.vue'),
  },
  {
    path: '/chat',
    name: 'Chat',
    component: () => import('../views/Chat.vue'),
  },
  {
    path: '/docs',
    name: 'Documents',
    component: () => import('../views/Documents.vue'),
  },
  {
    path: '/work',
    name: 'WorkPlan',
    component: () => import('../views/WorkPlan.vue'),
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/Settings.vue'),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
