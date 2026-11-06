import './style.css';

// The canvas uses a small fixed logical resolution; CSS scales it cleanly to phones.
const WIDTH = 480;
const HEIGHT = 270;
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d')!;
canvas.width = WIDTH;
canvas.height = HEIGHT;

type Scene = 'title' | 'map' | 'message' | 'level' | 'win' | 'lose';
type Control = 'left' | 'right';
interface Actor { x: number; y: number; vx: number; vy: number; w: number; h: number; }

const messages: string[] = [
  'Geri leads by 1 in the overall series: 4-3',
  'Both teams are competing for a playoff bye this year, so the stakes are higher than ever',
  'This years winner will receive [TBD] and eternal bragging rights. Can Geri protect his lead from the evil Liam?'
];
const stopX = [105, 210, 315, 420];
let scene: Scene = 'title';
let selection = 0;
let held = new Set<Control>();
let player: Actor = { x: 58, y: 192, vx: 0, vy: 0, w: 18, h: 27 };
let boss: Actor = { x: 365, y: 178, vx: -1.15, vy: 0, w: 44, h: 46 };
let bossHits = 0;
let jumpQueued = false;
let lastTime = 0;
let popupReturn: 'map' | 'level' = 'map';
let mapRepeatMs = 0;

// Cartoon drawing helpers use smooth geometry and high-contrast outlines for clear shapes.
function rect(x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
}
function ellipse(x: number, y: number, rx: number, ry: number, color: string, stroke = '#573d35'): void {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke();
}
function roundBox(x: number, y: number, w: number, h: number, color: string, radius = 8, stroke = '#573d35'): void {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke();
}
function text(value: string, x: number, y: number, size = 8, color = '#fff', align: CanvasTextAlign = 'center'): void {
  ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = '#392d2a'; ctx.strokeText(value, x, y); ctx.fillStyle = color; ctx.fillText(value, x, y);
}
function wrap(value: string, maxChars: number): string[] {
  const words = value.split(' '); const lines: string[] = []; let line = '';
  for (const word of words) { const candidate = line ? `${line} ${word}` : word; if (candidate.length > maxChars && line) { lines.push(line); line = word; } else line = candidate; }
  if (line) lines.push(line); return lines;
}
function background(): void {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT); sky.addColorStop(0, '#8bd5e9'); sky.addColorStop(1, '#e4f0cc');
  rect(0, 0, WIDTH, HEIGHT, '#8bd5e9'); ctx.fillStyle = sky; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  for (const [x, y] of [[42, 36], [235, 26], [390, 50]]) { ellipse(x, y, 24, 10, '#fffdf2', '#fffdf2'); ellipse(x + 14, y - 5, 18, 11, '#fffdf2', '#fffdf2'); }
  rect(0, 170, WIDTH, 28, '#67ae57'); rect(0, 194, WIDTH, 76, '#e2c787');
  roundBox(0, 188, WIDTH, 18, '#4d914c', 7, '#4d914c');
  for (let x = 8; x < WIDTH; x += 30) { ellipse(x + 7, 222 + ((x / 30) % 2) * 10, 5, 4, '#bd8d54', '#bd8d54'); ellipse(x + 19, 238, 4, 3, '#bd8d54', '#bd8d54'); }
}
function drawFootballer(x: number, y: number, scale = 1): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ellipse(9, 25, 10, 3, '#5b4939', '#5b4939');
  roundBox(2, 12, 15, 12, '#1882a7', 5); ellipse(2, 17, 3, 7, '#e8a145'); ellipse(17, 17, 3, 7, '#e8a145');
  roundBox(4, 22, 5, 7, '#334154', 2); roundBox(12, 22, 5, 7, '#334154', 2); roundBox(2, 27, 8, 3, '#fff4dc', 2); roundBox(11, 27, 8, 3, '#fff4dc', 2);
  ellipse(9, 9, 8, 8, '#efbd83'); roundBox(1, 3, 16, 7, '#e79532', 4); rect(4, 9, 11, 2, '#70442c');
  ellipse(12, 8, 1.4, 1.8, '#292735', '#292735'); ctx.restore();
}
function drawBoss(): void {
  // Original helmeted turtle-like rival; the shirt label is a gameplay detail from the brief.
  const x = boss.x, y = boss.y;
  ellipse(x + 22, y + 43, 21, 5, '#5a4937', '#5a4937');
  ellipse(x + 22, y + 16, 21, 16, '#7baa45');
  roundBox(x + 3, y + 2, 39, 13, '#e9a83d', 7); roundBox(x + 6, y + 5, 34, 10, '#c67a29', 6);
  ellipse(x + 22, y + 19, 14, 11, '#f1cf9b');
  roundBox(x + 5, y + 26, 34, 19, '#48cba8', 6);
  ellipse(x + 9, y + 31, 4, 3, '#ee6690', '#ee6690'); ellipse(x + 35, y + 38, 4, 3, '#9679e4', '#9679e4');
  ellipse(x + 17, y + 36, 4, 3, '#f3d34e', '#f3d34e');
  // A solid white chest patch makes the opponent's name readable over the tie-dye pattern.
  roundBox(x + 10, y + 30, 26, 13, '#fffdf2', 3, '#287e72');
  text('LIAM', x + 23, y + 36.5, 10, '#183b4a');
  roundBox(x + 8, y + 42, 13, 5, '#745537', 2); roundBox(x + 25, y + 42, 13, 5, '#745537', 2);
  ellipse(x + 30, y + 19, 2, 2, '#292735', '#292735');
}
function drawTitle(): void {
  background();
  rect(38, 56, 404, 88, '#183d70'); rect(43, 61, 394, 78, '#f3c84b');
  text('BROAD STREET', 240, 87, 17, '#fff8d8'); text('BOWL 2026', 240, 117, 19, '#fff8d8');
  text('Geri vs Liam for the ultimate Philadelphia glory', 240, 164, 13, '#ffffff');
  // A pixel football field motif anchors the opening card.
  rect(115, 209, 250, 35, '#27834b'); for (let x = 135; x < 350; x += 42) rect(x, 210, 2, 33, '#b9e28d');
  text('TAP ● TO START', 240, 252, 8, '#fff');
}
function drawLandmark(index: number, x: number): void {
  if (index === 0) { // Liberty Bell silhouette
    rect(x - 15, 116, 30, 40, '#d7ad55'); rect(x - 19, 114, 38, 6, '#f1d17a'); rect(x - 12, 108, 24, 7, '#d7ad55'); rect(x - 2, 119, 3, 32, '#735d39'); rect(x - 8, 136, 17, 2, '#735d39');
  } else if (index === 1) { // City Hall tower and clock
    rect(x - 20, 132, 40, 25, '#e9e0c6'); rect(x - 14, 122, 28, 10, '#d7d0bd'); rect(x - 8, 106, 16, 16, '#e9e0c6'); rect(x - 4, 96, 8, 10, '#d7d0bd'); rect(x - 2, 89, 4, 7, '#e3c166');
    rect(x - 3, 111, 6, 6, '#5d8190'); rect(x - 1, 112, 1, 4, '#fff'); rect(x, 114, 3, 1, '#fff');
  } else { // Rocky-style museum steps and a tiny raised-fist statue
    rect(x - 26, 145, 52, 4, '#d8d3c9'); rect(x - 20, 150, 44, 4, '#d8d3c9'); rect(x - 14, 155, 36, 4, '#c3bbb0');
    rect(x - 3, 125, 8, 19, '#8d6f52'); rect(x - 5, 118, 12, 8, '#b98c5e'); rect(x + 1, 111, 4, 9, '#b98c5e'); rect(x + 3, 107, 3, 6, '#b98c5e');
  }
}
function drawAutumnMapBackground(): void {
  // Cozy top-down valley map with orchard plots, leafy canopies, and a winding farm path.
  const grass = ctx.createLinearGradient(0, 0, 0, HEIGHT); grass.addColorStop(0, '#9acb6b'); grass.addColorStop(1, '#5d9d53');
  ctx.fillStyle = grass; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  for (let y = 0; y < HEIGHT; y += 18) for (let x = 0; x < WIDTH; x += 24) {
    if ((x / 24 + y / 18) % 3 === 0) roundBox(x + 3, y + 5, 5, 3, '#b6d982', 2, '#b6d982');
  }
  // Autumn orchard trees have visible trunks, layered crowns, and bright fallen leaves.
  for (const [x, y, c] of [[18, 59, '#bd4935'], [72, 110, '#e6a83b'], [155, 61, '#a84232'], [273, 104, '#dc8e34'], [348, 59, '#a84232'], [459, 106, '#d4a13b'], [32, 231, '#c14c31'], [174, 222, '#dc9636'], [337, 229, '#b94632'], [450, 224, '#e5ab3d']] as Array<[number, number, string]>) {
    roundBox(x - 4, y + 3, 8, 18, '#79502f', 3, '#694329');
    ellipse(x, y - 1, 17, 14, '#326b42'); ellipse(x - 7, y - 5, 10, 10, c); ellipse(x + 6, y - 7, 11, 11, c); ellipse(x + 2, y + 2, 11, 9, c);
    ellipse(x - 6, y - 7, 3, 2, '#f4d66d', '#f4d66d'); ellipse(x + 7, y + 1, 3, 2, '#f4d66d', '#f4d66d');
  }
  // Small garden beds add the cultivated, storybook feel while leaving landmarks recognizable.
  for (const [x, y] of [[105, 45], [286, 46], [375, 107], [100, 222], [290, 225]] as Array<[number, number]>) {
    roundBox(x, y, 34, 18, '#80502f', 4, '#694329');
    for (let i = 0; i < 4; i++) { ellipse(x + 7 + i * 7, y + 8, 3, 4, i % 2 ? '#6caa4e' : '#e57d4f', '#517845'); }
  }
  // A pale dirt trail bends through the orchard and connects the three story markers to the level.
  ctx.beginPath(); ctx.moveTo(-8, 165); ctx.bezierCurveTo(85, 143, 145, 206, 229, 179); ctx.bezierCurveTo(318, 150, 392, 196, 489, 163); ctx.lineTo(489, 202); ctx.bezierCurveTo(392, 226, 318, 180, 233, 209); ctx.bezierCurveTo(143, 238, 85, 178, -8, 213); ctx.closePath(); ctx.fillStyle = '#d7b77b'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-8, 174); ctx.bezierCurveTo(86, 154, 145, 214, 230, 188); ctx.bezierCurveTo(318, 160, 392, 204, 489, 174); ctx.lineWidth = 2; ctx.strokeStyle = '#eed8a3'; ctx.stroke();
  // Draw the Liberty Bell with a wide wooden yoke, bronze body, and its famous crack.
  ctx.save(); ctx.translate(55, 15); ctx.scale(0.82, 0.82);
  // A broad, dark timber mount and two angled straps suspend the bell.
  roundBox(-48, 15, 96, 24, '#45312e', 5, '#302422');
  roundBox(-44, 8, 7, 9, '#68452a', 2); roundBox(-20, 8, 7, 9, '#68452a', 2); roundBox(14, 8, 7, 9, '#68452a', 2); roundBox(38, 8, 7, 9, '#68452a', 2);
  ctx.lineWidth = 5; ctx.strokeStyle = '#76542d'; ctx.beginPath(); ctx.moveTo(-26, 12); ctx.lineTo(-11, 52); ctx.moveTo(26, 12); ctx.lineTo(11, 52); ctx.stroke();
  // The bell widens toward its flared lip; layered strokes give it a clear metal edge.
  ctx.beginPath(); ctx.moveTo(-10, 39); ctx.lineTo(-13, 52); ctx.bezierCurveTo(-15, 69, -28, 82, -40, 91); ctx.quadraticCurveTo(0, 101, 40, 91); ctx.bezierCurveTo(28, 82, 15, 69, 13, 52); ctx.lineTo(10, 39); ctx.closePath();
  ctx.fillStyle = '#9b6b32'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#4f3926'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-13, 59); ctx.quadraticCurveTo(0, 65, 13, 59); ctx.moveTo(-31, 86); ctx.quadraticCurveTo(0, 94, 31, 86); ctx.strokeStyle = '#c3944a'; ctx.lineWidth = 2; ctx.stroke();
  // A dark, irregular line descends from the bell's shoulder to its broken rim.
  ctx.beginPath(); ctx.moveTo(1, 56); ctx.lineTo(-2, 65); ctx.lineTo(2, 72); ctx.lineTo(-1, 79); ctx.lineTo(4, 86); ctx.lineTo(1, 94); ctx.strokeStyle = '#382a22'; ctx.lineWidth = 2.5; ctx.stroke();
  // Clapper and the small bracket beneath the flared edge.
  ctx.beginPath(); ctx.moveTo(0, 48); ctx.lineTo(0, 70); ctx.strokeStyle = '#483326'; ctx.lineWidth = 3; ctx.stroke(); ellipse(0, 72, 3, 4, '#493328');
  ctx.restore();
  // Philadelphia City Hall: a symmetrical red-brick base with a pale clock tower and dome.
  roundBox(205, 69, 70, 19, '#9d4f3c', 2, '#704034');
  roundBox(211, 64, 58, 7, '#c18d62', 2, '#704034');
  // Repeating pale windows make the broad lower facade read as a civic building.
  for (const wx of [211, 222, 233, 247, 258, 269]) {
    roundBox(wx, 73, 5, 8, '#dce5df', 1, '#73493d');
    rect(wx + 2, 73, 1, 8, '#91b7c2'); rect(wx, 77, 5, 1, '#fff4dc');
  }
  // Central clock tower steps inward above the main roofline.
  roundBox(226, 48, 28, 18, '#eee7d7', 2, '#9b8063');
  for (const tx of [228, 234, 240, 246, 252]) rect(tx, 48, 1, 4, '#b5aa98');
  roundBox(230, 35, 20, 14, '#f4eee1', 2, '#9b8063');
  ellipse(240, 42, 6, 6, '#a9d5df', '#8d7259');
  ctx.beginPath(); ctx.moveTo(240, 42); ctx.lineTo(240, 38); ctx.moveTo(240, 42); ctx.lineTo(243, 43); ctx.strokeStyle = '#314a50'; ctx.lineWidth = 1; ctx.stroke();
  // Open belfry and rounded copper dome with a small spire.
  roundBox(233, 26, 14, 10, '#eee7d7', 4, '#9b8063');
  roundBox(235, 27, 3, 8, '#8db8c1', 2, '#8db8c1'); roundBox(242, 27, 3, 8, '#8db8c1', 2, '#8db8c1');
  ctx.beginPath(); ctx.moveTo(232, 27); ctx.quadraticCurveTo(232, 18, 240, 17); ctx.quadraticCurveTo(248, 18, 248, 27); ctx.closePath(); ctx.fillStyle = '#a9643e'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#76513c'; ctx.stroke();
  roundBox(239, 12, 2, 7, '#bd9e65', 1, '#8b714b'); ellipse(240, 11, 1.5, 2.5, '#e6d5a2', '#8b714b');
  // Rocky-style bronze runner on the museum steps, posed with both fists raised overhead.
  roundBox(393, 86, 54, 5, '#cfc8b8', 2); roundBox(398, 81, 44, 5, '#e3ddce', 2); roundBox(403, 76, 34, 5, '#d4cec1', 2);
  ellipse(420, 72, 7, 10, '#514c43'); // shorts and legs
  roundBox(414, 78, 5, 9, '#514c43', 2); roundBox(422, 78, 5, 9, '#514c43', 2);
  roundBox(412, 84, 7, 3, '#423e38', 2); roundBox(422, 84, 7, 3, '#423e38', 2);
  ellipse(420, 58, 7, 11, '#70695d'); // chest and waist
  // Arms angle outward then upward, with raised fists clearly separated from the head.
  ctx.lineCap = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = '#70695d'; ctx.beginPath();
  ctx.moveTo(415, 55); ctx.lineTo(409, 49); ctx.lineTo(406, 40); ctx.moveTo(425, 55); ctx.lineTo(431, 49); ctx.lineTo(434, 40); ctx.stroke();
  ellipse(406, 37, 3.5, 4, '#514c43'); ellipse(434, 37, 3.5, 4, '#514c43');
  ellipse(420, 45, 5, 6, '#514c43'); // head
  ctx.beginPath(); ctx.moveTo(416, 43); ctx.quadraticCurveTo(420, 39, 424, 43); ctx.strokeStyle = '#332f2b'; ctx.lineWidth = 2; ctx.stroke();
}
function drawSign(index: number, x: number): void {
  // Sign boards intentionally contain no lettering, as requested.
  roundBox(x - 4, 151, 8, 36, '#78482d', 3);
  roundBox(x - 35, 133, 70, 28, '#ac6740', 7);
  roundBox(x - 30, 137, 60, 18, '#d99056', 5, '#9b5b38');
}
function drawMap(): void {
  drawAutumnMapBackground();
  // A dotted road links the three information stops to the playable arena.
  for (let x = 60; x < 450; x += 13) rect(x, 185, 6, 3, '#fff1c6');
  for (let i = 0; i < 3; i++) drawSign(i, stopX[i]);
  // The boss level is a large red destination marker instead of a fourth signpost.
  ellipse(stopX[3], 150, 23, 23, '#d94a3e', '#fff0dc'); ellipse(stopX[3], 150, 12, 12, '#f1765d', '#a83531');
  ellipse(stopX[3], 150, 4, 4, '#fff1d2', '#fff1d2');
  // The four map positions are one horizontal navigation row for the two arrow controls.
  drawFootballer(stopX[selection] - 29, 170, 1.15);
  for (let i = 0; i < 4; i++) if (i === selection) { rect(stopX[i] - 4, 185, 3, 3, '#ffe35b'); rect(stopX[i] + 1, 185, 3, 3, '#ffe35b'); }
  text('◀  ▶ MOVE     ● SELECT', 240, 254, 8, '#fff');
}
function drawPopup(): void {
  drawMap(); rect(48, 65, 384, 114, '#273755'); rect(53, 70, 374, 104, '#fff4ce');
  const lines = wrap(messages[selection], 35);
  lines.forEach((line, i) => {
    ctx.font = '600 13px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#253247';
    ctx.fillText(line, 240, 88 + i * 16, 350);
  });
  text('Tap ● to close', 240, 158, 11, '#a7443d');
}
function drawLevel(): void {
  background();
  text('RIVALRY RUMBLE', 240, 25, 9, '#fff8d8');
  rect(55, 162, 370, 10, '#397c45'); rect(55, 172, 370, 8, '#b08a56');
  // Three small lamps give the player a clear count of successful stomps.
  text('HITS', 240, 54, 6); for (let i = 0; i < 3; i++) { rect(216 + i * 17, 65, 10, 10, i < bossHits ? '#ffdc4d' : '#526274'); }
  if (scene === 'level') { drawBoss(); drawFootballer(player.x, player.y); }
  text('Hold ◀ ▶ to run   Tap ● to jump', 240, 252, 12, '#fff');
}
function drawEnd(win: boolean): void {
  drawLevel(); rect(62, 86, 356, 85, '#1b2e4b'); rect(67, 91, 346, 75, win ? '#f0c74c' : '#bf4056');
  text(win ? "You've won!" : 'GAME OVER', 240, 115, 13, '#fff8d8');
  text(win ? 'HAPPY BROAD STREET BOWL!' : 'RETURNING TO THE MAP', 240, 143, 6, '#fff');
  if (win) text('TAP ● FOR MAP', 240, 191, 7, '#fff');
}

