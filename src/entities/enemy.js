import * as THREE from 'three';
import { ENEMIES } from '../data/enemies.js';
import { ITEMS } from '../data/items.js';
import { newAI, stepAI, speedOf, tracks, bindLeft, landed, canDodge, shieldStun, inFace, waterStun, knockDecay } from './enemyAI.js';
import { inCone, damageHp } from '../combat/hits.js';
import { dampAngle } from '../player/movement.js';
import { sfx } from '../audio/sound.js';

// What every animal shares around the pure AI (enemyAI.js): a walking body,
// chasing by A*, the ❗ when it spots the hero, the red mark on the floor
// before each attack (GDD §3.2: every attack has one), hits and pushes, and
// falling asleep: Zz, a crystal shard left behind, then it fades away. M3:
// the vine binds it (a green wrap round the body, frozen in place), water
// leaves it wet for a while (a drop over its head; the vine holds longer),
// and a bite into a raised shield clangs and bounces it back.
// M5: a hopper (`def.lane`, the rabbit) keeps its distance, paints a red lane
// instead of a cone and jump-dashes along it, then sits dazed after landing
// (💫, its opening). Every animal stays calm for its first `CALM` s of play
// in a room (a breather after the door), and `hazard()` tells what its
// telegraph covers right now (for checks and the bot in scripts/scenarios).
// The open cave map: an animal far from the hero is `dormant` (game.js steps
// `doze` instead: it only breathes), and one with a `leash` ({ x, z, r }: its
// cavern) gives up a chase that would take it further than that and walks
// home, so animals stay in their own cavern.
//
// `look`: the animal's own model and animation, { model, animate(dt, e),
// wrap? }; `model` stands on its feet at its origin and faces +Z. `wrap`:
// where the vine goes round it, { y, r, len } in model space.
// M6a: the area's difficulty (G.difficulty, GDD §8.5) scales hp and damage;
// the mask (G.mask) shrinks how far it notices the hero; and an animal with
// a trick of its own (the fox's hiding) hooks in through `look`:
// detect(e) (m it notices the hero from), onEvent(ev, e, from) after every
// AI event, onHurt(by, e) on a hit, step(dt, e) every frame.
// W3: a charger with antlers (`def.stuck`, the deer) stopped by a raised
// shield stands stuck that long (💫); a brute (`def.slam`, the bear) paints a
// red circle in front of it and slams down there; water in its face
// (`def.face`) staggers it, from behind only wets it; it is heavy (`def.heavy`
// × pushes). On ice (G.slipAt) a push slides on (knockDecay).
const SLEEP_FADE_AT = 3.5, SLEEP_FADE = 1.5;
const HERO_RADIUS = 0.3;
const SMELL = 4; // m
const CALM = 1.5; // s of play after a room appears before an animal may notice the hero

