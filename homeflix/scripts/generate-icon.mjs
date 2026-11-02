// Gera tizen/icon.png (512×423, tamanho recomendado para ícones de apps de TV Samsung)
// sem dependências: desenho vetorial simples com supersampling e PNG via zlib.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const WIDTH = 512;
const HEIGHT = 423;
const SS = 4; // amostras por eixo (anti-aliasing)

const mix = (a, b, t) => a + (b - a) * t;

function inRoundedRect(x, y, rx, ry, rw, rh, r) {
  if (x < rx || y < ry || x > rx + rw || y > ry + rh) return false;
  const cx = Math.min(Math.max(x, rx + r), rx + rw - r);
  const cy = Math.min(Math.max(y, ry + r), ry + rh - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function inTriangle(x, y, [ax, ay], [bx, by], [cx, cy]) {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** Cor (RGBA 0..1) de um ponto do ícone. */
function sample(x, y) {
  // Fundo: cartão escuro com cantos arredondados e brilho quente.
  if (!inRoundedRect(x, y, 0, 0, WIDTH, HEIGHT, 64)) return [0, 0, 0, 0];
  const glow = Math.max(0, 1 - Math.hypot(x - 360, y - 90) / 420);
  let r = mix(0.05, 0.32, glow * 0.6);
  let g = mix(0.04, 0.09, glow * 0.6);
  let b = mix(0.07, 0.08, glow * 0.6);

  // Letra "H" estilizada com gradiente vermelho → laranja.
  const t = (x - 120) / 270;
  const brand = [mix(1, 1, t), mix(0.31, 0.6, t), mix(0.23, 0.24, t)];
  const left = inRoundedRect(x, y, 120, 92, 74, 240, 18);
  const right = inRoundedRect(x, y, 318, 92, 74, 240, 18);
  const bar = inRoundedRect(x, y, 170, 180, 172, 64, 10);
  // Triângulo de "play" vazado no meio da barra.
  const play = inTriangle(x, y, [236, 190], [236, 234], [278, 212]);
  if ((left || right || bar) && !play) [r, g, b] = brand;
  return [r, g, b, 1];
}

const raw = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);
for (let y = 0; y < HEIGHT; y++) {
  const rowStart = y * (WIDTH * 4 + 1);
  raw[rowStart] = 0; // filtro "None"
  for (let x = 0; x < WIDTH; x++) {
    let acc = [0, 0, 0, 0];
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const [r, g, b, a] = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
        acc = [acc[0] + r * a, acc[1] + g * a, acc[2] + b * a, acc[3] + a];
      }
    }
    const n = SS * SS;
    const alpha = acc[3] / n;
    const offset = rowStart + 1 + x * 4;
    raw[offset] = alpha ? Math.round((acc[0] / acc[3]) * 255) : 0;
    raw[offset + 1] = alpha ? Math.round((acc[1] / acc[3]) * 255) : 0;
    raw[offset + 2] = alpha ? Math.round((acc[2] / acc[3]) * 255) : 0;
    raw[offset + 3] = Math.round(alpha * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

const header = Buffer.alloc(13);
header.writeUInt32BE(WIDTH, 0);
header.writeUInt32BE(HEIGHT, 4);
header[8] = 8; // bits por canal
header[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const target = fileURLToPath(new URL('../tizen/icon.png', import.meta.url));
writeFileSync(target, png);
console.log(`Ícone gerado: ${target} (${png.length} bytes)`);
