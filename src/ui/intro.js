import * as THREE from 'three';
import { INTRO_MODELS } from './introModels.js';
import { instance, clipsOf } from '../world/models.js';
import { createMaltese, createMalteseAnimator, createHammer, createWaterGun } from '../entities/maltese.js';
import { softGlowTexture } from '../world/glow.js';
import { INTRO_TIMELINE, INTRO_LENGTH, FADE_OUT, ramp } from './introTimeline.js';
import { playCutscene } from './cutscene.js';
import {
  HOLE, PATH_LEN, pathAt, tangentAt, smooth, lerpAngle, noise2, createKit, buildGround, buildForest, poseFlies,
  rockTube, paint, lidColor, motes, driftMotes, canvasTex, beamTexture, seeded,
} from './cutsceneSet.js';

// The intro cutscene (GDD §2.1; tasks/20261105-intro-cutscene-todo.md): the
// prologue told in the game's own renderer with the procedural Maltese, on a
// small set built only for it: a sunny forest, glowing footprints, a cave
// mouth whose threshold gives way, a shaft, and a dark chamber below where
// eyes shine and the hammer and the water gun wait in a pool of light.
// Letterbox bars, subtitles in Jua with a soft typewriter, 건너뛰기 ▶▶ (the
// player, ui/cutscene.js). The forest and the cave mouth are the set the
// ending stands on too (ui/cutsceneSet.js).
//
// Everything on screen is a function of one clock `t` (ui/introTimeline.js
// has the schedule), so a click or Space moves on a line and skipping is
// just the end. The set is its own THREE.Scene: the cave world is not
// touched, and all of it (geometry, textures, lights' shadow maps, the
// intro-only models) is let go when it ends.

// the models the set uses (the animals and some clutter are the game's own)
export { INTRO_MODELS };

const HERO = 1.12; // (player.js HERO_SCALE)
const FLOOR = -30; // the chamber's floor, straight under the hole
const CEIL = -24; // the shaft's foot, the chamber's ceiling
const ROOM = 14; // the chamber's radius
const G_FALL = 5; // a slow cartoon fall (m/s²)
const FALL_AT = 22.5;

// how far along the path the dog is (m), by time: a speed profile summed up,
// with the scene-3 cut starting it again near the cave
function speedAt(t) {
  if (t < 7) return 1.5;
  if (t < 8) return 1.5 * (1 - ramp(t, 7, 8));
  if (t < 10.4) return 0; // sniffing the first footprint
  if (t < 13.5) return 1.7 * ramp(t, 10.4, 10.9);
  if (t < 16.6) return 2.0 * (1 - ramp(t, 16.1, 16.6));
  if (t < 19.5) return 0; // "멍? 여기는 어디지?"
  if (t < 20.7) return 1.6 * Math.sin(Math.PI * (t - 19.5) / 1.2); // two steps more, onto the threshold
  return 0;
}
const S_TABLE = (() => {
  const dt = 1 / 120, n = Math.ceil(INTRO_LENGTH / dt) + 2, s = new Float32Array(n);
  let acc = 0;
  for (let i = 1; i < n; i++) {
    const t = i * dt;
    if (Math.abs(t - 13.5) < dt / 2) acc = PATH_LEN - 7.9; // (the cut: a few steps before the cave)
    acc += speedAt(t) * dt;
    s[i] = acc;
  }
  return { s, dt };
})();
const along = (t) => {
  const { s, dt } = S_TABLE, i = Math.min(s.length - 2, Math.max(0, Math.floor(t / dt))), k = t / dt - i;
  return Math.min(PATH_LEN - 0.4, s[i] + (s[i + 1] - s[i]) * Math.max(0, Math.min(1, k)));
};

// the chamber: where the dog lands, where the tools lie
const LAND = new THREE.Vector3(0, FLOOR, 0);
const TOOLS = new THREE.Vector3(1.15, FLOOR, 0.95);
const TOOL_DIR = TOOLS.clone().sub(LAND).normalize();
const PICK_AT = TOOLS.clone().addScaledVector(TOOL_DIR, -0.6);
const FACE_CAM = Math.atan2(-3.6, 2.4); // facing the first chamber shot