export function createEnemy(G, kind, { x, z, heading = 0 }, look) {
  const def = ENEMIES[kind];
  const { model } = look;
  const home = new THREE.Vector3(x, G.groundAt?.(x, z) ?? 0, z);
  model.position.copy(home);
  G.scene.add(model);
  G.look.shadows(model);
  const mover = G.physics.createMover({ x, y: home.y, z, radius: 0.35, height: 0.9 });

  const alert = textSprite('❗', 1.0); // over its head while it spots the hero
  const zz = textSprite('Zz', 0.8, '#d9ccff'); // asleep
  G.scene.add(alert, zz);
  const mark = def.lane ? laneMark(def.lane) : def.slam ? slamMark(def.slam.r) : biteMark(def.bite);
  G.scene.add(mark);
  const wet = textSprite('💧', 0.5); // wet from the water gun
  G.scene.add(wet);
  const dazed = textSprite('💫', 0.7); // a hopper just landed: its opening
  const whoosh = textSprite('휙!', 0.8, '#ffffff'); // it dodged a swing
  G.scene.add(dazed, whoosh);
  const wrap = vineWrap(look.wrap ?? { y: def.size[1] * 0.8, r: def.size[0] * 0.6, len: def.size[0] * 1.4 });
  model.add(wrap);

  const diff = G.difficulty ?? { hp: 1, damage: 1 };
  const e = {
    kind, def, name: def.name, model, mover, home,
    size: def.size, hp: def.hp * diff.hp, maxHp: def.hp * diff.hp, damage: def.damage * diff.damage,
    ai: newAI(), heading,
    knock: new THREE.Vector2(), // a push still sliding it back (m/s)
    gone: false, dropped: false,
    wetUntil: -Infinity, // G.time until which it is wet (data: waterGun.wet)
    get state() { return e.ai.state; },
    get bound() { return e.ai.state === 'bound'; },
    get bindLeft() { return bindLeft(e.ai); },
    get t() { return e.ai.t; },
    get pos() { return model.position; },
    calm: CALM, // s left of the breather (counts down only in play)
    dormant: false, leash: null, speed: 0, returning: false,
    mark, alertSprite: alert, zz, wrap, wetSprite: wet, dazedSprite: dazed, // (for checks)
    get landed() { return landed(e.ai, def); },
    get active() { return !e.gone && e.ai.state !== 'idle' && e.ai.state !== 'asleep'; },
    hint: () => (e.ai.state === 'asleep' ? '쿨쿨… 잠들었어요' : e.ai.state === 'bound' ? '묶였어요! 지금 망치로!'
      : landed(e.ai, def) ? '착지했어요! 지금 망치로!'
      : e.ai.state === 'stagger' && e.ai.stunFor > 0 && def.stuck ? '뿔이 박혔어요! 지금 망치로!'
      : e.ai.state === 'stagger' && e.ai.stunFor > 0 && def.face ? '휘청휘청! 지금 망치로!' : def.hint),
    get stunned() { return e.ai.state === 'stagger' && e.ai.stunFor > 0; },
  };
  let hit = false, pushed = false, flash = 0, bindFor = 0, stunFor = 0, dashHit = false, dodgeAt = -Infinity, whooshT = 0;
  // (W3: the signs over its head clear a tall animal: the deer, the bear)
  const top = Math.max(1.25, def.size[1] * 1.6);

  // the vine caught it: bound for `secs` from the next step
  e.bind = (secs) => {
    if (e.ai.state === 'asleep' || e.gone) return false;
    bindFor = secs;
    return true;
  };
  let path = null, pathTimer = 0, seeTimer = 0, sees = false, inSight = false;
  let wander = null, wanderTimer = 1 + Math.random() * 2;
  const markAt = { x: 0, z: 0, heading: 0 };
  const tmp = new THREE.Vector3();

  // a hit from the hammer, the shockwave or the water gun
  e.hurt = ({ damage = 1, from, push = 0, kind: by = 'hammer' }) => {
    if (e.ai.state === 'asleep' || e.gone) return false;
    // a hopper hopping about dodges a swing (not too often: kinder to small hands)
    if (by === 'hammer' && canDodge(e.ai, def) && G.time >= dodgeAt) {
      dodgeAt = G.time + def.dodge.cooldown;
      const pp = G.player.position;
      const away = tmp.set(model.position.x - pp.x, 0, model.position.z - pp.z);
      if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
      away.normalize();
      const side = Math.random() < 0.5 ? 1 : -1; // back and to one side
      e.knock.set(away.x + away.z * side * 0.7, away.z - away.x * side * 0.7).normalize().multiplyScalar(def.dodge.hop * KNOCK_DECAY);
      whooshT = 0.7;
      sfx.hop?.();
      G.discover?.(kind);
      G.emit('enemyDodge', { enemy: e });
      return false;
    }
    if (by === 'hammer' && landed(e.ai, def)) { stunFor = def.landing.dizzy; G.emit('enemyStunned', { enemy: e, secs: stunFor }); }
    // W3: the bear: water in its face staggers it (from behind: only wet)
    let faceHit = false;
    if (by === 'water' && def.face && from && e.ai.state !== 'idle' && e.ai.state !== 'stagger') {
      faceHit = inFace(model.position.x, model.position.z, e.heading, from.x, from.z, def.face.arc);
      const secs = waterStun(def, faceHit);
      if (secs) { stunFor = secs; G.emit('bearStagger', { enemy: e, secs }); }
    }
    e.hp = damageHp(e.hp, damage);
    hit = true;
    G.discover?.(kind);
    if (push > 0 && from) {
      // slide back `push` metres: v0 / decay = distance
      const away = tmp.set(model.position.x - from.x, 0, model.position.z - from.z);
      if (away.lengthSq() < 1e-4) away.set(Math.sin(e.heading + Math.PI), 0, Math.cos(e.heading + Math.PI));
      away.normalize();
      if (e.ai.state !== 'bound') e.knock.set(away.x, away.z).multiplyScalar(push * KNOCK_DECAY * (def.heavy ?? 1)); // the vine holds it in place
      if (by === 'water' && !def.face) pushed = true; // (the bear: only in its face, above)
    }
    if (by === 'water') e.wetUntil = G.time + ITEMS.waterGun.wet;
    look.onHurt?.(by, e);
    flash = 0.18;
    if (by !== 'water') sfx.bonk();
    G.emit('enemyHit', { enemy: e, damage, by });
    return true;
  };

  G.addHittable({
    enemy: e,
    radius: def.size[0],
    enabled: () => !e.gone && e.ai.state !== 'asleep',
    pos: () => model.position.clone().setY(model.position.y + 0.5),
    onHit: (o) => e.hurt(o),
  });

  e.reset = () => {
    mover.setEnabled(true);
    mover.teleport(home);
    model.position.copy(home);
    model.visible = true;
    setOpacity(1);
    Object.assign(e, { hp: e.maxHp, ai: newAI(), heading, gone: false, dropped: false, wetUntil: -Infinity, calm: CALM, returning: false });
    e.knock.set(0, 0);
    bindFor = 0; stunFor = 0; dodgeAt = -Infinity;
    mark.visible = alert.visible = zz.visible = wet.visible = wrap.visible = dazed.visible = whoosh.visible = false;
    path = null; wander = null;
  };

  // far away: no thinking, just the idle breath while it can be seen
  e.doze = (dt) => { if (!e.gone && model.visible && e.ai.state !== 'asleep') look.animate(dt, e, { flash: 0 }); };

  e.update = (dt) => {
    if (e.gone) return;
    const pp = G.player.position;
    const dist = Math.hypot(pp.x - model.position.x, pp.z - model.position.z);
    // too far from its cavern: give up and go home (a few calm seconds first)
    if (e.leash && (e.ai.state === 'alert' || e.ai.state === 'chase') && Math.hypot(model.position.x - e.leash.x, model.position.z - e.leash.z) > e.leash.r) {
      e.ai = newAI(); e.calm = 3; e.returning = true; path = null; homePath = null;
    }
    seeTimer -= dt;
    // in sight within `detect` m; this close, a wolf smells the hero even round a pillar
    const scale = G.mask?.scale ?? 1; // M6a: the mask
    const detect = (look.detect?.(e) ?? def.detect) * scale;
    if (seeTimer <= 0) { seeTimer = 0.2; inSight = dist <= Math.max(detect, def.detect * scale) && canSee(pp); sees = inSight || dist <= SMELL * scale; }
    e.calm = Math.max(0, e.calm - dt); // the breather: it has not noticed anyone yet
    const from = e.ai.state;
    const ev = stepAI(e.ai, { dist, sees: sees && e.calm <= 0, hp: e.hp, pushed, hit, bind: bindFor, stun: stunFor, detect }, dt, def);
    hit = pushed = false; bindFor = 0; stunFor = 0;
    if (ev) { onEvent(ev); look.onEvent?.(ev, e, from); }
    look.step?.(dt, e);
    const s = e.ai.state;

    // where to go, and which way to face
    let goal = null;
    if (s === 'chase') goal = def.keep ? keepStep(pp, dist, dt) : chaseStep(pp, dist, dt);
    else if (s === 'idle') goal = e.returning ? homeStep(dt) : wanderStep(dt);
    let speed = speedOf(s, def) * (s === 'idle' && e.returning ? 3 : 1);
    let dx = 0, dz = 0;
    if (goal) {
      const gx = goal.x - model.position.x, gz = goal.z - model.position.z, gd = Math.hypot(gx, gz);
      if (gd > 0.2) {
        dx = (gx / gd) * speed * dt; dz = (gz / gd) * speed * dt;
        e.heading = dampAngle(e.heading, Math.atan2(gx, gz), 10, dt);
      } else speed = 0;
    } else speed = 0;
    if (tracks(s) && (s !== 'chase' || (def.keep && !goal))) e.heading = dampAngle(e.heading, Math.atan2(pp.x - model.position.x, pp.z - model.position.z), 8, dt);
    if (s === 'attack' && def.lane) {
      // the jump-dash: straight down the lane it painted, touching the hero on the way hurts
      const v = def.lane.length / def.attack;
      dx += Math.sin(markAt.heading) * v * dt; dz += Math.cos(markAt.heading) * v * dt;
      if (!dashHit && dist < def.size[0] + 0.45) {
        dashHit = true;
        const blocked = G.ticking() && !!G.shield?.blocks(model.position);
        if (blocked) { G.shield.block(model.position); flash = 0.18; }
        const hurt = !blocked && G.hurtPlayer(model.position, e.damage);
        G.emit('enemyBite', { enemy: e, inside: true, hurt: !!hurt, blocked });
        // W3: the deer's antlers stick fast in the shield
        const stuck = shieldStun(def, blocked);
        if (stuck) { stunFor = stuck; e.knock.set(0, 0); G.emit('deerStuck', { enemy: e, secs: stuck }); G.discover?.(kind); }
      }
    } else if (s === 'attack' && def.bite && dist > 0.8) {
      // the lunge: along the heading the mark was drawn with
      const lunge = def.bite.lunge / def.attack;
      dx += Math.sin(markAt.heading) * lunge * dt; dz += Math.cos(markAt.heading) * lunge * dt;
    }
    if (s === 'bound' || (s === 'stagger' && def.stuck && e.ai.stunFor > 0)) e.knock.set(0, 0); // (stuck fast)
    dx += e.knock.x * dt; dz += e.knock.y * dt;
    e.knock.multiplyScalar(Math.exp(-knockDecay(KNOCK_DECAY, G.slipAt?.(model.position.x, model.position.z) ?? 0) * dt));
    if (s !== 'asleep') {
      mover.move(dx, dz, dt);
      model.position.copy(mover.feet);
    }
    model.rotation.y = e.heading;
    e.speed = speed;

    // the ❗, the mark, Zz
    alert.visible = !G.fainted && s === 'alert';
    alert.position.set(model.position.x, model.position.y + top + 0.35 + Math.sin(e.ai.t * 20) * 0.04, model.position.z);
    mark.visible = !G.fainted && (s === 'windup' || (s === 'attack' && (def.lane || e.ai.t < 0.15)));
    if (mark.visible) {
      const k = s === 'windup' ? Math.min(1, e.ai.t / def.windup) : 1;
      if (def.lane && s === 'attack') mark.userData.edge.material.opacity = 0.5 * (1 - e.ai.t / def.attack);
      mark.position.set(markAt.x, model.position.y + 0.04, markAt.z);
      mark.rotation.y = markAt.heading;
      mark.userData.fill.scale.setScalar(Math.max(0.05, k));
      mark.userData.edge.material.opacity = 0.75 + Math.sin(e.ai.t * 30) * 0.2;
    }
    // the vine: wrapped tight, it starts to blink loose in the last second
    wrap.visible = s === 'bound' && (e.bindLeft > 1 || Math.floor(e.bindLeft * 8) % 2 === 0);
    if (s === 'bound') {
      const squeeze = Math.min(1, e.ai.t / 0.15);
      wrap.scale.set(1.25 - 0.25 * squeeze, 1.25 - 0.25 * squeeze, 1);
      wrap.rotation.z = Math.sin(e.ai.t * 3) * 0.04;
    }
    dazed.visible = !G.fainted && (landed(e.ai, def) || ((def.landing || def.stuck || def.face) && s === 'stagger' && e.ai.stunFor > 0));
    if (dazed.visible) dazed.position.set(model.position.x, model.position.y + top + Math.sin(G.time * 8) * 0.06, model.position.z);
    whooshT = Math.max(0, whooshT - dt);
    whoosh.visible = whooshT > 0;
    if (whoosh.visible) { whoosh.position.set(model.position.x, model.position.y + 1.4 + (0.7 - whooshT) * 0.8, model.position.z); whoosh.material.opacity = Math.min(1, whooshT * 3); }
    wet.visible = !G.fainted && s !== 'asleep' && G.time < e.wetUntil;
    if (wet.visible) wet.position.set(model.position.x + (dazed.visible ? 0.5 : 0), model.position.y + top + 0.2 + Math.sin(G.time * 5) * 0.05, model.position.z);
    if (s === 'asleep') sleepStep(dt);
    flash = Math.max(0, flash - dt);
    look.animate(dt, e, { flash });
  };

  function onEvent(ev) {
    if (ev === 'alert') { sfx.growl?.(); G.discover?.(kind); }
    if (ev === 'windup') {
      e.heading = Math.atan2(G.player.position.x - model.position.x, G.player.position.z - model.position.z);
      Object.assign(markAt, { x: model.position.x, z: model.position.z, heading: e.heading });
      // (the bear's slam lands a little in front of it)
      if (def.slam) { markAt.x += Math.sin(e.heading) * def.slam.ahead; markAt.z += Math.cos(e.heading) * def.slam.ahead; }
      if (def.lane) sfx.hop?.(); else sfx.growl?.();
      G.emit('enemyWindup', { enemy: e, hazard: e.hazard() });
    }
    if (ev === 'bite' && def.lane) { dashHit = false; sfx.dash?.(); G.emit('enemyDash', { enemy: e }); }
    else if (ev === 'bite' && def.slam) {
      // W3: the bear's slam: everything in the circle (a raised shield facing it still holds)
      const pp = G.player.position;
      sfx.stomp?.(); G.cam?.shake(0.35);
      const inside = Math.hypot(pp.x - markAt.x, pp.z - markAt.z) < def.slam.r + HERO_RADIUS;
      const blocked = inside && G.ticking() && !!G.shield?.blocks(model.position);
      if (blocked) G.shield.block(model.position);
      const hurt = inside && !blocked && G.hurtPlayer(new THREE.Vector3(markAt.x, model.position.y, markAt.z), e.damage);
      G.emit('enemyBite', { enemy: e, inside, hurt: !!hurt, blocked, slam: true });
    } else if (ev === 'bite') {
      sfx.snap?.();
      const pp = G.player.position;
      const inside = inCone(markAt.x, markAt.z, markAt.heading, pp.x, pp.z, def.bite.reach, def.bite.arc, HERO_RADIUS);
      // a raised shield facing it: clang, no harm, and the animal bounces off
      const blocked = inside && G.ticking() && !!G.shield?.blocks(model.position);
      if (blocked) {
        G.shield.block(model.position);
        const away = tmp.set(model.position.x - pp.x, 0, model.position.z - pp.z).normalize();
        e.knock.set(away.x, away.z).multiplyScalar(ITEMS.shield.bounce * KNOCK_DECAY);
        flash = 0.18;
      }
      const hurt = inside && !blocked && G.hurtPlayer(model.position, e.damage);
      G.emit('enemyBite', { enemy: e, inside, hurt: !!hurt, blocked });
    }
    if (ev === 'bound') G.emit('enemyBound', { enemy: e, secs: e.ai.bindFor });
    // W3: a charge on the ice slides on past its lane's end
    if (ev === 'recover' && def.lane) {
      const slip = G.slipAt?.(model.position.x, model.position.z) ?? 0;
      if (slip > 0) e.knock.set(Math.sin(markAt.heading), Math.cos(markAt.heading)).multiplyScalar(def.lane.length / def.attack * 0.3 * slip);
    }
    if (ev === 'asleep') {
      mover.setEnabled(false);
      e.knock.set(0, 0);
      sfx.stun();
      G.run.asleep = (G.run.asleep ?? 0) + 1;
      G.emit('enemyAsleep', e);
    }
  }

  // What its telegraph covers right now (null: nothing coming): the shape on
  // the floor and when it strikes (G.time). Checks and the scenario bot read it.
  e.hazard = () => {
    const s = e.ai.state;
    if (s !== 'windup' && !(s === 'attack' && def.lane)) return null;
    const hitAt = s === 'windup' ? G.time + Math.max(0, def.windup - e.ai.t) : G.time;
    if (def.lane) return { kind, shape: 'lane', x: markAt.x, z: markAt.z, heading: markAt.heading, len: def.lane.length, width: def.lane.width, hitAt };
    if (def.slam) return { kind, shape: 'circle', x: markAt.x, z: markAt.z, r: def.slam.r, hitAt };
    return { kind, shape: 'cone', x: markAt.x, z: markAt.z, heading: markAt.heading, r: def.bite.reach, arc: def.bite.arc, hitAt };
  };

  // a hopper keeps its distance: back off when the hero comes close (or
  // sideways if there is a wall behind), come closer when far, else hold
  function keepStep(pp, dist, dt) {
    const k = def.keep;
    if (dist > k + 0.8) return chaseStep(pp, dist, dt);
    if (dist > k - 0.8) return null;
    const away = tmp.set(model.position.x - pp.x, 0, model.position.z - pp.z).normalize();
    const want = model.position.clone().addScaledVector(away, 2.5);
    const reach = G.nav?.lineReach(model.position, want) ?? want;
    if (reach.distanceTo(model.position) > 0.8) return reach;
    const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(e.index % 2 ? 2.5 : -2.5).add(model.position);
    return G.nav?.lineReach(model.position, side) ?? side;
  }

  function canSee(pp) {
    const reach = G.nav?.lineReach(model.position, pp);
    return !G.nav || (!!reach && Math.hypot(reach.x - pp.x, reach.z - pp.z) < 1.2);
  }

  // straight at the hero when the floor allows, else along an A* path
  function chaseStep(pp, dist, dt) {
    if (dist < def.attackRange * 0.8) return null;
    if (inSight) { path = null; return pp; }
    pathTimer -= dt;
    if (!path || pathTimer <= 0) { pathTimer = 0.5; path = G.nav?.findPath(model.position, pp, { near: def.attackRange * 0.8 })?.points ?? null; }
    while (path && path.length > 1 && Math.hypot(path[0].x - model.position.x, path[0].z - model.position.z) < 0.5) path.shift();
    return path?.[0] ?? pp;
  }

  // walking back home after a chase that went too far
  let homePath = null, homeTimer = 0;
  function homeStep(dt) {
    if (Math.hypot(home.x - model.position.x, home.z - model.position.z) < 1.5) { e.returning = false; homePath = null; return null; }
    homeTimer -= dt;
    if (!homePath || homeTimer <= 0) { homeTimer = 1; homePath = G.nav?.findPath(model.position, home, { near: 1 })?.points ?? null; }
    while (homePath && homePath.length > 1 && Math.hypot(homePath[0].x - model.position.x, homePath[0].z - model.position.z) < 0.5) homePath.shift();
    return homePath?.[0] ?? home;
  }

  // ambling about near home now and then
  function wanderStep(dt) {
    wanderTimer -= dt;
    if (wanderTimer <= 0) {
      wanderTimer = 2.5 + Math.random() * 2.5;
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 2.5;
      const p = new THREE.Vector3(home.x + Math.sin(a) * r, home.y, home.z + Math.cos(a) * r);
      wander = G.nav?.lineReach(model.position, p) ?? p;
    }
    if (wander && Math.hypot(wander.x - model.position.x, wander.z - model.position.z) < 0.3) wander = null;
    return wander;
  }

  // asleep: Zz, a shard left behind, then fade away
  function sleepStep() {
    const t = e.ai.t;
    zz.visible = t < SLEEP_FADE_AT + SLEEP_FADE;
    zz.position.set(model.position.x + 0.2, model.position.y + 0.9 + (t % 1.5) * 0.25, model.position.z);
    zz.material.opacity = Math.min(1, 1.5 - (t % 1.5)) * (t > SLEEP_FADE_AT ? Math.max(0, 1 - (t - SLEEP_FADE_AT) / SLEEP_FADE) : 1);
    if (!e.dropped && t > 0.6) {
      // the shard pops out on the far side, so the hero sees it before taking it
      e.dropped = true;
      const pp = G.player.position, away = tmp.set(model.position.x - pp.x, 0, model.position.z - pp.z);
      if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
      const at = model.position.clone().addScaledVector(away.normalize(), 1.0);
      dropShard(G, G.nav?.lineReach(model.position, at) ?? at);
    }
    if (t > SLEEP_FADE_AT) setOpacity(Math.max(0, 1 - (t - SLEEP_FADE_AT) / SLEEP_FADE));
    if (t > SLEEP_FADE_AT + SLEEP_FADE) { e.gone = true; model.visible = false; zz.visible = false; }
  }

  // every mesh gets its own material at creation, so one wolf fades alone
  model.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
  function setOpacity(k) {
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.material.transparent = k < 1;
      o.material.opacity = k;
      o.material.depthWrite = k >= 1;
    });
  }

  G.addEnemy(e);
  return e;
}

