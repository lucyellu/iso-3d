import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js";
import { FontLoader } from "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/geometries/TextGeometry.js";

const stage = document.getElementById("bowlStage");
const mount = document.getElementById("gameCanvas");
const scoreEl = document.getElementById("score");
const bestWordEl = document.getElementById("bestWord");
const scoreProgress = document.getElementById("scoreProgress");
const scoreGoal = document.getElementById("scoreGoal");
const slotsEl = document.getElementById("wordSlots");
const serveButton = document.getElementById("serveButton");
const statusEl = document.getElementById("gameStatus");
const toast = document.getElementById("toast");

const TAU = Math.PI * 2;
const GRID = 74;
const FIELD_W = 5.55;
const FIELD_D = 4.35;
const MILK_Y = 0.16;
const colors = ["#e4885e", "#efaa82", "#ddbe5d", "#a5c7b0", "#bdb8dc", "#de8d72"];
const letterValues = { A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10 };
const bag = "AAABBCCCDDDEEEEEEEEEFFGGGHHHIIIIIIIIJKLLLLMMNNNNNNOOOOOOOOPPQRRRRRRSSSSSTTTTTTUUUVVWWXYYZ";
const easyWords = new Set("ACE ADD ADO AGE AID AIM AIR ALE ALL AMP AND ANT ANY ARE ART ASK ATE AWE BAD BAG BAN BAR BAT BAY BED BEE BIG BIN BIT BOB BOX BOY BUN BUS BUT BUY CAB CAN CAP CAR CAT COD COLD COME CONE COOK COOL CORN COT COW CUBE CUP CUT DAY DID DIE DIG DIM DIN DIP DOG DOT DRY DUE EAR EAT EGG EGO ELF ELM END ERA EVE EYE FAR FAT FED FEE FEW FIG FIN FIR FIT FIX FLY FOG FOR FOX FROG FUN FUR GAG GAS GEL GEM GET GIG GIN GOD GOLD GONE GOOD GUM HAT HAY HEN HER HID HIM HIP HIS HIT HOG HOP HOT HOW ICE ILL JAM JAR JAW JET JOB JOG JOY KEY KID KIN KIT LAB LAG LAP LAW LEG LET LID LIE LIP LOG LOT LOW MAD MAN MAP MAY MEN MET MIX MOB MOM MOON MORE MUG NAP NET NEW NOD NOT NOW OAK OAT ODD OFF OIL OLD ONE OPT ORB ORE OUR OUT OVEN OWN PAD PAN PAY PEA PEG PEN PET PIE PIG PIN PIT PLY POD POP POT RAG RAN RAP RAT RAW RED RIB RID RIG RIP ROB ROD ROLL ROPE ROW RUB RUN SAD SAG SAP SAY SEA SEE SET SEW SHE SHY SIP SIT SIX SKY SLIP SLOW SNAP SNOW SOFT SON SOP SOW SOY SPAW SPOON STAR STAY STEM STEP STIR STOP SUN TAB TAG TAN TAP TEA TEN THE TIE TIN TIP TOAD TOY TRY TUB TUG TWO USE VAN VET VEX WAR WAS WAY WEB WET WHO WHY WIN WIRE WISH WOK WON WOW YAK YAM YAP YET YOU ZAP ZOO APPLE BERRY BOWL BREAD BRIGHT CEREAL CHEER CHEW CHOMP COCOA CRISP DREAM EATEN FLAKE FLOAT FRESH HAPPY HONEY LEMON MILK MINT OATMEAL PEACH POUR RICE ROUND SPOON SWEET TOAST YUMMY".split(" "));
["AT", "BE", "DO", "GO", "HE", "IF", "IN", "IS", "IT", "ME", "MY", "NO", "OF", "OH", "ON", "OR", "SO", "TO", "UP", "US", "WE"].forEach((word) => easyWords.add(word));

