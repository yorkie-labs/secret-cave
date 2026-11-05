// Character gallery: look at the hero (and, later, the cave animals) up close,
// play each action.
// Open /gallery.html on the dev server.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { stage } from '../vendor/polyfork/stage.mjs';
import { createMaltese, createMalteseAnimator } from '../entities/maltese.js';
import { ACTIONS } from '../player/movement.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 200);
camera.position.set(1.6, 1.2, 2.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.55, 0);
const look = stage(renderer, scene, { time: 'day', shadowSpan: 8 });
const ground = new THREE.Mesh(new THREE.CircleGeometry(6, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e8d6a8' }));
ground.receiveShadow = true;
scene.add(ground);

const entries = [];
export function register(name, object, animate, actions = []) {
  entries.push({ name, object, animate, actions });
}

// the hero, with every action the controller can trigger (durations from player.js)
const maltese = createMaltese();
const animMaltese = createMalteseAnimator(maltese);
const malteseState = { speed: 0, grounded: true, vy: 0, action: null, shield: false };
const play = (name) => () => { malteseState.action = { name, t: 0, duration: ACTIONS[name].duration }; };
register('몰티즈', maltese, (dt) => {
  if (malteseState.action?.held) { animMaltese(0, malteseState); return; } // a pose held still (gallery.pose)
  if (malteseState.action) { malteseState.action.t += dt; if (malteseState.action.t > malteseState.action.duration + (malteseState.action.name === 'faint' ? 1 : 0)) malteseState.action = null; }
  animMaltese(dt, malteseState);
}, [
  ['서기', () => { malteseState.speed = 0; }],
  ['걷기', () => { malteseState.speed = 2.6; }],
  ['달리기', () => { malteseState.speed = 5; }],
  ['망치', play('swing')],
  ['물총', play('shoot')],
  ['덩굴 던지기', play('throw')],
  ['방패', () => { malteseState.shield = !malteseState.shield; }], // held: on until pressed again
  ['약초 먹기', play('eat')],
  ['구르기', play('roll')],
  ['피격', play('hurt')],
  ['쓰러짐', play('faint')],
  ['줍기', play('pickup')],
  ['냄새', play('sniff')],
  ['짖기', play('bark')],
  ['승리', play('victory')],
]);

const bar = document.getElementById('bar');
let current = null;
function show(entry) {
  if (current) scene.remove(current.object);
  current = entry;
  scene.add(entry.object);
  look.shadows(entry.object);
  bar.innerHTML = '';
  for (const e of entries) {
    const b = document.createElement('button');
    b.textContent = e.name; b.className = e === entry ? 'on' : '';
    b.onclick = () => show(e); bar.appendChild(b);
  }
  bar.appendChild(document.createElement('br'));
  for (const [label, fn] of entry.actions) {
    const b = document.createElement('button'); b.textContent = label; b.onclick = fn; bar.appendChild(b);
  }
  const box = new THREE.Box3().setFromObject(entry.object);
  const h = box.max.y - box.min.y;
  controls.target.set(0, h * 0.5, 0);
  camera.position.set(h * 1.5, h * 1.1, h * 2.5);
}
show(entries[Number(new URLSearchParams(location.search).get('i') ?? 0)] ?? entries[0]);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  current.animate(dt);
  controls.update();
  look.update();
  renderer.render(scene, camera);
});
// hold the hero still `t` s into an action (for screenshots), or let go (null)
const pose = (name, t = 0) => { malteseState.action = name ? { name, t, duration: ACTIONS[name].duration, held: true } : null; };
window.gallery = { entries, show, camera, controls, pose };
