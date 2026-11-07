import { sfx, setMuted, isMuted, getVolume, setVolume } from '../audio/sound.js';
import { ITEMS } from '../data/items.js';
import { ENEMIES } from '../data/enemies.js';
import { BOSSES } from '../data/bosses.js';
import { CODEX_IDS } from '../data/codex.js';
import { LABEL } from '../render/quality.js';
import { starsEarned } from '../core/growth.js';

const $ = (id) => document.getElementById(id);

// GDD §4.1 / §4.2.
export const CONTROLS_HTML = `
  <kbd>왼쪽 클릭</kbd> 땅: 걸어가기(꾹 = 따라가기) · 적: 망치 · 물건/문/상자: 가서 사용 · <kbd>Shift</kbd>+클릭 제자리 망치<br>
  <kbd>오른쪽 클릭</kbd> 선택한 도구 · <kbd>Q</kbd> 도구 바꾸기 · <kbd>1</kbd> 냄새 · <kbd>2</kbd> 구르기 · <kbd>3</kbd> 방패(꾹) · <kbd>4</kbd> 약초<br>
  <kbd>Space</kbd> 가까운 것 사용 · 대화 넘기기 · <kbd>Tab</kbd> 동굴 지도 · 휠 확대 · <kbd>Esc</kbd> 메뉴<br>
  약초를 먹는 동안 <kbd>4</kbd>를 한 번 더: 약초 두 개로 하트 5칸`;
export const TOUCH_CONTROLS_HTML = `
  <kbd>땅을 톡</kbd> 걸어가기 · <kbd>왼쪽에 대고 끌기</kbd> 조이스틱 · <kbd>두 손가락</kbd> 가까이·멀리<br>
  동물을 톡: 망치 · 상자·상인을 톡: 가서 쓰기 · 🔨 망치(가까운 적 쪽으로)<br>
  💧 도구 · 🔄 도구 바꾸기 · 🌀 구르기 · 🛡️ 방패(꾹) · 🌱 약초 · 👃 냄새 · ✋ 가까운 것 쓰기<br>
  🗺️ 지도 · ☰ 메뉴 · 대화는 화면을 톡<br>
  약초를 먹는 동안 🌱를 한 번 더: 약초 두 개로 하트 5칸`;

const NEXT_LEVEL = { high: 'medium', medium: 'low', low: 'high' };

