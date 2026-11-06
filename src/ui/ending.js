import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ENDING_MODELS } from './introModels.js';
import { createMaltese, createMalteseAnimator, createHammer, createWaterGun } from '../entities/maltese.js';
import { applyWear } from '../entities/cosmetics.js';
import { softGlowTexture } from '../world/glow.js';
import { BOSSES } from '../data/bosses.js';
import { CREDITS, CREDITS_TITLE, CREDITS_THANKS } from '../data/credits.js';
import { ENDING_TIMELINE, ENDING_LENGTH, ENDING_FADE_OUT, ENDING_CHOICES, shownPieces, playTimeText } from './endingTimeline.js';
import { ramp } from './timeline.js';
import { playCutscene } from './cutscene.js';
import {
  HOLE, PATH_LEN, pathAt, tangentAt, smooth, lerpAngle, seeded, forestRnd, createKit, buildGround, buildForest, poseFlies,
  rockTube, lidColor, motes, driftMotes, groundHeight,
} from './cutsceneSet.js';

// The ending cutscene (GDD §2.3; tasks/20261107-ending-cutscene-todo.md):
// the intro's mirror. The intro walked through a sunny forest into a cave
// mouth and fell into the dark; the ending runs up out of the dark into the
// light and comes out of that same cave mouth (the intro's set,
// ui/cutsceneSet.js). Seven scenes (ui/endingTimeline.js): into the light;
// blinking in the sun, "멍멍! 드디어 탈출했다!"; the cave's purple glow
// going out; the hammer, the water gun and the bag put down, the shards
// sparkling and the stars earned (the real save) rising into the sky; off
// along the path into the sunset; the credits over the sunset forest; and
// a tiny purple shard glinting in the dark: "THE END…?". Then the result.
//
// Played by the cutscene player (ui/cutscene.js): letterbox, subtitles,
// 건너뛰기 ▶▶ / Esc at any time, a click or Space moving on a line, the set
// let go of entirely afterwards. Everything is a function of the clock `t`.

const HERO = 1.12; // (player.js HERO_SCALE)
const AZIMUTH = -72; // (°) the sun stands over the forest, ahead of the dog coming out
const DAY = 0.22, GOLDEN = 0.55, DUSK = 0.8, LATE = 0.87; // stage's day → night line (stage.mjs setTime)
// the tunnel (scenes 1 and 7): a rock tube along x, deep under the meadow,
// its bright end at -x, its dark back at +x
const TUN_Y = -40, TUN_R = 2.9, TUN_X0 = -19, TUN_X1 = 19, TUN_MID = 1.6;
const SHARD = new THREE.Vector3(14.6, TUN_Y + 0.07, 0.35); // the purple shard on the tunnel's floor (scene 7)
// out in the sun: where the dog stops, where things are put down (the hole,
// filled since the intro, at the origin; the cave mouth's arch at +x)
const OUT = new THREE.Vector3(2.7, 0, 0.35);
const FACE_OUT = -Math.PI / 2; // facing -x: the forest and the sun
const FACE_CAVE = Math.PI / 2;
const GLOW_AT = new THREE.Vector3(7.2, 2.6, 0.2); // the purple glow deep in the cave mouth
const SET_FACE = FACE_OUT + 0.55; // scene 4: turned a little toward the camera
const SET_FWD = new THREE.Vector3(Math.sin(SET_FACE), 0, Math.cos(SET_FACE));
const SET_SIDE = new THREE.Vector3(SET_FWD.z, 0, -SET_FWD.x); // (its left)
const TOOLS_AT = OUT.clone().addScaledVector(SET_FWD, 0.62).addScaledVector(SET_SIDE, -0.12);
const BAG_AT = OUT.clone().addScaledVector(SET_FWD, 0.35).addScaledVector(SET_SIDE, 0.62);
const RING_AT = BAG_AT.clone().addScaledVector(SET_SIDE, 0.22); // (the shards circle the bag on its far side, clear of the dog's face)
// the walk off (scene 5): from where it stood onto the intro's path, then
// back along it, away from the cave
const WALK_FROM = 27.6, WALK_SPEED = 1.55;
const PATH_END = pathAt(PATH_LEN), LEG0 = OUT.distanceTo(PATH_END);
function walkAt(t, out, F) {
  const d = Math.max(0, t - WALK_FROM) * WALK_SPEED;
  if (d < LEG0) { out.lerpVectors(OUT, PATH_END, d / LEG0); return Math.atan2(PATH_END.x - OUT.x, PATH_END.z - OUT.z); }
  const s = Math.max(0.5, PATH_LEN - (d - LEG0));
  pathAt(s, out); tangentAt(s, F);
  return Math.atan2(-F.x, -F.z);
}
const BOSS_GLOW = { rabbitChief: '#ffb3d1', mushroomQueen: '#ff7a6b', iceBear: '#9fd8ff', crystalKing: '#c49bff' };

export { ENDING_MODELS };

