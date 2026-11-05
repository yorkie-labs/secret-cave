import * as THREE from 'three';
import { ICICLE } from '../data/bosses.js';
import { createSpring } from '../entities/spring.js';
import { softGlowTexture } from './glow.js';
import { sfx } from '../audio/sound.js';

// W3: the Ice Lake's fixtures (region 3, worlds/main.js): the icicles that
// fall in its passes (a shadow first), the nook's resting spring (a sip an
// expedition), light glowing off the frozen falls, and, while the hero is in
// the region, snow drifting down and the hero's breath steaming. The ice
// walls are gates (world/gates.js kind `ice`), the slippery ice is the
// ground's (world/world.js SLIP), the Ice Bear and the rope lift are the
// expedition's (world/expedition.js).
export function createLake(G, def) {
  const zones = (def.icicles ?? []).map((z) => createIcicleZone(G, { x: z.at[0], z: z.at[1], r: z.r }));
  // what the bot reads (and the checks): every falling icicle's shadow
  const before = G.fieldHazards;
  G.fieldHazards = () => [...(before?.() ?? []), ...zones.flatMap((z) => z.hazards())];

  const spring = def.rest3 ? createSpring(G, { x: def.rest3[0], z: def.rest3[1], y: G.groundAt(...def.rest3) }) : null;
  if (spring) G.addLight({ pos: new THREE.Vector3(def.rest3[0], G.groundAt(...def.rest3) + 3, def.rest3[1]), color: '#9fe0ff', intensity: 7, distance: 12 });

  // the frozen falls catch a cold blue light
  for (const l of def.landmarks ?? []) if (l.model === 'iceFall') {
    const a = l.ry, y = l.y ?? G.groundAt(l.x, l.z);
    G.addLight({ pos: new THREE.Vector3(l.x + Math.sin(a) * 5, y + 6, l.z + Math.cos(a) * 5), color: "#8fd8ff", intensity: 10, distance: 22 });
  }

  // snow drifting down round the hero, and the hero's breath, in region 3 only
  const snow = addSnow(G);
  const breath = addBreath(G);
  const inLake = () => G.expedition?.area?.region === 3;
  G.onUpdate((dt) => { const on = inLake() && G.mode !== 'title'; snow.visible = on; breath.step(dt, on); });

  for (const z of zones) for (const o of z.parts) G.worldProps?.push({ obj: o, x: z.x, z: z.z });
  return { zones, spring, snow };
}

// A pass where icicles fall ({ x, z, r }): while the hero is in it, every
// `every` s a drop is aimed at where the hero stands (a little off), shown as
// a shadow growing on the floor, the icicle falling the last moment, then it
// shatters: half a heart inside its radius. Never two at once on one spot.
export function createIcicleZone(G, { x, z, r }) {
  const def = ICICLE;
  const y0 = G.groundAt(x, z);
  const drops = [];
  let wait = def.first;
  const iceMat = new THREE.MeshStandardMaterial({ color: '#e6f7ff', emissive: '#5ab4ff', emissiveIntensity: 0.6, flatShading: true, roughness: 0.15 });
  const shardGeo = new THREE.TetrahedronGeometry(1, 0);
  const zone = { x, z, r, y: y0, drops, parts: [], fired: 0, hits: 0 };
  function drop(at) {
    const shadow = shadowMark();
    shadow.position.set(at.x, at.y + 0.05, at.z);
    shadow.scale.setScalar(def.radius);
    const icicle = new THREE.Mesh(new THREE.ConeGeometry(0.32, 2.4, 6).rotateX(Math.PI), iceMat);
    icicle.visible = false;
    icicle.castShadow = true;
    G.scene.add(shadow, icicle);
    const d = { x: at.x, z: at.z, y: at.y, t: 0, shadow, icicle, done: false, bits: [] };
    drops.push(d);
    zone.fired++;
    G.emit('icicleWarn', { x: at.x, z: at.z, at: G.time, hitAt: G.time + def.warn });
  }
  function shatter(d) {
    d.shadow.visible = false; d.icicle.visible = false;
    sfx.clang?.();
    const pp = G.player.position;
    const hit = Math.hypot(pp.x - d.x, pp.z - d.z) < def.radius + 0.3 && Math.abs(pp.y - d.y) < 2.5;
    const hurt = hit && G.hurtPlayer(new THREE.Vector3(d.x, d.y, d.z), def.damage);
    if (hurt) { zone.hits++; G.toast('🧊 아야! 고드름이에요. 그림자를 보면 피해요!', 2000); }
    G.emit('icicleFall', { x: d.x, z: d.z, at: G.time, hurt: !!hurt, inside: hit });
    for (let k = 0; k < 9; k++) {
      const b = new THREE.Mesh(shardGeo, iceMat);
      b.scale.setScalar(0.08 + Math.random() * 0.1);
      b.position.set(d.x, d.y + 0.3, d.z);
      b.userData.v = new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4);
      G.scene.add(b);
      d.bits.push(b);
    }
  }
  zone.hazards = () => drops.filter((d) => d.t < def.warn).map((d) => ({ kind: 'icicle', shape: 'circle', x: d.x, z: d.z, r: def.radius, hitAt: G.time + (def.warn - d.t) }));

  G.onUpdate((dt) => {
    const pp = G.player?.position;
    const inside = pp && G.ticking() && Math.hypot(pp.x - x, pp.z - z) < r && Math.abs(pp.y - y0) < 5;
    if (inside) {
      wait -= dt;
      if (wait <= 0) {
        wait = def.every;
        // where the hero stands, a little off (never quite the same spot twice)
        const a = Math.random() * Math.PI * 2, off = Math.random() * 0.9;
        const at = { x: pp.x + Math.cos(a) * off, z: pp.z + Math.sin(a) * off };
        if (!drops.some((d) => !d.done && Math.hypot(d.x - at.x, d.z - at.z) < def.radius * 2)) drop({ ...at, y: G.groundAt(at.x, at.z, pp.y) });
      }
    } else wait = Math.max(wait, def.first);
    for (const d of drops) {
      if (d.done) continue;
      if (G.ticking() || d.t >= def.warn) d.t += dt;
      const k = Math.min(1, d.t / def.warn);
      if (d.t < def.warn) {
        d.shadow.userData.set(k);
        const left = def.warn - d.t;
        d.icicle.visible = left < def.fall;
        if (d.icicle.visible) { const u = 1 - left / def.fall; d.icicle.position.set(d.x, d.y + 1.2 + (1 - u * u) * def.height, d.z); }
      } else if (!d.shattered) { d.shattered = true; shatter(d); }
      else {
        for (const b of d.bits) { b.userData.v.y -= 12 * dt; b.position.addScaledVector(b.userData.v, dt); b.rotation.x += dt * 8; }
        if (d.t > def.warn + 0.9) { d.done = true; G.scene.remove(d.shadow, d.icicle, ...d.bits); }
      }
    }
    for (let i = drops.length - 1; i >= 0; i--) if (drops[i].done) drops.splice(i, 1);
  });
  return zone;
}

