const { app, BrowserWindow, Menu } = require('electron')
const path = require('path')

// Configuración de la información de la aplicación
app.setAboutPanelOptions({
  applicationName: "GC Lab Chile Visualizer",
  applicationVersion: "1.0.0",
  copyright: "Licencia Creative Commons BY-NC 4.0",
  credits: "Desarrollado por GC Lab Chile",
  website: "https://gclabchile.com",
  iconPath: path.join(__dirname, 'build/icon.png')
});

function createWindow () {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "GC Lab Chile Visualizer",
    icon: path.join(__dirname, 'build/icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  // Crear el menú personalizado
  const template = [
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Pantalla Completa',
          accelerator: 'F11',
          click: () => {
            if (!win.isFullScreen()) {
              win.setFullScreen(true);
              win.setMenuBarVisibility(false);
              win.setAutoHideMenuBar(true);
            } else {
              win.setFullScreen(false);
              win.setMenuBarVisibility(true);
              win.setAutoHideMenuBar(false);
            }
          }
        },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Acerca de',
          click: () => {
            app.showAboutPanel()
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  // Agregar atajo de teclado Escape para salir de pantalla completa
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && win.isFullScreen()) {
      win.setFullScreen(false);
      win.setMenuBarVisibility(true);
      win.setAutoHideMenuBar(false);
    }
  });

  // En desarrollo, carga la URL de desarrollo
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
  } else {
    // En producción, carga el archivo construido
    win.loadFile(path.join(__dirname, 'dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})