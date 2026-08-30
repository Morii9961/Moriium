import { createApp } from 'vue/dist/vue.esm-bundler.js';
import App from './App.ts';
import './style.css';

const root = document.querySelector<HTMLElement>('[data-moriium-admin]');
if (root) createApp(App).mount(root);
