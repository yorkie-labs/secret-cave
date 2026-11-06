// K1 (tasks/20261105-cozy-look-todo.md): the cave's post-processing (pmndrs
// postprocessing + N8AO), ported from wild-island's post.ts:
//   render (MSAA: 4× on a 1× screen, 2× on a denser one) → N8AO contact
//   shadows (half res, cool blue; high only) → one effect pass: bloom (only
//   what glows: crystals, glowing mushrooms, fireflies, light shafts, the
//   hero's ring; high and medium), the colour grade, a vignette.
//   (The levels: render/quality.js; tasks/20261107-perf-todo.md.)
// No tone mapping: the Polyfork models were made for plain sRGB output (ACES
// washed them out in scary-island); the grade is a gentle look instead.
// Additive glows (sprites, light shafts, pools of light) write no depth, so
// N8AO does not occlude with them, and `transparencyAware` lifts the AO
// under them (they are not darkened a second time by the contact shadow of
// what lies beneath).
import * as THREE from 'three';
import { BlendFunction, BloomEffect, Effect, EffectComposer, EffectPass, RenderPass, VignetteEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

// (the levels and how a page picks one: render/quality.js)
export { chooseQuality, QUALITY_KEY, SMALL } from './quality.js';

/** `?q=low|medium|high` in the address; anything else: high. */
export function qualityFromUrl(search) {
  const q = new URLSearchParams(search).get('q');
  return q === 'low' || q === 'medium' ? q : 'high';
}

// Cozy grade in linear light: a little more saturation, the shadows lifted
// towards a soft lavender blue (no crushed blacks in a dark cave), the
// highlights warmed a touch.
const GRADE_FRAG = /* glsl */ `
uniform float saturation;
uniform vec3 lift;
uniform vec3 warm;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = max(inputColor.rgb, 0.0);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, saturation);
  c = c * (1.0 - lift) + lift;
  c *= mix(vec3(1.0), warm, smoothstep(0.2, 0.9, l));
  outputColor = vec4(c, inputColor.a);
}
`;

/** The grade's numbers (linear light), shared with the tests. */
export const GRADE = { saturation: 1.1, lift: [0.008, 0.008, 0.02], warm: [1.04, 1.0, 0.95] };

class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', GRADE_FRAG, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ['saturation', new THREE.Uniform(GRADE.saturation)],
        ['lift', new THREE.Uniform(new THREE.Vector3(...GRADE.lift))],
        ['warm', new THREE.Uniform(new THREE.Vector3(...GRADE.warm))],
      ]),
    });
  }
}

/**
 * The composer for one renderer. `render(dt, scene, camera)` draws a frame
 * of whatever scene and lens it is given (the game's, or the intro
 * cutscene's own set: ui/intro.js), through the same buffers.
 * `configure({ msaa, ao, bloom })` switches the chain live (the quality
 * levels, render/quality.js; the ?perf=1 overlay's switches): AO and each
 * effect pass are made the first time they are wanted, only one effect
 * pass is on at a time.
 */