const KNOCK_DECAY = 6; // per second: a push of v0 slides v0 / 6 metres

// A crystal shard (GDD §3.2): the run's coin, picked up by walking over it.
export function dropShard(G, at) {
  const mat = new THREE.MeshStandardMaterial({ color: '#c49bff', emissive: '#9b5cff', emissiveIntensity: 1.2, flatShading: true, roughness: 0.3 });
  const model = new THREE.Group();
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), mat);
  gem.scale.y = 1.6;
  model.add(gem);
  model.name = 'shard';
  const pos = new THREE.Vector3(at.x, G.groundAt?.(at.x, at.z) ?? at.y, at.z);
  const glow = G.addLight({ pos: () => model.position, color: '#b48cff', intensity: 3, distance: 4 });
  return G.addPickup({
    model, pos, float: 0.45, radius: 0.8, name: '수정 조각', kind: 'shard',
    onCollect: () => {
      glow.on = false;
      G.run.shards++;
      sfx.shard();
      G.emit('shard', G.run.shards);
    },
    onRemove: () => { glow.on = false; },
  });
}

// The vine wrapped round a bound animal: three twisted green bands along the
// body (model space: the animal faces +Z), with leaves sticking out.
function vineWrap({ y, r, len }) {
  const g = new THREE.Group();
  g.name = 'vineWrap';
  const vine = new THREE.MeshStandardMaterial({ color: '#4fae4a', emissive: '#2d8a30', emissiveIntensity: 0.9, flatShading: true, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2f7a35', emissive: '#1d5a20', emissiveIntensity: 0.7, flatShading: true, roughness: 0.8 });
  const leaf = new THREE.MeshStandardMaterial({ color: '#8ae86f', emissive: '#4fc044', emissiveIntensity: 1.0, flatShading: true, roughness: 0.8 });
  const leafGeo = new THREE.IcosahedronGeometry(1, 0);
  [-0.5, 0, 0.5].forEach((u, i) => {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.13, 5, 16), i === 1 ? dark : vine);
    band.position.set(0, y, u * len);
    band.rotation.set(0.25 * (i - 1), 0, i * 0.7);
    band.scale.set(1, 1.05, 1);
    g.add(band);
    for (let k = 0; k < 3; k++) {
      const a = i * 1.7 + k * 2.1;
      const l = new THREE.Mesh(leafGeo, leaf);
      l.scale.set(r * 0.28, r * 0.12, r * 0.42);
      l.position.set(Math.cos(a) * r * 1.08, y + Math.sin(a) * r * 1.08, u * len);
      l.rotation.set(a, a * 0.5, 0);
      g.add(l);
    }
  });
  // a strand along the back, tying the bands together
  const strand = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.1, r * 0.1, len * 1.1, 5), vine);
  strand.rotation.x = Math.PI / 2;
  strand.position.set(0, y + r * 0.98, 0);
  g.add(strand);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.visible = false;
  return g;
}

