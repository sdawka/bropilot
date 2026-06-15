import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

// Global error handler for uncaught errors
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
  // Prevent the default browser error handling
  event.preventDefault();
});

// Global handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  // Prevent the default browser error handling
  event.preventDefault();
});

mount(App, { target: document.getElementById('app')! });
