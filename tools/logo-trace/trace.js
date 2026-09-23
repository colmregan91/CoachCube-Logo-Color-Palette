// Trace CoachCube_Full_Logo_Navy.png into 7 independent SVG paths.
const fs = require('fs');
const { PNG } = require('pngjs');
const potrace = require('potrace');

const SRC = 'C:/Users/colmr/CoachCubeColorPallette/SrcImage/CoachCube_Full_Logo_Navy.png';
const png = PNG.sync.read(fs.readFileSync(SRC));
const W = png.width, H = png.height;

// --- 1. classify every pixel to the nearest of the three source colours ---
const PAL = [
  ['navy',  [0x0c, 0x1a, 0x3b]],
  ['blue',  [0x00, 0xa2, 0xf4]],
  ['white', [0xfa, 0xfa, 0xfa]],
];
const NAVY = 0, BLUE = 1, WHITE = 2;

const label = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) {
  const r = png.data[i * 4], g = png.data[i * 4 + 1], b = png.data[i * 4 + 2];
  let best = 0, bd = Infinity;
  for (let k = 0; k < PAL.length; k++) {
    const c = PAL[k][1];
    const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  label[i] = best;
}

// --- 2. connected components over the blue pixels of the icon (left of x=800) ---
const SPLIT = 800;
const comp = new Int32Array(W * H).fill(-1);
const comps = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < SPLIT; x++) {
    const i = y * W + x;
    if (label[i] !== BLUE || comp[i] !== -1) continue;
    const id = comps.length;
    const stack = [i];
    comp[i] = id;
    let minX = x, maxX = x, minY = y, maxY = y, area = 0;
    while (stack.length) {
      const p = stack.pop();
      area++;
      const px = p % W, py = (p - px) / W;
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
      const nb = [];
      if (px > 0) nb.push(p - 1);
      if (px < SPLIT - 1) nb.push(p + 1);
      if (py > 0) nb.push(p - W);
      if (py < H - 1) nb.push(p + W);
      for (const q of nb) {
        if (label[q] === BLUE && comp[q] === -1) { comp[q] = id; stack.push(q); }
      }
    }
    comps.push({ id, minX, maxX, minY, maxY, area });
  }
}

console.log('icon blue components (area >= 200):');
const big = comps.filter(c => c.area >= 200).sort((a, b) => a.minX - b.minX);
for (const c of big) {
  console.log(`  id=${c.id} area=${c.area} bbox=[${c.minX},${c.minY} -> ${c.maxX},${c.maxY}] w=${c.maxX - c.minX + 1} h=${c.maxY - c.minY + 1}`);
}
if (big.length !== 4) {
  console.error(`!! expected 4 icon parts, found ${big.length}`);
  process.exit(1);
}

// Assign by left edge — the four parts are cleanly ordered left-to-right:
// outer frame (104), inner left panel (134), inner right panel (185), solid right half (280).
const [frame, innerLeft, innerRight, solidRight] = big;   // `big` is already sorted by minX
if (!(frame.minX < innerLeft.minX && innerLeft.minX < innerRight.minX && innerRight.minX < solidRight.minX)) {
  console.error('!! unexpected left-to-right ordering of icon parts');
  process.exit(1);
}
// the frame encloses both inner panels; the solid half stands clear of all of them
if (!(frame.maxX > innerRight.maxX && solidRight.minX > frame.maxX)) {
  console.error('!! icon parts are not nested/separated as expected');
  process.exit(1);
}

// --- 3. build a binary mask per section ---
function maskFrom(test) {
  const m = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i - x) / W;
    const on = test(i, x, y);
    const v = on ? 0 : 255;                       // black = shape, white = ground
    m.data[i * 4] = v; m.data[i * 4 + 1] = v; m.data[i * 4 + 2] = v; m.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(m);
}

const SECTIONS = [
  { id: 'frame',      name: 'Outer frame',       color: '#00A2F4', mask: (i) => comp[i] === frame.id },
  { id: 'innerLeft',  name: 'Inner left panel',  color: '#00A2F4', mask: (i) => comp[i] === innerLeft.id },
  { id: 'innerRight', name: 'Inner right panel', color: '#00A2F4', mask: (i) => comp[i] === innerRight.id },
  { id: 'solidRight', name: 'Solid right half',  color: '#00A2F4', mask: (i) => comp[i] === solidRight.id },
  { id: 'coach',      name: 'Coach',             color: '#FAFAFA', mask: (i) => label[i] === WHITE },
  { id: 'cube',       name: 'Cube',              color: '#009AFA', mask: (i, x) => label[i] === BLUE && x >= SPLIT },
];

const OPTS = {
  turdSize: 2,
  alphaMax: 1,
  optCurve: true,
  optTolerance: 0.2,
  threshold: 128,
  blackOnWhite: true,
  turnPolicy: potrace.Potrace.TURNPOLICY_MINORITY,
};

function trace(buf) {
  return new Promise((resolve, reject) => {
    const p = new potrace.Potrace(OPTS);
    p.loadImage(buf, (err) => {
      if (err) return reject(err);
      const tag = p.getPathTag();
      const m = tag.match(/ d="([^"]*)"/);
      if (!m) return reject(new Error('no d attribute in: ' + tag.slice(0, 200)));
      resolve(m[1]);
    });
  });
}

(async () => {
  const out = [{
    id: 'background',
    name: 'Background',
    color: '#0C1A3B',
    d: `M0 0H${W}V${H}H0Z`,
  }];

  for (const s of SECTIONS) {
    const d = await trace(maskFrom(s.mask));
    console.log(`traced ${s.id.padEnd(11)} ${d.length} chars`);
    out.push({ id: s.id, name: s.name, color: s.color, d });
  }

  fs.writeFileSync('sections.json', JSON.stringify({ width: W, height: H, sections: out }, null, 2));

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`,
    ...out.map(s => `  <path id="${s.id}" fill="${s.color}" fill-rule="evenodd" d="${s.d}"/>`),
    `</svg>`,
  ].join('\n');
  fs.writeFileSync('logo.svg', svg);
  console.log('wrote sections.json and logo.svg');
})();
