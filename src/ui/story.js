import { playIntroCutscene } from './intro.js';
import { playEndingCutscene } from './ending.js';
import { endingStats } from './endingTimeline.js';
import { starsEarned } from '../core/growth.js';

// M5: the story around the game (GDD §2.1, §2.3): the intro before a new
// game and the ending after the escape. Both are 3D cutscenes in the game's
// own renderer on the same forest-and-cave-mouth set (ui/intro.js,
// ui/ending.js, played by ui/cutscene.js), skippable at any time.
export { CREDITS } from '../data/credits.js';

export function createStory(G) {
  const story = {
    playing: false,
    view: null, // (while a cutscene plays: the main loop's frames go here)
    // The intro: plays whenever a new game starts (새 게임, 처음부터; not
    // 이어 하기) and from the menu's 이야기 보기. The one way in (W6). Since
    // 2026-11-05 a 3D cutscene (the forest, the footprints, the cave mouth,
    // the fall, eyes in the dark, the hammer and the water gun).
    playIntro(onDone) {
      if (story.playing) return Promise.resolve();
      return playIntroCutscene(G, story).then(() => { G.state.prologue = true; onDone?.(); });
    },

    // Out into the daylight (GDD §2.3): the win is saved first (G.winRun:
    // a skip or a closed tab keeps it), then the ending cutscene (2026-11-07:
    // into the light, the cave mouth in the sun, the purple glow going out,
    // what was gathered — the real stars, bosses, shards and play time — off
    // into the sunset, the credits, THE END…?), then the result screen.
    async ending() {
      if (G.mode === 'ending' || G.mode === 'result' || story.playing) return;
      G.mode = 'ending';
      G.input.enabled = false;
      G.pointer?.cancel();
      G.map?.toggle(false);
      const won = G.winRun();
      const stats = endingStats(G.state, G.run, starsEarned);
      G.emit('ending', { first: !!won?.first, world: !!G.expedition, stats });
      await playEndingCutscene(G, story, { stats, wear: G.state.wear });
      G.mode = 'play'; // (victory() moves on to the result)
      G.victory();
    },
  };
  G.ending = story.ending;
  G.story = story;
  return story;
}