let renderer, scene, camera, raycaster, milkMesh, milkGeometry, milkMaterial, milkVolume, oatFont, oatBump;
let letters = [], marshmallows = [], selected = [], ripples = [], particles = [];
let simA, simB, simVelocity, simTexture, previousPositions;
let score = 128, bestWord = "OATMEAL", time = 0, lastTime = performance.now(), soundOn = true, audioContext;
let pointer = new THREE.Vector2();

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function setupRenderer() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (_) {
    statusEl.textContent = "This bowl needs WebGL enabled to pour the 3D version.";
    statusEl.className = "game-status warn";
    return false;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(mount.clientWidth, mount.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = true;
  mount.appendChild(renderer.domElement);
  return true;
}

function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf9f1e3);
  scene.fog = new THREE.FogExp2(0xfaf3e5, .024);
  camera = new THREE.PerspectiveCamera(31, mount.clientWidth / mount.clientHeight, .1, 100);
  camera.position.set(0, 7.7, 8.7);
  camera.lookAt(0, -.22, 0);
  raycaster = new THREE.Raycaster();

  scene.add(new THREE.HemisphereLight(0xfffbf0, 0x778776, 1.25));
  const key = new THREE.DirectionalLight(0xffe5bd, 4.4);
  key.position.set(-5.5, 9.5, 4.5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.00025; key.shadow.normalBias = .025; key.shadow.camera.near = 1; key.shadow.camera.far = 24; key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7; scene.add(key);
  const fill = new THREE.DirectionalLight(0xd8e8ff, .9); fill.position.set(5, 5, -4); scene.add(fill);
  const warm = new THREE.PointLight(0xf6b287, 1.1, 12); warm.position.set(-3, 2, -2); scene.add(warm);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(8, 64), new THREE.MeshStandardMaterial({ color: 0xf8efdf, roughness: .95 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -2.28; ground.receiveShadow = true; scene.add(ground);
  createBowl();
  createMilk();
  createMarshmallows();
}

function createBowl() {
  const profile = [
    new THREE.Vector2(1.85, -2.04), new THREE.Vector2(2.38, -1.82), new THREE.Vector2(2.78, -1.18),
    new THREE.Vector2(3.04, -.22), new THREE.Vector2(3.17, .54), new THREE.Vector2(3.18, .70),
  ];
  const geometry = new THREE.LatheGeometry(profile, 96);
  const material = new THREE.MeshPhysicalMaterial({ color: 0xf3e7d1, roughness: .25, metalness: .02, clearcoat: .38, clearcoatRoughness: .2, side: THREE.DoubleSide });
  const bowl = new THREE.Mesh(geometry, material);
  bowl.castShadow = true; bowl.receiveShadow = true; scene.add(bowl);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.16, .105, 18, 96), new THREE.MeshPhysicalMaterial({ color: 0xd6b98f, roughness: .22, clearcoat: .3 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = .69; rim.castShadow = true; scene.add(rim);
}

function createMilk() {
  milkGeometry = new THREE.BufferGeometry();
  const positions = [], indices = [], uvs = [];
  for (let z = 0; z <= GRID; z++) for (let x = 0; x <= GRID; x++) {
    const px = (x / GRID - .5) * FIELD_W, pz = (z / GRID - .5) * FIELD_D;
    positions.push(px, MILK_Y, pz); uvs.push(x / GRID, z / GRID);
  }
  for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) { const a = z * (GRID + 1) + x, b = a + 1, c = a + GRID + 1, d = c + 1; indices.push(a, c, b, b, c, d); }
  milkGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  milkGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  milkGeometry.setIndex(indices);
  milkGeometry.computeVertexNormals();
  // Milk is opaque and warm so it reads as a creamy liquid rather than clear water.
  milkMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffefcf, roughness: .34, metalness: 0, transmission: 0, thickness: 0, clearcoat: .28, clearcoatRoughness: .25, sheen: .22, sheenColor: new THREE.Color(0xffe9c5), sheenRoughness: .42, attenuationColor: new THREE.Color(0xffd8a7), attenuationDistance: 1.8, side: THREE.DoubleSide });
  milkMaterial.bumpMap = makeMilkBumpTexture(); milkMaterial.bumpScale = .045;
  milkMesh = new THREE.Mesh(milkGeometry, milkMaterial); milkMesh.receiveShadow = true; milkMesh.castShadow = true; scene.add(milkMesh);

  milkVolume = new THREE.Mesh(new THREE.CylinderGeometry(2.72, 2.34, .32, 96, 1, false), new THREE.MeshPhysicalMaterial({ color: 0xf0d6aa, roughness: .6, metalness: 0, transmission: 0, sheen: .16, sheenColor: new THREE.Color(0xffe5bb), side: THREE.DoubleSide }));
  milkVolume.position.y = .02; milkVolume.receiveShadow = true; scene.add(milkVolume);

  const foam = new THREE.Mesh(new THREE.TorusGeometry(2.65, .055, 8, 100), new THREE.MeshBasicMaterial({ color: 0xfffdf6, transparent: true, opacity: .72 }));
  foam.rotation.x = Math.PI / 2; foam.position.y = MILK_Y + .01; scene.add(foam);
  simA = new Float32Array((GRID + 1) * (GRID + 1)); simB = new Float32Array(simA.length); simVelocity = new Float32Array(simA.length); previousPositions = new Float32Array(simA.length);
  simTexture = makeMilkTexture();
  oatBump = makeOatBumpTexture();
}

