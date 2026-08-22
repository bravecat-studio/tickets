#!/usr/bin/env node
/**
 * Copy the Vite client build to the repository root so GitHub Pages
 * "Deploy from a branch" (Jekyll) serves the ticket helper instead of README.md.
 *
 * Preferred setup is still Settings → Pages → GitHub Actions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'client', 'dist');
const check = process.argv.includes('--check');
const siteFiles = ['index.html', '404.html', 'favicon.svg'];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function read(filePath) {
  return fs.readFileSync(filePath);
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  fail('client/dist/index.html 가 없습니다. 먼저 BASE_PATH=/tickets/ npm run build -w client 를 실행하세요.');
}

if (!fs.existsSync(path.join(dist, '404.html'))) {
  fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));
}

const distAssets = path.join(dist, 'assets');
const rootAssets = path.join(root, 'assets');

if (check) {
  if (!fs.existsSync(path.join(root, '.nojekyll'))) {
    fail('루트 .nojekyll 이 없습니다. npm run pages:sync 를 실행하세요.');
  }
  for (const name of siteFiles) {
    const from = path.join(dist, name);
    const to = path.join(root, name);
    if (!fs.existsSync(from)) continue;
    if (!fs.existsSync(to)) fail(`배포 파일이 없습니다: ${name}. npm run pages:sync 를 실행하세요.`);
    if (!read(from).equals(read(to))) {
      fail(`${name} 이 최신 빌드와 다릅니다. npm run pages:sync 를 실행하세요.`);
    }
  }
  const distList = listFiles(distAssets).map((file) => path.relative(distAssets, file)).sort();
  const rootList = listFiles(rootAssets).map((file) => path.relative(rootAssets, file)).sort();
  if (distList.join('\n') !== rootList.join('\n')) {
    fail('assets/ 가 최신 빌드와 다릅니다. npm run pages:sync 를 실행하세요.');
  }
  for (const rel of distList) {
    if (!read(path.join(distAssets, rel)).equals(read(path.join(rootAssets, rel)))) {
      fail(`assets/${rel} 이 최신 빌드와 다릅니다. npm run pages:sync 를 실행하세요.`);
    }
  }
  const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  if (!homepage.includes('id="root"') || homepage.includes('Jekyll')) {
    fail('루트 index.html 이 Vite 앱이 아닙니다.');
  }
  console.log('GitHub Pages 폴백 파일이 최신 빌드와 같습니다.');
  process.exit(0);
}

fs.writeFileSync(path.join(root, '.nojekyll'), '');
for (const name of siteFiles) {
  const from = path.join(dist, name);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(root, name));
}
fs.rmSync(rootAssets, { recursive: true, force: true });
fs.cpSync(distAssets, rootAssets, { recursive: true });
console.log('GitHub Pages 폴백 파일을 저장소 루트에 동기화했습니다.');
