import {app, BrowserWindow, shell} from "electron";
import path from "path";
import URL from "url";

// Instant window rendering initialization
app.disableHardwareAcceleration();

const isDevelopment = process.env.NODE_ENV !== "production";
app.name = "Midnightcord";

let mainWindow;

function createMainWindow() {
    const window = new BrowserWindow({
        title: "Midnightcord Installer",
        frame: false,
        width: 550,
        height: 350,
        resizable: false,
        fullscreenable: false,
        maximizable: false,
        backgroundColor: "#0c0d10",
        show: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        }
    });

    if (isDevelopment) {
        window.webContents.openDevTools({mode: "detach"});
        window.loadURL(`http://localhost:${process.env.ELECTRON_WEBPACK_WDS_PORT}`);
    }
    else {
        window.loadURL(URL.format({
            pathname: path.join(__dirname, "index.html"),
            protocol: "file",
            slashes: true
        }));
    }

    window.once("ready-to-show", () => {
        window.show();
        window.focus();
    });

    window.on("closed", () => {
        mainWindow = null;
    });

    window.webContents.on("new-window", (e, url) => {
        e.preventDefault();
        shell.openExternal(url);
    });

    return window;
}

app.on("window-all-closed", () => {
    if (process.platform === "darwin") return;
    app.quit();
});

app.on("activate", () => {
    if (mainWindow !== null) return;
    mainWindow = createMainWindow();
});

app.on("ready", async () => {
    mainWindow = createMainWindow();
    // Run update check in background asynchronously without blocking UI startup
    setTimeout(() => {
        if (!process.env.BD_SKIP_UPDATECHECK) {
            import("./update_installer").then(m => m.default?.()).catch(() => {});
        }
    }, 2000);
});
