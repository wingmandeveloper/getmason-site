import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* "What's inside": the parts model, pulled apart on a button, click a part to
   highlight it. The model loads only when the section is about to be seen.
   Parts are the meshes named tripo_part_N in assets/mason-parts.glb; GROUPS below
   gathers them into the named pieces shown in the list. */

const MODEL = 'assets/mason-parts.glb';

/* Each unit moves as one piece. `group` is the name shown in the list (several
   units can share one, e.g. the four wheels). `parts` are mesh numbers in the
   file (0-based, in the order the loader finds them). `offset` is how far the
   unit travels when exploded, in model units (the machine is 4 long):
   x along its length (+x = load-bed end, -x = arm end), y up, z sideways. */
const UNITS = [
  { group: 'Load bed',        parts: [2, 5, 8, 12, 14, 28, 29, 32, 37, 45, 58, 59, 60], offset: [0.35, 1.5, 0] },
  { group: 'Lidar sensor',    parts: [23],                                              offset: [0.6, 2.4, 0] },
  { group: 'Grabber arm',     parts: [1, 10, 18, 20, 25, 44, 49, 53],                   offset: [-0.4, 0.35, 0] },
  { group: 'Wheels',          parts: [4, 16, 36],                                       offset: [0, 0, -1.6] },
  { group: 'Wheels',          parts: [6, 15, 30],                                       offset: [0, 0, 1.6] },
  { group: 'Wheels',          parts: [7, 13, 31],                                       offset: [0, 0, 1.6] },
  { group: 'Wheels',          parts: [24, 19, 21, 39, 48],                              offset: [0, 0, -1.6] },
  { group: 'Chassis & drivetrain', parts: [0, 3, 9, 11, 17, 22, 26, 27, 33, 34, 35, 38, 40, 41, 42, 43, 46, 47, 50, 51, 52, 54, 55, 56, 57], offset: [0, -0.05, 0] },
];

/* What the side panel shows for each part. Fill these in: `summary` is a short
   paragraph, `specs` is a list of [label, value] rows. Leave `summary` empty to
   show "Details coming soon." and leave `specs` empty to hide the rows. */
const PART_INFO = {
  'Load bed': {
    summary: 'Carries up to 1,500 kg of material on every run.',
    specs: [['Payload', '1,500 kg (1.5 tonnes)']],
  },
  'Lidar sensor': {
    summary: 'A LiDAR sensor and a stereo camera gather the data that lets Mason drive itself.',
    specs: [['Sensing', 'LiDAR + stereo camera']],
  },
  'Grabber arm': {
    summary: 'A six-degree-of-freedom arm that picks up and places raw materials.',
    specs: [['Degrees of freedom', '6']],
  },
  'Hydraulics': {
    summary: 'Hydraulics tip the load bed to dump the load.',
    specs: [],
  },
  'Wheels': {
    summary: 'Chosen to keep moving on any terrain: mud, uneven ground and uneven slopes.',
    specs: [['Speed', 'About 30 km/h on a full load']],
  },
  'Chassis & drivetrain': {
    summary: 'Holds the battery box, plus GPS and other sensors that track all of Mason’s data.',
    specs: [['Battery life', 'Up to 8 hours on a full load'], ['Tracking', 'GPS + onboard sensors']],
  },
};

const stage = document.getElementById('inside-stage');
const canvas = document.getElementById('inside3d');
const loadingEl = document.getElementById('inside-loading');
const listEl = document.getElementById('parts-list');
const btn = document.getElementById('explode-btn');
const rad = THREE.MathUtils.degToRad;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => t * t * (3 - 2 * t);

let started = false;
new IntersectionObserver((entries, io) => {
  if (entries.some((e) => e.isIntersecting) && !started) { started = true; io.disconnect(); init(); }
}, { rootMargin: '300px' }).observe(stage);