// ------------------------------------------------------------------ the set
function buildSet(renderer, keep, { shadowMap } = {}, { stats, wear }) {
  const kit = createKit(renderer, keep, { shadowMap, azimuth: AZIMUTH });
  const { scene, own, track, tex, look, put } = kit;
  look.setTime(DAY);
  kit.rnd = forestRnd(); // (the very same forest the intro walked through)
  const { blotch } = buildGround(kit);
  const { rays, pollen, flies, mouth } = buildForest(kit);
  const rnd = seeded(31);

  // -- the hole the intro fell through, filled in since: bare earth
  const plug = new THREE.Mesh(new THREE.CircleGeometry(HOLE + 0.02, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: lidColor(), map: blotch, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
  plug.position.y = 0.004;
  plug.receiveShadow = true;
  scene.add(track(plug));

  // -- the cave mouth's purple glow (the crystal's power; it goes out in scene 3)
  const glowMat = new THREE.MeshBasicMaterial({ map: softGlowTexture(), color: '#a874ff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const glow = new THREE.Group();
  for (const [s, x] of [[7.5, 0], [4.2, -0.8]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 0.9), glowMat); m.rotation.y = Math.PI / 2; m.position.x = x; glow.add(m); }
  glow.position.copy(GLOW_AT);
  scene.add(track(glow));
  const glowLight = new THREE.PointLight('#b07cff', 0, 13, 1.2);
  glowLight.position.copy(GLOW_AT).add(new THREE.Vector3(-2.4, -0.6, 0));
  scene.add(glowLight);
  const wisps = motes(70, (r) => new THREE.Vector3(GLOW_AT.x - r() * 3.5, 0.4 + r() * 4.5, (r() - 0.5) * 5), '#c9a2ff', 0.13);
  const dust = motes(90, (r) => new THREE.Vector3(4 + r() * 4, 6 + r() * 4, (r() - 0.5) * 9), '#a4917a', 0.12, false);
  scene.add(track(wisps), track(dust));

  // -- the tunnel (scene 1: out into the light; scene 7: its dark back)
  const tubeG = rockTube(TUN_R, TUN_R, TUN_X1, TUN_X0, 30, 18, ['#2a2433', '#6b5f72'], 0.9, 11).rotateZ(-Math.PI / 2);
  const tube = new THREE.Mesh(tubeG, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.BackSide }));
  tube.position.y = TUN_Y + TUN_MID;
  const tFloorG = new THREE.PlaneGeometry(TUN_X1 - TUN_X0, 5.6, 40, 6).rotateX(-Math.PI / 2);
  {
    const p = tFloorG.attributes.position, c = new Float32Array(p.count * 3), a = new THREE.Color('#4e4658'), b = new THREE.Color('#857a70'), k = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, Math.abs(z) > 2.2 ? 0.25 : 0.03 * Math.sin(x * 2.1 + z * 3.3));
      k.copy(a).lerp(b, ramp(-x, -6, 18)).multiplyScalar(0.9 + 0.12 * Math.sin(x * 5.3) * Math.cos(z * 4.1));
      c.set([k.r, k.g, k.b], i * 3);
    }
    tFloorG.setAttribute('color', new THREE.BufferAttribute(c, 3));
    tFloorG.computeVertexNormals();
  }
  const tFloor = new THREE.Mesh(tFloorG, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  tFloor.position.set((TUN_X0 + TUN_X1) / 2, TUN_Y, 0);
  tFloor.receiveShadow = true;
  const backCap = new THREE.Mesh(new THREE.CircleGeometry(TUN_R * 1.3, 20).rotateY(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1b1722', roughness: 1 }));
  backCap.position.set(TUN_X1 - 0.3, TUN_Y + TUN_MID, 0);
  // the way out: a disc of daylight with a wide soft halo
  const exitDisc = new THREE.Mesh(new THREE.CircleGeometry(TUN_R * 1.15, 32).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fffaf0', fog: false }));
  exitDisc.position.set(TUN_X0 + 0.4, TUN_Y + TUN_MID, 0);
  const exitHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#fff3d6', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  exitHalo.position.copy(exitDisc.position).x += 1.2;
  exitHalo.scale.setScalar(13);
  const exitLight = new THREE.PointLight('#fff0d0', 0, 34, 1.1);
  exitLight.position.set(TUN_X0 + 2.5, TUN_Y + 2, 0);
  const tunnel = new THREE.Group();
  tunnel.add(tube, tFloor, backCap, exitDisc, exitHalo, exitLight);
  scene.add(track(tunnel));
  // crystals in the walls, stalactites, and the purple shard on the floor
  const tunnelLight = new THREE.PointLight('#9b7bff', 0, 14, 1.3);
  tunnelLight.position.set(6, TUN_Y + 2.4, -1.2);
  scene.add(tunnelLight);
  for (const [x, z, s, ry] of [[9, -1.9, 0.9, 0.5], [3, 2.0, 0.7, 2.1], [-4, -2.0, 0.8, 4], [12.5, 1.9, 1.0, 1], [16.5, -1.7, 0.8, 3]]) put('crystalCluster', x, z, { s, ry, y: TUN_Y + 0.1 });
  for (let i = 0; i < 9; i++) {
    const o = put('stalactites', -14 + i * 3.6 + rnd(), (rnd() - 0.5) * 2.4, { s: 0.7 + rnd() * 0.4 });
    const box = new THREE.Box3().setFromObject(o);
    o.position.y += TUN_Y + TUN_MID + TUN_R * 0.82 - box.max.y;
  }
  put('mushrooms', 16.2, 1.5, { s: 0.9, y: TUN_Y });
  const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0).scale(0.7, 1.5, 0.7), new THREE.MeshStandardMaterial({ color: '#b98aff', emissive: '#8a4dff', emissiveIntensity: 1.1, roughness: 0.25, flatShading: true }));
  shard.position.copy(SHARD).setY(SHARD.y + 0.12);
  shard.rotation.set(0.5, 0.3, 0.35);
  const shardGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#b98aff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  shardGlow.position.copy(shard.position);
  const shardLight = new THREE.PointLight('#a66bff', 0, 4, 1.5);
  shardLight.position.copy(SHARD).add(new THREE.Vector3(0, 0.45, 0));
  scene.add(track(shard), track(shardGlow), shardLight);

  // -- the sun: a bright soft disc riding the sky where the key light comes from
  const sunMat = new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#fff3c8', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const sun = new THREE.Sprite(sunMat);
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sun.renderOrder = sunCore.renderOrder = -900; // (after the sky dome, before everything else)
  scene.add(track(sun), track(sunCore));

  // -- the Maltese (with what it wears from the star altar), its bag
  const dog = createMaltese();
  dog.scale.setScalar(HERO);
  applyWear(dog, wear ?? {});
  look.shadows(dog);
  scene.add(dog);
  dog.traverse((m) => { if (m.geometry) own.geometries.add(m.geometry); }); // (its materials are the hero's: kept)
  const animate = createMalteseAnimator(dog);
  look.follow(dog);
  const rig = dog.userData.rig;
  const worn = makeBag();
  worn.scale.setScalar(0.46);
  worn.position.set(0.21, 0.0, -0.1);
  worn.rotation.set(0, Math.PI / 2, 0.12);
  rig.torso.add(worn);
  const bag = makeBag();
  bag.position.copy(BAG_AT);
  bag.scale.setScalar(0.85);
  bag.rotation.y = SET_FACE + 0.4;
  look.shadows(bag);
  scene.add(bag);
  track(worn); track(bag);

  // the hammer and the water gun, put down by the dog in scene 4
  const tools = new THREE.Group();
  const hammer = createHammer(), gun = createWaterGun();
  hammer.scale.setScalar(1.25); gun.scale.setScalar(1.25);
  hammer.rotation.set(Math.PI / 2, 0, 0.9); hammer.position.set(-0.12, 0.06, 0.05);
  gun.rotation.set(0, 0.6, Math.PI / 2); gun.position.set(0.22, 0.08, -0.12);
  tools.add(hammer, gun);
  tools.position.copy(TOOLS_AT);
  tools.rotation.y = SET_FACE;
  look.shadows(tools);
  scene.add(track(tools));

  // -- what was gathered: crystal shards out of the bag, stars into the sky
  const pieces = shownPieces(stats);
  const gemGeo = new THREE.OctahedronGeometry(0.075, 0).scale(0.75, 1.4, 0.75);
  const gemMats = ['#7fe3ff', '#b58cff', '#8affd0'].map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.65, roughness: 0.2, flatShading: true }));
  const sparkleMat = new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#e8fbff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const shards = [];
  for (let i = 0; i < pieces.shards; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(gemGeo, gemMats[i % 3]));
    const sp = new THREE.Sprite(sparkleMat.clone());
    sp.scale.setScalar(0.32);
    g.add(sp);
    g.userData = { a: (i / pieces.shards) * Math.PI * 2 + rnd() * 0.3, r: 0.3 + rnd() * 0.22, h: 0.3 + rnd() * 0.4, at: 20.4 + i * 0.09, ph: rnd() * 6 };
    g.visible = false;
    scene.add(track(g));
    shards.push(g);
  }
  own.geometries.add(gemGeo);
  const starGeo = starGeometry();
  const starMat = new THREE.MeshStandardMaterial({ color: '#ffd84a', emissive: '#ffb81c', emissiveIntensity: 0.75, roughness: 0.35, metalness: 0.1 });
  const stars = [];
  const risers = [...stats.bosses.slice(0, pieces.big).map((id) => ({ big: true, id })), ...Array.from({ length: pieces.small }, () => ({ big: false }))];
  risers.forEach((r, i) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(starGeo, starMat);
    m.castShadow = false;
    g.add(m);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: r.big ? BOSS_GLOW[r.id] ?? '#fff1a8' : '#fff1a8', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.scale.setScalar(r.big ? 2.0 : 1.1);
    g.add(halo);
    g.scale.setScalar(r.big ? 0.36 : 0.22);
    g.userData = { ...r, at: 22.4 + i * (r.big ? 0.42 : 0.26) + (r.big ? 0 : 0.25), a: i * 2.39996, ph: rnd() * 6 };
    g.visible = false;
    scene.add(track(g));
    stars.push(g);
  });
  own.geometries.add(starGeo);

  // a few fireflies over the meadow as the sun goes down
  const fireflies = motes(120, (r) => new THREE.Vector3(-30 + r() * 34, 0.5 + r() * 3.5, -9 + r() * 18), '#fff3a0', 0.12);
  scene.add(track(fireflies));

  return {
    ...kit, scene, look, own, keep, dog, animate, rig, rays, pollen, flies, mouth, glow, glowMat, glowLight, wisps, dust,
    tunnel, exitHalo, exitLight, tunnelLight, shard, shardGlow, shardLight, sun, sunCore, worn, bag, tools, shards, stars, fireflies,
    stats, pieces, tod: -1, under: null,
  };
}