// ------------------------------------------------------------------ the set
function buildSet(renderer, keep, { shadowMap } = {}) {
  const kit = createKit(renderer, keep, { shadowMap });
  const { scene, own, track, tex, look, placed, put } = kit;
  const rnd = () => kit.rnd();

  // -- the ground: a meadow round the hole (cutsceneSet.js)
  const { blotch } = buildGround(kit);

  // -- the hole's lid: wedges of the same ground that drop when it gives way
  const lid = new THREE.Group();
  const lidMat = new THREE.MeshStandardMaterial({ color: lidColor(), map: blotch, roughness: 1 });
  const lidSide = new THREE.MeshStandardMaterial({ color: '#6b5236', roughness: 1, flatShading: true });
  const wedges = [];
  for (let i = 0; i < 7; i++) {
    const a0 = (i / 7) * Math.PI * 2, a1 = ((i + 1) / 7) * Math.PI * 2, sh = new THREE.Shape();
    sh.moveTo(0, 0);
    for (let k = 0; k <= 6; k++) { const a = a0 + (a1 - a0) * (k / 6); sh.lineTo(Math.cos(a) * HOLE, Math.sin(a) * HOLE); }
    sh.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.45, bevelEnabled: false }).rotateX(Math.PI / 2);
    { const uv = g.attributes.uv; for (let n = 0; n < uv.count; n++) uv.setXY(n, uv.getX(n) / 7, uv.getY(n) / 7); } // (the ground's scale)
    const mid = (a0 + a1) / 2, w = new THREE.Mesh(g, [lidMat, lidSide]);
    w.castShadow = w.receiveShadow = true;
    w.userData = { dir: new THREE.Vector3(Math.cos(mid), 0, Math.sin(mid)), spin: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(4), delay: rnd() * 0.25 };
    lid.add(w);
    wedges.push(w);
  }
  scene.add(track(lid));
  // cracks spreading over it (drawn once, revealed from the middle out)
  const crackTex = tex(crackTexture());
  const cracks = new THREE.Mesh(new THREE.PlaneGeometry(HOLE * 3.2, HOLE * 3.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 }));
  cracks.position.y = 0.03;
  cracks.renderOrder = 2;
  scene.add(track(cracks));

  // -- the shaft and the chamber below (rock seen from inside)
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.BackSide });
  const shaft = new THREE.Mesh(rockTube(HOLE, 3.2, 0, CEIL, 28, 10, ['#6f5b45', '#2a2420'], 0.25, 3), rockMat);
  const walls = new THREE.Mesh(rockTube(ROOM, ROOM - 0.5, CEIL + 0.5, FLOOR - 0.2, 48, 6, ['#3b3346', '#2a2632'], 1.1, 5), rockMat);
  const ceilG = new THREE.RingGeometry(3.15, ROOM + 0.6, 40, 4).rotateX(Math.PI / 2);
  paint(ceilG, ['#2e2834', '#221e28'], 9, 0.4);
  const ceiling = new THREE.Mesh(ceilG, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide }));
  ceiling.position.y = CEIL;
  const floorG = new THREE.RingGeometry(0.01, ROOM + 0.4, 48, 14).rotateX(-Math.PI / 2);
  { // (a little relief, mossy near the light, dark stone at the rim)
    const p = floorG.attributes.position, c = new Float32Array(p.count * 3), moss = new THREE.Color('#6d6a52'), stone = new THREE.Color('#4a4650'), dark = new THREE.Color('#25222b'), k = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
      p.setY(i, ramp(r, 4.5, 7) * noise2(x * 3, z * 3) * 0.12 + ramp(r, 10, ROOM) * 0.9);
      k.copy(moss).lerp(stone, ramp(r, 2, 5)).lerp(dark, ramp(r, 6, ROOM)).multiplyScalar(1 + 0.08 * noise2(x * 5, z * 5));
      c.set([k.r, k.g, k.b], i * 3);
    }
    floorG.setAttribute('color', new THREE.BufferAttribute(c, 3));
    floorG.computeVertexNormals();
  }
  const floor = new THREE.Mesh(floorG, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  floor.position.y = FLOOR;
  floor.receiveShadow = true;
  const below = new THREE.Group();
  below.add(shaft, walls, ceiling, floor);
  scene.add(track(below));

  // the light from the hole: a soft beam, a warm pool, motes drifting in it
  const beamTex = tex(beamTexture());
  // (from the shaft's foot down to the floor)
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, color: '#ffe9b8', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Group();
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.PlaneGeometry(5.6, CEIL - FLOOR + 1), beamMat); b.rotation.y = (i / 4) * Math.PI; beam.add(b); }
  beam.position.set(0.3, (CEIL + FLOOR) / 2 + 0.5, 0.25);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softGlowTexture(), color: '#ffdf9a', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  pool.position.set(0.4, FLOOR + 0.03, 0.3);
  const spot = new THREE.SpotLight('#ffe7bd', 0, 22, 0.42, 0.75, 0.6);
  spot.position.set(0, CEIL - 0.3, 0);
  spot.target.position.set(0.4, FLOOR, 0.4);
  const fill = new THREE.PointLight('#8f7dff', 0, 16, 1.2); // the crystals' faint purple
  fill.position.set(5, FLOOR + 2.5, -5);
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(HOLE * 3.4, HOLE * 3.4).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: softGlowTexture(), color: '#fff6d8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sun.position.y = 0.6;
  const carry = new THREE.PointLight('#ffe4b0', 0, 6, 1.5); // (lights the falling dog from the hole's side)
  scene.add(track(beam), track(pool), track(sun), spot, spot.target, fill, carry);

  // -- the Maltese (the hammer and the water gun stay on the floor until found)
  const dog = createMaltese();
  dog.scale.setScalar(HERO);
  look.shadows(dog);
  scene.add(dog);
  dog.traverse((m) => { if (m.geometry) own.geometries.add(m.geometry); }); // (its materials are the hero's: kept)
  const animate = createMalteseAnimator(dog);
  look.follow(dog);
  const rig = dog.userData.rig;

  const floorTools = new THREE.Group();
  const hammer = createHammer(), gun = createWaterGun();
  hammer.scale.setScalar(1.25); gun.scale.setScalar(1.25);
  hammer.rotation.set(Math.PI / 2, 0, 0.9); hammer.position.set(-0.12, 0.06, 0.05);
  gun.rotation.set(0, 0.6, Math.PI / 2); gun.position.set(0.22, 0.08, -0.12);
  floorTools.add(hammer, gun);
  floorTools.position.copy(TOOLS);
  look.shadows(floorTools);
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#fff3c0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glint.scale.setScalar(1.1);
  glint.position.set(0, 0.25, 0);
  floorTools.add(glint);
  scene.add(track(floorTools));

  // -- the forest, the hill and its cave mouth, light shafts, pollen,
  // butterflies (cutsceneSet.js: the ending's set too)
  const { rays, pollen, flies, mouth } = buildForest(kit);

  // -- the glowing footprints: big round paws leading to the cave
  const printTex = tex(pawTexture());
  const printGeo = new THREE.PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2);
  const haloGeo = new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2);
  const haloMat = new THREE.MeshBasicMaterial({ map: softGlowTexture(), color: '#7f9cff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  own.materials.add(haloMat); own.geometries.add(haloGeo);
  const prints = [];
  const P = new THREE.Vector3(), T = new THREE.Vector3();
  for (let s = 11.6, i = 0; s < PATH_LEN - 1.6; s += 0.78, i++) {
    pathAt(s, P); tangentAt(s, T);
    const side = i % 2 ? 1 : -1;
    const mat = new THREE.MeshBasicMaterial({ map: printTex, color: '#b4c6ff', transparent: true, opacity: 0, depthWrite: false, fog: false });
    const m = new THREE.Mesh(printGeo, mat);
    m.position.set(P.x - T.z * side * 0.2, 0.025, P.z + T.x * side * 0.2);
    m.rotation.y = Math.atan2(T.x, T.z);
    m.renderOrder = 3;
    m.userData.s = s;
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.copy(m.position).setY(0.02);
    halo.renderOrder = 2;
    scene.add(m, halo);
    own.materials.add(mat);
    prints.push(m);
  }
  own.geometries.add(printGeo);

  // the fall's dust, the motes in the beam below, the footprints' sparks
  const dust = motes(160, (r) => { const a = r() * Math.PI * 2, d = r() * 4.2; return new THREE.Vector3(Math.cos(a) * d, r() * 2.2, Math.sin(a) * d); }, '#a88a64', 0.55, false);
  const beamMotes = motes(90, (r) => { const a = r() * Math.PI * 2, d = r() * 2.6; return new THREE.Vector3(Math.cos(a) * d, FLOOR + r() * 6, Math.sin(a) * d); }, '#fff2c6', 0.07);
  const sparks = motes(80, (r) => { const p = pathAt(11.6 + r() * (PATH_LEN - 13.4)); return new THREE.Vector3(p.x + (r() - 0.5) * 0.8, 0.1 + r() * 0.5, p.z + (r() - 0.5) * 0.8); }, '#d7e3ff', 0.07);
  scene.add(track(dust), track(beamMotes), track(sparks));

  // -- the dark below: rocks, stalactites, faint crystals, and the watchers
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rnd() * 0.3, r = 9 + rnd() * 3.5;
    put(i % 3 ? 'boulder' : 'mossBoulder', Math.cos(a) * r, Math.sin(a) * r, { s: 0.9 + rnd() * 0.9, y: FLOOR + ramp(r, 10, ROOM) * 0.9 - 0.15 });
  }
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, r = 4 + rnd() * 9;
    const o = put('stalactites', Math.cos(a) * r, Math.sin(a) * r, { s: 1.1 + rnd() * 1.0 });
    const box = new THREE.Box3().setFromObject(o);
    o.position.y += CEIL + 0.15 - box.max.y; // (hanging from the ceiling by its top)
  }
  const crystals = [];
  for (const [a, r, s] of [[0.4, 11.5, 1.6], [2.4, 12, 1.3], [3.9, 11, 1.8], [5.3, 12.2, 1.4], [1.3, 12.6, 1.1]]) crystals.push(put('crystalCluster', Math.cos(a) * r, Math.sin(a) * r, { s, y: FLOOR + 0.3 }));
  put('mushrooms', -3.4, -2.8, { s: 1.6, y: FLOOR });
  put('fern', 4.8, -4.6, { s: 1.4, y: FLOOR });

  const watchers = [];
  const shadowMat = new THREE.MeshStandardMaterial({ color: '#1b2036', roughness: 1, emissive: '#06070d' });
  own.materials.add(shadowMat);
  const eyeTex = softGlowTexture();
  // [kind, angle (rad, about the landing spot), radius, when the eyes open]
  const WATCH = [
    ['wolf', 2.35, 8.4, 30.5], ['rabbit', 1.75, 7.6, 31.0], ['fox', 2.85, 8.0, 31.5], ['deer', 1.3, 9.8, 32.0],
    ['rabbit', 3.25, 8.8, 32.4], ['eyes', 2.05, 10.6, 31.2], ['eyes', 2.6, 11.0, 32.7], ['eyes', 1.55, 10.4, 33.0],
    ['eyes', 3.0, 10.8, 31.8], ['eyes', 2.2, 12.2, 32.3],
  ];
  const SCALE = { wolf: 1.25, rabbit: 2.4, fox: 1.7, deer: 1.05 };
  // where the eyes sit from the head bone: forward, up, apart (per kind, by look)
  const EYE = { wolf: [0.2, 0.06, 0.08, 0.4], rabbit: [0.13, 0.04, 0.065, 0.34], fox: [0.17, 0.05, 0.065, 0.36], deer: [0.17, 0.05, 0.085, 0.4], eyes: [0, 0, 0.11, 0.42] };
  WATCH.forEach(([kind, a, r, at], i) => {
    const pos = new THREE.Vector3(Math.sin(a) * r, FLOOR, Math.cos(a) * r);
    const w = { kind, at, pos, head: null, mixer: null, blink: 1.3 + i * 0.7 };
    if (kind !== 'eyes') {
      const body = instance(kind);
      body.scale.setScalar(SCALE[kind]);
      body.position.copy(pos);
      body.rotation.y = Math.atan2(LAND.x - pos.x, LAND.z - pos.z);
      body.traverse((o) => { if (o.isMesh) { o.material = shadowMat; o.castShadow = false; } });
      scene.add(body);
      placed.push({ key: kind, o: body });
      w.body = body;
      w.head = body.getObjectByName('Head');
      const clip = clipsOf(kind).Idle;
      if (clip) { w.mixer = new THREE.AnimationMixer(body); const act = w.mixer.clipAction(clip); act.time = i * 0.37; act.play(); }
    } else pos.y = FLOOR + 0.6 + (i % 3) * 0.25;
    w.eyes = [-1, 1].map((side) => {
      const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeTex, color: '#ffe066', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      const size = EYE[kind][3];
      e.scale.set(size, size, 1);
      e.userData.side = side;
      own.materials.add(e.material);
      scene.add(e);
      return e;
    });
    watchers.push(w);
  });

  return {
    scene, look, own, keep, placed, sun, carry, dog, animate, rig, lid, wedges, cracks, beam, pool, spot, fill, floorTools, glint,
    prints, haloMat, sparks, rays, pollen, dust, beamMotes, flies, watchers, EYE, crystals, mouth,
  };
}

