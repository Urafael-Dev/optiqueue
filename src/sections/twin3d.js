import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Vista 3D del gemelo digital: terminal, puente de desembarque, avión y plataforma.
 *
 * No simula nada por su cuenta. `sync(snapshot)` recibe el estado de la simulación en
 * vivo y decide quién va a la fila, quién pasa a ventanilla y quién sale; un bucle
 * propio (`tick`) se encarga solo del movimiento y de las animaciones de ambiente.
 * En modo oscuro la escena pasa a ser de noche.
 */

// ---------- Distribución de la sala ----------
const BOOTH_GAP = 1.15;
const BOOTH_Z = -6;
const STAND_Z = -5.2; // donde espera quien está siendo atendido
const LANE_HEAD_Z = -3.4;
const LANE_GAP = 0.85;
const LANE_HALF = 9;
const SLOT_GAP = 0.55;
const LANES = 7;
const PER_LANE = Math.floor((2 * LANE_HALF) / SLOT_GAP) + 1;
const MAX_QUEUE_AGENTS = LANES * PER_LANE;
const MAX_AGENTS = MAX_QUEUE_AGENTS + 160;
const SIDE_X = LANE_HALF + 1.3; // pasillo a la derecha de la fila
const FRONT_Z = -4.45; // pasillo entre la fila y las ventanillas
const GLASS_X = 14;

// ---------- Avión ----------
const NOSE_X = 14.9;
const PLANE_LEN = 17;
const R = 1.3;
const FY = 0.9; // eje del fuselaje: la puerta queda al nivel del piso de la terminal
const DOOR_S = 3.2;
const BRIDGE_Z = 2.75;

const V = (x, z) => new THREE.Vector3(x, 0, z);
const DOOR = V(NOSE_X + DOOR_S, 1.85);
const CAB = V(NOSE_X + DOOR_S, BRIDGE_Z);
const BRIDGE_END = V(12.8, BRIDGE_Z);
const EXIT = V(-12.35, -9.1);

const THEMES = {
  day: {
    skyTop: '#86aede', skyBottom: '#eef3f9', fog: '#e4ebf4', grass: '#a3b192', apron: '#8b95a3', floor: '#f3f1ec', carpet: '#24385a',
    sun: '#fff3df', sunI: 2.6, hemiSky: '#e4ecff', hemiGround: '#8d927f', hemiI: 0.85, env: 0.6, exposure: 1, glow: 0, stars: 0, interior: 0,
  },
  night: {
    skyTop: '#02060f', skyBottom: '#1a2a48', fog: '#101a2e', grass: '#0f1713', apron: '#1a212c', floor: '#d9d5cd', carpet: '#1d2e4b',
    sun: '#9fb4ff', sunI: 0.45, hemiSky: '#3b4c74', hemiGround: '#0b0f18', hemiI: 0.3, env: 0.25, exposure: 1.1, glow: 1, stars: 1, interior: 1,
  },
};
const STATE = {
  busy: { color: '#1b2d4f', label: 'Atendiendo', fg: '#ffffff' },
  idle: { color: '#2563eb', label: 'Libre', fg: '#ffffff' },
  closing: { color: '#94a3b8', label: 'Cerrando', fg: '#1e293b' },
  closed: { color: '#d5dbe3', label: 'Cerrada', fg: '#64748b' },
};
const CLOTHES = ['#334155', '#475569', '#6b7280', '#9a7b5c', '#5b6b4f', '#7c3f4a', '#3f5f73', '#a3a8b0', '#2f4a6d', '#8c6d4f'];
const SKIN = ['#f1c9a5', '#d9a47c', '#a86f48', '#7a4a2c', '#e8b896', '#c68e64'];
const BAGS = ['#1f2937', '#2563eb', '#b45309', '#475569', '#9f1239', '#0f766e', '#d4d4d8'];
const LATE = new THREE.Color('#e5484d');

const CAMERAS = {
  general: { pos: [5, 19, 25], target: [8.5, -0.8, -0.8] },
  plane: { pos: [12.5, 6.5, 15], target: [21, -0.5, 0] },
  booths: { pos: [-1.5, 6.8, 5.5], target: [-1.5, 0.6, -5.4] },
  tour: { pos: [9, 15, 23], target: [6, -0.5, -1] },
};
const INTRO = { pos: [46, 30, 42], target: [22, -1, 0] };

const laneSlot = (i, out = new THREE.Vector3()) => {
  const lane = Math.floor(i / PER_LANE);
  const j = i % PER_LANE;
  return out.set(lane % 2 === 0 ? -LANE_HALF + j * SLOT_GAP : LANE_HALF - j * SLOT_GAP, 0, LANE_HEAD_Z + lane * LANE_GAP);
};
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const easeOutBack = (k) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;

const canvasTexture = (w, h, draw, { repeat } = {}) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...repeat);
  }
  return tex;
};
const FONT = 'Inter Variable, Inter, system-ui, sans-serif';

