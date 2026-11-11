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
interface FootballProjectile { x: number; y: number; vx: number; vy: number; }

const messages: string[] = [
  'Geri leads by 1 in the overall series: 4-3',
  'Both teams are competing for a playoff bye this year, so the stakes are higher than ever',
  "In addition to eternal bragging rights, this year's winner will be treated to dinner by the loser. Can Geri protect his lead from the evil Liam?"
];
// 2026 regular-season totals below reflect NFL.com player stats checked Nov 11, 2026.
const winFacts: string[] = [
  'Jayden Daniels has passed for 1,250 yards and 7 touchdowns in 2026.',
  'James Cook has rushed for 814 yards and 8 touchdowns in 2026.',
  'Bhayshul Tuten has rushed for 521 yards and 4 touchdowns in 2026.',
  'Zay Flowers has 614 receiving yards and 3 touchdowns in 2026.',
  'Rashee Rice has 292 receiving yards and 2 touchdowns in 2026.',
  'Brock Bowers has 658 receiving yards and 6 touchdowns in 2026.'
];
const lossFacts: string[] = [
  'Drake Maye has passed for 2,282 yards and 18 touchdowns in 2026.',
  'Ollie Gordon has rushed for 463 yards and 4 touchdowns in 2026.',
  'Jonathan Taylor has rushed for 656 yards and 8 touchdowns in 2026.',
  'Chris Olave has 734 receiving yards and 2 touchdowns in 2026.',
  'Jameson Williams has 468 receiving yards and 5 touchdowns in 2026.'
];
const stopX = [105, 210, 315, 420];
// Approximate centerline heights where each stop meets the winding trail.
const stopRoadY = [182, 193, 183, 178];
let scene: Scene = 'title';
let selection = 0;
let held = new Set<Control>();
let player: Actor = { x: 58, y: 192, vx: 0, vy: 0, w: 24, h: 38 };
let boss: Actor = { x: 365, y: 178, vx: -1.15, vy: 0, w: 44, h: 46 };
let bossHits = 0;
let bossThrowTimerMs = 0;
let bossTurnTimerMs = 0;
let bossNextTurnMs = 1400;
let footballs: FootballProjectile[] = [];
let jumpQueued = false;
let lastTime = 0;
let popupReturn: 'map' | 'level' = 'map';
let mapRepeatMs = 0;
let endFact = winFacts[0];
let animationTimeMs = 0;
let eagleCycleIndex = -1;
let eagleFlightElapsedMs = 0;
let mapWalkerX = stopX[0] - 29;
let mapWalkerY = stopRoadY[0] - 34;
let mapWalkFrom = { x: mapWalkerX, y: mapWalkerY };
let mapWalkTo = { x: mapWalkerX, y: mapWalkerY };
let mapWalkProgress = 1;