function init() {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch (e) { stage.hidden = true; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);   // follows the camera: even light on every side
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  camera.add(sun);
  scene.add(camera, sun.target, new THREE.HemisphereLight(0xffffff, 0xffffff, 0.7));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.14 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.7;
  controls.minPolarAngle = rad(35);
  controls.maxPolarAngle = rad(92);

  let radius = 3, height = 2, pieces = [], exploded = false, amount = 0, target = 0, selected = null;
  let homeDist = 10, homeDistA = 6;   // camera distance exploded / assembled
  const homeTarget = new THREE.Vector3(), homeTargetA = new THREE.Vector3(), tmpTarget = new THREE.Vector3();
  const focusBox = new THREE.Box3(), focusSphere = new THREE.Sphere();

  new GLTFLoader().load(MODEL, (gltf) => {
    const holder = new THREE.Group();
    const model = gltf.scene;
    holder.add(model);
    scene.add(holder);

    let box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    const s = 4 / Math.max(size.x, size.y, size.z);
    model.scale.setScalar(s);
    box = new THREE.Box3().setFromObject(holder);
    const c0 = box.getCenter(new THREE.Vector3());
    model.position.set(-c0.x, -box.min.y, -c0.z);
    holder.updateMatrixWorld(true);

    // every mesh is a part
    const meshes = [];
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material = o.material.clone(); o.material.envMapIntensity = 1.1; meshes.push(o); } });

    const whole = new THREE.Box3().setFromObject(holder);
    const centre = whole.getCenter(new THREE.Vector3());
    radius = whole.getBoundingSphere(new THREE.Sphere()).radius;
    height = whole.max.y - whole.min.y;

    // any mesh not named in UNITS stays with the chassis, so nothing is left behind
    const used = new Set(UNITS.flatMap((u) => u.parts));
    const leftovers = meshes.map((_, i) => i).filter((i) => !used.has(i));
    const units = UNITS.map((u) => ({ ...u, parts: u.group.startsWith('Chassis') ? [...u.parts, ...leftovers] : u.parts }));

    pieces = units.map((u) => {
      const ms = u.parts.map((i) => meshes[i]).filter(Boolean);
      const worldOffset = new THREE.Vector3(...u.offset);
      return {
        name: u.group, meshes: ms, fade: 1,
        base: ms.map((m) => m.position.clone()),
        local: ms.map(() => worldOffset.clone().divideScalar(s)),    // parents are unrotated, uniformly scaled
      };
    });
    /* The tipping ram. The generated model has no ram (its bed is flat), so this
       one is built here from the real machine's look: a black cylinder with a
       chrome rod and eyes at both ends. Assembled, it lies under the bed along the
       machine; exploded, it tilts up the way it does when the bed tips. */
    const ramGroup = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.55, metalness: 0.35 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd6d9dd, roughness: 0.14, metalness: 1.0 });
    const part = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = true; m.receiveShadow = true; m.material.envMapIntensity = mat === chrome ? 2.2 : 0.9; ramGroup.add(m); return m; };
    part(new THREE.CylinderGeometry(0.115, 0.115, 0.78, 32), dark, 0.39);                 // barrel
    part(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 32), dark, 0.78);                   // gland ring
    part(new THREE.CylinderGeometry(0.055, 0.055, 0.78, 32), chrome, 1.17);              // rod
    const eye1 = part(new THREE.TorusGeometry(0.09, 0.035, 12, 28), dark, -0.04);          // base eye
    const eye2 = part(new THREE.TorusGeometry(0.075, 0.03, 12, 28), dark, 1.6);            // rod eye
    eye1.rotation.y = eye2.rotation.y = Math.PI / 2;
    ramGroup.scale.setScalar(0.95);
    // Turned 180° from before (rod end now points to the bed end, not out past the arm)
    // and moved right along x. The group's y axis is the ram axis.
    ramGroup.position.set(-0.15, 1.0, 0);
    ramGroup.rotation.z = -Math.PI / 2;
    scene.add(ramGroup);
    const ramMeshes = ramGroup.children.slice();
    ramMeshes.forEach((m) => { m.material = m.material.clone(); });
    pieces.splice(3, 0, {
      name: 'Hydraulics', meshes: ramMeshes, base: [], local: [], fade: 1,
      custom: { object: ramGroup, base: ramGroup.position.clone(), offset: new THREE.Vector3(0.1, 0.25, 0), rot0: -Math.PI / 2, rot1: -Math.PI / 2 + rad(34) },
    });
    window.__mason = { pieces, meshes, select, setExploded };

    buildList();
    sun.position.set(-radius * 0.5, radius * 2.4, radius * 0.8);
    sun.target.position.set(0, 0, 0);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -radius * 2.2; sc.right = sc.top = radius * 2.2;
    sc.near = 0.1; sc.far = radius * 10; sc.updateProjectionMatrix();

    fit(true);
    loadingEl.remove();
    loop();
  }, undefined, (e) => { loadingEl.textContent = 'Could not load the 3D model.'; console.error(e); });

  const names = () => [...new Set(pieces.map((p) => p.name))];

  function buildList() {
    listEl.innerHTML = '';
    names().forEach((n) => {
      const info = PART_INFO[n] || {};
      const specs = (info.specs || []).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
      const li = document.createElement('li');
      li.dataset.part = n;
      li.innerHTML = `
        <button type="button" aria-expanded="false"><span>${n}</span><b>+</b></button>
        <div class="detail">
          <p>${info.summary || 'Details coming soon.'}</p>
          ${specs ? `<dl>${specs}</dl>` : ''}
        </div>`;
      li.querySelector('button').addEventListener('click', () => select(selected === n ? null : n, true));
      listEl.appendChild(li);
    });
  }

  /* Selecting a part: its list row opens with the details, every other part fades
     out, and the camera moves in on that part. Selecting nothing brings it all back. */
  function select(name, ensureOut) {
    selected = name;
    [...listEl.children].forEach((li) => {
      const on = li.dataset.part === name;
      li.classList.toggle('is-active', on);
      const b = li.querySelector('button');
      b.setAttribute('aria-expanded', String(on));
      b.querySelector('b').textContent = on ? '\u2212' : '+';
    });
    if (name != null && ensureOut && !exploded) setExploded(true);
  }

  function setExploded(v) {
    exploded = v;
    target = v ? 1 : 0;
    btn.textContent = v ? 'Assemble' : 'Disassemble';
  }
  btn.addEventListener('click', () => { setExploded(!exploded); if (!exploded) select(null); });

  // click a part in the scene (ignore drags)
  const ray = new THREE.Raycaster();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const live = pieces.filter((p) => selected == null || p.name === selected);
    const hit = ray.intersectObjects(live.flatMap((p) => p.meshes), false)[0];
    if (!hit) { select(null); return; }
    const n = pieces.find((p) => p.meshes.includes(hit.object)).name;
    select(selected === n ? null : n, true);
  });

  function fit(first) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const vfov = rad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const dist = (radius * 1.32) / Math.sin(Math.min(vfov, hfov) / 2);   // room for the exploded spread
    homeDist = dist;
    homeDistA = (radius * 0.95) / Math.sin(Math.min(vfov, hfov) / 2);   // assembled: fill the frame
    homeTarget.set(0, height * 0.7, 0);
    homeTargetA.set(0, height * 0.38, 0);   // assembled: centred on the machine
    if (first) {
      const az = rad(48), el = rad(33);
      controls.target.copy(homeTargetA);
      camera.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(homeDistA).add(controls.target);
    } else if (selected == null) {
      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(dir, dist);
    }
    camera.updateProjectionMatrix();
    controls.update();
  }

  function loop() {
    amount += (target - amount) * 0.08;
    if (Math.abs(target - amount) < 0.0008) amount = target;
    const t = ease(amount);
    for (const p of pieces) {
      if (p.custom) {
        const c = p.custom;
        c.object.position.copy(c.base).addScaledVector(c.offset, t);
        c.object.rotation.z = c.rot0 + (c.rot1 - c.rot0) * t;
      } else p.meshes.forEach((m, k) => m.position.copy(p.base[k]).addScaledVector(p.local[k], t));
    }
    // fade the parts that are not selected
    for (const p of pieces) {
      const goal = selected == null || p.name === selected ? 1 : 0;
      p.fade += (goal - p.fade) * 0.12;
      if (Math.abs(goal - p.fade) < 0.004) p.fade = goal;
      const translucent = p.fade < 0.995;
      p.meshes.forEach((m) => {
        const mat = m.material;
        if (mat.transparent !== translucent) { mat.transparent = translucent; mat.needsUpdate = true; }
        mat.opacity = p.fade;
        mat.depthWrite = p.fade > 0.5;
        m.visible = p.fade > 0.02;
        m.castShadow = p.fade > 0.5;
      });
    }

    // camera: move in on the selected part, or back out to the whole machine
    let goalTarget = tmpTarget.copy(homeTargetA).lerp(homeTarget, t), goalDist = homeDistA + (homeDist - homeDistA) * t;   // zoom out as it comes apart
    if (selected != null) {
      focusBox.makeEmpty();
      pieces.forEach((p) => { if (p.name === selected) p.meshes.forEach((m) => focusBox.expandByObject(m)); });
      if (!focusBox.isEmpty()) {
        focusBox.getBoundingSphere(focusSphere);
        const vfov = rad(camera.fov);
        const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
        goalTarget = focusSphere.center;
        goalDist = (focusSphere.radius * 1.15) / Math.sin(Math.min(vfov, hfov) / 2);
      }
    }
    const dir = camera.position.clone().sub(controls.target);
    const curDist = dir.length();
    dir.normalize();
    controls.target.lerp(goalTarget, 0.07);
    const newDist = curDist + (goalDist - curDist) * 0.07;
    camera.position.copy(controls.target).addScaledVector(dir, newDist);

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  new ResizeObserver(() => fit(false)).observe(canvas);
}