// an icicle's shadow: a dark disc growing under a red edge (scale = radius)
function shadowMark() {
  const g = new THREE.Group();
  const matOf = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const edge = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 32).rotateX(-Math.PI / 2), matOf('#ff2a2a', 0.85));
  const shade = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), matOf('#0a1626', 0.5));
  shade.position.y = 0.005;
  g.add(edge, shade);
  for (const o of [edge, shade]) o.renderOrder = 5;
  g.userData.set = (k) => { shade.scale.setScalar(Math.max(0.1, k)); shade.material.opacity = 0.3 + k * 0.45; edge.material.opacity = 0.65 + Math.sin(performance.now() / 40) * 0.25; };
  g.name = 'icicleShadow';
  return g;
}

// snowflakes drifting down in a box round the hero (one draw call)
function addSnow(G) {
  const N = 420, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 60; pos[i * 3 + 1] = Math.random() * 22; pos[i * 3 + 2] = (Math.random() - 0.5) * 60; seed[i] = Math.random() * 100; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const uniforms = { uTime: { value: 0 }, uHero: { value: new THREE.Vector3() }, uTex: { value: softGlowTexture() }, uScale: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      attribute float seed;
      uniform float uTime; uniform vec3 uHero; uniform float uScale;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime + seed;
        p.y = mod(p.y - uTime * (0.9 + fract(seed) * 0.6), 22.0) - 4.0;
        p.x += sin(t * 0.7) * 1.2; p.z += cos(t * 0.6) * 1.2;
        // wrapped round the hero
        p.x = uHero.x + mod(p.x - uHero.x + 30.0, 60.0) - 30.0;
        p.z = uHero.z + mod(p.z - uHero.z + 30.0, 60.0) - 30.0;
        p.y += uHero.y;
        vA = smoothstep(17.0, 10.0, p.y - uHero.y) * smoothstep(-4.0, -1.0, p.y - uHero.y);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uScale * (0.6 + fract(seed * 3.1) * 0.7) * 9.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uTex;
      varying float vA;
      void main() { vec4 c = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.92, 0.97, 1.0), c.a * 0.85 * vA); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'snow';
  pts.frustumCulled = false;
  pts.userData.noFade = true;
  pts.raycast = () => {};
  pts.visible = false;
  G.scene.add(pts);
  G.onUpdate(() => { uniforms.uTime.value = G.time; uniforms.uScale.value = G.renderer.getPixelRatio() * (innerHeight / 800) * 30; if (G.player) uniforms.uHero.value.copy(G.player.position); });
  return pts;
}

// the hero's breath: a little white puff from the snout every couple of seconds
function addBreath(G) {
  const mat = new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#f2fbff', transparent: true, opacity: 0, depthWrite: false });
  const puffs = [0, 1].map(() => { const s = new THREE.Sprite(mat.clone()); s.raycast = () => {}; s.userData.t = 9; G.scene.add(s); return s; });
  let wait = 0.5, n = 0;
  return {
    step(dt, on) {
      wait -= dt;
      if (on && wait <= 0) {
        wait = 1.9 + Math.random() * 0.8;
        const p = puffs[n++ % puffs.length], f = G.player.facing;
        p.userData.t = 0;
        p.userData.from = G.player.position.clone().addScaledVector(f, 0.45).setY(G.player.position.y + 0.75);
        p.userData.dir = f.clone();
      }
      for (const p of puffs) {
        p.userData.t += dt;
        const u = p.userData.t / 1.1;
        p.visible = on && u < 1;
        if (!p.visible) continue;
        p.position.copy(p.userData.from).addScaledVector(p.userData.dir, u * 0.5).setY(p.userData.from.y + u * 0.35);
        p.scale.setScalar(0.25 + u * 0.55);
        p.material.opacity = 0.55 * Math.sin(Math.min(1, u) * Math.PI);
      }
    },
  };
}