// a little explorer's satchel: a rounded leather bag, its flap (it opens
// toward the back), a strap loop, a golden buckle
function makeBag() {
  const g = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: '#b07440', roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: '#7a4a26', roughness: 0.85 });
  const gold = new THREE.MeshStandardMaterial({ color: '#f2c14e', emissive: '#7a5a10', emissiveIntensity: 0.3, roughness: 0.4 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.34, 0.24, 3, 0.08), leather);
  body.position.y = 0.17;
  const flapPivot = new THREE.Group(); // (hinged along the back's top edge)
  flapPivot.position.set(0, 0.34, -0.11);
  const flap = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.05, 0.27, 2, 0.022), dark);
  flap.position.set(0, 0.0, 0.125);
  const lip = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.16, 0.04, 2, 0.018), dark);
  lip.position.set(0, -0.07, 0.25);
  const buckle = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.06, 0.03, 1, 0.01), gold);
  buckle.position.set(0, -0.12, 0.27);
  flapPivot.add(flap, lip, buckle);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 6, 20, Math.PI), dark);
  strap.position.set(0, 0.32, 0);
  g.add(body, flapPivot, strap);
  g.userData.flap = flapPivot;
  return g;
}

// a plump five-pointed star, a little thick, softly bevelled
function starGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 0.48 : 1;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 });
  g.center();
  return g;
}