// The red mark on the floor before a bite: the cone it will cover (edge),
// filling up from the animal as the windup runs out.
function biteMark({ reach, arc }) {
  const a = THREE.MathUtils.degToRad(arc);
  // CircleGeometry's sector starts at +X and runs counter-clockwise; laid flat
  // and centred on +Z (the animal's front)
  const sector = (r) => new THREE.CircleGeometry(r, 24, Math.PI / 2 - a / 2, a).rotateX(-Math.PI / 2).rotateY(Math.PI);
  const g = new THREE.Group();
  // drawn on the floor under the animals and the hero (it sits a hair above it)
  const matOf = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const edge = new THREE.Mesh(sector(reach), matOf('#ff2a2a', 0.8));
  const inner = new THREE.Mesh(sector(reach * 0.94), matOf('#5a0000', 0.55));
  inner.position.y = 0.005;
  const fill = new THREE.Mesh(sector(reach * 0.94), matOf('#ff4a3a', 0.85));
  fill.position.y = 0.01;
  g.add(edge, inner, fill);
  for (const m of [edge, inner, fill]) m.renderOrder = 5;
  g.userData = { edge, fill };
  g.visible = false;
  g.name = 'biteMark';
  return g;
}

// W3, the bear's telegraph: the circle in front of it where it will slam
// down, filling from the middle as the windup runs out (scale = radius).
function slamMark(r) {
  const g = new THREE.Group();
  const matOf = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const edge = new THREE.Mesh(new THREE.CircleGeometry(r, 36).rotateX(-Math.PI / 2), matOf('#ff2a2a', 0.8));
  const inner = new THREE.Mesh(new THREE.CircleGeometry(r * 0.93, 36).rotateX(-Math.PI / 2), matOf('#5a0000', 0.55));
  inner.position.y = 0.005;
  const fill = new THREE.Mesh(new THREE.CircleGeometry(r * 0.93, 36).rotateX(-Math.PI / 2), matOf('#ff4a3a', 0.85));
  fill.position.y = 0.01;
  g.add(edge, inner, fill);
  for (const m of [edge, inner, fill]) m.renderOrder = 5;
  g.userData = { edge, fill };
  g.visible = false;
  g.name = 'slamMark';
  return g;
}