// ---- canvas textures (drawn once; disposed with the set)
function crackTexture() {
  return canvasTex(512, 512, (c, w) => {
    const r = seeded(5);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const branch = (x, y, a, len, width) => {
      if (len < 8 || width < 0.8) return;
      c.strokeStyle = 'rgba(46,30,18,0.95)'; c.lineWidth = width;
      c.beginPath(); c.moveTo(x, y);
      let px = x, py = y;
      for (let s = 0; s < len; s += 10) { a += (r() - 0.5) * 0.6; px += Math.cos(a) * 10; py += Math.sin(a) * 10; c.lineTo(px, py); }
      c.stroke();
      if (r() < 0.8) branch(px, py, a + (r() - 0.5) * 1.6, len * 0.6, width * 0.65);
      if (r() < 0.5) branch(x + (px - x) * 0.5, y + (py - y) * 0.5, a + (r() < 0.5 ? 1 : -1) * (0.7 + r()), len * 0.45, width * 0.55);
    };
    for (let i = 0; i < 9; i++) branch(w / 2, w / 2, (i / 9) * Math.PI * 2 + r() * 0.4, 150 + r() * 70, 7);
    c.fillStyle = 'rgba(46,30,18,0.9)'; c.beginPath(); c.arc(w / 2, w / 2, 9, 0, Math.PI * 2); c.fill();
  });
}
function pawTexture() {
  return canvasTex(128, 128, (c) => {
    c.fillStyle = '#fff';
    c.shadowColor = '#fff'; c.shadowBlur = 10;
    c.beginPath(); c.ellipse(64, 78, 25, 21, 0, 0, Math.PI * 2); c.fill();
    for (const [x, y, rx, ry] of [[33, 46, 10, 13], [52, 32, 10, 13], [76, 32, 10, 13], [95, 46, 10, 13]]) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); }
  });
}