// --------------------------------------------------------------- the player
// Plays the ending; resolves when it is over (the end or 건너뛰기). `stats`
// (endingTimeline.js endingStats: from the save) and `wear` (the Maltese's
// cosmetics) are read once, at the start.
export function playEndingCutscene(G, story, { stats, wear }) {
  for (const id of ['intro-stats', 'intro-credits']) { const e = document.getElementById(id); e.innerHTML = ''; delete e.dataset.filled; }
  return playCutscene(G, story, {
    hook: 'outro',
    timeline: ENDING_TIMELINE,
    models: ENDING_MODELS,
    className: 'ending',
    build: (renderer, keep, opts) => buildSet(renderer, keep, opts, { stats, wear }),
    pose,
    fade: fadeAt,
    walking: (t) => (t > 4 && t < 5.1) || (t > WALK_FROM + 0.2 && t < 33),
    frame: overlays,
    where: (S) => ({ stats: S.stats, pieces: S.pieces, glow: +S.glowMat.opacity.toFixed(2), risen: S.stars.filter((s) => s.visible && s.position.y > 6).length, sparkling: S.shards.filter((s) => s.visible).length, tod: +S.tod.toFixed(2), bagDown: S.bag.visible, toolsDown: S.tools.visible }),
  });
}

// black over the picture: in from black, the cut to the dark tunnel, out at the end
function fadeAt(t) {
  const start = 1 - ramp(t, 0, 0.6);
  const tease = ramp(t, 43.9, 44.45) * (1 - ramp(t, 44.6, 45.4));
  const last = ramp(t, ENDING_LENGTH - ENDING_FADE_OUT, ENDING_LENGTH - 0.1);
  return Math.max(start, tease, last);
}

// the page over the picture: the white of the daylight, the numbers, the credits
function overlays(S, t, ui) {
  const white = ramp(t, 2.3, 3.9) * (1 - ramp(t, 4.15, 5.9));
  ui.white.style.opacity = white.toFixed(3);
  ui.white.classList.toggle('on', white > 0.001);
  // scene 4: what the save says, small, at the top of the picture
  const statsOn = t >= 21.6 && t < 26.9;
  if (statsOn && !ui.stats.dataset.filled) {
    const { stars, bosses, shards, time } = S.stats;
    const chip = (icon, text, id) => `<span id="${id}"><i>${icon}</i>${text}</span>`;
    ui.stats.innerHTML = [
      chip('⭐', `별 <b>${stars}</b>개`, 'outro-stars'),
      chip('👑', `대장 <b>${bosses.length}/4</b>`, 'outro-bosses'),
      chip('💎', `수정 조각 <b>${shards}</b>개`, 'outro-shards'),
      chip('⏱️', `<b>${playTimeText(time)}</b> 동안 모험했어요`, 'outro-time'),
    ].join('');
    ui.stats.title = bosses.map((id) => BOSSES[id]?.name).join(' · ');
    ui.stats.dataset.filled = '1';
  }
  ui.stats.classList.toggle('on', statsOn);
  // scene 6: the credits roll up through the picture
  const roll = t >= 33.5 && t < 44.5;
  if (roll && !ui.credits.dataset.filled) {
    ui.credits.innerHTML = `<div class="roll"><h2>${CREDITS_TITLE}</h2>${CREDITS.map(([k, v]) => `<div class="row"><small>${k}</small><b>${v}</b></div>`).join('')}<p class="thanks">${CREDITS_THANKS}</p></div>`;
    ui.credits.dataset.filled = '1';
  }
  ui.credits.classList.toggle('on', roll);
  if (roll) {
    const inner = ui.credits.firstElementChild, h = ui.credits.clientHeight, ih = inner.offsetHeight;
    const k = Math.min(1, Math.max(0, (t - 33.7) / (44.1 - 33.7)));
    inner.style.transform = `translateY(${(h - (h + ih) * k).toFixed(1)}px)`;
    ui.credits.style.opacity = String(Math.min(ramp(t, 33.5, 34.2), 1 - ramp(t, 43.6, 44.3)));
  }
}