function heartShape() {
  const shape = new THREE.Shape(); shape.moveTo(0, -.18); shape.bezierCurveTo(-.55, -.58, -1.0, .08, -.48, .47); shape.bezierCurveTo(-.2, .68, 0, .37, 0, .37); shape.bezierCurveTo(0, .37, .2, .68, .48, .47); shape.bezierCurveTo(1.0, .08, .55, -.58, 0, -.18); return shape;
}

function starShape(points = 5) {
  const shape = new THREE.Shape(); for (let i = 0; i < points * 2; i++) { const radius = i % 2 ? .22 : .52, angle = -Math.PI / 2 + i * Math.PI / points; const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius; if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y); } shape.closePath(); return shape;
}

function diamondShape() { const shape = new THREE.Shape(); shape.moveTo(0, .58); shape.lineTo(.42, 0); shape.lineTo(0, -.58); shape.lineTo(-.42, 0); shape.closePath(); return shape; }

function moonShape() {
  const shape = new THREE.Shape(); shape.absarc(0, 0, .52, Math.PI * .5, Math.PI * 1.5, false); shape.bezierCurveTo(.05, -.4, .05, .4, 0, .52); shape.closePath(); return shape;
}

function horseshoeShape() {
  const shape = new THREE.Shape(); shape.absarc(0, 0, .52, Math.PI * .15, Math.PI * .85, false); shape.lineTo(.29, .16); shape.absarc(0, 0, .27, Math.PI * .84, Math.PI * .16, true); shape.lineTo(.52, .0); shape.closePath(); return shape;
}

function cloverShape() {
  const shape = new THREE.Shape(); const lobes = 4; for (let i = 0; i <= 32; i++) { const a = i / 32 * TAU, r = .32 + .14 * Math.cos(lobes * a); const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y); } shape.closePath(); return shape;
}

function rainbowBandShape(radius, thickness) {
  const shape = new THREE.Shape(); shape.moveTo(-radius, -.08); shape.bezierCurveTo(-radius * .92, radius * 1.1, radius * .92, radius * 1.1, radius, -.08); shape.lineTo(radius - thickness, -.08); shape.bezierCurveTo((radius - thickness) * .9, radius * .76, -(radius - thickness) * .9, radius * .76, -radius + thickness, -.08); shape.closePath(); return shape;
}

