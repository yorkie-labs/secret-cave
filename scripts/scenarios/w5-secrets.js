// @bot
// W5 (tasks/20261102-world-redesign-todo.md): the four secret pockets, one a
// region, each behind a crystal door that looks like a mossy rock wall.
// GAME_URL='http://localhost:5191/?start=heart&seed=4' (the necklace).
// For each: walk up to the wall → the nose says "sniff here" → 1 (sniff) →
// the door shows itself (✨, its crystals lit, on the map) → walk to it with
// the golden necklace → the necklace glows, the door sinks → the first time a
// star and the secret's codex page → down the passage into the pocket → the
// old letters → the purple-lidded chest → its rare reward (a grade-up gem:
// the hammer, the water gun; legend armour in the ice pocket; the last gem).
// The second time an opened door stays open (saved), no second star.
const X = G.expedition, D = G.world.def, S = G.state;
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const until = async (test, ms = 8000, step = 40) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
G.hurtPlayer = () => false; // (looking for secrets, not fighting)
await start(); await wait(1500); await skip();
for (const r of X.spots.values()) X.sleepSpot(r.spot.id);
check('the necklace is in the bag', S.necklace);
const found = [];
G.on('secretFound', (e) => found.push(e));
let hints = 0, revealed = 0;
G.on('secretHint', () => hints++);
G.on('secretRevealed', () => revealed++);
const names = { secret1: '이끼', secret2: '버섯', secret3: '얼음', secret4: '유적' }; // (secret1: the rabbit meadow's, region 1)
for (const s of D.secrets) {
  const g = X.gates[s.gate];
  const dir = g.def.dir;
  const outside = [g.at.x - dir[0] * 9, g.at.z - dir[1] * 9];
  X.jump(outside); await wait(900); await skip();
  check(`${s.id} (${names[s.id]}): a mossy wall, no sign, not on the map`, !g.open && !g.revealed && !g.sprite, s.region);
  const h0 = hints;
  await travel(V3(g.at.x - dir[0] * 4, g.y, g.at.z - dir[1] * 4), { near: 1.2, ms: 30000 });
  check(`${s.id}: up close the nose says "sniff here"`, await until(() => hints > h0, 3000), hints);
  check(`${s.id}: …and the necklace alone does not open it`, !g.open && g.opening < 0);
  const r0 = revealed, stars0 = S.stars;
  keyTap('Digit1');
  check(`${s.id}: a sniff reveals it (✨, crystals lit)`, await until(() => g.revealed && revealed > r0, 6000) && S.world.sniffed[s.id]);
  check(`${s.id}: …and the necklace opens it`, await until(() => g.open, 9000), g.opening);
  check(`${s.id}: the first time a star and the codex page`, await until(() => found.some((f) => f.id === s.id && f.first), 4000) && S.stars === stars0 + 1 && S.seen[s.id] && S.secrets[s.id], S.stars);
  await travel(V3(s.at[0], gy(s.at[0], s.at[1]), s.at[1]), { near: 2, ms: 30000 });
  check(`${s.id}: down the passage into the pocket`, X.area?.id === s.id, X.area?.id, pos());
  await wait(600);
  await shot(`w5-secret-${s.region}-${names[s.id] === '이끼' ? 'moss' : names[s.id] === '버섯' ? 'forest' : names[s.id] === '얼음' ? 'ice' : 'ruins'}`);
  const chest = X.secretChests.find((c) => Math.hypot(c.pos.x - s.chest[0], c.pos.z - s.chest[1]) < 1);
  const before = { ...G.run.grades }, armor0 = G.run.armorGrade;
  for (let k = 0; k < 8 && !chest.opened; k++) { await clickAt(chest.pos.clone().setY(chest.pos.y + 0.4)); await wait(700); }
  await until(() => !!chest.loot, 3000); await wait(900);
  for (const p of G.pickups.filter((q) => q.alive && q.kind === 'loot' && q.pos.distanceTo(chest.pos) < 5)) { await clickAt(p.model.position.clone()); await until(() => !p.alive, 5000); }
  await wait(500);
  const got = s.loot === 'armor' ? G.run.armorGrade === 'legend' && armor0 !== 'legend' : JSON.stringify(G.run.grades) !== JSON.stringify(before);
  check(`${s.id}: the secret chest's rare reward (${s.loot}${s.target ? ` · ${s.target}` : ''})`, chest.opened && got, JSON.stringify(chest.loot), JSON.stringify(G.run.grades), G.run.armorGrade);
}
check('four secrets found, four stars', found.filter((f) => f.first).length === 4 && Object.keys(S.secrets).length === 4);
check('the HUD: the hammer and the water gun graded (border colour)', document.getElementById('skill-left').dataset.grade !== 'common' && ['rare', 'legend'].includes(document.getElementById('skill-left').dataset.grade), JSON.stringify(G.run.grades), document.getElementById('skill-left').className);
await wait(400);
await shot('w5-grade-borders');
// the map shows the doors once found
G.map.toggle(true); await wait(500);
await shot('w5-secret-map');
G.map.toggle(false);
// again: an open door stays open, no second star
const n0 = X.n, stars = S.stars;
X.jump('camp'); await wait(1200); await skip();
X.jump(D.secrets[0].at); await wait(1200);
check('an opened door stays open (saved), no second star', X.gates.secret1.open && S.stars === stars, S.stars);
check('a new expedition refills the secret chests', X.n > n0 && X.secretChests.every((c) => !c.opened));
const save = JSON.parse(localStorage.getItem(G.saveKey ?? 'secret-cave-save-v1'));
check('saved: the doors, the secrets, the sniffs', D.secrets.every((s) => save.world.gates[s.gate] && save.secrets[s.id] && save.world.sniffed[s.id]));
return log;