// --------------------------------------------------------------- the player
// Plays the cutscene; resolves when it is over (the end or 건너뛰기). The
// main loop hands its frames to `story.view` while it plays (main.js).
export function playIntroCutscene(G, story) {
  return playCutscene(G, story, {
    hook: 'intro',
    timeline: INTRO_TIMELINE,
    models: INTRO_MODELS,
    build: buildSet,
    pose,
    fade: fadeAt,
    walking: (t) => speedAt(t) > 0.6 && t < FALL_AT, // (footsteps on the surface)
  });
}

// black over the picture: in from black, the fall's blackout, out at the end
function fadeAt(t) {
  const start = 1 - ramp(t, 0, 0.9);
  const fall = ramp(t, 25.4, 26.0) * (1 - ramp(t, 26.6, 27.6));
  const last = ramp(t, INTRO_LENGTH - FADE_OUT, INTRO_LENGTH - 0.1);
  return Math.max(start, fall, last);
}

// --------------------------------------------------------------- the poses
const Q = new THREE.Quaternion(), HIGH = new THREE.Vector3(), LOOK = new THREE.Vector3();
const D = new THREE.Vector3(), F = new THREE.Vector3(), cam = new THREE.Vector3(), tgt = new THREE.Vector3(), q = new THREE.Vector3();
function pose(S, t, dt, camera) {
  const { dog, rig } = S;
  // ---- where the dog is, which way it faces, what it does
  let heading, action = null, speed = 0, grounded = true, vy = 0, tools = false, extra = null;
  if (t < FALL_AT) {
    const s = along(t);
    pathAt(s, D); tangentAt(s, F);
    heading = Math.atan2(F.x, F.z);
    speed = speedAt(t);
    if (t >= 8.05 && t < 10.35) action = { name: 'sniff', t: t - 8.05, duration: 2.3 };
    if (t >= 16.75 && t < 19.4) extra = 'wonder';
    if (t >= 17.0 && t < 17.6) action = { name: 'bark', t: t - 17.0, duration: 0.6 };
    if (t >= 20.6) { extra = 'quake'; heading += Math.sin((t - 20.6) * 5) * 0.5 * ramp(t, 20.6, 21); }
    if (t >= 21.7 && t < 22.2) action = { name: 'hurt', t: t - 21.7, duration: 0.5 };
    // the lid drops: the dog with it
    const ft = t - (FALL_AT - 0.05);
    if (ft > 0) { D.y -= 0.5 * G_FALL * ft * ft; grounded = false; vy = -1; }
  } else {
    const ft = t - (FALL_AT - 0.05);
    pathAt(along(FALL_AT - 0.1), D);
    D.multiplyScalar(1 - ramp(t, FALL_AT, FALL_AT + 1.2)).setY(Math.max(FLOOR, -0.5 * G_FALL * ft * ft));
    heading = FACE_CAM;
    grounded = D.y <= FLOOR + 0.01;
    vy = grounded ? 0 : -1;
    if (t >= 26.5 && t < 27.5) action = { name: 'faint', t: 1.2 * (1 - ramp(t, 26.9, 27.5)), duration: 1.2 }; // up again
    if (t >= 27.6 && t < 28.2) action = { name: 'bark', t: t - 27.6, duration: 0.6 };
    if (t >= 28.6 && t < 29.2) action = { name: 'bark', t: t - 28.6, duration: 0.6 };
    if (t >= 29.3 && t < 34.3) { heading = FACE_CAM + Math.sin((t - 29.3) * 1.25) * 0.9 * ramp(t, 29.3, 30) * (1 - ramp(t, 33.6, 34.3)); extra = 'worry'; }
    // the tools: walk to them, pick them up, turn, cheer
    if (t >= 34.3) {
      const k = ramp(t, 34.6, 35.6);
      D.lerpVectors(LAND, PICK_AT, k).setY(FLOOR);
      const toTools = Math.atan2(TOOL_DIR.x, TOOL_DIR.z);
      heading = lerpAngle(FACE_CAM, toTools, ramp(t, 34.3, 34.7));
      speed = k > 0 && k < 1 ? 1.8 : 0;
      if (t >= 35.65 && t < 36.55) action = { name: 'pickup', t: t - 35.65, duration: 0.9 };
      tools = t >= 36.1;
      if (t >= 36.9) heading = lerpAngle(toTools, HERO_FACE, ramp(t, 36.9, 37.5));
      if (t >= 37.7 && t < 40.7) { action = { name: 'victory', t: t - 37.7, duration: 3 }; extra = 'cheer'; }
      if (t >= 40.8 && t < 41.4) action = { name: 'bark', t: t - 40.8, duration: 0.6 };
    }
  }
  dog.position.copy(D);
  dog.rotation.set(0, heading, 0);
  if (!grounded && t > FALL_AT) dog.rotation.x = Math.sin((t - FALL_AT) * 2.2) * 0.5; // tumbling a little
  S.animate(dt, { speed, grounded, vy, action });
  S.action = action?.name ?? null;
  // after the animator: what it does not know (no hammer yet, a puzzled tilt)
  rig.hammer.visible = tools;
  if (tools) { rig.gun.visible = true; rig.gun.rotation.set(0.6, 0, 0); }
  if (extra === 'wonder') { const k = ramp(t, 16.75, 17.2) * (1 - ramp(t, 19.0, 19.4)); rig.neck.rotation.x -= 0.45 * k; rig.neck.rotation.z += 0.32 * k; rig.head.rotation.z += 0.12 * Math.sin(t * 3) * k; }
  if (extra === 'quake') { for (const ear of rig.ears) ear.rotation.x = 0.5; rig.body.position.y += Math.abs(Math.sin(t * 31)) * 0.02; }
  if (extra === 'cheer') {
    // (the game's victory raises the paws behind the big head: from the
    // front they vanish. Here the hammer comes up in front, standing tall,
    // the water gun pointing ahead)
    const k = ramp(t, 37.7, 38.05) * (1 - ramp(t, 40.4, 40.7));
    rig.arms.R.rotation.set(smooth(rig.arms.R.rotation.x, -1.1, k), 0, smooth(rig.arms.R.rotation.z, 1.0, k));
    rig.arms.L.rotation.set(smooth(rig.arms.L.rotation.x, -1.3, k), 0, smooth(rig.arms.L.rotation.z, -0.55, k));
    rig.hammer.quaternion.slerp(Q.copy(rig.arms.R.quaternion).invert(), k); // (standing straight up from the paw)
    rig.gun.rotation.set(smooth(0.6, 0.8, k), 0, 0);
  }
  if (extra === 'worry') { for (const ear of rig.ears) ear.rotation.x += 0.35; rig.tail.rotation.z *= 0.3; }

  // ---- the set over time
  const quake = ramp(t, 20.0, 20.4) * (1 - ramp(t, 22.6, 23.4));
  const surfaceLight = 1 - ramp(t, 25.2, 25.9);
  S.look.key.intensity = 2.85 * surfaceLight;
  S.look.rim.intensity = 0.85 * surfaceLight;
  S.look.hemi.intensity = 0.92 * 1.05 * surfaceLight + 0.28 * (1 - surfaceLight);
  if (surfaceLight < 1) { S.look.hemi.color.set('#6e7cb8'); S.look.hemi.groundColor.set('#120f1a'); } else { S.look.hemi.color.set('#ffffff'); S.look.hemi.groundColor.set('#a89f92'); }
  const under = t >= 26.5;
  S.spot.intensity = under ? 26 * ramp(t, 26.6, 28) : 0;
  S.fill.intensity = under ? 6 * ramp(t, 28, 31) : 0;
  S.beam.visible = S.pool.visible = under;
  const falling = t > FALL_AT && t < 26.2;
  S.sun.material.opacity = falling ? 0.9 : 0;
  S.carry.intensity = falling ? 5 : 0;
  if (falling) S.carry.position.set(D.x + 0.6, D.y + 1.6, D.z + 0.4);
  S.beam.children[0].material.opacity = 0.2 * ramp(t, 26.8, 28.4);
  S.pool.material.opacity = 0.5 * ramp(t, 26.8, 28);
  S.floorTools.visible = !(t >= 36.1);
  S.glint.material.opacity = (0.35 + 0.35 * Math.sin(t * 4)) * ramp(t, 33.6, 34.4);
  S.glint.scale.setScalar(0.8 + 0.3 * Math.sin(t * 4));
  // the footprints wake up, a soft wave running toward the cave
  const wake = ramp(t, 7.2, 8.4) * (1 - ramp(t, 23, 23.5));
  for (const m of S.prints) m.material.opacity = wake * (0.6 + 0.4 * Math.max(0, Math.sin(t * 2.6 - m.userData.s * 0.55)));
  S.haloMat.opacity = wake * (0.55 + 0.15 * Math.sin(t * 2.6));
  driftMotes(S.sparks, t, 0.5, 0.9 * wake);
  // cracks spread from the middle; the lid falls apart at FALL_AT
  const crack = ramp(t, 20.3, 22.3);
  S.cracks.material.opacity = Math.min(1, crack * 2.2) * (t < FALL_AT - 0.05 ? 1 : 0);
  S.cracks.scale.setScalar(0.15 + 0.85 * crack);
  for (const wdg of S.wedges) {
    const ft = Math.max(0, t - (FALL_AT - 0.05) - wdg.userData.delay * 0.3);
    wdg.position.set(wdg.userData.dir.x * ft * 0.8, -0.5 * 9 * ft * ft, wdg.userData.dir.z * ft * 0.8);
    wdg.rotation.set(wdg.userData.spin.x * ft, wdg.userData.spin.y * ft, wdg.userData.spin.z * ft);
    wdg.visible = ft < 2.5;
    if (t < FALL_AT - 0.05 && quake > 0) wdg.position.y = Math.sin(t * 40 + wdg.userData.delay * 30) * 0.015 * quake;
  }
  // drifting points
  driftMotes(S.pollen, t, 0.25, 0.6 * (1 - ramp(t, 19, 20)) * ramp(t, 0.2, 1.5));
  driftMotes(S.dust, t, 1.0, 0.8 * ramp(t, 20.2, 20.8) * (1 - ramp(t, 23, 24)), true);
  driftMotes(S.beamMotes, t, 0.15, 0.7 * ramp(t, 27, 28.5));
  for (const r of S.rays.children) r.visible = t < 23;
  S.rays.children.forEach((r, i) => { r.material.opacity = (0.14 + 0.05 * Math.sin(t * 0.7 + i)) * (1 - ramp(t, 19, 20.5)); });
  poseFlies(S.flies, t, t < 19.5);
  // the crystals breathe; the watchers open their eyes one by one and blink
  for (const w of S.watchers) {
    w.mixer?.update(dt);
    let open = ramp(t, w.at, w.at + 0.5);
    const bt = ((t + w.blink) % 3.4);
    if (bt < 0.12) open *= 0.1;
    if (w.head) {
      w.head.getWorldPosition(q);
      w.body.getWorldDirection(tgt); // (the way it faces)
    } else { q.copy(w.pos); tgt.set(LAND.x - w.pos.x, 0, LAND.z - w.pos.z).normalize(); }
    const [fw, up, apart] = S.EYE[w.kind];
    for (const e of w.eyes) {
      e.position.set(q.x + tgt.x * fw + tgt.z * apart * e.userData.side, q.y + up, q.z + tgt.z * fw - tgt.x * apart * e.userData.side);
      e.material.opacity = open * 0.95;
      e.scale.y = e.scale.x * (bt < 0.12 ? 0.25 : 1);
    }
    if (w.body) w.body.visible = t > 26;
  }

  // ---- the camera
  shot(t, D, heading, cam, tgt);
  if (quake > 0) {
    const a = quake * 0.12;
    cam.x += Math.sin(t * 37) * a; cam.y += Math.sin(t * 43 + 1) * a * 0.7; cam.z += Math.sin(t * 29 + 2) * a;
    tgt.y += Math.sin(t * 31) * a * 0.5;
  }
  camera.position.copy(cam);
  camera.lookAt(tgt);
  if (quake > 0) camera.rotateZ(Math.sin(t * 23) * 0.012 * quake);
}

