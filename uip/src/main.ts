import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { installSpaceHues } from './ontology';
import './style.css';
import 'vue-sonner/style.css';

installSpaceHues();
const app = createApp(App);
if (import.meta.env.DEV) void import('./store/graph').then((m) => ((window as unknown as { __uip: unknown }).__uip = m.useGraph()));
app.use(createPinia()).use(router).mount('#app');
