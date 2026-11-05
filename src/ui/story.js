import { sfx, setMusic } from '../audio/sound.js';
import { BOSSES } from '../data/bosses.js';
import { playIntroCutscene } from './intro.js';

// M5: the story around a run (GDD §2.1, §2.3): the prologue before a new
// game and the ending after the escape: sunlight, "멍멍! 드디어 탈출했다!",
// THE END, the credits (GDD §15), then the result screen.
const $ = (id) => document.getElementById(id);

export const CREDITS = [
  ['이야기·디렉션', 'Jiyu (딸) · Hackerwins (아빠)'],
  ['3D 모델', 'Polyfork (polyfork.dev)'],
  ['엔진', 'three.js · 물리 Rapier'],
  ['화면 효과', 'postprocessing (zlib) · N8AO (ISC)'],
  ['글꼴', 'Jua (SIL OFL)'],
  ['라이선스 전문', '<a href="THIRD_PARTY_LICENSES.txt" target="_blank" rel="noopener">THIRD_PARTY_LICENSES.txt</a>'],
];

export function createStory(G) {
  const story = {
    playing: false,
    view: null, // (while the intro plays: the main loop's frames go here)
    // The intro: plays whenever a new game starts (새 게임, 처음부터; not
    // 이어 하기) and from the menu's 이야기 보기. The one way in (W6). Since
    // 2026-11-05 it is a 3D cutscene in the game's own renderer (ui/intro.js:
    // the forest, the footprints, the cave mouth, the fall, eyes in the
    // dark, the hammer and the water gun), skippable at any time.
    playIntro(onDone) {
      if (story.playing) return Promise.resolve();
      return playIntroCutscene(G, story).then(() => { G.state.prologue = true; onDone?.(); });
    },

    // Out into the daylight (GDD §2.3): the screen goes bright, the ending,
    // then the result screen. The win is saved here (G.winRun).
    async ending() {
      if (G.mode === 'ending' || G.mode === 'result') return;
      G.mode = 'ending';
      G.input.enabled = false;
      const btn = $('btn-ending');
      btn.disabled = true; // (a moment to read before it can be skipped)
      G.pointer?.cancel();
      G.map?.toggle(false);
      sfx.sunrise?.();
      setMusic('calm');
      $('fade').classList.add('sun', 'on');
      await wait(1300);
      const won = G.winRun();
      // (W4: the big world: the whole game's play time, the Crystal King's star)
      const world = !!G.expedition;
      const t = world ? G.state.playTime : G.run.time;
      $('ending-time').textContent = world ? `모두 ${Math.floor(t / 3600) ? `${Math.floor(t / 3600)}시간 ` : ''}${Math.floor((t % 3600) / 60)}분 ${Math.floor(t % 60)}초 동안 모험했어요!` : `${Math.floor(t / 60)}분 ${Math.floor(t % 60)}초 만에 탈출!`;
      const firstKing = world ? won?.first && G.state.beaten?.crystalKing === 1 : won?.first;
      $('ending-star').classList.toggle('hidden', !firstKing);
      $('ending-star').textContent = `⭐ ${BOSSES[world ? 'crystalKing' : 'rabbitChief'].name}을 처음 물리쳤어요! 별 하나를 얻었어요`;
      document.querySelector('#ending .soon')?.classList.toggle('hidden', world);
      $('ending-credits').innerHTML = CREDITS.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
      const el = $('ending');
      el.classList.remove('hidden');
      $('fade').classList.remove('on');
      await wait(700);
      $('fade').classList.remove('sun');
      sfx.fanfare();
      G.emit('ending', { first: !!won?.first, world });
      await wait(1800);
      btn.disabled = false;
      await new Promise((resolve) => {
        const go = () => { removeEventListener('keydown', onKey, true); btn.onclick = null; resolve(); };
        const onKey = (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); go(); } };
        addEventListener('keydown', onKey, true);
        btn.onclick = go;
      });
      sfx.click();
      el.classList.add('hidden');
      G.mode = 'play'; // (victory() moves on to the result)
      G.victory();
    },
  };
  G.ending = story.ending;
  G.story = story;
  return story;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
