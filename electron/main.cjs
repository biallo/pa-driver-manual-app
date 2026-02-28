const { app, BrowserWindow } = require('electron')
const http = require('http')
const fs = require('fs')
const path = require('path')

let staticServer = null
let appStartUrl = null

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2'
  }
  return map[ext] || 'application/octet-stream'
}

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const reqPath = decodeURIComponent((req.url || '/').split('?')[0])
        const relativePath = reqPath === '/' ? '/index.html' : reqPath
        const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '')
        let filePath = path.join(rootDir, safePath)

        if (!filePath.startsWith(rootDir)) {
          res.writeHead(403)
          res.end('Forbidden')
          return
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(rootDir, 'index.html')
        }

        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(404)
            res.end('Not Found')
            return
          }
          res.writeHead(200, { 'Content-Type': contentType(filePath) })
          res.end(data)
        })
      } catch (e) {
        res.writeHead(500)
        res.end('Server Error')
      }
    })

    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to bind static server'))
        return
      }
      resolve({ server, url: `http://127.0.0.1:${address.port}` })
    })
  })
}

function createWindow(startUrl) {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    win.loadURL(devUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadURL(startUrl)
  }
}

app.whenReady().then(async () => {
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (!devUrl) {
    const distDir = path.join(__dirname, '..', 'dist')
    const { server, url } = await startStaticServer(distDir)
    staticServer = server
    appStartUrl = url
    createWindow(url)
  } else {
    appStartUrl = devUrl
    createWindow(devUrl)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length !== 0) return
    if (appStartUrl) createWindow(appStartUrl)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  if (staticServer) {
    staticServer.close()
    staticServer = null
  }
})
