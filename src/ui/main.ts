// The UI: one state object and a render(). The only layer that touches the DOM.
import { APP_NAME } from '../core';
import './style.css';

const app = document.querySelector<HTMLElement>('#app');
if (app) app.dataset.app = APP_NAME;