// M5, a hopper's telegraph: the lane it will jump-dash down, a red strip on
// the floor from its feet forward (+Z), filling up as the windup runs out.
function laneMark({ length, width }) {
  const g = new THREE.Group();
  const strip = (w, l) => new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2).translate(0, 0, l / 2);
  const matOf = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const edge = new THREE.Mesh(strip(width, length), matOf('#ff2a2a', 0.8));
  const inner = new THREE.Mesh(strip(width * 0.84, length - 0.15), matOf('#5a0000', 0.55));
  inner.position.y = 0.005;
  const fill = new THREE.Mesh(strip(width * 0.84, length - 0.15), matOf('#ff4a3a', 0.85));
  fill.position.y = 0.01;
  // an arrow head at the far end: which way it goes
  const head = new THREE.Shape();
  head.moveTo(-width * 0.8, 0); head.lineTo(width * 0.8, 0); head.lineTo(0, width * 0.85); head.closePath();
  const tip = new THREE.Mesh(new THREE.ShapeGeometry(head).rotateX(Math.PI / 2).translate(0, 0, length), matOf('#ff2a2a', 0.8));
  g.add(edge, inner, fill, tip);
  for (const m of [edge, inner, fill, tip]) m.renderOrder = 5;
  // the fill grows along the lane (scale z), not outward like a cone
  const scaler = { setScalar: (k) => fill.scale.set(1, 1, k) };
  g.userData = { edge, fill: { scale: scaler } };
  g.visible = false;
  g.name = 'laneMark';
  return g;
}

// A word or an emoji drawn on a sprite that always faces the lens.
const spriteCache = new Map();
export function textSprite(text, size = 1, color = '#ffe14d') {
  const key = text + color;
  if (!spriteCache.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 84px Jua, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(30, 10, 40, 0.85)';
    ctx.strokeText(text, 64, 68);
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    spriteCache.set(key, tex);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteCache.get(key), transparent: true, depthTest: false, fog: false }));
  s.scale.setScalar(size);
  s.renderOrder = 7;
  s.visible = false;
  return s;
}
