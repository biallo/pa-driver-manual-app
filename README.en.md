<p align="center">
  <img src="./public/app-icon.png" alt="app-icon" width="120" />
</p>

<p align="center">
  <a href="./README.md">中文</a> | English
</p>

<h1 align="center">Pennsylvania Driver Manual Study & Test</h1>

<br/>

Live preview: [https://biallo.github.io/pa-driver-manual-app/](https://biallo.github.io/pa-driver-manual-app/)

Desktop releases: [https://github.com/biallo/pa-driver-manual-app/releases](https://github.com/biallo/pa-driver-manual-app/releases)
`<br/>`
Available for Mac, Windows, and Linux. Can be used offline.

> On macOS, you may see a warning that "The App cannot be verified" or "The developer cannot be identified". `<br/>`
> Open "System Settings" -> "Privacy & Security", find the security section, and click "Open Anyway".

> The manual PDFs used by this project come from [https://www.pa.gov/agencies/dmv/driver-services/pennsylvania-drivers-manual](https://www.pa.gov/agencies/dmv/driver-services/pennsylvania-drivers-manual) `<br/>`
> Version: PUB 95 (4-21) English Version

## Screenshots

<p align="center">
  <img src="./public/screenshot/screenshot-1.png" alt="practice page" width="32%" />
  <img src="./public/screenshot/screenshot-2.png" alt="question detail page" width="32%" />
  <img src="./public/screenshot/screenshot-3.png" alt="exam mode page" width="32%" />
</p>

The project supports two ways of running:

- Web development mode (Vite)
- Desktop app (Electron)

## 1) Run locally in web mode

```bash
npm install
npm run dev
```

## 2) Run locally in desktop mode

```bash
npm install
npm run desktop:dev
```

## 3) Build desktop packages

Build by platform:

```bash
npm run desktop:dist:mac
npm run desktop:dist:win
npm run desktop:dist:linux
```

Build outputs are generated in the `release/` directory.
