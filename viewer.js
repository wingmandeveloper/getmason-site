import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* Hero 3D viewer.
   If assets/mason.glb exists it is used. Otherwise a stylised Mason built from
   primitives is shown, so the page always has a model. Query params:
     ?model=<url>  load a different GLB     ?yaw=<deg>  rotate a GLB about Y */

const params = new URLSearchParams(location.search);
const MODEL = params.get('model') || 'assets/mason.glb';
const YAW = Number(params.get('yaw') || 0);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const EVEN_YELLOW = params.get('flat') !== '0';   // ?flat=0 shows the raw texture

/* The generated texture is painted darker and more orange on the side the source
   image never showed. This pulls only the yellow paint (a hue/saturation/value
   window, so tyres, mud, steel and black parts are untouched) toward one shared
   yellow, so every side of the machine reads as the same colour. */
const YELLOW_GLSL = `
  vec3 mHsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1e-10; return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x); }
  vec3 mRgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }
`;
function evenYellow(material) {
  if (!material.map) return;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', YELLOW_GLSL + '\nvoid main() {')
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 s = pow(max(diffuseColor.rgb, 0.0), vec3(1.0/2.2));
        vec3 h = mHsv(s);
        float hueM = smoothstep(0.05, 0.085, h.x) * (1.0 - smoothstep(0.15, 0.18, h.x));
        float m = hueM * smoothstep(0.50, 0.70, h.y) * smoothstep(0.30, 0.45, h.z);
        vec3 t = vec3(mix(h.x, 0.125, 0.75), mix(h.y, 0.93, 0.65), mix(h.z, 0.90, 0.78));
        s = mix(s, mRgb(t), m);
        diffuseColor.rgb = pow(s, vec3(2.2));
      }`);
  };
  material.customProgramCacheKey = () => 'even-yellow';
  material.needsUpdate = true;
}

const canvas = document.getElementById('stage3d');
const stage = document.getElementById('stage');
const hint = document.getElementById('hint');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (e) {
  console.info('WebGL unavailable, skipping 3D.', e);
  stage.hidden = true;
  if (window.masonLoad) window.masonLoad.set('model', 1);
}

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
  /* Lighting follows the camera, so every side of the machine gets the same
     light and the same yellow as you rotate it. The ground shadow comes from the
     same camera-attached light, so it is always there. Not physical, but even. */
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  camera.add(sun);
  scene.add(camera, sun.target);                       // target stays at the origin
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffffff, 0.7)); // even ambient, same from all sides

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.7;
  controls.minPolarAngle = THREE.MathUtils.degToRad(62);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.9;

  /* ---------- procedural Mason ---------- */
  const YELLOW = new THREE.MeshStandardMaterial({ color: 0xf2b400, roughness: 0.42, metalness: 0.15 });
  const DARK = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.75, metalness: 0.2 });
  const STEEL = new THREE.MeshStandardMaterial({ color: 0x9a9aa2, roughness: 0.35, metalness: 0.85 });
  const GLASS = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.15, metalness: 0.6 });

  const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const box = (w, h, d, r, mat, x, y, z) => {
    const m = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), mat));
    m.position.set(x, y, z);
    return m;
  };
  const cyl = (rt, rb, h, mat, seg = 28) => shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat));

  // a rod/limb from point a to point b
  function limb(a, b, w, mat, r = 0.06) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const m = box(len + w * 0.6, w, w, r, mat, 0, 0, 0);
    const g = new THREE.Group();
    g.add(m);
    g.position.copy(va).add(vb).multiplyScalar(0.5);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), vb.clone().sub(va).normalize());
    return g;
  }
  function ram(a, b, w = 0.07) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const g = new THREE.Group();
    const barrel = cyl(w, w, len * 0.58, DARK, 16); barrel.position.y = -len * 0.21;
    const rod = cyl(w * 0.55, w * 0.55, len * 0.5, STEEL, 16); rod.position.y = len * 0.25;
    g.add(barrel, rod);
    g.position.copy(va).add(vb).multiplyScalar(0.5);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    return g;
  }

  function buildMason() {
    const mason = new THREE.Group();

    // tracks (+x is the front)
    for (const z of [-1, 1]) {
      const track = box(3.7, 0.78, 0.62, 0.3, DARK, 0, 0.39, z * 0.98);
      mason.add(track);
      for (const x of [-1.5, -0.5, 0.5, 1.5]) {
        const wheel = cyl(0.22, 0.22, 0.66, STEEL, 24);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(x, 0.39, z * 0.98);
        mason.add(wheel);
      }
      // track guard
      mason.add(box(3.5, 0.1, 0.78, 0.04, YELLOW, 0, 0.84, z * 0.98));
    }

    // chassis
    mason.add(box(3.2, 0.5, 1.6, 0.12, YELLOW, 0, 0.98, 0));
    // front hood
    mason.add(box(1.15, 0.62, 1.5, 0.16, YELLOW, 1.05, 1.5, 0));
    // sensor visor on the hood
    mason.add(box(0.06, 0.2, 1.0, 0.03, GLASS, 1.64, 1.5, 0));
    // lidar puck + mast
    const mast = cyl(0.04, 0.04, 0.34, DARK, 12); mast.position.set(0.8, 1.98, 0.55); mason.add(mast);
    const lidar = cyl(0.17, 0.17, 0.16, DARK, 32); lidar.position.set(0.8, 2.22, 0.55); mason.add(lidar);
    const lidarRing = cyl(0.175, 0.175, 0.03, STEEL, 32); lidarRing.position.set(0.8, 2.22, 0.55); mason.add(lidarRing);

    // load bed, tipped slightly
    const bed = new THREE.Group();
    bed.position.set(-1.0, 1.28, 0);
    bed.rotation.z = THREE.MathUtils.degToRad(5);
    bed.add(box(1.9, 0.1, 1.66, 0.04, YELLOW, 0, 0.05, 0));
    bed.add(box(1.9, 0.52, 0.1, 0.04, YELLOW, 0, 0.3, 0.78));
    bed.add(box(1.9, 0.52, 0.1, 0.04, YELLOW, 0, 0.3, -0.78));
    bed.add(box(0.1, 0.52, 1.66, 0.04, YELLOW, -0.9, 0.3, 0));
    bed.add(box(0.1, 0.34, 1.66, 0.04, YELLOW, 0.9, 0.21, 0));
    mason.add(bed);
    mason.add(ram([-0.3, 1.2, 0.5], [-0.55, 1.55, 0.5]), ram([-0.3, 1.2, -0.5], [-0.55, 1.55, -0.5]));

    // arm: turntable, boom, stick, grabber (reaches forward and down)
    const base = cyl(0.3, 0.34, 0.2, DARK, 32); base.position.set(0.55, 1.86, -0.35); mason.add(base);
    const arm = new THREE.Group();
    arm.position.set(0.55, 1.98, -0.35);
    arm.add(limb([0, 0, 0], [0.9, 1.0, 0], 0.2, YELLOW, 0.07));          // boom, up and forward
    arm.add(limb([0.9, 1.0, 0], [2.0, 0.55, 0], 0.17, YELLOW, 0.06));    // stick, forward and down
    const pj1 = cyl(0.13, 0.13, 0.3, DARK, 20); pj1.rotation.x = Math.PI / 2; pj1.position.set(0.9, 1.0, 0); arm.add(pj1);
    const pj2 = cyl(0.1, 0.1, 0.26, DARK, 20); pj2.rotation.x = Math.PI / 2; pj2.position.set(2.0, 0.55, 0); arm.add(pj2);
    arm.add(ram([0.1, 0.35, 0.18], [0.82, 0.88, 0.18]), ram([0.1, 0.35, -0.18], [0.82, 0.88, -0.18]));
    arm.add(ram([0.95, 1.2, 0.0], [1.85, 0.7, 0.0], 0.06));
    // grabber: two claws
    const grab = new THREE.Group();
    grab.position.set(2.0, 0.55, 0);
    grab.rotation.z = THREE.MathUtils.degToRad(-8);
    grab.add(box(0.2, 0.22, 0.5, 0.05, DARK, 0.05, 0, 0));
    for (const z of [-1, 1]) {
      grab.add(limb([0.05, 0, z * 0.22], [0.0, -0.55, z * 0.16], 0.09, DARK, 0.03));
      grab.add(limb([0.0, -0.55, z * 0.16], [0.28, -0.72, z * 0.1], 0.08, DARK, 0.03));
    }
    arm.add(grab);
    mason.add(arm);

    // a few bricks in the bed
    const brick = new THREE.MeshStandardMaterial({ color: 0xb5654a, roughness: 0.9 });
    [[-1.25, 1.52, -0.3, 0.1], [-0.95, 1.52, 0.25, -0.2], [-0.7, 1.52, -0.35, 0.3], [-1.2, 1.64, 0.1, 0.4]].forEach(([x, y, z, r]) => {
      const b = box(0.42, 0.2, 0.2, 0.02, brick, x, y, z); b.rotation.y = r; mason.add(b);
    });

    return mason;
  }

  /* ---------- placement ---------- */
  let radius = 3, height = 2;
  function place(object) {
    const holder = new THREE.Group();
    holder.add(object);
    scene.add(holder);
    let box3 = new THREE.Box3().setFromObject(holder);
    const size = box3.getSize(new THREE.Vector3());
    object.scale.setScalar(4 / Math.max(size.x, size.y, size.z));
    box3 = new THREE.Box3().setFromObject(holder);
    const c = box3.getCenter(new THREE.Vector3());
    object.position.set(-c.x, -box3.min.y, -c.z);
    box3 = new THREE.Box3().setFromObject(holder);
    radius = box3.getBoundingSphere(new THREE.Sphere()).radius;
    height = box3.max.y - box3.min.y;

    // light position is in camera space: a bit left, well above, a little behind the viewer
    sun.position.set(-radius * 0.5, radius * 2.4, radius * 0.8);
    sun.target.position.set(0, 0, 0);
    // the room reflections are fixed in the world; tone them down so they don't tint one side
    object.traverse((o) => {
      if (o.isMesh && o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          m.envMapIntensity = 0.35;
          if (EVEN_YELLOW) evenYellow(m);
        });
      }
    });
    const s = sun.shadow.camera;
    s.left = s.bottom = -radius * 1.6; s.right = s.top = radius * 1.6;
    s.near = 0.1; s.far = radius * 8; s.updateProjectionMatrix();
    // start on a flattering three-quarter view
    const az = THREE.MathUtils.degToRad(48), el = THREE.MathUtils.degToRad(14);
    controls.target.set(0, height * 0.42, 0);
    camera.position.set(Math.sin(az) * Math.cos(el), controls.target.y / 1 + Math.sin(el), Math.cos(az) * Math.cos(el));
    placed = true;
    fit();
  }

  let placed = false;
  function fit() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const dist = (radius * 0.9) / Math.sin(Math.min(vfov, hfov) / 2);
    if (placed) {
      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(dir, dist);
    }
    camera.updateProjectionMatrix();
    controls.update();
  }

  const ready = () => { stage.classList.add('is-ready'); loop(); };
  const report = (k, f) => { if (window.masonLoad) window.masonLoad.set(k, f); };
  new GLTFLoader().load(
    MODEL,
    (gltf) => { gltf.scene.rotation.y = THREE.MathUtils.degToRad(YAW);
      gltf.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
      place(gltf.scene); ready(); report('model', 1); },
    (e) => { if (e.lengthComputable && e.total) report('model', (e.loaded / e.total) * 0.97); },
    () => { place(buildMason()); ready(); report('model', 1); },
  );

  function loop() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  controls.addEventListener('start', () => { hint.classList.add('is-gone'); controls.autoRotate = false; });
  new ResizeObserver(fit).observe(stage);
  document.addEventListener('visibilitychange', () => { controls.autoRotate = !document.hidden && !reduceMotion && !hint.classList.contains('is-gone'); });
}
