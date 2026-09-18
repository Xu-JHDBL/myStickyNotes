# 桌面便签 (StickyNotes)

Windows 桌面日程管理软件 — 自定义日程、桌面置顶、到期提醒。

## 功能

- **日程管理**：新建 / 编辑 / 删除便签，支持标题、内容、日期、时间、优先级（高/中/低）
- **桌面置顶**：窗口始终在最前，按 **Win+D 也不消失**（固定到桌面模式）
- **提醒通知**：到期时 QQ/微信式提醒——右下角弹窗 + 托盘图标闪烁 + 提示音 + Windows 通知中心
- **透明度调节**：滑块实时调整窗口透明度（40% ~ 100%）
- **开机启动**：勾选后写入 Windows 启动文件夹，重启自动运行
- **系统托盘**：关闭窗口缩到托盘，右键菜单快速操作
- **搜索过滤**：按标题/内容关键词快速查找

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + N` | 新建便签 |
| `Escape` | 关闭弹窗 |
| `Enter` | 保存便签（弹窗内） |

## 下载

最新版本：https://github.com/Xu-JHDBL/myStickyNotes/releases/latest

| 文件 | 说明 |
|------|------|
| `myStickyNotes_Portable.exe` | 便携版，免安装，双击直接运行 |
| `myStickyNotes_Installer.exe` | 安装版，NSIS 安装向导 |

## 从源码本地构建

需要 Node.js（建议 18+）与 npm。

```bash
git clone https://github.com/Xu-JHDBL/myStickyNotes.git
cd myStickyNotes
npm install      # 安装依赖
npm start        # 开发模式运行
npm run build    # 打包便携版
```

产物在 `dist/` 目录下。

> 打包安装版需运行 `npm run build:installer`，并额外准备 NSIS 构建工具（`nsis-bundle/`）；便携版无需额外依赖。
