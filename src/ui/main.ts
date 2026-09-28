// The only layer that touches the DOM. Grows into one state object and a render().
import { APP_NAME } from '../core';
import './style.css';

const app = document.querySelector<HTMLElement>('#app');
if (app) app.dataset.app = APP_NAME;