function createRainbowCharm() {
  const group = new THREE.Group(); const bands = [[.58, .12, 0xf58f83], [.46, .12, 0xf3c85e], [.34, .12, 0x8ec7b5]];
  bands.forEach(([radius, thickness, color], i) => { const geometry = new THREE.ExtrudeGeometry(rainbowBandShape(radius, thickness), { depth: .13, bevelEnabled: true, bevelThickness: .035, bevelSize: .025, bevelSegments: 3, curveSegments: 12 }); geometry.center(); const mesh = new THREE.Mesh(geometry, makeMarshmallowMaterial(color)); mesh.rotation.x = -Math.PI / 2; mesh.position.z = i * .025; group.add(mesh); });
  return group;
}

function createPotOfGoldCharm() {
  const group = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(.32, .42, .2, 18), new THREE.MeshPhysicalMaterial({ color: 0x544a61, roughness: .48, clearcoat: .28, clearcoatRoughness: .22 })); pot.position.y = .1; group.add(pot);
  const goldMaterial = new THREE.MeshPhysicalMaterial({ color: 0xf1c75b, roughness: .27, metalness: .16, clearcoat: .32, clearcoatRoughness: .2 });
  [[-.17, .22], [0, .24], [.17, .22]].forEach(([x, z]) => { const coin = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 8), goldMaterial); coin.scale.y = .35; coin.position.set(x, .24, z - .22); group.add(coin); });
  return group;
}

function createCharmMesh(type, shape, color) {
  if (type === "rainbow") return createRainbowCharm();
  if (type === "pot") return createPotOfGoldCharm();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: .15, bevelEnabled: true, bevelThickness: .07, bevelSize: .045, bevelSegments: 3, curveSegments: 12 }); geometry.center();
  const mesh = new THREE.Mesh(geometry, makeMarshmallowMaterial(color)); mesh.rotation.x = -Math.PI / 2; return mesh;
}

function makeMarshmallowMaterial(color) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: .48, metalness: 0, clearcoat: .3, clearcoatRoughness: .34, sheen: .28, sheenColor: new THREE.Color(0xfff4e9), sheenRoughness: .48, bumpMap: makeMarshmallowBumpTexture(), bumpScale: .035 });
}

function createMarshmallows() {
  const charms = [
    ["rainbow", null, 0xffffff], ["star", starShape(), 0xf4d36e], ["pot", null, 0xffffff], ["clover", cloverShape(), 0xf3a7a3],
    ["heart", heartShape(), 0xf2a6b6], ["moon", moonShape(), 0xf3cf67], ["horseshoe", horseshoeShape(), 0x9ca8dc],
    ["diamond", diamondShape(), 0x82c6b5], ["star", starShape(6), 0xf5cf78], ["heart", heartShape(), 0x9fcdb7], ["diamond", diamondShape(), 0xc2a7d8],
  ];
  charms.forEach(([type, shape, color], index) => {
    const mesh = createCharmMesh(type, shape, color); const baseScale = rand(.54, .68); mesh.rotation.z = rand(-.55, .55); mesh.scale.setScalar(baseScale); mesh.position.set(rand(-2.35, 2.35), MILK_Y + rand(.08, .18), rand(-1.5, 1.5)); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
    const pickMeshes = []; mesh.traverse((child) => { if (child.isMesh) pickMeshes.push(child); });
    marshmallows.push({ type, wild: true, mesh, pickMeshes, baseScale, x: mesh.position.x, z: mesh.position.z, y: mesh.position.y, phase: rand(0, TAU), vx: rand(-.004, .004), vz: rand(-.004, .004), rotation: mesh.rotation.z, selected: false });
  });
}

function makeMilkTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  const gradient = g.createRadialGradient(24, 18, 2, 32, 32, 45); gradient.addColorStop(0, "#fffef7"); gradient.addColorStop(.65, "#fff8e9"); gradient.addColorStop(1, "#d8e0d4"); g.fillStyle = gradient; g.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

function makeMilkBumpTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 96; const g = c.getContext("2d");
  g.fillStyle = "#888888"; g.fillRect(0, 0, 96, 96); g.globalAlpha = .16;
  for (let i = 0; i < 80; i++) { g.beginPath(); g.ellipse(rand(0, 96), rand(0, 96), rand(1, 8), rand(.4, 2), rand(0, TAU), 0, TAU); g.fillStyle = i % 2 ? "#ffffff" : "#555555"; g.fill(); }
  const texture = new THREE.CanvasTexture(c); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(2, 2); return texture;
}

function makeOatBumpTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  g.fillStyle = "#808080"; g.fillRect(0, 0, 128, 128); g.globalAlpha = .6;
  for (let i = 0; i < 90; i++) { g.beginPath(); g.ellipse(rand(0, 128), rand(0, 128), rand(1, 5), rand(1, 3), rand(0, TAU), 0, TAU); g.fillStyle = i % 2 ? "#d7d7d7" : "#484848"; g.fill(); }
  const texture = new THREE.CanvasTexture(c); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(1.4, 1.4); return texture;
}

function makeMarshmallowBumpTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); g.fillStyle = "#808080"; g.fillRect(0, 0, 64, 64); g.globalAlpha = .28;
  for (let i = 0; i < 32; i++) { g.beginPath(); g.arc(rand(0, 64), rand(0, 64), rand(1, 3), 0, TAU); g.fillStyle = i % 2 ? "#bdbdbd" : "#5c5c5c"; g.fill(); }
  const texture = new THREE.CanvasTexture(c); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(1.5, 1.5); return texture;
}

function makeOatMaterial(index) {
  const material = new THREE.MeshPhysicalMaterial({ color: [0xd39a54, 0xe0ad68, 0xc88b47, 0xd9a25b][index % 4], roughness: .7, metalness: 0, clearcoat: .12, clearcoatRoughness: .55, bumpMap: oatBump, bumpScale: .065 });
  material.emissive = new THREE.Color(0x000000); material.emissiveIntensity = 0; return material;
}

