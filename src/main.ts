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
let boss: Actor = { x: 365, y: 194, vx: -1.15, vy: 0, w: 30, h: 31 };
let bossHits = 0;
let jumpQueued = false;
let lastTime = 0;
let popupReturn: 'map' | 'level' = 'map';
let mapRepeatMs = 0;

// Small drawing helpers keep every scene crisp and deliberately low-resolution.
function rect(x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function text(value: string, x: number, y: number, size = 8, color = '#fff', align: CanvasTextAlign = 'center'): void {
  ctx.font = `bold ${size}px "Press Start 2P", monospace`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineWidth = size > 9 ? 3 : 2; ctx.strokeStyle = '#17233a'; ctx.strokeText(value, x, y); ctx.fillStyle = color; ctx.fillText(value, x, y);
}
function wrap(value: string, maxChars: number): string[] {
  const words = value.split(' '); const lines: string[] = []; let line = '';
  for (const word of words) { const candidate = line ? `${line} ${word}` : word; if (candidate.length > maxChars && line) { lines.push(line); line = word; } else line = candidate; }
  if (line) lines.push(line); return lines;
}
function background(): void {
  rect(0, 0, WIDTH, HEIGHT, '#78cbe5');
  // Blocky clouds and distant hills establish the bright storybook platform-game world.
  for (const [x, y] of [[42, 36], [235, 26], [390, 50]]) { rect(x, y, 39, 9, '#f7f4d8'); rect(x + 8, y - 7, 20, 8, '#f7f4d8'); }
  rect(0, 170, WIDTH, 28, '#62b75b'); rect(0, 194, WIDTH, 76, '#e4c37b');
  rect(0, 194, WIDTH, 5, '#408b4b');
  for (let x = 8; x < WIDTH; x += 30) { rect(x, 213 + ((x / 30) % 2) * 10, 10, 9, '#c59d59'); rect(x + 14, 230, 8, 8, '#c59d59'); }
}
function drawFootballer(x: number, y: number, scale = 1): void {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(scale, scale);
  rect(3, 1, 12, 7, '#e9a33d'); rect(1, 4, 16, 4, '#e9a33d'); rect(4, 8, 10, 3, '#f3d2a0');
  rect(3, 11, 12, 9, '#1681a5'); rect(1, 12, 4, 6, '#e9a33d'); rect(13, 12, 4, 6, '#e9a33d');
  rect(4, 20, 4, 5, '#29364b'); rect(11, 20, 4, 5, '#29364b'); rect(3, 25, 6, 2, '#f5f1dc'); rect(10, 25, 7, 2, '#f5f1dc');
  rect(12, 5, 2, 2, '#202532'); ctx.restore();
}
function drawBoss(): void {
  // Original helmeted turtle-like rival; the shirt label is a gameplay detail from the brief.
  const x = boss.x, y = boss.y;
  rect(x + 4, y, 22, 7, '#e5b653'); rect(x + 1, y + 5, 28, 6, '#d89337'); rect(x + 7, y + 10, 18, 8, '#f2d49a');
  rect(x + 3, y + 18, 24, 12, '#47c8a5'); rect(x + 5, y + 18, 6, 4, '#ef6394'); rect(x + 13, y + 21, 6, 4, '#f5dc55'); rect(x + 21, y + 18, 5, 5, '#9a7be6');
  rect(x + 17, y + 19, 3, 8, '#f4eee2'); rect(x + 17, y + 25, 5, 3, '#f4eee2');
  text('Liam', x + 15, y + 24, 4, '#17233a'); rect(x + 5, y + 29, 8, 3, '#745537'); rect(x + 19, y + 29, 8, 3, '#745537');
  rect(x + 20, y + 12, 2, 2, '#202532');
}
function drawTitle(): void {
  background();
  rect(38, 56, 404, 88, '#183d70'); rect(43, 61, 394, 78, '#f3c84b');
  text('BROAD STREET', 240, 87, 17, '#fff8d8'); text('BOWL 2026', 240, 117, 19, '#fff8d8');
  text('A PHILLY FOOTBALL ADVENTURE', 240, 164, 7, '#173d52');
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
  // The menu is a bird's-eye view: landmarks sit in the distance behind a park-like trail.
  rect(0, 0, WIDTH, HEIGHT, '#bd7543');
  rect(0, 36, WIDTH, 108, '#d99550');
  rect(0, 146, WIDTH, 124, '#80523b');
  // Tree crowns frame the route like an autumn park seen from above.
  for (const [x, y, c] of [[18, 59, '#bd4935'], [72, 110, '#e6a83b'], [155, 61, '#a84232'], [273, 104, '#dc8e34'], [348, 59, '#a84232'], [459, 106, '#d4a13b'], [32, 231, '#c14c31'], [174, 222, '#dc9636'], [337, 229, '#b94632'], [450, 224, '#e5ab3d']] as Array<[number, number, string]>) {
    rect(x - 12, y - 8, 24, 17, c); rect(x - 8, y - 13, 16, 27, c); rect(x - 3, y + 4, 6, 10, '#684630');
  }
  // Cream walking path winds across the autumn ground beneath the signposts.
  rect(0, 155, WIDTH, 43, '#e2bd78'); rect(0, 164, WIDTH, 25, '#f0d49a');
  rect(0, 204, WIDTH, 37, '#d5aa69');
  for (let x = 14; x < WIDTH; x += 31) { rect(x, 171 + (x % 3) * 2, 3, 3, '#b47a49'); }
  // Skyline landmarks appear as distant background landmarks, rather than props beside the path.
  rect(29, 63, 46, 31, '#dbc99e'); rect(36, 57, 32, 7, '#e9d9b7'); rect(42, 49, 20, 9, '#d4be8b');
  rect(213, 53, 54, 42, '#ded1b7'); rect(220, 43, 40, 11, '#d2c2a0'); rect(228, 27, 24, 17, '#e6dac2'); rect(235, 18, 10, 10, '#c7aa64');
  rect(390, 72, 54, 23, '#d8d1c2'); rect(396, 66, 42, 7, '#e9e2d6');
  rect(413, 55, 8, 12, '#93765a'); rect(411, 49, 12, 7, '#b39469'); rect(415, 41, 3, 9, '#b39469');
}
function drawSign(index: number, x: number): void {
  rect(x - 2, 154, 4, 31, '#78482d'); rect(x - 25, 139, 50, 20, '#ac6740'); rect(x - 22, 142, 44, 14, '#d99056');
  text(index < 3 ? ['BELL', 'CITY HALL', 'ROCKY'][index] : 'LEVEL', x, 150, index === 1 ? 4 : 5, '#fff2cc');
}
function drawMap(): void {
  drawAutumnMapBackground();
  text('AUTUMN IN PHILLY', 240, 18, 11, '#fff8d8');
  // A dotted road links the three information stops to the playable arena.
  for (let x = 60; x < 450; x += 13) rect(x, 185, 6, 3, '#fff1c6');
  for (let i = 0; i < 3; i++) drawSign(i, stopX[i]);
  drawSign(3, stopX[3]); rect(398, 122, 44, 28, '#d4e1df'); rect(405, 128, 30, 15, '#88b7bc'); rect(409, 132, 22, 11, '#172b46');
  // The four map positions are one horizontal navigation row for the two arrow controls.
  drawFootballer(stopX[selection] - 8, 158, 0.9);
  for (let i = 0; i < 4; i++) if (i === selection) { rect(stopX[i] - 4, 185, 3, 3, '#ffe35b'); rect(stopX[i] + 1, 185, 3, 3, '#ffe35b'); }
  text('◀  ▶ MOVE     ● SELECT', 240, 250, 8, '#fff');
}
function drawPopup(): void {
  drawMap(); rect(48, 65, 384, 114, '#273755'); rect(53, 70, 374, 104, '#fff4ce');
  const lines = wrap(messages[selection], 31); lines.forEach((line, i) => text(line, 240, 89 + i * 18, 9, '#273755'));
  text('● CLOSE', 240, 157, 8, '#a7443d');
}
function drawLevel(): void {
  background();
  text('RIVALRY RUMBLE', 240, 25, 9, '#fff8d8');
  rect(55, 162, 370, 10, '#397c45'); rect(55, 172, 370, 8, '#b08a56');
  // Three small lamps give the player a clear count of successful stomps.
  text('HITS', 240, 54, 6); for (let i = 0; i < 3; i++) { rect(216 + i * 17, 65, 10, 10, i < bossHits ? '#ffdc4d' : '#526274'); }
  if (scene === 'level') { drawBoss(); drawFootballer(player.x, player.y); }
  text('HOLD ◀ ▶ TO RUN   TAP ● TO JUMP', 240, 252, 6, '#fff');
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
  scene = 'level'; bossHits = 0; player = { x: 72, y: 143, vx: 0, vy: 0, w: 18, h: 27 }; boss = { x: 365, y: 141, vx: -1.15, vy: 0, w: 30, h: 31 };
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
  button.addEventListener('pointerdown', (event: PointerEvent) => { event.preventDefault(); held.add(control); button.classList.add('pressed'); button.setPointerCapture(event.pointerId); });
  const release = (): void => { held.delete(control); button.classList.remove('pressed'); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  button.addEventListener('click', (event: MouseEvent) => { event.preventDefault(); if (scene === 'map') { selection = Math.max(0, Math.min(3, selection + (control === 'right' ? 1 : -1))); } });
}
bindHold('left', 'left'); bindHold('right', 'right');
document.querySelector<HTMLButtonElement>('#action')!.addEventListener('pointerdown', (event: PointerEvent) => { event.preventDefault(); action(); });
window.addEventListener('keydown', (event: KeyboardEvent) => { if (event.key === 'ArrowLeft') held.add('left'); if (event.key === 'ArrowRight') held.add('right'); if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) action(); });
window.addEventListener('keyup', (event: KeyboardEvent) => { if (event.key === 'ArrowLeft') held.delete('left'); if (event.key === 'ArrowRight') held.delete('right'); });
setHint(); requestAnimationFrame(frame);
