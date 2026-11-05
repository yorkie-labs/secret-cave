// The Giant Rabbit Chief's brain (GDD §3.3), pure: no three.js, so
// test/boss.test.js drives it with plain numbers.
//
// A fight is a chain of patterns; each pattern is a list of steps:
//
//   slam : crouch (red circle + ring outline) → air → land (hit) → wave (hit) → dizzy → rest
//   gust : ears (red cone) → blow (hit) → rest
//   dash : aim (red lane) → run (hit) → gap … ×3 → dizzy → rest
//
// Every step that can hurt (`hit`) comes after a step that shows where
// (`tele`), and every pattern ends in a rest. When the hp crosses a phase
// line (66 %, 33 %) the chief roars and the next phase's patterns join in,
// the newest first. A full stun gauge knocks it on its back for a while.
// hp 0: asleep (bosses sleep too, GDD §3.2).

// 1, 2 or 3 from the hp left.
export function phaseOf(hp, maxHp, lines = [0.66, 0.33]) {
  const k = hp / maxHp;
  return k > lines[0] ? 1 : k > lines[1] ? 2 : 3;
}

// The steps of one pattern in a phase (tempo shortens windups and rests).
export function stepsOf(pattern, phase, def) {
  const tempo = def.tempo[phase - 1];
  const warn = (s) => Math.max(def.minWindup, s * tempo);
  const rest = { name: 'rest', dur: def.rest[phase - 1] * tempo, open: true };
  const dizzy = { name: 'dizzy', dur: def.dizzy, open: true, dazed: true };
  if (pattern === 'slam') {
    const s = def.slam;
    return [
      { name: 'crouch', dur: warn(s.crouch), tele: ['circle', 'ring'] },
      { name: 'air', dur: s.air, tele: ['circle', 'ring'] },
      { name: 'land', dur: 0.05, hit: 'slam' },
      { name: 'wave', dur: s.wave.time, hit: 'wave' },
      dizzy, rest,
    ];
  }
  if (pattern === 'gust') {
    const s = def.gust;
    return [
      { name: 'ears', dur: warn(s.windup), tele: ['cone'] },
      { name: 'blow', dur: s.blow, hit: 'gust' },
      rest,
    ];
  }
  if (pattern === 'dash') {
    const s = def.dash;
    const steps = [];
    for (let i = 0; i < s.count; i++) {
      steps.push({ name: 'aim', dur: warn(s.aim), tele: ['lane'], n: i });
      steps.push({ name: 'run', dur: s.run, hit: 'dash', n: i });
      if (i < s.count - 1) steps.push({ name: 'gap', dur: s.gap });
    }
    return [...steps, dizzy, rest];
  }
  throw new Error(`no such pattern: ${pattern}`);
}

// The next pattern: the newest one of a phase first, then never the same one
// twice in a row (when there is a choice), picked with `rand` (0..1).
export function pickPattern(phase, history, rand, def) {
  const pool = def.patterns[phase - 1];
  const last = history.at(-1);
  if (pool.length === 1) return pool[0];
  if (!history.some((h) => h.phase === phase)) return pool[0]; // the new trick first
  const choices = pool.filter((p) => p !== last?.pattern);
  return choices[Math.floor(rand() * choices.length) % choices.length];
}

export const newBossAI = () => ({
  state: 'intro', t: 0, phase: 1, steps: [], step: null, pattern: null,
  history: [], stun: 0, roarPending: false,
});

// One step of the fight. input: { hp, maxHp, started (the intro is over),
// stun (gauge added this frame, 0..1) }. `build`: a boss's own patterns
// (M6a: the queen's, bosses/queenAI.js), the chief's by default. Returns this step's events, in
// order: { type: 'step', step, pattern } (a new step began), { type:
// 'phase', phase }, { type: 'stunned' }, { type: 'asleep' }.
export function stepBoss(ai, input, dt, def, rand, build = stepsOf) {
  ai.t += dt;
  const out = [];
  if (ai.state === 'asleep') return out;
  if (input.hp <= 0) { set(ai, 'asleep'); out.push({ type: 'asleep' }); return out; }
  if (ai.state === 'intro') {
    if (!input.started) return out;
    set(ai, 'idle');
    ai.wait = def.start;
    out.push({ type: 'step', step: { name: 'idle' } });
    return out;
  }
  // the hp crossed a phase line: a roar as soon as it is not mid-attack
  const phase = phaseOf(input.hp, input.maxHp, def.phases);
  if (phase > ai.phase) { ai.phase = phase; ai.roarPending = true; out.push({ type: 'phase', phase }); }
  // the stun gauge (it drains slowly; full = on its back)
  if (ai.state !== 'stunned') {
    ai.stun = Math.min(1, Math.max(0, ai.stun + (input.stun ?? 0) - def.stun.decay * dt));
    if (ai.stun >= 1) { set(ai, 'stunned'); ai.stun = 0; ai.steps = []; out.push({ type: 'stunned' }); return out; }
  }
  const roar = () => {
    ai.roarPending = false;
    ai.steps = [];
    set(ai, 'roar');
    out.push({ type: 'step', step: { name: 'roar' } });
    return out;
  };
  // a rest (or a daze) is cut short by the roar; an attack is not
  if (ai.roarPending && (ai.state === 'idle' || ai.step?.open)) return roar();
  const limit = ai.state === 'idle' ? ai.wait : ai.state === 'roar' ? def.roar : ai.state === 'stunned' ? def.stunned : ai.step?.dur ?? 0;
  if (ai.t < limit) return out;
  // this step is over: the next one, or a new pattern
  if (!ai.steps.length) {
    if (ai.roarPending) return roar();
    const pattern = pickPattern(ai.phase, ai.history, rand, def);
    ai.history.push({ pattern, phase: ai.phase });
    ai.pattern = pattern;
    ai.steps = build(pattern, ai.phase, def);
  }
  const step = ai.steps.shift();
  set(ai, 'pattern');
  ai.step = step;
  out.push({ type: 'step', step, pattern: ai.pattern });
  return out;
}

function set(ai, state) {
  ai.state = state;
  ai.t = 0;
  if (state !== 'pattern') ai.step = null;
}

// What the chief is doing, by name: 'intro', 'idle', 'roar', 'stunned',
// 'asleep' or the current step ('crouch', 'air', … 'dizzy', 'rest').
export const doingOf = (ai) => (ai.state === 'pattern' ? ai.step.name : ai.state);

// Is it dazed (the hammer hits twice as hard)?
export const isDazed = (ai) => ai.state === 'stunned' || !!ai.step?.dazed;