function createLetter(char, index) {
  const geometry = new TextGeometry(char, { font: oatFont, size: .38, depth: .13, curveSegments: 5, bevelEnabled: true, bevelThickness: .03, bevelSize: .018, bevelSegments: 2 });
  geometry.computeBoundingBox(); geometry.center();
  const mesh = new THREE.Mesh(geometry, makeOatMaterial(index));
  mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = rand(-.45, .45); mesh.position.set(rand(-2.15, 2.15), MILK_Y + rand(.06, .2), rand(-1.42, 1.42)); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.36, .025, 8, 32), new THREE.MeshBasicMaterial({ color: 0xfff8df, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  ring.rotation.x = Math.PI / 2; ring.position.y = .015; scene.add(ring);
  return { char, mesh, ring, x: mesh.position.x, z: mesh.position.z, y: mesh.position.y, vx: rand(-.008, .008), vz: rand(-.008, .008), vy: 0, radius: .27, phase: rand(0, TAU), color: colors[index % colors.length], selected: false, wild: false, rotation: mesh.rotation.z };
}

function newGame() {
  letters.forEach((l) => { scene.remove(l.mesh, l.ring); l.mesh.geometry.dispose(); l.mesh.material.dispose(); l.ring.geometry.dispose(); l.ring.material.dispose(); });
  marshmallows.forEach((m) => { m.selected = false; m.mesh.scale.setScalar(m.baseScale); m.mesh.traverse((child) => { if (child.isMesh && child.material?.emissive) { child.material.emissive.set(0x000000); child.material.emissiveIntensity = 0; } }); });
  const chars = Array.from({ length: 34 }, () => bag[Math.floor(Math.random() * bag.length)]);
  letters = chars.map(createLetter); simA.fill(0); simB.fill(0); simVelocity.fill(0); selected = []; ripples = []; particles = []; updateDock();
  statusEl.textContent = "A three-letter word is a good place to start."; statusEl.className = "game-status";
}

function shuffle() {
  letters.forEach((l) => { l.x = rand(-2.2, 2.2); l.z = rand(-1.4, 1.4); l.vx += rand(-.02, .02); l.vz += rand(-.02, .02); l.mesh.position.set(l.x, l.y + .3, l.z); });
  addRipple(0, 0, 1.6); showToast("fresh pour ✦");
}

function selectPiece(piece) {
  if (piece.selected) { selected = selected.filter((l) => l !== piece); piece.selected = false; }
  else if (selected.length < 10) { selected.push(piece); piece.selected = true; addRipple(piece.x, piece.z, piece.wild ? 1.3 : .8); tone(330 + selected.length * 42, .045); }
  else { statusEl.textContent = "That spoon is full — serve or remove a letter."; statusEl.className = "game-status warn"; return; }
  if (piece.wild) { piece.mesh.traverse((child) => { if (child.isMesh && child.material?.emissive) { child.material.emissive.set(piece.selected ? 0x5d4a89 : 0x000000); child.material.emissiveIntensity = piece.selected ? .32 : 0; } }); piece.mesh.scale.setScalar(piece.selected ? piece.baseScale * 1.12 : piece.baseScale); }
  else { piece.mesh.material.emissive.set(piece.selected ? 0x7b4d1f : 0x000000); piece.mesh.material.emissiveIntensity = piece.selected ? .25 : 0; piece.ring.material.opacity = piece.selected ? .82 : 0; }
  updateDock();
}

function updateDock() {
  if (!selected.length) slotsEl.innerHTML = '<span class="empty-prompt">tap letters above to start a word</span>';
  else slotsEl.innerHTML = selected.map((l, i) => `<span class="slot-letter${l.wild ? " slot-wild" : ""}" style="animation-delay:${i * 25}ms">${l.wild ? "?" : l.char}</span>`).join("");
  serveButton.disabled = selected.length < 2;
}

function resolveWildWord(tokens) {
  const pattern = tokens.map((token) => token.wild ? "?" : token.char).join("");
  const matches = [...easyWords].filter((candidate) => candidate.length === tokens.length && tokens.every((token, index) => token.wild || token.char === candidate[index]));
  matches.sort((a, b) => b.split("").reduce((sum, char) => sum + letterValues[char], 0) - a.split("").reduce((sum, char) => sum + letterValues[char], 0));
  return matches[0] || pattern;
}

function serveWord() {
  const pattern = selected.map((l) => l.wild ? "?" : l.char).join(""); const word = selected.some((l) => l.wild) ? resolveWildWord(selected) : pattern; const points = selected.reduce((sum, l) => sum + (l.wild ? (letterValues[word[selected.indexOf(l)]] || 1) : letterValues[l.char]), 0) + (word.length >= 5 ? word.length * 2 : 0); const valid = word.length >= 2 && (easyWords.has(word) || (selected.some((l) => l.wild) && word.length >= 3) || word.length >= 4);
  if (!valid) { statusEl.textContent = `${pattern} needs another stir. Try a familiar word.`; statusEl.className = "game-status warn"; tone(150, .1); return; }
  score += points; scoreEl.textContent = score; scoreProgress.style.width = `${Math.min(100, 64 + (score - 128) / 2)}%`; scoreGoal.textContent = `${Math.max(0, 200 - score)} pts`;
  if (word.length > bestWord.length || points > 30) { bestWord = word; bestWordEl.innerHTML = `${word} <b>+${points}</b>`; }
  statusEl.textContent = `${word} served warm · +${points} points${pattern.includes("?") ? " · wild charm used" : ""}`; statusEl.className = "game-status success"; addRipple(0, 0, 2.4); tone(520, .08); setTimeout(() => tone(780, .1), 70);
  selected.forEach((l) => { l.selected = false; if (l.wild) { l.mesh.traverse((child) => { if (child.isMesh && child.material?.emissive) { child.material.emissive.set(0x000000); child.material.emissiveIntensity = 0; } }); l.mesh.scale.setScalar(l.baseScale); } else { l.mesh.material.emissive.set(0x000000); l.mesh.material.emissiveIntensity = 0; l.ring.material.opacity = 0; l.vy += .05; } }); selected = []; updateDock();
}

function addRipple(x, z, strength = 1) { ripples.push({ x, z, radius: .08, strength, life: 1 }); injectRipple(x, z, strength); }

function injectRipple(x, z, strength) {
  const gx = Math.floor((x / FIELD_W + .5) * GRID), gz = Math.floor((z / FIELD_D + .5) * GRID), radius = Math.max(2, Math.floor(2.5 + strength * 3));
  for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) { const ix = gx + dx, iz = gz + dz; if (ix < 1 || ix >= GRID || iz < 1 || iz >= GRID) continue; const d = Math.hypot(dx, dz) / radius; if (d <= 1) simVelocity[iz * (GRID + 1) + ix] += (1 - d) * strength * .022; }
}

