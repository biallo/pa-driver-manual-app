<p align="center">
  <img src="./public/app-icon.png" alt="app-icon" width="120" />
</p>

<h1 align="center">宾夕法尼亚驾驶手册学习与考试</h1>

---


项目支持两种运行方式：

- Web 开发模式（Vite）
- 桌面可执行安装包（Electron）

## 应用截图

<p align="center">
  <img src="./public/screenshot/screenshot-1.png" alt="练习题页面" width="32%" />
  <img src="./public/screenshot/screenshot-2.png" alt="题目详情页面" width="32%" />
  <img src="./public/screenshot/screenshot-3.png" alt="考试模式页面" width="32%" />
</p>

## 1) Web 本地运行

```bash
npm install
npm run dev
```

## 2) 桌面应用开发运行

```bash
npm install
npm run desktop:dev
```

## 3) 打包为免 Node 环境可执行文件

先构建前端，然后用 Electron Builder 打包：

```bash
npm run desktop:dist
```

产物在 `release/` 目录。

可按系统分别打包：

```bash
npm run desktop:dist:mac
npm run desktop:dist:win
npm run desktop:dist:linux
```
