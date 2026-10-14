import { App } from './app.js';
import { setView } from './bridge.js';
import './styles.css';

/**
 * Boot: the checkout token arrives in the URL fragment (#t=…, never sent to any server), is kept
 * for this tab only, and removed from the address bar.
 */
const id = location.pathname.split('/').pop() ?? '';
const key = `ck_t_${id}`;
const hash = new URLSearchParams(location.hash.slice(1));
const fromHash = hash.get('t');
try {
  if (hash.get('v')) sessionStorage.setItem('ck_view', hash.get('v')!);
  setView(sessionStorage.getItem('ck_view'));
} catch {
  setView(hash.get('v'));
}
let token: string | null = fromHash;
try {
  if (fromHash) sessionStorage.setItem(key, fromHash);
  else token = sessionStorage.getItem(key);
} catch {
  /* storage blocked: the token stays only in memory */
}
if (fromHash) history.replaceState(null, '', location.pathname);

const root = document.getElementById('app')!;
const app = new App(root, token ?? '');
void app.start();
