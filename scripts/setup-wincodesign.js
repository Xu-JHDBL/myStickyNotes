// 预下载并解压 winCodeSign 到 electron-builder 缓存。
//
// 背景：打包时 `signAndEditExecutable: true` 需要用 rcedit 把图标/版本信息写入 exe，
// 但 winCodeSign 压缩包内含 macOS 的符号链接（darwin/*.dylib），在 Windows 上解压需要
// 管理员权限（SeCreateSymbolicLinkPrivilege），无权限会导致整个解压失败、打包中止。
// 本脚本手动下载并「排除 darwin/linux」解压到缓存目录，让 electron-builder 直接命中缓存。
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const VERSION = '2.6.0';
const NAME = `winCodeSign-${VERSION}`;
const MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/';
const GITHUB = 'https://github.com/electron-userland/electron-builder-binaries/releases/download/';

const cacheRoot = process.env.ELECTRON_BUILDER_CACHE
  || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'electron-builder', 'Cache');
const targetDir = path.join(cacheRoot, 'winCodeSign', NAME);
const rcedit = path.join(targetDir, 'rcedit-x64.exe');

if (fs.existsSync(rcedit)) {
  console.log(`[setup-wincodesign] 缓存已存在，跳过: ${targetDir}`);
  process.exit(0);
}

const sevenZip = path.join(__dirname, '..', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
const archive = path.join(os.tmpdir(), NAME + '.7z');

async function download(url) {
  console.log(`[setup-wincodesign] 下载 ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(archive, buf);
  console.log(`[setup-wincodesign] 已下载 ${buf.length} 字节`);
}

(async () => {
  try {
    try {
      await download(MIRROR + NAME + '/' + NAME + '.7z');
    } catch (e) {
      console.warn('[setup-wincodesign] 镜像下载失败，改用 GitHub:', e.message);
      await download(GITHUB + NAME + '/' + NAME + '.7z');
    }

    fs.mkdirSync(targetDir, { recursive: true });
    console.log('[setup-wincodesign] 解压中（排除 darwin/linux 符号链接）...');
    execFileSync(sevenZip, ['x', '-bd', '-y', '-x!darwin', '-x!linux', '-o' + targetDir, archive], { stdio: 'inherit' });
    fs.unlinkSync(archive);

    if (!fs.existsSync(rcedit)) throw new Error('解压后未找到 rcedit-x64.exe');
    console.log(`[setup-wincodesign] 完成: ${targetDir}`);
  } catch (e) {
    console.error('[setup-wincodesign] 失败:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