export function createTwin3D(container, { maxBooths, wqMax }) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;

  // ---------- Renderizador ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const MAX_DPR = Math.min(devicePixelRatio, 1.5);
  let dpr = MAX_DPR;
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = 'block w-full h-full opacity-0 transition-opacity duration-700';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 700);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false; // la rueda sigue desplazando la página
  controls.enablePan = false;
  controls.enableDamping = !reduced;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = 1.36;
  controls.autoRotateSpeed = 0.55;
  if (coarse) {
    controls.enabled = false; // en táctil el dedo debe desplazar la página
    renderer.domElement.style.touchAction = 'auto';
  }

  // ---------- Luces ----------
  const hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 2);
  sun.position.set(-8, 26, 16);
  sun.target.position.set(8, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 22, bottom: -22, near: 1, far: 80 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  // ---------- Utilidades ----------
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...extra });
  const add = (obj, parent = scene, { cast = true, receive = true } = {}) => {
    obj.castShadow = cast;
    obj.receiveShadow = receive;
    parent.add(obj);
    return obj;
  };
  const mesh = (geo, m, x = 0, y = 0, z = 0, parent = scene, opts) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    return add(o, parent, opts);
  };
  const rbox = (w, h, d, r = 0.04, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) - 1e-4);
  const glowTex = canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
  const glow = (color, size, parent = scene) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.setScalar(size);
    s.userData.size = size;
    parent.add(s);
    return s;
  };
  // Sombra de contacto barata para lo que se mueve (el mapa de sombras es estático)
  const blobTex = canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, toneMapped: false });
  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blob = (w, d, opacity, y, x = 0, z = 0) => {
    const m = new THREE.Mesh(blobGeo, opacity === 1 ? blobMat : Object.assign(blobMat.clone(), { opacity }));
    m.scale.set(w, 1, d);
    m.position.set(x, y, z);
    m.renderOrder = 1;
    return m;
  };
  const glass = std('#b9d6f2', { roughness: 0.05, transparent: true, opacity: 0.16, envMapIntensity: 1.6, depthWrite: false });
  const chrome = std('#cbd5e1', { metalness: 1, roughness: 0.22 });
  const darkMetal = std('#3b4555', { metalness: 0.7, roughness: 0.4 });

  // ---------- Cielo, estrellas y terreno ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.6 + 0.05, 0., 1.); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.7)), 1.); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat);
  scene.add(sky);
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    const th = Math.random() * Math.PI * 2;
    const y = 0.08 + Math.random() * 0.92;
    const r = Math.sqrt(1 - y * y);
    starPos.set([Math.cos(th) * r * 450, y * 450, Math.sin(th) * r * 450], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#dbe6ff', size: 1.6, sizeAttenuation: false, transparent: true, fog: false }));
  scene.add(stars);

  const grassMat = std('#a3b192', { roughness: 1 });
  const grass = mesh(new THREE.PlaneGeometry(900, 900), grassMat, 20, -2.03, 0, scene, { cast: false });
  grass.rotation.x = -Math.PI / 2;
  const asphalt = canvasTexture(
    256,
    256,
    (g, w, h) => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const v = 110 + Math.random() * 40;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
      }
      g.strokeStyle = 'rgba(0,0,0,0.12)';
      g.lineWidth = 2;
      g.strokeRect(0, 0, w, h); // juntas de las losas
    },
    { repeat: [12, 9] },
  );
  const apronMat = std('#8b95a3', { roughness: 0.95, map: asphalt });
  const apron = mesh(new THREE.PlaneGeometry(110, 76), apronMat, 30, -2, 2, scene, { cast: false });
  apron.rotation.x = -Math.PI / 2;
  const runway = mesh(new THREE.PlaneGeometry(400, 9), apronMat, 20, -2.01, -46, scene, { cast: false });
  runway.rotation.x = -Math.PI / 2;
  const paintMats = new Map();
  const paint = (color, w, d, x, z) => {
    if (!paintMats.has(color)) paintMats.set(color, std(color, { roughness: 0.6 }));
    const p = mesh(new THREE.PlaneGeometry(w, d), paintMats.get(color), x, -1.985, z, scene, { cast: false });
    p.rotation.x = -Math.PI / 2;
    return p;
  };
  paint('#e8b923', 46, 0.16, NOSE_X + 23, 0); // línea de guiado al puesto
  paint('#e8b923', 0.16, 6, NOSE_X - 0.6, 0); // barra de parada
  paint('#e8b923', 160, 0.16, 20, -24); // calle de rodaje
  paint('#e8b923', 0.16, 24, 52, -12);
  for (let x = -120; x < 160; x += 9) paint('#f1f5f9', 4.5, 0.35, x, -46);
  // zona de seguridad del puesto
  for (const [w, d, x, z] of [[20, 0.14, NOSE_X + 9, -10.5], [20, 0.14, NOSE_X + 9, 10.5], [0.14, 21, NOSE_X + 19, 0]]) paint('#c03535', w, d, x, z);

  // Torre de control y postes de iluminación al fondo
  const tower = new THREE.Group();
  tower.position.set(-30, -2, -52);
  scene.add(tower);
  mesh(new THREE.CylinderGeometry(1.1, 1.6, 16, 24), std('#e2e8f0'), 0, 8, 0, tower);
  mesh(new THREE.CylinderGeometry(2.3, 2.3, 2, 8), std('#1e293b', { roughness: 0.15, metalness: 0.5 }), 0, 17.1, 0, tower);
  mesh(new THREE.CylinderGeometry(2.9, 2.6, 0.5, 8), std('#f1f5f9'), 0, 18.4, 0, tower);
  const towerBeacon = glow('#ff4d4d', 2.2, tower);
  towerBeacon.position.set(0, 19.4, 0);
  const poleGlows = [];
  for (const [x, z] of [[40, -15], [8, -20], [60, -4], [-18, -20]]) {
    mesh(new THREE.CylinderGeometry(0.12, 0.18, 14, 10), darkMetal, x, 5, z);
    mesh(rbox(1.6, 0.4, 0.8), std('#334155'), x, 12.1, z);
    const gl = glow('#ffe7b8', 7);
    gl.position.set(x, 11.8, z);
    poleGlows.push(gl);
  }

  // ---------- Terminal ----------
  const floorTex = canvasTexture(
    512,
    512,
    (g, w, h) => {
      const n = 4;
      const s = w / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const v = 236 + Math.random() * 12;
          g.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
          g.fillRect(i * s, j * s, s, s);
          for (let k = 0; k < 60; k++) {
            g.fillStyle = `rgba(120,110,100,${Math.random() * 0.12})`;
            g.fillRect(i * s + Math.random() * s, j * s + Math.random() * s, 2, 2);
          }
        }
      g.strokeStyle = 'rgba(120,120,130,0.35)';
      g.lineWidth = 2;
      for (let i = 0; i <= n; i++) {
        g.beginPath();
        g.moveTo(i * s, 0);
        g.lineTo(i * s, h);
        g.moveTo(0, i * s);
        g.lineTo(w, i * s);
        g.stroke();
      }
    },
    { repeat: [27.5 / 4.8, 18 / 4.8] },
  );
  const floorMat = std('#ffffff', { map: floorTex, roughness: 0.32, envMapIntensity: 0.8 });
  const slabMat = std('#aab4c2', { roughness: 0.9 });
  mesh(new THREE.BoxGeometry(27.5, 2, 18), [slabMat, slabMat, floorMat, slabMat, slabMat, slabMat], 0.35, -1, -0.5, scene, { cast: false });

  const carpetMat = std('#24385a', { roughness: 1 });
  const carpet = mesh(new THREE.PlaneGeometry(24.4, 3.0), carpetMat, 0, 0.004, -6.35, scene, { cast: false });
  carpet.rotation.x = -Math.PI / 2;
  // línea amarilla «espere aquí» en la salida de la fila
  const waitLine = mesh(new THREE.PlaneGeometry(1.5, 0.12), std('#f2c230', { roughness: 0.5 }), -LANE_HALF - 0.05, 0.006, LANE_HEAD_Z - 0.42, scene, { cast: false });
  waitLine.rotation.x = -Math.PI / 2;

  // Pared de fondo con revestimiento de madera, letrero, reloj y salida
  mesh(new THREE.BoxGeometry(27.5, 3.6, 0.3), std('#ffffff', { roughness: 0.85 }), 0.35, 1.8, -9.65);
  const woodTex = canvasTexture(
    512,
    64,
    (g, w, h) => {
      for (let x = 0; x < w; x += 16) {
        const v = Math.random() * 18;
        g.fillStyle = `rgb(${196 + v},${160 + v},${118 + v})`;
        g.fillRect(x, 0, 14, h);
        g.fillStyle = 'rgba(60,40,20,0.35)';
        g.fillRect(x + 14, 0, 2, h);
      }
    },
    { repeat: [8, 1] },
  );
  mesh(new THREE.BoxGeometry(27.5, 1.9, 0.06), std('#ffffff', { map: woodTex, roughness: 0.6 }), 0.35, 0.95, -9.47, scene, { cast: false });
  mesh(rbox(19, 0.95, 0.16, 0.06), std('#0f1b2d', { roughness: 0.4 }), 0, 2.75, -9.42);
  const signTex = canvasTexture(2048, 104, (g, w, h) => {
    g.fillStyle = '#0f1b2d';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#7c9dff';
    g.fillRect(0, h - 6, w, 6);
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.font = `600 54px ${FONT}`;
    g.letterSpacing = '10px';
    g.fillText('CONTROL MIGRATORIO', w * 0.3, h / 2);
    g.fillStyle = '#9fb3d9';
    g.font = `400 46px ${FONT}`;
    g.fillText('IMMIGRATION', w * 0.74, h / 2);
    g.fillStyle = '#7c9dff';
    g.beginPath();
    g.arc(w * 0.555, h / 2, 6, 0, Math.PI * 2);
    g.fill();
  });
  mesh(new THREE.PlaneGeometry(18.6, 0.94), new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }), 0, 2.75, -9.335, scene, { cast: false });

  // Salida con puerta de vidrio
  mesh(rbox(1.7, 2.3, 0.12, 0.03), darkMetal, EXIT.x, 1.15, -9.46);
  mesh(new THREE.BoxGeometry(1.5, 2.15, 0.04), std('#16314f', { roughness: 0.1, metalness: 0.3 }), EXIT.x, 1.1, -9.38, scene, { cast: false });
  const exitTex = canvasTexture(256, 96, (g, w, h) => {
    g.fillStyle = '#157f4b';
    g.beginPath();
    g.roundRect(0, 0, w, h, 14);
    g.fill();
    g.fillStyle = '#fff';
    g.font = `700 44px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SALIDA', w / 2, h / 2 + 2);
  });
  mesh(new THREE.PlaneGeometry(1.4, 0.52), new THREE.MeshBasicMaterial({ map: exitTex, transparent: true, toneMapped: false }), EXIT.x, 2.62, -9.33, scene, { cast: false });

  // Reloj de pared: marca la hora simulada
  const clock = new THREE.Group();
  clock.position.set(11.4, 2.5, -9.36);
  scene.add(clock);
  const clockFace = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(128, 128, 122, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = '#0f1b2d';
    g.stroke();
    g.fillStyle = '#0f1b2d';
    for (let i = 0; i < 12; i++) {
      g.save();
      g.translate(128, 128);
      g.rotate((i / 12) * Math.PI * 2);
      g.fillRect(-3, -108, 6, i % 3 ? 14 : 24);
      g.restore();
    }
  });
  mesh(new THREE.CircleGeometry(0.6, 48), new THREE.MeshBasicMaterial({ map: clockFace, toneMapped: false }), 0, 0, 0, clock, { cast: false });
  const hand = (len, w, z) => {
    const geo = new THREE.BoxGeometry(w, len, 0.02);
    geo.translate(0, len / 2 - 0.06, 0);
    const m = mesh(geo, new THREE.MeshBasicMaterial({ color: '#0f1b2d' }), 0, 0, z, clock, { cast: false });
    m.userData.dynamic = true;
    return m;
  };
  const hourHand = hand(0.34, 0.05, 0.02);
  const minuteHand = hand(0.5, 0.03, 0.03);
  mesh(new THREE.CircleGeometry(0.04, 16), new THREE.MeshBasicMaterial({ color: '#c02626' }), 0, 0, 0.045, clock, { cast: false });

  // Ventanal hacia la plataforma
  const glassWall = mesh(new THREE.BoxGeometry(0.05, 3.2, 18), glass, GLASS_X, 1.6, -0.5, scene, { cast: false, receive: false });
  glassWall.renderOrder = 2;
  for (let z = -9.4; z <= 8.5; z += 1.8) mesh(new THREE.BoxGeometry(0.1, 3.2, 0.08), darkMetal, GLASS_X, 1.6, z);
  mesh(new THREE.BoxGeometry(0.14, 0.12, 18), darkMetal, GLASS_X, 3.2, -0.5);
  mesh(new THREE.BoxGeometry(0.14, 0.12, 18), darkMetal, GLASS_X, 0.06, -0.5);

  // Plantas
  const leafMats = [std('#3f7d4e', { roughness: 0.8, flatShading: true }), std('#5c9a5f', { roughness: 0.8, flatShading: true })];
  const potMat = std('#334155', { roughness: 0.5 });
  for (const [x, z] of [[-12.5, 7.6], [13.2, 7.6], [-12.5, 0.4], [13.2, -8.7]]) {
    mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.75, 20), potMat, x, 0.375, z);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leaf = mesh(new THREE.IcosahedronGeometry(0.26 + (i % 3) * 0.05, 0), leafMats[i % 2], x + Math.cos(a) * 0.2, 0.95 + (i % 3) * 0.18, z + Math.sin(a) * 0.2);
      leaf.rotation.set(i, i * 2, 0);
    }
  }

  // ---------- Fila serpenteante ----------
  const ribbonMat = std('#2563eb', { roughness: 0.45 });
  const postGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.92, 12);
  const baseGeo = new THREE.CylinderGeometry(0.15, 0.17, 0.03, 24);
  const capGeo = new THREE.SphereGeometry(0.05, 16, 10);
  const addPost = (x, z) => {
    mesh(postGeo, chrome, x, 0.46, z);
    mesh(baseGeo, chrome, x, 0.015, z);
    mesh(capGeo, chrome, x, 0.93, z);
  };
  const addRibbon = (x0, x1, z) => {
    const spans = Math.max(1, Math.round((x1 - x0) / 4.5));
    for (let i = 0; i <= spans; i++) addPost(x0 + ((x1 - x0) * i) / spans, z);
    for (let i = 0; i < spans; i++) {
      const a = new THREE.Vector3(x0 + ((x1 - x0) * i) / spans, 0.86, 0);
      const b = new THREE.Vector3(x0 + ((x1 - x0) * (i + 1)) / spans, 0.86, 0);
      const mid = a.clone().lerp(b, 0.5);
      mid.y -= 0.07; // la cinta cuelga un poco
      const tube = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, 0.024, 6);
      tube.scale(1, 1.6, 0.4); // cinta plana
      tube.translate(0, -0.86 * 0.6, 0);
      mesh(tube, ribbonMat, 0, 0, z);
    }
  };
  for (let s = -1; s < LANES; s++) {
    const z = LANE_HEAD_Z + s * LANE_GAP + LANE_GAP / 2;
    const outer = s === -1 || s === LANES - 1;
    // los separadores interiores dejan un hueco en el extremo donde gira la fila
    const turnRight = s % 2 === 0;
    const x0 = outer || turnRight ? -LANE_HALF - 0.6 : -LANE_HALF + 0.6;
    const x1 = outer || !turnRight ? LANE_HALF + 0.6 : LANE_HALF - 0.6;
    // el frente queda abierto junto a la cabeza para pasar a las ventanillas
    addRibbon(s === -1 ? x0 + 1.6 : x0, x1, z);
  }

  // ---------- Ventanillas ----------
  const deskMat = std('#f8fafc', { roughness: 0.45 });
  const woodTop = std('#caa57a', { roughness: 0.5 });
  const frosted = std('#e2e8f0', { roughness: 0.35, transparent: true, opacity: 0.6, envMapIntensity: 1.2 });
  const uniformMat = std('#22344f', { roughness: 0.8 });
  const capMat = std('#0f1b2d', { roughness: 0.6 });
  const officerBodyGeo = new THREE.CapsuleGeometry(0.16, 0.34, 2, 8);
  officerBodyGeo.translate(0, 0.34, 0);
  const officerHeadGeo = new THREE.SphereGeometry(0.115, 10, 8);
  officerHeadGeo.translate(0, 0.8, 0);
  const officerCapGeo = new THREE.CylinderGeometry(0.12, 0.125, 0.07, 18);
  officerCapGeo.translate(0, 0.9, 0);
  const deskGeo = rbox(0.72, 0.92, 0.52, 0.05);
  const topGeo = rbox(0.82, 0.05, 0.62, 0.02);
  const bandGeo = rbox(0.73, 0.06, 0.02, 0.009);
  const dividerGeo = rbox(0.05, 1.5, 1.3, 0.02);
  const monitorGeo = rbox(0.3, 0.2, 0.03, 0.01);
  const paneGeo = new THREE.BoxGeometry(0.7, 0.5, 0.015);
  const signGeo = new THREE.PlaneGeometry(0.92, 0.46);
  const signBackGeo = rbox(0.98, 0.52, 0.05, 0.04);
  const wireGeo = new THREE.CylinderGeometry(0.006, 0.006, 1.1, 6);
  const barGeo = new THREE.PlaneGeometry(0.8, 0.045);
  barGeo.translate(0.4, 0, 0);
  const ringGeo = new THREE.RingGeometry(0.2, 0.27, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const hitGeo = new THREE.BoxGeometry(1.1, 2.6, 1.8);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const signBackMat = std('#0f1b2d', { roughness: 0.4 });
  const monitorMat = std('#111827', { roughness: 0.3 });
  const hitTargets = [];

  // Lo que cambia por ventanilla (oficial, franja de color, barra de avance, anillo) va
  // instanciado, y los letreros comparten una sola textura (atlas): pocas llamadas de dibujo.
  const inst = (geo, material, count = maxBooths) => {
    const m = new THREE.InstancedMesh(geo, material, count);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.userData.dynamic = true;
    scene.add(m);
    return m;
  };
  const offBody = inst(officerBodyGeo, uniformMat);
  const offHead = inst(officerHeadGeo, std('#ffffff', { roughness: 0.6 }));
  const offCap = inst(officerCapGeo, capMat);
  const bands = inst(bandGeo, new THREE.MeshBasicMaterial({ toneMapped: false }));
  const barFills = inst(barGeo, new THREE.MeshBasicMaterial({ color: '#8fb0ff', toneMapped: false }));
  const rings = inst(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  rings.renderOrder = 1;
  const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
  const RING_COLOR = new THREE.Color('#7c9dff');
  const mTmp = new THREE.Matrix4();
  const cTmp = new THREE.Color();

  const COLS = 4;
  const ROWS = Math.ceil(maxBooths / COLS);
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = 256 * COLS;
  atlasCanvas.height = 128 * ROWS;
  const atlas = new THREE.CanvasTexture(atlasCanvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  const signMat = new THREE.MeshBasicMaterial({ map: atlas, toneMapped: false });
  const barBgMat = new THREE.MeshBasicMaterial({ color: '#0b1322', toneMapped: false });

  const booths = Array.from({ length: maxBooths }, (_, k) => {
    const x = (k - (maxBooths - 1) / 2) * BOOTH_GAP;
    const g = new THREE.Group();
    g.position.set(x, 0, BOOTH_Z);
    scene.add(g);
    mesh(deskGeo, deskMat, -0.175, 0.46, 0, g);
    mesh(topGeo, woodTop, -0.175, 0.945, 0, g);
    mesh(paneGeo, glass, -0.175, 1.22, 0.27, g, { cast: false, receive: false }).renderOrder = 2;
    mesh(monitorGeo, monitorMat, -0.32, 1.1, -0.12, g).rotation.y = Math.PI + 0.3;
    mesh(dividerGeo, frosted, 0.575, 0.75, -0.3, g, { receive: false });
    bands.setMatrixAt(k, mTmp.makeTranslation(x - 0.175, 0.78, BOOTH_Z + 0.265));
    offHead.setColorAt(k, cTmp.set(SKIN[(k * 5) % SKIN.length]));

    // Letrero colgante: su cara toma una celda del atlas
    const sign = new THREE.Group();
    sign.position.set(-0.05, 2.15, 0.1);
    g.add(sign);
    mesh(signBackGeo, signBackMat, 0, 0, -0.03, sign);
    mesh(wireGeo, chrome, -0.36, 0.8, -0.03, sign, { cast: false });
    mesh(wireGeo, chrome, 0.36, 0.8, -0.03, sign, { cast: false });
    const face = signGeo.clone();
    const col = k % COLS;
    const row = Math.floor(k / COLS);
    const uv = face.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) / COLS, 1 - (row + 1 - uv.getY(i)) / ROWS);
    mesh(face, signMat, 0, 0, 0, sign, { cast: false });
    mesh(barGeo, barBgMat, -0.4, -0.31, 0.001, sign, { cast: false });

    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.position.set(x, 1.2, BOOTH_Z + 0.2);
    hit.userData = { kind: 'booth', k };
    scene.add(hit);
    hitTargets.push(hit);

    return { x, k, ringV: 0, state: '', progress: 0, prevBusy: false, prevProgress: 0, agent: null };
  });
  offHead.instanceColor.needsUpdate = true;
  for (let k = 0; k < maxBooths; k++) barFills.setMatrixAt(k, ZERO_M);

  const paintBooth = (b, state) => {
    b.state = state;
    const st = STATE[state];
    const g = atlasCanvas.getContext('2d');
    g.save();
    g.translate((b.k % COLS) * 256, Math.floor(b.k / COLS) * 128);
    g.clearRect(0, 0, 256, 128);
    g.fillStyle = st.color;
    g.beginPath();
    g.roundRect(0, 0, 256, 128, 18);
    g.fill();
    g.fillStyle = st.fg;
    g.textBaseline = 'middle';
    g.font = `700 64px ${FONT}`;
    g.textAlign = 'left';
    g.fillText(String(b.k + 1).padStart(2, '0'), 22, 56);
    g.font = `600 24px ${FONT}`;
    g.letterSpacing = '2px';
    g.globalAlpha = 0.85;
    g.fillText(st.label.toUpperCase(), 24, 104);
    g.globalAlpha = 1;
    g.letterSpacing = '0px';
    // indicador redondo arriba a la derecha
    g.fillStyle = state === 'idle' ? '#86efac' : state === 'busy' ? '#fbbf24' : 'rgba(0,0,0,0.15)';
    g.beginPath();
    g.arc(222, 36, 13, 0, Math.PI * 2);
    g.fill();
    g.restore();
    atlas.needsUpdate = true;
    bands.setColorAt(b.k, cTmp.set(st.color));
    bands.instanceColor.needsUpdate = true;
  };

  // ---------- Avión ----------
  const livery = buildLivery();
  const plane = buildPlane(livery);
  plane.group.position.set(NOSE_X, 0, 0);
  scene.add(plane.group);
  const planeHit = new THREE.Mesh(new THREE.BoxGeometry(PLANE_LEN, 3, 3), hitMat);
  planeHit.position.set(NOSE_X + PLANE_LEN / 2, FY, 0);
  planeHit.userData = { kind: 'plane' };
  scene.add(planeHit);
  hitTargets.push(planeHit);

  // Avión que rueda por la calle de rodaje al fondo
  const taxi = buildPlane(livery);
  taxi.group.scale.setScalar(0.92);
  taxi.group.userData.dynamic = true;
  taxi.group.traverse((o) => (o.castShadow = false));
  taxi.group.add(blob(19, 18, 0.35, -1.98, PLANE_LEN / 2 + 1, 0));
  scene.add(taxi.group);

  function buildLivery() {
    const W = 1024;
    const H = 2048;
    const vS = (s) => (s / PLANE_LEN) * H;
    // u = fracción del ángulo alrededor del fuselaje: 0 = costado derecho (z+),
    // 0,25 = panza, 0,5 = costado izquierdo (z−), 0,75 = techo
    const uOf = (phi) => (((phi / (Math.PI * 2)) % 1) + 1) % 1;
    const fillU = (g, u0, u1, s0, s1) => {
      for (const off of [-W, 0, W]) g.fillRect(u0 * W + off, vS(s0), (u1 - u0) * W, vS(s1) - vS(s0));
    };
    const colorC = document.createElement('canvas');
    const glowC = document.createElement('canvas');
    colorC.width = glowC.width = W;
    colorC.height = glowC.height = H;
    const g = colorC.getContext('2d');
    const e = glowC.getContext('2d');
    g.fillStyle = '#f7f8fa';
    g.fillRect(0, 0, W, H);
    e.fillStyle = '#000';
    e.fillRect(0, 0, W, H);
    // panza gris claro
    g.fillStyle = '#dfe4eb';
    fillU(g, uOf(0.5), uOf(Math.PI - 0.5), 0, PLANE_LEN);
    // cola azul marino con borde curvo que sube hacia el techo
    g.fillStyle = '#0f1b2d';
    g.beginPath();
    g.moveTo(0, vS(PLANE_LEN));
    for (let u = 0; u <= 1.001; u += 0.01) g.lineTo(u * W, vS(13.4 + 1.4 * Math.sin(u * Math.PI * 2)));
    g.lineTo(W, vS(PLANE_LEN));
    g.fill();
    const sides = [
      { win: uOf(-0.27), title: uOf(-0.66), stripe: [uOf(0.06), uOf(0.17)], door: [-0.62, 0.42], sign: 1 },
      { win: uOf(Math.PI + 0.27), title: uOf(Math.PI + 0.66), stripe: [uOf(Math.PI - 0.17), uOf(Math.PI - 0.06)], door: [Math.PI - 0.42, Math.PI + 0.62], sign: -1 },
    ];
    for (const side of sides) {
      // franjas
      g.fillStyle = '#0f1b2d';
      fillU(g, side.stripe[0], side.stripe[1], 2.2, 13.4);
      g.fillStyle = '#2563eb';
      fillU(g, side.stripe[0] - 0.014, side.stripe[0] - 0.005, 2.2, 13.8);
      // ventanas (encendidas de noche)
      for (let s = 4.1; s < 12.6; s += 0.52) {
        for (const [ctx, col] of [[g, '#1e2633'], [e, '#ffd9a0']]) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.roundRect(side.win * W - 16, vS(s), 32, 24, 9);
          ctx.fill();
        }
      }
      // puertas
      g.strokeStyle = '#9aa6b5';
      g.lineWidth = 3;
      const u0 = (side.door[0] / (Math.PI * 2)) * W;
      const u1 = (side.door[1] / (Math.PI * 2)) * W;
      for (const s of [DOOR_S - 0.32, 12.75]) {
        for (const off of [-W, 0, W]) {
          g.beginPath();
          g.roundRect(u0 + off, vS(s), u1 - u0, vS(0.64), 12);
          g.stroke();
        }
      }
      // nombre a lo largo del fuselaje: el texto corre por el eje (v) con su «arriba» hacia el techo
      g.save();
      g.translate(side.title * W, vS(7.4));
      if (side.sign === 1) g.transform(0, 1, 1, 0, 0, 0);
      else g.transform(0, -1, -1, 0, 0, 0);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `700 52px ${FONT}`;
      g.fillStyle = '#0f1b2d';
      g.fillText('OptiQueue', -40, 0);
      g.font = `500 52px ${FONT}`;
      g.fillStyle = '#2563eb';
      g.fillText('Air', 150, 0);
      g.restore();
    }
    // cabina
    for (const [ctx, col] of [[g, '#111827'], [e, '#4a5f8a']]) {
      ctx.fillStyle = col;
      fillU(ctx, uOf(-0.98), uOf(-0.5), 1.25, 1.8);
      fillU(ctx, uOf(Math.PI + 0.5), uOf(Math.PI + 0.98), 1.25, 1.8);
      fillU(ctx, 0.6, 0.9, 0.8, 1.22);
    }
    g.fillStyle = '#f7f8fa';
    for (const u of [0.675, 0.75, 0.825]) fillU(g, u - 0.005, u + 0.005, 0.8, 1.22);
    const tex = new THREE.CanvasTexture(colorC);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.anisotropy = 8;
    const emissive = new THREE.CanvasTexture(glowC);
    emissive.colorSpace = THREE.SRGBColorSpace;
    emissive.flipY = false;
    const fuselage = std('#ffffff', { map: tex, emissiveMap: emissive, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.28, metalness: 0.1 });
    return { fuselage };
  }

  function buildPlane({ fuselage }) {
    const group = new THREE.Group();
    const white = std('#f3f5f8', { roughness: 0.28, metalness: 0.1 });
    const navy = std('#0f1b2d', { roughness: 0.3 });
    const accent = std('#2563eb', { roughness: 0.3 });
    const metal = std('#aab4c3', { metalness: 0.85, roughness: 0.3 });
    const tire = std('#16181d', { roughness: 0.9 });

    // Fuselaje torneado: nariz, cuerpo y cono de cola levantado
    const n = 90;
    const pts = [];
    for (let j = 0; j < n; j++) {
      const s = (j / (n - 1)) * PLANE_LEN;
      let r;
      if (s < 2.7) r = R * (1 - ((2.7 - s) / 2.7) ** 2) ** 0.52;
      else if (s < 11.6) r = R;
      else r = R * (1 - 0.8 * ((s - 11.6) / 5.4) ** 1.5);
      if (j === n - 1) r = 0;
      pts.push(new THREE.Vector2(Math.max(r, 0), s));
    }
    const fusGeo = new THREE.LatheGeometry(pts, 48);
    fusGeo.rotateZ(-Math.PI / 2);
    const p = fusGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      if (x > 11.6) {
        const f = (x - 11.6) / 5.4;
        let y = p.getY(i);
        if (y < 0) y *= 1 - 0.35 * f;
        p.setY(i, y + 0.75 * f * f);
      }
    }
    fusGeo.computeVertexNormals();
    const fus = add(new THREE.Mesh(fusGeo, fuselage), group);
    fus.position.y = FY;
    const tailY = (s) => FY + 0.75 * Math.max(0, (s - 11.6) / 5.4) ** 2;

    const flat = (pts2, depth, m, bevel = 0.04) => {
      const shape = new THREE.Shape(pts2.map(([u, v]) => new THREE.Vector2(u, v)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4 });
      geo.translate(0, 0, -depth / 2);
      return add(new THREE.Mesh(geo, m), group);
    };

    const fans = [];
    // las 18 aspas del ventilador en una sola geometría
    const bladesGeo = mergeGeometries(
      Array.from({ length: 18 }, (_, i) =>
        new THREE.BoxGeometry(0.012, 0.36, 0.08)
          .translate(0, 0.24, 0)
          .applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler((i / 18) * Math.PI * 2, 0.5, 0)))
          .translate(-0.01, 0, 0),
      ),
    );
    const lights = { beacons: [], strobes: [], nav: [] };
    for (const side of [1, -1]) {
      // Ala baja en flecha con diedro
      const wing = flat([[5.2, 0], [8.9, 0], [10.1, 8.4 * side], [9.0, 8.4 * side]], 0.12, white, 0.05);
      wing.rotation.x = Math.PI / 2 - 0.06 * side;
      wing.position.y = FY - 0.6;
      const tipY = FY - 0.6 + 8.4 * Math.sin(0.06);
      const winglet = flat([[0, 0], [1.05, 0], [1.35, 0.95], [0.85, 0.95]], 0.04, accent, 0.02);
      winglet.position.set(9.0, tipY, 8.4 * side);
      // Estabilizador horizontal
      const stab = flat([[14.0, 0], [15.6, 0], [16.6, 3.2 * side], [15.9, 3.2 * side]], 0.08, white, 0.03);
      stab.rotation.x = Math.PI / 2 - 0.1 * side;
      stab.position.y = tailY(15) + 0.05;

      // Motor: góndola torneada, ventilador que gira, cono de escape y pilón
      const eng = new THREE.Group();
      eng.position.set(4.0, FY - 1.22, 3.4 * side);
      group.add(eng);
      const nacelle = new THREE.LatheGeometry(
        [[0.42, 0.12], [0.47, 0.0], [0.56, 0.12], [0.6, 0.6], [0.58, 1.6], [0.44, 2.3], [0.3, 2.35]].map(([r, y]) => new THREE.Vector2(r, y)),
        28,
      );
      nacelle.rotateZ(-Math.PI / 2);
      add(new THREE.Mesh(nacelle, white), eng);
      const lip = add(new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 6, 28), metal), eng);
      lip.rotation.y = Math.PI / 2;
      const fan = new THREE.Group();
      fan.position.x = 0.32;
      eng.add(fan);
      add(new THREE.Mesh(new THREE.CircleGeometry(0.44, 24).rotateY(-Math.PI / 2), std('#1c2430', { roughness: 0.5 })), fan, { cast: false });
      fan.add(new THREE.Mesh(bladesGeo, metal));
      const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 24).rotateZ(Math.PI / 2), white);
      spinner.position.x = -0.15;
      fan.add(spinner);
      fan.userData.dynamic = true;
      fan.traverse((o) => (o.castShadow = false));
      fans.push(fan);
      const exhaust = add(new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.6, 24).rotateZ(-Math.PI / 2), metal), eng);
      exhaust.position.x = 2.55;
      add(new THREE.Mesh(rbox(1.9, 0.4, 0.14, 0.05), white), eng).position.set(1.6, 0.6, 0);

      // Luces de navegación (izquierda roja, derecha verde) y estroboscópicas
      const nav = glow(side === 1 ? '#ff3b3b' : '#35ff7a', 1.1, group);
      nav.position.set(9.95, tipY + 0.05, 8.45 * side);
      lights.nav.push(nav);
      const strobe = glow('#ffffff', 2.4, group);
      strobe.position.set(10.05, tipY + 0.05, 8.45 * side);
      lights.strobes.push(strobe);
    }
    // Deriva con franja y logo
    const fin = flat([[13.0, 0], [15.9, 0], [16.9, 3.3], [15.6, 3.3]], 0.12, navy, 0.04);
    fin.position.y = tailY(14) + 0.75;
    const finStripe = flat([[13.0, 0], [13.45, 0], [15.75, 3.3], [15.6, 3.3]], 0.13, accent, 0.04);
    finStripe.position.copy(fin.position);
    const logo = canvasTexture(256, 256, (g) => {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(128, 128, 118, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0f1b2d';
      g.font = `800 112px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('OQ', 128, 136);
    });
    for (const side of [1, -1]) {
      const decal = new THREE.Mesh(new THREE.CircleGeometry(0.55, 40), new THREE.MeshStandardMaterial({ map: logo, transparent: true, roughness: 0.4 }));
      decal.position.set(15.35, fin.position.y + 1.7, side * 0.115);
      if (side === -1) decal.rotation.y = Math.PI;
      group.add(decal);
    }
    // Tren de aterrizaje
    const strut = new THREE.CylinderGeometry(0.06, 0.06, 1, 10);
    const wheel = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 24).rotateX(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(0.15, 0.15, 0.21, 16).rotateX(Math.PI / 2);
    const gear = (s, z, top) => {
      const h = top + 2 - 0.3;
      const st = add(new THREE.Mesh(strut, metal), group);
      st.scale.y = h;
      st.position.set(s, -2 + 0.3 + h / 2, z);
      for (const dz of [-0.16, 0.16]) {
        add(new THREE.Mesh(wheel, tire), group).position.set(s, -1.7, z + dz);
        add(new THREE.Mesh(hub, metal), group).position.set(s, -1.7, z + dz);
      }
    };
    gear(2.2, 0, FY - R * 0.85);
    for (const z of [1.5, -1.5]) gear(8.4, z, FY - 0.6);
    // Balizas rojas (techo y panza) y luz de cola
    for (const [s, y] of [[7.8, FY + R + 0.03], [9.2, FY - R - 0.03]]) {
      const b = glow('#ff2a2a', 1.6, group);
      b.position.set(s, y, 0);
      lights.beacons.push(b);
    }
    const tailLight = glow('#ffffff', 0.9, group);
    tailLight.position.set(PLANE_LEN + 0.05, tailY(PLANE_LEN), 0);
    lights.nav.push(tailLight);

    const animate = (t, dt, night) => {
      fans.forEach((f, i) => (f.rotation.x += dt * (5 + i * 0.3)));
      const beacon = t % 1.1 < 0.14 ? 1 : 0;
      for (const b of lights.beacons) {
        b.material.opacity = beacon;
        b.scale.setScalar(b.userData.size * (night ? 1.3 : 0.8));
      }
      const ph = t % 1.4;
      const strobe = ph < 0.05 || (ph > 0.16 && ph < 0.21) ? 1 : 0;
      for (const s of lights.strobes) {
        s.material.opacity = strobe;
        s.scale.setScalar(s.userData.size * (night ? 1.4 : 0.8));
      }
      for (const s of lights.nav) {
        s.material.opacity = night ? 1 : 0.7;
        s.scale.setScalar(s.userData.size * (night ? 1.3 : 0.6));
      }
    };
    return { group, animate };
  }

  // Puente de desembarque: túnel acanalado, cabina con fuelle y pata con ruedas
  const ribTex = canvasTexture(
    256,
    64,
    (g, w, h) => {
      g.fillStyle = '#d9dee6';
      g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 8) {
        g.fillStyle = 'rgba(0,0,0,0.08)';
        g.fillRect(x, 0, 2, h);
      }
    },
    { repeat: [4, 1] },
  );
  const bridgeMat = std('#ffffff', { map: ribTex, roughness: 0.5, metalness: 0.3 });
  const bx0 = GLASS_X;
  const bx1 = NOSE_X + DOOR_S - 0.75;
  mesh(rbox(bx1 - bx0, 2.1, 1.5, 0.12), bridgeMat, (bx0 + bx1) / 2, 1.0, BRIDGE_Z);
  mesh(new THREE.BoxGeometry(bx1 - bx0 - 0.4, 0.5, 1.52), std('#16314f', { roughness: 0.1, metalness: 0.5 }), (bx0 + bx1) / 2, 1.3, BRIDGE_Z, scene, { cast: false });
  mesh(rbox(1.6, 2.2, 1.7, 0.12), bridgeMat, NOSE_X + DOOR_S, 1.05, BRIDGE_Z - 0.35);
  mesh(rbox(1.15, 2.0, 0.4, 0.08), std('#1f2937', { roughness: 0.9 }), NOSE_X + DOOR_S, 0.95, R + 0.12);
  mesh(new THREE.CylinderGeometry(0.11, 0.11, 2, 12), darkMetal, bx1 - 0.6, -1.0, BRIDGE_Z);
  mesh(rbox(0.9, 0.3, 0.5, 0.06), darkMetal, bx1 - 0.6, -1.75, BRIDGE_Z);
  const tireMat = std('#16181d', { roughness: 0.9 });
  for (const dz of [-0.28, 0.28]) mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 18).rotateX(Math.PI / 2), tireMat, bx1 - 0.6, -1.8, BRIDGE_Z + dz);

  // ---------- Tractor de equipaje ----------
  const tugPath = new THREE.CatmullRomCurve3(
    [[NOSE_X + 4, -4.4], [NOSE_X + 12, -4.6], [NOSE_X + 19.5, -7.5], [NOSE_X + 17, -13], [NOSE_X + 6, -13.4], [NOSE_X + 0.5, -9.5]].map(([x, z]) => new THREE.Vector3(x, -2, z)),
    true,
    'catmullrom',
    0.5,
  );
  const tugLen = tugPath.getLength();
  const tugTrain = [];
  let tugBeacon;
  {
    const yellow = std('#f2c230', { roughness: 0.5 });
    const tug = new THREE.Group();
    mesh(rbox(1.6, 0.6, 0.95, 0.12), yellow, 0, 0.5, 0, tug);
    mesh(rbox(0.7, 0.6, 0.85, 0.08), std('#1e293b', { roughness: 0.2, metalness: 0.4 }), -0.3, 1.05, 0, tug);
    tugBeacon = glow('#ffb020', 0.8, tug);
    tugBeacon.position.set(-0.3, 1.45, 0);
    tug.add(blob(2.2, 1.5, 1, 0.02));
    scene.add(tug);
    tugTrain.push({ obj: tug, offset: 0 });
    const bed = std('#64748b', { metalness: 0.5, roughness: 0.4 });
    for (let i = 0; i < 3; i++) {
      const cart = new THREE.Group();
      mesh(rbox(1.7, 0.12, 1.0, 0.04), bed, 0, 0.38, 0, cart);
      for (let j = 0; j < 4; j++) {
        const h = 0.32 + (j % 2) * 0.1;
        mesh(rbox(0.45, h, 0.32, 0.05), std(BAGS[(i * 4 + j) % BAGS.length], { roughness: 0.6 }), -0.5 + (j % 3) * 0.5, 0.44 + h / 2, j < 2 ? -0.2 : 0.22, cart);
      }
      cart.add(blob(2.2, 1.5, 1, 0.02));
      scene.add(cart);
      tugTrain.push({ obj: cart, offset: 1.9 * (i + 1) + 0.2 });
    }
    const wheelGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.12, 14).rotateX(Math.PI / 2);
    for (const { obj } of tugTrain) {
      for (const [dx, dz] of [[-0.5, -0.45], [-0.5, 0.45], [0.5, -0.45], [0.5, 0.45]]) mesh(wheelGeo, tireMat, dx, 0.17, dz, obj);
      obj.userData.dynamic = true;
      obj.traverse((o) => (o.castShadow = false));
    }
  }

  // ---------- Pasajeros (instanciados: una sola llamada de dibujo por pieza) ----------
  const bodyGeo = new THREE.CapsuleGeometry(0.15, 0.34, 2, 8);
  bodyGeo.translate(0, 0.33, 0);
  const headGeo = new THREE.SphereGeometry(0.115, 10, 8);
  headGeo.translate(0, 0.79, 0);
  const packGeo = rbox(0.24, 0.3, 0.12, 0.04, 1);
  const suitcaseGeo = mergeGeometries([
    rbox(0.26, 0.36, 0.14, 0.04, 1),
    new THREE.BoxGeometry(0.02, 0.22, 0.02).translate(-0.07, 0.29, 0).toNonIndexed(),
    new THREE.BoxGeometry(0.02, 0.22, 0.02).translate(0.07, 0.29, 0).toNonIndexed(),
    new THREE.BoxGeometry(0.16, 0.02, 0.03).translate(0, 0.4, 0).toNonIndexed(),
  ]);
  const makeInst = (geo) => {
    const m = new THREE.InstancedMesh(geo, std('#ffffff', { roughness: 0.75 }), MAX_AGENTS);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = false;
    m.receiveShadow = true;
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  const bodies = makeInst(bodyGeo);
  const heads = makeInst(headGeo);
  const packs = makeInst(packGeo);
  const cases = makeInst(suitcaseGeo);
  const shadows = new THREE.InstancedMesh(blobGeo, blobMat, MAX_AGENTS);
  shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shadows.frustumCulled = false;
  shadows.renderOrder = 1;
  scene.add(shadows);
  const instanced = [bodies, heads, packs, cases, shadows];
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const tmpColor = new THREE.Color('#ffffff');
  for (let i = 0; i < MAX_AGENTS; i++) {
    for (const im of instanced) {
      im.setMatrixAt(i, ZERO);
      if (im !== shadows) im.setColorAt(i, tmpColor);
    }
  }
  const PACK_OFF = new THREE.Matrix4().makeTranslation(0, 0.47, -0.17);
  const CASE_IDLE = new THREE.Matrix4().makeTranslation(0.27, 0.2, 0.02);
  const CASE_WALK = new THREE.Matrix4().makeTranslation(0.2, 0.2, -0.34).multiply(new THREE.Matrix4().makeRotationX(0.45));
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ';
  const tmpM = new THREE.Matrix4();

  const freeIdx = Array.from({ length: MAX_AGENTS }, (_, i) => MAX_AGENTS - 1 - i);
  const agents = new Set();
  const queueAgents = [];
  let seq = 0;
  let deplaned = 0;

  function release(a) {
    for (const im of instanced) {
      im.setMatrixAt(a.idx, ZERO);
      im.instanceMatrix.needsUpdate = true;
    }
    agents.delete(a);
    freeIdx.push(a.idx);
  }
  const acquire = (at) => {
    if (!freeIdx.length) {
      for (const a of agents) {
        if (a.mode === 'exit') {
          release(a);
          break;
        }
      }
      if (!freeIdx.length) return null;
    }
    const idx = freeIdx.pop();
    seq++;
    const a = {
      idx,
      pos: at.clone(),
      goal: at.clone(),
      via: [],
      mode: 'queue',
      late: false,
      lateMix: 0,
      base: new THREE.Color(CLOTHES[(seq * 7) % CLOTHES.length]),
      bag: seq % 5 === 0 ? 0 : seq % 3 === 0 ? 1 : 2, // nada, mochila o maleta con ruedas
      yaw: -Math.PI / 2,
      idleYaw: 0,
      phase: Math.random() * 6,
      scale: 0,
      fading: false,
    };
    heads.setColorAt(idx, tmpColor.set(SKIN[(seq * 5) % SKIN.length]));
    packs.setColorAt(idx, tmpColor.set(BAGS[seq % BAGS.length]));
    cases.setColorAt(idx, tmpColor.set(BAGS[(seq * 3) % BAGS.length]));
    bodies.setColorAt(idx, a.base);
    for (const im of [bodies, heads, packs, cases]) im.instanceColor.needsUpdate = true;
    agents.add(a);
    return a;
  };
  // Un pasajero nuevo baja del avión y cruza el puente
  const spawn = () => {
    const a = acquire(DOOR);
    if (!a) return null;
    deplaned++;
    a.via = [CAB, BRIDGE_END];
    return a;
  };
  const sendToExit = (a, booth) => {
    a.mode = 'exit';
    a.late = false;
    if (booth) {
      const lane = booth.x + 0.36;
      a.via = [V(lane, STAND_Z - 0.1), V(lane, -7.6), V(EXIT.x + 0.4, -8.3)];
    } else {
      // sale de la fila sin pasar por ventanilla (solo si la vista se desincroniza)
      a.via = [V(-LANE_HALF - 1.2, a.pos.z), V(-LANE_HALF - 1.2, -7.6)];
    }
    a.goal.copy(EXIT);
  };

  // ---------- Sincronización con la simulación ----------
  const stateOf = (b) => (b.busy ? (b.open ? 'busy' : 'closing') : b.open ? 'idle' : 'closed');
  let firstSync = true;
  let simSpeed = 1;
  const slotTmp = new THREE.Vector3();

  let lastSyncAt = 0;
  function sync(snap, { minPerSec = 1 } = {}) {
    simSpeed = minPerSec;
    lastSyncAt = performance.now();
    barFills.instanceMatrix.needsUpdate = true;
    snap.booths.forEach((sb, k) => {
      const b = booths[k];
      // una barra de progreso que retrocede indica que terminó uno y empezó otro
      const restarted = sb.busy && b.prevBusy && sb.progress < b.prevProgress - 1e-6;
      if (b.agent && (!sb.busy || restarted)) {
        sendToExit(b.agent, b);
        b.agent = null;
      }
      if (sb.busy && !b.agent) {
        let a = queueAgents.shift();
        if (a && a.via.length) {
          // todavía no llegaba a su carril: sigue por el pasillo lateral
          a.via = a.pos.x > CAB.x - 0.4 ? [CAB, BRIDGE_END] : a.pos.x > BRIDGE_END.x + 0.01 ? [BRIDGE_END] : [];
          a.via.push(V(SIDE_X, FRONT_Z));
        } else if (a) {
          // de la cabeza de la fila al pasillo delantero
          a.via.push(laneSlot(0), V(-LANE_HALF + 0.2, FRONT_Z));
        } else {
          // llega directo del avión: pasillo lateral y luego el delantero
          a = spawn();
          a?.via.push(V(SIDE_X, FRONT_Z));
        }
        if (a) {
          a.via.push(V(b.x - 0.05, FRONT_Z));
          a.mode = 'booth';
          a.late = false;
          a.goal.set(b.x - 0.05, 0, STAND_Z);
          a.idleYaw = Math.PI; // de cara al oficial
          b.agent = a;
        }
      }
      b.prevBusy = sb.busy;
      b.prevProgress = sb.progress;
      b.progress = sb.progress;
      const state = stateOf(sb);
      if (state !== b.state) paintBooth(b, state);
      const showBar = state === 'busy' || state === 'closing';
      barFills.setMatrixAt(k, showBar ? mTmp.makeScale(Math.max(0.001, sb.progress), 1, 1).setPosition(b.x - 0.45, 2.15 - 0.31, BOOTH_Z + 0.1 + 0.002) : ZERO_M);
    });

    const n = Math.min(snap.queue.length, MAX_QUEUE_AGENTS);
    while (queueAgents.length > n) sendToExit(queueAgents.shift(), null);
    while (queueAgents.length < n) {
      // entra a su carril por el lado derecho, que está abierto
      const a = spawn();
      if (!a) break;
      const tail = laneSlot(queueAgents.length, slotTmp);
      a.via.push(V(SIDE_X, tail.z), V(LANE_HALF + 0.3, tail.z));
      queueAgents.push(a);
    }
    queueAgents.forEach((a, i) => {
      a.late = snap.queue[i] > wqMax;
      laneSlot(i, a.goal);
      a.idleYaw = Math.floor(i / PER_LANE) % 2 === 0 ? -Math.PI / 2 : Math.PI / 2; // mirando hacia el frente de la fila
    });

    // reloj de pared: hora simulada
    hourHand.rotation.z = -((snap.t % 12) / 12) * Math.PI * 2;
    minuteHand.rotation.z = -(snap.t % 1) * Math.PI * 2;

    if (firstSync || reduced) {
      // arranque (o movimiento reducido): todos aparecen ya en su lugar
      firstSync = false;
      for (const a of [...agents]) {
        if (a.mode === 'exit') {
          release(a);
          continue;
        }
        a.via = [];
        a.pos.copy(a.goal);
        a.yaw = a.idleYaw;
        a.scale = 1;
        a.lateMix = a.late ? 1 : 0;
        bodies.setColorAt(a.idx, tmpColor.copy(a.base).lerp(LATE, a.lateMix));
      }
      bodies.instanceColor.needsUpdate = true;
      updateAgents(0);
    }
    if (!running) render();
  }

  // ---------- Movimiento ----------
  function updateAgents(dt) {
    // caminan más rápido cuando la simulación va acelerada
    const speed = 4.2 * Math.max(1, simSpeed) ** 0.6;
    let colorsChanged = false;
    for (const a of [...agents]) {
      const p = a.pos;
      let budget = speed * dt;
      let moving = false;
      let targetYaw = a.idleYaw;
      while (budget > 0) {
        const target = a.via[0] ?? a.goal;
        const dx = target.x - p.x;
        const dz = target.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 1e-4) {
          if (!a.via.length) break;
          a.via.shift();
          continue;
        }
        const stepLen = Math.min(d, budget);
        p.x += (dx / d) * stepLen;
        p.z += (dz / d) * stepLen;
        budget -= stepLen;
        targetYaw = Math.atan2(dx, dz);
        moving = true;
      }
      a.yaw += wrapAngle(targetYaw - a.yaw) * Math.min(1, dt * 10);

      // aparece con un pequeño rebote y se desvanece al salir
      const arrived = !a.via.length && Math.hypot(a.goal.x - p.x, a.goal.z - p.z) < 1e-3;
      if (a.mode === 'exit' && arrived) a.fading = true;
      if (a.fading) {
        a.scale -= dt * 4;
        if (a.scale <= 0) {
          release(a);
          continue;
        }
      } else if (a.scale < 1) a.scale = Math.min(1, a.scale + dt * 3.5);

      // se pone rojo, de a poco, cuando su espera supera el límite
      const lateTarget = a.late ? 1 : 0;
      if (a.lateMix !== lateTarget) {
        a.lateMix += Math.sign(lateTarget - a.lateMix) * Math.min(Math.abs(lateTarget - a.lateMix), dt * 2.5);
        bodies.setColorAt(a.idx, tmpColor.copy(a.base).lerp(LATE, a.lateMix));
        colorsChanged = true;
      }

      if (moving) a.phase += dt * speed * 3.4;
      const bob = moving ? Math.abs(Math.sin(a.phase)) * 0.05 : 0;
      const sway = moving ? Math.sin(a.phase) * 0.06 : 0;
      dummy.position.set(p.x, bob, p.z);
      dummy.rotation.set(0, a.yaw, sway);
      dummy.scale.setScalar(Math.max(0, a.fading ? a.scale : easeOutBack(a.scale)));
      dummy.updateMatrix();
      bodies.setMatrixAt(a.idx, dummy.matrix);
      heads.setMatrixAt(a.idx, dummy.matrix);
      packs.setMatrixAt(a.idx, a.bag === 1 ? tmpM.multiplyMatrices(dummy.matrix, PACK_OFF) : ZERO);
      cases.setMatrixAt(a.idx, a.bag === 2 ? tmpM.multiplyMatrices(dummy.matrix, moving ? CASE_WALK : CASE_IDLE) : ZERO);
      const sh = Math.max(0, a.scale) * 0.62;
      shadows.setMatrixAt(a.idx, tmpM.makeScale(sh, 1, sh).setPosition(p.x, 0.008, p.z));
    }
    // solo se dibujan las instancias en uso (las libres no cuestan nada)
    let used = 0;
    for (const a of agents) used = Math.max(used, a.idx + 1);
    for (const im of instanced) {
      im.count = used;
      im.instanceMatrix.needsUpdate = true;
    }
    if (colorsChanged) bodies.instanceColor.needsUpdate = true;
  }

  // ---------- Animación de ambiente ----------
  let time = 0;
  let night = false;
  let taxiT = 0.35;
  let tugU = 0;
  const tmpV = new THREE.Vector3();
  const tmpT = new THREE.Vector3();

  function animateWorld(dt) {
    plane.animate(time, dt, night);
    taxi.animate(time + 0.4, dt, night);
    // avión rodando por la calle de rodaje, de derecha a izquierda
    taxiT = (taxiT + dt / 55) % 1;
    taxi.group.position.set(90 - taxiT * 170, 0, -24);
    // tractor de equipaje dando vueltas alrededor del avión
    tugU = (tugU + (dt * 2.4) / tugLen) % 1;
    for (const { obj, offset } of tugTrain) {
      const u = (((tugU - offset / tugLen) % 1) + 1) % 1;
      tugPath.getPointAt(u, tmpV);
      tugPath.getTangentAt(u, tmpT);
      obj.position.copy(tmpV);
      obj.rotation.y = Math.atan2(tmpT.x, tmpT.z) - Math.PI / 2;
    }
    tugBeacon.material.opacity = 0.3 + 0.7 * Math.max(0, Math.sin(time * 7));
    towerBeacon.material.opacity = (Math.sin(time * 2.2) + 1) / 2;
    // ventanillas libres: anillo que late en el piso; oficiales que se mueven un poco
    for (const b of booths) {
      const idle = b.state === 'idle';
      b.ringV += ((idle ? 1 : 0) - b.ringV) * Math.min(1, dt * 6);
      const pulse = (time * 1.1 + b.k * 0.13) % 1;
      const rs = 1 + pulse * 0.7;
      rings.setMatrixAt(b.k, b.ringV > 0.01 ? mTmp.makeScale(rs, 1, rs).setPosition(b.x - 0.05, 0.012, STAND_Z) : ZERO_M);
      // con mezcla aditiva, oscurecer el color equivale a bajar la opacidad
      rings.setColorAt(b.k, cTmp.copy(RING_COLOR).multiplyScalar(b.ringV * (1 - pulse) * 0.9));
      // oficial: gira y respira un poco; no está si la ventanilla está cerrada
      if (b.state === 'closed') mTmp.copy(ZERO_M);
      else mTmp.makeRotationY(Math.sin(time * 0.7 + b.k) * (idle ? 0.35 : 0.08)).setPosition(b.x - 0.175, Math.sin(time * 2 + b.k) * 0.008, BOOTH_Z - 0.55);
      offBody.setMatrixAt(b.k, mTmp);
      offHead.setMatrixAt(b.k, mTmp);
      offCap.setMatrixAt(b.k, mTmp);
    }
    for (const m of [rings, offBody, offHead, offCap]) m.instanceMatrix.needsUpdate = true;
    rings.instanceColor.needsUpdate = true;
  }

  function clear() {
    for (const a of [...agents]) release(a);
    queueAgents.length = 0;
    booths.forEach((b) => {
      b.agent = null;
      b.prevBusy = false;
      b.prevProgress = 0;
    });
    if (!running) render();
  }

  // ---------- Tema: día (claro) / noche (oscuro) ----------
  const applyTheme = () => {
    night = document.documentElement.classList.contains('dark');
    const th = night ? THEMES.night : THEMES.day;
    skyMat.uniforms.top.value.set(th.skyTop);
    skyMat.uniforms.bottom.value.set(th.skyBottom);
    scene.fog = new THREE.Fog(th.fog, 80, 320);
    stars.visible = th.stars > 0;
    grassMat.color.set(th.grass);
    apronMat.color.set(th.apron);
    floorMat.color.set(th.floor);
    carpetMat.color.set(th.carpet);
    sun.color.set(th.sun);
    sun.intensity = th.sunI;
    hemi.color.set(th.hemiSky);
    hemi.groundColor.set(th.hemiGround);
    hemi.intensity = th.hemiI;
    scene.environmentIntensity = th.env;
    renderer.toneMappingExposure = th.exposure;
    livery.fuselage.emissiveIntensity = th.glow * 1.4;
    // de noche la terminal «se ilumina» por dentro sin luces extra
    floorMat.emissive.set('#5a4630');
    floorMat.emissiveIntensity = th.interior * 0.45;
    poleGlows.forEach((g) => (g.visible = night));
    animateWorld(0);
    if (!running) render();
  };
  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  // ---------- Cámara ----------
  let tween = null;
  let view = 'general';
  const framed = (v) => {
    const pos = new THREE.Vector3(...v.pos);
    const target = new THREE.Vector3(...v.target);
    // en pantallas angostas la cámara se aleja para que entre la escena
    const aspect = camera.aspect || 2;
    if (aspect < 1.9) pos.sub(target).multiplyScalar(Math.min(1.8, 1.9 / aspect)).add(target);
    return { pos, target };
  };
  const goTo = (v, duration = 1.1) => {
    const { pos, target } = framed(v);
    if (reduced || !running || duration === 0) {
      tween = null;
      camera.position.copy(pos);
      controls.target.copy(target);
      controls.update();
      if (!running) render();
      return;
    }
    tween = { fromPos: camera.position.clone(), fromTarget: controls.target.clone(), pos, target, t: 0, duration };
  };

  // ---------- Tooltip sobre ventanillas y avión ----------
  const tooltip = document.createElement('div');
  tooltip.className = 'pointer-events-none absolute z-[3] whitespace-nowrap rounded-lg bg-[#0f1b2d]/90 px-2.5 py-1.5 text-xs text-white shadow-lg backdrop-blur-sm';
  tooltip.hidden = true;
  container.appendChild(tooltip);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hoverEvent = null;
  renderer.domElement.addEventListener('pointermove', (e) => {
    hoverEvent = e.buttons ? null : e;
    if (!running) updateHover();
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    hoverEvent = null;
    updateHover();
  });
  controls.addEventListener('start', () => {
    tween = null;
    hoverEvent = null;
    updateHover();
  });
  controls.addEventListener('change', () => {
    if (!running) render();
  });
  function updateHover() {
    const hit = hoverEvent && (() => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((hoverEvent.clientX - rect.left) / rect.width) * 2 - 1, -((hoverEvent.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(hitTargets, false)[0];
    })();
    if (!hit) {
      tooltip.hidden = true;
      renderer.domElement.style.cursor = '';
      return;
    }
    const d = hit.object.userData;
    if (d.kind === 'booth') {
      const b = booths[d.k];
      const busy = b.state === 'busy' || b.state === 'closing';
      tooltip.innerHTML = `<b>Ventanilla ${d.k + 1}</b> · ${STATE[b.state].label}${busy ? ` · trámite al ${Math.round(b.progress * 100)} %` : ''}`;
    } else {
      tooltip.innerHTML = `<b>Vuelo OQ 180</b> · desembarcando · ${deplaned.toLocaleString('es')} pasajeros`;
    }
    tooltip.hidden = false;
    const rect = renderer.domElement.getBoundingClientRect();
    const x = hoverEvent.clientX - rect.left;
    const y = hoverEvent.clientY - rect.top;
    tooltip.style.left = `${Math.max(8, Math.min(x + 14, rect.width - tooltip.offsetWidth - 8))}px`;
    tooltip.style.top = `${Math.max(8, y - 38)}px`;
    renderer.domElement.style.cursor = 'help';
  }

  // ---------- Bucle ----------
  let raf = 0;
  let last = 0;
  let running = false;
  let inView = false;
  let active = true;
  let introDone = reduced;

  // Resolución adaptable: si el equipo no llega a ~45 fps baja la nitidez, y la recupera si sobra
  let perfAcc = 0;
  let perfFrames = 0;
  let perfGood = 0;
  const adaptResolution = (rawDt) => {
    perfAcc += rawDt;
    if (++perfFrames < 45) return;
    const avg = perfAcc / perfFrames;
    perfAcc = perfFrames = 0;
    let next = dpr;
    if (avg > 1 / 45 && dpr > 0.6) {
      next = Math.max(0.6, dpr - 0.2);
      perfGood = 0;
    } else if (avg < 1 / 58 && dpr < MAX_DPR && ++perfGood >= 3) {
      next = Math.min(MAX_DPR, dpr + 0.2);
      perfGood = 0;
    }
    if (next !== dpr) {
      dpr = next;
      renderer.setPixelRatio(dpr);
      renderer.setSize(container.clientWidth, container.clientHeight, false);
    }
  };

  function tick(now) {
    // con la simulación en pausa basta con 30 fps para el ambiente
    const idle = now - lastSyncAt > 250 && !tween && !hoverEvent;
    if (idle && now - last < 30) {
      raf = requestAnimationFrame(tick);
      return;
    }
    const rawDt = (now - last) / 1000;
    const dt = Math.min(0.05, rawDt);
    last = now;
    if (!idle) adaptResolution(rawDt); // a 30 fps a propósito no cuenta como lentitud
    time += dt;
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / tween.duration);
      const e = easeInOut(tween.t);
      camera.position.lerpVectors(tween.fromPos, tween.pos, e);
      controls.target.lerpVectors(tween.fromTarget, tween.target, e);
      if (tween.t >= 1) tween = null;
    }
    controls.update(dt);
    updateAgents(dt);
    animateWorld(dt);
    if (hoverEvent) updateHover();
    render();
    raf = requestAnimationFrame(tick);
  }
  const updateLoop = () => {
    const run = active && inView && !document.hidden && !reduced;
    if (run && !running) {
      running = true;
      last = performance.now();
      if (!introDone) {
        // presentación: la cámara baja desde la plataforma hasta la vista general
        introDone = true;
        const { pos, target } = framed(INTRO);
        camera.position.copy(pos);
        controls.target.copy(target);
        goTo(CAMERAS[view], 3.4);
      }
      raf = requestAnimationFrame(tick);
    } else if (!run && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  };
  const io = new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    updateLoop();
  });
  io.observe(container);
  const onVisibility = () => updateLoop();
  document.addEventListener('visibilitychange', onVisibility);

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!tween && introDone) goTo(CAMERAS[view], 0);
    else if (!running) render();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  function render() {
    renderer.render(scene, camera);
  }

  // ---------- Optimización: fusionar lo estático ----------
  // Cientos de piezas fijas (postes, escritorios, ventanas...) pasan a ser una malla por
  // material: de ~900 llamadas de dibujo a unas pocas decenas. Lo que se mueve queda aparte.
  function mergeStatic(root = scene) {
    scene.updateMatrixWorld(true);
    const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const buckets = new Map();
    const visit = (o) => {
      if ((o !== root && o.userData.dynamic) || !o.visible) return;
      if (o.isMesh && !o.isInstancedMesh && !Array.isArray(o.material) && o.material.visible !== false && o !== sky) {
        const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(o);
      }
      o.children.forEach(visit);
    };
    visit(scene);
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.morphAttributes = {};
        g.clearGroups();
        return g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, m.matrixWorld));
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const first = list[0];
      const out = new THREE.Mesh(merged, first.material);
      out.castShadow = first.castShadow;
      out.receiveShadow = first.receiveShadow;
      out.renderOrder = first.renderOrder;
      out.matrixAutoUpdate = false;
      for (const m of list) m.removeFromParent();
      root.add(out);
    }
  }
  mergeStatic();
  // lo que se mueve como una sola pieza también se fusiona por dentro
  for (const g of [taxi.group, ...tugTrain.map((t) => t.obj)]) mergeStatic(g);
  // El mapa de sombras solo incluye lo estático: se calcula una vez y no en cada fotograma
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  applyTheme();
  resize();
  if (!introDone) {
    const { pos, target } = framed(INTRO);
    camera.position.copy(pos);
    controls.target.copy(target);
    controls.update();
  }
  // compila los shaders en segundo plano antes de mostrar la escena (evita el tirón inicial)
  const ready = (renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve()).catch(() => {}).then(() => {
    render();
    renderer.domElement.classList.remove('opacity-0');
  });

  return {
    ready,
    sync,
    clear,
    setView(name) {
      view = name in CAMERAS ? name : 'general';
      controls.autoRotate = view === 'tour';
      goTo(CAMERAS[view]);
    },
    setActive(v) {
      active = v;
      updateLoop();
      if (v) resize();
    },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      controls.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      tooltip.remove();
    },
  };
}