export function createPost(renderer, scene, camera, settings) {
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: settings.msaa ?? 4 });
  // Perf pass: only the scene is drawn multisampled. The composer's second
  // buffer takes the AO pass's full-screen composite, which needs no MSAA
  // (it was a 4× HalfFloat target resolved every frame for nothing)
  const singleOut = () => { if (composer.outputBuffer.samples) { composer.outputBuffer.samples = 0; composer.outputBuffer.dispose(); } };
  singleOut();
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  let ao = null, bloom = null, aoMode = 'Low';
  const effectPasses = {}; // 'bloom' | 'plain' (grade + vignette only)
  const makeAo = () => {
    const size = renderer.getSize(new THREE.Vector2());
    ao = new N8AOPostPass(lastScene, lastCamera, size.x, size.y);
    ao.setQualityMode('Low');
    Object.assign(ao.configuration, {
      halfRes: true,
      depthAwareUpsampling: true,
      aoRadius: 2.0,
      distanceFalloff: 1.0,
      intensity: 3.5,
      color: new THREE.Color('#252a4a'), // cool, not black: soft blue contact shadows
      gammaCorrection: false,
      transparencyAware: true, // (the glows lift the AO under them; see the top)
    });
    composer.addPass(ao, 1); // (right after the render)
  };
  const makeEffects = (withBloom) => {
    const list = [];
    if (withBloom) {
      // the bright parts are found at half resolution (the blur's mip chain
      // starts at half anyway): one full-screen HalfFloat pass less
      bloom = new BloomEffect({ luminanceThreshold: 0.95, luminanceSmoothing: 0.1, intensity: 0.5, mipmapBlur: true, radius: 0.6, levels: BLOOM_LEVELS });
      bloom.luminancePass.resolution.scale = 0.5;
      list.push(bloom);
    }
    const pass = new EffectPass(lastCamera, ...list, new GradeEffect(), new VignetteEffect({ offset: 0.3, darkness: 0.45 }));
    pass.renderToScreen = true;
    composer.addPass(pass, composer.passes.indexOf(plainPass));
    return pass;
  };
  // `plain`: the same multisampled render, straight out (no AO, no bloom, no
  // grade, no vignette): the intro cutscene's sets were lit for that (an
  // effect pass with no effects is a copy with the output colour space)
  const plainPass = new EffectPass(camera);
  plainPass.enabled = false;
  plainPass.renderToScreen = true; // (only one pass out is on at a time)
  composer.addPass(plainPass);
  let lastScene = scene, lastCamera = camera, wasPlain = false;
  function apply() {
    const s = post.settings;
    if (composer.multisampling !== s.msaa) { composer.multisampling = s.msaa; singleOut(); }
    if (s.ao && !ao) makeAo();
    const want = s.bloom ? 'bloom' : 'plain';
    effectPasses[want] ??= makeEffects(s.bloom);
    if (ao) ao.enabled = s.ao && !wasPlain;
    if (ao && ao.configuration.transparencyAware !== (s.aoGlows ?? true)) ao.configuration.transparencyAware = s.aoGlows ?? true;
    if (ao && aoMode !== (s.aoMode ?? 'Low')) { aoMode = s.aoMode ?? 'Low'; ao.setQualityMode(aoMode); }
    for (const [k, p] of Object.entries(effectPasses)) p.enabled = k === want && !wasPlain;
    plainPass.enabled = wasPlain;
    post.ao = ao; post.bloom = bloom;
    if (ao) { ao.scene = lastScene; ao.camera = lastCamera; }
    for (const p of Object.values(effectPasses)) p.mainCamera = lastCamera;
  }
  const post = {
    settings: { ...CHAIN, ...settings }, composer, ao, bloom,
    /** One frame of `s` seen by `c` (the game's by default); `plain`: no effects (see above). */
    render(dt, s = scene, c = camera, plain = false) {
      if (s !== lastScene || c !== lastCamera) {
        lastScene = s; lastCamera = c;
        renderPass.mainScene = s; renderPass.mainCamera = c;
        if (ao) { ao.scene = s; ao.camera = c; }
        for (const p of [...Object.values(effectPasses), plainPass]) p.mainCamera = c;
      }
      if (plain !== wasPlain) { wasPlain = plain; apply(); }
      composer.render(dt);
    },
    /** Live: { msaa, ao, bloom, aoGlows, aoMode } (what is left out: CHAIN's). */
    configure(next) {
      post.settings = { ...CHAIN, ...next };
      apply();
    },
    /** What each pass is called in the ?perf=1 overlay's GPU timers. */
    passName(p) { return p === renderPass ? 'scene' : p === ao ? 'ao' : 'effect'; },
    setSize: (w, h) => composer.setSize(w, h),
  };
  apply();
  return post;
}
// The chain's switches when a level says nothing of them: MSAA samples, AO
// (`aoGlows`: N8AO's transparencyAware, `aoMode` its quality), bloom.
const CHAIN = { msaa: 4, ao: true, bloom: true, aoGlows: true, aoMode: 'Low' };
const BLOOM_LEVELS = 6; // (8 by default: the last two mips of a ~1 Mpx frame are a few texels and add nothing a radius of 0.6 shows)