// --------------------------------------------------------------- the poses
const D = new THREE.Vector3(), F = new THREE.Vector3(), cam = new THREE.Vector3(), tgt = new THREE.Vector3(), V = new THREE.Vector3(), Q = new THREE.Quaternion();
const SUN_DIR = new THREE.Vector3(), SUN_DUSK = new THREE.Color(1, 0.62, 0.35), CORE_DUSK = new THREE.Color(1, 0.86, 0.6);
function pose(S, t, dt, camera) {
  const { dog, rig } = S;
  // ---- the time of day: afternoon in the sun, golden as the stars rise, dusk for the walk and the credits
  const tod = t < 22 ? DAY : t < 27 ? smooth(DAY, GOLDEN, ramp(t, 22.5, 26.8)) : t < 33.5 ? smooth(GOLDEN, DUSK, ramp(t, 27, 33.3)) : smooth(DUSK, LATE, ramp(t, 33.5, 44));
  const underground = t < 4 || t >= 44.4;
  if (underground !== S.under) { S.under = underground; S.tod = -1; } // (back in the sun: the rig again)
  if (Math.abs(tod - S.tod) > 0.002) { S.look.setTime(tod); S.tod = tod; }

  // ---- where the dog is, which way it faces, what it does
  let heading = FACE_OUT, action = null, speed = 0, extra = null, carrying = true, squint = 0;
  if (t < 4) {
    // running up the tunnel toward the light
    D.set(smooth(8.5, -12.5, t / 4), TUN_Y, Math.sin(t * 1.7) * 0.25);
    speed = 4.6;
  } else if (t < 27.6) {
    // out of the cave mouth, a few steps into the sun, then still
    const k = ramp(t, 4.0, 5.1);
    D.set(smooth(4.9, OUT.x, k), 0, smooth(0.15, OUT.z, k));
    speed = t < 5.0 ? 2.0 : 0;
    squint = ramp(t, 4.3, 4.6) * (1 - ramp(t, 5.75, 6.05)); // (dazzled)
    if (t >= 5.95 && t < 6.55) action = { name: 'bark', t: t - 5.95, duration: 0.6 };
    if (t >= 6.6 && t < 8.4) { action = { name: 'victory', t: t - 6.6, duration: 1.8 }; extra = 'cheer'; }
    // [call] the first thing it does in the sun (endingTimeline.js ENDING_CHOICES)
    if (t >= 8.6 && t < 11.0) {
      const first = ENDING_CHOICES.firstAction;
      if (first === 'roll') action = { name: 'roll', t: Math.min((t - 8.6) % 1.2, 0.8), duration: 0.8 }; // (twice over)
      else extra = first === 'shake' ? 'shake' : 'stretch';
    }
    // scene 3: turn round to the cave; the rumble; the glow goes out; a puzzled tilt
    if (t >= 11.5) heading = lerpAngle(FACE_OUT, FACE_CAVE, ramp(t, 11.6, 12.5));
    if (t >= 12.1 && t < 14.0) extra = 'worry';
    if (t >= 15.6) heading = lerpAngle(FACE_CAVE, FACE_OUT + 0.25, ramp(t, 15.6, 16.3)); // (round to us again)
    if (t >= 16.0 && t < 17.9) extra = 'wonder';
    // scene 4: turn back, put the tools down, then the bag; watch the stars go up
    if (t >= 18.0) heading = lerpAngle(FACE_OUT + 0.25, SET_FACE, ramp(t, 18.0, 18.5));
    if (t >= 18.6 && t < 19.4) action = { name: 'pickup', t: t - 18.6, duration: 0.8 };
    carrying = t < 19.0;
    if (t >= 19.35 && t < 20.05) action = { name: 'pickup', t: t - 19.35, duration: 0.7 };
    if (t >= 22.3 && t < 26.8) extra = 'lookUp';
    if (t >= 24.4 && t < 26.2) { action = { name: 'victory', t: t - 24.4, duration: 1.8 }; extra = 'lookUp'; }
    // scene 5 starts: a look back at the camera, then off
    if (t >= 27.0) heading = lerpAngle(SET_FACE, FACE_OUT, ramp(t, 27.0, 27.6));
  } else if (t < 44.4) {
    // off along the path into the sunset (the intro's walk, the other way)
    heading = walkAt(t, D, F);
    speed = t > WALK_FROM + 0.05 ? WALK_SPEED : 0;
    carrying = false;
    D.y = groundHeight(D.x, D.z);
  } else {
    // the tease: the dog is long gone (the set's far away, out of the shot)
    D.set(0, 0, 0);
    carrying = false;
  }
  if (t >= 27 && t < 27.6) carrying = false;
  dog.position.copy(D);
  dog.rotation.set(0, heading, 0);
  S.animate(dt, { speed, grounded: true, vy: 0, action });
  S.action = action?.name ?? null;
  // after the animator: what it does not know
  rig.hammer.visible = carrying;
  rig.gun.visible = carrying;
  if (carrying) rig.gun.rotation.set(0.6, 0, 0);
  S.worn.visible = t < 19.75;
  if (squint > 0) for (const e of rig.eyes) e.scale.y = Math.min(e.scale.y, 1 - 0.8 * squint);
  if (extra === 'cheer') {
    // (paws up in front of the big head, the hammer standing tall: the intro's cheer)
    const k = ramp(t, 6.6, 6.9) * (1 - ramp(t, 8.1, 8.4));
    rig.arms.R.rotation.set(smooth(rig.arms.R.rotation.x, -1.1, k), 0, smooth(rig.arms.R.rotation.z, 1.0, k));
    rig.arms.L.rotation.set(smooth(rig.arms.L.rotation.x, -1.3, k), 0, smooth(rig.arms.L.rotation.z, -0.55, k));
    rig.hammer.quaternion.slerp(Q.copy(rig.arms.R.quaternion).invert(), k);
    rig.gun.rotation.set(smooth(0.6, 0.8, k), 0, 0);
  }
  if (extra === 'stretch') {
    // a big stretch: up on its toes, paws (and the tools) high over the head,
    // leaning back, a yawn at the sky with its eyes shut, the tail up
    const k = ramp(t, 8.6, 9.25) * (1 - ramp(t, 10.3, 10.9)), wob = Math.sin((t - 8.6) * 5) * 0.06 * k;
    rig.arms.L.rotation.set(smooth(rig.arms.L.rotation.x, -2.75, k), 0, smooth(rig.arms.L.rotation.z, 0.32, k) + wob);
    rig.arms.R.rotation.set(smooth(rig.arms.R.rotation.x, -2.75, k), 0, smooth(rig.arms.R.rotation.z, -0.32, k) - wob);
    rig.torso.rotation.x -= 0.22 * k;
    rig.body.position.y += 0.07 * k;
    rig.legs.L.rotation.x = rig.legs.R.rotation.x = 0.12 * k;
    rig.neck.rotation.x -= 0.55 * k;
    rig.tail.rotation.x = -0.5 * k;
    rig.hammer.rotation.set(smooth(-0.7, 0.3, k), 0, 0.25);
    if (k > 0.4) for (const e of rig.eyes) e.scale.y = 0.15;
  }
  if (extra === 'shake') {
    const k = ramp(t, 8.8, 9.0) * (1 - ramp(t, 10.2, 10.5));
    rig.body.rotation.y = Math.sin(t * 34) * 0.32 * k;
    rig.head.rotation.z = Math.sin(t * 34 + 1) * 0.25 * k;
    for (const ear of rig.ears) ear.rotation.z += Math.sin(t * 34) * 0.5 * k;
    if (k > 0.5) for (const e of rig.eyes) e.scale.y = 0.15;
  }
  if (extra === 'worry') { for (const ear of rig.ears) ear.rotation.x += 0.35; rig.tail.rotation.z *= 0.3; rig.body.position.y += Math.abs(Math.sin(t * 29)) * 0.012; }
  if (extra === 'wonder') { const k = ramp(t, 16.0, 16.5) * (1 - ramp(t, 17.4, 17.9)); rig.neck.rotation.x -= 0.3 * k; rig.neck.rotation.z += 0.32 * k; }
  if (extra === 'lookUp') { const k = ramp(t, 22.3, 22.9) * (1 - ramp(t, 26.3, 26.8)); rig.neck.rotation.x -= 0.6 * k; }

  // ---- the set over time
  // the light: the tunnel's dark (scenes 1, 7) or the sun (stage's rig, setTime above)
  if (underground) {
    S.look.key.intensity = 0; S.look.rim.intensity = 0;
    S.look.hemi.intensity = t < 4 ? 0.45 : 0.16;
    S.look.hemi.color.set(t < 4 ? '#8d86b8' : '#5a5a98'); S.look.hemi.groundColor.set('#141019');
  }
  S.tunnel.visible = underground;
  S.exitLight.intensity = t < 4 ? 6 + 30 * ramp(t, 0.5, 3.8) : 0;
  S.exitHalo.material.opacity = 0.6 + 0.4 * ramp(t, 1, 3.8);
  S.tunnelLight.intensity = t < 4 ? 3 : t >= 44.4 ? 1.2 : 0;
  // the purple shard: a slow pulse, a glint now and then
  const glint = Math.max(0, Math.sin((t - 45.2) * 2.4)) ** 6;
  S.shardLight.intensity = t >= 44.4 ? 1.6 + 1.4 * Math.sin(t * 2.1) * 0.5 + 4 * glint : 0;
  S.shardGlow.material.opacity = 0.45 + 0.25 * Math.sin(t * 2.1) + 0.6 * glint;
  S.shardGlow.scale.setScalar(0.5 + 0.25 * glint + 0.05 * Math.sin(t * 2.1));
  S.shard.rotation.y = t * 0.6;
  // the cave mouth's purple: there in the sun, gone after the rumble
  const glowK = 1 - ramp(t, 13.2, 16.2);
  const flicker = t > 12.2 && t < 16.2 ? 0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 7) : 1;
  S.glowMat.opacity = 0.75 * glowK * flicker * (t < 4 ? 0 : 1);
  S.glowLight.intensity = 9 * glowK * flicker * (t < 4 ? 0 : 1);
  S.glow.visible = S.glowMat.opacity > 0.005;
  driftMotes(S.wisps, t, 0.35, 0.8 * glowK * (t > 4 && t < 18 ? 1 : 0));
  if (S.wisps.visible) S.wisps.position.set(-ramp(t, 13, 16.5) * 2.5, ramp(t, 13, 16.5) * 2.5, 0);
  // dust sifting from the cave mouth in the rumble
  const quake = ramp(t, 12.0, 12.35) * (1 - ramp(t, 13.4, 14.1));
  driftMotes(S.dust, t, 1, 0.75 * quake, true);
  if (S.dust.visible) { S.dust.position.set(0, -3 * ramp(t, 12, 14), 0); }
  // what was put down
  S.tools.visible = t >= 19.0 && t < 44.4;
  S.bag.visible = t >= 19.75 && t < 44.4;
  S.bag.userData.flap.rotation.x = -1.7 * ramp(t, 20.0, 20.4);
  // the shards: out of the bag in little arcs, then a sparkling ring round it
  for (const g of S.shards) {
    const u = g.userData, k = ramp(t, u.at, u.at + 0.6);
    g.visible = t >= u.at && t < 27.6;
    if (!g.visible) continue;
    const a = u.a + t * 0.6;
    V.copy(RING_AT).add(F.set(Math.cos(a) * u.r * k, 0.36 + (u.h + Math.sin(t * 2 + u.ph) * 0.06) * k + Math.sin(k * Math.PI) * 0.35, Math.sin(a) * u.r * k));
    g.position.copy(V);
    g.rotation.y = t * 2 + u.ph;
    const sp = g.children[1];
    const tw = Math.max(0, Math.sin(t * 5 + u.ph * 3)) ** 4;
    sp.material.opacity = 0.35 + 0.65 * tw;
    sp.scale.setScalar(0.2 + 0.35 * tw);
  }
  // the stars: up from the bag, a slow spiral, out into the sky
  for (const g of S.stars) {
    const u = g.userData, age = t - u.at;
    g.visible = age > 0 && t < 33.5;
    if (!g.visible) continue;
    const up = age * (u.big ? 1.2 : 1.4) + age * age * 0.45, r = 0.35 + age * 0.4;
    g.position.set(BAG_AT.x + Math.cos(u.a + age * 1.1) * r, BAG_AT.y + 0.7 + up, BAG_AT.z + Math.sin(u.a + age * 1.1) * r);
    g.rotation.set(0, age * 2.2 + u.ph, Math.sin(age * 3 + u.ph) * 0.2);
    const s = (u.big ? 0.36 : 0.22) * Math.min(1, age / 0.35) * (1 + 0.6 * ramp(age, 1.5, 5));
    g.scale.setScalar(Math.max(0.001, s));
  }
  // the sun: where the key light comes from, riding the sky; gone underground
  const el = THREE.MathUtils.degToRad(S.look.elevation), az = THREE.MathUtils.degToRad(AZIMUTH);
  SUN_DIR.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  const dusk = ramp(S.tod, GOLDEN, DUSK);
  S.sun.visible = S.sunCore.visible = !underground;
  S.sun.material.color.set('#fff3c8').lerp(SUN_DUSK, dusk); // (warmer as it goes down)
  S.sunCore.material.color.set('#ffffff').lerp(CORE_DUSK, dusk);
  // sunny bits
  poseFlies(S.flies, t, t >= 4 && t < 33.5, { from: 4, speed: 0.6 });
  driftMotes(S.pollen, t, 0.25, 0.55 * (t >= 4 && t < 27 ? 1 : 0) * ramp(t, 4.2, 5.2));
  driftMotes(S.fireflies, t, 0.4, (0.45 + 0.35 * Math.sin(t * 3)) * ramp(t, 29, 33) * (t < 44.4 ? 1 : 0));
  S.rays.visible = t >= 4 && t < 27;
  S.rays.children.forEach((r, i) => { r.material.opacity = (0.12 + 0.05 * Math.sin(t * 0.7 + i)) * (1 - ramp(t, 22, 26)); });

  // ---- the camera
  shot(t, D, cam, tgt);
  if (quake > 0) {
    const a = quake * 0.05;
    cam.x += Math.sin(t * 37) * a; cam.y += Math.sin(t * 43 + 1) * a * 0.7; cam.z += Math.sin(t * 29 + 2) * a;
  }
  camera.position.copy(cam);
  camera.lookAt(tgt);
  if (quake > 0) camera.rotateZ(Math.sin(t * 23) * 0.006 * quake);
  // the sun sprite rides the camera (always at the sky's distance)
  S.sun.position.copy(camera.position).addScaledVector(SUN_DIR, 110);
  S.sunCore.position.copy(S.sun.position);
  const big = 1 + 0.6 * dusk;
  S.sun.scale.setScalar(46 * big);
  S.sunCore.scale.setScalar(13 * big);
  S.sun.material.opacity = 0.75;
  S.sunCore.material.opacity = 1;
}