// Choose an outcome-specific fact so each result only uses its requested player group.
function randomFact(facts: string[]): string {
  return facts[Math.floor(Math.random() * facts.length)];
}

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
  ctx.font = `700 ${size}px Silkscreen, monospace`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = '#392d2a'; ctx.strokeText(value, x, y); ctx.fillStyle = color; ctx.fillText(value, x, y);
}
function wrap(value: string, maxChars: number): string[] {
  const words = value.split(' '); const lines: string[] = []; let line = '';
  for (const word of words) { const candidate = line ? `${line} ${word}` : word; if (candidate.length > maxChars && line) { lines.push(line); line = word; } else line = candidate; }
  if (line) lines.push(line); return lines;
}
function background(): void {
  // A limited palette and layered tile bands give the title and arena a cozy pixel-farm feel.
  rect(0, 0, WIDTH, HEIGHT, '#77b8d0');
  for (let x = 0; x < WIDTH; x += 32) {
    rect(x + 5, 31 + (x % 3) * 3, 24, 5, '#a3d6dd'); rect(x + 16, 25 + (x % 2) * 4, 13, 5, '#c5e6d7');
  }
  rect(0, 92, WIDTH, 88, '#6eaa57'); rect(0, 180, WIDTH, 90, '#bd8c55');
  rect(0, 177, WIDTH, 9, '#437d49'); rect(0, 185, WIDTH, 5, '#91bc58');
  // Subtle soil tile seams and grass flecks provide texture without crossing the play area.
  for (let x = 0; x < WIDTH; x += 24) for (let y = 194; y < HEIGHT; y += 20) {
    rect(x + (y % 2) * 5, y, 1, 12, '#a97549'); rect(x + 7, y + 5, 3, 2, '#d6ab69');
  }
  for (let x = 8; x < WIDTH; x += 34) { rect(x, 124 + (x % 3) * 5, 5, 3, '#b5d96b'); rect(x + 11, 156, 3, 2, '#d1df82'); }
}
function drawFootballer(x: number, y: number, scale = 1): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ellipse(12, 37, 12, 3, '#5b4939', '#5b4939');
  // White pants and blue socks/shoes follow the reference uniform silhouette.
  roundBox(4, 25, 8, 11, '#f7f6ed', 2); roundBox(14, 25, 8, 11, '#f7f6ed', 2);
  roundBox(6, 34, 5, 4, '#1765b3', 1); roundBox(16, 34, 5, 4, '#1765b3', 1);
  roundBox(2, 37, 10, 3, '#fffdf5', 1); roundBox(14, 37, 10, 3, '#fffdf5', 1);
  // Blue jersey, padded shoulders, and bare forearms.
  roundBox(3, 14, 18, 14, '#1765b3', 5); ellipse(3, 19, 4, 6, '#1765b3'); ellipse(21, 19, 4, 6, '#1765b3');
  roundBox(0, 19, 4, 10, '#e9bd91', 2); roundBox(20, 19, 4, 10, '#e9bd91', 2);
  roundBox(0, 27, 4, 4, '#fffdf5', 1); roundBox(20, 27, 4, 4, '#fffdf5', 1);
  text('80', 12, 22, 8, '#d7ecff');
  // White face mask over a blue helmet keeps the player's face and position easy to read.
  ellipse(12, 10, 9, 9, '#efc396');
  roundBox(2, 3, 20, 10, '#1765b3', 5, '#114b88');
  roundBox(0, 10, 20, 4, '#fffdf5', 2, '#d7e3ec');
  roundBox(1, 12, 3, 8, '#fffdf5', 1); roundBox(5, 14, 2, 6, '#fffdf5', 1); roundBox(10, 14, 2, 6, '#fffdf5', 1); roundBox(15, 14, 2, 6, '#fffdf5', 1);
  rect(7, 8, 2, 2, '#2a2927'); rect(15, 8, 2, 2, '#2a2927');
  // A pale helmet stripe and gloss give the blue shell a dimensional sports-helmet look.
  ctx.beginPath(); ctx.moveTo(9, 4); ctx.lineTo(13, 4); ctx.lineTo(17, 8); ctx.lineTo(13, 8); ctx.closePath(); ctx.fillStyle = '#b9dcff'; ctx.fill();
  ctx.restore();
}
function drawBoss(): void {
  // Draw Liam as a friendly cartoon opponent inspired by the supplied portrait.
  const x = boss.x, y = boss.y;
  ellipse(x + 22, y + 43, 21, 5, '#5a4937', '#5a4937');
  // Plaid overshirt, with broad intersecting lines that remain visible at phone scale.
  roundBox(x + 3, y + 24, 39, 20, '#8d998d', 7, '#3f4c47');
  ctx.save(); ctx.beginPath(); ctx.roundRect(x + 4, y + 25, 37, 18, 6); ctx.clip();
  ctx.strokeStyle = '#303c3a'; ctx.lineWidth = 1.5;
  for (const px of [x + 11, x + 23, x + 35]) { ctx.beginPath(); ctx.moveTo(px, y + 25); ctx.lineTo(px - 3, y + 44); ctx.stroke(); }
  for (const py of [y + 30, y + 38]) { ctx.beginPath(); ctx.moveTo(x + 3, py); ctx.lineTo(x + 42, py); ctx.stroke(); }
  ctx.strokeStyle = '#d0c3a7'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 17, y + 25); ctx.lineTo(x + 14, y + 44); ctx.moveTo(x + 4, y + 34); ctx.lineTo(x + 42, y + 34); ctx.stroke();
  ctx.restore();
  // Orange tee and a bright label panel keep the requested name easy to read.
  roundBox(x + 14, y + 28, 17, 15, '#ec824e', 3, '#b75736');
  roundBox(x + 9, y + 33, 27, 11, '#365858', 3, '#263c3c');
  text('LIAM', x + 22.5, y + 38.5, 10, '#ffffff');
  // Face, ears, curly dark hair, eyes, and a broad friendly smile.
  ellipse(x + 22, y + 18, 13, 13, '#edbd91');
  ellipse(x + 9, y + 18, 3, 4, '#e2aa80'); ellipse(x + 35, y + 18, 3, 4, '#e2aa80');
  ellipse(x + 13, y + 9, 5, 6, '#302622'); ellipse(x + 19, y + 7, 6, 7, '#302622'); ellipse(x + 26, y + 8, 6, 7, '#302622'); ellipse(x + 31, y + 11, 5, 6, '#302622');
  ellipse(x + 17, y + 18, 1.3, 1.7, '#282628', '#282628'); ellipse(x + 27, y + 18, 1.3, 1.7, '#282628', '#282628');
  ctx.beginPath(); ctx.moveTo(x + 16, y + 23); ctx.quadraticCurveTo(x + 22, y + 31, x + 29, y + 22); ctx.closePath(); ctx.fillStyle = '#753d36'; ctx.fill();
  roundBox(x + 17, y + 23, 11, 3, '#fff9e8', 1, '#fff9e8');
}
function drawFootball(projectile: FootballProjectile): void {
  // Draw a small brown football with pale laces and end stripes, rotated along its flight.
  const angle = Math.atan2(projectile.vy, projectile.vx);
  ctx.save(); ctx.translate(projectile.x, projectile.y); ctx.rotate(angle);
  ellipse(0, 0, 8, 4.5, '#9b542d', '#492d25');
  ctx.strokeStyle = '#fff0d3'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.moveTo(-1, -2); ctx.lineTo(-1, 2); ctx.moveTo(1, -2); ctx.lineTo(1, 2); ctx.stroke();
  ctx.restore();
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
  // A dense overhead autumn farm scene: blue water, golden ground, orchard, garden, and farmhouse.
  rect(0, 0, WIDTH, HEIGHT, '#bd8249');
  rect(0, 0, WIDTH, 31, '#4f91b2');
  for (let x = 0; x < WIDTH; x += 17) { rect(x + 3, 4 + (x % 3), 8, 3, '#79b9ca'); rect(x + 10, 18 - (x % 2) * 4, 6, 2, '#357b9d'); }
  // Pixel-stone shoreline and bank separate the river from the farm soil.
  for (let x = 0; x < WIDTH; x += 12) { rect(x, 28 + (x % 4), 8, 4, '#6a493b'); rect(x + 4, 32 + (x % 3), 7, 3, '#d4a263'); }
  rect(0, 36, WIDTH, HEIGHT - 36, '#b77c45');
  for (let y = 39; y < HEIGHT; y += 16) for (let x = 0; x < WIDTH; x += 20) {
    if ((x / 20 + y / 16) % 3 === 0) rect(x + 4, y + 3, 3, 2, '#d69a57');
    if ((x / 20 + y / 16) % 5 === 0) rect(x + 12, y + 10, 2, 2, '#92613e');
  }
  // Orchard trees stay clear of the path: each canopy is a layered pixel cluster above the trail.
  for (const [x, y, leaf] of [[18, 69, '#a93831'], [73, 117, '#db812f'], [153, 65, '#b33a34'], [350, 66, '#a93533'], [459, 111, '#d28b32']] as Array<[number, number, string]>) {
    rect(x - 4, y + 8, 8, 22, '#68442f'); rect(x - 2, y + 4, 5, 14, '#7c4c32');
    rect(x - 18, y - 7, 12, 10, '#533a36'); rect(x - 12, y - 14, 14, 13, leaf); rect(x + 1, y - 13, 14, 13, leaf);
    rect(x - 17, y - 1, 15, 11, leaf); rect(x - 4, y - 5, 17, 16, leaf); rect(x + 10, y - 2, 8, 10, leaf);
    rect(x - 11, y - 9, 4, 3, '#f0b74e'); rect(x + 4, y + 1, 3, 3, '#f3c45b');
    rect(x - 13, y + 11, 3, 2, '#8f5836'); rect(x + 8, y + 13, 3, 2, '#8f5836');
  }
  // Garden plots fill the lower corners with recognizable rows of crops and pumpkin patches.
  for (const [x, y, color] of [[18, 207, '#69994a'], [60, 218, '#bd493b'], [378, 209, '#5c9848'], [423, 218, '#d27a2f']] as Array<[number, number, string]>) {
    rect(x, y, 38, 30, '#82502f'); rect(x + 2, y + 3, 34, 2, '#bc8650');
    for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
      const px = x + 5 + col * 8, py = y + 8 + row * 11;
      rect(px + 2, py - 4, 2, 5, '#416f3b'); rect(px, py - 2, 6, 4, color);
      rect(px + 1, py - 1, 2, 2, color === '#bd493b' || color === '#d27a2f' ? '#e6ad4d' : '#89ba54');
    }
  }
  // Central farmhouse with a warm timber facade, roof tiles, windows, and porch.
  rect(190, 108, 100, 57, '#68422f'); rect(195, 112, 90, 47, '#d69c56');
  rect(186, 105, 108, 20, '#803b32'); rect(191, 100, 98, 14, '#a94a36'); rect(201, 96, 78, 9, '#bd5a3a');
  for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) rect(194 + col * 16 + (row % 2) * 7, 103 + row * 6, 11, 3, '#d27a47');
  rect(207, 121, 16, 15, '#6c4938'); rect(210, 124, 10, 9, '#92c2d0'); rect(257, 121, 16, 15, '#6c4938'); rect(260, 124, 10, 9, '#92c2d0');
  rect(231, 129, 17, 30, '#744633'); rect(234, 132, 11, 27, '#a96743');
  rect(221, 159, 38, 5, '#785038'); rect(226, 153, 28, 6, '#bb8250');
  // Winding pixel-edged dirt path links the signs; keep it clear of every tree canopy and crop bed.
  ctx.beginPath(); ctx.moveTo(-8, 161); ctx.lineTo(45, 157); ctx.lineTo(97, 164); ctx.lineTo(148, 179); ctx.lineTo(204, 174); ctx.lineTo(257, 164); ctx.lineTo(312, 159); ctx.lineTo(369, 167); ctx.lineTo(430, 157); ctx.lineTo(488, 161);
  ctx.lineTo(488, 198); ctx.lineTo(430, 196); ctx.lineTo(369, 205); ctx.lineTo(312, 197); ctx.lineTo(257, 202); ctx.lineTo(204, 211); ctx.lineTo(148, 215); ctx.lineTo(97, 198); ctx.lineTo(45, 194); ctx.lineTo(-8, 199); ctx.closePath(); ctx.fillStyle = '#d7b77b'; ctx.fill();
  for (const [x, y] of [[34, 175], [93, 179], [145, 197], [288, 179], [347, 184], [411, 179]] as Array<[number, number]>) { rect(x, y, 7, 3, '#b18455'); rect(x + 14, y + 8, 5, 2, '#edcf91'); }
  // Draw the Liberty Bell with a wide wooden yoke, bronze body, and its famous crack.
  ctx.save(); ctx.translate(55, 15); ctx.scale(0.68, 0.68);
  // A broad, dark timber mount and two angled straps suspend the bell.
  roundBox(-48, 15, 96, 24, '#45312e', 5, '#302422');
  roundBox(-44, 8, 7, 9, '#68452a', 2); roundBox(-20, 8, 7, 9, '#68452a', 2); roundBox(14, 8, 7, 9, '#68452a', 2); roundBox(38, 8, 7, 9, '#68452a', 2);
  // Keep the yoke fixed while the straps, bell, and clapper swing beneath it every five seconds.
  const bellPhase = animationTimeMs % 5000;
  const swingProgress = bellPhase / 900;
  const bellAngle = bellPhase < 900 ? Math.sin(swingProgress * Math.PI * 4) * 0.2 * (1 - swingProgress) : 0;
  ctx.save(); ctx.translate(0, 15); ctx.rotate(bellAngle); ctx.translate(0, -15);
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
  const roadY = stopRoadY[index];
  roundBox(x - 4, roadY - 31, 8, 31, '#78482d', 3);
  roundBox(x - 35, roadY - 51, 70, 28, '#ac6740', 7);
  roundBox(x - 30, roadY - 47, 60, 18, '#d99056', 5, '#9b5b38');
}
function selectMapStop(nextSelection: number): void {
  const next = Math.max(0, Math.min(3, nextSelection));
  if (next === selection) return;
  mapWalkFrom = { x: mapWalkerX, y: mapWalkerY };
  selection = next;
  mapWalkTo = { x: stopX[selection] - 29, y: stopRoadY[selection] - 34 };
  mapWalkProgress = 0;
}
function drawMenuAnimations(): void {
  // Loop short pixel highlights across the river strip to suggest moving water.
  const waterOffset = (animationTimeMs * 0.018) % 40;
  for (let i = 0; i < 7; i++) {
    const x = (i * 79 + waterOffset) % (WIDTH + 24) - 12;
    const y = 5 + (i % 3) * 8;
    rect(x, y, 10 + (i % 2) * 5, 2, i % 2 ? '#9bd4dc' : '#78b9cb');
    rect(x + 4, y + 3, 5, 1, '#3d83a0');
  }
  // A handful of leaves drift down from the tree line at slightly different speeds.
  const leafX = [37, 103, 181, 250, 322, 399, 466, 62, 359];
  for (let i = 0; i < leafX.length; i++) {
    const y = 26 + (animationTimeMs * (0.018 + (i % 3) * 0.003) + i * 37) % 150;
    const x = leafX[i] + Math.sin(animationTimeMs * 0.002 + i) * 9;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(animationTimeMs * 0.004 + i) * 0.5);
    rect(-3, -2, 6, 4, i % 2 ? '#e7a83f' : '#c94c38'); rect(-1, -1, 2, 2, '#f4ce68'); ctx.restore();
  }
  // The eagle flies on a 12-second cycle and may overlap the bell's animation.
  const eagleCycle = Math.floor(animationTimeMs / 12000);
  const eaglePhase = animationTimeMs % 12000;
  if (eaglePhase >= 1500 && eagleFlightElapsedMs > 0 && eagleFlightElapsedMs < 3200) {
    const progress = eagleFlightElapsedMs / 3200;
    const fromRight = eagleCycle % 2 === 0;
    drawEagle(progress, fromRight, fromRight ? 25 : HEIGHT - 47);
  }
}
function drawEagle(progress: number, fromRight: boolean, y: number): void {
  const x = fromRight ? WIDTH + 28 - progress * (WIDTH + 56) : -28 + progress * (WIDTH + 56);
  const flightY = y + Math.sin(progress * Math.PI * 2) * 4;
  const wingBeat = Math.sin(animationTimeMs * 0.018) * 8;
  ctx.save(); ctx.translate(x, flightY); if (fromRight) ctx.scale(-1, 1);
  // A compact overhead eagle silhouette with flapping wings and a white head.
  ctx.fillStyle = '#493a32'; ctx.strokeStyle = '#2f2926'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-3, 0); ctx.quadraticCurveTo(-19, -7 - wingBeat, -28, -8 - wingBeat); ctx.lineTo(-20, 1); ctx.lineTo(-29, 4); ctx.quadraticCurveTo(-13, 8 + wingBeat, -3, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(3, 0); ctx.quadraticCurveTo(19, -7 - wingBeat, 28, -8 - wingBeat); ctx.lineTo(20, 1); ctx.lineTo(29, 4); ctx.quadraticCurveTo(13, 8 + wingBeat, 3, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ellipse(0, 2, 8, 5, '#493a32'); ellipse(8, -2, 5, 4, '#f1eee1', '#493a32');
  ctx.beginPath(); ctx.moveTo(12, -2); ctx.lineTo(18, 0); ctx.lineTo(12, 2); ctx.closePath(); ctx.fillStyle = '#e9b746'; ctx.fill();
  rect(7, -4, 2, 2, '#282522');
  ctx.restore();
}
function drawMap(): void {
  drawAutumnMapBackground();
  drawMenuAnimations();
  // The posts are anchored along the road's changing height.
  for (let i = 0; i < 3; i++) drawSign(i, stopX[i]);
  // The boss level marker is a red badge with a gold trophy and a cheesesteak in its cup.
  const trophyX = stopX[3], trophyY = stopRoadY[3];
  ellipse(trophyX, trophyY, 22, 22, '#c93f36', '#fff0dc');
  ellipse(trophyX, trophyY, 17, 17, '#e96548', '#9c302b');
  // Gold cup and handles frame the sandwich like a prize inside the trophy.
  rect(trophyX - 11, trophyY - 12, 3, 8, '#f3ca58'); rect(trophyX + 8, trophyY - 12, 3, 8, '#f3ca58');
  rect(trophyX - 12, trophyY - 14, 4, 3, '#f3ca58'); rect(trophyX + 8, trophyY - 14, 4, 3, '#f3ca58');
  rect(trophyX - 8, trophyY - 14, 16, 3, '#ffe17a');
  rect(trophyX - 8, trophyY - 11, 16, 6, '#e8af3d'); rect(trophyX - 6, trophyY - 5, 12, 3, '#f3ca58');
  // Cheesesteak: toasted roll, browned filling, and melted cheese visible above the cup rim.
  rect(trophyX - 7, trophyY - 12, 14, 3, '#e9b66a');
  rect(trophyX - 6, trophyY - 11, 12, 2, '#76402b');
  rect(trophyX - 4, trophyY - 13, 8, 2, '#f6d25d');
  rect(trophyX - 3, trophyY - 10, 6, 1, '#fff0b0');
  rect(trophyX - 2, trophyY - 2, 4, 5, '#ffe17a'); rect(trophyX - 7, trophyY + 3, 14, 3, '#f3ca58');
  rect(trophyX - 9, trophyY + 6, 18, 4, '#d99537'); rect(trophyX - 7, trophyY + 7, 14, 1, '#ffe17a');
  // The four map positions are one horizontal navigation row for the two arrow controls.
  drawFootballer(mapWalkerX, mapWalkerY, 1.15);
  text('◀  ▶ MOVE     ● SELECT', 240, 254, 8, '#fff');
}
function drawPopup(): void {
  drawMap(); rect(48, 65, 384, 114, '#273755'); rect(53, 70, 374, 104, '#fff4ce');
  const lines = wrap(messages[selection], 35);
  lines.forEach((line, i) => {
    ctx.font = '400 13px Silkscreen, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#253247';
    ctx.fillText(line, 240, 88 + i * 16, 350);
  });
  // Place the close prompt lower for the longer third-sign message.
  text('Tap ● to close', 240, selection === 2 ? 166 : 158, 11, '#a7443d');
}
function drawLevel(): void {
  background();
  text('RIVALRY RUMBLE', 240, 25, 9, '#fff8d8');
  rect(55, 162, 370, 10, '#397c45'); rect(55, 172, 370, 8, '#b08a56');
  // Three small lamps give the player a clear count of successful stomps.
  text('HITS', 240, 54, 6); for (let i = 0; i < 3; i++) { rect(216 + i * 17, 65, 10, 10, i < bossHits ? '#ffdc4d' : '#526274'); }
  if (scene === 'level') { drawBoss(); for (const football of footballs) drawFootball(football); drawFootballer(player.x, player.y); }
  text('Hold ◀ ▶ to run   Tap ● to jump', 240, 252, 12, '#fff');
}
function drawEnd(win: boolean): void {
  drawLevel(); roundBox(38, 53, 404, 165, '#1b2e4b', 14, '#f0d49a'); roundBox(44, 59, 392, 153, win ? '#f0c74c' : '#bf4056', 11, '#fff1d2');
  text(win ? "You've won!" : 'Game Over', 240, win ? 73 : 79, 23, '#fff8d8');
  if (win) text('Happy Broad Street Bowl!', 240, 97, 17, '#ffffff');
  text('2026 NFL season fact', 240, win ? 120 : 107, 15, '#ffffff');
  const factLines = wrap(endFact, 44);
  factLines.slice(0, 3).forEach((line, index) => {
    ctx.font = '400 13px Silkscreen, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff'; ctx.fillText(line, 240, (win ? 141 : 129) + index * 16, 360);
  });
  text('Press ● to return to the map', 240, 190, 14, '#ffffff');
}

function setHint(): void {
  const hint = document.querySelector<HTMLElement>('#hint')!;
  hint.textContent = scene === 'title' ? 'Tap the button to begin' : scene === 'map' ? 'Use arrows to choose a stop; button to select' : scene === 'message' ? 'Tap the button to close' : scene === 'level' ? 'Hold left/right to move; tap button to jump' : scene === 'win' || scene === 'lose' ? 'Press the button to return to the map' : '';
}
function startLevel(): void {
  scene = 'level'; bossHits = 0; bossThrowTimerMs = 0; bossTurnTimerMs = 0; bossNextTurnMs = 900 + Math.random() * 1400; footballs = []; player = { x: 72, y: 124, vx: 0, vy: 0, w: 24, h: 38 }; boss = { x: 365, y: 130, vx: -1.15, vy: 0, w: 44, h: 46 };
}
function action(): void {
  if (scene === 'title') scene = 'map';
  else if (scene === 'map') { if (selection < 3) { popupReturn = 'map'; scene = 'message'; } else startLevel(); }
  else if (scene === 'message') scene = popupReturn;
  else if (scene === 'level' && player.y + player.h >= 162) { player.vy = -5.1; }
  else if (scene === 'win' || scene === 'lose') scene = 'map';
  setHint();
}
function update(delta: number): void {
  animationTimeMs += delta;
  const currentEagleCycle = Math.floor(animationTimeMs / 12000);
  if (currentEagleCycle !== eagleCycleIndex) { eagleCycleIndex = currentEagleCycle; eagleFlightElapsedMs = 0; }
  const eagleCyclePhase = animationTimeMs % 12000;
  if (eagleCyclePhase >= 1500 && eagleFlightElapsedMs < 3200) {
    eagleFlightElapsedMs = Math.min(3200, eagleFlightElapsedMs + delta);
  }
  if (scene === 'map') {
    const direction = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    if (direction === 0) mapRepeatMs = 0;
    else {
      mapRepeatMs += delta;
      // Trigger immediately, then repeat while held; no sub-step rounding can swallow taps.
      if (mapRepeatMs === delta || mapRepeatMs >= 220) {
        selectMapStop(selection + direction);
        mapRepeatMs = 0;
      }
    }
    if (mapWalkProgress < 1) {
      mapWalkProgress = Math.min(1, mapWalkProgress + delta / 190);
      const eased = mapWalkProgress * mapWalkProgress * (3 - 2 * mapWalkProgress);
      mapWalkerX = mapWalkFrom.x + (mapWalkTo.x - mapWalkFrom.x) * eased;
      mapWalkerY = mapWalkFrom.y + (mapWalkTo.y - mapWalkFrom.y) * eased;
    }
  }
  if (scene === 'level') {
    const speed = 2.0 * delta / 16.67;
    player.vx = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    player.x = Math.max(55, Math.min(407, player.x + player.vx * speed));
    player.vy += 0.22 * delta / 16.67; player.y += player.vy * delta / 16.67;
    if (player.y + player.h >= 162) { player.y = 162 - player.h; player.vy = 0; }
    // Vary pace and occasionally turn, while clamping exactly to arena limits to prevent edge stalls.
    bossTurnTimerMs += delta;
    if (bossTurnTimerMs >= bossNextTurnMs) {
      if (Math.random() < 0.36) boss.vx *= -1;
      boss.vx = Math.sign(boss.vx || -1) * (0.8 + Math.random() * 1.1);
      bossTurnTimerMs = 0; bossNextTurnMs = 700 + Math.random() * 1700;
    }
    boss.x += boss.vx * delta / 16.67;
    const bossLeftLimit = 65, bossRightLimit = 415 - boss.w;
    if (boss.x <= bossLeftLimit) { boss.x = bossLeftLimit; boss.vx = Math.abs(boss.vx); }
    else if (boss.x >= bossRightLimit) { boss.x = bossRightLimit; boss.vx = -Math.abs(boss.vx); }
    // Liam starts throwing only after the player has landed two successful stomps.
    if (bossHits >= 2) {
      bossThrowTimerMs += delta;
      if (bossThrowTimerMs >= 2300) {
        bossThrowTimerMs = 0;
        const launchX = boss.x + boss.w / 2;
        const targetX = player.x + player.w / 2;
        const inFront = player.vx !== 0 ? Math.sign(player.vx) : Math.sign(targetX - launchX || 1);
        const landingX = targetX + inFront * (24 + Math.random() * 10);
        footballs.push({ x: launchX, y: boss.y + 25, vx: Math.max(-2.1, Math.min(2.1, (landingX - launchX) / 48)), vy: -3.1 });
      }
    }
    const frameScale = delta / 16.67;
    for (let i = footballs.length - 1; i >= 0; i--) {
      const football = footballs[i];
      football.x += football.vx * frameScale;
      football.y += football.vy * frameScale;
      football.vy += 0.14 * frameScale;
      const hitPlayer = football.x + 7 > player.x && football.x - 7 < player.x + player.w && football.y + 5 > player.y && football.y - 5 < player.y + player.h;
      if (hitPlayer) {
        scene = 'lose'; endFact = randomFact(lossFacts); setHint();
        break;
      }
      if (football.x < -20 || football.x > WIDTH + 20 || football.y > HEIGHT + 20) footballs.splice(i, 1);
    }
    if (scene !== 'level') return;
    const overlapX = player.x + player.w > boss.x && player.x < boss.x + boss.w;
    const nearTop = player.y + player.h >= boss.y && player.y + player.h <= boss.y + 10;
    const overlapY = player.y + player.h > boss.y + 5 && player.y < boss.y + boss.h;
    if (overlapX && nearTop && player.vy > 0) {
      bossHits++; player.vy = -4.3;
      // A stomp can jostle Liam's pace, but it does not automatically reverse his direction.
      if (Math.random() < 0.28) boss.vx *= -1;
      boss.vx = Math.sign(boss.vx || -1) * (0.85 + Math.random() * 1.1);
      bossTurnTimerMs = 0; bossNextTurnMs = 500 + Math.random() * 1200;
      if (bossHits >= 3) { scene = 'win'; endFact = randomFact(winFacts); setHint(); }
    } else if (overlapX && overlapY) { scene = 'lose'; endFact = randomFact(lossFacts); setHint(); }
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
    if (scene === 'map') { selectMapStop(selection + (control === 'right' ? 1 : -1)); return; }
    held.add(control); button.setPointerCapture(event.pointerId);
  });
  const release = (): void => { held.delete(control); button.classList.remove('pressed'); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
}
bindHold('left', 'left'); bindHold('right', 'right');
document.querySelector<HTMLButtonElement>('#action')!.addEventListener('pointerdown', (event: PointerEvent) => { event.preventDefault(); action(); });
window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    if (scene === 'map') {
      // One key press advances exactly one stop, matching a single on-screen arrow tap.
      if (!event.repeat) selectMapStop(selection + direction);
      return;
    }
    held.add(direction > 0 ? 'right' : 'left');
    return;
  }
  if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) action();
});
window.addEventListener('keyup', (event: KeyboardEvent) => {
  if (event.key === 'ArrowLeft') held.delete('left');
  if (event.key === 'ArrowRight') held.delete('right');
});
setHint(); requestAnimationFrame(frame);
