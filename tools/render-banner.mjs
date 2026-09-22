import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const browser = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const svgPath = 'D:/GitHub/01. After Effects Tools/LazyMotionToolkit/assets/banner.svg';
const outPng = 'D:/GitHub/01. After Effects Tools/LazyMotionToolkit/assets/banner.png';
const work = join(tmpdir(), 'banner-render');

const svg = readFileSync(svgPath, 'utf8');
const page = join(tmpdir(), 'banner.html');
writeFileSync(
  page,
  '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#090a0d}svg{display:block;width:1920px;height:960px;}</style>' +
    svg,
  'utf8'
);

rmSync(outPng, { force: true });
execFileSync(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--screenshot=' + outPng,
    '--window-size=1920,960',
    'file:///' + page.replace(/\\/g, '/'),
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] }
);

// Wait for file to finish writing
const deadline = Date.now() + 10000;
while (!existsSync(outPng) && Date.now() < deadline) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
}

if (existsSync(outPng)) {
  const size = statSync(outPng).size;
  console.log(`Rendered banner.png successfully: ${size} bytes`);
} else {
  console.error('Failed to render banner.png');
  process.exit(1);
}
