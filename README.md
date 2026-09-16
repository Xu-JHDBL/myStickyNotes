# 桌面便签 (StickyNotes)

Windows 桌面日程管理软件 — 自定义日程、桌面置顶、到期提醒。

## 功能

- **日程管理**：新建 / 编辑 / 删除便签，支持标题、内容、日期、时间、优先级（高/中/低）
- **桌面置顶**：窗口始终在最前，按 **Win+D 也不消失**（固定到桌面模式）
- **提醒通知**：到期时 QQ/微信式提醒——右下角弹窗 + 托盘图标闪烁 + 提示音；同时写入 Windows 通知中心
- **透明度调节**：滑块实时调整窗口透明度（40% ~ 100%）
- **开机启动**：勾选后写入 Windows 启动文件夹，重启自动运行
- **系统托盘**：关闭窗口缩到托盘，右键菜单快速操作
- **搜索过滤**：按标题/内容关键词快速查找

## 快速开始

```bash
# 安装依赖
npm install

# 启动应用
npm start
```

## 打包

```bash
# 生成便携版 + 安装版（需先解压 nsis-bundle，见下文）
npm run build:installer
```

产物在 `dist/` 目录：
- `桌面便签_便携版.exe` — 免安装，直接运行
- `桌面便签_安装版.exe` — NSIS 安装向导

## 项目结构

```
├── main.js              # Electron 主进程（窗口/托盘/IPC/提醒/开机启动）
├── preload.js           # 主窗口 IPC 桥接
├── preload-toast.js     # 提醒弹窗窗口的 IPC 桥接
├── package.json         # 项目配置 & electron-builder 打包配置
├── .npmrc               # npm 国内镜像
├── scripts/
│   └── setup-wincodesign.js  # 预下载 winCodeSign(rcedit) 到缓存，规避符号链接解压问题
├── assets/
│   ├── icon.png         # 应用图标（256×256 PNG）
│   └── icon.ico         # Windows 图标（由 PNG 生成）
├── renderer/
│   ├── index.html       # 主界面结构
│   ├── toast.html       # 右下角提醒弹窗
│   ├── style.css        # 样式（毛玻璃卡片风格）
│   └── renderer.js      # 渲染进程逻辑（CRUD/搜索/渲染）
├── nsis-bundle/         # NSIS 3.12 构建工具（本地离线包）
└── dist/                # 构建产物
```

## 关键设计

### 窗口置顶与桌面固定

窗口使用两层置顶策略：
- **普通置顶**（📌）：`alwaysOnTop: true, level: 'normal'`，保持在普通窗口之上
- **桌面固定**（🖥️）：`alwaysOnTop: true, level: 'screen-saver'` + 500ms 轮询守护。按 Win+D 后窗口被隐藏，守护线程检测到后立即恢复显示，实现"钉在桌面"效果

### 数据存储

所有数据存储在 `app.getPath('userData')`（即 `%APPDATA%\desktop-sticky-notes\`）下：
- `notes.json` — 便签数据（JSON 数组）
- `config.json` — 用户设置（透明度、置顶状态、开机启动等）

### 开机启动

不使用 Electron 内置的 `app.setLoginItemSettings()`（开发模式下路径不稳定），改为直接将快捷方式写入 Windows 启动文件夹：

```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\StickyNotes.lnk
```

通过 PowerShell + `IShellLinkW` 创建快捷方式（UTF-16LE 脚本），避免 Unicode 路径乱码，且不依赖 `iconv-lite`（打包后不在 app.asar 中）。

### 托盘图标

托盘图标通过 `nativeImage.createFromPath()` 从 `assets/icon.png` 加载并缩放至 16×16，与 exe 图标保持一致。

### 提醒通知（QQ/微信式）

到期提醒不再依赖 Windows Toast（便携版/开发模式下 Toast 静默失效），改为自研三件套，全场景生效：

- **右下角弹窗**：`renderer/toast.html`（无边框置顶小窗口）用 `tray.getBounds()` 定位到托盘上方，6 秒自动关闭，点击打开主窗口。
- **托盘闪烁**：`startTrayBlink()` 每 500ms 在正常图标与「红点角标」图标间切换；红点图标由渲染进程 canvas 动态生成。
- **提示音**：渲染进程用 Web Audio 合成双音「叮咚」，主窗口 `backgroundThrottling: false` 保证隐藏时也能播。

### 通知中心

Windows 通知中心要能显示 Toast，必须存在一个带 AppUserModelID 的「开始菜单」快捷方式。NSIS 安装版由 electron-builder 自动写入（`appId`），无需处理；便携版/开发模式则在启动时用 `registerToastShortcut()` 通过 PowerShell + `IShellLink`/`IPropertyStore` 动态注册 `%APPDATA%\...\Start Menu\Programs\桌面便签.lnk`。注册成功后，`new Notification()` 的 Toast 即可进入通知中心。

## 构建注意事项

### NSIS 离线包

`nsis-bundle/` 目录包含 NSIS 3.12 离线版本。打包时通过环境变量 `ELECTRON_BUILDER_NSIS_DIR` 指定本地路径，避免从 GitHub 下载（国内网络不可达）。

`package.json` 的 build 脚本已内置此变量，直接运行即可：
```
"build:installer": "node scripts/setup-wincodesign.js && set ELECTRON_BUILDER_NSIS_DIR=nsis-bundle\\windows&& electron-builder --win"
```

如需更新 NSIS 版本，替换 `nsis-bundle/windows/` 目录内容，并确保 `Bin/makensis.exe` 存在。

### 图标嵌入（winCodeSign / rcedit）

`signAndEditExecutable: true` 会调用 rcedit 把图标和版本信息写入 exe。rcedit 来自 electron-builder 的 `winCodeSign` 工具包，默认从 GitHub 下载，且压缩包内含 macOS 符号链接（`darwin/*.dylib`），在 Windows 无管理员权限时解压会失败。

`scripts/setup-wincodesign.js` 会在打包前自动下载（优先 npmmirror 镜像）并以「排除 darwin/linux」的方式解压到 electron-builder 缓存（`%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\`），从而命中缓存、跳过下载解压。build 脚本已自动调用它。

### 代码签名

未配置数字证书，electron-builder 会**自动跳过签名**（`signAndEditExecutable` 只控制「编辑 exe 资源」+「签名」；无证书时签名这一步被跳过）。发给他人时 Windows SmartScreen 可能警告，点击「仍要运行」即可。

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + N` | 新建便签 |
| `Escape` | 关闭弹窗 |
| `Enter` | 保存便签（弹窗内） |