export function createScreens(G, { onRestart, onTitle }) {
  const screens = G.screens = {
    menuOpen: false,

    openMenu() {
      if (G.mode !== 'play' && G.mode !== 'dialog') return;
      screens.menuOpen = true;
      G.mode = 'menu';
      G.input.enabled = false;
      $('menu-stars').textContent = `⭐ ${G.state.stars}${G.state.necklace ? ' · 🏅 황금 목걸이' : ''}`;
      $('menu-controls').innerHTML = G.touch ? TOUCH_CONTROLS_HTML : CONTROLS_HTML;
      $('btn-mute').textContent = isMuted() ? '소리 켜기' : '소리 끄기';
      $('btn-quality').textContent = qualityLabel();
      $('vol-music').value = String(Math.round(getVolume('music') * 100));
      $('vol-sfx').value = String(Math.round(getVolume('sfx') * 100));
      $('menu').classList.remove('hidden');
    },
    closeMenu() {
      screens.menuOpen = false;
      $('menu').classList.add('hidden');
      G.settle();
    },

    // The result screen (GDD §8.2): fainted or through the area, how the
    // run went and what the codex gained. Then again with a new cave, or the
    // same one.
    showResult(run, { victory = false } = {}) {
      const el = $('result');
      // (W4: the big world's ending: the whole game, then on in the world)
      const world = !!G.expedition && victory;
      $('btn-again').classList.toggle('hidden', world);
      $('btn-same').classList.toggle('hidden', world);
      $('btn-continue').classList.toggle('hidden', !world);
      if (world) {
        const S = G.state, W = S.world;
        el.classList.add('win');
        $('result-title').textContent = '동굴을 탈출했어요!';
        $('result-sub').textContent = `용감한 몰티즈! 네 대장을 모두 재우고 햇빛을 찾았어요.${W.won > 1 ? ` (${W.won}번째 탈출)` : ''}`;
        const t = S.playTime, hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = Math.floor(t % 60);
        const seen = CODEX_IDS.filter((id) => S.seen?.[id]).length;
        const bosses = ['rabbitChief', 'mushroomQueen', 'iceBear', 'crystalKing'].filter((id) => W.bosses?.[id]).length;
        const stat = (icon, n, label, id) => `<div class="stat" id="${id}"><i>${icon}</i><b>${n}</b><small>${label}</small></div>`;
        $('result-stats').innerHTML = [
          stat('⏱️', `${hh ? `${hh}:${String(mm).padStart(2, '0')}` : mm}:${String(ss).padStart(2, '0')}`, '모험한 시간', 'stat-time'),
          stat('⭐', starsEarned(S), '모은 별', 'stat-stars'), // (every star earned: the ending showed the same)
          stat('📖', `${seen}/${CODEX_IDS.length}`, '도감', 'stat-codex'),
          stat('👑', `${bosses}/4`, '재운 대장', 'stat-bosses'),
          stat('💤', W.asleep ?? run.asleep, '재운 동물', 'stat-asleep'),
          stat('💎', run.shards, '수정 조각', 'stat-shards'),
        ].join('');
        const chips = ['rabbitChief', 'mushroomQueen', 'iceBear', 'crystalKing'].filter((id) => W.bosses?.[id]).map((id) => `<span data-id="${id}">${BOSSES[id].icon} ${BOSSES[id].name}</span>`);
        $('result-found').querySelector('h3').textContent = '재운 대장들';
        $('result-chips').innerHTML = chips.join('');
        $('result-note').textContent = '동굴은 그대로 열려 있어요. 계속 탐험하며 도감을 채워 봐요!';
        el.classList.remove('hidden');
        return;
      }
      $('result-found').querySelector('h3').textContent = '새로 발견한 것';
      el.classList.toggle('win', victory);
      $('result-title').textContent = victory ? '동굴을 탈출했어요!' : '몰티즈가 지쳐서 잠들었어요…';
      const boss = BOSSES.rabbitChief;
      $('result-sub').textContent = victory ? `용감한 몰티즈! ${boss.name}을 물리쳤어요.${run.won?.first ? ' ⭐ 별 하나!' : ''}` : '괜찮아요, 동굴 입구에서 다시 시작해요.';
      const mins = Math.floor(run.time / 60), secs = Math.floor(run.time % 60);
      const stat = (icon, n, label, id) => `<div class="stat" id="${id}"><i>${icon}</i><b>${n}</b><small>${label}</small></div>`;
      $('result-stats').innerHTML = [
        stat('🚪', run.rooms, '지나온 방', 'stat-rooms'),
        stat('💤', run.asleep, '잠재운 동물', 'stat-asleep'),
        stat('💎', run.shards, '수정 조각', 'stat-shards'),
        stat('⏱️', `${mins}:${String(secs).padStart(2, '0')}`, '걸린 시간', 'stat-time'),
      ].join('');
      const found = run.found.map((id) => {
        const def = ENEMIES[id] ?? ITEMS[id] ?? BOSSES[id];
        return `<span data-id="${id}">${def?.icon ?? '✨'} ${def?.name ?? id}</span>`;
      });
      $('result-chips').innerHTML = found.length ? found.join('') : '<em>이번에는 없어요. 다음엔 무엇을 만날까요?</em>';
      $('result-note').textContent = victory ? '도감에 남았어요!' : '아이템과 수정 조각은 동굴에 두고 왔지만, 도감은 남아요.';
      el.classList.remove('hidden');
    },
    hideResult() { $('result').classList.add('hidden'); },
  };
  // 다시 하기: a new cave; 같은 동굴 다시: the same seed, the same rooms
  $('btn-again').onclick = () => { sfx.click(); G.restartRun({}); };
  $('btn-same').onclick = () => { sfx.click(); G.restartRun({ seed: G.run.seed }); };
  $('btn-title').onclick = () => { sfx.click(); onTitle?.(); }; // back to the title (the save stays)
  // W4: after the big world's ending: on in the world (the post-game)
  $('btn-continue').onclick = () => {
    sfx.click();
    screens.hideResult();
    G.hud.fade(false);
    G.mode = 'play';
    G.fainted = false;
    G.cutscenes = 0;
    G.input.enabled = true;
    G.settle();
    G.expedition?.afterEnding?.();
    G.emit('continued');
  };

  $('btn-resume').onclick = () => { screens.closeMenu(); sfx.click(); };
  // W5: music and sound effects, each its own loudness (kept in this browser)
  $('vol-music').oninput = (e) => setVolume('music', Number(e.target.value) / 100);
  $('vol-sfx').oninput = (e) => { setVolume('sfx', Number(e.target.value) / 100); sfx.click(); };
  $('btn-mute').onclick = () => { setMuted(!isMuted()); $('btn-mute').textContent = isMuted() ? '소리 켜기' : '소리 끄기'; };
  // 화질 높음 → 중간 → 낮음 (render/quality.js; phones start low, a slow
  // machine may have stepped itself down), switched live and kept in this
  // browser as the player's own pick (main.js G.setQuality)
  const qualityLabel = () => `화질: ${LABEL[G.quality] ?? LABEL.high}`;
  $('btn-quality').onclick = () => { G.setQuality?.(NEXT_LEVEL[G.quality] ?? 'high'); $('btn-quality').textContent = qualityLabel(); sfx.click(); };
  // a new run: ask with a second press (no native dialog). The save (codex,
  // stars, unlocks) is kept; only this run is thrown away.
  let restartArmed = -Infinity; // performance.now() starts at 0 with the page
  $('btn-restart').onclick = () => {
    if (performance.now() - restartArmed < 3000) { onRestart(); return; }
    restartArmed = performance.now();
    $('btn-restart').textContent = '정말요? 한 번 더 누르면 처음부터!';
    setTimeout(() => { $('btn-restart').textContent = '처음부터'; }, 3000);
  };
  return screens;
}
