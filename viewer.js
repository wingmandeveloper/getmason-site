import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* Scroll-driven 3D viewer for the product section.
   Drop the model at assets/mason.glb and reload; if it is missing the page keeps
   the still-image orbit. Tuning without editing code:
     ?model=<url>   load a different GLB
     ?yaw=<deg>     rotate the model about Y if it loads facing the wrong way */

const params = new URLSearchParams(location.search);
const MODEL = params.get('model') || 'assets/mason.glb';
const YAW = Number(params.get('yaw') || 0);

/* Camera path: one key per product step. az = degrees around the machine
   (0 = looking at its side), el = degrees above the ground, d = distance
   (1 = whole machine in frame), ty = look-at height as a fraction of the
   machine's height. */
const KEYS = [
  { az: 0,   el: 7,  d: 1.0,  ty: 0.45 },   // side profile
  { az: 135, el: 16, d: 0.95, ty: 0.5 },    // rear three-quarter
  { az: 225, el: 26, d: 0.92, ty: 0.55 },   // other rear quarter, from above
  { az: 330, el: 10, d: 0.5,  ty: 0.3 },    // close on the hydraulics
];

const section = document.querySelector('.product');
const canvas = document.querySelector('.stage3d');
const stage = canvas.parentElement;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const rad = THREE.MathUtils.degToRad;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.22 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

let radius = 3, height = 2, ready = false;
let current = 0, target = 0, running = false;

function fitStage() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function progress() {
  const r = section.getBoundingClientRect();
  return clamp(-r.top / (section.offsetHeight - innerHeight));
}

function frame() {
  const n = KEYS.length;
  const pos = current * (n - 1);
  const i = Math.min(Math.floor(pos), n - 2);
  const f = pos - i;
  const e = smooth(clamp((f - 0.1) / 0.8));
  const a = KEYS[i], b = KEYS[i + 1];
  const az = rad(lerp(a.az, b.az, e)), el = rad(lerp(a.el, b.el, e));
  const d = lerp(a.d, b.d, e), ty = lerp(a.ty, b.ty, e);

  const vfov = rad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const fit = (radius * 1.08) / Math.sin(Math.min(vfov, hfov) / 2) * d;
  const look = new THREE.Vector3(0, height * ty, 0);
  camera.position.set(
    look.x + fit * Math.sin(az) * Math.cos(el),
    look.y + fit * Math.sin(el),
    look.z + fit * Math.cos(az) * Math.cos(el),
  );
  camera.lookAt(look);
  renderer.render(scene, camera);
}

function tick() {
  current += (target - current) * 0.14;
  if (Math.abs(target - current) < 0.0004) current = target;
  frame();
  if (current !== target) requestAnimationFrame(tick);
  else running = false;
}

function kick() {
  if (!ready) return;
  target = progress();
  if (!running) {
    running = true;
    requestAnimationFrame(tick);
  }
}

new GLTFLoader().load(
  MODEL,
  (gltf) => {
    const model = gltf.scene;
    model.rotation.y = rad(YAW);
    const holder = new THREE.Group();
    holder.add(model);
    scene.add(holder);

    // normalise: ~4 units long, centred on the origin, sitting on the ground
    let box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(4 / Math.max(size.x, size.y, size.z));
    box = new THREE.Box3().setFromObject(holder);
    const c = box.getCenter(new THREE.Vector3());
    model.position.set(-c.x, -box.min.y, -c.z);
    box = new THREE.Box3().setFromObject(holder);
    radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    height = box.max.y - box.min.y;

    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        if (o.material) o.material.envMapIntensity = 1;
      }
    });

    sun.position.set(radius * 1.6, radius * 2.6, radius * 1.2);
    sun.target.position.set(0, 0, 0);
    const s = sun.shadow.camera;
    s.left = s.bottom = -radius * 1.5;
    s.right = s.top = radius * 1.5;
    s.near = 0.1;
    s.far = radius * 8;
    s.updateProjectionMatrix();

    ready = true;
    fitStage();
    current = target = progress();
    frame();
    section.classList.add('has-3d');
    document.dispatchEvent(new CustomEvent('mason:3d-ready'));
  },
  undefined,
  () => console.info('No 3D model found at', MODEL, '- keeping the still-image orbit.'),
);

addEventListener('scroll', kick, { passive: true });
new ResizeObserver(() => { fitStage(); if (ready) frame(); }).observe(stage);