function updateSimulation(dt) {
  const count = GRID + 1; const damping = .986; const speed = .16;
  for (let z = 1; z < GRID; z++) for (let x = 1; x < GRID; x++) { const i = z * count + x; const lap = simA[i - 1] + simA[i + 1] + simA[i - count] + simA[i + count] - simA[i] * 4; simVelocity[i] = clamp((simVelocity[i] + lap * speed * dt) * damping, -.055, .055); simB[i] = clamp(simA[i] + simVelocity[i] * dt, -.18, .18); }
  [simA, simB] = [simB, simA];
  const position = milkGeometry.attributes.position;
  for (let i = 0; i < position.count; i++) position.setY(i, MILK_Y + simA[i] * .72);
  position.needsUpdate = true; milkGeometry.computeVertexNormals();
  ripples.forEach((r) => { r.radius += dt * .025; r.life -= dt * .006; if (r.life > .02) injectRipple(r.x, r.z, r.strength * .008); }); ripples = ripples.filter((r) => r.life > 0);
}

function updateMarshmallows(dt) {
  marshmallows.forEach((m) => {
    m.x += m.vx * dt; m.z += m.vz * dt; m.vx += Math.sin(time * .65 + m.phase) * .00004 * dt; m.vz += Math.cos(time * .55 + m.phase) * .00004 * dt;
    if (Math.abs(m.x) > 2.45) { m.x = Math.sign(m.x) * 2.45; m.vx *= -.75; }
    if (Math.abs(m.z) > 1.58) { m.z = Math.sign(m.z) * 1.58; m.vz *= -.75; }
    m.mesh.position.set(m.x, MILK_Y + .16 + Math.sin(time * 1.2 + m.phase) * .045, m.z); m.mesh.rotation.z = m.rotation + Math.sin(time * .75 + m.phase) * .09;
  });
}

function updateLetters(dt) {
  letters.forEach((l) => {
    const buoyancy = MILK_Y + .19 + Math.sin(time * 1.4 + l.phase) * .035; l.vy += (buoyancy - l.y) * .007 * dt; l.vy *= .95; l.y += l.vy * dt; l.x += l.vx * dt; l.z += l.vz * dt; l.vx *= .995; l.vz *= .995;
    l.vx += Math.sin(time + l.phase) * .00022 * dt; l.vz += Math.cos(time * .8 + l.phase) * .00022 * dt;
    const edgeX = FIELD_W * .5 - .22, edgeZ = FIELD_D * .5 - .22;
    if (Math.abs(l.x) > edgeX) { l.x = Math.sign(l.x) * edgeX; l.vx *= -.7; addRipple(l.x, l.z, .22); }
    if (Math.abs(l.z) > edgeZ) { l.z = Math.sign(l.z) * edgeZ; l.vz *= -.7; addRipple(l.x, l.z, .22); }
    l.mesh.position.set(l.x, l.y + .06, l.z); l.mesh.rotation.z = l.rotation + Math.sin(time + l.phase) * .035; l.ring.position.set(l.x, MILK_Y + .03, l.z);
    const speed = Math.hypot(l.vx, l.vz) + Math.abs(l.vy); if (speed > .02) injectRipple(l.x, l.z, speed * .12);
  });
  for (let i = 0; i < letters.length; i++) for (let j = i + 1; j < letters.length; j++) { const a = letters[i], b = letters[j], dx = b.x - a.x, dz = b.z - a.z, dist = Math.hypot(dx, dz), min = a.radius + b.radius; if (dist > 0 && dist < min) { const nx = dx / dist, nz = dz / dist, push = (min - dist) * .012; a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push; const impulse = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz; a.vx -= impulse * nx * .5; a.vz -= impulse * nz * .5; b.vx += impulse * nx * .5; b.vz += impulse * nz * .5; } }
}

