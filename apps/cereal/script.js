(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const stage = document.getElementById("bowlStage");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestWordEl = document.getElementById("bestWord");
  const scoreProgress = document.getElementById("scoreProgress");
  const scoreGoal = document.getElementById("scoreGoal");
  const slotsEl = document.getElementById("wordSlots");
  const serveButton = document.getElementById("serveButton");
  const statusEl = document.getElementById("gameStatus");
  const toast = document.getElementById("toast");

  const TAU = Math.PI * 2;
  const colors = ["#e4885e", "#efaa82", "#ddbe5d", "#a5c7b0", "#bdb8dc", "#de8d72"];
  const letterValues = { A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10 };
  const bag = "AAABBCCCDDDEEEEEEEEEFFGGGHHHIIIIIIIIJKLLLLMMNNNNNNOOOOOOOOPPQRRRRRRSSSSSTTTTTTUUUVVWWXYYZ";
  const easyWords = new Set("ACE ADD ADO AGE AID AIM AIR ALE ALL AMP AND ANT ANY ARE ART ASK ATE AWE BAD BAG BAN BAR BAT BAY BED BEE BIG BIN BIT BOB BOX BOY BUN BUS BUT BUY CAB CAN CAP CAR CAT COD COLD COME CONE COOK COOL CORN COT COW CUBE CUP CUT DAY DID DIE DIG DIM DIN DIP DOG DOT DRY DUE EAR EAT EGG EGO ELF ELM END ERA EVE EYE FAR FAT FED FEE FEW FIG FIN FIR FIT FIX FLY FOG FOR FOX FROG FUN FUR GAG GAS GEL GEM GET GIG GIN GOD GOLD GONE GOOD GUM HAT HAY HEN HER HID HIM HIP HIS HIT HOG HOP HOT HOW ICE ILL JAM JAR JAW JET JOB JOG JOY KEY KID KIN KIT LAB LAG LAP LAW LEG LET LID LIE LIP LOG LOT LOW MAD MAN MAP MAY MEN MET MIX MOB MOM MOON MORE MUG NAP NET NEW NOD NOT NOW OAK OAT ODD OFF OIL OLD ONE OPT ORB ORE OUR OUT OVEN OWN PAD PAN PAY PEA PEG PEN PET PIE PIG PIN PIT PLY POD POP POT RAG RAN RAP RAT RAW RED RIB RID RIG RIP ROB ROD ROLL ROPE ROW RUB RUN SAD SAG SAP SAY SEA SEE SET SEW SHE SHY SIP SIT SIX SKY SLIP SLOW SNAP SNOW SOFT SON SOP SOW SOY SPAW SPOON STAR STAY STEM STEP STIR STOP SUN TAB TAG TAN TAP TEA TEN THE TIE TIN TIP TOAD TOY TRY TUB TUG TWO USE VAN VET VEX WAR WAS WAY WEB WET WHO WHY WIN WIRE WISH WOK WON WOW YAK YAM YAP YET YOU ZAP ZOO APPLE BERRY BOWL BREAD BRIGHT CEREAL CHEER CHEW CHOMP COCOA CRISP DREAM EATEN FLAKE FLOAT FRESH HAPPY HONEY LEMON MILK MINT OATMEAL PEACH POUR RICE ROUND SPOON SWEET TOAST YUMMY".split(" "));

  let W = 900, H = 600, dpr = 1;
  let letters = [];
  let selected = [];
  let ripples = [];
  let particles = [];
  let score = 128;
  let bestWord = "OATMEAL";
  let time = 0;
  let lastTime = performance.now();
  let soundOn = true;
  let audioContext;

  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function resize() {
    const rect = stage.getBoundingClientRect();
    W = Math.max(320, rect.width);
    H = Math.max(360, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!letters.length) newGame();
  }

  function bowlMetrics() {
    return { cx: W * .5, cy: H * .47, rx: W * .39, ry: H * .31, surfaceY: H * .345 };
  }

  function makeLetter(char, index) {
    const m = bowlMetrics();
    const angle = rand(0, TAU);
    const radius = Math.min(22, Math.max(16, W * .021));
    const px = m.cx + Math.cos(angle) * rand(m.rx * .2, m.rx * .78);
    const py = m.cy + Math.sin(angle) * rand(m.ry * .34, m.ry * .81);
    return { char, x: px, y: py, vx: rand(-.22, .22), vy: rand(-.1, .1), r: radius, rot: rand(-.35, .35), spin: rand(-.008, .008), phase: rand(0, TAU), color: colors[index % colors.length], selected: false, homeX: px, homeY: py };
  }

  function newGame() {
    const chars = Array.from({ length: 21 }, () => bag[Math.floor(Math.random() * bag.length)]);
    letters = chars.map(makeLetter);
    selected = [];
    ripples = [];
    particles = [];
    updateDock();
    statusEl.textContent = "A three-letter word is a good place to start.";
    statusEl.className = "game-status";
  }

  function shuffle() {
    letters.forEach((l, i) => { l.homeX = rand(W * .28, W * .72); l.homeY = rand(H * .27, H * .66); l.x = l.homeX; l.y = l.homeY; l.vx += rand(-1.5, 1.5); l.vy -= rand(1.2, 2.5); l.phase = rand(0, TAU); l.color = colors[(i + Math.floor(rand(0, 4))) % colors.length]; });
    addRipple(W * .5, H * .35, 1);
    showToast("fresh pour ✦");
  }

  function selectLetter(letter) {
    if (letter.selected) {
      selected = selected.filter((l) => l !== letter);
      letter.selected = false;
      letter.vy -= .7;
    } else if (selected.length < 10) {
      selected.push(letter);
      letter.selected = true;
      addRipple(letter.x, letter.y, .65);
      burst(letter.x, letter.y, letter.color, 4);
      tone(330 + selected.length * 42, .045);
    } else {
      statusEl.textContent = "That spoon is full — serve or remove a letter.";
      statusEl.className = "game-status warn";
      return;
    }
    updateDock();
  }

  function updateDock() {
    if (!selected.length) {
      slotsEl.innerHTML = '<span class="empty-prompt">tap letters above to start a word</span>';
    } else {
      slotsEl.innerHTML = selected.map((l, i) => `<span class="slot-letter" style="animation-delay:${i * 25}ms">${l.char}</span>`).join("");
    }
    serveButton.disabled = selected.length < 2;
  }

  function serveWord() {
    const word = selected.map((l) => l.char).join("");
    const points = selected.reduce((sum, l) => sum + letterValues[l.char], 0) + (word.length >= 5 ? word.length * 2 : 0);
    const valid = word.length >= 2 && (easyWords.has(word) || word.length >= 4);
    if (!valid) {
      statusEl.textContent = `${word} needs another stir. Try a familiar word.`;
      statusEl.className = "game-status warn";
      shakeDock();
      tone(150, .1);
      return;
    }
    score += points;
    scoreEl.textContent = score;
    scoreProgress.style.width = `${Math.min(100, 64 + (score - 128) / 2)}%`;
    scoreGoal.textContent = `${Math.max(0, 200 - score)} pts`;
    if (word.length > bestWord.length || points > 30) { bestWord = word; bestWordEl.innerHTML = `${word} <b>+${points}</b>`; }
    statusEl.textContent = `${word} served warm · +${points} points`;
    statusEl.className = "game-status success";
    burst(W * .5, H * .43, "#efaa82", 18);
    addRipple(W * .5, H * .37, 2);
    tone(520, .08); setTimeout(() => tone(780, .1), 70);
    selected.forEach((l) => { l.selected = false; l.vy -= rand(1.5, 3); l.vx += rand(-1.5, 1.5); });
    selected = [];
    updateDock();
  }

  function shakeDock() {
    slotsEl.animate([{ transform: "translateX(-5px)" }, { transform: "translateX(5px)" }, { transform: "translateX(0)" }], { duration: 220 });
  }

  function addRipple(x, y, power = 1) { ripples.push({ x, y, radius: 6, alpha: .35 * power, speed: 1.2 + power }); }
  function burst(x, y, color, count) { for (let i = 0; i < count; i++) particles.push({ x, y, vx: rand(-1.5, 1.5), vy: rand(-2.4, -.6), life: 1, color }); }

  function drawBackground() {
    ctx.clearRect(0, 0, W, H);
    const m = bowlMetrics();
    const glow = ctx.createRadialGradient(m.cx, m.cy, 10, m.cx, m.cy, m.rx * 1.3);
    glow.addColorStop(0, "rgba(255,255,255,.77)"); glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(m.cx, H * .87); ctx.scale(1, .27); ctx.beginPath(); ctx.arc(0, 0, m.rx * .78, 0, TAU); ctx.fillStyle = "rgba(74, 86, 73, .12)"; ctx.filter = "blur(16px)"; ctx.fill(); ctx.restore();
  }

  function drawBowl() {
    const m = bowlMetrics();
    const bowlTop = H * .33;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(m.cx, bowlTop + 8, m.rx + 12, m.ry * .52, 0, 0, TAU); ctx.fillStyle = "#e8d9c2"; ctx.fill();
    const bowl = ctx.createLinearGradient(0, bowlTop, 0, H * .91); bowl.addColorStop(0, "#fcf8ed"); bowl.addColorStop(.56, "#f0e4cf"); bowl.addColorStop(1, "#d9c7aa");
    ctx.beginPath(); ctx.moveTo(m.cx - m.rx, bowlTop); ctx.bezierCurveTo(m.cx - m.rx * .92, H * .71, m.cx - m.rx * .53, H * .9, m.cx, H * .92); ctx.bezierCurveTo(m.cx + m.rx * .53, H * .9, m.cx + m.rx * .92, H * .71, m.cx + m.rx, bowlTop); ctx.closePath(); ctx.fillStyle = bowl; ctx.fill();
    ctx.strokeStyle = "rgba(177, 150, 113, .32)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(m.cx, bowlTop, m.rx + 1, m.ry * .51, 0, 0, TAU); ctx.fillStyle = "#d3b78f"; ctx.fill();
    const milk = ctx.createRadialGradient(m.cx - m.rx * .18, bowlTop - 5, 2, m.cx, bowlTop, m.rx * 1.05); milk.addColorStop(0, "#fffefa"); milk.addColorStop(.66, "#fbf8ef"); milk.addColorStop(1, "#e7e1d2");
    ctx.beginPath(); ctx.ellipse(m.cx, bowlTop - 2, m.rx - 8, m.ry * .48, 0, 0, TAU); ctx.fillStyle = milk; ctx.fill();
    ctx.strokeStyle = "rgba(177, 150, 113, .38)"; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();
    drawMilkSurface(m);
  }

  function drawMilkSurface(m) {
    const y = m.cy - .1 * H;
    ctx.save(); ctx.beginPath();
    for (let x = m.cx - m.rx + 16; x <= m.cx + m.rx - 16; x += 8) {
      const normalized = (x - m.cx) / m.rx;
      const edgeLift = normalized * normalized * 24;
      const wave = Math.sin(x * .035 + time * 1.1) * 2.8 + Math.sin(x * .086 - time * .7) * 1.2;
      if (x === m.cx - m.rx + 16) ctx.moveTo(x, y + edgeLift + wave); else ctx.lineTo(x, y + edgeLift + wave);
    }
    ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = .22; ctx.strokeStyle = "#a8c6b1"; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(m.cx + (i - 1.5) * 62, y + 10 + (i % 2) * 9, 42 + i * 8, 6, -.08, .15, Math.PI - .15); ctx.stroke(); }
    ctx.restore();
  }

  function updatePhysics(dt) {
    const m = bowlMetrics();
    letters.forEach((l) => {
      if (l.selected) { l.vy -= .025; l.vx *= .99; }
      l.vy += .014 * dt;
      // A soft spring keeps each puff buoyant while the damping and collisions
      // still let the flock drift, separate, and make believable little waves.
      const buoyancyTarget = m.cy - H * .055 + Math.sin(time * .9 + l.phase) * H * .012;
      l.vy += (buoyancyTarget - l.y) * .00135 * dt;
      l.vx += Math.sin(time * .65 + l.phase) * .006 * dt;
      l.vx *= .995; l.vy *= .994;
      l.x += l.vx * dt; l.y += l.vy * dt;
      l.rot += l.spin * dt + l.vx * .001;
      const dx = (l.x - m.cx) / (m.rx - l.r - 8);
      const dy = (l.y - m.cy) / (m.ry * .77 - l.r);
      const distance = dx * dx + dy * dy;
      if (distance > 1) {
        const mag = Math.sqrt(distance); const nx = dx / mag; const ny = dy / mag;
        l.x = m.cx + nx * (m.rx - l.r - 8); l.y = m.cy + ny * (m.ry * .77 - l.r);
        const dot = l.vx * nx + l.vy * ny;
        l.vx -= dot * nx * 1.6; l.vy -= dot * ny * 1.6;
        l.vx *= .79; l.vy *= .79;
        if (Math.abs(dot) > .35) addRipple(l.x, l.y, .3);
      }
      if (l.y < m.surfaceY + 7) { l.y = m.surfaceY + 7; l.vy = Math.abs(l.vy) * .35; }
    });
    for (let i = 0; i < letters.length; i++) for (let j = i + 1; j < letters.length; j++) {
      const a = letters[i], b = letters[j], dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy), min = a.r + b.r - 3;
      if (dist > 0 && dist < min) { const nx = dx / dist, ny = dy / dist, push = (min - dist) * .06; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push; const impulse = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny; if (impulse > 0) { a.vx -= impulse * nx * .48; a.vy -= impulse * ny * .48; b.vx += impulse * nx * .48; b.vy += impulse * ny * .48; } }
    }
    ripples.forEach((r) => { r.radius += r.speed * dt; r.alpha -= .004 * dt; }); ripples = ripples.filter((r) => r.alpha > 0);
    particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += .025 * dt; p.life -= .018 * dt; }); particles = particles.filter((p) => p.life > 0);
  }

  function drawLetters() {
    letters.forEach((l) => {
      ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.rot);
      ctx.shadowColor = "rgba(87, 76, 57, .19)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
      ctx.beginPath(); ctx.arc(0, 0, l.r, 0, TAU); ctx.fillStyle = l.color; ctx.fill(); ctx.shadowColor = "transparent";
      ctx.beginPath(); ctx.arc(-l.r * .28, -l.r * .32, l.r * .18, 0, TAU); ctx.fillStyle = "rgba(255,255,255,.28)"; ctx.fill();
      if (l.selected) { ctx.beginPath(); ctx.arc(0, 0, l.r + 4, 0, TAU); ctx.strokeStyle = "#fffdf7"; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.fillStyle = "#fffaf0"; ctx.font = `600 ${l.r * 1.1}px Fraunces, serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(l.char, 0, 1);
      ctx.restore();
    });
    ripples.forEach((r) => { ctx.beginPath(); ctx.ellipse(r.x, r.y, r.radius * 1.9, r.radius * .55, 0, 0, TAU); ctx.strokeStyle = `rgba(118,164,140,${r.alpha})`; ctx.lineWidth = 1.2; ctx.stroke(); });
    particles.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 1.5 + p.life * 2, 0, TAU); ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.fill(); ctx.globalAlpha = 1; });
  }

  function frame(now) {
    const dt = Math.min(2.2, (now - lastTime) / 16.67); lastTime = now; time += .016 * dt;
    drawBackground(); drawBowl(); updatePhysics(dt); drawLetters(); requestAnimationFrame(frame);
  }

  function hitTest(event) {
    const rect = canvas.getBoundingClientRect(); const x = (event.clientX - rect.left) * W / rect.width; const y = (event.clientY - rect.top) * H / rect.height;
    for (let i = letters.length - 1; i >= 0; i--) if (Math.hypot(x - letters[i].x, y - letters[i].y) < letters[i].r * 1.35) return letters[i];
    return null;
  }

  function showToast(message) { toast.textContent = message; toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 1400); }
  function tone(frequency, duration) { if (!soundOn) return; try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain(); oscillator.frequency.value = frequency; oscillator.type = "sine"; gain.gain.setValueAtTime(.035, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration); oscillator.connect(gain).connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + duration); } catch (_) {} }

  canvas.addEventListener("pointerdown", (event) => { const letter = hitTest(event); if (letter) { canvas.setPointerCapture?.(event.pointerId); selectLetter(letter); } });
  document.getElementById("shuffleButton").addEventListener("click", shuffle);
  document.getElementById("newGameButton").addEventListener("click", () => { newGame(); showToast("new bowl, new possibilities"); });
  document.getElementById("soundToggle").addEventListener("click", (event) => { soundOn = !soundOn; event.currentTarget.classList.toggle("muted", !soundOn); showToast(soundOn ? "sound on" : "sound off"); });
  serveButton.addEventListener("click", serveWord);
  window.addEventListener("resize", resize);
  resize(); requestAnimationFrame(frame);
})();