// the last shot looks at the dog from here (and the dog turns to it)
const HERO_CAM = new THREE.Vector3(-0.85, 0, 0.5).normalize();
const HERO_FACE = Math.atan2(HERO_CAM.x, HERO_CAM.z);

// where the camera is and what it looks at, at time t (dog at D, facing h)
function shot(t, D, h, cam, tgt) {
  if (t < 7) {
    // a crane down from the treetops to a side view walking along
    const k = ramp(t, 0.6, 4.6);
    const s = along(t);
    pathAt(s + 1.5, tgt).setY(0.7);
    tangentAt(s, F);
    const side = new THREE.Vector3(-F.z, 0, F.x);
    cam.set(D.x + F.x * 3.2 + side.x * 4.4, 1.35, D.z + F.z * 3.2 + side.z * 4.4);
    tgt.set(D.x + F.x * 0.6, 0.7, D.z + F.z * 0.6);
    const high = HIGH.set(D.x - 5, 9.5, D.z + 9);
    cam.lerpVectors(high, cam, k);
    LOOK.set(D.x + 14, 6.5, D.z - 4);
    tgt.lerpVectors(LOOK, tgt, k);
  } else if (t < 13.5) {
    if (t < 10.4) {
      // low by the footprints, the dog sniffing at the first one
      pathAt(14.2, cam); tangentAt(14.2, F);
      cam.set(cam.x - F.z * 1.5 + F.x * 0.4, 1.05, cam.z + F.x * 1.5 + F.z * 0.4);
      tgt.set(D.x + F.x * 0.9, 0.2, D.z + F.z * 0.9);
      cam.x += (t - 7) * 0.08;
    } else {
      // behind it, following the glowing trail
      tangentAt(along(t), F);
      cam.set(D.x - F.x * 3.4 - F.z * 1.3, 1.35, D.z - F.z * 3.4 + F.x * 1.3);
      pathAt(along(t) + 4, tgt).setY(0.3);
    }
  } else if (t < 19.5) {
    if (t < 16.7) {
      // the cave mouth, huge, from low behind the dog: pushing in
      const k = ramp(t, 13.5, 16.7);
      cam.set(smooth(-15.5, -11, k), smooth(1.25, 1.4, k), smooth(3.6, 2.6, k));
      tgt.set(5, smooth(4.1, 3.6, k), 0);
    } else {
      // three-quarter on its face, the cave above: "멍? 여기는 어디지?"
      cam.set(D.x + 2.0, 0.5, D.z + 1.9);
      tgt.set(D.x + 0.1, 0.8, D.z - 0.15);
    }
  } else if (t < 23.2) {
    // the shaking threshold, then looking down after it into the hole
    const k = ramp(t, 22.4, 23.1);
    cam.set(smooth(-5.6, -2.4, k), smooth(3.4, 6.2, k), smooth(4.6, 2.2, k));
    tgt.set(smooth(0.6, 0, k), smooth(0.6, Math.max(-5, D.y), k), 0);
  } else if (t < 26.5) {
    // under the dog, looking up: it tumbles down toward us, the sunlight shrinks
    cam.set(0.7, Math.max(FLOOR + 1, D.y - 4.2), 0.5);
    tgt.set(0, D.y + 2, 0);
  } else if (t < 34.1) {
    if (t < 30.0) {
      // in the pool of light
      const a = (t - 26.5) * 0.05;
      cam.set(LAND.x - 3.6 * Math.cos(a) - 0.3, FLOOR + 1.5, LAND.z + 2.4 + Math.sin(a) * 0.8);
      tgt.set(LAND.x + 0.2, FLOOR + 0.55, LAND.z);
    } else {
      // pulling back: the dark all round, and the eyes in it
      const k = ramp(t, 30.0, 33.6);
      cam.set(smooth(-3.9, -7.6, k), FLOOR + smooth(1.5, 3.4, k), smooth(2.7, 6.4, k));
      tgt.set(smooth(0.2, 2.6, k), FLOOR + smooth(0.55, 0.9, k), smooth(0, -2.4, k));
    }
  } else if (t < 37.4) {
    // low by the tools: the dog comes and picks them up
    const side = new THREE.Vector3(-TOOL_DIR.z, 0, TOOL_DIR.x);
    cam.copy(TOOLS).addScaledVector(TOOL_DIR, 2.1).addScaledVector(side, -1.2).setY(FLOOR + 0.95);
    tgt.copy(PICK_AT).addScaledVector(TOOL_DIR, 0.25).setY(FLOOR + 0.4);
  } else {
    // the hero shot, low, pushing in: "좋아! 반드시 여기서 나갈 거야!"
    const k = ramp(t, 37.4, 41.5);
    cam.copy(D).addScaledVector(HERO_CAM, smooth(3.4, 2.5, k)).setY(FLOOR + 0.42);
    tgt.copy(D).setY(FLOOR + smooth(0.75, 0.82, k));
  }
}