function setHint(): void {
  const hint = document.querySelector<HTMLElement>('#hint')!;
  hint.textContent = scene === 'title' ? 'Tap the button to begin' : scene === 'map' ? 'Use arrows to choose a stop; button to select' : scene === 'message' ? 'Tap the button to close' : scene === 'level' ? 'Hold left/right to move; tap button to jump' : scene === 'win' ? 'Tap the button to return to the map' : 'Game over — returning to map';
}
function startLevel(): void {
  scene = 'level'; bossHits = 0; player = { x: 72, y: 135, vx: 0, vy: 0, w: 18, h: 27 }; boss = { x: 365, y: 130, vx: -1.15, vy: 0, w: 44, h: 46 };
}
function action(): void {
  if (scene === 'title') scene = 'map';
  else if (scene === 'map') { if (selection < 3) { popupReturn = 'map'; scene = 'message'; } else startLevel(); }
  else if (scene === 'message') scene = popupReturn;
  else if (scene === 'level' && player.y + player.h >= 162) { player.vy = -5.1; }
  else if (scene === 'win') scene = 'map';
  setHint();
}
function update(delta: number): void {
  if (scene === 'map') {
    const direction = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    if (direction === 0) mapRepeatMs = 0;
    else {
      mapRepeatMs += delta;
      // Trigger immediately, then repeat while held; no sub-step rounding can swallow taps.
      if (mapRepeatMs === delta || mapRepeatMs >= 220) {
        selection = Math.max(0, Math.min(3, selection + direction));
        mapRepeatMs = 0;
      }
    }
  }
  if (scene === 'level') {
    const speed = 2.0 * delta / 16.67;
    player.vx = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    player.x = Math.max(55, Math.min(407, player.x + player.vx * speed));
    player.vy += 0.22 * delta / 16.67; player.y += player.vy * delta / 16.67;
    if (player.y + player.h >= 162) { player.y = 162 - player.h; player.vy = 0; }
    boss.x += boss.vx * delta / 16.67;
    if (boss.x < 65 || boss.x + boss.w > 415) boss.vx *= -1;
    const overlapX = player.x + player.w > boss.x && player.x < boss.x + boss.w;
    const nearTop = player.y + player.h >= boss.y && player.y + player.h <= boss.y + 10;
    const overlapY = player.y + player.h > boss.y + 5 && player.y < boss.y + boss.h;
    if (overlapX && nearTop && player.vy > 0) {
      bossHits++; player.vy = -4.3; boss.vx *= -1;
      if (bossHits >= 3) { scene = 'win'; setHint(); }
    } else if (overlapX && overlapY) { scene = 'lose'; setHint(); window.setTimeout(() => { scene = 'map'; setHint(); }, 1500); }
  }
}
function frame(time: number): void {
  const delta = Math.min(32, time - (lastTime || time)); lastTime = time; update(delta);
  if (scene === 'title') drawTitle(); else if (scene === 'map') drawMap(); else if (scene === 'message') drawPopup(); else if (scene === 'level') drawLevel(); else drawEnd(scene === 'win');
  requestAnimationFrame(frame);
}

// Buttons respond to touch, mouse and keyboard, while pointer capture supports held movement.
function bindHold(id: string, control: Control): void {
  const button = document.querySelector<HTMLButtonElement>(`#${id}`)!;
  button.addEventListener('pointerdown', (event: PointerEvent) => {
    event.preventDefault(); button.classList.add('pressed');
    if (scene === 'map') { selection = Math.max(0, Math.min(3, selection + (control === 'right' ? 1 : -1))); return; }
    held.add(control); button.setPointerCapture(event.pointerId);
  });
  const release = (): void => { held.delete(control); button.classList.remove('pressed'); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
}
bindHold('left', 'left'); bindHold('right', 'right');
document.querySelector<HTMLButtonElement>('#action')!.addEventListener('pointerdown', (event: PointerEvent) => { event.preventDefault(); action(); });
window.addEventListener('keydown', (event: KeyboardEvent) => { if (event.key === 'ArrowLeft') held.add('left'); if (event.key === 'ArrowRight') held.add('right'); if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) action(); });
window.addEventListener('keyup', (event: KeyboardEvent) => { if (event.key === 'ArrowLeft') held.delete('left'); if (event.key === 'ArrowRight') held.delete('right'); });
setHint(); requestAnimationFrame(frame);