function createSpark(x, y, z, color) { const mesh = new THREE.Mesh(new THREE.SphereGeometry(.025, 8, 8), new THREE.MeshBasicMaterial({ color, transparent: true })); mesh.position.set(x, y, z); scene.add(mesh); particles.push({ mesh, life: 1, vx: rand(-.008, .008), vy: rand(.008, .023), vz: rand(-.008, .008) }); }
function updateParticles(dt) { particles.forEach((p) => { p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt; p.mesh.material.opacity = p.life; p.life -= .018 * dt; }); particles = particles.filter((p) => { if (p.life <= 0) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); return false; } return true; }); }

function pickLetter(event) {
  const rect = renderer.domElement.getBoundingClientRect(); pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1; raycaster.setFromCamera(pointer, camera);
  const letterMeshes = letters.map((l) => l.mesh); const charmMeshes = marshmallows.flatMap((m) => m.pickMeshes); const hits = raycaster.intersectObjects([...letterMeshes, ...charmMeshes]); if (!hits.length) return;
  const letter = letters.find((l) => l.mesh === hits[0].object); const charm = marshmallows.find((m) => m.pickMeshes.includes(hits[0].object)); const piece = letter || charm;
  if (piece) { selectPiece(piece); for (let i = 0; i < (piece.wild ? 8 : 5); i++) createSpark(piece.x, piece.y + .08, piece.z, piece.wild ? 0xc9a8eb : piece.color); }
}

function showToast(message) { toast.textContent = message; toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 1400); }
function tone(frequency, duration) { if (!soundOn) return; try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain(); oscillator.frequency.value = frequency; oscillator.type = "sine"; gain.gain.setValueAtTime(.035, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration); oscillator.connect(gain).connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + duration); } catch (_) {} }
function resize() { if (!renderer) return; renderer.setSize(mount.clientWidth, mount.clientHeight, false); camera.aspect = mount.clientWidth / mount.clientHeight; camera.updateProjectionMatrix(); }

function animate(now) {
  const dt = Math.min(2.5, (now - lastTime) / 16.67); lastTime = now; time += .016 * dt; updateSimulation(dt); updateMarshmallows(dt); updateLetters(dt); updateParticles(dt); renderer.render(scene, camera); requestAnimationFrame(animate);
}

async function boot() {
  if (!setupRenderer()) return;
  setupScene();
  try { oatFont = await new FontLoader().loadAsync("https://threejs.org/examples/fonts/helvetiker_bold.typeface.json"); }
  catch (_) { statusEl.textContent = "The oat letters are still warming up — refresh to try again."; statusEl.className = "game-status warn"; return; }
  newGame(); window.addEventListener("resize", resize); renderer.domElement.addEventListener("pointerdown", pickLetter);
  document.getElementById("shuffleButton").addEventListener("click", shuffle);
  document.getElementById("newGameButton").addEventListener("click", () => { newGame(); showToast("new bowl, new possibilities"); });
  document.getElementById("soundToggle").addEventListener("click", (event) => { soundOn = !soundOn; event.currentTarget.classList.toggle("muted", !soundOn); showToast(soundOn ? "sound on" : "sound off"); });
  serveButton.addEventListener("click", serveWord); requestAnimationFrame(animate);
}

void boot();
