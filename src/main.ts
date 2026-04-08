// superosu — Web-based osu!standard clone

import { Application } from 'pixi.js';
import { ScreenManager } from './screens/screen-manager.ts';
import { SongSelectScreen } from './screens/song-select.ts';
import { GameplayScreen } from './screens/gameplay.ts';
import { ResultsScreen } from './screens/results.ts';
import { SettingsScreen } from './screens/settings.ts';
import { inputHandler } from './core/input-handler.ts';

async function main() {
  const app = new Application();

  await app.init({
    resizeTo: window,
    background: 0x000000,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  const appEl = document.getElementById('app')!;
  appEl.appendChild(app.canvas);

  // Bind input handler to the canvas
  inputHandler.bind(app.canvas);

  // Screen manager
  const sm = new ScreenManager(app);
  const navigate = (name: string) => sm.goto(name);

  sm.register('song-select', new SongSelectScreen(navigate));
  sm.register('gameplay', new GameplayScreen(navigate));
  sm.register('results', new ResultsScreen(navigate));
  sm.register('settings', new SettingsScreen(navigate));

  // Game loop
  app.ticker.add(() => {
    sm.update(app.ticker.deltaMS);
  });

  // Start at song select
  sm.goto('song-select');
}

main().catch(console.error);
