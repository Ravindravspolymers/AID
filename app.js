// AID Quizz v1.0 — app.js
// Boot + entry flow (§4 FLOWS). First open → Welcome; returning → Level map.

import { go } from './ui.js';
import * as state from './state.js';
import { welcomeScreen, accessScreen } from './onboarding.js';
import { levelMapScreen } from './levelmap.js';

function boot() {
  const s = state.get();
  if (!s.onboarded) go('welcome', welcomeScreen);
  else if (state.needsReconnect()) go('access', accessScreen, { from: 'restore' });   // v1.1: 2R
  else go('map', levelMapScreen);       // replay mode after Q1000 is handled inside the map
}

// Installable PWA: cache the app shell for fast loads. Skipped where not allowed (e.g. preview frames).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* not fatal */ });
  });
}

boot();