// where the camera is and what it looks at, at time t (dog at D)
function shot(t, D, cam, tgt) {
  if (t < 4) {
    // behind the running dog, low, the white way out ahead
    cam.set(D.x + 3.4 - t * 0.25, TUN_Y + 1.15, D.z * 0.4 + 0.7);
    tgt.set(D.x - 6, TUN_Y + 1.25, 0);
  } else if (t < 5.3) {
    // wide: the cave mouth in the hill, the little dog stepping out into the sun
    const k = ramp(t, 4.0, 5.3);
    cam.set(smooth(-14, -12.5, k), smooth(2, 1.8, k), smooth(1, 0.95, k));
    tgt.set(smooth(5, 4.4, k), smooth(4, 3.5, k), 0);
  } else if (t < 8.4) {
    // in front, low: dazzled, then "멍멍! 드디어 탈출했다!" and a cheer
    const k = ramp(t, 5.3, 8.4);
    cam.set(smooth(-2.4, -1.7, k), smooth(0.78, 0.7, k), smooth(1.55, 1.4, k));
    tgt.set(OUT.x + 0.1, smooth(0.95, 0.85, k), OUT.z);
  } else if (t < 11.5) {
    // three-quarter, from the side: the first thing in the sun (a stretch)
    cam.set(OUT.x - 1.2, 0.6, OUT.z + 2.25);
    tgt.set(OUT.x, smooth(0.62, 0.75, ramp(t, 8.6, 9.3)), OUT.z);
  } else if (t < 15.6) {
    // wide behind the dog, the cave mouth before it: the rumble, the glow going out
    const k = ramp(t, 11.5, 15.6);
    cam.set(smooth(-9, -7.4, k), smooth(1.6, 1.4, k), smooth(3.4, 2.9, k));
    tgt.set(5, smooth(3.2, 2.9, k), 0);
  } else if (t < 18) {
    // it turns round to us, puzzled, the plain cave behind it now
    const k = ramp(t, 15.6, 18);
    cam.set(smooth(-2.6, -2.2, k), smooth(0.8, 0.75, k), smooth(1.5, 1.35, k));
    tgt.set(OUT.x + 0.1, 0.9, OUT.z);
  } else if (t < 22.2) {
    // low by the things put down: the tools, the bag, the shards
    V.copy(BAG_AT).add(TOOLS_AT).multiplyScalar(0.5);
    cam.copy(V).addScaledVector(SET_FWD, 2.6).addScaledVector(SET_SIDE, 0.9).setY(0.95);
    tgt.copy(V).addScaledVector(SET_FWD, -0.1).setY(0.55);
  } else if (t < 27) {
    // back a little: the stars go up past the cave mouth, the camera after them into the sky
    const k = ramp(t, 22.2, 27), up = ramp(t, 22.7, 26.9);
    cam.set(smooth(-4.2, -5, k), smooth(1.1, 1.0, k), smooth(4.4, 5.2, k));
    tgt.set(smooth(2.7, 3, up), smooth(1.15, 12.5, up), smooth(0.1, -1.5, up));
  } else if (t < 30.6) {
    // behind it: off down the path, the low sun ahead
    cam.set(D.x + 4.4, 1.9, D.z - 0.8);
    tgt.set(D.x - 6, 0.7, D.z);
  } else if (t < 33.5) {
    // up and away: the dog small on the path, then the camera lifts to the sunset sky
    const k = ramp(t, 30.6, 33.5), look = ramp(t, 32.2, 33.5);
    cam.set(D.x + smooth(4.4, 9, k), smooth(1.9, 9, k), D.z + smooth(-0.8, 3, k));
    tgt.set(smooth(D.x - 2, -45, look), smooth(0.5, 8, look), smooth(D.z, 0, look));
  } else if (t < 44.4) {
    // the credits: high over the forest, drifting slowly toward the sunset
    const k = ramp(t, 33.5, 44.4);
    cam.set(smooth(3, -4, k), smooth(9, 15, k), smooth(3, 1, k));
    tgt.set(-45, smooth(8, 6, k), smooth(0, -6, k));
  } else {
    // the tease: low on the dark tunnel's floor, a tiny purple shard
    const k = ramp(t, 44.4, 50.5);
    cam.set(SHARD.x - smooth(2.3, 1.5, k), TUN_Y + smooth(0.55, 0.42, k), SHARD.z + smooth(1.1, 0.75, k));
    tgt.set(SHARD.x + 0.1, TUN_Y + 0.25, SHARD.z);
  }
}
