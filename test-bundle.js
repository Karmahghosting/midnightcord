"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err2) => function __init() {
  if (err2) throw err2[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err2 = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/shared/IpcEvents.ts
var init_IpcEvents = __esm({
  "src/shared/IpcEvents.ts"() {
    "use strict";
  }
});

// src/shared/SettingsStore.ts
var SYM_IS_PROXY, SYM_GET_RAW_TARGET, SettingsStore;
var init_SettingsStore = __esm({
  "src/shared/SettingsStore.ts"() {
    "use strict";
    SYM_IS_PROXY = /* @__PURE__ */ Symbol("SettingsStore.isProxy");
    SYM_GET_RAW_TARGET = /* @__PURE__ */ Symbol("SettingsStore.getRawTarget");
    SettingsStore = class {
      pathListeners = /* @__PURE__ */ new Map();
      prefixListeners = /* @__PURE__ */ new Map();
      globalListeners = /* @__PURE__ */ new Set();
      proxyContexts = /* @__PURE__ */ new WeakMap();
      proxyHandler = /* @__PURE__ */ (() => {
        const self2 = this;
        return {
          get(target, key, receiver) {
            if (key === SYM_IS_PROXY) {
              return true;
            }
            if (key === SYM_GET_RAW_TARGET) {
              return target;
            }
            let v = Reflect.get(target, key, receiver);
            const proxyContext = self2.proxyContexts.get(target);
            if (proxyContext == null) {
              return v;
            }
            const { root, path } = proxyContext;
            if (!(key in target) && self2.getDefaultValue != null) {
              v = self2.getDefaultValue({
                target,
                key,
                root,
                path
              });
            }
            if (typeof v === "object" && v !== null && !v[SYM_IS_PROXY]) {
              const getPath = `${path}${path && "."}${key}`;
              return self2.makeProxy(v, root, getPath);
            }
            return v;
          },
          set(target, key, value) {
            if (value?.[SYM_IS_PROXY]) {
              value = value[SYM_GET_RAW_TARGET];
            }
            if (target[key] === value) {
              return true;
            }
            if (!Reflect.set(target, key, value)) {
              return false;
            }
            const proxyContext = self2.proxyContexts.get(target);
            if (proxyContext == null) {
              return true;
            }
            const { root, path } = proxyContext;
            const setPath = `${path}${path && "."}${key}`;
            self2.notifyListeners(setPath, value, root);
            return true;
          },
          deleteProperty(target, key) {
            if (!Reflect.deleteProperty(target, key)) {
              return false;
            }
            const proxyContext = self2.proxyContexts.get(target);
            if (proxyContext == null) {
              return true;
            }
            const { root, path } = proxyContext;
            const deletePath = `${path}${path && "."}${key}`;
            self2.notifyListeners(deletePath, void 0, root);
            return true;
          }
        };
      })();
      constructor(plain, options2 = {}) {
        this.plain = plain;
        this.store = this.makeProxy(plain);
        Object.assign(this, options2);
      }
      makeProxy(object, root = object, path = "") {
        this.proxyContexts.set(object, {
          root,
          path
        });
        return new Proxy(object, this.proxyHandler);
      }
      notifyPrefixListeners(pathString, pathElements, value) {
        for (let i2 = 1; i2 <= pathElements.length; i2++) {
          const prefix = pathElements.slice(0, i2).join(".");
          this.prefixListeners.get(prefix)?.forEach((cb) => cb(value, pathString));
        }
      }
      notifyListeners(pathStr, value, root) {
        const paths = pathStr.split(".");
        if (paths.length > 3 && paths[0] === "plugins") {
          const settingPath = paths.slice(0, 3);
          const settingPathStr = settingPath.join(".");
          const settingValue = settingPath.reduce((acc, curr) => acc[curr], root);
          this.globalListeners.forEach((cb) => cb(root, settingPathStr));
          this.pathListeners.get(settingPathStr)?.forEach((cb) => cb(settingValue));
        } else {
          this.globalListeners.forEach((cb) => cb(root, pathStr));
        }
        this.pathListeners.get(pathStr)?.forEach((cb) => cb(value));
        this.notifyPrefixListeners(pathStr, paths, value);
      }
      /**
       * Set the data of the store.
       * This will update this.store and this.plain (and old references to them will be stale! Avoid storing them in variables)
       *
       * Additionally, all global listeners (and those for pathToNotify, if specified) will be called with the new data
       * @param value New data
       * @param pathToNotify Optional path to notify instead of globally. Used to transfer path via ipc
       */
      setData(value, pathToNotify) {
        if (this.readOnly) throw new Error("SettingsStore is read-only");
        this.plain = value;
        this.store = this.makeProxy(value);
        if (pathToNotify) {
          let v = value;
          const path = pathToNotify.split(".");
          for (const p of path) {
            if (!v) {
              console.warn(
                `Settings#setData: Path ${pathToNotify} does not exist in new data. Not dispatching update`
              );
              return;
            }
            v = v[p];
          }
          this.pathListeners.get(pathToNotify)?.forEach((cb) => cb(v));
          this.notifyPrefixListeners(pathToNotify, path, v);
        }
        this.markAsChanged();
      }
      /**
       * Add a global change listener, that will fire whenever any setting is changed
       *
       * @param data The new data. This is either the new value set on the path, or the new root object if it was changed
       * @param path The path of the setting that was changed. Empty string if the root object was changed
       */
      addGlobalChangeListener(cb) {
        this.globalListeners.add(cb);
      }
      /**
       * Add a scoped change listener that will fire whenever a setting matching the specified path is changed.
       *
       * For example if path is `"foo.bar"`, the listener will fire on
       * ```js
       * Setting.store.foo.bar = "hi"
       * ```
       * but not on
       * ```js
       * Setting.store.foo.baz = "hi"
       * ```
       */
      addChangeListener(path, cb) {
        const listeners = this.pathListeners.get(path) ?? /* @__PURE__ */ new Set();
        listeners.add(cb);
        this.pathListeners.set(path, listeners);
      }
      /**
       * Add a prefix change listener that will fire whenever a setting matching the specified prefix is changed.
       * For example if prefix is `"foo"`, the listener will fire on
       * ```js
       * Setting.store.foo.bar = "hi"
       * Setting.store.foo.baz = "hi"
       * ```
       */
      addPrefixChangeListener(prefix, cb) {
        const listeners = this.prefixListeners.get(prefix) ?? /* @__PURE__ */ new Set();
        listeners.add(cb);
        this.prefixListeners.set(prefix, listeners);
      }
      /**
       * Remove a global listener
       * @see {@link addGlobalChangeListener}
       */
      removeGlobalChangeListener(cb) {
        this.globalListeners.delete(cb);
      }
      /**
       * Remove a scoped listener
       * @see {@link addChangeListener}
       */
      removeChangeListener(path, cb) {
        const listeners = this.pathListeners.get(path);
        if (!listeners) return;
        listeners.delete(cb);
        if (!listeners.size) this.pathListeners.delete(path);
      }
      /**
       * Remove a prefix listener
       * @see {@link addPrefixChangeListener}
       */
      removePrefixChangeListener(prefix, cb) {
        const listeners = this.prefixListeners.get(prefix);
        if (!listeners) return;
        listeners.delete(cb);
        if (!listeners.size) this.prefixListeners.delete(prefix);
      }
      /**
       * Call all global change listeners
       */
      markAsChanged() {
        this.globalListeners.forEach((cb) => cb(this.plain, ""));
      }
    };
  }
});

// src/utils/mergeDefaults.ts
function mergeDefaults(obj, defaults) {
  for (const key in defaults) {
    const v = defaults[key];
    if (typeof v === "object" && !Array.isArray(v)) {
      obj[key] ??= {};
      mergeDefaults(obj[key], v);
    } else {
      obj[key] ??= v;
    }
  }
  return obj;
}
var init_mergeDefaults = __esm({
  "src/utils/mergeDefaults.ts"() {
    "use strict";
  }
});

// src/main/utils/constants.ts
var constants_exports = {};
__export(constants_exports, {
  ALLOWED_PROTOCOLS: () => ALLOWED_PROTOCOLS,
  DATA_DIR: () => DATA_DIR,
  DEV_MIGRATED: () => DEV_MIGRATED,
  IS_VANILLA: () => IS_VANILLA,
  NATIVE_SETTINGS_FILE: () => NATIVE_SETTINGS_FILE,
  QUICK_CSS_PATH: () => QUICK_CSS_PATH,
  SETTINGS_DIR: () => SETTINGS_DIR,
  SETTINGS_FILE: () => SETTINGS_FILE,
  THEMES_DIR: () => THEMES_DIR
});
var import_electron, import_fs, import_path, suffix, DATA_DIR, SETTINGS_DIR, THEMES_DIR, QUICK_CSS_PATH, SETTINGS_FILE, NATIVE_SETTINGS_FILE, DEV_MIGRATED, ALLOWED_PROTOCOLS, IS_VANILLA;
var init_constants = __esm({
  "src/main/utils/constants.ts"() {
    "use strict";
    import_electron = require("electron");
    import_fs = require("fs");
    import_path = require("path");
    suffix = IS_DEV ? "dev" : "";
    DATA_DIR = process.env.MIDNIGHTCORD_USER_DATA_DIR ?? (process.env.DISCORD_USER_DATA_DIR ? (0, import_path.join)(process.env.DISCORD_USER_DATA_DIR, "..", "MidnightcordData", suffix) : (0, import_path.join)(import_electron.app.getPath("userData"), "..", "Midnightcord", suffix));
    SETTINGS_DIR = (0, import_path.join)(DATA_DIR, "settings");
    THEMES_DIR = (0, import_path.join)(DATA_DIR, "themes");
    QUICK_CSS_PATH = (0, import_path.join)(SETTINGS_DIR, "quickCss.css");
    SETTINGS_FILE = (0, import_path.join)(SETTINGS_DIR, "settings.json");
    NATIVE_SETTINGS_FILE = (0, import_path.join)(SETTINGS_DIR, "native-settings.json");
    DEV_MIGRATED = (0, import_path.join)(SETTINGS_DIR, "migration");
    ALLOWED_PROTOCOLS = [
      "https:",
      "http:",
      "steam:",
      "spotify:",
      "tidal:",
      "itunes:",
      "vrcx:"
    ];
    IS_VANILLA = /* @__PURE__ */ process.argv.includes("--vanilla");
    if (IS_DEV) {
      const prodDir = (0, import_path.join)(DATA_DIR, "..");
      const settings = (0, import_path.join)(prodDir, "settings", "settings.json");
      const quickCss = (0, import_path.join)(prodDir, "settings", "quickCss.css");
      let migrated = false;
      if ((0, import_fs.existsSync)(DEV_MIGRATED)) {
        const content = (0, import_fs.readFileSync)(DEV_MIGRATED, "utf-8");
        migrated = content.includes("migrated");
      }
      if (!migrated) {
        setTimeout(() => {
          try {
            if ((0, import_fs.existsSync)(settings)) (0, import_fs.copyFileSync)(settings, SETTINGS_FILE);
            if ((0, import_fs.existsSync)(quickCss)) (0, import_fs.copyFileSync)(quickCss, QUICK_CSS_PATH);
            (0, import_fs.writeFileSync)(DEV_MIGRATED, "migrated");
            import_electron.app.relaunch();
            import_electron.app.exit(0);
          } catch (err2) {
            console.error("[Midnightcord] Failed to copy prod data:", err2);
          }
        }, 5e3);
      }
    }
  }
});

// src/shared/debounce.ts
function debounce(func, delay = 300) {
  let timeout;
  return function(...args2) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(...args2);
    }, delay);
  };
}
var init_debounce = __esm({
  "src/shared/debounce.ts"() {
    "use strict";
  }
});

// src/main/settings.ts
function readSettings(name, file) {
  try {
    return JSON.parse((0, import_fs2.readFileSync)(file, "utf-8"));
  } catch (err2) {
    if (err2?.code !== "ENOENT")
      console.error(`Failed to read ${name} settings`, err2);
    return {};
  }
}
var import_electron2, import_fs2, RendererSettings, saveRendererSettings, DefaultNativeSettings, nativeSettings, NativeSettings, saveNativeSettings;
var init_settings = __esm({
  "src/main/settings.ts"() {
    "use strict";
    init_IpcEvents();
    init_SettingsStore();
    init_mergeDefaults();
    import_electron2 = require("electron");
    import_fs2 = require("fs");
    init_constants();
    init_debounce();
    (0, import_fs2.mkdirSync)(SETTINGS_DIR, { recursive: true });
    RendererSettings = new SettingsStore(readSettings("renderer", SETTINGS_FILE));
    saveRendererSettings = debounce(() => {
      try {
        (0, import_fs2.writeFileSync)(SETTINGS_FILE, JSON.stringify(RendererSettings.plain, null, 4));
      } catch (e) {
        console.error("Failed to write renderer settings", e);
      }
    }, 500);
    RendererSettings.addGlobalChangeListener(saveRendererSettings);
    import_electron2.ipcMain.handle("VencordGetSettingsDir" /* GET_SETTINGS_DIR */, () => SETTINGS_DIR);
    import_electron2.ipcMain.on("VencordGetSettings" /* GET_SETTINGS */, (e) => e.returnValue = RendererSettings.plain);
    import_electron2.ipcMain.handle("VencordSetSettings" /* SET_SETTINGS */, (_, data, pathToNotify) => {
      RendererSettings.setData(data, pathToNotify);
    });
    DefaultNativeSettings = {
      plugins: {},
      customCspRules: {}
    };
    nativeSettings = readSettings("native", NATIVE_SETTINGS_FILE);
    mergeDefaults(nativeSettings, DefaultNativeSettings);
    NativeSettings = new SettingsStore(nativeSettings);
    saveNativeSettings = debounce(() => {
      try {
        (0, import_fs2.writeFileSync)(NATIVE_SETTINGS_FILE, JSON.stringify(NativeSettings.plain, null, 4));
      } catch (e) {
        console.error("Failed to write native settings", e);
      }
    }, 500);
    NativeSettings.addGlobalChangeListener(saveNativeSettings);
  }
});

// src/main/updater/common.ts
function serializeErrors(func) {
  return async function() {
    try {
      return {
        ok: true,
        value: await func(...arguments)
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? {
          // prototypes get lost, so turn error into plain object
          ...e,
          message: e.message,
          name: e.name,
          stack: e.stack
        } : e
      };
    }
  };
}
var ASAR_FILE;
var init_common = __esm({
  "src/main/updater/common.ts"() {
    "use strict";
    ASAR_FILE = IS_VESKTOP ? "vesktop.asar" : IS_EQUIBOP ? "equibop.asar" : "desktop.asar";
  }
});

// src/main/utils/http.ts
async function checkedFetch(url, options2) {
  try {
    var res = await fetch(url, options2);
  } catch (err2) {
    if (err2 instanceof Error && err2.cause) {
      err2 = err2.cause;
    }
    throw new Error(`${options2?.method ?? "GET"} ${url} failed: ${err2}`);
  }
  if (res.ok) {
    return res;
  }
  let message = `${options2?.method ?? "GET"} ${url}: ${res.status} ${res.statusText}`;
  try {
    let reason = await res.text();
    reason = reason.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (reason) message += `: ${reason.substring(0, 200)}${reason.length > 200 ? "..." : ""}`;
  } catch {
  }
  throw new Error(message);
}
async function fetchJson(url, options2) {
  const res = await checkedFetch(url, options2);
  return res.json();
}
async function fetchBuffer(url, options2) {
  const res = await checkedFetch(url, options2);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}
var import_original_fs;
var init_http = __esm({
  "src/main/utils/http.ts"() {
    "use strict";
    import_original_fs = require("original-fs");
  }
});

// src/shared/vencordUserAgent.ts
var import_git_hash, import_git_remote, gitHashShort, VENCORD_USER_AGENT, VENCORD_USER_AGENT_HASHLESS;
var init_vencordUserAgent = __esm({
  "src/shared/vencordUserAgent.ts"() {
    "use strict";
    import_git_hash = __toESM(require("~git-hash"));
    import_git_remote = __toESM(require("~git-remote"));
    gitHashShort = import_git_hash.default.slice(0, 7);
    VENCORD_USER_AGENT = `Midnightcord/${import_git_hash.default}${import_git_remote.default ? ` (https://github.com/${import_git_remote.default})` : ""}`;
    VENCORD_USER_AGENT_HASHLESS = `Midnightcord${import_git_remote.default ? ` (https://github.com/${import_git_remote.default})` : ""}`;
  }
});

// DOMAIN.json
var domain;
var init_DOMAIN = __esm({
  "DOMAIN.json"() {
    domain = "nightcord.st";
  }
});

// src/main/updater/http.ts
var http_exports = {};
async function githubGet(endpoint) {
  return fetchJson(API_BASE + endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent": VENCORD_USER_AGENT
    }
  });
}
function isNewer(a, b) {
  const parse = (v) => v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const av = parse(a), bv = parse(b);
  for (let i2 = 0; i2 < Math.max(av.length, bv.length); i2++) {
    if ((bv[i2] ?? 0) > (av[i2] ?? 0)) return true;
    if ((bv[i2] ?? 0) < (av[i2] ?? 0)) return false;
  }
  return false;
}
async function fetchUpdates() {
  const data = await githubGet("/releases/latest");
  const latestTag = data.tag_name ?? "";
  if (!latestTag || !isNewer(CURRENT_VERSION, latestTag)) return false;
  const asset = data.assets?.find(
    (a) => a.name === ZIP_FILE
  );
  if (!asset) return false;
  pendingDownloadUrl = asset.browser_download_url;
  pendingVersion = latestTag;
  return true;
}
async function getUpdates() {
  const outdated = await fetchUpdates();
  if (!outdated) return [];
  return [{
    hash: pendingVersion ?? "new",
    author: "Midnightcord",
    message: `Nouvelle version disponible : ${pendingVersion}`
  }];
}
async function applyUpdates() {
  if (!pendingDownloadUrl) return false;
  if (isApplying) return false;
  isApplying = true;
  try {
    const data = await fetchBuffer(pendingDownloadUrl);
    const zipPath = (0, import_path2.join)(import_electron4.app.getPath("temp"), `midnightcord-update-${Date.now()}.zip`);
    (0, import_original_fs2.writeFileSync)(zipPath, data, { flush: true });
    const destPath = __dirname;
    const tmpExtract = (0, import_path2.join)(import_electron4.app.getPath("temp"), `midnightcord-extract-${Date.now()}`);
    return await new Promise((resolve2, reject) => {
      const psExtract = `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${tmpExtract}' -Force`;
      (0, import_child_process.exec)(`powershell -NoProfile -NonInteractive -Command "${psExtract}"`, (err2) => {
        if (err2) {
          try {
            (0, import_original_fs2.rmSync)(zipPath, { force: true });
          } catch {
          }
          return reject(new Error("ZIP extraction failed: " + err2.message));
        }
        const psMove = `Copy-Item -Path '${tmpExtract}\\*' -Destination '${destPath}' -Recurse -Force`;
        (0, import_child_process.exec)(`powershell -NoProfile -NonInteractive -Command "${psMove}"`, (err22) => {
          try {
            (0, import_original_fs2.rmSync)(zipPath, { force: true });
          } catch {
          }
          try {
            (0, import_original_fs2.rmSync)(tmpExtract, { recursive: true, force: true });
          } catch {
          }
          if (err22) {
            return reject(new Error("File copy failed: " + err22.message));
          }
          pendingDownloadUrl = null;
          pendingVersion = null;
          resolve2(true);
        });
      });
    });
  } finally {
    isApplying = false;
  }
}
var import_child_process, import_electron4, import_original_fs2, import_path2, GITEA_BASE, API_BASE, REPO_URL, CURRENT_VERSION, ZIP_FILE, pendingDownloadUrl, pendingVersion, isApplying;
var init_http2 = __esm({
  "src/main/updater/http.ts"() {
    "use strict";
    init_http();
    init_IpcEvents();
    init_vencordUserAgent();
    import_child_process = require("child_process");
    import_electron4 = require("electron");
    import_original_fs2 = require("original-fs");
    import_path2 = require("path");
    init_DOMAIN();
    init_common();
    GITEA_BASE = `https://source.${domain}`;
    API_BASE = `${GITEA_BASE}/api/v1/repos/nightcord/nightcord`;
    REPO_URL = `${GITEA_BASE}/nightcord/nightcord`;
    CURRENT_VERSION = `v${VERSION}`;
    ZIP_FILE = "midnightcord-dist.zip";
    pendingDownloadUrl = null;
    pendingVersion = null;
    isApplying = false;
    import_electron4.ipcMain.handle("VencordGetRepo" /* GET_REPO */, serializeErrors(() => REPO_URL));
    import_electron4.ipcMain.handle("VencordGetUpdates" /* GET_UPDATES */, serializeErrors(getUpdates));
    import_electron4.ipcMain.handle("VencordUpdate" /* UPDATE */, serializeErrors(fetchUpdates));
    import_electron4.ipcMain.handle("VencordBuild" /* BUILD */, serializeErrors(applyUpdates));
  }
});

// src/midnightcord/shared/IpcEvents.ts
var IpcEvents2;
var init_IpcEvents2 = __esm({
  "src/midnightcord/shared/IpcEvents.ts"() {
    "use strict";
    IpcEvents2 = /* @__PURE__ */ ((IpcEvents3) => {
      IpcEvents3["GET_VENCORD_PRELOAD_SCRIPT"] = "VCD_GET_VC_PRELOAD_SCRIPT";
      IpcEvents3["DEPRECATED_GET_VENCORD_PRELOAD_SCRIPT_PATH"] = "DEPRECATED_GET_VENCORD_PRELOAD_SCRIPT_PATH";
      IpcEvents3["GET_VENCORD_RENDERER_SCRIPT"] = "VCD_GET_VC_RENDERER_SCRIPT";
      IpcEvents3["GET_VESKTOP_RENDERER_SCRIPT"] = "VCD_GET_RENDERER_SCRIPT";
      IpcEvents3["GET_VESKTOP_RENDERER_CSS"] = "VCD_GET_RENDERER_CSS";
      IpcEvents3["VESKTOP_RENDERER_CSS_UPDATE"] = "VCD_PRELOAD_RENDERER_CSS_UPDATE";
      IpcEvents3["GET_VERSION"] = "VCD_GET_VERSION";
      IpcEvents3["GET_GIT_HASH"] = "VCD_GET_GIT_HASH";
      IpcEvents3["SUPPORTS_WINDOWS_TRANSPARENCY"] = "VCD_SUPPORTS_WINDOWS_TRANSPARENCY";
      IpcEvents3["GET_ENABLE_HARDWARE_ACCELERATION"] = "VCD_GET_ENABLE_HARDWARE_ACCELERATION";
      IpcEvents3["RELAUNCH"] = "VCD_RELAUNCH";
      IpcEvents3["CLOSE"] = "VCD_CLOSE";
      IpcEvents3["FOCUS"] = "VCD_FOCUS";
      IpcEvents3["MINIMIZE"] = "VCD_MINIMIZE";
      IpcEvents3["MAXIMIZE"] = "VCD_MAXIMIZE";
      IpcEvents3["GET_SETTINGS"] = "VCD_GET_SETTINGS";
      IpcEvents3["SET_SETTINGS"] = "VCD_SET_SETTINGS";
      IpcEvents3["IS_USING_CUSTOM_VENCORD_DIR"] = "VCD_IS_USING_CUSTOM_VENCORD_DIR";
      IpcEvents3["SHOW_CUSTOM_VENCORD_DIR"] = "VCD_SHOW_CUSTOM_VENCORD_DIR";
      IpcEvents3["SELECT_VENCORD_DIR"] = "VCD_SELECT_VENCORD_DIR";
      IpcEvents3["UPDATER_IS_OUTDATED"] = "VCD_UPDATER_IS_OUTDATED";
      IpcEvents3["UPDATER_OPEN"] = "VCD_UPDATER_OPEN";
      IpcEvents3["SPELLCHECK_GET_AVAILABLE_LANGUAGES"] = "VCD_SPELLCHECK_GET_AVAILABLE_LANGUAGES";
      IpcEvents3["SPELLCHECK_RESULT"] = "VCD_SPELLCHECK_RESULT";
      IpcEvents3["SPELLCHECK_REPLACE_MISSPELLING"] = "VCD_SPELLCHECK_REPLACE_MISSPELLING";
      IpcEvents3["SPELLCHECK_ADD_TO_DICTIONARY"] = "VCD_SPELLCHECK_ADD_TO_DICTIONARY";
      IpcEvents3["SET_BADGE_COUNT"] = "VCD_SET_BADGE_COUNT";
      IpcEvents3["FLASH_FRAME"] = "FLASH_FRAME";
      IpcEvents3["CAPTURER_GET_LARGE_THUMBNAIL"] = "VCD_CAPTURER_GET_LARGE_THUMBNAIL";
      IpcEvents3["AUTOSTART_ENABLED"] = "VCD_AUTOSTART_ENABLED";
      IpcEvents3["ENABLE_AUTOSTART"] = "VCD_ENABLE_AUTOSTART";
      IpcEvents3["DISABLE_AUTOSTART"] = "VCD_DISABLE_AUTOSTART";
      IpcEvents3["VIRT_MIC_LIST"] = "VCD_VIRT_MIC_LIST";
      IpcEvents3["VIRT_MIC_START"] = "VCD_VIRT_MIC_START";
      IpcEvents3["VIRT_MIC_START_SYSTEM"] = "VCD_VIRT_MIC_START_ALL";
      IpcEvents3["VIRT_MIC_STOP"] = "VCD_VIRT_MIC_STOP";
      IpcEvents3["CLIPBOARD_COPY_IMAGE"] = "VCD_CLIPBOARD_COPY_IMAGE";
      IpcEvents3["TOGGLE_SELF_MUTE"] = "VCD_TOGGLE_SELF_MUTE";
      IpcEvents3["TOGGLE_SELF_DEAF"] = "VCD_TOGGLE_SELF_DEAF";
      IpcEvents3["SET_CURRENT_VOICE_TRAY_ICON"] = "VCD_SET_CURRENT_VOICE_ICON";
      IpcEvents3["VOICE_STATE_CHANGED"] = "VCD_VOICE_STATE_CHANGED";
      IpcEvents3["VOICE_CALL_STATE_CHANGED"] = "VCD_VOICE_CALL_STATE_CHANGED";
      IpcEvents3["ARRPC_ACTIVITY"] = "VCD_ARRPC_ACTIVITY";
      IpcEvents3["ARRPC_OPEN_SETTINGS"] = "VCD_ARRPC_OPEN_SETTINGS";
      IpcEvents3["DEBUG_LAUNCH_GPU"] = "VCD_DEBUG_LAUNCH_GPU";
      IpcEvents3["DEBUG_LAUNCH_WEBRTC_INTERNALS"] = "VCD_DEBUG_LAUNCH_WEBRTC";
      IpcEvents3["IPC_COMMAND"] = "VCD_IPC_COMMAND";
      IpcEvents3["DEVTOOLS_OPENED"] = "VCD_DEVTOOLS_OPENED";
      IpcEvents3["DEVTOOLS_CLOSED"] = "VCD_DEVTOOLS_CLOSED";
      IpcEvents3["CHOOSE_USER_ASSET"] = "VCD_CHOOSE_USER_ASSET";
      IpcEvents3["GET_PLATFORM_SPOOF_INFO"] = "VCD_GET_PLATFORM_SPOOF_INFO";
      IpcEvents3["RELAUNCH_APP"] = "MidnightcordRelaunchApp";
      return IpcEvents3;
    })(IpcEvents2 || {});
  }
});

// src/midnightcord/shared/utils/text.ts
function stripIndent(strings, ...values) {
  const string = String.raw({ raw: strings }, ...values);
  const match = string.match(/^[ \t]*(?=\S)/gm);
  if (!match) return string.trim();
  const minIndent = match.reduce((r, a) => Math.min(r, a.length), Infinity);
  return string.replace(new RegExp(`^[ \\t]{${minIndent}}`, "gm"), "").trim();
}
var init_text = __esm({
  "src/midnightcord/shared/utils/text.ts"() {
    "use strict";
  }
});

// src/midnightcord/shared/paths.ts
var import_path3, STATIC_DIR, BADGE_DIR;
var init_paths = __esm({
  "src/midnightcord/shared/paths.ts"() {
    "use strict";
    init_constants2();
    import_path3 = require("path");
    STATIC_DIR = /* @__PURE__ */ (0, import_path3.join)(__dirname, "..", "..", "static");
    BADGE_DIR = /* @__PURE__ */ (0, import_path3.join)(STATIC_DIR, "badges");
  }
});

// src/midnightcord/shared/utils/guards.ts
function isTruthy(item) {
  return Boolean(item);
}
var init_guards = __esm({
  "src/midnightcord/shared/utils/guards.ts"() {
    "use strict";
  }
});

// src/midnightcord/shared/utils/once.ts
function once(fn) {
  let called = false;
  return function(...args2) {
    if (called) return;
    called = true;
    return fn.apply(this, args2);
  };
}
var init_once = __esm({
  "src/midnightcord/shared/utils/once.ts"() {
    "use strict";
  }
});

// src/midnightcord/main/utils/isPathInDirectory.ts
function isPathInDirectory(filePath, directory) {
  const resolvedPath = (0, import_path4.resolve)(filePath);
  const resolvedDirectory = (0, import_path4.resolve)(directory);
  const normalizedDirectory = resolvedDirectory.endsWith(import_path4.sep) ? resolvedDirectory : resolvedDirectory + import_path4.sep;
  return resolvedPath.startsWith(normalizedDirectory) || resolvedPath === resolvedDirectory;
}
var import_path4;
var init_isPathInDirectory = __esm({
  "src/midnightcord/main/utils/isPathInDirectory.ts"() {
    "use strict";
    import_path4 = require("path");
  }
});

// src/midnightcord/main/vesktopStatic.ts
async function handleVesktopStaticProtocol(path, req) {
  const fullPath = (0, import_path5.join)(STATIC_DIR2, path);
  if (!isPathInDirectory(fullPath, STATIC_DIR2)) {
    return new Response(null, { status: 404 });
  }
  return import_electron8.net.fetch((0, import_url.pathToFileURL)(fullPath).href);
}
function loadView(browserWindow, view, params) {
  const url = new URL(`midnightcord://static/views/${view}`);
  if (params) {
    url.search = params.toString();
  }
  return browserWindow.loadURL(url.toString());
}
var import_electron8, import_path5, import_url, STATIC_DIR2;
var init_vesktopStatic = __esm({
  "src/midnightcord/main/vesktopStatic.ts"() {
    "use strict";
    import_electron8 = require("electron");
    import_path5 = require("path");
    import_url = require("url");
    init_isPathInDirectory();
    STATIC_DIR2 = (0, import_path5.join)(__dirname, "..", "..", "static");
  }
});

// src/midnightcord/main/about.ts
async function createAboutWindow() {
  const height = 750;
  const width = height * (4 / 3);
  const about = new import_electron9.BrowserWindow({
    center: true,
    autoHideMenuBar: true,
    ...process.platform === "win32" ? { icon: (0, import_path6.join)(STATIC_DIR, "icon.ico") } : process.platform === "linux" ? { icon: (0, import_path6.join)(STATIC_DIR, "icon.png") } : {},
    height,
    width
  });
  makeLinksOpenExternally(about);
  const data = new URLSearchParams({
    APP_VERSION: import_electron9.app.getVersion()
  });
  loadView(about, "about.html", data);
  return about;
}
var import_electron9, import_path6;
var init_about = __esm({
  "src/midnightcord/main/about.ts"() {
    "use strict";
    import_electron9 = require("electron");
    import_path6 = require("path");
    init_paths();
    init_makeLinksOpenExternally();
    init_vesktopStatic();
  }
});

// src/midnightcord/main/dbus.ts
function loadLibVesktop() {
  try {
    if (!libVesktop) {
      libVesktop = require((0, import_path7.join)(STATIC_DIR, `dist/libvesktop-${process.arch}.node`));
    }
  } catch (e) {
    console.error("Failed to load libvesktop:", e);
  }
  return libVesktop;
}
function updateUnityLauncherCount(count) {
  const libVesktop2 = loadLibVesktop();
  if (!libVesktop2) {
    return import_electron10.app.setBadgeCount(count);
  }
  return libVesktop2.updateUnityLauncherCount(count);
}
function requestBackground(autoStart2, commandLine) {
  return loadLibVesktop()?.requestBackground(autoStart2, commandLine) ?? false;
}
var import_electron10, import_path7, libVesktop;
var init_dbus = __esm({
  "src/midnightcord/main/dbus.ts"() {
    "use strict";
    import_electron10 = require("electron");
    import_path7 = require("path");
    init_paths();
    libVesktop = null;
  }
});

// src/midnightcord/main/events.ts
var import_events, AppEvents;
var init_events = __esm({
  "src/midnightcord/main/events.ts"() {
    "use strict";
    import_events = require("events");
    AppEvents = new import_events.EventEmitter();
    AppEvents.setMaxListeners(20);
  }
});

// src/midnightcord/main/appBadge.ts
function loadBadge(index) {
  const cached = imgCache.get(index);
  if (cached) return cached;
  const img = import_electron11.nativeImage.createFromPath((0, import_path8.join)(BADGE_DIR, `${index}.ico`));
  imgCache.set(index, img);
  return img;
}
function destroyAppBadge() {
  AppEvents.off("voiceCallStateChanged", voiceStateListener);
  imgCache.clear();
}
function setBadgeCount(count) {
  if (!isInVoiceCall) {
    AppEvents.emit("setTrayVariant", count !== 0 ? "trayUnread" : "tray");
  }
  switch (process.platform) {
    case "linux":
      updateUnityLauncherCount(count);
      break;
    case "darwin":
      if (count === 0) {
        import_electron11.app.dock.setBadge("");
        break;
      }
      import_electron11.app.dock.setBadge(count === -1 ? "\u2022" : count.toString());
      break;
    case "win32": {
      const [index, description] = getBadgeIndexAndDescription(count);
      if (lastIndex === index) break;
      lastIndex = index;
      mainWin.setOverlayIcon(index === null ? null : loadBadge(index), description);
      break;
    }
  }
}
function getBadgeIndexAndDescription(count) {
  if (count === -1) return [11, "Unread Messages"];
  if (count === 0) return [null, "No Notifications"];
  const index = Math.max(1, Math.min(count, 10));
  return [index, `${index} Notification`];
}
var import_electron11, import_path8, imgCache, lastIndex, isInVoiceCall, voiceStateListener;
var init_appBadge = __esm({
  "src/midnightcord/main/appBadge.ts"() {
    "use strict";
    import_electron11 = require("electron");
    import_path8 = require("path");
    init_paths();
    init_dbus();
    init_events();
    init_mainWindow();
    imgCache = /* @__PURE__ */ new Map();
    lastIndex = -1;
    isInVoiceCall = false;
    voiceStateListener = (inCall) => {
      isInVoiceCall = inCall;
    };
    if (!AppEvents.listeners("voiceCallStateChanged").includes(voiceStateListener)) {
      AppEvents.on("voiceCallStateChanged", voiceStateListener);
    }
  }
});

// node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/constants.js"(exports2, module2) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module2.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: /* @__PURE__ */ Symbol("kIsForOnEventAttribute"),
      kListener: /* @__PURE__ */ Symbol("kListener"),
      kStatusCode: /* @__PURE__ */ Symbol("status-code"),
      kWebSocket: /* @__PURE__ */ Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/buffer-util.js"(exports2, module2) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i2 = 0; i2 < list.length; i2++) {
        const buf = list[i2];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i2 = 0; i2 < length; i2++) {
        output[offset + i2] = source[i2] ^ mask[i2 & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i2 = 0; i2 < buffer.length; i2++) {
        buffer[i2] ^= mask[i2 & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module2.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = require("bufferutil");
        module2.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module2.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/limiter.js"(exports2, module2) {
    "use strict";
    var kDone = /* @__PURE__ */ Symbol("kDone");
    var kRun = /* @__PURE__ */ Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module2.exports = Limiter;
  }
});

// node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/permessage-deflate.js"(exports2, module2) {
    "use strict";
    var zlib = require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = /* @__PURE__ */ Symbol("permessage-deflate");
    var kTotalLength = /* @__PURE__ */ Symbol("total-length");
    var kCallback = /* @__PURE__ */ Symbol("callback");
    var kBuffers = /* @__PURE__ */ Symbol("buffers");
    var kError = /* @__PURE__ */ Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options2) {
        this._options = options2 || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err2, result) => {
            done();
            callback(err2, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err2, result) => {
            done();
            callback(err2, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err2 = this._inflate[kError];
          if (err2) {
            this._inflate.close();
            this._inflate = null;
            callback(err2);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module2.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err2) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err2[kStatusCode] = 1007;
      this[kCallback](err2);
    }
  }
});

// node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/validation.js"(exports2, module2) {
    "use strict";
    var { isUtf8 } = require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i2 = 0;
      while (i2 < len) {
        if ((buf[i2] & 128) === 0) {
          i2++;
        } else if ((buf[i2] & 224) === 192) {
          if (i2 + 1 === len || (buf[i2 + 1] & 192) !== 128 || (buf[i2] & 254) === 192) {
            return false;
          }
          i2 += 2;
        } else if ((buf[i2] & 240) === 224) {
          if (i2 + 2 >= len || (buf[i2 + 1] & 192) !== 128 || (buf[i2 + 2] & 192) !== 128 || buf[i2] === 224 && (buf[i2 + 1] & 224) === 128 || // Overlong
          buf[i2] === 237 && (buf[i2 + 1] & 224) === 160) {
            return false;
          }
          i2 += 3;
        } else if ((buf[i2] & 248) === 240) {
          if (i2 + 3 >= len || (buf[i2 + 1] & 192) !== 128 || (buf[i2 + 2] & 192) !== 128 || (buf[i2 + 3] & 192) !== 128 || buf[i2] === 240 && (buf[i2 + 1] & 240) === 128 || // Overlong
          buf[i2] === 244 && buf[i2 + 1] > 143 || buf[i2] > 244) {
            return false;
          }
          i2 += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module2.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module2.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = require("utf-8-validate");
        module2.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/receiver.js"(exports2, module2) {
    "use strict";
    var { Writable } = require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options2 = {}) {
        super();
        this._allowSynchronousEvents = options2.allowSynchronousEvents !== void 0 ? options2.allowSynchronousEvents : true;
        this._binaryType = options2.binaryType || BINARY_TYPES[0];
        this._extensions = options2.extensions || {};
        this._isServer = !!options2.isServer;
        this._maxPayload = options2.maxPayload | 0;
        this._skipUTF8Validation = !!options2.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err2, buf) => {
          if (err2) return cb(err2);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err2 = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err2, this.createError);
        err2.code = errorCode;
        err2[kStatusCode] = statusCode;
        return err2;
      }
    };
    module2.exports = Receiver2;
  }
});

// node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/sender.js"(exports2, module2) {
    "use strict";
    var { Duplex } = require("stream");
    var { randomFillSync } = require("crypto");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = /* @__PURE__ */ Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options2) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options2.mask) {
          mask = options2.maskBuffer || maskBuffer;
          if (options2.generateMask) {
            options2.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options2.mask || skipMasking) && options2[kByteLength] !== void 0) {
            dataLength = options2[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options2.mask && options2.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options2.fin ? options2.opcode | 128 : options2.opcode;
        if (options2.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options2.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else {
            buf.set(data, 2);
          }
        }
        const options2 = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options2, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options2), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options2 = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options2, cb]);
          } else {
            this.getBlobData(data, false, options2, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options2, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options2), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options2 = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options2, cb]);
          } else {
            this.getBlobData(data, false, options2, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options2, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options2), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options2, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options2.binary ? 2 : 1;
        let rsv1 = options2.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options2.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options2.fin,
          generateMask: this._generateMask,
          mask: options2.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options2, cb) {
        this._bufferedBytes += options2[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err2 = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err2, cb);
            return;
          }
          this._bufferedBytes -= options2[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options2), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options2, cb);
          }
        }).catch((err2) => {
          process.nextTick(onError, this, err2, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options2, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options2), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options2[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options2.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err2 = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err2, cb);
            return;
          }
          this._bufferedBytes -= options2[kByteLength];
          this._state = DEFAULT;
          options2.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options2), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module2.exports = Sender2;
    function callCallbacks(sender, err2, cb) {
      if (typeof cb === "function") cb(err2);
      for (let i2 = 0; i2 < sender._queue.length; i2++) {
        const params = sender._queue[i2];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err2);
      }
    }
    function onError(sender, err2, cb) {
      callCallbacks(sender, err2, cb);
      sender.onerror(err2);
    }
  }
});

// node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/event-target.js"(exports2, module2) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = /* @__PURE__ */ Symbol("kCode");
    var kData = /* @__PURE__ */ Symbol("kData");
    var kError = /* @__PURE__ */ Symbol("kError");
    var kMessage = /* @__PURE__ */ Symbol("kMessage");
    var kReason = /* @__PURE__ */ Symbol("kReason");
    var kTarget = /* @__PURE__ */ Symbol("kTarget");
    var kType = /* @__PURE__ */ Symbol("kType");
    var kWasClean = /* @__PURE__ */ Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options2 = {}) {
        super(type);
        this[kCode] = options2.code === void 0 ? 0 : options2.code;
        this[kReason] = options2.reason === void 0 ? "" : options2.reason;
        this[kWasClean] = options2.wasClean === void 0 ? false : options2.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options2 = {}) {
        super(type);
        this[kError] = options2.error === void 0 ? null : options2.error;
        this[kMessage] = options2.message === void 0 ? "" : options2.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options2 = {}) {
        super(type);
        this[kData] = options2.data === void 0 ? null : options2.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options2 = {}) {
        for (const listener of this.listeners(type)) {
          if (!options2[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options2[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options2.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module2.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/extension.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i2 = 0;
      for (; i2 < header.length; i2++) {
        code = header.charCodeAt(i2);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i2;
          } else if (i2 !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i2;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i2}`);
            }
            if (end === -1) end = i2;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i2}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i2;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i2;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i2}`);
            }
            if (end === -1) end = i2;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i2);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i2}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i2}`);
            }
            if (start === -1) start = i2;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i2;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i2;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i2}`);
            }
          } else if (code === 34 && header.charCodeAt(i2 - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i2;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i2;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i2}`);
            }
            if (end === -1) end = i2;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i2}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i2;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module2.exports = { format, parse };
  }
});

// node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/websocket.js"(exports2, module2) {
    "use strict";
    var EventEmitter2 = require("events");
    var https = require("https");
    var http = require("http");
    var net4 = require("net");
    var tls = require("tls");
    var { randomBytes, createHash } = require("crypto");
    var { Duplex, Readable: Readable2 } = require("stream");
    var { URL: URL2 } = require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = /* @__PURE__ */ Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter2 {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options2) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options2 = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options2);
        } else {
          this._autoPong = options2.autoPong;
          this._closeTimeout = options2.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options2) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options2.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxPayload: options2.maxPayload,
          skipUTF8Validation: options2.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options2.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err2) => {
          if (err2) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options2, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options2 === "function") {
          cb = options2;
          options2 = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options2
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module2.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options2) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options2,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err2 = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err2;
        } else {
          emitErrorAndClose(websocket, err2);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol3 of protocols) {
          if (typeof protocol3 !== "string" || !subprotocolRegex.test(protocol3) || protocolSet.has(protocol3)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol3);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options2 && options2.headers;
          options2 = { ...options2, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options2.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options2.headers.authorization) {
          options2.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err2) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err2);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err2 = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err2);
            return;
          }
          initAsClient(websocket, addr, protocols, options2);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err2) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err2) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err2) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err2);
      websocket.emitClose();
    }
    function netConnect(options2) {
      options2.path = options2.socketPath;
      return net4.connect(options2);
    }
    function tlsConnect(options2) {
      options2.path = void 0;
      if (!options2.servername && options2.servername !== "") {
        options2.servername = net4.isIP(options2.host) ? "" : options2.host;
      }
      return tls.connect(options2);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err2 = new Error(message);
      Error.captureStackTrace(err2, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err2);
      } else {
        stream.destroy(err2);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err2 = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err2);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err2) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err2[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err2);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err2) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err2);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/stream.js"(exports2, module2) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err2) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err2);
      }
    }
    function createWebSocketStream2(ws2, options2) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options2,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws2.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws2.pause();
      });
      ws2.once("error", function error(err2) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err2);
      });
      ws2.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err2, callback) {
        if (ws2.readyState === ws2.CLOSED) {
          callback(err2);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws2.once("error", function error(err3) {
          called = true;
          callback(err3);
        });
        ws2.once("close", function close() {
          if (!called) callback(err2);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws2.terminate();
      };
      duplex._final = function(callback) {
        if (ws2.readyState === ws2.CONNECTING) {
          ws2.once("open", function open4() {
            duplex._final(callback);
          });
          return;
        }
        if (ws2._socket === null) return;
        if (ws2._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws2._socket.once("finish", function finish() {
            callback();
          });
          ws2.close();
        }
      };
      duplex._read = function() {
        if (ws2.isPaused) ws2.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws2.readyState === ws2.CONNECTING) {
          ws2.once("open", function open4() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws2.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module2.exports = createWebSocketStream2;
  }
});

// node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/subprotocol.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i2 = 0;
      for (i2; i2 < header.length; i2++) {
        const code = header.charCodeAt(i2);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i2;
        } else if (i2 !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i2;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i2}`);
          }
          if (end === -1) end = i2;
          const protocol4 = header.slice(start, end);
          if (protocols.has(protocol4)) {
            throw new SyntaxError(`The "${protocol4}" subprotocol is duplicated`);
          }
          protocols.add(protocol4);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i2}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol3 = header.slice(start, i2);
      if (protocols.has(protocol3)) {
        throw new SyntaxError(`The "${protocol3}" subprotocol is duplicated`);
      }
      protocols.add(protocol3);
      return protocols;
    }
    module2.exports = { parse };
  }
});

// node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/websocket-server.js"(exports2, module2) {
    "use strict";
    var EventEmitter2 = require("events");
    var http = require("http");
    var { Duplex } = require("stream");
    var { createHash } = require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter2 {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options2, callback) {
        super();
        options2 = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options2
        };
        if (options2.port == null && !options2.server && !options2.noServer || options2.port != null && (options2.server || options2.noServer) || options2.server && options2.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options2.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options2.port,
            options2.host,
            options2.backlog,
            callback
          );
        } else if (options2.server) {
          this._server = options2.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options2.perMessageDeflate === true) options2.perMessageDeflate = {};
        if (options2.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options2;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err2) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err2) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws2 = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol3 = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol3) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol3}`);
            ws2._protocol = protocol3;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws2._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws2.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws2);
          ws2.on("close", () => {
            this.clients.delete(ws2);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws2, req);
      }
    };
    module2.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err2 = new Error(message);
        Error.captureStackTrace(err2, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err2, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// node_modules/.pnpm/ws@8.20.0/node_modules/ws/wrapper.mjs
var import_stream, import_extension, import_permessage_deflate, import_receiver, import_sender, import_subprotocol, import_websocket, import_websocket_server;
var init_wrapper = __esm({
  "node_modules/.pnpm/ws@8.20.0/node_modules/ws/wrapper.mjs"() {
    import_stream = __toESM(require_stream(), 1);
    import_extension = __toESM(require_extension(), 1);
    import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
    import_receiver = __toESM(require_receiver(), 1);
    import_sender = __toESM(require_sender(), 1);
    import_subprotocol = __toESM(require_subprotocol(), 1);
    import_websocket = __toESM(require_websocket(), 1);
    import_websocket_server = __toESM(require_websocket_server(), 1);
  }
});

// src/midnightcord/shared/utils/SettingsStore.ts
var SettingsStore2;
var init_SettingsStore2 = __esm({
  "src/midnightcord/shared/utils/SettingsStore.ts"() {
    "use strict";
    SettingsStore2 = class {
      pathListeners = /* @__PURE__ */ new Map();
      globalListeners = /* @__PURE__ */ new Set();
      constructor(plain) {
        this.plain = plain;
        this.store = this.makeProxy(plain);
      }
      makeProxy(object, root = object, path = "") {
        const self2 = this;
        return new Proxy(object, {
          get(target, key) {
            const v = target[key];
            if (typeof v === "object" && v !== null && !Array.isArray(v))
              return self2.makeProxy(v, root, `${path}${path && "."}${key}`);
            return v;
          },
          set(target, key, value) {
            if (target[key] === value) return true;
            Reflect.set(target, key, value);
            const setPath = `${path}${path && "."}${key}`;
            self2.globalListeners.forEach((cb) => cb(root, setPath));
            self2.pathListeners.get(setPath)?.forEach((cb) => cb(value));
            return true;
          },
          deleteProperty(target, key) {
            if (!(key in target)) return true;
            const res = Reflect.deleteProperty(target, key);
            if (!res) return false;
            const setPath = `${path}${path && "."}${key}`;
            self2.globalListeners.forEach((cb) => cb(root, setPath));
            self2.pathListeners.get(setPath)?.forEach((cb) => cb(void 0));
            return res;
          }
        });
      }
      /**
       * Set the data of the store.
       * This will update this.store and this.plain (and old references to them will be stale! Avoid storing them in variables)
       *
       * Additionally, all global listeners (and those for pathToNotify, if specified) will be called with the new data
       * @param value New data
       * @param pathToNotify Optional path to notify instead of globally. Used to transfer path via ipc
       */
      setData(value, pathToNotify) {
        this.plain = value;
        this.store = this.makeProxy(value);
        if (pathToNotify) {
          let v = value;
          const path = pathToNotify.split(".");
          for (const p of path) {
            if (!v) {
              console.warn(
                `Settings#setData: Path ${pathToNotify} does not exist in new data. Not dispatching update`
              );
              return;
            }
            v = v[p];
          }
          this.pathListeners.get(pathToNotify)?.forEach((cb) => cb(v));
        }
        this.globalListeners.forEach((cb) => cb(value, ""));
      }
      /**
       * Add a global change listener, that will fire whenever any setting is changed
       */
      addGlobalChangeListener(cb) {
        this.globalListeners.add(cb);
      }
      /**
       * Add a scoped change listener that will fire whenever a setting matching the specified path is changed.
       *
       * For example if path is `"foo.bar"`, the listener will fire on
       * ```js
       * Setting.store.foo.bar = "hi"
       * ```
       * but not on
       * ```js
       * Setting.store.foo.baz = "hi"
       * ```
       * @param path
       * @param cb
       */
      addChangeListener(path, cb) {
        const listeners = this.pathListeners.get(path) ?? /* @__PURE__ */ new Set();
        listeners.add(cb);
        this.pathListeners.set(path, listeners);
      }
      /**
       * Remove a global listener
       * @see {@link addGlobalChangeListener}
       */
      removeGlobalChangeListener(cb) {
        this.globalListeners.delete(cb);
      }
      /**
       * Remove a scoped listener
       * @see {@link addChangeListener}
       */
      removeChangeListener(path, cb) {
        const listeners = this.pathListeners.get(path);
        if (!listeners) return;
        listeners.delete(cb);
        if (!listeners.size) this.pathListeners.delete(path);
      }
      /**
       * Call all global change listeners
       */
      markAsChanged() {
        this.globalListeners.forEach((cb) => cb(this.plain, ""));
      }
    };
  }
});

// src/midnightcord/main/settings.ts
function loadSettings(file, name) {
  let settings = {};
  try {
    const content = (0, import_fs3.readFileSync)(file, "utf8");
    try {
      settings = JSON.parse(content);
    } catch (err2) {
      console.error(`Failed to parse ${name}.json:`, err2);
    }
  } catch {
  }
  const store = new SettingsStore2(settings);
  store.addGlobalChangeListener((o) => {
    try {
      (0, import_fs3.mkdirSync)((0, import_path9.dirname)(file), { recursive: true });
      (0, import_fs3.writeFileSync)(file, JSON.stringify(o, null, 4));
    } catch (err2) {
      console.error(`Failed to save settings to ${name}.json:`, err2);
    }
  });
  return store;
}
var import_fs3, import_path9, SETTINGS_FILE2, STATE_FILE, Settings, VencordSettings, State;
var init_settings2 = __esm({
  "src/midnightcord/main/settings.ts"() {
    "use strict";
    import_fs3 = require("fs");
    import_path9 = require("path");
    init_SettingsStore2();
    init_constants2();
    SETTINGS_FILE2 = (0, import_path9.join)(DATA_DIR2, "settings.json");
    STATE_FILE = (0, import_path9.join)(DATA_DIR2, "state.json");
    Settings = loadSettings(SETTINGS_FILE2, "Midnightcord settings");
    VencordSettings = loadSettings(VENCORD_SETTINGS_FILE, "Vencord settings");
    State = loadSettings(STATE_FILE, "Midnightcord state");
  }
});

// src/midnightcord/main/arrpc/index.ts
function debugLog(...args2) {
  if (Settings.store.arRPCDebug) {
    console.log("[arRPC > debug]", ...args2);
  }
}
function validatePlatform() {
  const { platform, arch } = process;
  const supportedArchs = SUPPORTED_PLATFORMS.get(platform);
  if (!supportedArchs) {
    throw new Error(
      `Unsupported platform: ${platform}. arRPC only supports: ${Array.from(SUPPORTED_PLATFORMS.keys()).join(", ")}`
    );
  }
  if (!supportedArchs.includes(arch)) {
    throw new Error(`Unsupported architecture for ${platform}: ${arch}. Supported: ${supportedArchs.join(", ")}`);
  }
}
function getArRPCBinaryPath() {
  validatePlatform();
  const { platform } = process;
  const { arch } = process;
  debugLog(`Looking for arRPC binary for platform=${platform}, arch=${arch}`);
  const checkBinary = (path) => {
    if (path.includes(".asar")) return false;
    if (!(0, import_fs4.existsSync)(path)) return false;
    const stats = (0, import_fs4.statSync)(path);
    if (!stats.isFile()) {
      debugLog(`Path exists but is not a file: ${path}`);
      return false;
    }
    try {
      (0, import_fs4.accessSync)(path, import_fs4.constants.X_OK);
      return true;
    } catch {
      if (platform !== "win32") {
        debugLog(`Binary not executable: ${path}`);
        return false;
      }
      return true;
    }
  };
  const platformName = platform === "win32" ? "windows" : platform;
  const archName = arch === "arm64" ? "arm64" : "x64";
  const devBinaryName = `arrpc-${platformName}-${archName}${platform === "win32" ? ".exe" : ""}`;
  const packagedBinaryName = platform === "win32" ? "arrpc.exe" : "arrpc";
  const searchPaths = [];
  if (platform === "linux") {
    searchPaths.push("/usr/bin/arrpc-bun");
    searchPaths.push("/usr/local/bin/arrpc-bun");
    searchPaths.push("/app/bin/arrpc-bun");
    searchPaths.push("/snap/bin/arrpc-bun");
    const homeDir = process.env.HOME;
    if (homeDir) {
      searchPaths.push((0, import_path10.join)(homeDir, ".nix-profile/bin/arrpc-bun"));
      searchPaths.push((0, import_path10.join)(homeDir, ".local/bin/arrpc-bun"));
    }
    searchPaths.push("/home/linuxbrew/.linuxbrew/bin/arrpc-bun");
  } else if (platform === "darwin") {
    searchPaths.push("/usr/local/bin/arrpc-bun");
    searchPaths.push("/opt/homebrew/bin/arrpc-bun");
    const homeDir = process.env.HOME;
    if (homeDir) {
      searchPaths.push((0, import_path10.join)(homeDir, ".nix-profile/bin/arrpc-bun"));
    }
  } else if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    const programFiles = process.env.PROGRAMFILES;
    if (localAppData) {
      searchPaths.push((0, import_path10.join)(localAppData, "arrpc-bun", "arrpc-bun.exe"));
    }
    if (programFiles) {
      searchPaths.push((0, import_path10.join)(programFiles, "arrpc-bun", "arrpc-bun.exe"));
    }
  }
  if (process.resourcesPath) {
    searchPaths.push((0, import_path10.join)(process.resourcesPath, "arrpc", packagedBinaryName));
  }
  if (STATIC_DIR.includes(".asar")) {
    const asarParent = (0, import_path10.join)(STATIC_DIR.split(".asar")[0] + ".asar", "..");
    searchPaths.push((0, import_path10.join)(asarParent, "arrpc", packagedBinaryName));
  }
  searchPaths.push((0, import_path10.join)(STATIC_DIR, "dist", devBinaryName));
  for (const path of searchPaths) {
    debugLog(`Checking: ${path}`);
    if (checkBinary(path)) {
      debugLog(`Found arRPC binary at: ${path}`);
      return path;
    }
  }
  throw new Error(`arRPC binary not found. Searched: ${searchPaths.join(", ")}`);
}
function findStateFile() {
  const tempDir = (0, import_os.tmpdir)();
  for (let i2 = 0; i2 <= STATE_FILE_MAX_INDEX; i2++) {
    const path = (0, import_path10.join)(tempDir, `${STATE_FILE_PREFIX}-${i2}`);
    if ((0, import_fs4.existsSync)(path)) {
      try {
        const content = JSON.parse((0, import_fs4.readFileSync)(path, "utf-8"));
        const age = Date.now() - content.timestamp;
        if (age < STATE_FILE_STALE_MS) {
          return path;
        }
      } catch {
        continue;
      }
    }
  }
  if (arrpcProcess?.pid) {
    const pidPath = (0, import_path10.join)(tempDir, `${STATE_FILE_PREFIX}-${arrpcProcess.pid}`);
    if ((0, import_fs4.existsSync)(pidPath)) {
      return pidPath;
    }
  }
  return null;
}
function readStateFile() {
  const path = stateFilePath || findStateFile();
  if (!path) return null;
  try {
    const content = JSON.parse((0, import_fs4.readFileSync)(path, "utf-8"));
    const age = Date.now() - content.timestamp;
    if (age > STATE_FILE_STALE_MS) {
      debugLog(`State file is stale (${age}ms old)`);
      return null;
    }
    return content;
  } catch (e) {
    debugLog(`Failed to read state file: ${e}`);
    return null;
  }
}
function handleStateUpdate(state) {
  if (state.servers.bridge) {
    serverPort = state.servers.bridge.port;
    serverHost = state.servers.bridge.host;
    debugLog(`State file bridge info: ${serverHost}:${serverPort}`);
  }
  if (state.appVersion && state.appVersion !== "unknown") {
    appVersion = state.appVersion;
  }
  if (!isReady && state.timestamp) {
    isReady = true;
    readyTime = Date.now();
    clearInitTimeout();
    debugLog(`arRPC ready (from state file), version: ${state.appVersion}`);
    updateWebSocketConnection();
  }
}
function startStateFileWatching() {
  stopStateFileWatching();
  stateCheckInterval = setInterval(() => {
    const path = findStateFile();
    if (path) {
      stateFilePath = path;
      debugLog(`Found state file: ${path}`);
      const state = readStateFile();
      if (state) {
        handleStateUpdate(state);
      }
      try {
        stateFileWatcher = (0, import_fs4.watch)(path, { persistent: false }, () => {
          const updatedState = readStateFile();
          if (updatedState) {
            handleStateUpdate(updatedState);
          }
        });
        debugLog(`Watching state file: ${path}`);
        if (stateCheckInterval) {
          clearInterval(stateCheckInterval);
          stateCheckInterval = null;
        }
      } catch (e) {
        debugLog(`Failed to watch state file, continuing to poll: ${e}`);
      }
    }
  }, STATE_CHECK_INTERVAL_MS);
}
function stopStateFileWatching() {
  if (stateFileWatcher) {
    stateFileWatcher.close();
    stateFileWatcher = null;
  }
  if (stateCheckInterval) {
    clearInterval(stateCheckInterval);
    stateCheckInterval = null;
  }
  stateFilePath = null;
}
function findAnyStateFile() {
  const tempDir = (0, import_os.tmpdir)();
  for (let i2 = 0; i2 <= STATE_FILE_MAX_INDEX; i2++) {
    const path = (0, import_path10.join)(tempDir, `${STATE_FILE_PREFIX}-${i2}`);
    if ((0, import_fs4.existsSync)(path)) {
      try {
        const content = JSON.parse((0, import_fs4.readFileSync)(path, "utf-8"));
        const age = Date.now() - content.timestamp;
        return { content, stale: age >= STATE_FILE_STALE_MS };
      } catch {
        continue;
      }
    }
  }
  return { content: null, stale: false };
}
function getWsConnectionInfo() {
  const customHost = Settings.store.arRPCWebSocketCustomHost;
  const customPort = Settings.store.arRPCWebSocketCustomPort;
  if (customHost || customPort) {
    return {
      host: customHost || "127.0.0.1",
      port: customPort || 1337
    };
  }
  const state = readStateFile();
  if (state?.servers.bridge) {
    return {
      host: state.servers.bridge.host,
      port: state.servers.bridge.port
    };
  }
  if (serverHost && serverPort) {
    return { host: serverHost, port: serverPort };
  }
  return null;
}
function connectWebSocket() {
  const connectionInfo = getWsConnectionInfo();
  if (!connectionInfo) {
    debugLog("No connection info available for WebSocket");
    return;
  }
  const { host, port } = connectionInfo;
  const wsUrl = `ws://${host}:${port}`;
  debugLog(`Connecting WebSocket to ${wsUrl}`);
  if (ws) {
    wsIntentionalClose = true;
    ws.close();
  }
  ws = new import_websocket.default(wsUrl);
  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      debugLog("Received activity:", message);
      mainWin?.webContents.send("VCD_ARRPC_ACTIVITY" /* ARRPC_ACTIVITY */, message);
    } catch (e) {
      debugLog("Failed to parse WebSocket message:", e);
    }
  });
  ws.on("error", (err2) => {
    debugLog("WebSocket error:", err2.message);
  });
  ws.on("close", () => {
    if (wsIntentionalClose) {
      wsIntentionalClose = false;
      return;
    }
    const autoReconnect = Settings.store.arRPCWebSocketAutoReconnect ?? true;
    debugLog(`WebSocket closed${autoReconnect ? ", will reconnect" : ""}`);
    mainWin?.webContents.send("VCD_ARRPC_ACTIVITY" /* ARRPC_ACTIVITY */, { activity: null });
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
    if (autoReconnect && shouldConnectWebSocket()) {
      wsReconnectTimer = setTimeout(() => {
        debugLog("Attempting WebSocket reconnect...");
        connectWebSocket();
      }, WS_RECONNECT_INTERVAL_MS);
    }
  });
  ws.on("open", () => {
    debugLog("WebSocket connected");
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
  });
}
function stopWebSocket() {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  if (ws) {
    wsIntentionalClose = true;
    ws.close();
    ws = null;
  }
  mainWin?.webContents.send("VCD_ARRPC_ACTIVITY" /* ARRPC_ACTIVITY */, { activity: null });
  debugLog("WebSocket stopped");
}
function shouldConnectWebSocket() {
  if (Settings.store.arRPCDisabled) return false;
  const customHost = Settings.store.arRPCWebSocketCustomHost;
  const customPort = Settings.store.arRPCWebSocketCustomPort;
  if (customHost || customPort) return true;
  if (!Settings.store.arRPC) return false;
  return isReady || arrpcProcess != null;
}
function updateWebSocketConnection() {
  if (shouldConnectWebSocket()) {
    const connectionInfo = getWsConnectionInfo();
    if (connectionInfo) {
      connectWebSocket();
    }
  } else {
    stopWebSocket();
  }
}
function getArRPCStatus() {
  const proc = arrpcProcess;
  const pid = proc?.pid ?? null;
  const running = proc != null && !proc.killed && pid != null;
  const integratedState = readStateFile();
  const externalResult = !running ? findAnyStateFile() : { content: null, stale: false };
  const state = integratedState || externalResult.content;
  const isStale = !integratedState && externalResult.stale;
  if (state) {
    const isExternal = !running && state !== null;
    return {
      running: running || isExternal,
      pid,
      port: state.servers.bridge?.port ?? serverPort,
      host: state.servers.bridge?.host ?? serverHost,
      enabled: Settings.store.arRPC ?? false,
      lastError,
      lastExitCode,
      uptime: startTime ? Date.now() - startTime : null,
      readyTime: readyTime ? Date.now() - readyTime : null,
      restartCount,
      binaryPath,
      isReady: isReady || isExternal && !isStale,
      isStale,
      appVersion: state.appVersion,
      activities: state.activities
    };
  }
  return {
    running,
    pid,
    port: serverPort,
    host: serverHost,
    enabled: Settings.store.arRPC ?? false,
    lastError,
    lastExitCode,
    uptime: startTime ? Date.now() - startTime : null,
    readyTime: readyTime ? Date.now() - readyTime : null,
    restartCount,
    binaryPath,
    isReady,
    isStale: false,
    appVersion,
    activities: []
  };
}
function clearInitTimeout() {
  if (initTimeout) {
    clearTimeout(initTimeout);
    initTimeout = null;
  }
}
async function destroyArRPC() {
  if (!arrpcProcess || isDestroying) return;
  isDestroying = true;
  debugLog("Destroying arRPC process");
  clearInitTimeout();
  stopStateFileWatching();
  stopWebSocket();
  const proc = arrpcProcess;
  arrpcProcess = null;
  serverPort = null;
  serverHost = null;
  startTime = null;
  readyTime = null;
  isReady = false;
  appVersion = null;
  if (proc) {
    proc.removeAllListeners();
    proc.stdout?.removeAllListeners();
    proc.stderr?.removeAllListeners();
    if (!proc.killed) {
      const killPromise = new Promise((resolve2) => {
        const timeout = setTimeout(() => {
          if (!proc.killed) {
            debugLog("Process did not exit gracefully, force killing");
            proc.kill("SIGKILL");
          }
          resolve2();
        }, PROCESS_KILL_TIMEOUT_MS);
        proc.once("exit", () => {
          clearTimeout(timeout);
          resolve2();
        });
        proc.kill("SIGTERM");
      });
      await killPromise;
    }
  }
  isDestroying = false;
  debugLog("arRPC process destroyed");
}
async function restartArRPC() {
  debugLog("Restarting arRPC");
  await destroyArRPC();
  await initArRPC();
  if (arrpcProcess) {
    restartCount++;
  }
}
async function initArRPC() {
  if (Settings.store.arRPCDisabled) {
    debugLog("Rich Presence is disabled");
    await destroyArRPC();
    restartCount = 0;
    return;
  }
  if (!Settings.store.arRPC) {
    debugLog("Built-in server is disabled, using external only");
    await destroyArRPC();
    restartCount = 0;
    return;
  }
  if (arrpcProcess) {
    debugLog("arRPC process already running");
    return;
  }
  lastError = null;
  lastExitCode = null;
  isReady = false;
  appVersion = null;
  try {
    const resolvedBinaryPath = getArRPCBinaryPath();
    debugLog("Initializing arRPC");
    debugLog(`Binary path: ${resolvedBinaryPath}`);
    binaryPath = resolvedBinaryPath;
    const env = {
      ...process.env,
      ARRPC_STATE_FILE: "1",
      ARRPC_PARENT_MONITOR: "1"
    };
    if (Settings.store.arRPCDebug) {
      env.ARRPC_DEBUG = "1";
    }
    if (Settings.store.arRPCProcessScanning === false) {
      env.ARRPC_NO_PROCESS_SCANNING = "1";
    }
    if (Settings.store.arRPCBridge === false) {
      env.ARRPC_NO_BRIDGE = "1";
    }
    arrpcProcess = (0, import_child_process2.spawn)(resolvedBinaryPath, [], {
      stdio: ["ignore", "pipe", "pipe"],
      env,
      windowsHide: true
    });
    debugLog(`arRPC process spawned with PID: ${arrpcProcess.pid}`);
    startTime = Date.now();
    startStateFileWatching();
    initTimeout = setTimeout(() => {
      if (!isReady && arrpcProcess) {
        const error = "arRPC failed to become ready within timeout";
        console.error(`[arRPC] ${error}`);
        lastError = error;
        destroyArRPC();
      }
    }, INIT_TIMEOUT_MS);
    arrpcProcess.stdout?.on("data", (data) => {
      const output = data.toString().trim();
      if (output) console.log(output);
    });
    arrpcProcess.stderr?.on("data", (data) => {
      const output = data.toString().trim();
      if (output) {
        try {
          const message = JSON.parse(output);
          if (message.type === "STREAMERMODE") {
            debugLog(`Streamer mode changed: ${message.data}`);
            mainWin?.webContents.send("VCD_ARRPC_ACTIVITY" /* ARRPC_ACTIVITY */, JSON.parse(message.data));
            return;
          }
        } catch {
        }
        console.error("[arRPC ! stderr]", output);
        lastError = output;
      }
    });
    arrpcProcess.on("error", (err2) => {
      console.error("[arRPC] Process error:", err2);
      lastError = err2.message;
      clearInitTimeout();
      stopStateFileWatching();
    });
    arrpcProcess.on("exit", (code, signal) => {
      lastExitCode = code;
      const wasReady = isReady;
      if (code !== 0 && code !== null) {
        console.error(`[arRPC] Process exited with code ${code}, signal ${signal}`);
        lastError = `Process exited with code ${code}`;
      }
      if (signal === "SIGILL") {
        console.error(
          "[arRPC] SIGILL (Illegal Instruction) - Binary may be compiled for a different CPU architecture"
        );
        console.error(`[arRPC] arch: ${process.arch}, platform: ${process.platform}, binary: ${binaryPath}`);
        lastError = "SIGILL: Binary incompatible with CPU architecture";
      } else if (signal === "SIGSEGV") {
        console.error(`[arRPC] SIGSEGV (Segmentation Fault) - binary: ${binaryPath}`);
        lastError = "SIGSEGV: Binary crashed";
      } else if (signal === "SIGABRT") {
        console.error(`[arRPC] SIGABRT (Abort) - binary: ${binaryPath}`);
        lastError = "SIGABRT: Binary aborted";
      }
      debugLog(`arRPC process exited with code ${code}, signal ${signal}, wasReady: ${wasReady}`);
      arrpcProcess = null;
      serverPort = null;
      serverHost = null;
      startTime = null;
      readyTime = null;
      isReady = false;
      appVersion = null;
      clearInitTimeout();
      stopStateFileWatching();
    });
  } catch (e) {
    console.error("[arRPC] Failed to start arRPC server:", e);
    lastError = e instanceof Error ? e.message : String(e);
    clearInitTimeout();
  }
}
function setupArRPC() {
  if (mainSettingsListener) {
    debugLog("arRPC already set up");
    return;
  }
  mainSettingsListener = () => {
    initArRPC();
    updateWebSocketConnection();
  };
  configSettingsListener = () => {
    if (arrpcProcess && Settings.store.arRPC) {
      restartArRPC();
    }
  };
  wsSettingsListener = () => {
    updateWebSocketConnection();
  };
  Settings.addChangeListener("arRPCDisabled", mainSettingsListener);
  Settings.addChangeListener("arRPC", mainSettingsListener);
  Settings.addChangeListener("arRPCDebug", configSettingsListener);
  Settings.addChangeListener("arRPCProcessScanning", configSettingsListener);
  Settings.addChangeListener("arRPCBridge", configSettingsListener);
  Settings.addChangeListener("arRPCWebSocketCustomHost", wsSettingsListener);
  Settings.addChangeListener("arRPCWebSocketCustomPort", wsSettingsListener);
  Settings.addChangeListener("arRPCWebSocketAutoReconnect", wsSettingsListener);
  debugLog("arRPC settings listeners registered");
}
async function cleanupArRPC() {
  if (mainSettingsListener) {
    Settings.removeChangeListener("arRPCDisabled", mainSettingsListener);
    Settings.removeChangeListener("arRPC", mainSettingsListener);
    mainSettingsListener = null;
  }
  if (configSettingsListener) {
    Settings.removeChangeListener("arRPCDebug", configSettingsListener);
    Settings.removeChangeListener("arRPCProcessScanning", configSettingsListener);
    Settings.removeChangeListener("arRPCBridge", configSettingsListener);
    configSettingsListener = null;
  }
  if (wsSettingsListener) {
    Settings.removeChangeListener("arRPCWebSocketCustomHost", wsSettingsListener);
    Settings.removeChangeListener("arRPCWebSocketCustomPort", wsSettingsListener);
    Settings.removeChangeListener("arRPCWebSocketAutoReconnect", wsSettingsListener);
    wsSettingsListener = null;
  }
  debugLog("arRPC settings listeners removed");
  stopWebSocket();
  await destroyArRPC();
}
var import_child_process2, import_fs4, import_os, import_path10, STATE_FILE_PREFIX, STATE_FILE_MAX_INDEX, SUPPORTED_PLATFORMS, arrpcProcess, lastError, lastExitCode, serverPort, serverHost, startTime, readyTime, restartCount, binaryPath, isReady, mainSettingsListener, configSettingsListener, wsSettingsListener, initTimeout, isDestroying, stateFileWatcher, stateFilePath, stateCheckInterval, appVersion, INIT_TIMEOUT_MS, PROCESS_KILL_TIMEOUT_MS, STATE_CHECK_INTERVAL_MS, STATE_FILE_STALE_MS, WS_RECONNECT_INTERVAL_MS, ws, wsReconnectTimer, wsIntentionalClose;
var init_arrpc = __esm({
  "src/midnightcord/main/arrpc/index.ts"() {
    "use strict";
    import_child_process2 = require("child_process");
    import_fs4 = require("fs");
    import_os = require("os");
    import_path10 = require("path");
    init_IpcEvents2();
    init_paths();
    init_wrapper();
    init_mainWindow();
    init_settings2();
    STATE_FILE_PREFIX = "arrpc-state";
    STATE_FILE_MAX_INDEX = 9;
    SUPPORTED_PLATFORMS = /* @__PURE__ */ new Map([
      ["linux", ["x64", "arm64"]],
      ["darwin", ["x64", "arm64"]],
      ["win32", ["x64"]]
    ]);
    arrpcProcess = null;
    lastError = null;
    lastExitCode = null;
    serverPort = null;
    serverHost = null;
    startTime = null;
    readyTime = null;
    restartCount = 0;
    binaryPath = null;
    isReady = false;
    mainSettingsListener = null;
    configSettingsListener = null;
    wsSettingsListener = null;
    initTimeout = null;
    isDestroying = false;
    stateFileWatcher = null;
    stateFilePath = null;
    stateCheckInterval = null;
    appVersion = null;
    INIT_TIMEOUT_MS = 1e4;
    PROCESS_KILL_TIMEOUT_MS = 5e3;
    STATE_CHECK_INTERVAL_MS = 500;
    STATE_FILE_STALE_MS = 6e4;
    WS_RECONNECT_INTERVAL_MS = 5e3;
    ws = null;
    wsReconnectTimer = null;
    wsIntentionalClose = false;
  }
});

// src/midnightcord/main/gnuSpoofing.ts
function getPlatformSpoofInfo() {
  return { ...spoofInfo };
}
function generateUserAgentString(versionString) {
  const engine = "AppleWebKit/537.36 (KHTML, like Gecko)";
  const browser = `Chrome/${versionString}.0.0.0 Safari/537.36`;
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${engine} ${browser}`;
}
function generateClientHints(chromeVersion) {
  const majorVersion = chromeVersion.split(".")[0];
  const brandsList = [
    { brand: "Chromium", version: majorVersion },
    { brand: "Google Chrome", version: majorVersion },
    { brand: "Not_A Brand", version: "99" }
  ];
  const fullVersionList = [
    { brand: "Chromium", version: chromeVersion },
    { brand: "Google Chrome", version: chromeVersion },
    { brand: "Not_A Brand", version: "99.0.0.0" }
  ];
  const pPlatform = "Windows";
  const pVersion = "10.0.0";
  const pArch = "x86";
  const pBitness = "64";
  return {
    brandsList,
    fullVersionList,
    platform: pPlatform,
    platformVersion: pVersion,
    architecture: pArch,
    model: "",
    mobile: false,
    bitness: pBitness,
    wow64: false
  };
}
function getFakeData() {
  const normalChrome = process.versions.chrome;
  const majorChrome = normalChrome.split(".")[0];
  const fdPlatform = "Win32";
  const uaString = generateUserAgentString(majorChrome);
  const clientHints = generateClientHints(normalChrome);
  return {
    userAgent: uaString,
    platform: fdPlatform,
    metadata: clientHints
  };
}
async function spoofGnu(window2) {
  const data = getFakeData();
  spoofInfo = {
    spoofed: true,
    originalPlatform: process.platform,
    spoofedPlatform: "win32"
  };
  const runSpoof = async () => {
    try {
      window2.webContents.userAgent = data.userAgent;
      if (!window2.webContents.debugger.isAttached()) {
        console.log("debugger not attached, attaching");
        try {
          window2.webContents.debugger.attach("1.3");
        } catch (err2) {
          console.warn("Debugger attach warning:", err2);
        }
      }
      console.info("Running setUserAgentOverride");
      await window2.webContents.debugger.sendCommand("Emulation.setUserAgentOverride", {
        userAgent: data.userAgent,
        platform: data.platform,
        userAgentMetadata: data.metadata
      });
    } catch (err2) {
      console.error("An error occured during spoofing:", err2);
    }
  };
  window2.webContents.debugger.on("detach", (_e, reason) => {
    console.info(`Debugger detached: ${reason}`);
  });
  window2.webContents.on("did-navigate", async () => {
    console.log("Navigation detected, re-running spoof");
    await runSpoof();
  });
  await runSpoof();
}
var spoofInfo;
var init_gnuSpoofing = __esm({
  "src/midnightcord/main/gnuSpoofing.ts"() {
    "use strict";
    spoofInfo = {
      spoofed: false,
      originalPlatform: process.platform,
      spoofedPlatform: null
    };
  }
});

// src/midnightcord/main/ipcCommands.ts
function sendRendererCommand(message, data, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!mainWin || mainWin.isDestroyed()) {
    console.warn("Main window is destroyed or not available, cannot send IPC command:", message);
    return Promise.reject(new Error("Main window is destroyed"));
  }
  const nonce = (0, import_crypto.randomUUID)();
  const promise = new Promise((resolve2, reject) => {
    const timer = setTimeout(() => {
      resolvers.delete(nonce);
      reject(new Error(`IPC command "${message}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    resolvers.set(nonce, {
      resolve: resolve2,
      reject,
      timer
    });
  });
  mainWin.webContents.send("VCD_IPC_COMMAND" /* IPC_COMMAND */, { nonce, message, data });
  return promise;
}
var import_crypto, import_electron12, DEFAULT_TIMEOUT_MS, resolvers;
var init_ipcCommands = __esm({
  "src/midnightcord/main/ipcCommands.ts"() {
    "use strict";
    import_crypto = require("crypto");
    import_electron12 = require("electron");
    init_IpcEvents2();
    init_mainWindow();
    DEFAULT_TIMEOUT_MS = 3e4;
    resolvers = /* @__PURE__ */ new Map();
    import_electron12.ipcMain.on("VCD_IPC_COMMAND" /* IPC_COMMAND */, (_event, { nonce, ok, data }) => {
      const resolver = resolvers.get(nonce);
      if (!resolver) {
        console.warn("Received IPC response for unknown or timed-out command:", nonce);
        return;
      }
      clearTimeout(resolver.timer);
      if (ok) {
        resolver.resolve(data);
      } else {
        resolver.reject(data);
      }
      resolvers.delete(nonce);
    });
  }
});

// src/midnightcord/main/keybinds.ts
function createFIFO() {
  if ((0, import_node_fs.existsSync)(socketFile)) {
    try {
      (0, import_node_fs.unlinkSync)(socketFile);
    } catch (err2) {
      console.error("Failed to remove existing mkfifo file:", err2);
      return false;
    }
  }
  try {
    (0, import_node_child_process.spawnSync)("mkfifo", [socketFile]);
  } catch (err2) {
    console.error("Failed to create mkfifo while initializing keybinds:", err2);
    return false;
  }
  return true;
}
function openFIFO() {
  try {
    (0, import_node_fs.open)(socketFile, import_node_fs.constants.O_RDONLY | import_node_fs.constants.O_NONBLOCK, (err2, fd2) => {
      if (err2) {
        console.error("Error opening pipe while initializing keybinds:", err2);
        return;
      }
      const pipe = new import_net.Socket({ fd: fd2 });
      pipe.on("data", (data) => {
        const action = data.toString().trim();
        if (Actions.has(action)) {
          mainWin.webContents.send(action);
        }
      });
      pipe.on("end", () => {
        pipe.destroy();
        openFIFO();
      });
    });
  } catch (err2) {
    console.error("Can't open socket file.", err2);
  }
}
function cleanup() {
  try {
    (0, import_node_fs.unlinkSync)(socketFile);
  } catch (err2) {
  }
}
function initKeybinds() {
  if (createFIFO()) {
    openFIFO();
  }
}
var import_node_child_process, import_node_fs, import_node_path, import_net, xdgRuntimeDir, socketFile, Actions;
var init_keybinds = __esm({
  "src/midnightcord/main/keybinds.ts"() {
    "use strict";
    import_node_child_process = require("node:child_process");
    import_node_fs = require("node:fs");
    import_node_path = require("node:path");
    import_net = require("net");
    init_IpcEvents2();
    init_mainWindow();
    xdgRuntimeDir = process.env.XDG_RUNTIME_DIR || process.env.TMP || "/tmp";
    socketFile = (0, import_node_path.join)(xdgRuntimeDir, "vesktop-ipc");
    Actions = /* @__PURE__ */ new Set(["VCD_TOGGLE_SELF_DEAF" /* TOGGLE_SELF_DEAF */, "VCD_TOGGLE_SELF_MUTE" /* TOGGLE_SELF_MUTE */]);
    process.on("exit", cleanup);
  }
});

// src/midnightcord/shared/browserWinProperties.ts
var SplashProps;
var init_browserWinProperties = __esm({
  "src/midnightcord/shared/browserWinProperties.ts"() {
    "use strict";
    SplashProps = {
      transparent: true,
      frame: false,
      height: 350,
      width: 300,
      center: true,
      resizable: false,
      maximizable: false,
      alwaysOnTop: true
    };
  }
});

// src/midnightcord/main/utils/fileExists.ts
async function fileExistsAsync(path) {
  return await (0, import_promises.access)(path, import_promises.constants.F_OK).then(() => true).catch(() => false);
}
var import_promises;
var init_fileExists = __esm({
  "src/midnightcord/main/utils/fileExists.ts"() {
    "use strict";
    import_promises = require("fs/promises");
  }
});

// src/midnightcord/main/splash.ts
async function createSplashWindow(startMinimized = false) {
  splash = new import_electron13.BrowserWindow({
    ...SplashProps,
    ...process.platform === "win32" ? { icon: (0, import_path11.join)(STATIC_DIR, "icon.ico") } : process.platform === "linux" ? { icon: (0, import_path11.join)(STATIC_DIR, "icon.png") } : {},
    show: !startMinimized,
    webPreferences: {
      preload: (0, import_path11.join)(__dirname, "splashPreload.js")
    }
  });
  splash.webContents.setMaxListeners(15);
  loadView(splash, "splash.html");
  const { splashBackground, splashColor, splashTheming, splashProgress, splashPixelated } = Settings.store;
  const isDark = import_electron13.nativeTheme.shouldUseDarkColors;
  const systemBg = isDark ? "hsl(223 6.7% 20.6%)" : "white";
  const systemFg = isDark ? "white" : "black";
  const systemFgSemiTrans = isDark ? "rgb(255 255 255 / 0.2)" : "rgb(0 0 0 / 0.2)";
  if (splashTheming !== false) {
    const fg = splashColor || systemFg;
    const bg = splashBackground || systemBg;
    const fgSemiTrans = splashColor ? splashColor.replace("rgb(", "rgba(").replace(")", ", 0.2)") : systemFgSemiTrans;
    splash.webContents.insertCSS(
      `body { --bg: ${bg} !important; --fg: ${fg} !important; --fg-semi-trans: ${fgSemiTrans} !important; }`
    );
  } else {
    splash.webContents.insertCSS(
      `body { --bg: ${systemBg} !important; --fg: ${systemFg} !important; --fg-semi-trans: ${systemFgSemiTrans} !important; }`
    );
  }
  if (splashPixelated) {
    splash.webContents.insertCSS("img { image-rendering: pixelated; }");
  }
  const customSplashPath = (0, import_path11.join)(DATA_DIR2, "userAssets", "splash");
  const hasCustomSplash = await fileExistsAsync(customSplashPath);
  if (!hasCustomSplash) {
    splash.webContents.insertCSS(`
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(-360deg); }
            }

            img {
                animation: spin 2s linear infinite;
            }
        `);
  }
  if (splashProgress) {
    splash.webContents.executeJavaScript(`
            document.getElementById("progress-percentage").innerHTML = "${doneTasks}%";
        `);
  } else {
    splash.webContents.executeJavaScript(`
            document.getElementById("progress-section").style.display = "none";
        `);
  }
  return splash;
}
function addSplashLog() {
  if (splash && !splash.isDestroyed()) {
    doneTasks++;
    const percentage = Math.min(100, Math.round(doneTasks / totalTasks * 100));
    splash.webContents.executeJavaScript(`
            document.getElementById("progress").style.width = "${percentage}%";
            document.getElementById("progress-percentage").innerHTML = "${percentage}%";
        `);
  }
}
function updateSplashMessage(message) {
  if (splash && !splash.isDestroyed()) splash.webContents.send("update-splash-message", message);
}
var import_electron13, import_path11, splash, totalTasks, doneTasks;
var init_splash = __esm({
  "src/midnightcord/main/splash.ts"() {
    "use strict";
    import_electron13 = require("electron");
    import_path11 = require("path");
    init_browserWinProperties();
    init_paths();
    init_constants2();
    init_settings2();
    init_fileExists();
    init_vesktopStatic();
    totalTasks = 9;
    doneTasks = 0;
  }
});

// node_modules/.pnpm/universalify@2.0.1/node_modules/universalify/index.js
var require_universalify = __commonJS({
  "node_modules/.pnpm/universalify@2.0.1/node_modules/universalify/index.js"(exports2) {
    "use strict";
    exports2.fromCallback = function(fn) {
      return Object.defineProperty(function(...args2) {
        if (typeof args2[args2.length - 1] === "function") fn.apply(this, args2);
        else {
          return new Promise((resolve2, reject) => {
            args2.push((err2, res) => err2 != null ? reject(err2) : resolve2(res));
            fn.apply(this, args2);
          });
        }
      }, "name", { value: fn.name });
    };
    exports2.fromPromise = function(fn) {
      return Object.defineProperty(function(...args2) {
        const cb = args2[args2.length - 1];
        if (typeof cb !== "function") return fn.apply(this, args2);
        else {
          args2.pop();
          fn.apply(this, args2).then((r) => cb(null, r), cb);
        }
      }, "name", { value: fn.name });
    };
  }
});

// node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/polyfills.js
var require_polyfills = __commonJS({
  "node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/polyfills.js"(exports2, module2) {
    var constants4 = require("constants");
    var origCwd = process.cwd;
    var cwd = null;
    var platform = process.env.GRACEFUL_FS_PLATFORM || process.platform;
    process.cwd = function() {
      if (!cwd)
        cwd = origCwd.call(process);
      return cwd;
    };
    try {
      process.cwd();
    } catch (er) {
    }
    if (typeof process.chdir === "function") {
      chdir = process.chdir;
      process.chdir = function(d) {
        cwd = null;
        chdir.call(process, d);
      };
      if (Object.setPrototypeOf) Object.setPrototypeOf(process.chdir, chdir);
    }
    var chdir;
    module2.exports = patch;
    function patch(fs) {
      if (constants4.hasOwnProperty("O_SYMLINK") && process.version.match(/^v0\.6\.[0-2]|^v0\.5\./)) {
        patchLchmod(fs);
      }
      if (!fs.lutimes) {
        patchLutimes(fs);
      }
      fs.chown = chownFix(fs.chown);
      fs.fchown = chownFix(fs.fchown);
      fs.lchown = chownFix(fs.lchown);
      fs.chmod = chmodFix(fs.chmod);
      fs.fchmod = chmodFix(fs.fchmod);
      fs.lchmod = chmodFix(fs.lchmod);
      fs.chownSync = chownFixSync(fs.chownSync);
      fs.fchownSync = chownFixSync(fs.fchownSync);
      fs.lchownSync = chownFixSync(fs.lchownSync);
      fs.chmodSync = chmodFixSync(fs.chmodSync);
      fs.fchmodSync = chmodFixSync(fs.fchmodSync);
      fs.lchmodSync = chmodFixSync(fs.lchmodSync);
      fs.stat = statFix(fs.stat);
      fs.fstat = statFix(fs.fstat);
      fs.lstat = statFix(fs.lstat);
      fs.statSync = statFixSync(fs.statSync);
      fs.fstatSync = statFixSync(fs.fstatSync);
      fs.lstatSync = statFixSync(fs.lstatSync);
      if (fs.chmod && !fs.lchmod) {
        fs.lchmod = function(path, mode, cb) {
          if (cb) process.nextTick(cb);
        };
        fs.lchmodSync = function() {
        };
      }
      if (fs.chown && !fs.lchown) {
        fs.lchown = function(path, uid, gid, cb) {
          if (cb) process.nextTick(cb);
        };
        fs.lchownSync = function() {
        };
      }
      if (platform === "win32") {
        fs.rename = typeof fs.rename !== "function" ? fs.rename : (function(fs$rename) {
          function rename(from, to, cb) {
            var start = Date.now();
            var backoff = 0;
            fs$rename(from, to, function CB(er) {
              if (er && (er.code === "EACCES" || er.code === "EPERM" || er.code === "EBUSY") && Date.now() - start < 6e4) {
                setTimeout(function() {
                  fs.stat(to, function(stater, st) {
                    if (stater && stater.code === "ENOENT")
                      fs$rename(from, to, CB);
                    else
                      cb(er);
                  });
                }, backoff);
                if (backoff < 100)
                  backoff += 10;
                return;
              }
              if (cb) cb(er);
            });
          }
          if (Object.setPrototypeOf) Object.setPrototypeOf(rename, fs$rename);
          return rename;
        })(fs.rename);
      }
      fs.read = typeof fs.read !== "function" ? fs.read : (function(fs$read) {
        function read(fd2, buffer, offset, length, position, callback_) {
          var callback;
          if (callback_ && typeof callback_ === "function") {
            var eagCounter = 0;
            callback = function(er, _, __) {
              if (er && er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                return fs$read.call(fs, fd2, buffer, offset, length, position, callback);
              }
              callback_.apply(this, arguments);
            };
          }
          return fs$read.call(fs, fd2, buffer, offset, length, position, callback);
        }
        if (Object.setPrototypeOf) Object.setPrototypeOf(read, fs$read);
        return read;
      })(fs.read);
      fs.readSync = typeof fs.readSync !== "function" ? fs.readSync : /* @__PURE__ */ (function(fs$readSync) {
        return function(fd2, buffer, offset, length, position) {
          var eagCounter = 0;
          while (true) {
            try {
              return fs$readSync.call(fs, fd2, buffer, offset, length, position);
            } catch (er) {
              if (er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                continue;
              }
              throw er;
            }
          }
        };
      })(fs.readSync);
      function patchLchmod(fs2) {
        fs2.lchmod = function(path, mode, callback) {
          fs2.open(
            path,
            constants4.O_WRONLY | constants4.O_SYMLINK,
            mode,
            function(err2, fd2) {
              if (err2) {
                if (callback) callback(err2);
                return;
              }
              fs2.fchmod(fd2, mode, function(err3) {
                fs2.close(fd2, function(err22) {
                  if (callback) callback(err3 || err22);
                });
              });
            }
          );
        };
        fs2.lchmodSync = function(path, mode) {
          var fd2 = fs2.openSync(path, constants4.O_WRONLY | constants4.O_SYMLINK, mode);
          var threw = true;
          var ret;
          try {
            ret = fs2.fchmodSync(fd2, mode);
            threw = false;
          } finally {
            if (threw) {
              try {
                fs2.closeSync(fd2);
              } catch (er) {
              }
            } else {
              fs2.closeSync(fd2);
            }
          }
          return ret;
        };
      }
      function patchLutimes(fs2) {
        if (constants4.hasOwnProperty("O_SYMLINK") && fs2.futimes) {
          fs2.lutimes = function(path, at, mt2, cb) {
            fs2.open(path, constants4.O_SYMLINK, function(er, fd2) {
              if (er) {
                if (cb) cb(er);
                return;
              }
              fs2.futimes(fd2, at, mt2, function(er2) {
                fs2.close(fd2, function(er22) {
                  if (cb) cb(er2 || er22);
                });
              });
            });
          };
          fs2.lutimesSync = function(path, at, mt2) {
            var fd2 = fs2.openSync(path, constants4.O_SYMLINK);
            var ret;
            var threw = true;
            try {
              ret = fs2.futimesSync(fd2, at, mt2);
              threw = false;
            } finally {
              if (threw) {
                try {
                  fs2.closeSync(fd2);
                } catch (er) {
                }
              } else {
                fs2.closeSync(fd2);
              }
            }
            return ret;
          };
        } else if (fs2.futimes) {
          fs2.lutimes = function(_a2, _b2, _c, cb) {
            if (cb) process.nextTick(cb);
          };
          fs2.lutimesSync = function() {
          };
        }
      }
      function chmodFix(orig) {
        if (!orig) return orig;
        return function(target, mode, cb) {
          return orig.call(fs, target, mode, function(er) {
            if (chownErOk(er)) er = null;
            if (cb) cb.apply(this, arguments);
          });
        };
      }
      function chmodFixSync(orig) {
        if (!orig) return orig;
        return function(target, mode) {
          try {
            return orig.call(fs, target, mode);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function chownFix(orig) {
        if (!orig) return orig;
        return function(target, uid, gid, cb) {
          return orig.call(fs, target, uid, gid, function(er) {
            if (chownErOk(er)) er = null;
            if (cb) cb.apply(this, arguments);
          });
        };
      }
      function chownFixSync(orig) {
        if (!orig) return orig;
        return function(target, uid, gid) {
          try {
            return orig.call(fs, target, uid, gid);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function statFix(orig) {
        if (!orig) return orig;
        return function(target, options2, cb) {
          if (typeof options2 === "function") {
            cb = options2;
            options2 = null;
          }
          function callback(er, stats) {
            if (stats) {
              if (stats.uid < 0) stats.uid += 4294967296;
              if (stats.gid < 0) stats.gid += 4294967296;
            }
            if (cb) cb.apply(this, arguments);
          }
          return options2 ? orig.call(fs, target, options2, callback) : orig.call(fs, target, callback);
        };
      }
      function statFixSync(orig) {
        if (!orig) return orig;
        return function(target, options2) {
          var stats = options2 ? orig.call(fs, target, options2) : orig.call(fs, target);
          if (stats) {
            if (stats.uid < 0) stats.uid += 4294967296;
            if (stats.gid < 0) stats.gid += 4294967296;
          }
          return stats;
        };
      }
      function chownErOk(er) {
        if (!er)
          return true;
        if (er.code === "ENOSYS")
          return true;
        var nonroot = !process.getuid || process.getuid() !== 0;
        if (nonroot) {
          if (er.code === "EINVAL" || er.code === "EPERM")
            return true;
        }
        return false;
      }
    }
  }
});

// node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/legacy-streams.js
var require_legacy_streams = __commonJS({
  "node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/legacy-streams.js"(exports2, module2) {
    var Stream = require("stream").Stream;
    module2.exports = legacy;
    function legacy(fs) {
      return {
        ReadStream,
        WriteStream
      };
      function ReadStream(path, options2) {
        if (!(this instanceof ReadStream)) return new ReadStream(path, options2);
        Stream.call(this);
        var self2 = this;
        this.path = path;
        this.fd = null;
        this.readable = true;
        this.paused = false;
        this.flags = "r";
        this.mode = 438;
        this.bufferSize = 64 * 1024;
        options2 = options2 || {};
        var keys = Object.keys(options2);
        for (var index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options2[key];
        }
        if (this.encoding) this.setEncoding(this.encoding);
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.end === void 0) {
            this.end = Infinity;
          } else if ("number" !== typeof this.end) {
            throw TypeError("end must be a Number");
          }
          if (this.start > this.end) {
            throw new Error("start must be <= end");
          }
          this.pos = this.start;
        }
        if (this.fd !== null) {
          process.nextTick(function() {
            self2._read();
          });
          return;
        }
        fs.open(this.path, this.flags, this.mode, function(err2, fd2) {
          if (err2) {
            self2.emit("error", err2);
            self2.readable = false;
            return;
          }
          self2.fd = fd2;
          self2.emit("open", fd2);
          self2._read();
        });
      }
      function WriteStream(path, options2) {
        if (!(this instanceof WriteStream)) return new WriteStream(path, options2);
        Stream.call(this);
        this.path = path;
        this.fd = null;
        this.writable = true;
        this.flags = "w";
        this.encoding = "binary";
        this.mode = 438;
        this.bytesWritten = 0;
        options2 = options2 || {};
        var keys = Object.keys(options2);
        for (var index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options2[key];
        }
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.start < 0) {
            throw new Error("start must be >= zero");
          }
          this.pos = this.start;
        }
        this.busy = false;
        this._queue = [];
        if (this.fd === null) {
          this._open = fs.open;
          this._queue.push([this._open, this.path, this.flags, this.mode, void 0]);
          this.flush();
        }
      }
    }
  }
});

// node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/clone.js
var require_clone = __commonJS({
  "node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/clone.js"(exports2, module2) {
    "use strict";
    module2.exports = clone;
    var getPrototypeOf = Object.getPrototypeOf || function(obj) {
      return obj.__proto__;
    };
    function clone(obj) {
      if (obj === null || typeof obj !== "object")
        return obj;
      if (obj instanceof Object)
        var copy = { __proto__: getPrototypeOf(obj) };
      else
        var copy = /* @__PURE__ */ Object.create(null);
      Object.getOwnPropertyNames(obj).forEach(function(key) {
        Object.defineProperty(copy, key, Object.getOwnPropertyDescriptor(obj, key));
      });
      return copy;
    }
  }
});

// node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/graceful-fs.js
var require_graceful_fs = __commonJS({
  "node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/graceful-fs.js"(exports2, module2) {
    var fs = require("fs");
    var polyfills = require_polyfills();
    var legacy = require_legacy_streams();
    var clone = require_clone();
    var util = require("util");
    var gracefulQueue;
    var previousSymbol;
    if (typeof Symbol === "function" && typeof Symbol.for === "function") {
      gracefulQueue = /* @__PURE__ */ Symbol.for("graceful-fs.queue");
      previousSymbol = /* @__PURE__ */ Symbol.for("graceful-fs.previous");
    } else {
      gracefulQueue = "___graceful-fs.queue";
      previousSymbol = "___graceful-fs.previous";
    }
    function noop() {
    }
    function publishQueue(context, queue2) {
      Object.defineProperty(context, gracefulQueue, {
        get: function() {
          return queue2;
        }
      });
    }
    var debug = noop;
    if (util.debuglog)
      debug = util.debuglog("gfs4");
    else if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || ""))
      debug = function() {
        var m = util.format.apply(util, arguments);
        m = "GFS4: " + m.split(/\n/).join("\nGFS4: ");
        console.error(m);
      };
    if (!fs[gracefulQueue]) {
      queue = global[gracefulQueue] || [];
      publishQueue(fs, queue);
      fs.close = (function(fs$close) {
        function close(fd2, cb) {
          return fs$close.call(fs, fd2, function(err2) {
            if (!err2) {
              resetQueue();
            }
            if (typeof cb === "function")
              cb.apply(this, arguments);
          });
        }
        Object.defineProperty(close, previousSymbol, {
          value: fs$close
        });
        return close;
      })(fs.close);
      fs.closeSync = (function(fs$closeSync) {
        function closeSync(fd2) {
          fs$closeSync.apply(fs, arguments);
          resetQueue();
        }
        Object.defineProperty(closeSync, previousSymbol, {
          value: fs$closeSync
        });
        return closeSync;
      })(fs.closeSync);
      if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || "")) {
        process.on("exit", function() {
          debug(fs[gracefulQueue]);
          require("assert").equal(fs[gracefulQueue].length, 0);
        });
      }
    }
    var queue;
    if (!global[gracefulQueue]) {
      publishQueue(global, fs[gracefulQueue]);
    }
    module2.exports = patch(clone(fs));
    if (process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !fs.__patched) {
      module2.exports = patch(fs);
      fs.__patched = true;
    }
    function patch(fs2) {
      polyfills(fs2);
      fs2.gracefulify = patch;
      fs2.createReadStream = createReadStream;
      fs2.createWriteStream = createWriteStream3;
      var fs$readFile = fs2.readFile;
      fs2.readFile = readFile3;
      function readFile3(path, options2, cb) {
        if (typeof options2 === "function")
          cb = options2, options2 = null;
        return go$readFile(path, options2, cb);
        function go$readFile(path2, options3, cb2, startTime2) {
          return fs$readFile(path2, options3, function(err2) {
            if (err2 && (err2.code === "EMFILE" || err2.code === "ENFILE"))
              enqueue([go$readFile, [path2, options3, cb2], err2, startTime2 || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$writeFile = fs2.writeFile;
      fs2.writeFile = writeFile3;
      function writeFile3(path, data, options2, cb) {
        if (typeof options2 === "function")
          cb = options2, options2 = null;
        return go$writeFile(path, data, options2, cb);
        function go$writeFile(path2, data2, options3, cb2, startTime2) {
          return fs$writeFile(path2, data2, options3, function(err2) {
            if (err2 && (err2.code === "EMFILE" || err2.code === "ENFILE"))
              enqueue([go$writeFile, [path2, data2, options3, cb2], err2, startTime2 || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$appendFile = fs2.appendFile;
      if (fs$appendFile)
        fs2.appendFile = appendFile;
      function appendFile(path, data, options2, cb) {
        if (typeof options2 === "function")
          cb = options2, options2 = null;
        return go$appendFile(path, data, options2, cb);
        function go$appendFile(path2, data2, options3, cb2, startTime2) {
          return fs$appendFile(path2, data2, options3, function(err2) {
            if (err2 && (err2.code === "EMFILE" || err2.code === "ENFILE"))
              enqueue([go$appendFile, [path2, data2, options3, cb2], err2, startTime2 || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$copyFile = fs2.copyFile;
      if (fs$copyFile)
        fs2.copyFile = copyFile2;
      function copyFile2(src, dest, flags, cb) {
        if (typeof flags === "function") {
          cb = flags;
          flags = 0;
        }
        return go$copyFile(src, dest, flags, cb);
        function go$copyFile(src2, dest2, flags2, cb2, startTime2) {
          return fs$copyFile(src2, dest2, flags2, function(err2) {
            if (err2 && (err2.code === "EMFILE" || err2.code === "ENFILE"))
              enqueue([go$copyFile, [src2, dest2, flags2, cb2], err2, startTime2 || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$readdir = fs2.readdir;
      fs2.readdir = readdir2;
      var noReaddirOptionVersions = /^v[0-5]\./;
      function readdir2(path, options2, cb) {
        if (typeof options2 === "function")
          cb = options2, options2 = null;
        var go$readdir = noReaddirOptionVersions.test(process.version) ? function go$readdir2(path2, options3, cb2, startTime2) {
          return fs$readdir(path2, fs$readdirCallback(
            path2,
            options3,
            cb2,
            startTime2
          ));
        } : function go$readdir2(path2, options3, cb2, startTime2) {
          return fs$readdir(path2, options3, fs$readdirCallback(
            path2,
            options3,
            cb2,
            startTime2
          ));
        };
        return go$readdir(path, options2, cb);
        function fs$readdirCallback(path2, options3, cb2, startTime2) {
          return function(err2, files) {
            if (err2 && (err2.code === "EMFILE" || err2.code === "ENFILE"))
              enqueue([
                go$readdir,
                [path2, options3, cb2],
                err2,
                startTime2 || Date.now(),
                Date.now()
              ]);
            else {
              if (files && files.sort)
                files.sort();
              if (typeof cb2 === "function")
                cb2.call(this, err2, files);
            }
          };
        }
      }
      if (process.version.substr(0, 4) === "v0.8") {
        var legStreams = legacy(fs2);
        ReadStream = legStreams.ReadStream;
        WriteStream = legStreams.WriteStream;
      }
      var fs$ReadStream = fs2.ReadStream;
      if (fs$ReadStream) {
        ReadStream.prototype = Object.create(fs$ReadStream.prototype);
        ReadStream.prototype.open = ReadStream$open;
      }
      var fs$WriteStream = fs2.WriteStream;
      if (fs$WriteStream) {
        WriteStream.prototype = Object.create(fs$WriteStream.prototype);
        WriteStream.prototype.open = WriteStream$open;
      }
      Object.defineProperty(fs2, "ReadStream", {
        get: function() {
          return ReadStream;
        },
        set: function(val) {
          ReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      Object.defineProperty(fs2, "WriteStream", {
        get: function() {
          return WriteStream;
        },
        set: function(val) {
          WriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileReadStream = ReadStream;
      Object.defineProperty(fs2, "FileReadStream", {
        get: function() {
          return FileReadStream;
        },
        set: function(val) {
          FileReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileWriteStream = WriteStream;
      Object.defineProperty(fs2, "FileWriteStream", {
        get: function() {
          return FileWriteStream;
        },
        set: function(val) {
          FileWriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      function ReadStream(path, options2) {
        if (this instanceof ReadStream)
          return fs$ReadStream.apply(this, arguments), this;
        else
          return ReadStream.apply(Object.create(ReadStream.prototype), arguments);
      }
      function ReadStream$open() {
        var that = this;
        open4(that.path, that.flags, that.mode, function(err2, fd2) {
          if (err2) {
            if (that.autoClose)
              that.destroy();
            that.emit("error", err2);
          } else {
            that.fd = fd2;
            that.emit("open", fd2);
            that.read();
          }
        });
      }
      function WriteStream(path, options2) {
        if (this instanceof WriteStream)
          return fs$WriteStream.apply(this, arguments), this;
        else
          return WriteStream.apply(Object.create(WriteStream.prototype), arguments);
      }
      function WriteStream$open() {
        var that = this;
        open4(that.path, that.flags, that.mode, function(err2, fd2) {
          if (err2) {
            that.destroy();
            that.emit("error", err2);
          } else {
            that.fd = fd2;
            that.emit("open", fd2);
          }
        });
      }
      function createReadStream(path, options2) {
        return new fs2.ReadStream(path, options2);
      }
      function createWriteStream3(path, options2) {
        return new fs2.WriteStream(path, options2);
      }
      var fs$open = fs2.open;
      fs2.open = open4;
      function open4(path, flags, mode, cb) {
        if (typeof mode === "function")
          cb = mode, mode = null;
        return go$open(path, flags, mode, cb);
        function go$open(path2, flags2, mode2, cb2, startTime2) {
          return fs$open(path2, flags2, mode2, function(err2, fd2) {
            if (err2 && (err2.code === "EMFILE" || err2.code === "ENFILE"))
              enqueue([go$open, [path2, flags2, mode2, cb2], err2, startTime2 || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      return fs2;
    }
    function enqueue(elem) {
      debug("ENQUEUE", elem[0].name, elem[1]);
      fs[gracefulQueue].push(elem);
      retry();
    }
    var retryTimer;
    function resetQueue() {
      var now = Date.now();
      for (var i2 = 0; i2 < fs[gracefulQueue].length; ++i2) {
        if (fs[gracefulQueue][i2].length > 2) {
          fs[gracefulQueue][i2][3] = now;
          fs[gracefulQueue][i2][4] = now;
        }
      }
      retry();
    }
    function retry() {
      clearTimeout(retryTimer);
      retryTimer = void 0;
      if (fs[gracefulQueue].length === 0)
        return;
      var elem = fs[gracefulQueue].shift();
      var fn = elem[0];
      var args2 = elem[1];
      var err2 = elem[2];
      var startTime2 = elem[3];
      var lastTime = elem[4];
      if (startTime2 === void 0) {
        debug("RETRY", fn.name, args2);
        fn.apply(null, args2);
      } else if (Date.now() - startTime2 >= 6e4) {
        debug("TIMEOUT", fn.name, args2);
        var cb = args2.pop();
        if (typeof cb === "function")
          cb.call(null, err2);
      } else {
        var sinceAttempt = Date.now() - lastTime;
        var sinceStart = Math.max(lastTime - startTime2, 1);
        var desiredDelay = Math.min(sinceStart * 1.2, 100);
        if (sinceAttempt >= desiredDelay) {
          debug("RETRY", fn.name, args2);
          fn.apply(null, args2.concat([startTime2]));
        } else {
          fs[gracefulQueue].push(elem);
        }
      }
      if (retryTimer === void 0) {
        retryTimer = setTimeout(retry, 0);
      }
    }
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/fs/index.js
var require_fs = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/fs/index.js"(exports2) {
    "use strict";
    var u = require_universalify().fromCallback;
    var fs = require_graceful_fs();
    var api = [
      "access",
      "appendFile",
      "chmod",
      "chown",
      "close",
      "copyFile",
      "fchmod",
      "fchown",
      "fdatasync",
      "fstat",
      "fsync",
      "ftruncate",
      "futimes",
      "lchmod",
      "lchown",
      "link",
      "lstat",
      "mkdir",
      "mkdtemp",
      "open",
      "opendir",
      "readdir",
      "readFile",
      "readlink",
      "realpath",
      "rename",
      "rm",
      "rmdir",
      "stat",
      "symlink",
      "truncate",
      "unlink",
      "utimes",
      "writeFile"
    ].filter((key) => {
      return typeof fs[key] === "function";
    });
    Object.assign(exports2, fs);
    api.forEach((method) => {
      exports2[method] = u(fs[method]);
    });
    exports2.exists = function(filename, callback) {
      if (typeof callback === "function") {
        return fs.exists(filename, callback);
      }
      return new Promise((resolve2) => {
        return fs.exists(filename, resolve2);
      });
    };
    exports2.read = function(fd2, buffer, offset, length, position, callback) {
      if (typeof callback === "function") {
        return fs.read(fd2, buffer, offset, length, position, callback);
      }
      return new Promise((resolve2, reject) => {
        fs.read(fd2, buffer, offset, length, position, (err2, bytesRead, buffer2) => {
          if (err2) return reject(err2);
          resolve2({ bytesRead, buffer: buffer2 });
        });
      });
    };
    exports2.write = function(fd2, buffer, ...args2) {
      if (typeof args2[args2.length - 1] === "function") {
        return fs.write(fd2, buffer, ...args2);
      }
      return new Promise((resolve2, reject) => {
        fs.write(fd2, buffer, ...args2, (err2, bytesWritten, buffer2) => {
          if (err2) return reject(err2);
          resolve2({ bytesWritten, buffer: buffer2 });
        });
      });
    };
    if (typeof fs.writev === "function") {
      exports2.writev = function(fd2, buffers, ...args2) {
        if (typeof args2[args2.length - 1] === "function") {
          return fs.writev(fd2, buffers, ...args2);
        }
        return new Promise((resolve2, reject) => {
          fs.writev(fd2, buffers, ...args2, (err2, bytesWritten, buffers2) => {
            if (err2) return reject(err2);
            resolve2({ bytesWritten, buffers: buffers2 });
          });
        });
      };
    }
    if (typeof fs.realpath.native === "function") {
      exports2.realpath.native = u(fs.realpath.native);
    } else {
      process.emitWarning(
        "fs.realpath.native is not a function. Is fs being monkey-patched?",
        "Warning",
        "fs-extra-WARN0003"
      );
    }
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/mkdirs/utils.js
var require_utils = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/mkdirs/utils.js"(exports2, module2) {
    "use strict";
    var path = require("path");
    module2.exports.checkPath = function checkPath(pth) {
      if (process.platform === "win32") {
        const pathHasInvalidWinCharacters = /[<>:"|?*]/.test(pth.replace(path.parse(pth).root, ""));
        if (pathHasInvalidWinCharacters) {
          const error = new Error(`Path contains invalid characters: ${pth}`);
          error.code = "EINVAL";
          throw error;
        }
      }
    };
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/mkdirs/make-dir.js
var require_make_dir = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/mkdirs/make-dir.js"(exports2, module2) {
    "use strict";
    var fs = require_fs();
    var { checkPath } = require_utils();
    var getMode = (options2) => {
      const defaults = { mode: 511 };
      if (typeof options2 === "number") return options2;
      return { ...defaults, ...options2 }.mode;
    };
    module2.exports.makeDir = async (dir, options2) => {
      checkPath(dir);
      return fs.mkdir(dir, {
        mode: getMode(options2),
        recursive: true
      });
    };
    module2.exports.makeDirSync = (dir, options2) => {
      checkPath(dir);
      return fs.mkdirSync(dir, {
        mode: getMode(options2),
        recursive: true
      });
    };
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/mkdirs/index.js
var require_mkdirs = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/mkdirs/index.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromPromise;
    var { makeDir: _makeDir, makeDirSync } = require_make_dir();
    var makeDir = u(_makeDir);
    module2.exports = {
      mkdirs: makeDir,
      mkdirsSync: makeDirSync,
      // alias
      mkdirp: makeDir,
      mkdirpSync: makeDirSync,
      ensureDir: makeDir,
      ensureDirSync: makeDirSync
    };
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/path-exists/index.js
var require_path_exists = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/path-exists/index.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromPromise;
    var fs = require_fs();
    function pathExists(path) {
      return fs.access(path).then(() => true).catch(() => false);
    }
    module2.exports = {
      pathExists: u(pathExists),
      pathExistsSync: fs.existsSync
    };
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/util/utimes.js
var require_utimes = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/util/utimes.js"(exports2, module2) {
    "use strict";
    var fs = require_graceful_fs();
    function utimesMillis(path, atime, mtime, callback) {
      fs.open(path, "r+", (err2, fd2) => {
        if (err2) return callback(err2);
        fs.futimes(fd2, atime, mtime, (futimesErr) => {
          fs.close(fd2, (closeErr) => {
            if (callback) callback(futimesErr || closeErr);
          });
        });
      });
    }
    function utimesMillisSync(path, atime, mtime) {
      const fd2 = fs.openSync(path, "r+");
      fs.futimesSync(fd2, atime, mtime);
      return fs.closeSync(fd2);
    }
    module2.exports = {
      utimesMillis,
      utimesMillisSync
    };
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/util/stat.js
var require_stat = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/util/stat.js"(exports2, module2) {
    "use strict";
    var fs = require_fs();
    var path = require("path");
    var util = require("util");
    function getStats(src, dest, opts) {
      const statFunc = opts.dereference ? (file) => fs.stat(file, { bigint: true }) : (file) => fs.lstat(file, { bigint: true });
      return Promise.all([
        statFunc(src),
        statFunc(dest).catch((err2) => {
          if (err2.code === "ENOENT") return null;
          throw err2;
        })
      ]).then(([srcStat, destStat]) => ({ srcStat, destStat }));
    }
    function getStatsSync(src, dest, opts) {
      let destStat;
      const statFunc = opts.dereference ? (file) => fs.statSync(file, { bigint: true }) : (file) => fs.lstatSync(file, { bigint: true });
      const srcStat = statFunc(src);
      try {
        destStat = statFunc(dest);
      } catch (err2) {
        if (err2.code === "ENOENT") return { srcStat, destStat: null };
        throw err2;
      }
      return { srcStat, destStat };
    }
    function checkPaths(src, dest, funcName, opts, cb) {
      util.callbackify(getStats)(src, dest, opts, (err2, stats) => {
        if (err2) return cb(err2);
        const { srcStat, destStat } = stats;
        if (destStat) {
          if (areIdentical(srcStat, destStat)) {
            const srcBaseName = path.basename(src);
            const destBaseName = path.basename(dest);
            if (funcName === "move" && srcBaseName !== destBaseName && srcBaseName.toLowerCase() === destBaseName.toLowerCase()) {
              return cb(null, { srcStat, destStat, isChangingCase: true });
            }
            return cb(new Error("Source and destination must not be the same."));
          }
          if (srcStat.isDirectory() && !destStat.isDirectory()) {
            return cb(new Error(`Cannot overwrite non-directory '${dest}' with directory '${src}'.`));
          }
          if (!srcStat.isDirectory() && destStat.isDirectory()) {
            return cb(new Error(`Cannot overwrite directory '${dest}' with non-directory '${src}'.`));
          }
        }
        if (srcStat.isDirectory() && isSrcSubdir(src, dest)) {
          return cb(new Error(errMsg(src, dest, funcName)));
        }
        return cb(null, { srcStat, destStat });
      });
    }
    function checkPathsSync(src, dest, funcName, opts) {
      const { srcStat, destStat } = getStatsSync(src, dest, opts);
      if (destStat) {
        if (areIdentical(srcStat, destStat)) {
          const srcBaseName = path.basename(src);
          const destBaseName = path.basename(dest);
          if (funcName === "move" && srcBaseName !== destBaseName && srcBaseName.toLowerCase() === destBaseName.toLowerCase()) {
            return { srcStat, destStat, isChangingCase: true };
          }
          throw new Error("Source and destination must not be the same.");
        }
        if (srcStat.isDirectory() && !destStat.isDirectory()) {
          throw new Error(`Cannot overwrite non-directory '${dest}' with directory '${src}'.`);
        }
        if (!srcStat.isDirectory() && destStat.isDirectory()) {
          throw new Error(`Cannot overwrite directory '${dest}' with non-directory '${src}'.`);
        }
      }
      if (srcStat.isDirectory() && isSrcSubdir(src, dest)) {
        throw new Error(errMsg(src, dest, funcName));
      }
      return { srcStat, destStat };
    }
    function checkParentPaths(src, srcStat, dest, funcName, cb) {
      const srcParent = path.resolve(path.dirname(src));
      const destParent = path.resolve(path.dirname(dest));
      if (destParent === srcParent || destParent === path.parse(destParent).root) return cb();
      fs.stat(destParent, { bigint: true }, (err2, destStat) => {
        if (err2) {
          if (err2.code === "ENOENT") return cb();
          return cb(err2);
        }
        if (areIdentical(srcStat, destStat)) {
          return cb(new Error(errMsg(src, dest, funcName)));
        }
        return checkParentPaths(src, srcStat, destParent, funcName, cb);
      });
    }
    function checkParentPathsSync(src, srcStat, dest, funcName) {
      const srcParent = path.resolve(path.dirname(src));
      const destParent = path.resolve(path.dirname(dest));
      if (destParent === srcParent || destParent === path.parse(destParent).root) return;
      let destStat;
      try {
        destStat = fs.statSync(destParent, { bigint: true });
      } catch (err2) {
        if (err2.code === "ENOENT") return;
        throw err2;
      }
      if (areIdentical(srcStat, destStat)) {
        throw new Error(errMsg(src, dest, funcName));
      }
      return checkParentPathsSync(src, srcStat, destParent, funcName);
    }
    function areIdentical(srcStat, destStat) {
      return destStat.ino && destStat.dev && destStat.ino === srcStat.ino && destStat.dev === srcStat.dev;
    }
    function isSrcSubdir(src, dest) {
      const srcArr = path.resolve(src).split(path.sep).filter((i2) => i2);
      const destArr = path.resolve(dest).split(path.sep).filter((i2) => i2);
      return srcArr.reduce((acc, cur, i2) => acc && destArr[i2] === cur, true);
    }
    function errMsg(src, dest, funcName) {
      return `Cannot ${funcName} '${src}' to a subdirectory of itself, '${dest}'.`;
    }
    module2.exports = {
      checkPaths,
      checkPathsSync,
      checkParentPaths,
      checkParentPathsSync,
      isSrcSubdir,
      areIdentical
    };
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/copy/copy.js
var require_copy = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/copy/copy.js"(exports2, module2) {
    "use strict";
    var fs = require_graceful_fs();
    var path = require("path");
    var mkdirs = require_mkdirs().mkdirs;
    var pathExists = require_path_exists().pathExists;
    var utimesMillis = require_utimes().utimesMillis;
    var stat2 = require_stat();
    function copy(src, dest, opts, cb) {
      if (typeof opts === "function" && !cb) {
        cb = opts;
        opts = {};
      } else if (typeof opts === "function") {
        opts = { filter: opts };
      }
      cb = cb || function() {
      };
      opts = opts || {};
      opts.clobber = "clobber" in opts ? !!opts.clobber : true;
      opts.overwrite = "overwrite" in opts ? !!opts.overwrite : opts.clobber;
      if (opts.preserveTimestamps && process.arch === "ia32") {
        process.emitWarning(
          "Using the preserveTimestamps option in 32-bit node is not recommended;\n\n	see https://github.com/jprichardson/node-fs-extra/issues/269",
          "Warning",
          "fs-extra-WARN0001"
        );
      }
      stat2.checkPaths(src, dest, "copy", opts, (err2, stats) => {
        if (err2) return cb(err2);
        const { srcStat, destStat } = stats;
        stat2.checkParentPaths(src, srcStat, dest, "copy", (err3) => {
          if (err3) return cb(err3);
          if (opts.filter) return handleFilter(checkParentDir, destStat, src, dest, opts, cb);
          return checkParentDir(destStat, src, dest, opts, cb);
        });
      });
    }
    function checkParentDir(destStat, src, dest, opts, cb) {
      const destParent = path.dirname(dest);
      pathExists(destParent, (err2, dirExists) => {
        if (err2) return cb(err2);
        if (dirExists) return getStats(destStat, src, dest, opts, cb);
        mkdirs(destParent, (err3) => {
          if (err3) return cb(err3);
          return getStats(destStat, src, dest, opts, cb);
        });
      });
    }
    function handleFilter(onInclude, destStat, src, dest, opts, cb) {
      Promise.resolve(opts.filter(src, dest)).then((include) => {
        if (include) return onInclude(destStat, src, dest, opts, cb);
        return cb();
      }, (error) => cb(error));
    }
    function startCopy(destStat, src, dest, opts, cb) {
      if (opts.filter) return handleFilter(getStats, destStat, src, dest, opts, cb);
      return getStats(destStat, src, dest, opts, cb);
    }
    function getStats(destStat, src, dest, opts, cb) {
      const stat3 = opts.dereference ? fs.stat : fs.lstat;
      stat3(src, (err2, srcStat) => {
        if (err2) return cb(err2);
        if (srcStat.isDirectory()) return onDir(srcStat, destStat, src, dest, opts, cb);
        else if (srcStat.isFile() || srcStat.isCharacterDevice() || srcStat.isBlockDevice()) return onFile(srcStat, destStat, src, dest, opts, cb);
        else if (srcStat.isSymbolicLink()) return onLink(destStat, src, dest, opts, cb);
        else if (srcStat.isSocket()) return cb(new Error(`Cannot copy a socket file: ${src}`));
        else if (srcStat.isFIFO()) return cb(new Error(`Cannot copy a FIFO pipe: ${src}`));
        return cb(new Error(`Unknown file: ${src}`));
      });
    }
    function onFile(srcStat, destStat, src, dest, opts, cb) {
      if (!destStat) return copyFile2(srcStat, src, dest, opts, cb);
      return mayCopyFile(srcStat, src, dest, opts, cb);
    }
    function mayCopyFile(srcStat, src, dest, opts, cb) {
      if (opts.overwrite) {
        fs.unlink(dest, (err2) => {
          if (err2) return cb(err2);
          return copyFile2(srcStat, src, dest, opts, cb);
        });
      } else if (opts.errorOnExist) {
        return cb(new Error(`'${dest}' already exists`));
      } else return cb();
    }
    function copyFile2(srcStat, src, dest, opts, cb) {
      fs.copyFile(src, dest, (err2) => {
        if (err2) return cb(err2);
        if (opts.preserveTimestamps) return handleTimestampsAndMode(srcStat.mode, src, dest, cb);
        return setDestMode(dest, srcStat.mode, cb);
      });
    }
    function handleTimestampsAndMode(srcMode, src, dest, cb) {
      if (fileIsNotWritable(srcMode)) {
        return makeFileWritable(dest, srcMode, (err2) => {
          if (err2) return cb(err2);
          return setDestTimestampsAndMode(srcMode, src, dest, cb);
        });
      }
      return setDestTimestampsAndMode(srcMode, src, dest, cb);
    }
    function fileIsNotWritable(srcMode) {
      return (srcMode & 128) === 0;
    }
    function makeFileWritable(dest, srcMode, cb) {
      return setDestMode(dest, srcMode | 128, cb);
    }
    function setDestTimestampsAndMode(srcMode, src, dest, cb) {
      setDestTimestamps(src, dest, (err2) => {
        if (err2) return cb(err2);
        return setDestMode(dest, srcMode, cb);
      });
    }
    function setDestMode(dest, srcMode, cb) {
      return fs.chmod(dest, srcMode, cb);
    }
    function setDestTimestamps(src, dest, cb) {
      fs.stat(src, (err2, updatedSrcStat) => {
        if (err2) return cb(err2);
        return utimesMillis(dest, updatedSrcStat.atime, updatedSrcStat.mtime, cb);
      });
    }
    function onDir(srcStat, destStat, src, dest, opts, cb) {
      if (!destStat) return mkDirAndCopy(srcStat.mode, src, dest, opts, cb);
      return copyDir(src, dest, opts, cb);
    }
    function mkDirAndCopy(srcMode, src, dest, opts, cb) {
      fs.mkdir(dest, (err2) => {
        if (err2) return cb(err2);
        copyDir(src, dest, opts, (err3) => {
          if (err3) return cb(err3);
          return setDestMode(dest, srcMode, cb);
        });
      });
    }
    function copyDir(src, dest, opts, cb) {
      fs.readdir(src, (err2, items) => {
        if (err2) return cb(err2);
        return copyDirItems(items, src, dest, opts, cb);
      });
    }
    function copyDirItems(items, src, dest, opts, cb) {
      const item = items.pop();
      if (!item) return cb();
      return copyDirItem(items, item, src, dest, opts, cb);
    }
    function copyDirItem(items, item, src, dest, opts, cb) {
      const srcItem = path.join(src, item);
      const destItem = path.join(dest, item);
      stat2.checkPaths(srcItem, destItem, "copy", opts, (err2, stats) => {
        if (err2) return cb(err2);
        const { destStat } = stats;
        startCopy(destStat, srcItem, destItem, opts, (err3) => {
          if (err3) return cb(err3);
          return copyDirItems(items, src, dest, opts, cb);
        });
      });
    }
    function onLink(destStat, src, dest, opts, cb) {
      fs.readlink(src, (err2, resolvedSrc) => {
        if (err2) return cb(err2);
        if (opts.dereference) {
          resolvedSrc = path.resolve(process.cwd(), resolvedSrc);
        }
        if (!destStat) {
          return fs.symlink(resolvedSrc, dest, cb);
        } else {
          fs.readlink(dest, (err3, resolvedDest) => {
            if (err3) {
              if (err3.code === "EINVAL" || err3.code === "UNKNOWN") return fs.symlink(resolvedSrc, dest, cb);
              return cb(err3);
            }
            if (opts.dereference) {
              resolvedDest = path.resolve(process.cwd(), resolvedDest);
            }
            if (stat2.isSrcSubdir(resolvedSrc, resolvedDest)) {
              return cb(new Error(`Cannot copy '${resolvedSrc}' to a subdirectory of itself, '${resolvedDest}'.`));
            }
            if (destStat.isDirectory() && stat2.isSrcSubdir(resolvedDest, resolvedSrc)) {
              return cb(new Error(`Cannot overwrite '${resolvedDest}' with '${resolvedSrc}'.`));
            }
            return copyLink(resolvedSrc, dest, cb);
          });
        }
      });
    }
    function copyLink(resolvedSrc, dest, cb) {
      fs.unlink(dest, (err2) => {
        if (err2) return cb(err2);
        return fs.symlink(resolvedSrc, dest, cb);
      });
    }
    module2.exports = copy;
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/copy/copy-sync.js
var require_copy_sync = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/copy/copy-sync.js"(exports2, module2) {
    "use strict";
    var fs = require_graceful_fs();
    var path = require("path");
    var mkdirsSync = require_mkdirs().mkdirsSync;
    var utimesMillisSync = require_utimes().utimesMillisSync;
    var stat2 = require_stat();
    function copySync(src, dest, opts) {
      if (typeof opts === "function") {
        opts = { filter: opts };
      }
      opts = opts || {};
      opts.clobber = "clobber" in opts ? !!opts.clobber : true;
      opts.overwrite = "overwrite" in opts ? !!opts.overwrite : opts.clobber;
      if (opts.preserveTimestamps && process.arch === "ia32") {
        process.emitWarning(
          "Using the preserveTimestamps option in 32-bit node is not recommended;\n\n	see https://github.com/jprichardson/node-fs-extra/issues/269",
          "Warning",
          "fs-extra-WARN0002"
        );
      }
      const { srcStat, destStat } = stat2.checkPathsSync(src, dest, "copy", opts);
      stat2.checkParentPathsSync(src, srcStat, dest, "copy");
      return handleFilterAndCopy(destStat, src, dest, opts);
    }
    function handleFilterAndCopy(destStat, src, dest, opts) {
      if (opts.filter && !opts.filter(src, dest)) return;
      const destParent = path.dirname(dest);
      if (!fs.existsSync(destParent)) mkdirsSync(destParent);
      return getStats(destStat, src, dest, opts);
    }
    function startCopy(destStat, src, dest, opts) {
      if (opts.filter && !opts.filter(src, dest)) return;
      return getStats(destStat, src, dest, opts);
    }
    function getStats(destStat, src, dest, opts) {
      const statSync3 = opts.dereference ? fs.statSync : fs.lstatSync;
      const srcStat = statSync3(src);
      if (srcStat.isDirectory()) return onDir(srcStat, destStat, src, dest, opts);
      else if (srcStat.isFile() || srcStat.isCharacterDevice() || srcStat.isBlockDevice()) return onFile(srcStat, destStat, src, dest, opts);
      else if (srcStat.isSymbolicLink()) return onLink(destStat, src, dest, opts);
      else if (srcStat.isSocket()) throw new Error(`Cannot copy a socket file: ${src}`);
      else if (srcStat.isFIFO()) throw new Error(`Cannot copy a FIFO pipe: ${src}`);
      throw new Error(`Unknown file: ${src}`);
    }
    function onFile(srcStat, destStat, src, dest, opts) {
      if (!destStat) return copyFile2(srcStat, src, dest, opts);
      return mayCopyFile(srcStat, src, dest, opts);
    }
    function mayCopyFile(srcStat, src, dest, opts) {
      if (opts.overwrite) {
        fs.unlinkSync(dest);
        return copyFile2(srcStat, src, dest, opts);
      } else if (opts.errorOnExist) {
        throw new Error(`'${dest}' already exists`);
      }
    }
    function copyFile2(srcStat, src, dest, opts) {
      fs.copyFileSync(src, dest);
      if (opts.preserveTimestamps) handleTimestamps(srcStat.mode, src, dest);
      return setDestMode(dest, srcStat.mode);
    }
    function handleTimestamps(srcMode, src, dest) {
      if (fileIsNotWritable(srcMode)) makeFileWritable(dest, srcMode);
      return setDestTimestamps(src, dest);
    }
    function fileIsNotWritable(srcMode) {
      return (srcMode & 128) === 0;
    }
    function makeFileWritable(dest, srcMode) {
      return setDestMode(dest, srcMode | 128);
    }
    function setDestMode(dest, srcMode) {
      return fs.chmodSync(dest, srcMode);
    }
    function setDestTimestamps(src, dest) {
      const updatedSrcStat = fs.statSync(src);
      return utimesMillisSync(dest, updatedSrcStat.atime, updatedSrcStat.mtime);
    }
    function onDir(srcStat, destStat, src, dest, opts) {
      if (!destStat) return mkDirAndCopy(srcStat.mode, src, dest, opts);
      return copyDir(src, dest, opts);
    }
    function mkDirAndCopy(srcMode, src, dest, opts) {
      fs.mkdirSync(dest);
      copyDir(src, dest, opts);
      return setDestMode(dest, srcMode);
    }
    function copyDir(src, dest, opts) {
      fs.readdirSync(src).forEach((item) => copyDirItem(item, src, dest, opts));
    }
    function copyDirItem(item, src, dest, opts) {
      const srcItem = path.join(src, item);
      const destItem = path.join(dest, item);
      const { destStat } = stat2.checkPathsSync(srcItem, destItem, "copy", opts);
      return startCopy(destStat, srcItem, destItem, opts);
    }
    function onLink(destStat, src, dest, opts) {
      let resolvedSrc = fs.readlinkSync(src);
      if (opts.dereference) {
        resolvedSrc = path.resolve(process.cwd(), resolvedSrc);
      }
      if (!destStat) {
        return fs.symlinkSync(resolvedSrc, dest);
      } else {
        let resolvedDest;
        try {
          resolvedDest = fs.readlinkSync(dest);
        } catch (err2) {
          if (err2.code === "EINVAL" || err2.code === "UNKNOWN") return fs.symlinkSync(resolvedSrc, dest);
          throw err2;
        }
        if (opts.dereference) {
          resolvedDest = path.resolve(process.cwd(), resolvedDest);
        }
        if (stat2.isSrcSubdir(resolvedSrc, resolvedDest)) {
          throw new Error(`Cannot copy '${resolvedSrc}' to a subdirectory of itself, '${resolvedDest}'.`);
        }
        if (fs.statSync(dest).isDirectory() && stat2.isSrcSubdir(resolvedDest, resolvedSrc)) {
          throw new Error(`Cannot overwrite '${resolvedDest}' with '${resolvedSrc}'.`);
        }
        return copyLink(resolvedSrc, dest);
      }
    }
    function copyLink(resolvedSrc, dest) {
      fs.unlinkSync(dest);
      return fs.symlinkSync(resolvedSrc, dest);
    }
    module2.exports = copySync;
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/copy/index.js
var require_copy2 = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/copy/index.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromCallback;
    module2.exports = {
      copy: u(require_copy()),
      copySync: require_copy_sync()
    };
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/remove/rimraf.js
var require_rimraf = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/remove/rimraf.js"(exports2, module2) {
    "use strict";
    var fs = require_graceful_fs();
    var path = require("path");
    var assert = require("assert");
    var isWindows = process.platform === "win32";
    function defaults(options2) {
      const methods = [
        "unlink",
        "chmod",
        "stat",
        "lstat",
        "rmdir",
        "readdir"
      ];
      methods.forEach((m) => {
        options2[m] = options2[m] || fs[m];
        m = m + "Sync";
        options2[m] = options2[m] || fs[m];
      });
      options2.maxBusyTries = options2.maxBusyTries || 3;
    }
    function rimraf(p, options2, cb) {
      let busyTries = 0;
      if (typeof options2 === "function") {
        cb = options2;
        options2 = {};
      }
      assert(p, "rimraf: missing path");
      assert.strictEqual(typeof p, "string", "rimraf: path should be a string");
      assert.strictEqual(typeof cb, "function", "rimraf: callback function required");
      assert(options2, "rimraf: invalid options argument provided");
      assert.strictEqual(typeof options2, "object", "rimraf: options should be object");
      defaults(options2);
      rimraf_(p, options2, function CB(er) {
        if (er) {
          if ((er.code === "EBUSY" || er.code === "ENOTEMPTY" || er.code === "EPERM") && busyTries < options2.maxBusyTries) {
            busyTries++;
            const time = busyTries * 100;
            return setTimeout(() => rimraf_(p, options2, CB), time);
          }
          if (er.code === "ENOENT") er = null;
        }
        cb(er);
      });
    }
    function rimraf_(p, options2, cb) {
      assert(p);
      assert(options2);
      assert(typeof cb === "function");
      options2.lstat(p, (er, st) => {
        if (er && er.code === "ENOENT") {
          return cb(null);
        }
        if (er && er.code === "EPERM" && isWindows) {
          return fixWinEPERM(p, options2, er, cb);
        }
        if (st && st.isDirectory()) {
          return rmdir(p, options2, er, cb);
        }
        options2.unlink(p, (er2) => {
          if (er2) {
            if (er2.code === "ENOENT") {
              return cb(null);
            }
            if (er2.code === "EPERM") {
              return isWindows ? fixWinEPERM(p, options2, er2, cb) : rmdir(p, options2, er2, cb);
            }
            if (er2.code === "EISDIR") {
              return rmdir(p, options2, er2, cb);
            }
          }
          return cb(er2);
        });
      });
    }
    function fixWinEPERM(p, options2, er, cb) {
      assert(p);
      assert(options2);
      assert(typeof cb === "function");
      options2.chmod(p, 438, (er2) => {
        if (er2) {
          cb(er2.code === "ENOENT" ? null : er);
        } else {
          options2.stat(p, (er3, stats) => {
            if (er3) {
              cb(er3.code === "ENOENT" ? null : er);
            } else if (stats.isDirectory()) {
              rmdir(p, options2, er, cb);
            } else {
              options2.unlink(p, cb);
            }
          });
        }
      });
    }
    function fixWinEPERMSync(p, options2, er) {
      let stats;
      assert(p);
      assert(options2);
      try {
        options2.chmodSync(p, 438);
      } catch (er2) {
        if (er2.code === "ENOENT") {
          return;
        } else {
          throw er;
        }
      }
      try {
        stats = options2.statSync(p);
      } catch (er3) {
        if (er3.code === "ENOENT") {
          return;
        } else {
          throw er;
        }
      }
      if (stats.isDirectory()) {
        rmdirSync(p, options2, er);
      } else {
        options2.unlinkSync(p);
      }
    }
    function rmdir(p, options2, originalEr, cb) {
      assert(p);
      assert(options2);
      assert(typeof cb === "function");
      options2.rmdir(p, (er) => {
        if (er && (er.code === "ENOTEMPTY" || er.code === "EEXIST" || er.code === "EPERM")) {
          rmkids(p, options2, cb);
        } else if (er && er.code === "ENOTDIR") {
          cb(originalEr);
        } else {
          cb(er);
        }
      });
    }
    function rmkids(p, options2, cb) {
      assert(p);
      assert(options2);
      assert(typeof cb === "function");
      options2.readdir(p, (er, files) => {
        if (er) return cb(er);
        let n = files.length;
        let errState;
        if (n === 0) return options2.rmdir(p, cb);
        files.forEach((f) => {
          rimraf(path.join(p, f), options2, (er2) => {
            if (errState) {
              return;
            }
            if (er2) return cb(errState = er2);
            if (--n === 0) {
              options2.rmdir(p, cb);
            }
          });
        });
      });
    }
    function rimrafSync(p, options2) {
      let st;
      options2 = options2 || {};
      defaults(options2);
      assert(p, "rimraf: missing path");
      assert.strictEqual(typeof p, "string", "rimraf: path should be a string");
      assert(options2, "rimraf: missing options");
      assert.strictEqual(typeof options2, "object", "rimraf: options should be object");
      try {
        st = options2.lstatSync(p);
      } catch (er) {
        if (er.code === "ENOENT") {
          return;
        }
        if (er.code === "EPERM" && isWindows) {
          fixWinEPERMSync(p, options2, er);
        }
      }
      try {
        if (st && st.isDirectory()) {
          rmdirSync(p, options2, null);
        } else {
          options2.unlinkSync(p);
        }
      } catch (er) {
        if (er.code === "ENOENT") {
          return;
        } else if (er.code === "EPERM") {
          return isWindows ? fixWinEPERMSync(p, options2, er) : rmdirSync(p, options2, er);
        } else if (er.code !== "EISDIR") {
          throw er;
        }
        rmdirSync(p, options2, er);
      }
    }
    function rmdirSync(p, options2, originalEr) {
      assert(p);
      assert(options2);
      try {
        options2.rmdirSync(p);
      } catch (er) {
        if (er.code === "ENOTDIR") {
          throw originalEr;
        } else if (er.code === "ENOTEMPTY" || er.code === "EEXIST" || er.code === "EPERM") {
          rmkidsSync(p, options2);
        } else if (er.code !== "ENOENT") {
          throw er;
        }
      }
    }
    function rmkidsSync(p, options2) {
      assert(p);
      assert(options2);
      options2.readdirSync(p).forEach((f) => rimrafSync(path.join(p, f), options2));
      if (isWindows) {
        const startTime2 = Date.now();
        do {
          try {
            const ret = options2.rmdirSync(p, options2);
            return ret;
          } catch {
          }
        } while (Date.now() - startTime2 < 500);
      } else {
        const ret = options2.rmdirSync(p, options2);
        return ret;
      }
    }
    module2.exports = rimraf;
    rimraf.sync = rimrafSync;
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/remove/index.js
var require_remove = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/remove/index.js"(exports2, module2) {
    "use strict";
    var fs = require_graceful_fs();
    var u = require_universalify().fromCallback;
    var rimraf = require_rimraf();
    function remove(path, callback) {
      if (fs.rm) return fs.rm(path, { recursive: true, force: true }, callback);
      rimraf(path, callback);
    }
    function removeSync(path) {
      if (fs.rmSync) return fs.rmSync(path, { recursive: true, force: true });
      rimraf.sync(path);
    }
    module2.exports = {
      remove: u(remove),
      removeSync
    };
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/empty/index.js
var require_empty = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/empty/index.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromPromise;
    var fs = require_fs();
    var path = require("path");
    var mkdir3 = require_mkdirs();
    var remove = require_remove();
    var emptyDir = u(async function emptyDir2(dir) {
      let items;
      try {
        items = await fs.readdir(dir);
      } catch {
        return mkdir3.mkdirs(dir);
      }
      return Promise.all(items.map((item) => remove.remove(path.join(dir, item))));
    });
    function emptyDirSync(dir) {
      let items;
      try {
        items = fs.readdirSync(dir);
      } catch {
        return mkdir3.mkdirsSync(dir);
      }
      items.forEach((item) => {
        item = path.join(dir, item);
        remove.removeSync(item);
      });
    }
    module2.exports = {
      emptyDirSync,
      emptydirSync: emptyDirSync,
      emptyDir,
      emptydir: emptyDir
    };
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/ensure/file.js
var require_file = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/ensure/file.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromCallback;
    var path = require("path");
    var fs = require_graceful_fs();
    var mkdir3 = require_mkdirs();
    function createFile(file, callback) {
      function makeFile() {
        fs.writeFile(file, "", (err2) => {
          if (err2) return callback(err2);
          callback();
        });
      }
      fs.stat(file, (err2, stats) => {
        if (!err2 && stats.isFile()) return callback();
        const dir = path.dirname(file);
        fs.stat(dir, (err3, stats2) => {
          if (err3) {
            if (err3.code === "ENOENT") {
              return mkdir3.mkdirs(dir, (err4) => {
                if (err4) return callback(err4);
                makeFile();
              });
            }
            return callback(err3);
          }
          if (stats2.isDirectory()) makeFile();
          else {
            fs.readdir(dir, (err4) => {
              if (err4) return callback(err4);
            });
          }
        });
      });
    }
    function createFileSync(file) {
      let stats;
      try {
        stats = fs.statSync(file);
      } catch {
      }
      if (stats && stats.isFile()) return;
      const dir = path.dirname(file);
      try {
        if (!fs.statSync(dir).isDirectory()) {
          fs.readdirSync(dir);
        }
      } catch (err2) {
        if (err2 && err2.code === "ENOENT") mkdir3.mkdirsSync(dir);
        else throw err2;
      }
      fs.writeFileSync(file, "");
    }
    module2.exports = {
      createFile: u(createFile),
      createFileSync
    };
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/ensure/link.js
var require_link = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/ensure/link.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromCallback;
    var path = require("path");
    var fs = require_graceful_fs();
    var mkdir3 = require_mkdirs();
    var pathExists = require_path_exists().pathExists;
    var { areIdentical } = require_stat();
    function createLink(srcpath, dstpath, callback) {
      function makeLink(srcpath2, dstpath2) {
        fs.link(srcpath2, dstpath2, (err2) => {
          if (err2) return callback(err2);
          callback(null);
        });
      }
      fs.lstat(dstpath, (_, dstStat) => {
        fs.lstat(srcpath, (err2, srcStat) => {
          if (err2) {
            err2.message = err2.message.replace("lstat", "ensureLink");
            return callback(err2);
          }
          if (dstStat && areIdentical(srcStat, dstStat)) return callback(null);
          const dir = path.dirname(dstpath);
          pathExists(dir, (err3, dirExists) => {
            if (err3) return callback(err3);
            if (dirExists) return makeLink(srcpath, dstpath);
            mkdir3.mkdirs(dir, (err4) => {
              if (err4) return callback(err4);
              makeLink(srcpath, dstpath);
            });
          });
        });
      });
    }
    function createLinkSync(srcpath, dstpath) {
      let dstStat;
      try {
        dstStat = fs.lstatSync(dstpath);
      } catch {
      }
      try {
        const srcStat = fs.lstatSync(srcpath);
        if (dstStat && areIdentical(srcStat, dstStat)) return;
      } catch (err2) {
        err2.message = err2.message.replace("lstat", "ensureLink");
        throw err2;
      }
      const dir = path.dirname(dstpath);
      const dirExists = fs.existsSync(dir);
      if (dirExists) return fs.linkSync(srcpath, dstpath);
      mkdir3.mkdirsSync(dir);
      return fs.linkSync(srcpath, dstpath);
    }
    module2.exports = {
      createLink: u(createLink),
      createLinkSync
    };
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/ensure/symlink-paths.js
var require_symlink_paths = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/ensure/symlink-paths.js"(exports2, module2) {
    "use strict";
    var path = require("path");
    var fs = require_graceful_fs();
    var pathExists = require_path_exists().pathExists;
    function symlinkPaths(srcpath, dstpath, callback) {
      if (path.isAbsolute(srcpath)) {
        return fs.lstat(srcpath, (err2) => {
          if (err2) {
            err2.message = err2.message.replace("lstat", "ensureSymlink");
            return callback(err2);
          }
          return callback(null, {
            toCwd: srcpath,
            toDst: srcpath
          });
        });
      } else {
        const dstdir = path.dirname(dstpath);
        const relativeToDst = path.join(dstdir, srcpath);
        return pathExists(relativeToDst, (err2, exists) => {
          if (err2) return callback(err2);
          if (exists) {
            return callback(null, {
              toCwd: relativeToDst,
              toDst: srcpath
            });
          } else {
            return fs.lstat(srcpath, (err3) => {
              if (err3) {
                err3.message = err3.message.replace("lstat", "ensureSymlink");
                return callback(err3);
              }
              return callback(null, {
                toCwd: srcpath,
                toDst: path.relative(dstdir, srcpath)
              });
            });
          }
        });
      }
    }
    function symlinkPathsSync(srcpath, dstpath) {
      let exists;
      if (path.isAbsolute(srcpath)) {
        exists = fs.existsSync(srcpath);
        if (!exists) throw new Error("absolute srcpath does not exist");
        return {
          toCwd: srcpath,
          toDst: srcpath
        };
      } else {
        const dstdir = path.dirname(dstpath);
        const relativeToDst = path.join(dstdir, srcpath);
        exists = fs.existsSync(relativeToDst);
        if (exists) {
          return {
            toCwd: relativeToDst,
            toDst: srcpath
          };
        } else {
          exists = fs.existsSync(srcpath);
          if (!exists) throw new Error("relative srcpath does not exist");
          return {
            toCwd: srcpath,
            toDst: path.relative(dstdir, srcpath)
          };
        }
      }
    }
    module2.exports = {
      symlinkPaths,
      symlinkPathsSync
    };
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/ensure/symlink-type.js
var require_symlink_type = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/ensure/symlink-type.js"(exports2, module2) {
    "use strict";
    var fs = require_graceful_fs();
    function symlinkType(srcpath, type, callback) {
      callback = typeof type === "function" ? type : callback;
      type = typeof type === "function" ? false : type;
      if (type) return callback(null, type);
      fs.lstat(srcpath, (err2, stats) => {
        if (err2) return callback(null, "file");
        type = stats && stats.isDirectory() ? "dir" : "file";
        callback(null, type);
      });
    }
    function symlinkTypeSync(srcpath, type) {
      let stats;
      if (type) return type;
      try {
        stats = fs.lstatSync(srcpath);
      } catch {
        return "file";
      }
      return stats && stats.isDirectory() ? "dir" : "file";
    }
    module2.exports = {
      symlinkType,
      symlinkTypeSync
    };
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/ensure/symlink.js
var require_symlink = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/ensure/symlink.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromCallback;
    var path = require("path");
    var fs = require_fs();
    var _mkdirs = require_mkdirs();
    var mkdirs = _mkdirs.mkdirs;
    var mkdirsSync = _mkdirs.mkdirsSync;
    var _symlinkPaths = require_symlink_paths();
    var symlinkPaths = _symlinkPaths.symlinkPaths;
    var symlinkPathsSync = _symlinkPaths.symlinkPathsSync;
    var _symlinkType = require_symlink_type();
    var symlinkType = _symlinkType.symlinkType;
    var symlinkTypeSync = _symlinkType.symlinkTypeSync;
    var pathExists = require_path_exists().pathExists;
    var { areIdentical } = require_stat();
    function createSymlink(srcpath, dstpath, type, callback) {
      callback = typeof type === "function" ? type : callback;
      type = typeof type === "function" ? false : type;
      fs.lstat(dstpath, (err2, stats) => {
        if (!err2 && stats.isSymbolicLink()) {
          Promise.all([
            fs.stat(srcpath),
            fs.stat(dstpath)
          ]).then(([srcStat, dstStat]) => {
            if (areIdentical(srcStat, dstStat)) return callback(null);
            _createSymlink(srcpath, dstpath, type, callback);
          });
        } else _createSymlink(srcpath, dstpath, type, callback);
      });
    }
    function _createSymlink(srcpath, dstpath, type, callback) {
      symlinkPaths(srcpath, dstpath, (err2, relative) => {
        if (err2) return callback(err2);
        srcpath = relative.toDst;
        symlinkType(relative.toCwd, type, (err3, type2) => {
          if (err3) return callback(err3);
          const dir = path.dirname(dstpath);
          pathExists(dir, (err4, dirExists) => {
            if (err4) return callback(err4);
            if (dirExists) return fs.symlink(srcpath, dstpath, type2, callback);
            mkdirs(dir, (err5) => {
              if (err5) return callback(err5);
              fs.symlink(srcpath, dstpath, type2, callback);
            });
          });
        });
      });
    }
    function createSymlinkSync(srcpath, dstpath, type) {
      let stats;
      try {
        stats = fs.lstatSync(dstpath);
      } catch {
      }
      if (stats && stats.isSymbolicLink()) {
        const srcStat = fs.statSync(srcpath);
        const dstStat = fs.statSync(dstpath);
        if (areIdentical(srcStat, dstStat)) return;
      }
      const relative = symlinkPathsSync(srcpath, dstpath);
      srcpath = relative.toDst;
      type = symlinkTypeSync(relative.toCwd, type);
      const dir = path.dirname(dstpath);
      const exists = fs.existsSync(dir);
      if (exists) return fs.symlinkSync(srcpath, dstpath, type);
      mkdirsSync(dir);
      return fs.symlinkSync(srcpath, dstpath, type);
    }
    module2.exports = {
      createSymlink: u(createSymlink),
      createSymlinkSync
    };
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/ensure/index.js
var require_ensure = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/ensure/index.js"(exports2, module2) {
    "use strict";
    var { createFile, createFileSync } = require_file();
    var { createLink, createLinkSync } = require_link();
    var { createSymlink, createSymlinkSync } = require_symlink();
    module2.exports = {
      // file
      createFile,
      createFileSync,
      ensureFile: createFile,
      ensureFileSync: createFileSync,
      // link
      createLink,
      createLinkSync,
      ensureLink: createLink,
      ensureLinkSync: createLinkSync,
      // symlink
      createSymlink,
      createSymlinkSync,
      ensureSymlink: createSymlink,
      ensureSymlinkSync: createSymlinkSync
    };
  }
});

// node_modules/.pnpm/jsonfile@6.1.0/node_modules/jsonfile/utils.js
var require_utils2 = __commonJS({
  "node_modules/.pnpm/jsonfile@6.1.0/node_modules/jsonfile/utils.js"(exports2, module2) {
    function stringify(obj, { EOL = "\n", finalEOL = true, replacer = null, spaces } = {}) {
      const EOF = finalEOL ? EOL : "";
      const str = JSON.stringify(obj, replacer, spaces);
      return str.replace(/\n/g, EOL) + EOF;
    }
    function stripBom(content) {
      if (Buffer.isBuffer(content)) content = content.toString("utf8");
      return content.replace(/^\uFEFF/, "");
    }
    module2.exports = { stringify, stripBom };
  }
});

// node_modules/.pnpm/jsonfile@6.1.0/node_modules/jsonfile/index.js
var require_jsonfile = __commonJS({
  "node_modules/.pnpm/jsonfile@6.1.0/node_modules/jsonfile/index.js"(exports2, module2) {
    var _fs;
    try {
      _fs = require_graceful_fs();
    } catch (_) {
      _fs = require("fs");
    }
    var universalify = require_universalify();
    var { stringify, stripBom } = require_utils2();
    async function _readFile(file, options2 = {}) {
      if (typeof options2 === "string") {
        options2 = { encoding: options2 };
      }
      const fs = options2.fs || _fs;
      const shouldThrow = "throws" in options2 ? options2.throws : true;
      let data = await universalify.fromCallback(fs.readFile)(file, options2);
      data = stripBom(data);
      let obj;
      try {
        obj = JSON.parse(data, options2 ? options2.reviver : null);
      } catch (err2) {
        if (shouldThrow) {
          err2.message = `${file}: ${err2.message}`;
          throw err2;
        } else {
          return null;
        }
      }
      return obj;
    }
    var readFile3 = universalify.fromPromise(_readFile);
    function readFileSync7(file, options2 = {}) {
      if (typeof options2 === "string") {
        options2 = { encoding: options2 };
      }
      const fs = options2.fs || _fs;
      const shouldThrow = "throws" in options2 ? options2.throws : true;
      try {
        let content = fs.readFileSync(file, options2);
        content = stripBom(content);
        return JSON.parse(content, options2.reviver);
      } catch (err2) {
        if (shouldThrow) {
          err2.message = `${file}: ${err2.message}`;
          throw err2;
        } else {
          return null;
        }
      }
    }
    async function _writeFile(file, obj, options2 = {}) {
      const fs = options2.fs || _fs;
      const str = stringify(obj, options2);
      await universalify.fromCallback(fs.writeFile)(file, str, options2);
    }
    var writeFile3 = universalify.fromPromise(_writeFile);
    function writeFileSync8(file, obj, options2 = {}) {
      const fs = options2.fs || _fs;
      const str = stringify(obj, options2);
      return fs.writeFileSync(file, str, options2);
    }
    var jsonfile = {
      readFile: readFile3,
      readFileSync: readFileSync7,
      writeFile: writeFile3,
      writeFileSync: writeFileSync8
    };
    module2.exports = jsonfile;
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/json/jsonfile.js
var require_jsonfile2 = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/json/jsonfile.js"(exports2, module2) {
    "use strict";
    var jsonFile = require_jsonfile();
    module2.exports = {
      // jsonfile exports
      readJson: jsonFile.readFile,
      readJsonSync: jsonFile.readFileSync,
      writeJson: jsonFile.writeFile,
      writeJsonSync: jsonFile.writeFileSync
    };
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/output-file/index.js
var require_output_file = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/output-file/index.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromCallback;
    var fs = require_graceful_fs();
    var path = require("path");
    var mkdir3 = require_mkdirs();
    var pathExists = require_path_exists().pathExists;
    function outputFile(file, data, encoding, callback) {
      if (typeof encoding === "function") {
        callback = encoding;
        encoding = "utf8";
      }
      const dir = path.dirname(file);
      pathExists(dir, (err2, itDoes) => {
        if (err2) return callback(err2);
        if (itDoes) return fs.writeFile(file, data, encoding, callback);
        mkdir3.mkdirs(dir, (err3) => {
          if (err3) return callback(err3);
          fs.writeFile(file, data, encoding, callback);
        });
      });
    }
    function outputFileSync(file, ...args2) {
      const dir = path.dirname(file);
      if (fs.existsSync(dir)) {
        return fs.writeFileSync(file, ...args2);
      }
      mkdir3.mkdirsSync(dir);
      fs.writeFileSync(file, ...args2);
    }
    module2.exports = {
      outputFile: u(outputFile),
      outputFileSync
    };
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/json/output-json.js
var require_output_json = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/json/output-json.js"(exports2, module2) {
    "use strict";
    var { stringify } = require_utils2();
    var { outputFile } = require_output_file();
    async function outputJson(file, data, options2 = {}) {
      const str = stringify(data, options2);
      await outputFile(file, str, options2);
    }
    module2.exports = outputJson;
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/json/output-json-sync.js
var require_output_json_sync = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/json/output-json-sync.js"(exports2, module2) {
    "use strict";
    var { stringify } = require_utils2();
    var { outputFileSync } = require_output_file();
    function outputJsonSync(file, data, options2) {
      const str = stringify(data, options2);
      outputFileSync(file, str, options2);
    }
    module2.exports = outputJsonSync;
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/json/index.js
var require_json = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/json/index.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromPromise;
    var jsonFile = require_jsonfile2();
    jsonFile.outputJson = u(require_output_json());
    jsonFile.outputJsonSync = require_output_json_sync();
    jsonFile.outputJSON = jsonFile.outputJson;
    jsonFile.outputJSONSync = jsonFile.outputJsonSync;
    jsonFile.writeJSON = jsonFile.writeJson;
    jsonFile.writeJSONSync = jsonFile.writeJsonSync;
    jsonFile.readJSON = jsonFile.readJson;
    jsonFile.readJSONSync = jsonFile.readJsonSync;
    module2.exports = jsonFile;
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/move/move.js
var require_move = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/move/move.js"(exports2, module2) {
    "use strict";
    var fs = require_graceful_fs();
    var path = require("path");
    var copy = require_copy2().copy;
    var remove = require_remove().remove;
    var mkdirp = require_mkdirs().mkdirp;
    var pathExists = require_path_exists().pathExists;
    var stat2 = require_stat();
    function move(src, dest, opts, cb) {
      if (typeof opts === "function") {
        cb = opts;
        opts = {};
      }
      opts = opts || {};
      const overwrite = opts.overwrite || opts.clobber || false;
      stat2.checkPaths(src, dest, "move", opts, (err2, stats) => {
        if (err2) return cb(err2);
        const { srcStat, isChangingCase = false } = stats;
        stat2.checkParentPaths(src, srcStat, dest, "move", (err3) => {
          if (err3) return cb(err3);
          if (isParentRoot(dest)) return doRename(src, dest, overwrite, isChangingCase, cb);
          mkdirp(path.dirname(dest), (err4) => {
            if (err4) return cb(err4);
            return doRename(src, dest, overwrite, isChangingCase, cb);
          });
        });
      });
    }
    function isParentRoot(dest) {
      const parent = path.dirname(dest);
      const parsedPath = path.parse(parent);
      return parsedPath.root === parent;
    }
    function doRename(src, dest, overwrite, isChangingCase, cb) {
      if (isChangingCase) return rename(src, dest, overwrite, cb);
      if (overwrite) {
        return remove(dest, (err2) => {
          if (err2) return cb(err2);
          return rename(src, dest, overwrite, cb);
        });
      }
      pathExists(dest, (err2, destExists) => {
        if (err2) return cb(err2);
        if (destExists) return cb(new Error("dest already exists."));
        return rename(src, dest, overwrite, cb);
      });
    }
    function rename(src, dest, overwrite, cb) {
      fs.rename(src, dest, (err2) => {
        if (!err2) return cb();
        if (err2.code !== "EXDEV") return cb(err2);
        return moveAcrossDevice(src, dest, overwrite, cb);
      });
    }
    function moveAcrossDevice(src, dest, overwrite, cb) {
      const opts = {
        overwrite,
        errorOnExist: true
      };
      copy(src, dest, opts, (err2) => {
        if (err2) return cb(err2);
        return remove(src, cb);
      });
    }
    module2.exports = move;
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/move/move-sync.js
var require_move_sync = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/move/move-sync.js"(exports2, module2) {
    "use strict";
    var fs = require_graceful_fs();
    var path = require("path");
    var copySync = require_copy2().copySync;
    var removeSync = require_remove().removeSync;
    var mkdirpSync = require_mkdirs().mkdirpSync;
    var stat2 = require_stat();
    function moveSync(src, dest, opts) {
      opts = opts || {};
      const overwrite = opts.overwrite || opts.clobber || false;
      const { srcStat, isChangingCase = false } = stat2.checkPathsSync(src, dest, "move", opts);
      stat2.checkParentPathsSync(src, srcStat, dest, "move");
      if (!isParentRoot(dest)) mkdirpSync(path.dirname(dest));
      return doRename(src, dest, overwrite, isChangingCase);
    }
    function isParentRoot(dest) {
      const parent = path.dirname(dest);
      const parsedPath = path.parse(parent);
      return parsedPath.root === parent;
    }
    function doRename(src, dest, overwrite, isChangingCase) {
      if (isChangingCase) return rename(src, dest, overwrite);
      if (overwrite) {
        removeSync(dest);
        return rename(src, dest, overwrite);
      }
      if (fs.existsSync(dest)) throw new Error("dest already exists.");
      return rename(src, dest, overwrite);
    }
    function rename(src, dest, overwrite) {
      try {
        fs.renameSync(src, dest);
      } catch (err2) {
        if (err2.code !== "EXDEV") throw err2;
        return moveAcrossDevice(src, dest, overwrite);
      }
    }
    function moveAcrossDevice(src, dest, overwrite) {
      const opts = {
        overwrite,
        errorOnExist: true
      };
      copySync(src, dest, opts);
      return removeSync(src);
    }
    module2.exports = moveSync;
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/move/index.js
var require_move2 = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/move/index.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromCallback;
    module2.exports = {
      move: u(require_move()),
      moveSync: require_move_sync()
    };
  }
});

// node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/index.js
var require_lib = __commonJS({
  "node_modules/.pnpm/fs-extra@10.1.0/node_modules/fs-extra/lib/index.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      // Export promiseified graceful-fs:
      ...require_fs(),
      // Export extra methods:
      ...require_copy2(),
      ...require_empty(),
      ...require_ensure(),
      ...require_json(),
      ...require_mkdirs(),
      ...require_move2(),
      ...require_output_file(),
      ...require_path_exists(),
      ...require_remove()
    };
  }
});

// node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/CancellationToken.js
var require_CancellationToken = __commonJS({
  "node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/CancellationToken.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CancellationError = exports2.CancellationToken = void 0;
    var events_1 = require("events");
    var CancellationToken = class extends events_1.EventEmitter {
      get cancelled() {
        return this._cancelled || this._parent != null && this._parent.cancelled;
      }
      set parent(value) {
        this.removeParentCancelHandler();
        this._parent = value;
        this.parentCancelHandler = () => this.cancel();
        this._parent.onCancel(this.parentCancelHandler);
      }
      // babel cannot compile ... correctly for super calls
      constructor(parent) {
        super();
        this.parentCancelHandler = null;
        this._parent = null;
        this._cancelled = false;
        if (parent != null) {
          this.parent = parent;
        }
      }
      cancel() {
        this._cancelled = true;
        this.emit("cancel");
      }
      onCancel(handler) {
        if (this.cancelled) {
          handler();
        } else {
          this.once("cancel", handler);
        }
      }
      createPromise(callback) {
        if (this.cancelled) {
          return Promise.reject(new CancellationError());
        }
        const finallyHandler = () => {
          if (cancelHandler != null) {
            try {
              this.removeListener("cancel", cancelHandler);
              cancelHandler = null;
            } catch (_ignore) {
            }
          }
        };
        let cancelHandler = null;
        return new Promise((resolve2, reject) => {
          let addedCancelHandler = null;
          cancelHandler = () => {
            try {
              if (addedCancelHandler != null) {
                addedCancelHandler();
                addedCancelHandler = null;
              }
            } finally {
              reject(new CancellationError());
            }
          };
          if (this.cancelled) {
            cancelHandler();
            return;
          }
          this.onCancel(cancelHandler);
          callback(resolve2, reject, (callback2) => {
            addedCancelHandler = callback2;
          });
        }).then((it) => {
          finallyHandler();
          return it;
        }).catch((e) => {
          finallyHandler();
          throw e;
        });
      }
      removeParentCancelHandler() {
        const parent = this._parent;
        if (parent != null && this.parentCancelHandler != null) {
          parent.removeListener("cancel", this.parentCancelHandler);
          this.parentCancelHandler = null;
        }
      }
      dispose() {
        try {
          this.removeParentCancelHandler();
        } finally {
          this.removeAllListeners();
          this._parent = null;
        }
      }
    };
    exports2.CancellationToken = CancellationToken;
    var CancellationError = class extends Error {
      constructor() {
        super("cancelled");
      }
    };
    exports2.CancellationError = CancellationError;
  }
});

// node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/error.js
var require_error = __commonJS({
  "node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/error.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.newError = newError;
    function newError(message, code) {
      const error = new Error(message);
      error.code = code;
      return error;
    }
  }
});

// node_modules/.pnpm/ms@2.1.3/node_modules/ms/index.js
var require_ms = __commonJS({
  "node_modules/.pnpm/ms@2.1.3/node_modules/ms/index.js"(exports2, module2) {
    var s = 1e3;
    var m = s * 60;
    var h = m * 60;
    var d = h * 24;
    var w = d * 7;
    var y = d * 365.25;
    module2.exports = function(val, options2) {
      options2 = options2 || {};
      var type = typeof val;
      if (type === "string" && val.length > 0) {
        return parse(val);
      } else if (type === "number" && isFinite(val)) {
        return options2.long ? fmtLong(val) : fmtShort(val);
      }
      throw new Error(
        "val is not a non-empty string or a valid number. val=" + JSON.stringify(val)
      );
    };
    function parse(str) {
      str = String(str);
      if (str.length > 100) {
        return;
      }
      var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
        str
      );
      if (!match) {
        return;
      }
      var n = parseFloat(match[1]);
      var type = (match[2] || "ms").toLowerCase();
      switch (type) {
        case "years":
        case "year":
        case "yrs":
        case "yr":
        case "y":
          return n * y;
        case "weeks":
        case "week":
        case "w":
          return n * w;
        case "days":
        case "day":
        case "d":
          return n * d;
        case "hours":
        case "hour":
        case "hrs":
        case "hr":
        case "h":
          return n * h;
        case "minutes":
        case "minute":
        case "mins":
        case "min":
        case "m":
          return n * m;
        case "seconds":
        case "second":
        case "secs":
        case "sec":
        case "s":
          return n * s;
        case "milliseconds":
        case "millisecond":
        case "msecs":
        case "msec":
        case "ms":
          return n;
        default:
          return void 0;
      }
    }
    function fmtShort(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return Math.round(ms / d) + "d";
      }
      if (msAbs >= h) {
        return Math.round(ms / h) + "h";
      }
      if (msAbs >= m) {
        return Math.round(ms / m) + "m";
      }
      if (msAbs >= s) {
        return Math.round(ms / s) + "s";
      }
      return ms + "ms";
    }
    function fmtLong(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return plural(ms, msAbs, d, "day");
      }
      if (msAbs >= h) {
        return plural(ms, msAbs, h, "hour");
      }
      if (msAbs >= m) {
        return plural(ms, msAbs, m, "minute");
      }
      if (msAbs >= s) {
        return plural(ms, msAbs, s, "second");
      }
      return ms + " ms";
    }
    function plural(ms, msAbs, n, name) {
      var isPlural = msAbs >= n * 1.5;
      return Math.round(ms / n) + " " + name + (isPlural ? "s" : "");
    }
  }
});

// node_modules/.pnpm/debug@4.4.3/node_modules/debug/src/common.js
var require_common = __commonJS({
  "node_modules/.pnpm/debug@4.4.3/node_modules/debug/src/common.js"(exports2, module2) {
    function setup(env) {
      createDebug.debug = createDebug;
      createDebug.default = createDebug;
      createDebug.coerce = coerce;
      createDebug.disable = disable;
      createDebug.enable = enable;
      createDebug.enabled = enabled;
      createDebug.humanize = require_ms();
      createDebug.destroy = destroy;
      Object.keys(env).forEach((key) => {
        createDebug[key] = env[key];
      });
      createDebug.names = [];
      createDebug.skips = [];
      createDebug.formatters = {};
      function selectColor(namespace) {
        let hash = 0;
        for (let i2 = 0; i2 < namespace.length; i2++) {
          hash = (hash << 5) - hash + namespace.charCodeAt(i2);
          hash |= 0;
        }
        return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
      }
      createDebug.selectColor = selectColor;
      function createDebug(namespace) {
        let prevTime;
        let enableOverride = null;
        let namespacesCache;
        let enabledCache;
        function debug(...args2) {
          if (!debug.enabled) {
            return;
          }
          const self2 = debug;
          const curr = Number(/* @__PURE__ */ new Date());
          const ms = curr - (prevTime || curr);
          self2.diff = ms;
          self2.prev = prevTime;
          self2.curr = curr;
          prevTime = curr;
          args2[0] = createDebug.coerce(args2[0]);
          if (typeof args2[0] !== "string") {
            args2.unshift("%O");
          }
          let index = 0;
          args2[0] = args2[0].replace(/%([a-zA-Z%])/g, (match, format) => {
            if (match === "%%") {
              return "%";
            }
            index++;
            const formatter = createDebug.formatters[format];
            if (typeof formatter === "function") {
              const val = args2[index];
              match = formatter.call(self2, val);
              args2.splice(index, 1);
              index--;
            }
            return match;
          });
          createDebug.formatArgs.call(self2, args2);
          const logFn = self2.log || createDebug.log;
          logFn.apply(self2, args2);
        }
        debug.namespace = namespace;
        debug.useColors = createDebug.useColors();
        debug.color = createDebug.selectColor(namespace);
        debug.extend = extend;
        debug.destroy = createDebug.destroy;
        Object.defineProperty(debug, "enabled", {
          enumerable: true,
          configurable: false,
          get: () => {
            if (enableOverride !== null) {
              return enableOverride;
            }
            if (namespacesCache !== createDebug.namespaces) {
              namespacesCache = createDebug.namespaces;
              enabledCache = createDebug.enabled(namespace);
            }
            return enabledCache;
          },
          set: (v) => {
            enableOverride = v;
          }
        });
        if (typeof createDebug.init === "function") {
          createDebug.init(debug);
        }
        return debug;
      }
      function extend(namespace, delimiter) {
        const newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
        newDebug.log = this.log;
        return newDebug;
      }
      function enable(namespaces) {
        createDebug.save(namespaces);
        createDebug.namespaces = namespaces;
        createDebug.names = [];
        createDebug.skips = [];
        const split = (typeof namespaces === "string" ? namespaces : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
        for (const ns of split) {
          if (ns[0] === "-") {
            createDebug.skips.push(ns.slice(1));
          } else {
            createDebug.names.push(ns);
          }
        }
      }
      function matchesTemplate(search, template) {
        let searchIndex = 0;
        let templateIndex = 0;
        let starIndex = -1;
        let matchIndex = 0;
        while (searchIndex < search.length) {
          if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === "*")) {
            if (template[templateIndex] === "*") {
              starIndex = templateIndex;
              matchIndex = searchIndex;
              templateIndex++;
            } else {
              searchIndex++;
              templateIndex++;
            }
          } else if (starIndex !== -1) {
            templateIndex = starIndex + 1;
            matchIndex++;
            searchIndex = matchIndex;
          } else {
            return false;
          }
        }
        while (templateIndex < template.length && template[templateIndex] === "*") {
          templateIndex++;
        }
        return templateIndex === template.length;
      }
      function disable() {
        const namespaces = [
          ...createDebug.names,
          ...createDebug.skips.map((namespace) => "-" + namespace)
        ].join(",");
        createDebug.enable("");
        return namespaces;
      }
      function enabled(name) {
        for (const skip of createDebug.skips) {
          if (matchesTemplate(name, skip)) {
            return false;
          }
        }
        for (const ns of createDebug.names) {
          if (matchesTemplate(name, ns)) {
            return true;
          }
        }
        return false;
      }
      function coerce(val) {
        if (val instanceof Error) {
          return val.stack || val.message;
        }
        return val;
      }
      function destroy() {
        console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
      }
      createDebug.enable(createDebug.load());
      return createDebug;
    }
    module2.exports = setup;
  }
});

// node_modules/.pnpm/debug@4.4.3/node_modules/debug/src/browser.js
var require_browser = __commonJS({
  "node_modules/.pnpm/debug@4.4.3/node_modules/debug/src/browser.js"(exports2, module2) {
    exports2.formatArgs = formatArgs;
    exports2.save = save;
    exports2.load = load;
    exports2.useColors = useColors;
    exports2.storage = localstorage();
    exports2.destroy = /* @__PURE__ */ (() => {
      let warned = false;
      return () => {
        if (!warned) {
          warned = true;
          console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
        }
      };
    })();
    exports2.colors = [
      "#0000CC",
      "#0000FF",
      "#0033CC",
      "#0033FF",
      "#0066CC",
      "#0066FF",
      "#0099CC",
      "#0099FF",
      "#00CC00",
      "#00CC33",
      "#00CC66",
      "#00CC99",
      "#00CCCC",
      "#00CCFF",
      "#3300CC",
      "#3300FF",
      "#3333CC",
      "#3333FF",
      "#3366CC",
      "#3366FF",
      "#3399CC",
      "#3399FF",
      "#33CC00",
      "#33CC33",
      "#33CC66",
      "#33CC99",
      "#33CCCC",
      "#33CCFF",
      "#6600CC",
      "#6600FF",
      "#6633CC",
      "#6633FF",
      "#66CC00",
      "#66CC33",
      "#9900CC",
      "#9900FF",
      "#9933CC",
      "#9933FF",
      "#99CC00",
      "#99CC33",
      "#CC0000",
      "#CC0033",
      "#CC0066",
      "#CC0099",
      "#CC00CC",
      "#CC00FF",
      "#CC3300",
      "#CC3333",
      "#CC3366",
      "#CC3399",
      "#CC33CC",
      "#CC33FF",
      "#CC6600",
      "#CC6633",
      "#CC9900",
      "#CC9933",
      "#CCCC00",
      "#CCCC33",
      "#FF0000",
      "#FF0033",
      "#FF0066",
      "#FF0099",
      "#FF00CC",
      "#FF00FF",
      "#FF3300",
      "#FF3333",
      "#FF3366",
      "#FF3399",
      "#FF33CC",
      "#FF33FF",
      "#FF6600",
      "#FF6633",
      "#FF9900",
      "#FF9933",
      "#FFCC00",
      "#FFCC33"
    ];
    function useColors() {
      if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) {
        return true;
      }
      if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
        return false;
      }
      let m;
      return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
      typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator !== "undefined" && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
      typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    function formatArgs(args2) {
      args2[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args2[0] + (this.useColors ? "%c " : " ") + "+" + module2.exports.humanize(this.diff);
      if (!this.useColors) {
        return;
      }
      const c = "color: " + this.color;
      args2.splice(1, 0, c, "color: inherit");
      let index = 0;
      let lastC = 0;
      args2[0].replace(/%[a-zA-Z%]/g, (match) => {
        if (match === "%%") {
          return;
        }
        index++;
        if (match === "%c") {
          lastC = index;
        }
      });
      args2.splice(lastC, 0, c);
    }
    exports2.log = console.debug || console.log || (() => {
    });
    function save(namespaces) {
      try {
        if (namespaces) {
          exports2.storage.setItem("debug", namespaces);
        } else {
          exports2.storage.removeItem("debug");
        }
      } catch (error) {
      }
    }
    function load() {
      let r;
      try {
        r = exports2.storage.getItem("debug") || exports2.storage.getItem("DEBUG");
      } catch (error) {
      }
      if (!r && typeof process !== "undefined" && "env" in process) {
        r = process.env.DEBUG;
      }
      return r;
    }
    function localstorage() {
      try {
        return localStorage;
      } catch (error) {
      }
    }
    module2.exports = require_common()(exports2);
    var { formatters } = module2.exports;
    formatters.j = function(v) {
      try {
        return JSON.stringify(v);
      } catch (error) {
        return "[UnexpectedJSONParseError]: " + error.message;
      }
    };
  }
});

// node_modules/.pnpm/has-flag@4.0.0/node_modules/has-flag/index.js
var require_has_flag = __commonJS({
  "node_modules/.pnpm/has-flag@4.0.0/node_modules/has-flag/index.js"(exports2, module2) {
    "use strict";
    module2.exports = (flag, argv = process.argv) => {
      const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
      const position = argv.indexOf(prefix + flag);
      const terminatorPosition = argv.indexOf("--");
      return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
    };
  }
});

// node_modules/.pnpm/supports-color@7.2.0/node_modules/supports-color/index.js
var require_supports_color = __commonJS({
  "node_modules/.pnpm/supports-color@7.2.0/node_modules/supports-color/index.js"(exports2, module2) {
    "use strict";
    var os = require("os");
    var tty = require("tty");
    var hasFlag = require_has_flag();
    var { env } = process;
    var forceColor;
    if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) {
      forceColor = 0;
    } else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) {
      forceColor = 1;
    }
    if ("FORCE_COLOR" in env) {
      if (env.FORCE_COLOR === "true") {
        forceColor = 1;
      } else if (env.FORCE_COLOR === "false") {
        forceColor = 0;
      } else {
        forceColor = env.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(env.FORCE_COLOR, 10), 3);
      }
    }
    function translateLevel(level) {
      if (level === 0) {
        return false;
      }
      return {
        level,
        hasBasic: true,
        has256: level >= 2,
        has16m: level >= 3
      };
    }
    function supportsColor(haveStream, streamIsTTY) {
      if (forceColor === 0) {
        return 0;
      }
      if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) {
        return 3;
      }
      if (hasFlag("color=256")) {
        return 2;
      }
      if (haveStream && !streamIsTTY && forceColor === void 0) {
        return 0;
      }
      const min = forceColor || 0;
      if (env.TERM === "dumb") {
        return min;
      }
      if (process.platform === "win32") {
        const osRelease = os.release().split(".");
        if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
          return Number(osRelease[2]) >= 14931 ? 3 : 2;
        }
        return 1;
      }
      if ("CI" in env) {
        if (["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE"].some((sign) => sign in env) || env.CI_NAME === "codeship") {
          return 1;
        }
        return min;
      }
      if ("TEAMCITY_VERSION" in env) {
        return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
      }
      if (env.COLORTERM === "truecolor") {
        return 3;
      }
      if ("TERM_PROGRAM" in env) {
        const version = parseInt((env.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
        switch (env.TERM_PROGRAM) {
          case "iTerm.app":
            return version >= 3 ? 3 : 2;
          case "Apple_Terminal":
            return 2;
        }
      }
      if (/-256(color)?$/i.test(env.TERM)) {
        return 2;
      }
      if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
        return 1;
      }
      if ("COLORTERM" in env) {
        return 1;
      }
      return min;
    }
    function getSupportLevel(stream) {
      const level = supportsColor(stream, stream && stream.isTTY);
      return translateLevel(level);
    }
    module2.exports = {
      supportsColor: getSupportLevel,
      stdout: translateLevel(supportsColor(true, tty.isatty(1))),
      stderr: translateLevel(supportsColor(true, tty.isatty(2)))
    };
  }
});

// node_modules/.pnpm/debug@4.4.3/node_modules/debug/src/node.js
var require_node = __commonJS({
  "node_modules/.pnpm/debug@4.4.3/node_modules/debug/src/node.js"(exports2, module2) {
    var tty = require("tty");
    var util = require("util");
    exports2.init = init2;
    exports2.log = log;
    exports2.formatArgs = formatArgs;
    exports2.save = save;
    exports2.load = load;
    exports2.useColors = useColors;
    exports2.destroy = util.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    );
    exports2.colors = [6, 2, 3, 4, 5, 1];
    try {
      const supportsColor = require_supports_color();
      if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) {
        exports2.colors = [
          20,
          21,
          26,
          27,
          32,
          33,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          56,
          57,
          62,
          63,
          68,
          69,
          74,
          75,
          76,
          77,
          78,
          79,
          80,
          81,
          92,
          93,
          98,
          99,
          112,
          113,
          128,
          129,
          134,
          135,
          148,
          149,
          160,
          161,
          162,
          163,
          164,
          165,
          166,
          167,
          168,
          169,
          170,
          171,
          172,
          173,
          178,
          179,
          184,
          185,
          196,
          197,
          198,
          199,
          200,
          201,
          202,
          203,
          204,
          205,
          206,
          207,
          208,
          209,
          214,
          215,
          220,
          221
        ];
      }
    } catch (error) {
    }
    exports2.inspectOpts = Object.keys(process.env).filter((key) => {
      return /^debug_/i.test(key);
    }).reduce((obj, key) => {
      const prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, (_, k) => {
        return k.toUpperCase();
      });
      let val = process.env[key];
      if (/^(yes|on|true|enabled)$/i.test(val)) {
        val = true;
      } else if (/^(no|off|false|disabled)$/i.test(val)) {
        val = false;
      } else if (val === "null") {
        val = null;
      } else {
        val = Number(val);
      }
      obj[prop] = val;
      return obj;
    }, {});
    function useColors() {
      return "colors" in exports2.inspectOpts ? Boolean(exports2.inspectOpts.colors) : tty.isatty(process.stderr.fd);
    }
    function formatArgs(args2) {
      const { namespace: name, useColors: useColors2 } = this;
      if (useColors2) {
        const c = this.color;
        const colorCode = "\x1B[3" + (c < 8 ? c : "8;5;" + c);
        const prefix = `  ${colorCode};1m${name} \x1B[0m`;
        args2[0] = prefix + args2[0].split("\n").join("\n" + prefix);
        args2.push(colorCode + "m+" + module2.exports.humanize(this.diff) + "\x1B[0m");
      } else {
        args2[0] = getDate() + name + " " + args2[0];
      }
    }
    function getDate() {
      if (exports2.inspectOpts.hideDate) {
        return "";
      }
      return (/* @__PURE__ */ new Date()).toISOString() + " ";
    }
    function log(...args2) {
      return process.stderr.write(util.formatWithOptions(exports2.inspectOpts, ...args2) + "\n");
    }
    function save(namespaces) {
      if (namespaces) {
        process.env.DEBUG = namespaces;
      } else {
        delete process.env.DEBUG;
      }
    }
    function load() {
      return process.env.DEBUG;
    }
    function init2(debug) {
      debug.inspectOpts = {};
      const keys = Object.keys(exports2.inspectOpts);
      for (let i2 = 0; i2 < keys.length; i2++) {
        debug.inspectOpts[keys[i2]] = exports2.inspectOpts[keys[i2]];
      }
    }
    module2.exports = require_common()(exports2);
    var { formatters } = module2.exports;
    formatters.o = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts).split("\n").map((str) => str.trim()).join(" ");
    };
    formatters.O = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts);
    };
  }
});

// node_modules/.pnpm/debug@4.4.3/node_modules/debug/src/index.js
var require_src = __commonJS({
  "node_modules/.pnpm/debug@4.4.3/node_modules/debug/src/index.js"(exports2, module2) {
    if (typeof process === "undefined" || process.type === "renderer" || process.browser === true || process.__nwjs) {
      module2.exports = require_browser();
    } else {
      module2.exports = require_node();
    }
  }
});

// node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/ProgressCallbackTransform.js
var require_ProgressCallbackTransform = __commonJS({
  "node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/ProgressCallbackTransform.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ProgressCallbackTransform = void 0;
    var stream_1 = require("stream");
    var ProgressCallbackTransform = class extends stream_1.Transform {
      constructor(total, cancellationToken, onProgress) {
        super();
        this.total = total;
        this.cancellationToken = cancellationToken;
        this.onProgress = onProgress;
        this.start = Date.now();
        this.transferred = 0;
        this.delta = 0;
        this.nextUpdate = this.start + 1e3;
      }
      _transform(chunk, encoding, callback) {
        if (this.cancellationToken.cancelled) {
          callback(new Error("cancelled"), null);
          return;
        }
        this.transferred += chunk.length;
        this.delta += chunk.length;
        const now = Date.now();
        if (now >= this.nextUpdate && this.transferred !== this.total) {
          this.nextUpdate = now + 1e3;
          this.onProgress({
            total: this.total,
            delta: this.delta,
            transferred: this.transferred,
            percent: this.transferred / this.total * 100,
            bytesPerSecond: Math.round(this.transferred / ((now - this.start) / 1e3))
          });
          this.delta = 0;
        }
        callback(null, chunk);
      }
      _flush(callback) {
        if (this.cancellationToken.cancelled) {
          callback(new Error("cancelled"));
          return;
        }
        this.onProgress({
          total: this.total,
          delta: this.delta,
          transferred: this.total,
          percent: 100,
          bytesPerSecond: Math.round(this.transferred / ((Date.now() - this.start) / 1e3))
        });
        this.delta = 0;
        callback(null);
      }
    };
    exports2.ProgressCallbackTransform = ProgressCallbackTransform;
  }
});

// node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/httpExecutor.js
var require_httpExecutor = __commonJS({
  "node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/httpExecutor.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DigestTransform = exports2.HttpExecutor = exports2.HttpError = void 0;
    exports2.createHttpError = createHttpError;
    exports2.parseJson = parseJson;
    exports2.configureRequestOptionsFromUrl = configureRequestOptionsFromUrl;
    exports2.configureRequestUrl = configureRequestUrl;
    exports2.safeGetHeader = safeGetHeader;
    exports2.configureRequestOptions = configureRequestOptions;
    exports2.safeStringifyJson = safeStringifyJson;
    var crypto_1 = require("crypto");
    var debug_1 = require_src();
    var fs_1 = require("fs");
    var stream_1 = require("stream");
    var url_1 = require("url");
    var CancellationToken_1 = require_CancellationToken();
    var error_1 = require_error();
    var ProgressCallbackTransform_1 = require_ProgressCallbackTransform();
    var debug = (0, debug_1.default)("electron-builder");
    function createHttpError(response, description = null) {
      return new HttpError(response.statusCode || -1, `${response.statusCode} ${response.statusMessage}` + (description == null ? "" : "\n" + JSON.stringify(description, null, "  ")) + "\nHeaders: " + safeStringifyJson(response.headers), description);
    }
    var HTTP_STATUS_CODES = /* @__PURE__ */ new Map([
      [429, "Too many requests"],
      [400, "Bad request"],
      [403, "Forbidden"],
      [404, "Not found"],
      [405, "Method not allowed"],
      [406, "Not acceptable"],
      [408, "Request timeout"],
      [413, "Request entity too large"],
      [500, "Internal server error"],
      [502, "Bad gateway"],
      [503, "Service unavailable"],
      [504, "Gateway timeout"],
      [505, "HTTP version not supported"]
    ]);
    var HttpError = class extends Error {
      constructor(statusCode, message = `HTTP error: ${HTTP_STATUS_CODES.get(statusCode) || statusCode}`, description = null) {
        super(message);
        this.statusCode = statusCode;
        this.description = description;
        this.name = "HttpError";
        this.code = `HTTP_ERROR_${statusCode}`;
      }
      isServerError() {
        return this.statusCode >= 500 && this.statusCode <= 599;
      }
    };
    exports2.HttpError = HttpError;
    function parseJson(result) {
      return result.then((it) => it == null || it.length === 0 ? null : JSON.parse(it));
    }
    var HttpExecutor = class _HttpExecutor {
      constructor() {
        this.maxRedirects = 10;
      }
      request(options2, cancellationToken = new CancellationToken_1.CancellationToken(), data) {
        configureRequestOptions(options2);
        const json = data == null ? void 0 : JSON.stringify(data);
        const encodedData = json ? Buffer.from(json) : void 0;
        if (encodedData != null) {
          debug(json);
          const { headers, ...opts } = options2;
          options2 = {
            method: "post",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": encodedData.length,
              ...headers
            },
            ...opts
          };
        }
        return this.doApiRequest(options2, cancellationToken, (it) => it.end(encodedData));
      }
      doApiRequest(options2, cancellationToken, requestProcessor, redirectCount = 0) {
        if (debug.enabled) {
          debug(`Request: ${safeStringifyJson(options2)}`);
        }
        return cancellationToken.createPromise((resolve2, reject, onCancel) => {
          const request = this.createRequest(options2, (response) => {
            try {
              this.handleResponse(response, options2, cancellationToken, resolve2, reject, redirectCount, requestProcessor);
            } catch (e) {
              reject(e);
            }
          });
          this.addErrorAndTimeoutHandlers(request, reject, options2.timeout);
          this.addRedirectHandlers(request, options2, reject, redirectCount, (options3) => {
            this.doApiRequest(options3, cancellationToken, requestProcessor, redirectCount).then(resolve2).catch(reject);
          });
          requestProcessor(request, reject);
          onCancel(() => request.abort());
        });
      }
      // noinspection JSUnusedLocalSymbols
      // eslint-disable-next-line
      addRedirectHandlers(request, options2, reject, redirectCount, handler) {
      }
      addErrorAndTimeoutHandlers(request, reject, timeout = 60 * 1e3) {
        this.addTimeOutHandler(request, reject, timeout);
        request.on("error", reject);
        request.on("aborted", () => {
          reject(new Error("Request has been aborted by the server"));
        });
      }
      handleResponse(response, options2, cancellationToken, resolve2, reject, redirectCount, requestProcessor) {
        var _a2;
        if (debug.enabled) {
          debug(`Response: ${response.statusCode} ${response.statusMessage}, request options: ${safeStringifyJson(options2)}`);
        }
        if (response.statusCode === 404) {
          reject(createHttpError(response, `method: ${options2.method || "GET"} url: ${options2.protocol || "https:"}//${options2.hostname}${options2.port ? `:${options2.port}` : ""}${options2.path}

Please double check that your authentication token is correct. Due to security reasons, actual status maybe not reported, but 404.
`));
          return;
        } else if (response.statusCode === 204) {
          resolve2();
          return;
        }
        const code = (_a2 = response.statusCode) !== null && _a2 !== void 0 ? _a2 : 0;
        const shouldRedirect = code >= 300 && code < 400;
        const redirectUrl = safeGetHeader(response, "location");
        if (shouldRedirect && redirectUrl != null) {
          if (redirectCount > this.maxRedirects) {
            reject(this.createMaxRedirectError());
            return;
          }
          this.doApiRequest(_HttpExecutor.prepareRedirectUrlOptions(redirectUrl, options2), cancellationToken, requestProcessor, redirectCount).then(resolve2).catch(reject);
          return;
        }
        response.setEncoding("utf8");
        let data = "";
        response.on("error", reject);
        response.on("data", (chunk) => data += chunk);
        response.on("end", () => {
          try {
            if (response.statusCode != null && response.statusCode >= 400) {
              const contentType = safeGetHeader(response, "content-type");
              const isJson = contentType != null && (Array.isArray(contentType) ? contentType.find((it) => it.includes("json")) != null : contentType.includes("json"));
              reject(createHttpError(response, `method: ${options2.method || "GET"} url: ${options2.protocol || "https:"}//${options2.hostname}${options2.port ? `:${options2.port}` : ""}${options2.path}

          Data:
          ${isJson ? JSON.stringify(JSON.parse(data)) : data}
          `));
            } else {
              resolve2(data.length === 0 ? null : data);
            }
          } catch (e) {
            reject(e);
          }
        });
      }
      async downloadToBuffer(url, options2) {
        return await options2.cancellationToken.createPromise((resolve2, reject, onCancel) => {
          const responseChunks = [];
          const requestOptions = {
            headers: options2.headers || void 0,
            // because PrivateGitHubProvider requires HttpExecutor.prepareRedirectUrlOptions logic, so, we need to redirect manually
            redirect: "manual"
          };
          configureRequestUrl(url, requestOptions);
          configureRequestOptions(requestOptions);
          this.doDownload(requestOptions, {
            destination: null,
            options: options2,
            onCancel,
            callback: (error) => {
              if (error == null) {
                resolve2(Buffer.concat(responseChunks));
              } else {
                reject(error);
              }
            },
            responseHandler: (response, callback) => {
              let receivedLength = 0;
              response.on("data", (chunk) => {
                receivedLength += chunk.length;
                if (receivedLength > 524288e3) {
                  callback(new Error("Maximum allowed size is 500 MB"));
                  return;
                }
                responseChunks.push(chunk);
              });
              response.on("end", () => {
                callback(null);
              });
            }
          }, 0);
        });
      }
      doDownload(requestOptions, options2, redirectCount) {
        const request = this.createRequest(requestOptions, (response) => {
          if (response.statusCode >= 400) {
            options2.callback(new Error(`Cannot download "${requestOptions.protocol || "https:"}//${requestOptions.hostname}${requestOptions.path}", status ${response.statusCode}: ${response.statusMessage}`));
            return;
          }
          response.on("error", options2.callback);
          const redirectUrl = safeGetHeader(response, "location");
          if (redirectUrl != null) {
            if (redirectCount < this.maxRedirects) {
              this.doDownload(_HttpExecutor.prepareRedirectUrlOptions(redirectUrl, requestOptions), options2, redirectCount++);
            } else {
              options2.callback(this.createMaxRedirectError());
            }
            return;
          }
          if (options2.responseHandler == null) {
            configurePipes(options2, response);
          } else {
            options2.responseHandler(response, options2.callback);
          }
        });
        this.addErrorAndTimeoutHandlers(request, options2.callback, requestOptions.timeout);
        this.addRedirectHandlers(request, requestOptions, options2.callback, redirectCount, (requestOptions2) => {
          this.doDownload(requestOptions2, options2, redirectCount++);
        });
        request.end();
      }
      createMaxRedirectError() {
        return new Error(`Too many redirects (> ${this.maxRedirects})`);
      }
      addTimeOutHandler(request, callback, timeout) {
        request.on("socket", (socket) => {
          socket.setTimeout(timeout, () => {
            request.abort();
            callback(new Error("Request timed out"));
          });
        });
      }
      static prepareRedirectUrlOptions(redirectUrl, options2) {
        const newOptions = configureRequestOptionsFromUrl(redirectUrl, { ...options2 });
        const headers = newOptions.headers;
        if (headers === null || headers === void 0 ? void 0 : headers.authorization) {
          const originalUrl = _HttpExecutor.reconstructOriginalUrl(options2);
          const parsedRedirectUrl = parseUrl(redirectUrl, options2);
          if (_HttpExecutor.isCrossOriginRedirect(originalUrl, parsedRedirectUrl)) {
            if (debug.enabled) {
              debug(`Given the cross-origin redirect (from ${originalUrl.host} to ${parsedRedirectUrl.host}), the Authorization header will be stripped out.`);
            }
            delete headers.authorization;
          }
        }
        return newOptions;
      }
      static reconstructOriginalUrl(options2) {
        const protocol3 = options2.protocol || "https:";
        if (!options2.hostname) {
          throw new Error("Missing hostname in request options");
        }
        const hostname = options2.hostname;
        const port = options2.port ? `:${options2.port}` : "";
        const path = options2.path || "/";
        return new url_1.URL(`${protocol3}//${hostname}${port}${path}`);
      }
      static isCrossOriginRedirect(originalUrl, redirectUrl) {
        if (originalUrl.hostname.toLowerCase() !== redirectUrl.hostname.toLowerCase()) {
          return true;
        }
        if (originalUrl.protocol === "http:" && // This can be replaced with `!originalUrl.port`, but for the sake of clarity.
        ["80", ""].includes(originalUrl.port) && redirectUrl.protocol === "https:" && // This can be replaced with `!redirectUrl.port`, but for the sake of clarity.
        ["443", ""].includes(redirectUrl.port)) {
          return false;
        }
        if (originalUrl.protocol !== redirectUrl.protocol) {
          return true;
        }
        const originalPort = originalUrl.port;
        const redirectPort = redirectUrl.port;
        return originalPort !== redirectPort;
      }
      static retryOnServerError(task, maxRetries = 3) {
        for (let attemptNumber = 0; ; attemptNumber++) {
          try {
            return task();
          } catch (e) {
            if (attemptNumber < maxRetries && (e instanceof HttpError && e.isServerError() || e.code === "EPIPE")) {
              continue;
            }
            throw e;
          }
        }
      }
    };
    exports2.HttpExecutor = HttpExecutor;
    function parseUrl(url, options2) {
      try {
        return new url_1.URL(url);
      } catch {
        const hostname = options2.hostname;
        const protocol3 = options2.protocol || "https:";
        const port = options2.port ? `:${options2.port}` : "";
        const baseUrl = `${protocol3}//${hostname}${port}`;
        return new url_1.URL(url, baseUrl);
      }
    }
    function configureRequestOptionsFromUrl(url, options2) {
      const result = configureRequestOptions(options2);
      const parsedUrl = parseUrl(url, options2);
      configureRequestUrl(parsedUrl, result);
      return result;
    }
    function configureRequestUrl(url, options2) {
      options2.protocol = url.protocol;
      options2.hostname = url.hostname;
      if (url.port) {
        options2.port = url.port;
      } else if (options2.port) {
        delete options2.port;
      }
      options2.path = url.pathname + url.search;
    }
    var DigestTransform = class extends stream_1.Transform {
      // noinspection JSUnusedGlobalSymbols
      get actual() {
        return this._actual;
      }
      constructor(expected, algorithm = "sha512", encoding = "base64") {
        super();
        this.expected = expected;
        this.algorithm = algorithm;
        this.encoding = encoding;
        this._actual = null;
        this.isValidateOnEnd = true;
        this.digester = (0, crypto_1.createHash)(algorithm);
      }
      // noinspection JSUnusedGlobalSymbols
      _transform(chunk, encoding, callback) {
        this.digester.update(chunk);
        callback(null, chunk);
      }
      // noinspection JSUnusedGlobalSymbols
      _flush(callback) {
        this._actual = this.digester.digest(this.encoding);
        if (this.isValidateOnEnd) {
          try {
            this.validate();
          } catch (e) {
            callback(e);
            return;
          }
        }
        callback(null);
      }
      validate() {
        if (this._actual == null) {
          throw (0, error_1.newError)("Not finished yet", "ERR_STREAM_NOT_FINISHED");
        }
        if (this._actual !== this.expected) {
          throw (0, error_1.newError)(`${this.algorithm} checksum mismatch, expected ${this.expected}, got ${this._actual}`, "ERR_CHECKSUM_MISMATCH");
        }
        return null;
      }
    };
    exports2.DigestTransform = DigestTransform;
    function checkSha2(sha2Header, sha2, callback) {
      if (sha2Header != null && sha2 != null && sha2Header !== sha2) {
        callback(new Error(`checksum mismatch: expected ${sha2} but got ${sha2Header} (X-Checksum-Sha2 header)`));
        return false;
      }
      return true;
    }
    function safeGetHeader(response, headerKey) {
      const value = response.headers[headerKey];
      if (value == null) {
        return null;
      } else if (Array.isArray(value)) {
        return value.length === 0 ? null : value[value.length - 1];
      } else {
        return value;
      }
    }
    function configurePipes(options2, response) {
      if (!checkSha2(safeGetHeader(response, "X-Checksum-Sha2"), options2.options.sha2, options2.callback)) {
        return;
      }
      const streams = [];
      if (options2.options.onProgress != null) {
        const contentLength = safeGetHeader(response, "content-length");
        if (contentLength != null) {
          streams.push(new ProgressCallbackTransform_1.ProgressCallbackTransform(parseInt(contentLength, 10), options2.options.cancellationToken, options2.options.onProgress));
        }
      }
      const sha512 = options2.options.sha512;
      if (sha512 != null) {
        streams.push(new DigestTransform(sha512, "sha512", sha512.length === 128 && !sha512.includes("+") && !sha512.includes("Z") && !sha512.includes("=") ? "hex" : "base64"));
      } else if (options2.options.sha2 != null) {
        streams.push(new DigestTransform(options2.options.sha2, "sha256", "hex"));
      }
      const fileOut = (0, fs_1.createWriteStream)(options2.destination);
      streams.push(fileOut);
      let lastStream = response;
      for (const stream of streams) {
        stream.on("error", (error) => {
          fileOut.close();
          if (!options2.options.cancellationToken.cancelled) {
            options2.callback(error);
          }
        });
        lastStream = lastStream.pipe(stream);
      }
      fileOut.on("finish", () => {
        ;
        fileOut.close(options2.callback);
      });
    }
    function configureRequestOptions(options2, token, method) {
      if (method != null) {
        options2.method = method;
      }
      options2.headers = { ...options2.headers };
      const headers = options2.headers;
      if (token != null) {
        ;
        headers.authorization = token.startsWith("Basic") || token.startsWith("Bearer") ? token : `token ${token}`;
      }
      if (headers["User-Agent"] == null) {
        headers["User-Agent"] = "electron-builder";
      }
      if (method == null || method === "GET" || headers["Cache-Control"] == null) {
        headers["Cache-Control"] = "no-cache";
      }
      if (options2.protocol == null && process.versions.electron != null) {
        options2.protocol = "https:";
      }
      return options2;
    }
    function safeStringifyJson(data, skippedNames) {
      return JSON.stringify(data, (name, value) => {
        if (name.endsWith("Authorization") || name.endsWith("authorization") || name.endsWith("Password") || name.endsWith("PASSWORD") || name.endsWith("Token") || name.includes("password") || name.includes("token") || skippedNames != null && skippedNames.has(name)) {
          return "<stripped sensitive data>";
        }
        return value;
      }, 2);
    }
  }
});

// node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/MemoLazy.js
var require_MemoLazy = __commonJS({
  "node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/MemoLazy.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MemoLazy = void 0;
    var MemoLazy = class {
      constructor(selector, creator) {
        this.selector = selector;
        this.creator = creator;
        this.selected = void 0;
        this._value = void 0;
      }
      get hasValue() {
        return this._value !== void 0;
      }
      get value() {
        const selected = this.selector();
        if (this._value !== void 0 && equals(this.selected, selected)) {
          return this._value;
        }
        this.selected = selected;
        const result = this.creator(selected);
        this.value = result;
        return result;
      }
      set value(value) {
        this._value = value;
      }
    };
    exports2.MemoLazy = MemoLazy;
    function equals(firstValue, secondValue) {
      const isFirstObject = typeof firstValue === "object" && firstValue !== null;
      const isSecondObject = typeof secondValue === "object" && secondValue !== null;
      if (isFirstObject && isSecondObject) {
        const keys1 = Object.keys(firstValue);
        const keys2 = Object.keys(secondValue);
        return keys1.length === keys2.length && keys1.every((key) => equals(firstValue[key], secondValue[key]));
      }
      return firstValue === secondValue;
    }
  }
});

// node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/publishOptions.js
var require_publishOptions = __commonJS({
  "node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/publishOptions.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.githubUrl = githubUrl;
    exports2.githubTagPrefix = githubTagPrefix;
    exports2.getS3LikeProviderBaseUrl = getS3LikeProviderBaseUrl;
    function githubUrl(options2, defaultHost = "github.com") {
      return `${options2.protocol || "https"}://${options2.host || defaultHost}`;
    }
    function githubTagPrefix(options2) {
      var _a2;
      if (options2.tagNamePrefix) {
        return options2.tagNamePrefix;
      }
      if ((_a2 = options2.vPrefixedTagName) !== null && _a2 !== void 0 ? _a2 : true) {
        return "v";
      }
      return "";
    }
    function getS3LikeProviderBaseUrl(configuration) {
      const provider = configuration.provider;
      if (provider === "s3") {
        return s3Url(configuration);
      }
      if (provider === "spaces") {
        return spacesUrl(configuration);
      }
      throw new Error(`Not supported provider: ${provider}`);
    }
    function s3Url(options2) {
      let url;
      if (options2.accelerate == true) {
        url = `https://${options2.bucket}.s3-accelerate.amazonaws.com`;
      } else if (options2.endpoint != null) {
        url = `${options2.endpoint}/${options2.bucket}`;
      } else if (options2.bucket.includes(".")) {
        if (options2.region == null) {
          throw new Error(`Bucket name "${options2.bucket}" includes a dot, but S3 region is missing`);
        }
        if (options2.region === "us-east-1") {
          url = `https://s3.amazonaws.com/${options2.bucket}`;
        } else {
          url = `https://s3-${options2.region}.amazonaws.com/${options2.bucket}`;
        }
      } else if (options2.region === "cn-north-1") {
        url = `https://${options2.bucket}.s3.${options2.region}.amazonaws.com.cn`;
      } else {
        url = `https://${options2.bucket}.s3.amazonaws.com`;
      }
      return appendPath(url, options2.path);
    }
    function appendPath(url, p) {
      if (p != null && p.length > 0) {
        if (!p.startsWith("/")) {
          url += "/";
        }
        url += p;
      }
      return url;
    }
    function spacesUrl(options2) {
      if (options2.name == null) {
        throw new Error(`name is missing`);
      }
      if (options2.region == null) {
        throw new Error(`region is missing`);
      }
      return appendPath(`https://${options2.name}.${options2.region}.digitaloceanspaces.com`, options2.path);
    }
  }
});

// node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/retry.js
var require_retry = __commonJS({
  "node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/retry.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.retry = retry;
    var CancellationToken_1 = require_CancellationToken();
    async function retry(task, options2) {
      var _a2;
      const { retries: retryCount, interval, backoff = 0, attempt = 0, shouldRetry, cancellationToken = new CancellationToken_1.CancellationToken() } = options2;
      try {
        return await task();
      } catch (error) {
        if (await Promise.resolve((_a2 = shouldRetry === null || shouldRetry === void 0 ? void 0 : shouldRetry(error)) !== null && _a2 !== void 0 ? _a2 : true) && retryCount > 0 && !cancellationToken.cancelled) {
          await new Promise((resolve2) => setTimeout(resolve2, interval + backoff * attempt));
          return await retry(task, { ...options2, retries: retryCount - 1, attempt: attempt + 1 });
        } else {
          throw error;
        }
      }
    }
  }
});

// node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/rfc2253Parser.js
var require_rfc2253Parser = __commonJS({
  "node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/rfc2253Parser.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.parseDn = parseDn;
    function parseDn(seq) {
      let quoted = false;
      let key = null;
      let token = "";
      let nextNonSpace = 0;
      seq = seq.trim();
      const result = /* @__PURE__ */ new Map();
      for (let i2 = 0; i2 <= seq.length; i2++) {
        if (i2 === seq.length) {
          if (key !== null) {
            result.set(key, token);
          }
          break;
        }
        const ch2 = seq[i2];
        if (quoted) {
          if (ch2 === '"') {
            quoted = false;
            continue;
          }
        } else {
          if (ch2 === '"') {
            quoted = true;
            continue;
          }
          if (ch2 === "\\") {
            i2++;
            const ord = parseInt(seq.slice(i2, i2 + 2), 16);
            if (Number.isNaN(ord)) {
              token += seq[i2];
            } else {
              i2++;
              token += String.fromCharCode(ord);
            }
            continue;
          }
          if (key === null && ch2 === "=") {
            key = token;
            token = "";
            continue;
          }
          if (ch2 === "," || ch2 === ";" || ch2 === "+") {
            if (key !== null) {
              result.set(key, token);
            }
            key = null;
            token = "";
            continue;
          }
        }
        if (ch2 === " " && !quoted) {
          if (token.length === 0) {
            continue;
          }
          if (i2 > nextNonSpace) {
            let j = i2;
            while (seq[j] === " ") {
              j++;
            }
            nextNonSpace = j;
          }
          if (nextNonSpace >= seq.length || seq[nextNonSpace] === "," || seq[nextNonSpace] === ";" || key === null && seq[nextNonSpace] === "=" || key !== null && seq[nextNonSpace] === "+") {
            i2 = nextNonSpace - 1;
            continue;
          }
        }
        token += ch2;
      }
      return result;
    }
  }
});

// node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/uuid.js
var require_uuid = __commonJS({
  "node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/uuid.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.nil = exports2.UUID = void 0;
    var crypto_1 = require("crypto");
    var error_1 = require_error();
    var invalidName = "options.name must be either a string or a Buffer";
    var randomHost = (0, crypto_1.randomBytes)(16);
    randomHost[0] = randomHost[0] | 1;
    var hex2byte = {};
    var byte2hex = [];
    for (let i2 = 0; i2 < 256; i2++) {
      const hex = (i2 + 256).toString(16).substr(1);
      hex2byte[hex] = i2;
      byte2hex[i2] = hex;
    }
    var UUID = class _UUID {
      constructor(uuid) {
        this.ascii = null;
        this.binary = null;
        const check = _UUID.check(uuid);
        if (!check) {
          throw new Error("not a UUID");
        }
        this.version = check.version;
        if (check.format === "ascii") {
          this.ascii = uuid;
        } else {
          this.binary = uuid;
        }
      }
      static v5(name, namespace) {
        return uuidNamed(name, "sha1", 80, namespace);
      }
      toString() {
        if (this.ascii == null) {
          this.ascii = stringify(this.binary);
        }
        return this.ascii;
      }
      inspect() {
        return `UUID v${this.version} ${this.toString()}`;
      }
      static check(uuid, offset = 0) {
        if (typeof uuid === "string") {
          uuid = uuid.toLowerCase();
          if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-([a-f0-9]{12})$/.test(uuid)) {
            return false;
          }
          if (uuid === "00000000-0000-0000-0000-000000000000") {
            return { version: void 0, variant: "nil", format: "ascii" };
          }
          return {
            version: (hex2byte[uuid[14] + uuid[15]] & 240) >> 4,
            variant: getVariant((hex2byte[uuid[19] + uuid[20]] & 224) >> 5),
            format: "ascii"
          };
        }
        if (Buffer.isBuffer(uuid)) {
          if (uuid.length < offset + 16) {
            return false;
          }
          let i2 = 0;
          for (; i2 < 16; i2++) {
            if (uuid[offset + i2] !== 0) {
              break;
            }
          }
          if (i2 === 16) {
            return { version: void 0, variant: "nil", format: "binary" };
          }
          return {
            version: (uuid[offset + 6] & 240) >> 4,
            variant: getVariant((uuid[offset + 8] & 224) >> 5),
            format: "binary"
          };
        }
        throw (0, error_1.newError)("Unknown type of uuid", "ERR_UNKNOWN_UUID_TYPE");
      }
      // read stringified uuid into a Buffer
      static parse(input) {
        const buffer = Buffer.allocUnsafe(16);
        let j = 0;
        for (let i2 = 0; i2 < 16; i2++) {
          buffer[i2] = hex2byte[input[j++] + input[j++]];
          if (i2 === 3 || i2 === 5 || i2 === 7 || i2 === 9) {
            j += 1;
          }
        }
        return buffer;
      }
    };
    exports2.UUID = UUID;
    UUID.OID = UUID.parse("6ba7b812-9dad-11d1-80b4-00c04fd430c8");
    function getVariant(bits2) {
      switch (bits2) {
        case 0:
        case 1:
        case 3:
          return "ncs";
        case 4:
        case 5:
          return "rfc4122";
        case 6:
          return "microsoft";
        default:
          return "future";
      }
    }
    var UuidEncoding;
    (function(UuidEncoding2) {
      UuidEncoding2[UuidEncoding2["ASCII"] = 0] = "ASCII";
      UuidEncoding2[UuidEncoding2["BINARY"] = 1] = "BINARY";
      UuidEncoding2[UuidEncoding2["OBJECT"] = 2] = "OBJECT";
    })(UuidEncoding || (UuidEncoding = {}));
    function uuidNamed(name, hashMethod, version, namespace, encoding = UuidEncoding.ASCII) {
      const hash = (0, crypto_1.createHash)(hashMethod);
      const nameIsNotAString = typeof name !== "string";
      if (nameIsNotAString && !Buffer.isBuffer(name)) {
        throw (0, error_1.newError)(invalidName, "ERR_INVALID_UUID_NAME");
      }
      hash.update(namespace);
      hash.update(name);
      const buffer = hash.digest();
      let result;
      switch (encoding) {
        case UuidEncoding.BINARY:
          buffer[6] = buffer[6] & 15 | version;
          buffer[8] = buffer[8] & 63 | 128;
          result = buffer;
          break;
        case UuidEncoding.OBJECT:
          buffer[6] = buffer[6] & 15 | version;
          buffer[8] = buffer[8] & 63 | 128;
          result = new UUID(buffer);
          break;
        default:
          result = byte2hex[buffer[0]] + byte2hex[buffer[1]] + byte2hex[buffer[2]] + byte2hex[buffer[3]] + "-" + byte2hex[buffer[4]] + byte2hex[buffer[5]] + "-" + byte2hex[buffer[6] & 15 | version] + byte2hex[buffer[7]] + "-" + byte2hex[buffer[8] & 63 | 128] + byte2hex[buffer[9]] + "-" + byte2hex[buffer[10]] + byte2hex[buffer[11]] + byte2hex[buffer[12]] + byte2hex[buffer[13]] + byte2hex[buffer[14]] + byte2hex[buffer[15]];
          break;
      }
      return result;
    }
    function stringify(buffer) {
      return byte2hex[buffer[0]] + byte2hex[buffer[1]] + byte2hex[buffer[2]] + byte2hex[buffer[3]] + "-" + byte2hex[buffer[4]] + byte2hex[buffer[5]] + "-" + byte2hex[buffer[6]] + byte2hex[buffer[7]] + "-" + byte2hex[buffer[8]] + byte2hex[buffer[9]] + "-" + byte2hex[buffer[10]] + byte2hex[buffer[11]] + byte2hex[buffer[12]] + byte2hex[buffer[13]] + byte2hex[buffer[14]] + byte2hex[buffer[15]];
    }
    exports2.nil = new UUID("00000000-0000-0000-0000-000000000000");
  }
});

// node_modules/.pnpm/sax@1.6.0/node_modules/sax/lib/sax.js
var require_sax = __commonJS({
  "node_modules/.pnpm/sax@1.6.0/node_modules/sax/lib/sax.js"(exports2) {
    (function(sax) {
      sax.parser = function(strict, opt) {
        return new SAXParser(strict, opt);
      };
      sax.SAXParser = SAXParser;
      sax.SAXStream = SAXStream;
      sax.createStream = createStream;
      sax.MAX_BUFFER_LENGTH = 64 * 1024;
      var buffers = [
        "comment",
        "sgmlDecl",
        "textNode",
        "tagName",
        "doctype",
        "procInstName",
        "procInstBody",
        "entity",
        "attribName",
        "attribValue",
        "cdata",
        "script"
      ];
      sax.EVENTS = [
        "text",
        "processinginstruction",
        "sgmldeclaration",
        "doctype",
        "comment",
        "opentagstart",
        "attribute",
        "opentag",
        "closetag",
        "opencdata",
        "cdata",
        "closecdata",
        "error",
        "end",
        "ready",
        "script",
        "opennamespace",
        "closenamespace"
      ];
      function SAXParser(strict, opt) {
        if (!(this instanceof SAXParser)) {
          return new SAXParser(strict, opt);
        }
        var parser = this;
        clearBuffers(parser);
        parser.q = parser.c = "";
        parser.bufferCheckPosition = sax.MAX_BUFFER_LENGTH;
        parser.encoding = null;
        parser.opt = opt || {};
        parser.opt.lowercase = parser.opt.lowercase || parser.opt.lowercasetags;
        parser.looseCase = parser.opt.lowercase ? "toLowerCase" : "toUpperCase";
        parser.opt.maxEntityCount = parser.opt.maxEntityCount || 512;
        parser.opt.maxEntityDepth = parser.opt.maxEntityDepth || 4;
        parser.entityCount = parser.entityDepth = 0;
        parser.tags = [];
        parser.closed = parser.closedRoot = parser.sawRoot = false;
        parser.tag = parser.error = null;
        parser.strict = !!strict;
        parser.noscript = !!(strict || parser.opt.noscript);
        parser.state = S.BEGIN;
        parser.strictEntities = parser.opt.strictEntities;
        parser.ENTITIES = parser.strictEntities ? Object.create(sax.XML_ENTITIES) : Object.create(sax.ENTITIES);
        parser.attribList = [];
        if (parser.opt.xmlns) {
          parser.ns = Object.create(rootNS);
        }
        if (parser.opt.unquotedAttributeValues === void 0) {
          parser.opt.unquotedAttributeValues = !strict;
        }
        parser.trackPosition = parser.opt.position !== false;
        if (parser.trackPosition) {
          parser.position = parser.line = parser.column = 0;
        }
        emit(parser, "onready");
      }
      if (!Object.create) {
        Object.create = function(o) {
          function F() {
          }
          F.prototype = o;
          var newf = new F();
          return newf;
        };
      }
      if (!Object.keys) {
        Object.keys = function(o) {
          var a = [];
          for (var i2 in o) if (o.hasOwnProperty(i2)) a.push(i2);
          return a;
        };
      }
      function checkBufferLength(parser) {
        var maxAllowed = Math.max(sax.MAX_BUFFER_LENGTH, 10);
        var maxActual = 0;
        for (var i2 = 0, l = buffers.length; i2 < l; i2++) {
          var len = parser[buffers[i2]].length;
          if (len > maxAllowed) {
            switch (buffers[i2]) {
              case "textNode":
                closeText(parser);
                break;
              case "cdata":
                emitNode(parser, "oncdata", parser.cdata);
                parser.cdata = "";
                break;
              case "script":
                emitNode(parser, "onscript", parser.script);
                parser.script = "";
                break;
              default:
                error(parser, "Max buffer length exceeded: " + buffers[i2]);
            }
          }
          maxActual = Math.max(maxActual, len);
        }
        var m = sax.MAX_BUFFER_LENGTH - maxActual;
        parser.bufferCheckPosition = m + parser.position;
      }
      function clearBuffers(parser) {
        for (var i2 = 0, l = buffers.length; i2 < l; i2++) {
          parser[buffers[i2]] = "";
        }
      }
      function flushBuffers(parser) {
        closeText(parser);
        if (parser.cdata !== "") {
          emitNode(parser, "oncdata", parser.cdata);
          parser.cdata = "";
        }
        if (parser.script !== "") {
          emitNode(parser, "onscript", parser.script);
          parser.script = "";
        }
      }
      SAXParser.prototype = {
        end: function() {
          end(this);
        },
        write,
        resume: function() {
          this.error = null;
          return this;
        },
        close: function() {
          return this.write(null);
        },
        flush: function() {
          flushBuffers(this);
        }
      };
      var Stream;
      try {
        Stream = require("stream").Stream;
      } catch (ex) {
        Stream = function() {
        };
      }
      if (!Stream) Stream = function() {
      };
      var streamWraps = sax.EVENTS.filter(function(ev) {
        return ev !== "error" && ev !== "end";
      });
      function createStream(strict, opt) {
        return new SAXStream(strict, opt);
      }
      function determineBufferEncoding(data, isEnd) {
        if (data.length >= 2) {
          if (data[0] === 255 && data[1] === 254) {
            return "utf-16le";
          }
          if (data[0] === 254 && data[1] === 255) {
            return "utf-16be";
          }
        }
        if (data.length >= 3 && data[0] === 239 && data[1] === 187 && data[2] === 191) {
          return "utf8";
        }
        if (data.length >= 4) {
          if (data[0] === 60 && data[1] === 0 && data[2] === 63 && data[3] === 0) {
            return "utf-16le";
          }
          if (data[0] === 0 && data[1] === 60 && data[2] === 0 && data[3] === 63) {
            return "utf-16be";
          }
          return "utf8";
        }
        return isEnd ? "utf8" : null;
      }
      function SAXStream(strict, opt) {
        if (!(this instanceof SAXStream)) {
          return new SAXStream(strict, opt);
        }
        Stream.apply(this);
        this._parser = new SAXParser(strict, opt);
        this.writable = true;
        this.readable = true;
        var me = this;
        this._parser.onend = function() {
          me.emit("end");
        };
        this._parser.onerror = function(er) {
          me.emit("error", er);
          me._parser.error = null;
        };
        this._decoder = null;
        this._decoderBuffer = null;
        streamWraps.forEach(function(ev) {
          Object.defineProperty(me, "on" + ev, {
            get: function() {
              return me._parser["on" + ev];
            },
            set: function(h) {
              if (!h) {
                me.removeAllListeners(ev);
                me._parser["on" + ev] = h;
                return h;
              }
              me.on(ev, h);
            },
            enumerable: true,
            configurable: false
          });
        });
      }
      SAXStream.prototype = Object.create(Stream.prototype, {
        constructor: {
          value: SAXStream
        }
      });
      SAXStream.prototype._decodeBuffer = function(data, isEnd) {
        if (this._decoderBuffer) {
          data = Buffer.concat([this._decoderBuffer, data]);
          this._decoderBuffer = null;
        }
        if (!this._decoder) {
          var encoding = determineBufferEncoding(data, isEnd);
          if (!encoding) {
            this._decoderBuffer = data;
            return "";
          }
          this._parser.encoding = encoding;
          this._decoder = new TextDecoder(encoding);
        }
        return this._decoder.decode(data, { stream: !isEnd });
      };
      SAXStream.prototype.write = function(data) {
        if (typeof Buffer === "function" && typeof Buffer.isBuffer === "function" && Buffer.isBuffer(data)) {
          data = this._decodeBuffer(data, false);
        } else if (this._decoderBuffer) {
          var remaining = this._decodeBuffer(Buffer.alloc(0), true);
          if (remaining) {
            this._parser.write(remaining);
            this.emit("data", remaining);
          }
        }
        this._parser.write(data.toString());
        this.emit("data", data);
        return true;
      };
      SAXStream.prototype.end = function(chunk) {
        if (chunk && chunk.length) {
          this.write(chunk);
        }
        if (this._decoderBuffer) {
          var finalChunk = this._decodeBuffer(Buffer.alloc(0), true);
          if (finalChunk) {
            this._parser.write(finalChunk);
            this.emit("data", finalChunk);
          }
        } else if (this._decoder) {
          var remaining = this._decoder.decode();
          if (remaining) {
            this._parser.write(remaining);
            this.emit("data", remaining);
          }
        }
        this._parser.end();
        return true;
      };
      SAXStream.prototype.on = function(ev, handler) {
        var me = this;
        if (!me._parser["on" + ev] && streamWraps.indexOf(ev) !== -1) {
          me._parser["on" + ev] = function() {
            var args2 = arguments.length === 1 ? [arguments[0]] : Array.apply(null, arguments);
            args2.splice(0, 0, ev);
            me.emit.apply(me, args2);
          };
        }
        return Stream.prototype.on.call(me, ev, handler);
      };
      var CDATA = "[CDATA[";
      var DOCTYPE = "DOCTYPE";
      var XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
      var XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
      var rootNS = { xml: XML_NAMESPACE, xmlns: XMLNS_NAMESPACE };
      var nameStart = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/;
      var nameBody = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u00B7\u0300-\u036F\u203F-\u2040.\d-]/;
      var entityStart = /[#:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/;
      var entityBody = /[#:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u00B7\u0300-\u036F\u203F-\u2040.\d-]/;
      function isWhitespace(c) {
        return c === " " || c === "\n" || c === "\r" || c === "	";
      }
      function isQuote(c) {
        return c === '"' || c === "'";
      }
      function isAttribEnd(c) {
        return c === ">" || isWhitespace(c);
      }
      function isMatch(regex, c) {
        return regex.test(c);
      }
      function notMatch(regex, c) {
        return !isMatch(regex, c);
      }
      var S = 0;
      sax.STATE = {
        BEGIN: S++,
        // leading byte order mark or whitespace
        BEGIN_WHITESPACE: S++,
        // leading whitespace
        TEXT: S++,
        // general stuff
        TEXT_ENTITY: S++,
        // &amp and such.
        OPEN_WAKA: S++,
        // <
        SGML_DECL: S++,
        // <!BLARG
        SGML_DECL_QUOTED: S++,
        // <!BLARG foo "bar
        DOCTYPE: S++,
        // <!DOCTYPE
        DOCTYPE_QUOTED: S++,
        // <!DOCTYPE "//blah
        DOCTYPE_DTD: S++,
        // <!DOCTYPE "//blah" [ ...
        DOCTYPE_DTD_QUOTED: S++,
        // <!DOCTYPE "//blah" [ "foo
        COMMENT_STARTING: S++,
        // <!-
        COMMENT: S++,
        // <!--
        COMMENT_ENDING: S++,
        // <!-- blah -
        COMMENT_ENDED: S++,
        // <!-- blah --
        CDATA: S++,
        // <![CDATA[ something
        CDATA_ENDING: S++,
        // ]
        CDATA_ENDING_2: S++,
        // ]]
        PROC_INST: S++,
        // <?hi
        PROC_INST_BODY: S++,
        // <?hi there
        PROC_INST_ENDING: S++,
        // <?hi "there" ?
        OPEN_TAG: S++,
        // <strong
        OPEN_TAG_SLASH: S++,
        // <strong /
        ATTRIB: S++,
        // <a
        ATTRIB_NAME: S++,
        // <a foo
        ATTRIB_NAME_SAW_WHITE: S++,
        // <a foo _
        ATTRIB_VALUE: S++,
        // <a foo=
        ATTRIB_VALUE_QUOTED: S++,
        // <a foo="bar
        ATTRIB_VALUE_CLOSED: S++,
        // <a foo="bar"
        ATTRIB_VALUE_UNQUOTED: S++,
        // <a foo=bar
        ATTRIB_VALUE_ENTITY_Q: S++,
        // <foo bar="&quot;"
        ATTRIB_VALUE_ENTITY_U: S++,
        // <foo bar=&quot
        CLOSE_TAG: S++,
        // </a
        CLOSE_TAG_SAW_WHITE: S++,
        // </a   >
        SCRIPT: S++,
        // <script> ...
        SCRIPT_ENDING: S++
        // <script> ... <
      };
      sax.XML_ENTITIES = {
        amp: "&",
        gt: ">",
        lt: "<",
        quot: '"',
        apos: "'"
      };
      sax.ENTITIES = {
        amp: "&",
        gt: ">",
        lt: "<",
        quot: '"',
        apos: "'",
        AElig: 198,
        Aacute: 193,
        Acirc: 194,
        Agrave: 192,
        Aring: 197,
        Atilde: 195,
        Auml: 196,
        Ccedil: 199,
        ETH: 208,
        Eacute: 201,
        Ecirc: 202,
        Egrave: 200,
        Euml: 203,
        Iacute: 205,
        Icirc: 206,
        Igrave: 204,
        Iuml: 207,
        Ntilde: 209,
        Oacute: 211,
        Ocirc: 212,
        Ograve: 210,
        Oslash: 216,
        Otilde: 213,
        Ouml: 214,
        THORN: 222,
        Uacute: 218,
        Ucirc: 219,
        Ugrave: 217,
        Uuml: 220,
        Yacute: 221,
        aacute: 225,
        acirc: 226,
        aelig: 230,
        agrave: 224,
        aring: 229,
        atilde: 227,
        auml: 228,
        ccedil: 231,
        eacute: 233,
        ecirc: 234,
        egrave: 232,
        eth: 240,
        euml: 235,
        iacute: 237,
        icirc: 238,
        igrave: 236,
        iuml: 239,
        ntilde: 241,
        oacute: 243,
        ocirc: 244,
        ograve: 242,
        oslash: 248,
        otilde: 245,
        ouml: 246,
        szlig: 223,
        thorn: 254,
        uacute: 250,
        ucirc: 251,
        ugrave: 249,
        uuml: 252,
        yacute: 253,
        yuml: 255,
        copy: 169,
        reg: 174,
        nbsp: 160,
        iexcl: 161,
        cent: 162,
        pound: 163,
        curren: 164,
        yen: 165,
        brvbar: 166,
        sect: 167,
        uml: 168,
        ordf: 170,
        laquo: 171,
        not: 172,
        shy: 173,
        macr: 175,
        deg: 176,
        plusmn: 177,
        sup1: 185,
        sup2: 178,
        sup3: 179,
        acute: 180,
        micro: 181,
        para: 182,
        middot: 183,
        cedil: 184,
        ordm: 186,
        raquo: 187,
        frac14: 188,
        frac12: 189,
        frac34: 190,
        iquest: 191,
        times: 215,
        divide: 247,
        OElig: 338,
        oelig: 339,
        Scaron: 352,
        scaron: 353,
        Yuml: 376,
        fnof: 402,
        circ: 710,
        tilde: 732,
        Alpha: 913,
        Beta: 914,
        Gamma: 915,
        Delta: 916,
        Epsilon: 917,
        Zeta: 918,
        Eta: 919,
        Theta: 920,
        Iota: 921,
        Kappa: 922,
        Lambda: 923,
        Mu: 924,
        Nu: 925,
        Xi: 926,
        Omicron: 927,
        Pi: 928,
        Rho: 929,
        Sigma: 931,
        Tau: 932,
        Upsilon: 933,
        Phi: 934,
        Chi: 935,
        Psi: 936,
        Omega: 937,
        alpha: 945,
        beta: 946,
        gamma: 947,
        delta: 948,
        epsilon: 949,
        zeta: 950,
        eta: 951,
        theta: 952,
        iota: 953,
        kappa: 954,
        lambda: 955,
        mu: 956,
        nu: 957,
        xi: 958,
        omicron: 959,
        pi: 960,
        rho: 961,
        sigmaf: 962,
        sigma: 963,
        tau: 964,
        upsilon: 965,
        phi: 966,
        chi: 967,
        psi: 968,
        omega: 969,
        thetasym: 977,
        upsih: 978,
        piv: 982,
        ensp: 8194,
        emsp: 8195,
        thinsp: 8201,
        zwnj: 8204,
        zwj: 8205,
        lrm: 8206,
        rlm: 8207,
        ndash: 8211,
        mdash: 8212,
        lsquo: 8216,
        rsquo: 8217,
        sbquo: 8218,
        ldquo: 8220,
        rdquo: 8221,
        bdquo: 8222,
        dagger: 8224,
        Dagger: 8225,
        bull: 8226,
        hellip: 8230,
        permil: 8240,
        prime: 8242,
        Prime: 8243,
        lsaquo: 8249,
        rsaquo: 8250,
        oline: 8254,
        frasl: 8260,
        euro: 8364,
        image: 8465,
        weierp: 8472,
        real: 8476,
        trade: 8482,
        alefsym: 8501,
        larr: 8592,
        uarr: 8593,
        rarr: 8594,
        darr: 8595,
        harr: 8596,
        crarr: 8629,
        lArr: 8656,
        uArr: 8657,
        rArr: 8658,
        dArr: 8659,
        hArr: 8660,
        forall: 8704,
        part: 8706,
        exist: 8707,
        empty: 8709,
        nabla: 8711,
        isin: 8712,
        notin: 8713,
        ni: 8715,
        prod: 8719,
        sum: 8721,
        minus: 8722,
        lowast: 8727,
        radic: 8730,
        prop: 8733,
        infin: 8734,
        ang: 8736,
        and: 8743,
        or: 8744,
        cap: 8745,
        cup: 8746,
        int: 8747,
        there4: 8756,
        sim: 8764,
        cong: 8773,
        asymp: 8776,
        ne: 8800,
        equiv: 8801,
        le: 8804,
        ge: 8805,
        sub: 8834,
        sup: 8835,
        nsub: 8836,
        sube: 8838,
        supe: 8839,
        oplus: 8853,
        otimes: 8855,
        perp: 8869,
        sdot: 8901,
        lceil: 8968,
        rceil: 8969,
        lfloor: 8970,
        rfloor: 8971,
        lang: 9001,
        rang: 9002,
        loz: 9674,
        spades: 9824,
        clubs: 9827,
        hearts: 9829,
        diams: 9830
      };
      Object.keys(sax.ENTITIES).forEach(function(key) {
        var e = sax.ENTITIES[key];
        var s2 = typeof e === "number" ? String.fromCharCode(e) : e;
        sax.ENTITIES[key] = s2;
      });
      for (var s in sax.STATE) {
        sax.STATE[sax.STATE[s]] = s;
      }
      S = sax.STATE;
      function emit(parser, event, data) {
        parser[event] && parser[event](data);
      }
      function getDeclaredEncoding(body) {
        var match = body && body.match(/(?:^|\s)encoding\s*=\s*(['"])([^'"]+)\1/i);
        return match ? match[2] : null;
      }
      function normalizeEncodingName(encoding) {
        if (!encoding) {
          return null;
        }
        return encoding.toLowerCase().replace(/[^a-z0-9]/g, "");
      }
      function encodingsMatch(detectedEncoding, declaredEncoding) {
        const detected = normalizeEncodingName(detectedEncoding);
        const declared = normalizeEncodingName(declaredEncoding);
        if (!detected || !declared) {
          return true;
        }
        if (declared === "utf16") {
          return detected === "utf16le" || detected === "utf16be";
        }
        return detected === declared;
      }
      function validateXmlDeclarationEncoding(parser, data) {
        if (!parser.strict || !parser.encoding || !data || data.name !== "xml") {
          return;
        }
        var declaredEncoding = getDeclaredEncoding(data.body);
        if (declaredEncoding && !encodingsMatch(parser.encoding, declaredEncoding)) {
          strictFail(
            parser,
            "XML declaration encoding " + declaredEncoding + " does not match detected stream encoding " + parser.encoding.toUpperCase()
          );
        }
      }
      function emitNode(parser, nodeType, data) {
        if (parser.textNode) closeText(parser);
        emit(parser, nodeType, data);
      }
      function closeText(parser) {
        parser.textNode = textopts(parser.opt, parser.textNode);
        if (parser.textNode) emit(parser, "ontext", parser.textNode);
        parser.textNode = "";
      }
      function textopts(opt, text) {
        if (opt.trim) text = text.trim();
        if (opt.normalize) text = text.replace(/\s+/g, " ");
        return text;
      }
      function error(parser, er) {
        closeText(parser);
        if (parser.trackPosition) {
          er += "\nLine: " + parser.line + "\nColumn: " + parser.column + "\nChar: " + parser.c;
        }
        er = new Error(er);
        parser.error = er;
        emit(parser, "onerror", er);
        return parser;
      }
      function end(parser) {
        if (parser.sawRoot && !parser.closedRoot)
          strictFail(parser, "Unclosed root tag");
        if (parser.state !== S.BEGIN && parser.state !== S.BEGIN_WHITESPACE && parser.state !== S.TEXT) {
          error(parser, "Unexpected end");
        }
        closeText(parser);
        parser.c = "";
        parser.closed = true;
        emit(parser, "onend");
        SAXParser.call(parser, parser.strict, parser.opt);
        return parser;
      }
      function strictFail(parser, message) {
        if (typeof parser !== "object" || !(parser instanceof SAXParser)) {
          throw new Error("bad call to strictFail");
        }
        if (parser.strict) {
          error(parser, message);
        }
      }
      function newTag(parser) {
        if (!parser.strict) parser.tagName = parser.tagName[parser.looseCase]();
        var parent = parser.tags[parser.tags.length - 1] || parser;
        var tag = parser.tag = { name: parser.tagName, attributes: {} };
        if (parser.opt.xmlns) {
          tag.ns = parent.ns;
        }
        parser.attribList.length = 0;
        emitNode(parser, "onopentagstart", tag);
      }
      function qname(name, attribute) {
        var i2 = name.indexOf(":");
        var qualName = i2 < 0 ? ["", name] : name.split(":");
        var prefix = qualName[0];
        var local = qualName[1];
        if (attribute && name === "xmlns") {
          prefix = "xmlns";
          local = "";
        }
        return { prefix, local };
      }
      function attrib(parser) {
        if (!parser.strict) {
          parser.attribName = parser.attribName[parser.looseCase]();
        }
        if (parser.attribList.indexOf(parser.attribName) !== -1 || parser.tag.attributes.hasOwnProperty(parser.attribName)) {
          parser.attribName = parser.attribValue = "";
          return;
        }
        if (parser.opt.xmlns) {
          var qn = qname(parser.attribName, true);
          var prefix = qn.prefix;
          var local = qn.local;
          if (prefix === "xmlns") {
            if (local === "xml" && parser.attribValue !== XML_NAMESPACE) {
              strictFail(
                parser,
                "xml: prefix must be bound to " + XML_NAMESPACE + "\nActual: " + parser.attribValue
              );
            } else if (local === "xmlns" && parser.attribValue !== XMLNS_NAMESPACE) {
              strictFail(
                parser,
                "xmlns: prefix must be bound to " + XMLNS_NAMESPACE + "\nActual: " + parser.attribValue
              );
            } else {
              var tag = parser.tag;
              var parent = parser.tags[parser.tags.length - 1] || parser;
              if (tag.ns === parent.ns) {
                tag.ns = Object.create(parent.ns);
              }
              tag.ns[local] = parser.attribValue;
            }
          }
          parser.attribList.push([parser.attribName, parser.attribValue]);
        } else {
          parser.tag.attributes[parser.attribName] = parser.attribValue;
          emitNode(parser, "onattribute", {
            name: parser.attribName,
            value: parser.attribValue
          });
        }
        parser.attribName = parser.attribValue = "";
      }
      function openTag(parser, selfClosing) {
        if (parser.opt.xmlns) {
          var tag = parser.tag;
          var qn = qname(parser.tagName);
          tag.prefix = qn.prefix;
          tag.local = qn.local;
          tag.uri = tag.ns[qn.prefix] || "";
          if (tag.prefix && !tag.uri) {
            strictFail(
              parser,
              "Unbound namespace prefix: " + JSON.stringify(parser.tagName)
            );
            tag.uri = qn.prefix;
          }
          var parent = parser.tags[parser.tags.length - 1] || parser;
          if (tag.ns && parent.ns !== tag.ns) {
            Object.keys(tag.ns).forEach(function(p) {
              emitNode(parser, "onopennamespace", {
                prefix: p,
                uri: tag.ns[p]
              });
            });
          }
          for (var i2 = 0, l = parser.attribList.length; i2 < l; i2++) {
            var nv = parser.attribList[i2];
            var name = nv[0];
            var value = nv[1];
            var qualName = qname(name, true);
            var prefix = qualName.prefix;
            var local = qualName.local;
            var uri = prefix === "" ? "" : tag.ns[prefix] || "";
            var a = {
              name,
              value,
              prefix,
              local,
              uri
            };
            if (prefix && prefix !== "xmlns" && !uri) {
              strictFail(
                parser,
                "Unbound namespace prefix: " + JSON.stringify(prefix)
              );
              a.uri = prefix;
            }
            parser.tag.attributes[name] = a;
            emitNode(parser, "onattribute", a);
          }
          parser.attribList.length = 0;
        }
        parser.tag.isSelfClosing = !!selfClosing;
        parser.sawRoot = true;
        parser.tags.push(parser.tag);
        emitNode(parser, "onopentag", parser.tag);
        if (!selfClosing) {
          if (!parser.noscript && parser.tagName.toLowerCase() === "script") {
            parser.state = S.SCRIPT;
          } else {
            parser.state = S.TEXT;
          }
          parser.tag = null;
          parser.tagName = "";
        }
        parser.attribName = parser.attribValue = "";
        parser.attribList.length = 0;
      }
      function closeTag(parser) {
        if (!parser.tagName) {
          strictFail(parser, "Weird empty close tag.");
          parser.textNode += "</>";
          parser.state = S.TEXT;
          return;
        }
        if (parser.script) {
          if (parser.tagName !== "script") {
            parser.script += "</" + parser.tagName + ">";
            parser.tagName = "";
            parser.state = S.SCRIPT;
            return;
          }
          emitNode(parser, "onscript", parser.script);
          parser.script = "";
        }
        var t = parser.tags.length;
        var tagName = parser.tagName;
        if (!parser.strict) {
          tagName = tagName[parser.looseCase]();
        }
        var closeTo = tagName;
        while (t--) {
          var close = parser.tags[t];
          if (close.name !== closeTo) {
            strictFail(parser, "Unexpected close tag");
          } else {
            break;
          }
        }
        if (t < 0) {
          strictFail(parser, "Unmatched closing tag: " + parser.tagName);
          parser.textNode += "</" + parser.tagName + ">";
          parser.state = S.TEXT;
          return;
        }
        parser.tagName = tagName;
        var s2 = parser.tags.length;
        while (s2-- > t) {
          var tag = parser.tag = parser.tags.pop();
          parser.tagName = parser.tag.name;
          emitNode(parser, "onclosetag", parser.tagName);
          var x2 = {};
          for (var i2 in tag.ns) {
            x2[i2] = tag.ns[i2];
          }
          var parent = parser.tags[parser.tags.length - 1] || parser;
          if (parser.opt.xmlns && tag.ns !== parent.ns) {
            Object.keys(tag.ns).forEach(function(p) {
              var n = tag.ns[p];
              emitNode(parser, "onclosenamespace", { prefix: p, uri: n });
            });
          }
        }
        if (t === 0) parser.closedRoot = true;
        parser.tagName = parser.attribValue = parser.attribName = "";
        parser.attribList.length = 0;
        parser.state = S.TEXT;
      }
      function parseEntity(parser) {
        var entity = parser.entity;
        var entityLC = entity.toLowerCase();
        var num;
        var numStr = "";
        if (parser.ENTITIES[entity]) {
          return parser.ENTITIES[entity];
        }
        if (parser.ENTITIES[entityLC]) {
          return parser.ENTITIES[entityLC];
        }
        entity = entityLC;
        if (entity.charAt(0) === "#") {
          if (entity.charAt(1) === "x") {
            entity = entity.slice(2);
            num = parseInt(entity, 16);
            numStr = num.toString(16);
          } else {
            entity = entity.slice(1);
            num = parseInt(entity, 10);
            numStr = num.toString(10);
          }
        }
        entity = entity.replace(/^0+/, "");
        if (isNaN(num) || numStr.toLowerCase() !== entity || num < 0 || num > 1114111) {
          strictFail(parser, "Invalid character entity");
          return "&" + parser.entity + ";";
        }
        return String.fromCodePoint(num);
      }
      function beginWhiteSpace(parser, c) {
        if (c === "<") {
          parser.state = S.OPEN_WAKA;
          parser.startTagPosition = parser.position;
        } else if (!isWhitespace(c)) {
          strictFail(parser, "Non-whitespace before first tag.");
          parser.textNode = c;
          parser.state = S.TEXT;
        }
      }
      function charAt(chunk, i2) {
        var result = "";
        if (i2 < chunk.length) {
          result = chunk.charAt(i2);
        }
        return result;
      }
      function write(chunk) {
        var parser = this;
        if (this.error) {
          throw this.error;
        }
        if (parser.closed) {
          return error(
            parser,
            "Cannot write after close. Assign an onready handler."
          );
        }
        if (chunk === null) {
          return end(parser);
        }
        if (typeof chunk === "object") {
          chunk = chunk.toString();
        }
        var i2 = 0;
        var c = "";
        while (true) {
          c = charAt(chunk, i2++);
          parser.c = c;
          if (!c) {
            break;
          }
          if (parser.trackPosition) {
            parser.position++;
            if (c === "\n") {
              parser.line++;
              parser.column = 0;
            } else {
              parser.column++;
            }
          }
          switch (parser.state) {
            case S.BEGIN:
              parser.state = S.BEGIN_WHITESPACE;
              if (c === "\uFEFF") {
                continue;
              }
              beginWhiteSpace(parser, c);
              continue;
            case S.BEGIN_WHITESPACE:
              beginWhiteSpace(parser, c);
              continue;
            case S.TEXT:
              if (parser.sawRoot && !parser.closedRoot) {
                var starti = i2 - 1;
                while (c && c !== "<" && c !== "&") {
                  c = charAt(chunk, i2++);
                  if (c && parser.trackPosition) {
                    parser.position++;
                    if (c === "\n") {
                      parser.line++;
                      parser.column = 0;
                    } else {
                      parser.column++;
                    }
                  }
                }
                parser.textNode += chunk.substring(starti, i2 - 1);
              }
              if (c === "<" && !(parser.sawRoot && parser.closedRoot && !parser.strict)) {
                parser.state = S.OPEN_WAKA;
                parser.startTagPosition = parser.position;
              } else {
                if (!isWhitespace(c) && (!parser.sawRoot || parser.closedRoot)) {
                  strictFail(parser, "Text data outside of root node.");
                }
                if (c === "&") {
                  parser.state = S.TEXT_ENTITY;
                } else {
                  parser.textNode += c;
                }
              }
              continue;
            case S.SCRIPT:
              if (c === "<") {
                parser.state = S.SCRIPT_ENDING;
              } else {
                parser.script += c;
              }
              continue;
            case S.SCRIPT_ENDING:
              if (c === "/") {
                parser.state = S.CLOSE_TAG;
              } else {
                parser.script += "<" + c;
                parser.state = S.SCRIPT;
              }
              continue;
            case S.OPEN_WAKA:
              if (c === "!") {
                parser.state = S.SGML_DECL;
                parser.sgmlDecl = "";
              } else if (isWhitespace(c)) {
              } else if (isMatch(nameStart, c)) {
                parser.state = S.OPEN_TAG;
                parser.tagName = c;
              } else if (c === "/") {
                parser.state = S.CLOSE_TAG;
                parser.tagName = "";
              } else if (c === "?") {
                parser.state = S.PROC_INST;
                parser.procInstName = parser.procInstBody = "";
              } else {
                strictFail(parser, "Unencoded <");
                if (parser.startTagPosition + 1 < parser.position) {
                  var pad = parser.position - parser.startTagPosition;
                  c = new Array(pad).join(" ") + c;
                }
                parser.textNode += "<" + c;
                parser.state = S.TEXT;
              }
              continue;
            case S.SGML_DECL:
              if (parser.sgmlDecl + c === "--") {
                parser.state = S.COMMENT;
                parser.comment = "";
                parser.sgmlDecl = "";
                continue;
              }
              if (parser.doctype && parser.doctype !== true && parser.sgmlDecl) {
                parser.state = S.DOCTYPE_DTD;
                parser.doctype += "<!" + parser.sgmlDecl + c;
                parser.sgmlDecl = "";
              } else if ((parser.sgmlDecl + c).toUpperCase() === CDATA) {
                emitNode(parser, "onopencdata");
                parser.state = S.CDATA;
                parser.sgmlDecl = "";
                parser.cdata = "";
              } else if ((parser.sgmlDecl + c).toUpperCase() === DOCTYPE) {
                parser.state = S.DOCTYPE;
                if (parser.doctype || parser.sawRoot) {
                  strictFail(
                    parser,
                    "Inappropriately located doctype declaration"
                  );
                }
                parser.doctype = "";
                parser.sgmlDecl = "";
              } else if (c === ">") {
                emitNode(parser, "onsgmldeclaration", parser.sgmlDecl);
                parser.sgmlDecl = "";
                parser.state = S.TEXT;
              } else if (isQuote(c)) {
                parser.state = S.SGML_DECL_QUOTED;
                parser.sgmlDecl += c;
              } else {
                parser.sgmlDecl += c;
              }
              continue;
            case S.SGML_DECL_QUOTED:
              if (c === parser.q) {
                parser.state = S.SGML_DECL;
                parser.q = "";
              }
              parser.sgmlDecl += c;
              continue;
            case S.DOCTYPE:
              if (c === ">") {
                parser.state = S.TEXT;
                emitNode(parser, "ondoctype", parser.doctype);
                parser.doctype = true;
              } else {
                parser.doctype += c;
                if (c === "[") {
                  parser.state = S.DOCTYPE_DTD;
                } else if (isQuote(c)) {
                  parser.state = S.DOCTYPE_QUOTED;
                  parser.q = c;
                }
              }
              continue;
            case S.DOCTYPE_QUOTED:
              parser.doctype += c;
              if (c === parser.q) {
                parser.q = "";
                parser.state = S.DOCTYPE;
              }
              continue;
            case S.DOCTYPE_DTD:
              if (c === "]") {
                parser.doctype += c;
                parser.state = S.DOCTYPE;
              } else if (c === "<") {
                parser.state = S.OPEN_WAKA;
                parser.startTagPosition = parser.position;
              } else if (isQuote(c)) {
                parser.doctype += c;
                parser.state = S.DOCTYPE_DTD_QUOTED;
                parser.q = c;
              } else {
                parser.doctype += c;
              }
              continue;
            case S.DOCTYPE_DTD_QUOTED:
              parser.doctype += c;
              if (c === parser.q) {
                parser.state = S.DOCTYPE_DTD;
                parser.q = "";
              }
              continue;
            case S.COMMENT:
              if (c === "-") {
                parser.state = S.COMMENT_ENDING;
              } else {
                parser.comment += c;
              }
              continue;
            case S.COMMENT_ENDING:
              if (c === "-") {
                parser.state = S.COMMENT_ENDED;
                parser.comment = textopts(parser.opt, parser.comment);
                if (parser.comment) {
                  emitNode(parser, "oncomment", parser.comment);
                }
                parser.comment = "";
              } else {
                parser.comment += "-" + c;
                parser.state = S.COMMENT;
              }
              continue;
            case S.COMMENT_ENDED:
              if (c !== ">") {
                strictFail(parser, "Malformed comment");
                parser.comment += "--" + c;
                parser.state = S.COMMENT;
              } else if (parser.doctype && parser.doctype !== true) {
                parser.state = S.DOCTYPE_DTD;
              } else {
                parser.state = S.TEXT;
              }
              continue;
            case S.CDATA:
              var starti = i2 - 1;
              while (c && c !== "]") {
                c = charAt(chunk, i2++);
                if (c && parser.trackPosition) {
                  parser.position++;
                  if (c === "\n") {
                    parser.line++;
                    parser.column = 0;
                  } else {
                    parser.column++;
                  }
                }
              }
              parser.cdata += chunk.substring(starti, i2 - 1);
              if (c === "]") {
                parser.state = S.CDATA_ENDING;
              }
              continue;
            case S.CDATA_ENDING:
              if (c === "]") {
                parser.state = S.CDATA_ENDING_2;
              } else {
                parser.cdata += "]" + c;
                parser.state = S.CDATA;
              }
              continue;
            case S.CDATA_ENDING_2:
              if (c === ">") {
                if (parser.cdata) {
                  emitNode(parser, "oncdata", parser.cdata);
                }
                emitNode(parser, "onclosecdata");
                parser.cdata = "";
                parser.state = S.TEXT;
              } else if (c === "]") {
                parser.cdata += "]";
              } else {
                parser.cdata += "]]" + c;
                parser.state = S.CDATA;
              }
              continue;
            case S.PROC_INST:
              if (c === "?") {
                parser.state = S.PROC_INST_ENDING;
              } else if (isWhitespace(c)) {
                parser.state = S.PROC_INST_BODY;
              } else {
                parser.procInstName += c;
              }
              continue;
            case S.PROC_INST_BODY:
              if (!parser.procInstBody && isWhitespace(c)) {
                continue;
              } else if (c === "?") {
                parser.state = S.PROC_INST_ENDING;
              } else {
                parser.procInstBody += c;
              }
              continue;
            case S.PROC_INST_ENDING:
              if (c === ">") {
                const procInstEndData = {
                  name: parser.procInstName,
                  body: parser.procInstBody
                };
                validateXmlDeclarationEncoding(parser, procInstEndData);
                emitNode(parser, "onprocessinginstruction", procInstEndData);
                parser.procInstName = parser.procInstBody = "";
                parser.state = S.TEXT;
              } else {
                parser.procInstBody += "?" + c;
                parser.state = S.PROC_INST_BODY;
              }
              continue;
            case S.OPEN_TAG:
              if (isMatch(nameBody, c)) {
                parser.tagName += c;
              } else {
                newTag(parser);
                if (c === ">") {
                  openTag(parser);
                } else if (c === "/") {
                  parser.state = S.OPEN_TAG_SLASH;
                } else {
                  if (!isWhitespace(c)) {
                    strictFail(parser, "Invalid character in tag name");
                  }
                  parser.state = S.ATTRIB;
                }
              }
              continue;
            case S.OPEN_TAG_SLASH:
              if (c === ">") {
                openTag(parser, true);
                closeTag(parser);
              } else {
                strictFail(
                  parser,
                  "Forward-slash in opening tag not followed by >"
                );
                parser.state = S.ATTRIB;
              }
              continue;
            case S.ATTRIB:
              if (isWhitespace(c)) {
                continue;
              } else if (c === ">") {
                openTag(parser);
              } else if (c === "/") {
                parser.state = S.OPEN_TAG_SLASH;
              } else if (isMatch(nameStart, c)) {
                parser.attribName = c;
                parser.attribValue = "";
                parser.state = S.ATTRIB_NAME;
              } else {
                strictFail(parser, "Invalid attribute name");
              }
              continue;
            case S.ATTRIB_NAME:
              if (c === "=") {
                parser.state = S.ATTRIB_VALUE;
              } else if (c === ">") {
                strictFail(parser, "Attribute without value");
                parser.attribValue = parser.attribName;
                attrib(parser);
                openTag(parser);
              } else if (isWhitespace(c)) {
                parser.state = S.ATTRIB_NAME_SAW_WHITE;
              } else if (isMatch(nameBody, c)) {
                parser.attribName += c;
              } else {
                strictFail(parser, "Invalid attribute name");
              }
              continue;
            case S.ATTRIB_NAME_SAW_WHITE:
              if (c === "=") {
                parser.state = S.ATTRIB_VALUE;
              } else if (isWhitespace(c)) {
                continue;
              } else {
                strictFail(parser, "Attribute without value");
                parser.tag.attributes[parser.attribName] = "";
                parser.attribValue = "";
                emitNode(parser, "onattribute", {
                  name: parser.attribName,
                  value: ""
                });
                parser.attribName = "";
                if (c === ">") {
                  openTag(parser);
                } else if (isMatch(nameStart, c)) {
                  parser.attribName = c;
                  parser.state = S.ATTRIB_NAME;
                } else {
                  strictFail(parser, "Invalid attribute name");
                  parser.state = S.ATTRIB;
                }
              }
              continue;
            case S.ATTRIB_VALUE:
              if (isWhitespace(c)) {
                continue;
              } else if (isQuote(c)) {
                parser.q = c;
                parser.state = S.ATTRIB_VALUE_QUOTED;
              } else {
                if (!parser.opt.unquotedAttributeValues) {
                  error(parser, "Unquoted attribute value");
                }
                parser.state = S.ATTRIB_VALUE_UNQUOTED;
                parser.attribValue = c;
              }
              continue;
            case S.ATTRIB_VALUE_QUOTED:
              if (c !== parser.q) {
                if (c === "&") {
                  parser.state = S.ATTRIB_VALUE_ENTITY_Q;
                } else {
                  parser.attribValue += c;
                }
                continue;
              }
              attrib(parser);
              parser.q = "";
              parser.state = S.ATTRIB_VALUE_CLOSED;
              continue;
            case S.ATTRIB_VALUE_CLOSED:
              if (isWhitespace(c)) {
                parser.state = S.ATTRIB;
              } else if (c === ">") {
                openTag(parser);
              } else if (c === "/") {
                parser.state = S.OPEN_TAG_SLASH;
              } else if (isMatch(nameStart, c)) {
                strictFail(parser, "No whitespace between attributes");
                parser.attribName = c;
                parser.attribValue = "";
                parser.state = S.ATTRIB_NAME;
              } else {
                strictFail(parser, "Invalid attribute name");
              }
              continue;
            case S.ATTRIB_VALUE_UNQUOTED:
              if (!isAttribEnd(c)) {
                if (c === "&") {
                  parser.state = S.ATTRIB_VALUE_ENTITY_U;
                } else {
                  parser.attribValue += c;
                }
                continue;
              }
              attrib(parser);
              if (c === ">") {
                openTag(parser);
              } else {
                parser.state = S.ATTRIB;
              }
              continue;
            case S.CLOSE_TAG:
              if (!parser.tagName) {
                if (isWhitespace(c)) {
                  continue;
                } else if (notMatch(nameStart, c)) {
                  if (parser.script) {
                    parser.script += "</" + c;
                    parser.state = S.SCRIPT;
                  } else {
                    strictFail(parser, "Invalid tagname in closing tag.");
                  }
                } else {
                  parser.tagName = c;
                }
              } else if (c === ">") {
                closeTag(parser);
              } else if (isMatch(nameBody, c)) {
                parser.tagName += c;
              } else if (parser.script) {
                parser.script += "</" + parser.tagName + c;
                parser.tagName = "";
                parser.state = S.SCRIPT;
              } else {
                if (!isWhitespace(c)) {
                  strictFail(parser, "Invalid tagname in closing tag");
                }
                parser.state = S.CLOSE_TAG_SAW_WHITE;
              }
              continue;
            case S.CLOSE_TAG_SAW_WHITE:
              if (isWhitespace(c)) {
                continue;
              }
              if (c === ">") {
                closeTag(parser);
              } else {
                strictFail(parser, "Invalid characters in closing tag");
              }
              continue;
            case S.TEXT_ENTITY:
            case S.ATTRIB_VALUE_ENTITY_Q:
            case S.ATTRIB_VALUE_ENTITY_U:
              var returnState;
              var buffer;
              switch (parser.state) {
                case S.TEXT_ENTITY:
                  returnState = S.TEXT;
                  buffer = "textNode";
                  break;
                case S.ATTRIB_VALUE_ENTITY_Q:
                  returnState = S.ATTRIB_VALUE_QUOTED;
                  buffer = "attribValue";
                  break;
                case S.ATTRIB_VALUE_ENTITY_U:
                  returnState = S.ATTRIB_VALUE_UNQUOTED;
                  buffer = "attribValue";
                  break;
              }
              if (c === ";") {
                var parsedEntity = parseEntity(parser);
                if (parser.opt.unparsedEntities && !Object.values(sax.XML_ENTITIES).includes(parsedEntity)) {
                  if ((parser.entityCount += 1) > parser.opt.maxEntityCount) {
                    error(
                      parser,
                      "Parsed entity count exceeds max entity count"
                    );
                  }
                  if ((parser.entityDepth += 1) > parser.opt.maxEntityDepth) {
                    error(
                      parser,
                      "Parsed entity depth exceeds max entity depth"
                    );
                  }
                  parser.entity = "";
                  parser.state = returnState;
                  parser.write(parsedEntity);
                  parser.entityDepth -= 1;
                } else {
                  parser[buffer] += parsedEntity;
                  parser.entity = "";
                  parser.state = returnState;
                }
              } else if (isMatch(parser.entity.length ? entityBody : entityStart, c)) {
                parser.entity += c;
              } else {
                strictFail(parser, "Invalid character in entity name");
                parser[buffer] += "&" + parser.entity + c;
                parser.entity = "";
                parser.state = returnState;
              }
              continue;
            default: {
              throw new Error(parser, "Unknown state: " + parser.state);
            }
          }
        }
        if (parser.position >= parser.bufferCheckPosition) {
          checkBufferLength(parser);
        }
        return parser;
      }
      if (!String.fromCodePoint) {
        ;
        (function() {
          var stringFromCharCode = String.fromCharCode;
          var floor = Math.floor;
          var fromCodePoint = function() {
            var MAX_SIZE = 16384;
            var codeUnits = [];
            var highSurrogate;
            var lowSurrogate;
            var index = -1;
            var length = arguments.length;
            if (!length) {
              return "";
            }
            var result = "";
            while (++index < length) {
              var codePoint = Number(arguments[index]);
              if (!isFinite(codePoint) || // `NaN`, `+Infinity`, or `-Infinity`
              codePoint < 0 || // not a valid Unicode code point
              codePoint > 1114111 || // not a valid Unicode code point
              floor(codePoint) !== codePoint) {
                throw RangeError("Invalid code point: " + codePoint);
              }
              if (codePoint <= 65535) {
                codeUnits.push(codePoint);
              } else {
                codePoint -= 65536;
                highSurrogate = (codePoint >> 10) + 55296;
                lowSurrogate = codePoint % 1024 + 56320;
                codeUnits.push(highSurrogate, lowSurrogate);
              }
              if (index + 1 === length || codeUnits.length > MAX_SIZE) {
                result += stringFromCharCode.apply(null, codeUnits);
                codeUnits.length = 0;
              }
            }
            return result;
          };
          if (Object.defineProperty) {
            Object.defineProperty(String, "fromCodePoint", {
              value: fromCodePoint,
              configurable: true,
              writable: true
            });
          } else {
            String.fromCodePoint = fromCodePoint;
          }
        })();
      }
    })(typeof exports2 === "undefined" ? exports2.sax = {} : exports2);
  }
});

// node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/xml.js
var require_xml = __commonJS({
  "node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/xml.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.XElement = void 0;
    exports2.parseXml = parseXml;
    var sax = require_sax();
    var error_1 = require_error();
    var XElement = class {
      constructor(name) {
        this.name = name;
        this.value = "";
        this.attributes = null;
        this.isCData = false;
        this.elements = null;
        if (!name) {
          throw (0, error_1.newError)("Element name cannot be empty", "ERR_XML_ELEMENT_NAME_EMPTY");
        }
        if (!isValidName(name)) {
          throw (0, error_1.newError)(`Invalid element name: ${name}`, "ERR_XML_ELEMENT_INVALID_NAME");
        }
      }
      attribute(name) {
        const result = this.attributes === null ? null : this.attributes[name];
        if (result == null) {
          throw (0, error_1.newError)(`No attribute "${name}"`, "ERR_XML_MISSED_ATTRIBUTE");
        }
        return result;
      }
      removeAttribute(name) {
        if (this.attributes !== null) {
          delete this.attributes[name];
        }
      }
      element(name, ignoreCase = false, errorIfMissed = null) {
        const result = this.elementOrNull(name, ignoreCase);
        if (result === null) {
          throw (0, error_1.newError)(errorIfMissed || `No element "${name}"`, "ERR_XML_MISSED_ELEMENT");
        }
        return result;
      }
      elementOrNull(name, ignoreCase = false) {
        if (this.elements === null) {
          return null;
        }
        for (const element of this.elements) {
          if (isNameEquals(element, name, ignoreCase)) {
            return element;
          }
        }
        return null;
      }
      getElements(name, ignoreCase = false) {
        if (this.elements === null) {
          return [];
        }
        return this.elements.filter((it) => isNameEquals(it, name, ignoreCase));
      }
      elementValueOrEmpty(name, ignoreCase = false) {
        const element = this.elementOrNull(name, ignoreCase);
        return element === null ? "" : element.value;
      }
    };
    exports2.XElement = XElement;
    var NAME_REG_EXP = new RegExp(/^[A-Za-z_][:A-Za-z0-9_-]*$/i);
    function isValidName(name) {
      return NAME_REG_EXP.test(name);
    }
    function isNameEquals(element, name, ignoreCase) {
      const elementName = element.name;
      return elementName === name || ignoreCase === true && elementName.length === name.length && elementName.toLowerCase() === name.toLowerCase();
    }
    function parseXml(data) {
      let rootElement = null;
      const parser = sax.parser(true, {});
      const elements = [];
      parser.onopentag = (saxElement) => {
        const element = new XElement(saxElement.name);
        element.attributes = saxElement.attributes;
        if (rootElement === null) {
          rootElement = element;
        } else {
          const parent = elements[elements.length - 1];
          if (parent.elements == null) {
            parent.elements = [];
          }
          parent.elements.push(element);
        }
        elements.push(element);
      };
      parser.onclosetag = () => {
        elements.pop();
      };
      parser.ontext = (text) => {
        if (elements.length > 0) {
          elements[elements.length - 1].value = text;
        }
      };
      parser.oncdata = (cdata) => {
        const element = elements[elements.length - 1];
        element.value = cdata;
        element.isCData = true;
      };
      parser.onerror = (err2) => {
        throw err2;
      };
      parser.write(data);
      return rootElement;
    }
  }
});

// node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/index.js
var require_out = __commonJS({
  "node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CURRENT_APP_PACKAGE_FILE_NAME = exports2.CURRENT_APP_INSTALLER_FILE_NAME = exports2.XElement = exports2.parseXml = exports2.UUID = exports2.parseDn = exports2.retry = exports2.githubTagPrefix = exports2.githubUrl = exports2.getS3LikeProviderBaseUrl = exports2.ProgressCallbackTransform = exports2.MemoLazy = exports2.safeStringifyJson = exports2.safeGetHeader = exports2.parseJson = exports2.HttpExecutor = exports2.HttpError = exports2.DigestTransform = exports2.createHttpError = exports2.configureRequestUrl = exports2.configureRequestOptionsFromUrl = exports2.configureRequestOptions = exports2.newError = exports2.CancellationToken = exports2.CancellationError = void 0;
    exports2.asArray = asArray;
    var CancellationToken_1 = require_CancellationToken();
    Object.defineProperty(exports2, "CancellationError", { enumerable: true, get: function() {
      return CancellationToken_1.CancellationError;
    } });
    Object.defineProperty(exports2, "CancellationToken", { enumerable: true, get: function() {
      return CancellationToken_1.CancellationToken;
    } });
    var error_1 = require_error();
    Object.defineProperty(exports2, "newError", { enumerable: true, get: function() {
      return error_1.newError;
    } });
    var httpExecutor_1 = require_httpExecutor();
    Object.defineProperty(exports2, "configureRequestOptions", { enumerable: true, get: function() {
      return httpExecutor_1.configureRequestOptions;
    } });
    Object.defineProperty(exports2, "configureRequestOptionsFromUrl", { enumerable: true, get: function() {
      return httpExecutor_1.configureRequestOptionsFromUrl;
    } });
    Object.defineProperty(exports2, "configureRequestUrl", { enumerable: true, get: function() {
      return httpExecutor_1.configureRequestUrl;
    } });
    Object.defineProperty(exports2, "createHttpError", { enumerable: true, get: function() {
      return httpExecutor_1.createHttpError;
    } });
    Object.defineProperty(exports2, "DigestTransform", { enumerable: true, get: function() {
      return httpExecutor_1.DigestTransform;
    } });
    Object.defineProperty(exports2, "HttpError", { enumerable: true, get: function() {
      return httpExecutor_1.HttpError;
    } });
    Object.defineProperty(exports2, "HttpExecutor", { enumerable: true, get: function() {
      return httpExecutor_1.HttpExecutor;
    } });
    Object.defineProperty(exports2, "parseJson", { enumerable: true, get: function() {
      return httpExecutor_1.parseJson;
    } });
    Object.defineProperty(exports2, "safeGetHeader", { enumerable: true, get: function() {
      return httpExecutor_1.safeGetHeader;
    } });
    Object.defineProperty(exports2, "safeStringifyJson", { enumerable: true, get: function() {
      return httpExecutor_1.safeStringifyJson;
    } });
    var MemoLazy_1 = require_MemoLazy();
    Object.defineProperty(exports2, "MemoLazy", { enumerable: true, get: function() {
      return MemoLazy_1.MemoLazy;
    } });
    var ProgressCallbackTransform_1 = require_ProgressCallbackTransform();
    Object.defineProperty(exports2, "ProgressCallbackTransform", { enumerable: true, get: function() {
      return ProgressCallbackTransform_1.ProgressCallbackTransform;
    } });
    var publishOptions_1 = require_publishOptions();
    Object.defineProperty(exports2, "getS3LikeProviderBaseUrl", { enumerable: true, get: function() {
      return publishOptions_1.getS3LikeProviderBaseUrl;
    } });
    Object.defineProperty(exports2, "githubUrl", { enumerable: true, get: function() {
      return publishOptions_1.githubUrl;
    } });
    Object.defineProperty(exports2, "githubTagPrefix", { enumerable: true, get: function() {
      return publishOptions_1.githubTagPrefix;
    } });
    var retry_1 = require_retry();
    Object.defineProperty(exports2, "retry", { enumerable: true, get: function() {
      return retry_1.retry;
    } });
    var rfc2253Parser_1 = require_rfc2253Parser();
    Object.defineProperty(exports2, "parseDn", { enumerable: true, get: function() {
      return rfc2253Parser_1.parseDn;
    } });
    var uuid_1 = require_uuid();
    Object.defineProperty(exports2, "UUID", { enumerable: true, get: function() {
      return uuid_1.UUID;
    } });
    var xml_1 = require_xml();
    Object.defineProperty(exports2, "parseXml", { enumerable: true, get: function() {
      return xml_1.parseXml;
    } });
    Object.defineProperty(exports2, "XElement", { enumerable: true, get: function() {
      return xml_1.XElement;
    } });
    exports2.CURRENT_APP_INSTALLER_FILE_NAME = "installer.exe";
    exports2.CURRENT_APP_PACKAGE_FILE_NAME = "package.7z";
    function asArray(v) {
      if (v == null) {
        return [];
      } else if (Array.isArray(v)) {
        return v;
      } else {
        return [v];
      }
    }
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/common.js
var require_common2 = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/common.js"(exports2, module2) {
    "use strict";
    function isNothing(subject) {
      return typeof subject === "undefined" || subject === null;
    }
    function isObject(subject) {
      return typeof subject === "object" && subject !== null;
    }
    function toArray(sequence) {
      if (Array.isArray(sequence)) return sequence;
      else if (isNothing(sequence)) return [];
      return [sequence];
    }
    function extend(target, source) {
      var index, length, key, sourceKeys;
      if (source) {
        sourceKeys = Object.keys(source);
        for (index = 0, length = sourceKeys.length; index < length; index += 1) {
          key = sourceKeys[index];
          target[key] = source[key];
        }
      }
      return target;
    }
    function repeat(string, count) {
      var result = "", cycle;
      for (cycle = 0; cycle < count; cycle += 1) {
        result += string;
      }
      return result;
    }
    function isNegativeZero(number) {
      return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
    }
    module2.exports.isNothing = isNothing;
    module2.exports.isObject = isObject;
    module2.exports.toArray = toArray;
    module2.exports.repeat = repeat;
    module2.exports.isNegativeZero = isNegativeZero;
    module2.exports.extend = extend;
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/exception.js
var require_exception = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/exception.js"(exports2, module2) {
    "use strict";
    function formatError(exception, compact) {
      var where = "", message = exception.reason || "(unknown reason)";
      if (!exception.mark) return message;
      if (exception.mark.name) {
        where += 'in "' + exception.mark.name + '" ';
      }
      where += "(" + (exception.mark.line + 1) + ":" + (exception.mark.column + 1) + ")";
      if (!compact && exception.mark.snippet) {
        where += "\n\n" + exception.mark.snippet;
      }
      return message + " " + where;
    }
    function YAMLException(reason, mark) {
      Error.call(this);
      this.name = "YAMLException";
      this.reason = reason;
      this.mark = mark;
      this.message = formatError(this, false);
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
      } else {
        this.stack = new Error().stack || "";
      }
    }
    YAMLException.prototype = Object.create(Error.prototype);
    YAMLException.prototype.constructor = YAMLException;
    YAMLException.prototype.toString = function toString(compact) {
      return this.name + ": " + formatError(this, compact);
    };
    module2.exports = YAMLException;
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/snippet.js
var require_snippet = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/snippet.js"(exports2, module2) {
    "use strict";
    var common = require_common2();
    function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
      var head = "";
      var tail = "";
      var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
      if (position - lineStart > maxHalfLength) {
        head = " ... ";
        lineStart = position - maxHalfLength + head.length;
      }
      if (lineEnd - position > maxHalfLength) {
        tail = " ...";
        lineEnd = position + maxHalfLength - tail.length;
      }
      return {
        str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
        pos: position - lineStart + head.length
        // relative position
      };
    }
    function padStart(string, max2) {
      return common.repeat(" ", max2 - string.length) + string;
    }
    function makeSnippet(mark, options2) {
      options2 = Object.create(options2 || null);
      if (!mark.buffer) return null;
      if (!options2.maxLength) options2.maxLength = 79;
      if (typeof options2.indent !== "number") options2.indent = 1;
      if (typeof options2.linesBefore !== "number") options2.linesBefore = 3;
      if (typeof options2.linesAfter !== "number") options2.linesAfter = 2;
      var re = /\r?\n|\r|\0/g;
      var lineStarts = [0];
      var lineEnds = [];
      var match;
      var foundLineNo = -1;
      while (match = re.exec(mark.buffer)) {
        lineEnds.push(match.index);
        lineStarts.push(match.index + match[0].length);
        if (mark.position <= match.index && foundLineNo < 0) {
          foundLineNo = lineStarts.length - 2;
        }
      }
      if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
      var result = "", i2, line;
      var lineNoLength = Math.min(mark.line + options2.linesAfter, lineEnds.length).toString().length;
      var maxLineLength = options2.maxLength - (options2.indent + lineNoLength + 3);
      for (i2 = 1; i2 <= options2.linesBefore; i2++) {
        if (foundLineNo - i2 < 0) break;
        line = getLine(
          mark.buffer,
          lineStarts[foundLineNo - i2],
          lineEnds[foundLineNo - i2],
          mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i2]),
          maxLineLength
        );
        result = common.repeat(" ", options2.indent) + padStart((mark.line - i2 + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
      }
      line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
      result += common.repeat(" ", options2.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
      result += common.repeat("-", options2.indent + lineNoLength + 3 + line.pos) + "^\n";
      for (i2 = 1; i2 <= options2.linesAfter; i2++) {
        if (foundLineNo + i2 >= lineEnds.length) break;
        line = getLine(
          mark.buffer,
          lineStarts[foundLineNo + i2],
          lineEnds[foundLineNo + i2],
          mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i2]),
          maxLineLength
        );
        result += common.repeat(" ", options2.indent) + padStart((mark.line + i2 + 1).toString(), lineNoLength) + " | " + line.str + "\n";
      }
      return result.replace(/\n$/, "");
    }
    module2.exports = makeSnippet;
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type.js
var require_type = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type.js"(exports2, module2) {
    "use strict";
    var YAMLException = require_exception();
    var TYPE_CONSTRUCTOR_OPTIONS = [
      "kind",
      "multi",
      "resolve",
      "construct",
      "instanceOf",
      "predicate",
      "represent",
      "representName",
      "defaultStyle",
      "styleAliases"
    ];
    var YAML_NODE_KINDS = [
      "scalar",
      "sequence",
      "mapping"
    ];
    function compileStyleAliases(map) {
      var result = {};
      if (map !== null) {
        Object.keys(map).forEach(function(style) {
          map[style].forEach(function(alias) {
            result[String(alias)] = style;
          });
        });
      }
      return result;
    }
    function Type(tag, options2) {
      options2 = options2 || {};
      Object.keys(options2).forEach(function(name) {
        if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
          throw new YAMLException('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
        }
      });
      this.options = options2;
      this.tag = tag;
      this.kind = options2["kind"] || null;
      this.resolve = options2["resolve"] || function() {
        return true;
      };
      this.construct = options2["construct"] || function(data) {
        return data;
      };
      this.instanceOf = options2["instanceOf"] || null;
      this.predicate = options2["predicate"] || null;
      this.represent = options2["represent"] || null;
      this.representName = options2["representName"] || null;
      this.defaultStyle = options2["defaultStyle"] || null;
      this.multi = options2["multi"] || false;
      this.styleAliases = compileStyleAliases(options2["styleAliases"] || null);
      if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
        throw new YAMLException('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
      }
    }
    module2.exports = Type;
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/schema.js
var require_schema = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/schema.js"(exports2, module2) {
    "use strict";
    var YAMLException = require_exception();
    var Type = require_type();
    function compileList(schema, name) {
      var result = [];
      schema[name].forEach(function(currentType) {
        var newIndex = result.length;
        result.forEach(function(previousType, previousIndex) {
          if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
            newIndex = previousIndex;
          }
        });
        result[newIndex] = currentType;
      });
      return result;
    }
    function compileMap() {
      var result = {
        scalar: {},
        sequence: {},
        mapping: {},
        fallback: {},
        multi: {
          scalar: [],
          sequence: [],
          mapping: [],
          fallback: []
        }
      }, index, length;
      function collectType(type) {
        if (type.multi) {
          result.multi[type.kind].push(type);
          result.multi["fallback"].push(type);
        } else {
          result[type.kind][type.tag] = result["fallback"][type.tag] = type;
        }
      }
      for (index = 0, length = arguments.length; index < length; index += 1) {
        arguments[index].forEach(collectType);
      }
      return result;
    }
    function Schema(definition) {
      return this.extend(definition);
    }
    Schema.prototype.extend = function extend(definition) {
      var implicit = [];
      var explicit = [];
      if (definition instanceof Type) {
        explicit.push(definition);
      } else if (Array.isArray(definition)) {
        explicit = explicit.concat(definition);
      } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
        if (definition.implicit) implicit = implicit.concat(definition.implicit);
        if (definition.explicit) explicit = explicit.concat(definition.explicit);
      } else {
        throw new YAMLException("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
      }
      implicit.forEach(function(type) {
        if (!(type instanceof Type)) {
          throw new YAMLException("Specified list of YAML types (or a single Type object) contains a non-Type object.");
        }
        if (type.loadKind && type.loadKind !== "scalar") {
          throw new YAMLException("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
        }
        if (type.multi) {
          throw new YAMLException("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
        }
      });
      explicit.forEach(function(type) {
        if (!(type instanceof Type)) {
          throw new YAMLException("Specified list of YAML types (or a single Type object) contains a non-Type object.");
        }
      });
      var result = Object.create(Schema.prototype);
      result.implicit = (this.implicit || []).concat(implicit);
      result.explicit = (this.explicit || []).concat(explicit);
      result.compiledImplicit = compileList(result, "implicit");
      result.compiledExplicit = compileList(result, "explicit");
      result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
      return result;
    };
    module2.exports = Schema;
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/str.js
var require_str = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/str.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    module2.exports = new Type("tag:yaml.org,2002:str", {
      kind: "scalar",
      construct: function(data) {
        return data !== null ? data : "";
      }
    });
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/seq.js
var require_seq = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/seq.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    module2.exports = new Type("tag:yaml.org,2002:seq", {
      kind: "sequence",
      construct: function(data) {
        return data !== null ? data : [];
      }
    });
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/map.js
var require_map = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/map.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    module2.exports = new Type("tag:yaml.org,2002:map", {
      kind: "mapping",
      construct: function(data) {
        return data !== null ? data : {};
      }
    });
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/schema/failsafe.js
var require_failsafe = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/schema/failsafe.js"(exports2, module2) {
    "use strict";
    var Schema = require_schema();
    module2.exports = new Schema({
      explicit: [
        require_str(),
        require_seq(),
        require_map()
      ]
    });
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/null.js
var require_null = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/null.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    function resolveYamlNull(data) {
      if (data === null) return true;
      var max2 = data.length;
      return max2 === 1 && data === "~" || max2 === 4 && (data === "null" || data === "Null" || data === "NULL");
    }
    function constructYamlNull() {
      return null;
    }
    function isNull(object) {
      return object === null;
    }
    module2.exports = new Type("tag:yaml.org,2002:null", {
      kind: "scalar",
      resolve: resolveYamlNull,
      construct: constructYamlNull,
      predicate: isNull,
      represent: {
        canonical: function() {
          return "~";
        },
        lowercase: function() {
          return "null";
        },
        uppercase: function() {
          return "NULL";
        },
        camelcase: function() {
          return "Null";
        },
        empty: function() {
          return "";
        }
      },
      defaultStyle: "lowercase"
    });
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/bool.js
var require_bool = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/bool.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    function resolveYamlBoolean(data) {
      if (data === null) return false;
      var max2 = data.length;
      return max2 === 4 && (data === "true" || data === "True" || data === "TRUE") || max2 === 5 && (data === "false" || data === "False" || data === "FALSE");
    }
    function constructYamlBoolean(data) {
      return data === "true" || data === "True" || data === "TRUE";
    }
    function isBoolean(object) {
      return Object.prototype.toString.call(object) === "[object Boolean]";
    }
    module2.exports = new Type("tag:yaml.org,2002:bool", {
      kind: "scalar",
      resolve: resolveYamlBoolean,
      construct: constructYamlBoolean,
      predicate: isBoolean,
      represent: {
        lowercase: function(object) {
          return object ? "true" : "false";
        },
        uppercase: function(object) {
          return object ? "TRUE" : "FALSE";
        },
        camelcase: function(object) {
          return object ? "True" : "False";
        }
      },
      defaultStyle: "lowercase"
    });
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/int.js
var require_int = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/int.js"(exports2, module2) {
    "use strict";
    var common = require_common2();
    var Type = require_type();
    function isHexCode(c) {
      return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
    }
    function isOctCode(c) {
      return 48 <= c && c <= 55;
    }
    function isDecCode(c) {
      return 48 <= c && c <= 57;
    }
    function resolveYamlInteger(data) {
      if (data === null) return false;
      var max2 = data.length, index = 0, hasDigits = false, ch2;
      if (!max2) return false;
      ch2 = data[index];
      if (ch2 === "-" || ch2 === "+") {
        ch2 = data[++index];
      }
      if (ch2 === "0") {
        if (index + 1 === max2) return true;
        ch2 = data[++index];
        if (ch2 === "b") {
          index++;
          for (; index < max2; index++) {
            ch2 = data[index];
            if (ch2 === "_") continue;
            if (ch2 !== "0" && ch2 !== "1") return false;
            hasDigits = true;
          }
          return hasDigits && ch2 !== "_";
        }
        if (ch2 === "x") {
          index++;
          for (; index < max2; index++) {
            ch2 = data[index];
            if (ch2 === "_") continue;
            if (!isHexCode(data.charCodeAt(index))) return false;
            hasDigits = true;
          }
          return hasDigits && ch2 !== "_";
        }
        if (ch2 === "o") {
          index++;
          for (; index < max2; index++) {
            ch2 = data[index];
            if (ch2 === "_") continue;
            if (!isOctCode(data.charCodeAt(index))) return false;
            hasDigits = true;
          }
          return hasDigits && ch2 !== "_";
        }
      }
      if (ch2 === "_") return false;
      for (; index < max2; index++) {
        ch2 = data[index];
        if (ch2 === "_") continue;
        if (!isDecCode(data.charCodeAt(index))) {
          return false;
        }
        hasDigits = true;
      }
      if (!hasDigits || ch2 === "_") return false;
      return true;
    }
    function constructYamlInteger(data) {
      var value = data, sign = 1, ch2;
      if (value.indexOf("_") !== -1) {
        value = value.replace(/_/g, "");
      }
      ch2 = value[0];
      if (ch2 === "-" || ch2 === "+") {
        if (ch2 === "-") sign = -1;
        value = value.slice(1);
        ch2 = value[0];
      }
      if (value === "0") return 0;
      if (ch2 === "0") {
        if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
        if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
        if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
      }
      return sign * parseInt(value, 10);
    }
    function isInteger(object) {
      return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
    }
    module2.exports = new Type("tag:yaml.org,2002:int", {
      kind: "scalar",
      resolve: resolveYamlInteger,
      construct: constructYamlInteger,
      predicate: isInteger,
      represent: {
        binary: function(obj) {
          return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
        },
        octal: function(obj) {
          return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
        },
        decimal: function(obj) {
          return obj.toString(10);
        },
        /* eslint-disable max-len */
        hexadecimal: function(obj) {
          return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
        }
      },
      defaultStyle: "decimal",
      styleAliases: {
        binary: [2, "bin"],
        octal: [8, "oct"],
        decimal: [10, "dec"],
        hexadecimal: [16, "hex"]
      }
    });
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/float.js
var require_float = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/float.js"(exports2, module2) {
    "use strict";
    var common = require_common2();
    var Type = require_type();
    var YAML_FLOAT_PATTERN = new RegExp(
      // 2.5e4, 2.5 and integers
      "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
    );
    function resolveYamlFloat(data) {
      if (data === null) return false;
      if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
      // Probably should update regexp & check speed
      data[data.length - 1] === "_") {
        return false;
      }
      return true;
    }
    function constructYamlFloat(data) {
      var value, sign;
      value = data.replace(/_/g, "").toLowerCase();
      sign = value[0] === "-" ? -1 : 1;
      if ("+-".indexOf(value[0]) >= 0) {
        value = value.slice(1);
      }
      if (value === ".inf") {
        return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      } else if (value === ".nan") {
        return NaN;
      }
      return sign * parseFloat(value, 10);
    }
    var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
    function representYamlFloat(object, style) {
      var res;
      if (isNaN(object)) {
        switch (style) {
          case "lowercase":
            return ".nan";
          case "uppercase":
            return ".NAN";
          case "camelcase":
            return ".NaN";
        }
      } else if (Number.POSITIVE_INFINITY === object) {
        switch (style) {
          case "lowercase":
            return ".inf";
          case "uppercase":
            return ".INF";
          case "camelcase":
            return ".Inf";
        }
      } else if (Number.NEGATIVE_INFINITY === object) {
        switch (style) {
          case "lowercase":
            return "-.inf";
          case "uppercase":
            return "-.INF";
          case "camelcase":
            return "-.Inf";
        }
      } else if (common.isNegativeZero(object)) {
        return "-0.0";
      }
      res = object.toString(10);
      return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
    }
    function isFloat(object) {
      return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
    }
    module2.exports = new Type("tag:yaml.org,2002:float", {
      kind: "scalar",
      resolve: resolveYamlFloat,
      construct: constructYamlFloat,
      predicate: isFloat,
      represent: representYamlFloat,
      defaultStyle: "lowercase"
    });
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/schema/json.js
var require_json2 = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/schema/json.js"(exports2, module2) {
    "use strict";
    module2.exports = require_failsafe().extend({
      implicit: [
        require_null(),
        require_bool(),
        require_int(),
        require_float()
      ]
    });
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/schema/core.js
var require_core = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/schema/core.js"(exports2, module2) {
    "use strict";
    module2.exports = require_json2();
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/timestamp.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    var YAML_DATE_REGEXP = new RegExp(
      "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
    );
    var YAML_TIMESTAMP_REGEXP = new RegExp(
      "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
    );
    function resolveYamlTimestamp(data) {
      if (data === null) return false;
      if (YAML_DATE_REGEXP.exec(data) !== null) return true;
      if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
      return false;
    }
    function constructYamlTimestamp(data) {
      var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
      match = YAML_DATE_REGEXP.exec(data);
      if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
      if (match === null) throw new Error("Date resolve error");
      year = +match[1];
      month = +match[2] - 1;
      day = +match[3];
      if (!match[4]) {
        return new Date(Date.UTC(year, month, day));
      }
      hour = +match[4];
      minute = +match[5];
      second = +match[6];
      if (match[7]) {
        fraction = match[7].slice(0, 3);
        while (fraction.length < 3) {
          fraction += "0";
        }
        fraction = +fraction;
      }
      if (match[9]) {
        tz_hour = +match[10];
        tz_minute = +(match[11] || 0);
        delta = (tz_hour * 60 + tz_minute) * 6e4;
        if (match[9] === "-") delta = -delta;
      }
      date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
      if (delta) date.setTime(date.getTime() - delta);
      return date;
    }
    function representYamlTimestamp(object) {
      return object.toISOString();
    }
    module2.exports = new Type("tag:yaml.org,2002:timestamp", {
      kind: "scalar",
      resolve: resolveYamlTimestamp,
      construct: constructYamlTimestamp,
      instanceOf: Date,
      represent: representYamlTimestamp
    });
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/merge.js
var require_merge = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/merge.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    function resolveYamlMerge(data) {
      return data === "<<" || data === null;
    }
    module2.exports = new Type("tag:yaml.org,2002:merge", {
      kind: "scalar",
      resolve: resolveYamlMerge
    });
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/binary.js
var require_binary = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/binary.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
    function resolveYamlBinary(data) {
      if (data === null) return false;
      var code, idx, bitlen = 0, max2 = data.length, map = BASE64_MAP;
      for (idx = 0; idx < max2; idx++) {
        code = map.indexOf(data.charAt(idx));
        if (code > 64) continue;
        if (code < 0) return false;
        bitlen += 6;
      }
      return bitlen % 8 === 0;
    }
    function constructYamlBinary(data) {
      var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max2 = input.length, map = BASE64_MAP, bits2 = 0, result = [];
      for (idx = 0; idx < max2; idx++) {
        if (idx % 4 === 0 && idx) {
          result.push(bits2 >> 16 & 255);
          result.push(bits2 >> 8 & 255);
          result.push(bits2 & 255);
        }
        bits2 = bits2 << 6 | map.indexOf(input.charAt(idx));
      }
      tailbits = max2 % 4 * 6;
      if (tailbits === 0) {
        result.push(bits2 >> 16 & 255);
        result.push(bits2 >> 8 & 255);
        result.push(bits2 & 255);
      } else if (tailbits === 18) {
        result.push(bits2 >> 10 & 255);
        result.push(bits2 >> 2 & 255);
      } else if (tailbits === 12) {
        result.push(bits2 >> 4 & 255);
      }
      return new Uint8Array(result);
    }
    function representYamlBinary(object) {
      var result = "", bits2 = 0, idx, tail, max2 = object.length, map = BASE64_MAP;
      for (idx = 0; idx < max2; idx++) {
        if (idx % 3 === 0 && idx) {
          result += map[bits2 >> 18 & 63];
          result += map[bits2 >> 12 & 63];
          result += map[bits2 >> 6 & 63];
          result += map[bits2 & 63];
        }
        bits2 = (bits2 << 8) + object[idx];
      }
      tail = max2 % 3;
      if (tail === 0) {
        result += map[bits2 >> 18 & 63];
        result += map[bits2 >> 12 & 63];
        result += map[bits2 >> 6 & 63];
        result += map[bits2 & 63];
      } else if (tail === 2) {
        result += map[bits2 >> 10 & 63];
        result += map[bits2 >> 4 & 63];
        result += map[bits2 << 2 & 63];
        result += map[64];
      } else if (tail === 1) {
        result += map[bits2 >> 2 & 63];
        result += map[bits2 << 4 & 63];
        result += map[64];
        result += map[64];
      }
      return result;
    }
    function isBinary(obj) {
      return Object.prototype.toString.call(obj) === "[object Uint8Array]";
    }
    module2.exports = new Type("tag:yaml.org,2002:binary", {
      kind: "scalar",
      resolve: resolveYamlBinary,
      construct: constructYamlBinary,
      predicate: isBinary,
      represent: representYamlBinary
    });
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/omap.js
var require_omap = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/omap.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    var _hasOwnProperty = Object.prototype.hasOwnProperty;
    var _toString = Object.prototype.toString;
    function resolveYamlOmap(data) {
      if (data === null) return true;
      var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
      for (index = 0, length = object.length; index < length; index += 1) {
        pair = object[index];
        pairHasKey = false;
        if (_toString.call(pair) !== "[object Object]") return false;
        for (pairKey in pair) {
          if (_hasOwnProperty.call(pair, pairKey)) {
            if (!pairHasKey) pairHasKey = true;
            else return false;
          }
        }
        if (!pairHasKey) return false;
        if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
        else return false;
      }
      return true;
    }
    function constructYamlOmap(data) {
      return data !== null ? data : [];
    }
    module2.exports = new Type("tag:yaml.org,2002:omap", {
      kind: "sequence",
      resolve: resolveYamlOmap,
      construct: constructYamlOmap
    });
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/pairs.js
var require_pairs = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/pairs.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    var _toString = Object.prototype.toString;
    function resolveYamlPairs(data) {
      if (data === null) return true;
      var index, length, pair, keys, result, object = data;
      result = new Array(object.length);
      for (index = 0, length = object.length; index < length; index += 1) {
        pair = object[index];
        if (_toString.call(pair) !== "[object Object]") return false;
        keys = Object.keys(pair);
        if (keys.length !== 1) return false;
        result[index] = [keys[0], pair[keys[0]]];
      }
      return true;
    }
    function constructYamlPairs(data) {
      if (data === null) return [];
      var index, length, pair, keys, result, object = data;
      result = new Array(object.length);
      for (index = 0, length = object.length; index < length; index += 1) {
        pair = object[index];
        keys = Object.keys(pair);
        result[index] = [keys[0], pair[keys[0]]];
      }
      return result;
    }
    module2.exports = new Type("tag:yaml.org,2002:pairs", {
      kind: "sequence",
      resolve: resolveYamlPairs,
      construct: constructYamlPairs
    });
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/set.js
var require_set = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/type/set.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    var _hasOwnProperty = Object.prototype.hasOwnProperty;
    function resolveYamlSet(data) {
      if (data === null) return true;
      var key, object = data;
      for (key in object) {
        if (_hasOwnProperty.call(object, key)) {
          if (object[key] !== null) return false;
        }
      }
      return true;
    }
    function constructYamlSet(data) {
      return data !== null ? data : {};
    }
    module2.exports = new Type("tag:yaml.org,2002:set", {
      kind: "mapping",
      resolve: resolveYamlSet,
      construct: constructYamlSet
    });
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/schema/default.js
var require_default = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/schema/default.js"(exports2, module2) {
    "use strict";
    module2.exports = require_core().extend({
      implicit: [
        require_timestamp(),
        require_merge()
      ],
      explicit: [
        require_binary(),
        require_omap(),
        require_pairs(),
        require_set()
      ]
    });
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/loader.js
var require_loader = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/loader.js"(exports2, module2) {
    "use strict";
    var common = require_common2();
    var YAMLException = require_exception();
    var makeSnippet = require_snippet();
    var DEFAULT_SCHEMA = require_default();
    var _hasOwnProperty = Object.prototype.hasOwnProperty;
    var CONTEXT_FLOW_IN = 1;
    var CONTEXT_FLOW_OUT = 2;
    var CONTEXT_BLOCK_IN = 3;
    var CONTEXT_BLOCK_OUT = 4;
    var CHOMPING_CLIP = 1;
    var CHOMPING_STRIP = 2;
    var CHOMPING_KEEP = 3;
    var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
    var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
    var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
    var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
    var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
    function _class(obj) {
      return Object.prototype.toString.call(obj);
    }
    function is_EOL(c) {
      return c === 10 || c === 13;
    }
    function is_WHITE_SPACE(c) {
      return c === 9 || c === 32;
    }
    function is_WS_OR_EOL(c) {
      return c === 9 || c === 32 || c === 10 || c === 13;
    }
    function is_FLOW_INDICATOR(c) {
      return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
    }
    function fromHexCode(c) {
      var lc;
      if (48 <= c && c <= 57) {
        return c - 48;
      }
      lc = c | 32;
      if (97 <= lc && lc <= 102) {
        return lc - 97 + 10;
      }
      return -1;
    }
    function escapedHexLen(c) {
      if (c === 120) {
        return 2;
      }
      if (c === 117) {
        return 4;
      }
      if (c === 85) {
        return 8;
      }
      return 0;
    }
    function fromDecimalCode(c) {
      if (48 <= c && c <= 57) {
        return c - 48;
      }
      return -1;
    }
    function simpleEscapeSequence(c) {
      return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
    }
    function charFromCodepoint(c) {
      if (c <= 65535) {
        return String.fromCharCode(c);
      }
      return String.fromCharCode(
        (c - 65536 >> 10) + 55296,
        (c - 65536 & 1023) + 56320
      );
    }
    var simpleEscapeCheck = new Array(256);
    var simpleEscapeMap = new Array(256);
    for (i2 = 0; i2 < 256; i2++) {
      simpleEscapeCheck[i2] = simpleEscapeSequence(i2) ? 1 : 0;
      simpleEscapeMap[i2] = simpleEscapeSequence(i2);
    }
    var i2;
    function State2(input, options2) {
      this.input = input;
      this.filename = options2["filename"] || null;
      this.schema = options2["schema"] || DEFAULT_SCHEMA;
      this.onWarning = options2["onWarning"] || null;
      this.legacy = options2["legacy"] || false;
      this.json = options2["json"] || false;
      this.listener = options2["listener"] || null;
      this.implicitTypes = this.schema.compiledImplicit;
      this.typeMap = this.schema.compiledTypeMap;
      this.length = input.length;
      this.position = 0;
      this.line = 0;
      this.lineStart = 0;
      this.lineIndent = 0;
      this.firstTabInLine = -1;
      this.documents = [];
    }
    function generateError(state, message) {
      var mark = {
        name: state.filename,
        buffer: state.input.slice(0, -1),
        // omit trailing \0
        position: state.position,
        line: state.line,
        column: state.position - state.lineStart
      };
      mark.snippet = makeSnippet(mark);
      return new YAMLException(message, mark);
    }
    function throwError(state, message) {
      throw generateError(state, message);
    }
    function throwWarning(state, message) {
      if (state.onWarning) {
        state.onWarning.call(null, generateError(state, message));
      }
    }
    var directiveHandlers = {
      YAML: function handleYamlDirective(state, name, args2) {
        var match, major, minor;
        if (state.version !== null) {
          throwError(state, "duplication of %YAML directive");
        }
        if (args2.length !== 1) {
          throwError(state, "YAML directive accepts exactly one argument");
        }
        match = /^([0-9]+)\.([0-9]+)$/.exec(args2[0]);
        if (match === null) {
          throwError(state, "ill-formed argument of the YAML directive");
        }
        major = parseInt(match[1], 10);
        minor = parseInt(match[2], 10);
        if (major !== 1) {
          throwError(state, "unacceptable YAML version of the document");
        }
        state.version = args2[0];
        state.checkLineBreaks = minor < 2;
        if (minor !== 1 && minor !== 2) {
          throwWarning(state, "unsupported YAML version of the document");
        }
      },
      TAG: function handleTagDirective(state, name, args2) {
        var handle2, prefix;
        if (args2.length !== 2) {
          throwError(state, "TAG directive accepts exactly two arguments");
        }
        handle2 = args2[0];
        prefix = args2[1];
        if (!PATTERN_TAG_HANDLE.test(handle2)) {
          throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
        }
        if (_hasOwnProperty.call(state.tagMap, handle2)) {
          throwError(state, 'there is a previously declared suffix for "' + handle2 + '" tag handle');
        }
        if (!PATTERN_TAG_URI.test(prefix)) {
          throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
        }
        try {
          prefix = decodeURIComponent(prefix);
        } catch (err2) {
          throwError(state, "tag prefix is malformed: " + prefix);
        }
        state.tagMap[handle2] = prefix;
      }
    };
    function captureSegment(state, start, end, checkJson) {
      var _position, _length, _character, _result;
      if (start < end) {
        _result = state.input.slice(start, end);
        if (checkJson) {
          for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
            _character = _result.charCodeAt(_position);
            if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
              throwError(state, "expected valid JSON character");
            }
          }
        } else if (PATTERN_NON_PRINTABLE.test(_result)) {
          throwError(state, "the stream contains non-printable characters");
        }
        state.result += _result;
      }
    }
    function mergeMappings(state, destination, source, overridableKeys) {
      var sourceKeys, key, index, quantity;
      if (!common.isObject(source)) {
        throwError(state, "cannot merge mappings; the provided source object is unacceptable");
      }
      sourceKeys = Object.keys(source);
      for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
        key = sourceKeys[index];
        if (!_hasOwnProperty.call(destination, key)) {
          destination[key] = source[key];
          overridableKeys[key] = true;
        }
      }
    }
    function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
      var index, quantity;
      if (Array.isArray(keyNode)) {
        keyNode = Array.prototype.slice.call(keyNode);
        for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
          if (Array.isArray(keyNode[index])) {
            throwError(state, "nested arrays are not supported inside keys");
          }
          if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
            keyNode[index] = "[object Object]";
          }
        }
      }
      if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
        keyNode = "[object Object]";
      }
      keyNode = String(keyNode);
      if (_result === null) {
        _result = {};
      }
      if (keyTag === "tag:yaml.org,2002:merge") {
        if (Array.isArray(valueNode)) {
          for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
            mergeMappings(state, _result, valueNode[index], overridableKeys);
          }
        } else {
          mergeMappings(state, _result, valueNode, overridableKeys);
        }
      } else {
        if (!state.json && !_hasOwnProperty.call(overridableKeys, keyNode) && _hasOwnProperty.call(_result, keyNode)) {
          state.line = startLine || state.line;
          state.lineStart = startLineStart || state.lineStart;
          state.position = startPos || state.position;
          throwError(state, "duplicated mapping key");
        }
        if (keyNode === "__proto__") {
          Object.defineProperty(_result, keyNode, {
            configurable: true,
            enumerable: true,
            writable: true,
            value: valueNode
          });
        } else {
          _result[keyNode] = valueNode;
        }
        delete overridableKeys[keyNode];
      }
      return _result;
    }
    function readLineBreak(state) {
      var ch2;
      ch2 = state.input.charCodeAt(state.position);
      if (ch2 === 10) {
        state.position++;
      } else if (ch2 === 13) {
        state.position++;
        if (state.input.charCodeAt(state.position) === 10) {
          state.position++;
        }
      } else {
        throwError(state, "a line break is expected");
      }
      state.line += 1;
      state.lineStart = state.position;
      state.firstTabInLine = -1;
    }
    function skipSeparationSpace(state, allowComments, checkIndent) {
      var lineBreaks = 0, ch2 = state.input.charCodeAt(state.position);
      while (ch2 !== 0) {
        while (is_WHITE_SPACE(ch2)) {
          if (ch2 === 9 && state.firstTabInLine === -1) {
            state.firstTabInLine = state.position;
          }
          ch2 = state.input.charCodeAt(++state.position);
        }
        if (allowComments && ch2 === 35) {
          do {
            ch2 = state.input.charCodeAt(++state.position);
          } while (ch2 !== 10 && ch2 !== 13 && ch2 !== 0);
        }
        if (is_EOL(ch2)) {
          readLineBreak(state);
          ch2 = state.input.charCodeAt(state.position);
          lineBreaks++;
          state.lineIndent = 0;
          while (ch2 === 32) {
            state.lineIndent++;
            ch2 = state.input.charCodeAt(++state.position);
          }
        } else {
          break;
        }
      }
      if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
        throwWarning(state, "deficient indentation");
      }
      return lineBreaks;
    }
    function testDocumentSeparator(state) {
      var _position = state.position, ch2;
      ch2 = state.input.charCodeAt(_position);
      if ((ch2 === 45 || ch2 === 46) && ch2 === state.input.charCodeAt(_position + 1) && ch2 === state.input.charCodeAt(_position + 2)) {
        _position += 3;
        ch2 = state.input.charCodeAt(_position);
        if (ch2 === 0 || is_WS_OR_EOL(ch2)) {
          return true;
        }
      }
      return false;
    }
    function writeFoldedLines(state, count) {
      if (count === 1) {
        state.result += " ";
      } else if (count > 1) {
        state.result += common.repeat("\n", count - 1);
      }
    }
    function readPlainScalar(state, nodeIndent, withinFlowCollection) {
      var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch2;
      ch2 = state.input.charCodeAt(state.position);
      if (is_WS_OR_EOL(ch2) || is_FLOW_INDICATOR(ch2) || ch2 === 35 || ch2 === 38 || ch2 === 42 || ch2 === 33 || ch2 === 124 || ch2 === 62 || ch2 === 39 || ch2 === 34 || ch2 === 37 || ch2 === 64 || ch2 === 96) {
        return false;
      }
      if (ch2 === 63 || ch2 === 45) {
        following = state.input.charCodeAt(state.position + 1);
        if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
          return false;
        }
      }
      state.kind = "scalar";
      state.result = "";
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
      while (ch2 !== 0) {
        if (ch2 === 58) {
          following = state.input.charCodeAt(state.position + 1);
          if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
            break;
          }
        } else if (ch2 === 35) {
          preceding = state.input.charCodeAt(state.position - 1);
          if (is_WS_OR_EOL(preceding)) {
            break;
          }
        } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch2)) {
          break;
        } else if (is_EOL(ch2)) {
          _line = state.line;
          _lineStart = state.lineStart;
          _lineIndent = state.lineIndent;
          skipSeparationSpace(state, false, -1);
          if (state.lineIndent >= nodeIndent) {
            hasPendingContent = true;
            ch2 = state.input.charCodeAt(state.position);
            continue;
          } else {
            state.position = captureEnd;
            state.line = _line;
            state.lineStart = _lineStart;
            state.lineIndent = _lineIndent;
            break;
          }
        }
        if (hasPendingContent) {
          captureSegment(state, captureStart, captureEnd, false);
          writeFoldedLines(state, state.line - _line);
          captureStart = captureEnd = state.position;
          hasPendingContent = false;
        }
        if (!is_WHITE_SPACE(ch2)) {
          captureEnd = state.position + 1;
        }
        ch2 = state.input.charCodeAt(++state.position);
      }
      captureSegment(state, captureStart, captureEnd, false);
      if (state.result) {
        return true;
      }
      state.kind = _kind;
      state.result = _result;
      return false;
    }
    function readSingleQuotedScalar(state, nodeIndent) {
      var ch2, captureStart, captureEnd;
      ch2 = state.input.charCodeAt(state.position);
      if (ch2 !== 39) {
        return false;
      }
      state.kind = "scalar";
      state.result = "";
      state.position++;
      captureStart = captureEnd = state.position;
      while ((ch2 = state.input.charCodeAt(state.position)) !== 0) {
        if (ch2 === 39) {
          captureSegment(state, captureStart, state.position, true);
          ch2 = state.input.charCodeAt(++state.position);
          if (ch2 === 39) {
            captureStart = state.position;
            state.position++;
            captureEnd = state.position;
          } else {
            return true;
          }
        } else if (is_EOL(ch2)) {
          captureSegment(state, captureStart, captureEnd, true);
          writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
          captureStart = captureEnd = state.position;
        } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
          throwError(state, "unexpected end of the document within a single quoted scalar");
        } else {
          state.position++;
          captureEnd = state.position;
        }
      }
      throwError(state, "unexpected end of the stream within a single quoted scalar");
    }
    function readDoubleQuotedScalar(state, nodeIndent) {
      var captureStart, captureEnd, hexLength, hexResult, tmp, ch2;
      ch2 = state.input.charCodeAt(state.position);
      if (ch2 !== 34) {
        return false;
      }
      state.kind = "scalar";
      state.result = "";
      state.position++;
      captureStart = captureEnd = state.position;
      while ((ch2 = state.input.charCodeAt(state.position)) !== 0) {
        if (ch2 === 34) {
          captureSegment(state, captureStart, state.position, true);
          state.position++;
          return true;
        } else if (ch2 === 92) {
          captureSegment(state, captureStart, state.position, true);
          ch2 = state.input.charCodeAt(++state.position);
          if (is_EOL(ch2)) {
            skipSeparationSpace(state, false, nodeIndent);
          } else if (ch2 < 256 && simpleEscapeCheck[ch2]) {
            state.result += simpleEscapeMap[ch2];
            state.position++;
          } else if ((tmp = escapedHexLen(ch2)) > 0) {
            hexLength = tmp;
            hexResult = 0;
            for (; hexLength > 0; hexLength--) {
              ch2 = state.input.charCodeAt(++state.position);
              if ((tmp = fromHexCode(ch2)) >= 0) {
                hexResult = (hexResult << 4) + tmp;
              } else {
                throwError(state, "expected hexadecimal character");
              }
            }
            state.result += charFromCodepoint(hexResult);
            state.position++;
          } else {
            throwError(state, "unknown escape sequence");
          }
          captureStart = captureEnd = state.position;
        } else if (is_EOL(ch2)) {
          captureSegment(state, captureStart, captureEnd, true);
          writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
          captureStart = captureEnd = state.position;
        } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
          throwError(state, "unexpected end of the document within a double quoted scalar");
        } else {
          state.position++;
          captureEnd = state.position;
        }
      }
      throwError(state, "unexpected end of the stream within a double quoted scalar");
    }
    function readFlowCollection(state, nodeIndent) {
      var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch2;
      ch2 = state.input.charCodeAt(state.position);
      if (ch2 === 91) {
        terminator = 93;
        isMapping = false;
        _result = [];
      } else if (ch2 === 123) {
        terminator = 125;
        isMapping = true;
        _result = {};
      } else {
        return false;
      }
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = _result;
      }
      ch2 = state.input.charCodeAt(++state.position);
      while (ch2 !== 0) {
        skipSeparationSpace(state, true, nodeIndent);
        ch2 = state.input.charCodeAt(state.position);
        if (ch2 === terminator) {
          state.position++;
          state.tag = _tag;
          state.anchor = _anchor;
          state.kind = isMapping ? "mapping" : "sequence";
          state.result = _result;
          return true;
        } else if (!readNext) {
          throwError(state, "missed comma between flow collection entries");
        } else if (ch2 === 44) {
          throwError(state, "expected the node content, but found ','");
        }
        keyTag = keyNode = valueNode = null;
        isPair = isExplicitPair = false;
        if (ch2 === 63) {
          following = state.input.charCodeAt(state.position + 1);
          if (is_WS_OR_EOL(following)) {
            isPair = isExplicitPair = true;
            state.position++;
            skipSeparationSpace(state, true, nodeIndent);
          }
        }
        _line = state.line;
        _lineStart = state.lineStart;
        _pos = state.position;
        composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
        keyTag = state.tag;
        keyNode = state.result;
        skipSeparationSpace(state, true, nodeIndent);
        ch2 = state.input.charCodeAt(state.position);
        if ((isExplicitPair || state.line === _line) && ch2 === 58) {
          isPair = true;
          ch2 = state.input.charCodeAt(++state.position);
          skipSeparationSpace(state, true, nodeIndent);
          composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
          valueNode = state.result;
        }
        if (isMapping) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
        } else if (isPair) {
          _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
        } else {
          _result.push(keyNode);
        }
        skipSeparationSpace(state, true, nodeIndent);
        ch2 = state.input.charCodeAt(state.position);
        if (ch2 === 44) {
          readNext = true;
          ch2 = state.input.charCodeAt(++state.position);
        } else {
          readNext = false;
        }
      }
      throwError(state, "unexpected end of the stream within a flow collection");
    }
    function readBlockScalar(state, nodeIndent) {
      var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch2;
      ch2 = state.input.charCodeAt(state.position);
      if (ch2 === 124) {
        folding = false;
      } else if (ch2 === 62) {
        folding = true;
      } else {
        return false;
      }
      state.kind = "scalar";
      state.result = "";
      while (ch2 !== 0) {
        ch2 = state.input.charCodeAt(++state.position);
        if (ch2 === 43 || ch2 === 45) {
          if (CHOMPING_CLIP === chomping) {
            chomping = ch2 === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
          } else {
            throwError(state, "repeat of a chomping mode identifier");
          }
        } else if ((tmp = fromDecimalCode(ch2)) >= 0) {
          if (tmp === 0) {
            throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
          } else if (!detectedIndent) {
            textIndent = nodeIndent + tmp - 1;
            detectedIndent = true;
          } else {
            throwError(state, "repeat of an indentation width identifier");
          }
        } else {
          break;
        }
      }
      if (is_WHITE_SPACE(ch2)) {
        do {
          ch2 = state.input.charCodeAt(++state.position);
        } while (is_WHITE_SPACE(ch2));
        if (ch2 === 35) {
          do {
            ch2 = state.input.charCodeAt(++state.position);
          } while (!is_EOL(ch2) && ch2 !== 0);
        }
      }
      while (ch2 !== 0) {
        readLineBreak(state);
        state.lineIndent = 0;
        ch2 = state.input.charCodeAt(state.position);
        while ((!detectedIndent || state.lineIndent < textIndent) && ch2 === 32) {
          state.lineIndent++;
          ch2 = state.input.charCodeAt(++state.position);
        }
        if (!detectedIndent && state.lineIndent > textIndent) {
          textIndent = state.lineIndent;
        }
        if (is_EOL(ch2)) {
          emptyLines++;
          continue;
        }
        if (state.lineIndent < textIndent) {
          if (chomping === CHOMPING_KEEP) {
            state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
          } else if (chomping === CHOMPING_CLIP) {
            if (didReadContent) {
              state.result += "\n";
            }
          }
          break;
        }
        if (folding) {
          if (is_WHITE_SPACE(ch2)) {
            atMoreIndented = true;
            state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
          } else if (atMoreIndented) {
            atMoreIndented = false;
            state.result += common.repeat("\n", emptyLines + 1);
          } else if (emptyLines === 0) {
            if (didReadContent) {
              state.result += " ";
            }
          } else {
            state.result += common.repeat("\n", emptyLines);
          }
        } else {
          state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        }
        didReadContent = true;
        detectedIndent = true;
        emptyLines = 0;
        captureStart = state.position;
        while (!is_EOL(ch2) && ch2 !== 0) {
          ch2 = state.input.charCodeAt(++state.position);
        }
        captureSegment(state, captureStart, state.position, false);
      }
      return true;
    }
    function readBlockSequence(state, nodeIndent) {
      var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch2;
      if (state.firstTabInLine !== -1) return false;
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = _result;
      }
      ch2 = state.input.charCodeAt(state.position);
      while (ch2 !== 0) {
        if (state.firstTabInLine !== -1) {
          state.position = state.firstTabInLine;
          throwError(state, "tab characters must not be used in indentation");
        }
        if (ch2 !== 45) {
          break;
        }
        following = state.input.charCodeAt(state.position + 1);
        if (!is_WS_OR_EOL(following)) {
          break;
        }
        detected = true;
        state.position++;
        if (skipSeparationSpace(state, true, -1)) {
          if (state.lineIndent <= nodeIndent) {
            _result.push(null);
            ch2 = state.input.charCodeAt(state.position);
            continue;
          }
        }
        _line = state.line;
        composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
        _result.push(state.result);
        skipSeparationSpace(state, true, -1);
        ch2 = state.input.charCodeAt(state.position);
        if ((state.line === _line || state.lineIndent > nodeIndent) && ch2 !== 0) {
          throwError(state, "bad indentation of a sequence entry");
        } else if (state.lineIndent < nodeIndent) {
          break;
        }
      }
      if (detected) {
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = "sequence";
        state.result = _result;
        return true;
      }
      return false;
    }
    function readBlockMapping(state, nodeIndent, flowIndent) {
      var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch2;
      if (state.firstTabInLine !== -1) return false;
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = _result;
      }
      ch2 = state.input.charCodeAt(state.position);
      while (ch2 !== 0) {
        if (!atExplicitKey && state.firstTabInLine !== -1) {
          state.position = state.firstTabInLine;
          throwError(state, "tab characters must not be used in indentation");
        }
        following = state.input.charCodeAt(state.position + 1);
        _line = state.line;
        if ((ch2 === 63 || ch2 === 58) && is_WS_OR_EOL(following)) {
          if (ch2 === 63) {
            if (atExplicitKey) {
              storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
              keyTag = keyNode = valueNode = null;
            }
            detected = true;
            atExplicitKey = true;
            allowCompact = true;
          } else if (atExplicitKey) {
            atExplicitKey = false;
            allowCompact = true;
          } else {
            throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
          }
          state.position += 1;
          ch2 = following;
        } else {
          _keyLine = state.line;
          _keyLineStart = state.lineStart;
          _keyPos = state.position;
          if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
            break;
          }
          if (state.line === _line) {
            ch2 = state.input.charCodeAt(state.position);
            while (is_WHITE_SPACE(ch2)) {
              ch2 = state.input.charCodeAt(++state.position);
            }
            if (ch2 === 58) {
              ch2 = state.input.charCodeAt(++state.position);
              if (!is_WS_OR_EOL(ch2)) {
                throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
              }
              if (atExplicitKey) {
                storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
                keyTag = keyNode = valueNode = null;
              }
              detected = true;
              atExplicitKey = false;
              allowCompact = false;
              keyTag = state.tag;
              keyNode = state.result;
            } else if (detected) {
              throwError(state, "can not read an implicit mapping pair; a colon is missed");
            } else {
              state.tag = _tag;
              state.anchor = _anchor;
              return true;
            }
          } else if (detected) {
            throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
          } else {
            state.tag = _tag;
            state.anchor = _anchor;
            return true;
          }
        }
        if (state.line === _line || state.lineIndent > nodeIndent) {
          if (atExplicitKey) {
            _keyLine = state.line;
            _keyLineStart = state.lineStart;
            _keyPos = state.position;
          }
          if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
            if (atExplicitKey) {
              keyNode = state.result;
            } else {
              valueNode = state.result;
            }
          }
          if (!atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          skipSeparationSpace(state, true, -1);
          ch2 = state.input.charCodeAt(state.position);
        }
        if ((state.line === _line || state.lineIndent > nodeIndent) && ch2 !== 0) {
          throwError(state, "bad indentation of a mapping entry");
        } else if (state.lineIndent < nodeIndent) {
          break;
        }
      }
      if (atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
      }
      if (detected) {
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = "mapping";
        state.result = _result;
      }
      return detected;
    }
    function readTagProperty(state) {
      var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch2;
      ch2 = state.input.charCodeAt(state.position);
      if (ch2 !== 33) return false;
      if (state.tag !== null) {
        throwError(state, "duplication of a tag property");
      }
      ch2 = state.input.charCodeAt(++state.position);
      if (ch2 === 60) {
        isVerbatim = true;
        ch2 = state.input.charCodeAt(++state.position);
      } else if (ch2 === 33) {
        isNamed = true;
        tagHandle = "!!";
        ch2 = state.input.charCodeAt(++state.position);
      } else {
        tagHandle = "!";
      }
      _position = state.position;
      if (isVerbatim) {
        do {
          ch2 = state.input.charCodeAt(++state.position);
        } while (ch2 !== 0 && ch2 !== 62);
        if (state.position < state.length) {
          tagName = state.input.slice(_position, state.position);
          ch2 = state.input.charCodeAt(++state.position);
        } else {
          throwError(state, "unexpected end of the stream within a verbatim tag");
        }
      } else {
        while (ch2 !== 0 && !is_WS_OR_EOL(ch2)) {
          if (ch2 === 33) {
            if (!isNamed) {
              tagHandle = state.input.slice(_position - 1, state.position + 1);
              if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
                throwError(state, "named tag handle cannot contain such characters");
              }
              isNamed = true;
              _position = state.position + 1;
            } else {
              throwError(state, "tag suffix cannot contain exclamation marks");
            }
          }
          ch2 = state.input.charCodeAt(++state.position);
        }
        tagName = state.input.slice(_position, state.position);
        if (PATTERN_FLOW_INDICATORS.test(tagName)) {
          throwError(state, "tag suffix cannot contain flow indicator characters");
        }
      }
      if (tagName && !PATTERN_TAG_URI.test(tagName)) {
        throwError(state, "tag name cannot contain such characters: " + tagName);
      }
      try {
        tagName = decodeURIComponent(tagName);
      } catch (err2) {
        throwError(state, "tag name is malformed: " + tagName);
      }
      if (isVerbatim) {
        state.tag = tagName;
      } else if (_hasOwnProperty.call(state.tagMap, tagHandle)) {
        state.tag = state.tagMap[tagHandle] + tagName;
      } else if (tagHandle === "!") {
        state.tag = "!" + tagName;
      } else if (tagHandle === "!!") {
        state.tag = "tag:yaml.org,2002:" + tagName;
      } else {
        throwError(state, 'undeclared tag handle "' + tagHandle + '"');
      }
      return true;
    }
    function readAnchorProperty(state) {
      var _position, ch2;
      ch2 = state.input.charCodeAt(state.position);
      if (ch2 !== 38) return false;
      if (state.anchor !== null) {
        throwError(state, "duplication of an anchor property");
      }
      ch2 = state.input.charCodeAt(++state.position);
      _position = state.position;
      while (ch2 !== 0 && !is_WS_OR_EOL(ch2) && !is_FLOW_INDICATOR(ch2)) {
        ch2 = state.input.charCodeAt(++state.position);
      }
      if (state.position === _position) {
        throwError(state, "name of an anchor node must contain at least one character");
      }
      state.anchor = state.input.slice(_position, state.position);
      return true;
    }
    function readAlias(state) {
      var _position, alias, ch2;
      ch2 = state.input.charCodeAt(state.position);
      if (ch2 !== 42) return false;
      ch2 = state.input.charCodeAt(++state.position);
      _position = state.position;
      while (ch2 !== 0 && !is_WS_OR_EOL(ch2) && !is_FLOW_INDICATOR(ch2)) {
        ch2 = state.input.charCodeAt(++state.position);
      }
      if (state.position === _position) {
        throwError(state, "name of an alias node must contain at least one character");
      }
      alias = state.input.slice(_position, state.position);
      if (!_hasOwnProperty.call(state.anchorMap, alias)) {
        throwError(state, 'unidentified alias "' + alias + '"');
      }
      state.result = state.anchorMap[alias];
      skipSeparationSpace(state, true, -1);
      return true;
    }
    function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
      var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type, flowIndent, blockIndent;
      if (state.listener !== null) {
        state.listener("open", state);
      }
      state.tag = null;
      state.anchor = null;
      state.kind = null;
      state.result = null;
      allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
      if (allowToSeek) {
        if (skipSeparationSpace(state, true, -1)) {
          atNewLine = true;
          if (state.lineIndent > parentIndent) {
            indentStatus = 1;
          } else if (state.lineIndent === parentIndent) {
            indentStatus = 0;
          } else if (state.lineIndent < parentIndent) {
            indentStatus = -1;
          }
        }
      }
      if (indentStatus === 1) {
        while (readTagProperty(state) || readAnchorProperty(state)) {
          if (skipSeparationSpace(state, true, -1)) {
            atNewLine = true;
            allowBlockCollections = allowBlockStyles;
            if (state.lineIndent > parentIndent) {
              indentStatus = 1;
            } else if (state.lineIndent === parentIndent) {
              indentStatus = 0;
            } else if (state.lineIndent < parentIndent) {
              indentStatus = -1;
            }
          } else {
            allowBlockCollections = false;
          }
        }
      }
      if (allowBlockCollections) {
        allowBlockCollections = atNewLine || allowCompact;
      }
      if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
        if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
          flowIndent = parentIndent;
        } else {
          flowIndent = parentIndent + 1;
        }
        blockIndent = state.position - state.lineStart;
        if (indentStatus === 1) {
          if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
            hasContent = true;
          } else {
            if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
              hasContent = true;
            } else if (readAlias(state)) {
              hasContent = true;
              if (state.tag !== null || state.anchor !== null) {
                throwError(state, "alias node should not have any properties");
              }
            } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
              hasContent = true;
              if (state.tag === null) {
                state.tag = "?";
              }
            }
            if (state.anchor !== null) {
              state.anchorMap[state.anchor] = state.result;
            }
          }
        } else if (indentStatus === 0) {
          hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
        }
      }
      if (state.tag === null) {
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      } else if (state.tag === "?") {
        if (state.result !== null && state.kind !== "scalar") {
          throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
        }
        for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
          type = state.implicitTypes[typeIndex];
          if (type.resolve(state.result)) {
            state.result = type.construct(state.result);
            state.tag = type.tag;
            if (state.anchor !== null) {
              state.anchorMap[state.anchor] = state.result;
            }
            break;
          }
        }
      } else if (state.tag !== "!") {
        if (_hasOwnProperty.call(state.typeMap[state.kind || "fallback"], state.tag)) {
          type = state.typeMap[state.kind || "fallback"][state.tag];
        } else {
          type = null;
          typeList = state.typeMap.multi[state.kind || "fallback"];
          for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
            if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
              type = typeList[typeIndex];
              break;
            }
          }
        }
        if (!type) {
          throwError(state, "unknown tag !<" + state.tag + ">");
        }
        if (state.result !== null && type.kind !== state.kind) {
          throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type.kind + '", not "' + state.kind + '"');
        }
        if (!type.resolve(state.result, state.tag)) {
          throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
        } else {
          state.result = type.construct(state.result, state.tag);
          if (state.anchor !== null) {
            state.anchorMap[state.anchor] = state.result;
          }
        }
      }
      if (state.listener !== null) {
        state.listener("close", state);
      }
      return state.tag !== null || state.anchor !== null || hasContent;
    }
    function readDocument(state) {
      var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch2;
      state.version = null;
      state.checkLineBreaks = state.legacy;
      state.tagMap = /* @__PURE__ */ Object.create(null);
      state.anchorMap = /* @__PURE__ */ Object.create(null);
      while ((ch2 = state.input.charCodeAt(state.position)) !== 0) {
        skipSeparationSpace(state, true, -1);
        ch2 = state.input.charCodeAt(state.position);
        if (state.lineIndent > 0 || ch2 !== 37) {
          break;
        }
        hasDirectives = true;
        ch2 = state.input.charCodeAt(++state.position);
        _position = state.position;
        while (ch2 !== 0 && !is_WS_OR_EOL(ch2)) {
          ch2 = state.input.charCodeAt(++state.position);
        }
        directiveName = state.input.slice(_position, state.position);
        directiveArgs = [];
        if (directiveName.length < 1) {
          throwError(state, "directive name must not be less than one character in length");
        }
        while (ch2 !== 0) {
          while (is_WHITE_SPACE(ch2)) {
            ch2 = state.input.charCodeAt(++state.position);
          }
          if (ch2 === 35) {
            do {
              ch2 = state.input.charCodeAt(++state.position);
            } while (ch2 !== 0 && !is_EOL(ch2));
            break;
          }
          if (is_EOL(ch2)) break;
          _position = state.position;
          while (ch2 !== 0 && !is_WS_OR_EOL(ch2)) {
            ch2 = state.input.charCodeAt(++state.position);
          }
          directiveArgs.push(state.input.slice(_position, state.position));
        }
        if (ch2 !== 0) readLineBreak(state);
        if (_hasOwnProperty.call(directiveHandlers, directiveName)) {
          directiveHandlers[directiveName](state, directiveName, directiveArgs);
        } else {
          throwWarning(state, 'unknown document directive "' + directiveName + '"');
        }
      }
      skipSeparationSpace(state, true, -1);
      if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
        state.position += 3;
        skipSeparationSpace(state, true, -1);
      } else if (hasDirectives) {
        throwError(state, "directives end mark is expected");
      }
      composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
      skipSeparationSpace(state, true, -1);
      if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
        throwWarning(state, "non-ASCII line breaks are interpreted as content");
      }
      state.documents.push(state.result);
      if (state.position === state.lineStart && testDocumentSeparator(state)) {
        if (state.input.charCodeAt(state.position) === 46) {
          state.position += 3;
          skipSeparationSpace(state, true, -1);
        }
        return;
      }
      if (state.position < state.length - 1) {
        throwError(state, "end of the stream or a document separator is expected");
      } else {
        return;
      }
    }
    function loadDocuments(input, options2) {
      input = String(input);
      options2 = options2 || {};
      if (input.length !== 0) {
        if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
          input += "\n";
        }
        if (input.charCodeAt(0) === 65279) {
          input = input.slice(1);
        }
      }
      var state = new State2(input, options2);
      var nullpos = input.indexOf("\0");
      if (nullpos !== -1) {
        state.position = nullpos;
        throwError(state, "null byte is not allowed in input");
      }
      state.input += "\0";
      while (state.input.charCodeAt(state.position) === 32) {
        state.lineIndent += 1;
        state.position += 1;
      }
      while (state.position < state.length - 1) {
        readDocument(state);
      }
      return state.documents;
    }
    function loadAll(input, iterator, options2) {
      if (iterator !== null && typeof iterator === "object" && typeof options2 === "undefined") {
        options2 = iterator;
        iterator = null;
      }
      var documents = loadDocuments(input, options2);
      if (typeof iterator !== "function") {
        return documents;
      }
      for (var index = 0, length = documents.length; index < length; index += 1) {
        iterator(documents[index]);
      }
    }
    function load(input, options2) {
      var documents = loadDocuments(input, options2);
      if (documents.length === 0) {
        return void 0;
      } else if (documents.length === 1) {
        return documents[0];
      }
      throw new YAMLException("expected a single document in the stream, but found more");
    }
    module2.exports.loadAll = loadAll;
    module2.exports.load = load;
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/dumper.js
var require_dumper = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/lib/dumper.js"(exports2, module2) {
    "use strict";
    var common = require_common2();
    var YAMLException = require_exception();
    var DEFAULT_SCHEMA = require_default();
    var _toString = Object.prototype.toString;
    var _hasOwnProperty = Object.prototype.hasOwnProperty;
    var CHAR_BOM = 65279;
    var CHAR_TAB = 9;
    var CHAR_LINE_FEED = 10;
    var CHAR_CARRIAGE_RETURN = 13;
    var CHAR_SPACE = 32;
    var CHAR_EXCLAMATION = 33;
    var CHAR_DOUBLE_QUOTE = 34;
    var CHAR_SHARP = 35;
    var CHAR_PERCENT = 37;
    var CHAR_AMPERSAND = 38;
    var CHAR_SINGLE_QUOTE = 39;
    var CHAR_ASTERISK = 42;
    var CHAR_COMMA = 44;
    var CHAR_MINUS = 45;
    var CHAR_COLON = 58;
    var CHAR_EQUALS = 61;
    var CHAR_GREATER_THAN = 62;
    var CHAR_QUESTION = 63;
    var CHAR_COMMERCIAL_AT = 64;
    var CHAR_LEFT_SQUARE_BRACKET = 91;
    var CHAR_RIGHT_SQUARE_BRACKET = 93;
    var CHAR_GRAVE_ACCENT = 96;
    var CHAR_LEFT_CURLY_BRACKET = 123;
    var CHAR_VERTICAL_LINE = 124;
    var CHAR_RIGHT_CURLY_BRACKET = 125;
    var ESCAPE_SEQUENCES = {};
    ESCAPE_SEQUENCES[0] = "\\0";
    ESCAPE_SEQUENCES[7] = "\\a";
    ESCAPE_SEQUENCES[8] = "\\b";
    ESCAPE_SEQUENCES[9] = "\\t";
    ESCAPE_SEQUENCES[10] = "\\n";
    ESCAPE_SEQUENCES[11] = "\\v";
    ESCAPE_SEQUENCES[12] = "\\f";
    ESCAPE_SEQUENCES[13] = "\\r";
    ESCAPE_SEQUENCES[27] = "\\e";
    ESCAPE_SEQUENCES[34] = '\\"';
    ESCAPE_SEQUENCES[92] = "\\\\";
    ESCAPE_SEQUENCES[133] = "\\N";
    ESCAPE_SEQUENCES[160] = "\\_";
    ESCAPE_SEQUENCES[8232] = "\\L";
    ESCAPE_SEQUENCES[8233] = "\\P";
    var DEPRECATED_BOOLEANS_SYNTAX = [
      "y",
      "Y",
      "yes",
      "Yes",
      "YES",
      "on",
      "On",
      "ON",
      "n",
      "N",
      "no",
      "No",
      "NO",
      "off",
      "Off",
      "OFF"
    ];
    var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
    function compileStyleMap(schema, map) {
      var result, keys, index, length, tag, style, type;
      if (map === null) return {};
      result = {};
      keys = Object.keys(map);
      for (index = 0, length = keys.length; index < length; index += 1) {
        tag = keys[index];
        style = String(map[tag]);
        if (tag.slice(0, 2) === "!!") {
          tag = "tag:yaml.org,2002:" + tag.slice(2);
        }
        type = schema.compiledTypeMap["fallback"][tag];
        if (type && _hasOwnProperty.call(type.styleAliases, style)) {
          style = type.styleAliases[style];
        }
        result[tag] = style;
      }
      return result;
    }
    function encodeHex(character) {
      var string, handle2, length;
      string = character.toString(16).toUpperCase();
      if (character <= 255) {
        handle2 = "x";
        length = 2;
      } else if (character <= 65535) {
        handle2 = "u";
        length = 4;
      } else if (character <= 4294967295) {
        handle2 = "U";
        length = 8;
      } else {
        throw new YAMLException("code point within a string may not be greater than 0xFFFFFFFF");
      }
      return "\\" + handle2 + common.repeat("0", length - string.length) + string;
    }
    var QUOTING_TYPE_SINGLE = 1;
    var QUOTING_TYPE_DOUBLE = 2;
    function State2(options2) {
      this.schema = options2["schema"] || DEFAULT_SCHEMA;
      this.indent = Math.max(1, options2["indent"] || 2);
      this.noArrayIndent = options2["noArrayIndent"] || false;
      this.skipInvalid = options2["skipInvalid"] || false;
      this.flowLevel = common.isNothing(options2["flowLevel"]) ? -1 : options2["flowLevel"];
      this.styleMap = compileStyleMap(this.schema, options2["styles"] || null);
      this.sortKeys = options2["sortKeys"] || false;
      this.lineWidth = options2["lineWidth"] || 80;
      this.noRefs = options2["noRefs"] || false;
      this.noCompatMode = options2["noCompatMode"] || false;
      this.condenseFlow = options2["condenseFlow"] || false;
      this.quotingType = options2["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
      this.forceQuotes = options2["forceQuotes"] || false;
      this.replacer = typeof options2["replacer"] === "function" ? options2["replacer"] : null;
      this.implicitTypes = this.schema.compiledImplicit;
      this.explicitTypes = this.schema.compiledExplicit;
      this.tag = null;
      this.result = "";
      this.duplicates = [];
      this.usedDuplicates = null;
    }
    function indentString(string, spaces) {
      var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
      while (position < length) {
        next = string.indexOf("\n", position);
        if (next === -1) {
          line = string.slice(position);
          position = length;
        } else {
          line = string.slice(position, next + 1);
          position = next + 1;
        }
        if (line.length && line !== "\n") result += ind;
        result += line;
      }
      return result;
    }
    function generateNextLine(state, level) {
      return "\n" + common.repeat(" ", state.indent * level);
    }
    function testImplicitResolving(state, str) {
      var index, length, type;
      for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
        type = state.implicitTypes[index];
        if (type.resolve(str)) {
          return true;
        }
      }
      return false;
    }
    function isWhitespace(c) {
      return c === CHAR_SPACE || c === CHAR_TAB;
    }
    function isPrintable(c) {
      return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
    }
    function isNsCharOrWhitespace(c) {
      return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
    }
    function isPlainSafe(c, prev, inblock) {
      var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
      var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
      return (
        // ns-plain-safe
        (inblock ? (
          // c = flow-in
          cIsNsCharOrWhitespace
        ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
      );
    }
    function isPlainSafeFirst(c) {
      return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
    }
    function isPlainSafeLast(c) {
      return !isWhitespace(c) && c !== CHAR_COLON;
    }
    function codePointAt(string, pos) {
      var first = string.charCodeAt(pos), second;
      if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
        second = string.charCodeAt(pos + 1);
        if (second >= 56320 && second <= 57343) {
          return (first - 55296) * 1024 + second - 56320 + 65536;
        }
      }
      return first;
    }
    function needIndentIndicator(string) {
      var leadingSpaceRe = /^\n* /;
      return leadingSpaceRe.test(string);
    }
    var STYLE_PLAIN = 1;
    var STYLE_SINGLE = 2;
    var STYLE_LITERAL = 3;
    var STYLE_FOLDED = 4;
    var STYLE_DOUBLE = 5;
    function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
      var i2;
      var char = 0;
      var prevChar = null;
      var hasLineBreak = false;
      var hasFoldableLine = false;
      var shouldTrackWidth = lineWidth !== -1;
      var previousLineBreak = -1;
      var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
      if (singleLineOnly || forceQuotes) {
        for (i2 = 0; i2 < string.length; char >= 65536 ? i2 += 2 : i2++) {
          char = codePointAt(string, i2);
          if (!isPrintable(char)) {
            return STYLE_DOUBLE;
          }
          plain = plain && isPlainSafe(char, prevChar, inblock);
          prevChar = char;
        }
      } else {
        for (i2 = 0; i2 < string.length; char >= 65536 ? i2 += 2 : i2++) {
          char = codePointAt(string, i2);
          if (char === CHAR_LINE_FEED) {
            hasLineBreak = true;
            if (shouldTrackWidth) {
              hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
              i2 - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
              previousLineBreak = i2;
            }
          } else if (!isPrintable(char)) {
            return STYLE_DOUBLE;
          }
          plain = plain && isPlainSafe(char, prevChar, inblock);
          prevChar = char;
        }
        hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i2 - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
      }
      if (!hasLineBreak && !hasFoldableLine) {
        if (plain && !forceQuotes && !testAmbiguousType(string)) {
          return STYLE_PLAIN;
        }
        return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
      }
      if (indentPerLevel > 9 && needIndentIndicator(string)) {
        return STYLE_DOUBLE;
      }
      if (!forceQuotes) {
        return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
      }
      return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
    }
    function writeScalar(state, string, level, iskey, inblock) {
      state.dump = (function() {
        if (string.length === 0) {
          return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
        }
        if (!state.noCompatMode) {
          if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
            return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
          }
        }
        var indent = state.indent * Math.max(1, level);
        var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
        var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
        function testAmbiguity(string2) {
          return testImplicitResolving(state, string2);
        }
        switch (chooseScalarStyle(
          string,
          singleLineOnly,
          state.indent,
          lineWidth,
          testAmbiguity,
          state.quotingType,
          state.forceQuotes && !iskey,
          inblock
        )) {
          case STYLE_PLAIN:
            return string;
          case STYLE_SINGLE:
            return "'" + string.replace(/'/g, "''") + "'";
          case STYLE_LITERAL:
            return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
          case STYLE_FOLDED:
            return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
          case STYLE_DOUBLE:
            return '"' + escapeString(string, lineWidth) + '"';
          default:
            throw new YAMLException("impossible error: invalid scalar style");
        }
      })();
    }
    function blockHeader(string, indentPerLevel) {
      var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
      var clip = string[string.length - 1] === "\n";
      var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
      var chomp = keep ? "+" : clip ? "" : "-";
      return indentIndicator + chomp + "\n";
    }
    function dropEndingNewline(string) {
      return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
    }
    function foldString(string, width) {
      var lineRe = /(\n+)([^\n]*)/g;
      var result = (function() {
        var nextLF = string.indexOf("\n");
        nextLF = nextLF !== -1 ? nextLF : string.length;
        lineRe.lastIndex = nextLF;
        return foldLine(string.slice(0, nextLF), width);
      })();
      var prevMoreIndented = string[0] === "\n" || string[0] === " ";
      var moreIndented;
      var match;
      while (match = lineRe.exec(string)) {
        var prefix = match[1], line = match[2];
        moreIndented = line[0] === " ";
        result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
        prevMoreIndented = moreIndented;
      }
      return result;
    }
    function foldLine(line, width) {
      if (line === "" || line[0] === " ") return line;
      var breakRe = / [^ ]/g;
      var match;
      var start = 0, end, curr = 0, next = 0;
      var result = "";
      while (match = breakRe.exec(line)) {
        next = match.index;
        if (next - start > width) {
          end = curr > start ? curr : next;
          result += "\n" + line.slice(start, end);
          start = end + 1;
        }
        curr = next;
      }
      result += "\n";
      if (line.length - start > width && curr > start) {
        result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
      } else {
        result += line.slice(start);
      }
      return result.slice(1);
    }
    function escapeString(string) {
      var result = "";
      var char = 0;
      var escapeSeq;
      for (var i2 = 0; i2 < string.length; char >= 65536 ? i2 += 2 : i2++) {
        char = codePointAt(string, i2);
        escapeSeq = ESCAPE_SEQUENCES[char];
        if (!escapeSeq && isPrintable(char)) {
          result += string[i2];
          if (char >= 65536) result += string[i2 + 1];
        } else {
          result += escapeSeq || encodeHex(char);
        }
      }
      return result;
    }
    function writeFlowSequence(state, level, object) {
      var _result = "", _tag = state.tag, index, length, value;
      for (index = 0, length = object.length; index < length; index += 1) {
        value = object[index];
        if (state.replacer) {
          value = state.replacer.call(object, String(index), value);
        }
        if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
          if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
          _result += state.dump;
        }
      }
      state.tag = _tag;
      state.dump = "[" + _result + "]";
    }
    function writeBlockSequence(state, level, object, compact) {
      var _result = "", _tag = state.tag, index, length, value;
      for (index = 0, length = object.length; index < length; index += 1) {
        value = object[index];
        if (state.replacer) {
          value = state.replacer.call(object, String(index), value);
        }
        if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
          if (!compact || _result !== "") {
            _result += generateNextLine(state, level);
          }
          if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
            _result += "-";
          } else {
            _result += "- ";
          }
          _result += state.dump;
        }
      }
      state.tag = _tag;
      state.dump = _result || "[]";
    }
    function writeFlowMapping(state, level, object) {
      var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
      for (index = 0, length = objectKeyList.length; index < length; index += 1) {
        pairBuffer = "";
        if (_result !== "") pairBuffer += ", ";
        if (state.condenseFlow) pairBuffer += '"';
        objectKey = objectKeyList[index];
        objectValue = object[objectKey];
        if (state.replacer) {
          objectValue = state.replacer.call(object, objectKey, objectValue);
        }
        if (!writeNode(state, level, objectKey, false, false)) {
          continue;
        }
        if (state.dump.length > 1024) pairBuffer += "? ";
        pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
        if (!writeNode(state, level, objectValue, false, false)) {
          continue;
        }
        pairBuffer += state.dump;
        _result += pairBuffer;
      }
      state.tag = _tag;
      state.dump = "{" + _result + "}";
    }
    function writeBlockMapping(state, level, object, compact) {
      var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
      if (state.sortKeys === true) {
        objectKeyList.sort();
      } else if (typeof state.sortKeys === "function") {
        objectKeyList.sort(state.sortKeys);
      } else if (state.sortKeys) {
        throw new YAMLException("sortKeys must be a boolean or a function");
      }
      for (index = 0, length = objectKeyList.length; index < length; index += 1) {
        pairBuffer = "";
        if (!compact || _result !== "") {
          pairBuffer += generateNextLine(state, level);
        }
        objectKey = objectKeyList[index];
        objectValue = object[objectKey];
        if (state.replacer) {
          objectValue = state.replacer.call(object, objectKey, objectValue);
        }
        if (!writeNode(state, level + 1, objectKey, true, true, true)) {
          continue;
        }
        explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
        if (explicitPair) {
          if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
            pairBuffer += "?";
          } else {
            pairBuffer += "? ";
          }
        }
        pairBuffer += state.dump;
        if (explicitPair) {
          pairBuffer += generateNextLine(state, level);
        }
        if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
          continue;
        }
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          pairBuffer += ":";
        } else {
          pairBuffer += ": ";
        }
        pairBuffer += state.dump;
        _result += pairBuffer;
      }
      state.tag = _tag;
      state.dump = _result || "{}";
    }
    function detectType(state, object, explicit) {
      var _result, typeList, index, length, type, style;
      typeList = explicit ? state.explicitTypes : state.implicitTypes;
      for (index = 0, length = typeList.length; index < length; index += 1) {
        type = typeList[index];
        if ((type.instanceOf || type.predicate) && (!type.instanceOf || typeof object === "object" && object instanceof type.instanceOf) && (!type.predicate || type.predicate(object))) {
          if (explicit) {
            if (type.multi && type.representName) {
              state.tag = type.representName(object);
            } else {
              state.tag = type.tag;
            }
          } else {
            state.tag = "?";
          }
          if (type.represent) {
            style = state.styleMap[type.tag] || type.defaultStyle;
            if (_toString.call(type.represent) === "[object Function]") {
              _result = type.represent(object, style);
            } else if (_hasOwnProperty.call(type.represent, style)) {
              _result = type.represent[style](object, style);
            } else {
              throw new YAMLException("!<" + type.tag + '> tag resolver accepts not "' + style + '" style');
            }
            state.dump = _result;
          }
          return true;
        }
      }
      return false;
    }
    function writeNode(state, level, object, block, compact, iskey, isblockseq) {
      state.tag = null;
      state.dump = object;
      if (!detectType(state, object, false)) {
        detectType(state, object, true);
      }
      var type = _toString.call(state.dump);
      var inblock = block;
      var tagStr;
      if (block) {
        block = state.flowLevel < 0 || state.flowLevel > level;
      }
      var objectOrArray = type === "[object Object]" || type === "[object Array]", duplicateIndex, duplicate;
      if (objectOrArray) {
        duplicateIndex = state.duplicates.indexOf(object);
        duplicate = duplicateIndex !== -1;
      }
      if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
        compact = false;
      }
      if (duplicate && state.usedDuplicates[duplicateIndex]) {
        state.dump = "*ref_" + duplicateIndex;
      } else {
        if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
          state.usedDuplicates[duplicateIndex] = true;
        }
        if (type === "[object Object]") {
          if (block && Object.keys(state.dump).length !== 0) {
            writeBlockMapping(state, level, state.dump, compact);
            if (duplicate) {
              state.dump = "&ref_" + duplicateIndex + state.dump;
            }
          } else {
            writeFlowMapping(state, level, state.dump);
            if (duplicate) {
              state.dump = "&ref_" + duplicateIndex + " " + state.dump;
            }
          }
        } else if (type === "[object Array]") {
          if (block && state.dump.length !== 0) {
            if (state.noArrayIndent && !isblockseq && level > 0) {
              writeBlockSequence(state, level - 1, state.dump, compact);
            } else {
              writeBlockSequence(state, level, state.dump, compact);
            }
            if (duplicate) {
              state.dump = "&ref_" + duplicateIndex + state.dump;
            }
          } else {
            writeFlowSequence(state, level, state.dump);
            if (duplicate) {
              state.dump = "&ref_" + duplicateIndex + " " + state.dump;
            }
          }
        } else if (type === "[object String]") {
          if (state.tag !== "?") {
            writeScalar(state, state.dump, level, iskey, inblock);
          }
        } else if (type === "[object Undefined]") {
          return false;
        } else {
          if (state.skipInvalid) return false;
          throw new YAMLException("unacceptable kind of an object to dump " + type);
        }
        if (state.tag !== null && state.tag !== "?") {
          tagStr = encodeURI(
            state.tag[0] === "!" ? state.tag.slice(1) : state.tag
          ).replace(/!/g, "%21");
          if (state.tag[0] === "!") {
            tagStr = "!" + tagStr;
          } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
            tagStr = "!!" + tagStr.slice(18);
          } else {
            tagStr = "!<" + tagStr + ">";
          }
          state.dump = tagStr + " " + state.dump;
        }
      }
      return true;
    }
    function getDuplicateReferences(object, state) {
      var objects = [], duplicatesIndexes = [], index, length;
      inspectNode(object, objects, duplicatesIndexes);
      for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
        state.duplicates.push(objects[duplicatesIndexes[index]]);
      }
      state.usedDuplicates = new Array(length);
    }
    function inspectNode(object, objects, duplicatesIndexes) {
      var objectKeyList, index, length;
      if (object !== null && typeof object === "object") {
        index = objects.indexOf(object);
        if (index !== -1) {
          if (duplicatesIndexes.indexOf(index) === -1) {
            duplicatesIndexes.push(index);
          }
        } else {
          objects.push(object);
          if (Array.isArray(object)) {
            for (index = 0, length = object.length; index < length; index += 1) {
              inspectNode(object[index], objects, duplicatesIndexes);
            }
          } else {
            objectKeyList = Object.keys(object);
            for (index = 0, length = objectKeyList.length; index < length; index += 1) {
              inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
            }
          }
        }
      }
    }
    function dump(input, options2) {
      options2 = options2 || {};
      var state = new State2(options2);
      if (!state.noRefs) getDuplicateReferences(input, state);
      var value = input;
      if (state.replacer) {
        value = state.replacer.call({ "": value }, "", value);
      }
      if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
      return "";
    }
    module2.exports.dump = dump;
  }
});

// node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/index.js
var require_js_yaml = __commonJS({
  "node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/index.js"(exports2, module2) {
    "use strict";
    var loader = require_loader();
    var dumper = require_dumper();
    function renamed(from, to) {
      return function() {
        throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
      };
    }
    module2.exports.Type = require_type();
    module2.exports.Schema = require_schema();
    module2.exports.FAILSAFE_SCHEMA = require_failsafe();
    module2.exports.JSON_SCHEMA = require_json2();
    module2.exports.CORE_SCHEMA = require_core();
    module2.exports.DEFAULT_SCHEMA = require_default();
    module2.exports.load = loader.load;
    module2.exports.loadAll = loader.loadAll;
    module2.exports.dump = dumper.dump;
    module2.exports.YAMLException = require_exception();
    module2.exports.types = {
      binary: require_binary(),
      float: require_float(),
      map: require_map(),
      null: require_null(),
      pairs: require_pairs(),
      set: require_set(),
      timestamp: require_timestamp(),
      bool: require_bool(),
      int: require_int(),
      merge: require_merge(),
      omap: require_omap(),
      seq: require_seq(),
      str: require_str()
    };
    module2.exports.safeLoad = renamed("safeLoad", "load");
    module2.exports.safeLoadAll = renamed("safeLoadAll", "loadAll");
    module2.exports.safeDump = renamed("safeDump", "dump");
  }
});

// node_modules/.pnpm/lazy-val@1.0.5/node_modules/lazy-val/out/main.js
var require_main = __commonJS({
  "node_modules/.pnpm/lazy-val@1.0.5/node_modules/lazy-val/out/main.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Lazy = void 0;
    var Lazy = class {
      constructor(creator) {
        this._value = null;
        this.creator = creator;
      }
      get hasValue() {
        return this.creator == null;
      }
      get value() {
        if (this.creator == null) {
          return this._value;
        }
        const result = this.creator();
        this.value = result;
        return result;
      }
      set value(value) {
        this._value = value;
        this.creator = null;
      }
    };
    exports2.Lazy = Lazy;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/internal/constants.js
var require_constants2 = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/internal/constants.js"(exports2, module2) {
    "use strict";
    var SEMVER_SPEC_VERSION = "2.0.0";
    var MAX_LENGTH = 256;
    var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
    9007199254740991;
    var MAX_SAFE_COMPONENT_LENGTH = 16;
    var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
    var RELEASE_TYPES = [
      "major",
      "premajor",
      "minor",
      "preminor",
      "patch",
      "prepatch",
      "prerelease"
    ];
    module2.exports = {
      MAX_LENGTH,
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_SAFE_INTEGER,
      RELEASE_TYPES,
      SEMVER_SPEC_VERSION,
      FLAG_INCLUDE_PRERELEASE: 1,
      FLAG_LOOSE: 2
    };
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/internal/debug.js
var require_debug = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/internal/debug.js"(exports2, module2) {
    "use strict";
    var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args2) => console.error("SEMVER", ...args2) : () => {
    };
    module2.exports = debug;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/internal/re.js
var require_re = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/internal/re.js"(exports2, module2) {
    "use strict";
    var {
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_LENGTH
    } = require_constants2();
    var debug = require_debug();
    exports2 = module2.exports = {};
    var re = exports2.re = [];
    var safeRe = exports2.safeRe = [];
    var src = exports2.src = [];
    var safeSrc = exports2.safeSrc = [];
    var t = exports2.t = {};
    var R = 0;
    var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
    var safeRegexReplacements = [
      ["\\s", 1],
      ["\\d", MAX_LENGTH],
      [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
    ];
    var makeSafeRegex = (value) => {
      for (const [token, max2] of safeRegexReplacements) {
        value = value.split(`${token}*`).join(`${token}{0,${max2}}`).split(`${token}+`).join(`${token}{1,${max2}}`);
      }
      return value;
    };
    var createToken = (name, value, isGlobal) => {
      const safe = makeSafeRegex(value);
      const index = R++;
      debug(name, index, value);
      t[name] = index;
      src[index] = value;
      safeSrc[index] = safe;
      re[index] = new RegExp(value, isGlobal ? "g" : void 0);
      safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
    };
    createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
    createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
    createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
    createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
    createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
    createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
    createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
    createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
    createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
    createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
    createToken("FULL", `^${src[t.FULLPLAIN]}$`);
    createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
    createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
    createToken("GTLT", "((?:<|>)?=?)");
    createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
    createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
    createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
    createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
    createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
    createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
    createToken("COERCERTL", src[t.COERCE], true);
    createToken("COERCERTLFULL", src[t.COERCEFULL], true);
    createToken("LONETILDE", "(?:~>?)");
    createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
    exports2.tildeTrimReplace = "$1~";
    createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
    createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("LONECARET", "(?:\\^)");
    createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
    exports2.caretTrimReplace = "$1^";
    createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
    createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
    createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
    createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
    exports2.comparatorTrimReplace = "$1$2$3";
    createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
    createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
    createToken("STAR", "(<|>)?=?\\s*\\*");
    createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
    createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/internal/parse-options.js
var require_parse_options = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/internal/parse-options.js"(exports2, module2) {
    "use strict";
    var looseOption = Object.freeze({ loose: true });
    var emptyOpts = Object.freeze({});
    var parseOptions = (options2) => {
      if (!options2) {
        return emptyOpts;
      }
      if (typeof options2 !== "object") {
        return looseOption;
      }
      return options2;
    };
    module2.exports = parseOptions;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/internal/identifiers.js
var require_identifiers = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/internal/identifiers.js"(exports2, module2) {
    "use strict";
    var numeric = /^[0-9]+$/;
    var compareIdentifiers = (a, b) => {
      if (typeof a === "number" && typeof b === "number") {
        return a === b ? 0 : a < b ? -1 : 1;
      }
      const anum = numeric.test(a);
      const bnum = numeric.test(b);
      if (anum && bnum) {
        a = +a;
        b = +b;
      }
      return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
    };
    var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
    module2.exports = {
      compareIdentifiers,
      rcompareIdentifiers
    };
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/classes/semver.js
var require_semver = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/classes/semver.js"(exports2, module2) {
    "use strict";
    var debug = require_debug();
    var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants2();
    var { safeRe: re, t } = require_re();
    var parseOptions = require_parse_options();
    var { compareIdentifiers } = require_identifiers();
    var SemVer = class _SemVer {
      constructor(version, options2) {
        options2 = parseOptions(options2);
        if (version instanceof _SemVer) {
          if (version.loose === !!options2.loose && version.includePrerelease === !!options2.includePrerelease) {
            return version;
          } else {
            version = version.version;
          }
        } else if (typeof version !== "string") {
          throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
        }
        if (version.length > MAX_LENGTH) {
          throw new TypeError(
            `version is longer than ${MAX_LENGTH} characters`
          );
        }
        debug("SemVer", version, options2);
        this.options = options2;
        this.loose = !!options2.loose;
        this.includePrerelease = !!options2.includePrerelease;
        const m = version.trim().match(options2.loose ? re[t.LOOSE] : re[t.FULL]);
        if (!m) {
          throw new TypeError(`Invalid Version: ${version}`);
        }
        this.raw = version;
        this.major = +m[1];
        this.minor = +m[2];
        this.patch = +m[3];
        if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
          throw new TypeError("Invalid major version");
        }
        if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
          throw new TypeError("Invalid minor version");
        }
        if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
          throw new TypeError("Invalid patch version");
        }
        if (!m[4]) {
          this.prerelease = [];
        } else {
          this.prerelease = m[4].split(".").map((id) => {
            if (/^[0-9]+$/.test(id)) {
              const num = +id;
              if (num >= 0 && num < MAX_SAFE_INTEGER) {
                return num;
              }
            }
            return id;
          });
        }
        this.build = m[5] ? m[5].split(".") : [];
        this.format();
      }
      format() {
        this.version = `${this.major}.${this.minor}.${this.patch}`;
        if (this.prerelease.length) {
          this.version += `-${this.prerelease.join(".")}`;
        }
        return this.version;
      }
      toString() {
        return this.version;
      }
      compare(other) {
        debug("SemVer.compare", this.version, this.options, other);
        if (!(other instanceof _SemVer)) {
          if (typeof other === "string" && other === this.version) {
            return 0;
          }
          other = new _SemVer(other, this.options);
        }
        if (other.version === this.version) {
          return 0;
        }
        return this.compareMain(other) || this.comparePre(other);
      }
      compareMain(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.major < other.major) {
          return -1;
        }
        if (this.major > other.major) {
          return 1;
        }
        if (this.minor < other.minor) {
          return -1;
        }
        if (this.minor > other.minor) {
          return 1;
        }
        if (this.patch < other.patch) {
          return -1;
        }
        if (this.patch > other.patch) {
          return 1;
        }
        return 0;
      }
      comparePre(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.prerelease.length && !other.prerelease.length) {
          return -1;
        } else if (!this.prerelease.length && other.prerelease.length) {
          return 1;
        } else if (!this.prerelease.length && !other.prerelease.length) {
          return 0;
        }
        let i2 = 0;
        do {
          const a = this.prerelease[i2];
          const b = other.prerelease[i2];
          debug("prerelease compare", i2, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i2);
      }
      compareBuild(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        let i2 = 0;
        do {
          const a = this.build[i2];
          const b = other.build[i2];
          debug("build compare", i2, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i2);
      }
      // preminor will bump the version up to the next minor release, and immediately
      // down to pre-release. premajor and prepatch work the same way.
      inc(release2, identifier, identifierBase) {
        if (release2.startsWith("pre")) {
          if (!identifier && identifierBase === false) {
            throw new Error("invalid increment argument: identifier is empty");
          }
          if (identifier) {
            const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
            if (!match || match[1] !== identifier) {
              throw new Error(`invalid identifier: ${identifier}`);
            }
          }
        }
        switch (release2) {
          case "premajor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor = 0;
            this.major++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "preminor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "prepatch":
            this.prerelease.length = 0;
            this.inc("patch", identifier, identifierBase);
            this.inc("pre", identifier, identifierBase);
            break;
          // If the input is a non-prerelease version, this acts the same as
          // prepatch.
          case "prerelease":
            if (this.prerelease.length === 0) {
              this.inc("patch", identifier, identifierBase);
            }
            this.inc("pre", identifier, identifierBase);
            break;
          case "release":
            if (this.prerelease.length === 0) {
              throw new Error(`version ${this.raw} is not a prerelease`);
            }
            this.prerelease.length = 0;
            break;
          case "major":
            if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
              this.major++;
            }
            this.minor = 0;
            this.patch = 0;
            this.prerelease = [];
            break;
          case "minor":
            if (this.patch !== 0 || this.prerelease.length === 0) {
              this.minor++;
            }
            this.patch = 0;
            this.prerelease = [];
            break;
          case "patch":
            if (this.prerelease.length === 0) {
              this.patch++;
            }
            this.prerelease = [];
            break;
          // This probably shouldn't be used publicly.
          // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
          case "pre": {
            const base = Number(identifierBase) ? 1 : 0;
            if (this.prerelease.length === 0) {
              this.prerelease = [base];
            } else {
              let i2 = this.prerelease.length;
              while (--i2 >= 0) {
                if (typeof this.prerelease[i2] === "number") {
                  this.prerelease[i2]++;
                  i2 = -2;
                }
              }
              if (i2 === -1) {
                if (identifier === this.prerelease.join(".") && identifierBase === false) {
                  throw new Error("invalid increment argument: identifier already exists");
                }
                this.prerelease.push(base);
              }
            }
            if (identifier) {
              let prerelease = [identifier, base];
              if (identifierBase === false) {
                prerelease = [identifier];
              }
              if (compareIdentifiers(this.prerelease[0], identifier) === 0) {
                if (isNaN(this.prerelease[1])) {
                  this.prerelease = prerelease;
                }
              } else {
                this.prerelease = prerelease;
              }
            }
            break;
          }
          default:
            throw new Error(`invalid increment argument: ${release2}`);
        }
        this.raw = this.format();
        if (this.build.length) {
          this.raw += `+${this.build.join(".")}`;
        }
        return this;
      }
    };
    module2.exports = SemVer;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/parse.js
var require_parse = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/parse.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var parse = (version, options2, throwErrors = false) => {
      if (version instanceof SemVer) {
        return version;
      }
      try {
        return new SemVer(version, options2);
      } catch (er) {
        if (!throwErrors) {
          return null;
        }
        throw er;
      }
    };
    module2.exports = parse;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/valid.js
var require_valid = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/valid.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var valid = (version, options2) => {
      const v = parse(version, options2);
      return v ? v.version : null;
    };
    module2.exports = valid;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/clean.js
var require_clean = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/clean.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var clean = (version, options2) => {
      const s = parse(version.trim().replace(/^[=v]+/, ""), options2);
      return s ? s.version : null;
    };
    module2.exports = clean;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/inc.js
var require_inc = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/inc.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var inc = (version, release2, options2, identifier, identifierBase) => {
      if (typeof options2 === "string") {
        identifierBase = identifier;
        identifier = options2;
        options2 = void 0;
      }
      try {
        return new SemVer(
          version instanceof SemVer ? version.version : version,
          options2
        ).inc(release2, identifier, identifierBase).version;
      } catch (er) {
        return null;
      }
    };
    module2.exports = inc;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/diff.js
var require_diff = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/diff.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var diff = (version1, version2) => {
      const v1 = parse(version1, null, true);
      const v2 = parse(version2, null, true);
      const comparison = v1.compare(v2);
      if (comparison === 0) {
        return null;
      }
      const v1Higher = comparison > 0;
      const highVersion = v1Higher ? v1 : v2;
      const lowVersion = v1Higher ? v2 : v1;
      const highHasPre = !!highVersion.prerelease.length;
      const lowHasPre = !!lowVersion.prerelease.length;
      if (lowHasPre && !highHasPre) {
        if (!lowVersion.patch && !lowVersion.minor) {
          return "major";
        }
        if (lowVersion.compareMain(highVersion) === 0) {
          if (lowVersion.minor && !lowVersion.patch) {
            return "minor";
          }
          return "patch";
        }
      }
      const prefix = highHasPre ? "pre" : "";
      if (v1.major !== v2.major) {
        return prefix + "major";
      }
      if (v1.minor !== v2.minor) {
        return prefix + "minor";
      }
      if (v1.patch !== v2.patch) {
        return prefix + "patch";
      }
      return "prerelease";
    };
    module2.exports = diff;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/major.js
var require_major = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/major.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var major = (a, loose) => new SemVer(a, loose).major;
    module2.exports = major;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/minor.js
var require_minor = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/minor.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var minor = (a, loose) => new SemVer(a, loose).minor;
    module2.exports = minor;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/patch.js
var require_patch = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/patch.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var patch = (a, loose) => new SemVer(a, loose).patch;
    module2.exports = patch;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/prerelease.js
var require_prerelease = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/prerelease.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var prerelease = (version, options2) => {
      const parsed = parse(version, options2);
      return parsed && parsed.prerelease.length ? parsed.prerelease : null;
    };
    module2.exports = prerelease;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/compare.js
var require_compare = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/compare.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var compare = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
    module2.exports = compare;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/rcompare.js
var require_rcompare = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/rcompare.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var rcompare = (a, b, loose) => compare(b, a, loose);
    module2.exports = rcompare;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/compare-loose.js
var require_compare_loose = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/compare-loose.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var compareLoose = (a, b) => compare(a, b, true);
    module2.exports = compareLoose;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/compare-build.js
var require_compare_build = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/compare-build.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var compareBuild = (a, b, loose) => {
      const versionA = new SemVer(a, loose);
      const versionB = new SemVer(b, loose);
      return versionA.compare(versionB) || versionA.compareBuild(versionB);
    };
    module2.exports = compareBuild;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/sort.js
var require_sort = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/sort.js"(exports2, module2) {
    "use strict";
    var compareBuild = require_compare_build();
    var sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
    module2.exports = sort;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/rsort.js
var require_rsort = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/rsort.js"(exports2, module2) {
    "use strict";
    var compareBuild = require_compare_build();
    var rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
    module2.exports = rsort;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/gt.js
var require_gt = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/gt.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var gt = (a, b, loose) => compare(a, b, loose) > 0;
    module2.exports = gt;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/lt.js
var require_lt = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/lt.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var lt = (a, b, loose) => compare(a, b, loose) < 0;
    module2.exports = lt;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/eq.js
var require_eq = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/eq.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var eq = (a, b, loose) => compare(a, b, loose) === 0;
    module2.exports = eq;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/neq.js
var require_neq = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/neq.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var neq = (a, b, loose) => compare(a, b, loose) !== 0;
    module2.exports = neq;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/gte.js
var require_gte = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/gte.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var gte = (a, b, loose) => compare(a, b, loose) >= 0;
    module2.exports = gte;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/lte.js
var require_lte = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/lte.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var lte = (a, b, loose) => compare(a, b, loose) <= 0;
    module2.exports = lte;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/cmp.js
var require_cmp = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/cmp.js"(exports2, module2) {
    "use strict";
    var eq = require_eq();
    var neq = require_neq();
    var gt = require_gt();
    var gte = require_gte();
    var lt = require_lt();
    var lte = require_lte();
    var cmp = (a, op, b, loose) => {
      switch (op) {
        case "===":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a === b;
        case "!==":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a !== b;
        case "":
        case "=":
        case "==":
          return eq(a, b, loose);
        case "!=":
          return neq(a, b, loose);
        case ">":
          return gt(a, b, loose);
        case ">=":
          return gte(a, b, loose);
        case "<":
          return lt(a, b, loose);
        case "<=":
          return lte(a, b, loose);
        default:
          throw new TypeError(`Invalid operator: ${op}`);
      }
    };
    module2.exports = cmp;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/coerce.js
var require_coerce = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/coerce.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var parse = require_parse();
    var { safeRe: re, t } = require_re();
    var coerce = (version, options2) => {
      if (version instanceof SemVer) {
        return version;
      }
      if (typeof version === "number") {
        version = String(version);
      }
      if (typeof version !== "string") {
        return null;
      }
      options2 = options2 || {};
      let match = null;
      if (!options2.rtl) {
        match = version.match(options2.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
      } else {
        const coerceRtlRegex = options2.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
        let next;
        while ((next = coerceRtlRegex.exec(version)) && (!match || match.index + match[0].length !== version.length)) {
          if (!match || next.index + next[0].length !== match.index + match[0].length) {
            match = next;
          }
          coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
        }
        coerceRtlRegex.lastIndex = -1;
      }
      if (match === null) {
        return null;
      }
      const major = match[2];
      const minor = match[3] || "0";
      const patch = match[4] || "0";
      const prerelease = options2.includePrerelease && match[5] ? `-${match[5]}` : "";
      const build = options2.includePrerelease && match[6] ? `+${match[6]}` : "";
      return parse(`${major}.${minor}.${patch}${prerelease}${build}`, options2);
    };
    module2.exports = coerce;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/internal/lrucache.js
var require_lrucache = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/internal/lrucache.js"(exports2, module2) {
    "use strict";
    var LRUCache = class {
      constructor() {
        this.max = 1e3;
        this.map = /* @__PURE__ */ new Map();
      }
      get(key) {
        const value = this.map.get(key);
        if (value === void 0) {
          return void 0;
        } else {
          this.map.delete(key);
          this.map.set(key, value);
          return value;
        }
      }
      delete(key) {
        return this.map.delete(key);
      }
      set(key, value) {
        const deleted = this.delete(key);
        if (!deleted && value !== void 0) {
          if (this.map.size >= this.max) {
            const firstKey = this.map.keys().next().value;
            this.delete(firstKey);
          }
          this.map.set(key, value);
        }
        return this;
      }
    };
    module2.exports = LRUCache;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/classes/range.js
var require_range = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/classes/range.js"(exports2, module2) {
    "use strict";
    var SPACE_CHARACTERS = /\s+/g;
    var Range = class _Range {
      constructor(range, options2) {
        options2 = parseOptions(options2);
        if (range instanceof _Range) {
          if (range.loose === !!options2.loose && range.includePrerelease === !!options2.includePrerelease) {
            return range;
          } else {
            return new _Range(range.raw, options2);
          }
        }
        if (range instanceof Comparator) {
          this.raw = range.value;
          this.set = [[range]];
          this.formatted = void 0;
          return this;
        }
        this.options = options2;
        this.loose = !!options2.loose;
        this.includePrerelease = !!options2.includePrerelease;
        this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
        this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
        if (!this.set.length) {
          throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
        }
        if (this.set.length > 1) {
          const first = this.set[0];
          this.set = this.set.filter((c) => !isNullSet(c[0]));
          if (this.set.length === 0) {
            this.set = [first];
          } else if (this.set.length > 1) {
            for (const c of this.set) {
              if (c.length === 1 && isAny(c[0])) {
                this.set = [c];
                break;
              }
            }
          }
        }
        this.formatted = void 0;
      }
      get range() {
        if (this.formatted === void 0) {
          this.formatted = "";
          for (let i2 = 0; i2 < this.set.length; i2++) {
            if (i2 > 0) {
              this.formatted += "||";
            }
            const comps = this.set[i2];
            for (let k = 0; k < comps.length; k++) {
              if (k > 0) {
                this.formatted += " ";
              }
              this.formatted += comps[k].toString().trim();
            }
          }
        }
        return this.formatted;
      }
      format() {
        return this.range;
      }
      toString() {
        return this.range;
      }
      parseRange(range) {
        const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
        const memoKey = memoOpts + ":" + range;
        const cached = cache.get(memoKey);
        if (cached) {
          return cached;
        }
        const loose = this.options.loose;
        const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
        range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
        debug("hyphen replace", range);
        range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
        debug("comparator trim", range);
        range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
        debug("tilde trim", range);
        range = range.replace(re[t.CARETTRIM], caretTrimReplace);
        debug("caret trim", range);
        let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
        if (loose) {
          rangeList = rangeList.filter((comp) => {
            debug("loose invalid filter", comp, this.options);
            return !!comp.match(re[t.COMPARATORLOOSE]);
          });
        }
        debug("range list", rangeList);
        const rangeMap = /* @__PURE__ */ new Map();
        const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
        for (const comp of comparators) {
          if (isNullSet(comp)) {
            return [comp];
          }
          rangeMap.set(comp.value, comp);
        }
        if (rangeMap.size > 1 && rangeMap.has("")) {
          rangeMap.delete("");
        }
        const result = [...rangeMap.values()];
        cache.set(memoKey, result);
        return result;
      }
      intersects(range, options2) {
        if (!(range instanceof _Range)) {
          throw new TypeError("a Range is required");
        }
        return this.set.some((thisComparators) => {
          return isSatisfiable(thisComparators, options2) && range.set.some((rangeComparators) => {
            return isSatisfiable(rangeComparators, options2) && thisComparators.every((thisComparator) => {
              return rangeComparators.every((rangeComparator) => {
                return thisComparator.intersects(rangeComparator, options2);
              });
            });
          });
        });
      }
      // if ANY of the sets match ALL of its comparators, then pass
      test(version) {
        if (!version) {
          return false;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        for (let i2 = 0; i2 < this.set.length; i2++) {
          if (testSet(this.set[i2], version, this.options)) {
            return true;
          }
        }
        return false;
      }
    };
    module2.exports = Range;
    var LRU = require_lrucache();
    var cache = new LRU();
    var parseOptions = require_parse_options();
    var Comparator = require_comparator();
    var debug = require_debug();
    var SemVer = require_semver();
    var {
      safeRe: re,
      t,
      comparatorTrimReplace,
      tildeTrimReplace,
      caretTrimReplace
    } = require_re();
    var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants2();
    var isNullSet = (c) => c.value === "<0.0.0-0";
    var isAny = (c) => c.value === "";
    var isSatisfiable = (comparators, options2) => {
      let result = true;
      const remainingComparators = comparators.slice();
      let testComparator = remainingComparators.pop();
      while (result && remainingComparators.length) {
        result = remainingComparators.every((otherComparator) => {
          return testComparator.intersects(otherComparator, options2);
        });
        testComparator = remainingComparators.pop();
      }
      return result;
    };
    var parseComparator = (comp, options2) => {
      comp = comp.replace(re[t.BUILD], "");
      debug("comp", comp, options2);
      comp = replaceCarets(comp, options2);
      debug("caret", comp);
      comp = replaceTildes(comp, options2);
      debug("tildes", comp);
      comp = replaceXRanges(comp, options2);
      debug("xrange", comp);
      comp = replaceStars(comp, options2);
      debug("stars", comp);
      return comp;
    };
    var isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
    var replaceTildes = (comp, options2) => {
      return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options2)).join(" ");
    };
    var replaceTilde = (comp, options2) => {
      const r = options2.loose ? re[t.TILDELOOSE] : re[t.TILDE];
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("tilde", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0 <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          ret = `>=${M}.${m}.0 <${M}.${+m + 1}.0-0`;
        } else if (pr) {
          debug("replaceTilde pr", pr);
          ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
        } else {
          ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
        }
        debug("tilde return", ret);
        return ret;
      });
    };
    var replaceCarets = (comp, options2) => {
      return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options2)).join(" ");
    };
    var replaceCaret = (comp, options2) => {
      debug("caret", comp, options2);
      const r = options2.loose ? re[t.CARETLOOSE] : re[t.CARET];
      const z = options2.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("caret", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          if (M === "0") {
            ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
          } else {
            ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
          }
        } else if (pr) {
          debug("replaceCaret pr", pr);
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
          }
        } else {
          debug("no pr");
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}${z} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}${z} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
          }
        }
        debug("caret return", ret);
        return ret;
      });
    };
    var replaceXRanges = (comp, options2) => {
      debug("replaceXRanges", comp, options2);
      return comp.split(/\s+/).map((c) => replaceXRange(c, options2)).join(" ");
    };
    var replaceXRange = (comp, options2) => {
      comp = comp.trim();
      const r = options2.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
      return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
        debug("xRange", comp, ret, gtlt, M, m, p, pr);
        const xM = isX(M);
        const xm = xM || isX(m);
        const xp = xm || isX(p);
        const anyX = xp;
        if (gtlt === "=" && anyX) {
          gtlt = "";
        }
        pr = options2.includePrerelease ? "-0" : "";
        if (xM) {
          if (gtlt === ">" || gtlt === "<") {
            ret = "<0.0.0-0";
          } else {
            ret = "*";
          }
        } else if (gtlt && anyX) {
          if (xm) {
            m = 0;
          }
          p = 0;
          if (gtlt === ">") {
            gtlt = ">=";
            if (xm) {
              M = +M + 1;
              m = 0;
              p = 0;
            } else {
              m = +m + 1;
              p = 0;
            }
          } else if (gtlt === "<=") {
            gtlt = "<";
            if (xm) {
              M = +M + 1;
            } else {
              m = +m + 1;
            }
          }
          if (gtlt === "<") {
            pr = "-0";
          }
          ret = `${gtlt + M}.${m}.${p}${pr}`;
        } else if (xm) {
          ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
        } else if (xp) {
          ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
        }
        debug("xRange return", ret);
        return ret;
      });
    };
    var replaceStars = (comp, options2) => {
      debug("replaceStars", comp, options2);
      return comp.trim().replace(re[t.STAR], "");
    };
    var replaceGTE0 = (comp, options2) => {
      debug("replaceGTE0", comp, options2);
      return comp.trim().replace(re[options2.includePrerelease ? t.GTE0PRE : t.GTE0], "");
    };
    var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
      if (isX(fM)) {
        from = "";
      } else if (isX(fm)) {
        from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
      } else if (isX(fp)) {
        from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
      } else if (fpr) {
        from = `>=${from}`;
      } else {
        from = `>=${from}${incPr ? "-0" : ""}`;
      }
      if (isX(tM)) {
        to = "";
      } else if (isX(tm)) {
        to = `<${+tM + 1}.0.0-0`;
      } else if (isX(tp)) {
        to = `<${tM}.${+tm + 1}.0-0`;
      } else if (tpr) {
        to = `<=${tM}.${tm}.${tp}-${tpr}`;
      } else if (incPr) {
        to = `<${tM}.${tm}.${+tp + 1}-0`;
      } else {
        to = `<=${to}`;
      }
      return `${from} ${to}`.trim();
    };
    var testSet = (set, version, options2) => {
      for (let i2 = 0; i2 < set.length; i2++) {
        if (!set[i2].test(version)) {
          return false;
        }
      }
      if (version.prerelease.length && !options2.includePrerelease) {
        for (let i2 = 0; i2 < set.length; i2++) {
          debug(set[i2].semver);
          if (set[i2].semver === Comparator.ANY) {
            continue;
          }
          if (set[i2].semver.prerelease.length > 0) {
            const allowed = set[i2].semver;
            if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    };
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/classes/comparator.js
var require_comparator = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/classes/comparator.js"(exports2, module2) {
    "use strict";
    var ANY = /* @__PURE__ */ Symbol("SemVer ANY");
    var Comparator = class _Comparator {
      static get ANY() {
        return ANY;
      }
      constructor(comp, options2) {
        options2 = parseOptions(options2);
        if (comp instanceof _Comparator) {
          if (comp.loose === !!options2.loose) {
            return comp;
          } else {
            comp = comp.value;
          }
        }
        comp = comp.trim().split(/\s+/).join(" ");
        debug("comparator", comp, options2);
        this.options = options2;
        this.loose = !!options2.loose;
        this.parse(comp);
        if (this.semver === ANY) {
          this.value = "";
        } else {
          this.value = this.operator + this.semver.version;
        }
        debug("comp", this);
      }
      parse(comp) {
        const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
        const m = comp.match(r);
        if (!m) {
          throw new TypeError(`Invalid comparator: ${comp}`);
        }
        this.operator = m[1] !== void 0 ? m[1] : "";
        if (this.operator === "=") {
          this.operator = "";
        }
        if (!m[2]) {
          this.semver = ANY;
        } else {
          this.semver = new SemVer(m[2], this.options.loose);
        }
      }
      toString() {
        return this.value;
      }
      test(version) {
        debug("Comparator.test", version, this.options.loose);
        if (this.semver === ANY || version === ANY) {
          return true;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        return cmp(version, this.operator, this.semver, this.options);
      }
      intersects(comp, options2) {
        if (!(comp instanceof _Comparator)) {
          throw new TypeError("a Comparator is required");
        }
        if (this.operator === "") {
          if (this.value === "") {
            return true;
          }
          return new Range(comp.value, options2).test(this.value);
        } else if (comp.operator === "") {
          if (comp.value === "") {
            return true;
          }
          return new Range(this.value, options2).test(comp.semver);
        }
        options2 = parseOptions(options2);
        if (options2.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
          return false;
        }
        if (!options2.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
          return false;
        }
        if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
          return true;
        }
        if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
          return true;
        }
        if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
          return true;
        }
        if (cmp(this.semver, "<", comp.semver, options2) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
          return true;
        }
        if (cmp(this.semver, ">", comp.semver, options2) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
          return true;
        }
        return false;
      }
    };
    module2.exports = Comparator;
    var parseOptions = require_parse_options();
    var { safeRe: re, t } = require_re();
    var cmp = require_cmp();
    var debug = require_debug();
    var SemVer = require_semver();
    var Range = require_range();
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/satisfies.js
var require_satisfies = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/functions/satisfies.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var satisfies = (version, range, options2) => {
      try {
        range = new Range(range, options2);
      } catch (er) {
        return false;
      }
      return range.test(version);
    };
    module2.exports = satisfies;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/to-comparators.js
var require_to_comparators = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/to-comparators.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var toComparators = (range, options2) => new Range(range, options2).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
    module2.exports = toComparators;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/max-satisfying.js
var require_max_satisfying = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/max-satisfying.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var maxSatisfying = (versions, range, options2) => {
      let max2 = null;
      let maxSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options2);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!max2 || maxSV.compare(v) === -1) {
            max2 = v;
            maxSV = new SemVer(max2, options2);
          }
        }
      });
      return max2;
    };
    module2.exports = maxSatisfying;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/min-satisfying.js
var require_min_satisfying = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/min-satisfying.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var minSatisfying = (versions, range, options2) => {
      let min = null;
      let minSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options2);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!min || minSV.compare(v) === 1) {
            min = v;
            minSV = new SemVer(min, options2);
          }
        }
      });
      return min;
    };
    module2.exports = minSatisfying;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/min-version.js
var require_min_version = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/min-version.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var gt = require_gt();
    var minVersion = (range, loose) => {
      range = new Range(range, loose);
      let minver = new SemVer("0.0.0");
      if (range.test(minver)) {
        return minver;
      }
      minver = new SemVer("0.0.0-0");
      if (range.test(minver)) {
        return minver;
      }
      minver = null;
      for (let i2 = 0; i2 < range.set.length; ++i2) {
        const comparators = range.set[i2];
        let setMin = null;
        comparators.forEach((comparator) => {
          const compver = new SemVer(comparator.semver.version);
          switch (comparator.operator) {
            case ">":
              if (compver.prerelease.length === 0) {
                compver.patch++;
              } else {
                compver.prerelease.push(0);
              }
              compver.raw = compver.format();
            /* fallthrough */
            case "":
            case ">=":
              if (!setMin || gt(compver, setMin)) {
                setMin = compver;
              }
              break;
            case "<":
            case "<=":
              break;
            /* istanbul ignore next */
            default:
              throw new Error(`Unexpected operation: ${comparator.operator}`);
          }
        });
        if (setMin && (!minver || gt(minver, setMin))) {
          minver = setMin;
        }
      }
      if (minver && range.test(minver)) {
        return minver;
      }
      return null;
    };
    module2.exports = minVersion;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/valid.js
var require_valid2 = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/valid.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var validRange = (range, options2) => {
      try {
        return new Range(range, options2).range || "*";
      } catch (er) {
        return null;
      }
    };
    module2.exports = validRange;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/outside.js
var require_outside = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/outside.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var Range = require_range();
    var satisfies = require_satisfies();
    var gt = require_gt();
    var lt = require_lt();
    var lte = require_lte();
    var gte = require_gte();
    var outside = (version, range, hilo, options2) => {
      version = new SemVer(version, options2);
      range = new Range(range, options2);
      let gtfn, ltefn, ltfn, comp, ecomp;
      switch (hilo) {
        case ">":
          gtfn = gt;
          ltefn = lte;
          ltfn = lt;
          comp = ">";
          ecomp = ">=";
          break;
        case "<":
          gtfn = lt;
          ltefn = gte;
          ltfn = gt;
          comp = "<";
          ecomp = "<=";
          break;
        default:
          throw new TypeError('Must provide a hilo val of "<" or ">"');
      }
      if (satisfies(version, range, options2)) {
        return false;
      }
      for (let i2 = 0; i2 < range.set.length; ++i2) {
        const comparators = range.set[i2];
        let high = null;
        let low = null;
        comparators.forEach((comparator) => {
          if (comparator.semver === ANY) {
            comparator = new Comparator(">=0.0.0");
          }
          high = high || comparator;
          low = low || comparator;
          if (gtfn(comparator.semver, high.semver, options2)) {
            high = comparator;
          } else if (ltfn(comparator.semver, low.semver, options2)) {
            low = comparator;
          }
        });
        if (high.operator === comp || high.operator === ecomp) {
          return false;
        }
        if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
          return false;
        } else if (low.operator === ecomp && ltfn(version, low.semver)) {
          return false;
        }
      }
      return true;
    };
    module2.exports = outside;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/gtr.js
var require_gtr = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/gtr.js"(exports2, module2) {
    "use strict";
    var outside = require_outside();
    var gtr = (version, range, options2) => outside(version, range, ">", options2);
    module2.exports = gtr;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/ltr.js
var require_ltr = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/ltr.js"(exports2, module2) {
    "use strict";
    var outside = require_outside();
    var ltr = (version, range, options2) => outside(version, range, "<", options2);
    module2.exports = ltr;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/intersects.js
var require_intersects = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/intersects.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var intersects = (r1, r2, options2) => {
      r1 = new Range(r1, options2);
      r2 = new Range(r2, options2);
      return r1.intersects(r2, options2);
    };
    module2.exports = intersects;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/simplify.js
var require_simplify = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/simplify.js"(exports2, module2) {
    "use strict";
    var satisfies = require_satisfies();
    var compare = require_compare();
    module2.exports = (versions, range, options2) => {
      const set = [];
      let first = null;
      let prev = null;
      const v = versions.sort((a, b) => compare(a, b, options2));
      for (const version of v) {
        const included = satisfies(version, range, options2);
        if (included) {
          prev = version;
          if (!first) {
            first = version;
          }
        } else {
          if (prev) {
            set.push([first, prev]);
          }
          prev = null;
          first = null;
        }
      }
      if (first) {
        set.push([first, null]);
      }
      const ranges = [];
      for (const [min, max2] of set) {
        if (min === max2) {
          ranges.push(min);
        } else if (!max2 && min === v[0]) {
          ranges.push("*");
        } else if (!max2) {
          ranges.push(`>=${min}`);
        } else if (min === v[0]) {
          ranges.push(`<=${max2}`);
        } else {
          ranges.push(`${min} - ${max2}`);
        }
      }
      const simplified = ranges.join(" || ");
      const original = typeof range.raw === "string" ? range.raw : String(range);
      return simplified.length < original.length ? simplified : range;
    };
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/subset.js
var require_subset = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/ranges/subset.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var satisfies = require_satisfies();
    var compare = require_compare();
    var subset = (sub, dom, options2 = {}) => {
      if (sub === dom) {
        return true;
      }
      sub = new Range(sub, options2);
      dom = new Range(dom, options2);
      let sawNonNull = false;
      OUTER: for (const simpleSub of sub.set) {
        for (const simpleDom of dom.set) {
          const isSub = simpleSubset(simpleSub, simpleDom, options2);
          sawNonNull = sawNonNull || isSub !== null;
          if (isSub) {
            continue OUTER;
          }
        }
        if (sawNonNull) {
          return false;
        }
      }
      return true;
    };
    var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
    var minimumVersion = [new Comparator(">=0.0.0")];
    var simpleSubset = (sub, dom, options2) => {
      if (sub === dom) {
        return true;
      }
      if (sub.length === 1 && sub[0].semver === ANY) {
        if (dom.length === 1 && dom[0].semver === ANY) {
          return true;
        } else if (options2.includePrerelease) {
          sub = minimumVersionWithPreRelease;
        } else {
          sub = minimumVersion;
        }
      }
      if (dom.length === 1 && dom[0].semver === ANY) {
        if (options2.includePrerelease) {
          return true;
        } else {
          dom = minimumVersion;
        }
      }
      const eqSet = /* @__PURE__ */ new Set();
      let gt, lt;
      for (const c of sub) {
        if (c.operator === ">" || c.operator === ">=") {
          gt = higherGT(gt, c, options2);
        } else if (c.operator === "<" || c.operator === "<=") {
          lt = lowerLT(lt, c, options2);
        } else {
          eqSet.add(c.semver);
        }
      }
      if (eqSet.size > 1) {
        return null;
      }
      let gtltComp;
      if (gt && lt) {
        gtltComp = compare(gt.semver, lt.semver, options2);
        if (gtltComp > 0) {
          return null;
        } else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
          return null;
        }
      }
      for (const eq of eqSet) {
        if (gt && !satisfies(eq, String(gt), options2)) {
          return null;
        }
        if (lt && !satisfies(eq, String(lt), options2)) {
          return null;
        }
        for (const c of dom) {
          if (!satisfies(eq, String(c), options2)) {
            return false;
          }
        }
        return true;
      }
      let higher, lower;
      let hasDomLT, hasDomGT;
      let needDomLTPre = lt && !options2.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
      let needDomGTPre = gt && !options2.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
      if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) {
        needDomLTPre = false;
      }
      for (const c of dom) {
        hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
        hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
        if (gt) {
          if (needDomGTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
              needDomGTPre = false;
            }
          }
          if (c.operator === ">" || c.operator === ">=") {
            higher = higherGT(gt, c, options2);
            if (higher === c && higher !== gt) {
              return false;
            }
          } else if (gt.operator === ">=" && !satisfies(gt.semver, String(c), options2)) {
            return false;
          }
        }
        if (lt) {
          if (needDomLTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
              needDomLTPre = false;
            }
          }
          if (c.operator === "<" || c.operator === "<=") {
            lower = lowerLT(lt, c, options2);
            if (lower === c && lower !== lt) {
              return false;
            }
          } else if (lt.operator === "<=" && !satisfies(lt.semver, String(c), options2)) {
            return false;
          }
        }
        if (!c.operator && (lt || gt) && gtltComp !== 0) {
          return false;
        }
      }
      if (gt && hasDomLT && !lt && gtltComp !== 0) {
        return false;
      }
      if (lt && hasDomGT && !gt && gtltComp !== 0) {
        return false;
      }
      if (needDomGTPre || needDomLTPre) {
        return false;
      }
      return true;
    };
    var higherGT = (a, b, options2) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options2);
      return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
    };
    var lowerLT = (a, b, options2) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options2);
      return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
    };
    module2.exports = subset;
  }
});

// node_modules/.pnpm/semver@7.7.3/node_modules/semver/index.js
var require_semver2 = __commonJS({
  "node_modules/.pnpm/semver@7.7.3/node_modules/semver/index.js"(exports2, module2) {
    "use strict";
    var internalRe = require_re();
    var constants4 = require_constants2();
    var SemVer = require_semver();
    var identifiers = require_identifiers();
    var parse = require_parse();
    var valid = require_valid();
    var clean = require_clean();
    var inc = require_inc();
    var diff = require_diff();
    var major = require_major();
    var minor = require_minor();
    var patch = require_patch();
    var prerelease = require_prerelease();
    var compare = require_compare();
    var rcompare = require_rcompare();
    var compareLoose = require_compare_loose();
    var compareBuild = require_compare_build();
    var sort = require_sort();
    var rsort = require_rsort();
    var gt = require_gt();
    var lt = require_lt();
    var eq = require_eq();
    var neq = require_neq();
    var gte = require_gte();
    var lte = require_lte();
    var cmp = require_cmp();
    var coerce = require_coerce();
    var Comparator = require_comparator();
    var Range = require_range();
    var satisfies = require_satisfies();
    var toComparators = require_to_comparators();
    var maxSatisfying = require_max_satisfying();
    var minSatisfying = require_min_satisfying();
    var minVersion = require_min_version();
    var validRange = require_valid2();
    var outside = require_outside();
    var gtr = require_gtr();
    var ltr = require_ltr();
    var intersects = require_intersects();
    var simplifyRange = require_simplify();
    var subset = require_subset();
    module2.exports = {
      parse,
      valid,
      clean,
      inc,
      diff,
      major,
      minor,
      patch,
      prerelease,
      compare,
      rcompare,
      compareLoose,
      compareBuild,
      sort,
      rsort,
      gt,
      lt,
      eq,
      neq,
      gte,
      lte,
      cmp,
      coerce,
      Comparator,
      Range,
      satisfies,
      toComparators,
      maxSatisfying,
      minSatisfying,
      minVersion,
      validRange,
      outside,
      gtr,
      ltr,
      intersects,
      simplifyRange,
      subset,
      SemVer,
      re: internalRe.re,
      src: internalRe.src,
      tokens: internalRe.t,
      SEMVER_SPEC_VERSION: constants4.SEMVER_SPEC_VERSION,
      RELEASE_TYPES: constants4.RELEASE_TYPES,
      compareIdentifiers: identifiers.compareIdentifiers,
      rcompareIdentifiers: identifiers.rcompareIdentifiers
    };
  }
});

// node_modules/.pnpm/lodash.isequal@4.5.0/node_modules/lodash.isequal/index.js
var require_lodash = __commonJS({
  "node_modules/.pnpm/lodash.isequal@4.5.0/node_modules/lodash.isequal/index.js"(exports2, module2) {
    var LARGE_ARRAY_SIZE = 200;
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    var COMPARE_PARTIAL_FLAG = 1;
    var COMPARE_UNORDERED_FLAG = 2;
    var MAX_SAFE_INTEGER = 9007199254740991;
    var argsTag = "[object Arguments]";
    var arrayTag = "[object Array]";
    var asyncTag = "[object AsyncFunction]";
    var boolTag = "[object Boolean]";
    var dateTag = "[object Date]";
    var errorTag = "[object Error]";
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var mapTag = "[object Map]";
    var numberTag = "[object Number]";
    var nullTag = "[object Null]";
    var objectTag = "[object Object]";
    var promiseTag = "[object Promise]";
    var proxyTag = "[object Proxy]";
    var regexpTag = "[object RegExp]";
    var setTag = "[object Set]";
    var stringTag = "[object String]";
    var symbolTag = "[object Symbol]";
    var undefinedTag = "[object Undefined]";
    var weakMapTag = "[object WeakMap]";
    var arrayBufferTag = "[object ArrayBuffer]";
    var dataViewTag = "[object DataView]";
    var float32Tag = "[object Float32Array]";
    var float64Tag = "[object Float64Array]";
    var int8Tag = "[object Int8Array]";
    var int16Tag = "[object Int16Array]";
    var int32Tag = "[object Int32Array]";
    var uint8Tag = "[object Uint8Array]";
    var uint8ClampedTag = "[object Uint8ClampedArray]";
    var uint16Tag = "[object Uint16Array]";
    var uint32Tag = "[object Uint32Array]";
    var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
    var reIsHostCtor = /^\[object .+?Constructor\]$/;
    var reIsUint = /^(?:0|[1-9]\d*)$/;
    var typedArrayTags = {};
    typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;
    typedArrayTags[argsTag] = typedArrayTags[arrayTag] = typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] = typedArrayTags[dataViewTag] = typedArrayTags[dateTag] = typedArrayTags[errorTag] = typedArrayTags[funcTag] = typedArrayTags[mapTag] = typedArrayTags[numberTag] = typedArrayTags[objectTag] = typedArrayTags[regexpTag] = typedArrayTags[setTag] = typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;
    var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
    var freeSelf = typeof self == "object" && self && self.Object === Object && self;
    var root = freeGlobal || freeSelf || Function("return this")();
    var freeExports = typeof exports2 == "object" && exports2 && !exports2.nodeType && exports2;
    var freeModule = freeExports && typeof module2 == "object" && module2 && !module2.nodeType && module2;
    var moduleExports = freeModule && freeModule.exports === freeExports;
    var freeProcess = moduleExports && freeGlobal.process;
    var nodeUtil = (function() {
      try {
        return freeProcess && freeProcess.binding && freeProcess.binding("util");
      } catch (e) {
      }
    })();
    var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;
    function arrayFilter(array, predicate) {
      var index = -1, length = array == null ? 0 : array.length, resIndex = 0, result = [];
      while (++index < length) {
        var value = array[index];
        if (predicate(value, index, array)) {
          result[resIndex++] = value;
        }
      }
      return result;
    }
    function arrayPush(array, values) {
      var index = -1, length = values.length, offset = array.length;
      while (++index < length) {
        array[offset + index] = values[index];
      }
      return array;
    }
    function arraySome(array, predicate) {
      var index = -1, length = array == null ? 0 : array.length;
      while (++index < length) {
        if (predicate(array[index], index, array)) {
          return true;
        }
      }
      return false;
    }
    function baseTimes(n, iteratee) {
      var index = -1, result = Array(n);
      while (++index < n) {
        result[index] = iteratee(index);
      }
      return result;
    }
    function baseUnary(func) {
      return function(value) {
        return func(value);
      };
    }
    function cacheHas(cache, key) {
      return cache.has(key);
    }
    function getValue(object, key) {
      return object == null ? void 0 : object[key];
    }
    function mapToArray(map) {
      var index = -1, result = Array(map.size);
      map.forEach(function(value, key) {
        result[++index] = [key, value];
      });
      return result;
    }
    function overArg(func, transform) {
      return function(arg) {
        return func(transform(arg));
      };
    }
    function setToArray(set) {
      var index = -1, result = Array(set.size);
      set.forEach(function(value) {
        result[++index] = value;
      });
      return result;
    }
    var arrayProto = Array.prototype;
    var funcProto = Function.prototype;
    var objectProto = Object.prototype;
    var coreJsData = root["__core-js_shared__"];
    var funcToString = funcProto.toString;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var maskSrcKey = (function() {
      var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
      return uid ? "Symbol(src)_1." + uid : "";
    })();
    var nativeObjectToString = objectProto.toString;
    var reIsNative = RegExp(
      "^" + funcToString.call(hasOwnProperty).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
    );
    var Buffer2 = moduleExports ? root.Buffer : void 0;
    var Symbol2 = root.Symbol;
    var Uint8Array2 = root.Uint8Array;
    var propertyIsEnumerable = objectProto.propertyIsEnumerable;
    var splice = arrayProto.splice;
    var symToStringTag = Symbol2 ? Symbol2.toStringTag : void 0;
    var nativeGetSymbols = Object.getOwnPropertySymbols;
    var nativeIsBuffer = Buffer2 ? Buffer2.isBuffer : void 0;
    var nativeKeys = overArg(Object.keys, Object);
    var DataView = getNative(root, "DataView");
    var Map2 = getNative(root, "Map");
    var Promise2 = getNative(root, "Promise");
    var Set2 = getNative(root, "Set");
    var WeakMap2 = getNative(root, "WeakMap");
    var nativeCreate = getNative(Object, "create");
    var dataViewCtorString = toSource(DataView);
    var mapCtorString = toSource(Map2);
    var promiseCtorString = toSource(Promise2);
    var setCtorString = toSource(Set2);
    var weakMapCtorString = toSource(WeakMap2);
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolValueOf = symbolProto ? symbolProto.valueOf : void 0;
    function Hash(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    function hashClear() {
      this.__data__ = nativeCreate ? nativeCreate(null) : {};
      this.size = 0;
    }
    function hashDelete(key) {
      var result = this.has(key) && delete this.__data__[key];
      this.size -= result ? 1 : 0;
      return result;
    }
    function hashGet(key) {
      var data = this.__data__;
      if (nativeCreate) {
        var result = data[key];
        return result === HASH_UNDEFINED ? void 0 : result;
      }
      return hasOwnProperty.call(data, key) ? data[key] : void 0;
    }
    function hashHas(key) {
      var data = this.__data__;
      return nativeCreate ? data[key] !== void 0 : hasOwnProperty.call(data, key);
    }
    function hashSet(key, value) {
      var data = this.__data__;
      this.size += this.has(key) ? 0 : 1;
      data[key] = nativeCreate && value === void 0 ? HASH_UNDEFINED : value;
      return this;
    }
    Hash.prototype.clear = hashClear;
    Hash.prototype["delete"] = hashDelete;
    Hash.prototype.get = hashGet;
    Hash.prototype.has = hashHas;
    Hash.prototype.set = hashSet;
    function ListCache(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    function listCacheClear() {
      this.__data__ = [];
      this.size = 0;
    }
    function listCacheDelete(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        return false;
      }
      var lastIndex2 = data.length - 1;
      if (index == lastIndex2) {
        data.pop();
      } else {
        splice.call(data, index, 1);
      }
      --this.size;
      return true;
    }
    function listCacheGet(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      return index < 0 ? void 0 : data[index][1];
    }
    function listCacheHas(key) {
      return assocIndexOf(this.__data__, key) > -1;
    }
    function listCacheSet(key, value) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        ++this.size;
        data.push([key, value]);
      } else {
        data[index][1] = value;
      }
      return this;
    }
    ListCache.prototype.clear = listCacheClear;
    ListCache.prototype["delete"] = listCacheDelete;
    ListCache.prototype.get = listCacheGet;
    ListCache.prototype.has = listCacheHas;
    ListCache.prototype.set = listCacheSet;
    function MapCache(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    function mapCacheClear() {
      this.size = 0;
      this.__data__ = {
        "hash": new Hash(),
        "map": new (Map2 || ListCache)(),
        "string": new Hash()
      };
    }
    function mapCacheDelete(key) {
      var result = getMapData(this, key)["delete"](key);
      this.size -= result ? 1 : 0;
      return result;
    }
    function mapCacheGet(key) {
      return getMapData(this, key).get(key);
    }
    function mapCacheHas(key) {
      return getMapData(this, key).has(key);
    }
    function mapCacheSet(key, value) {
      var data = getMapData(this, key), size = data.size;
      data.set(key, value);
      this.size += data.size == size ? 0 : 1;
      return this;
    }
    MapCache.prototype.clear = mapCacheClear;
    MapCache.prototype["delete"] = mapCacheDelete;
    MapCache.prototype.get = mapCacheGet;
    MapCache.prototype.has = mapCacheHas;
    MapCache.prototype.set = mapCacheSet;
    function SetCache(values) {
      var index = -1, length = values == null ? 0 : values.length;
      this.__data__ = new MapCache();
      while (++index < length) {
        this.add(values[index]);
      }
    }
    function setCacheAdd(value) {
      this.__data__.set(value, HASH_UNDEFINED);
      return this;
    }
    function setCacheHas(value) {
      return this.__data__.has(value);
    }
    SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
    SetCache.prototype.has = setCacheHas;
    function Stack(entries) {
      var data = this.__data__ = new ListCache(entries);
      this.size = data.size;
    }
    function stackClear() {
      this.__data__ = new ListCache();
      this.size = 0;
    }
    function stackDelete(key) {
      var data = this.__data__, result = data["delete"](key);
      this.size = data.size;
      return result;
    }
    function stackGet(key) {
      return this.__data__.get(key);
    }
    function stackHas(key) {
      return this.__data__.has(key);
    }
    function stackSet(key, value) {
      var data = this.__data__;
      if (data instanceof ListCache) {
        var pairs = data.__data__;
        if (!Map2 || pairs.length < LARGE_ARRAY_SIZE - 1) {
          pairs.push([key, value]);
          this.size = ++data.size;
          return this;
        }
        data = this.__data__ = new MapCache(pairs);
      }
      data.set(key, value);
      this.size = data.size;
      return this;
    }
    Stack.prototype.clear = stackClear;
    Stack.prototype["delete"] = stackDelete;
    Stack.prototype.get = stackGet;
    Stack.prototype.has = stackHas;
    Stack.prototype.set = stackSet;
    function arrayLikeKeys(value, inherited) {
      var isArr = isArray(value), isArg = !isArr && isArguments(value), isBuff = !isArr && !isArg && isBuffer(value), isType = !isArr && !isArg && !isBuff && isTypedArray(value), skipIndexes = isArr || isArg || isBuff || isType, result = skipIndexes ? baseTimes(value.length, String) : [], length = result.length;
      for (var key in value) {
        if ((inherited || hasOwnProperty.call(value, key)) && !(skipIndexes && // Safari 9 has enumerable `arguments.length` in strict mode.
        (key == "length" || // Node.js 0.10 has enumerable non-index properties on buffers.
        isBuff && (key == "offset" || key == "parent") || // PhantomJS 2 has enumerable non-index properties on typed arrays.
        isType && (key == "buffer" || key == "byteLength" || key == "byteOffset") || // Skip index properties.
        isIndex(key, length)))) {
          result.push(key);
        }
      }
      return result;
    }
    function assocIndexOf(array, key) {
      var length = array.length;
      while (length--) {
        if (eq(array[length][0], key)) {
          return length;
        }
      }
      return -1;
    }
    function baseGetAllKeys(object, keysFunc, symbolsFunc) {
      var result = keysFunc(object);
      return isArray(object) ? result : arrayPush(result, symbolsFunc(object));
    }
    function baseGetTag(value) {
      if (value == null) {
        return value === void 0 ? undefinedTag : nullTag;
      }
      return symToStringTag && symToStringTag in Object(value) ? getRawTag(value) : objectToString(value);
    }
    function baseIsArguments(value) {
      return isObjectLike(value) && baseGetTag(value) == argsTag;
    }
    function baseIsEqual(value, other, bitmask, customizer, stack) {
      if (value === other) {
        return true;
      }
      if (value == null || other == null || !isObjectLike(value) && !isObjectLike(other)) {
        return value !== value && other !== other;
      }
      return baseIsEqualDeep(value, other, bitmask, customizer, baseIsEqual, stack);
    }
    function baseIsEqualDeep(object, other, bitmask, customizer, equalFunc, stack) {
      var objIsArr = isArray(object), othIsArr = isArray(other), objTag = objIsArr ? arrayTag : getTag(object), othTag = othIsArr ? arrayTag : getTag(other);
      objTag = objTag == argsTag ? objectTag : objTag;
      othTag = othTag == argsTag ? objectTag : othTag;
      var objIsObj = objTag == objectTag, othIsObj = othTag == objectTag, isSameTag = objTag == othTag;
      if (isSameTag && isBuffer(object)) {
        if (!isBuffer(other)) {
          return false;
        }
        objIsArr = true;
        objIsObj = false;
      }
      if (isSameTag && !objIsObj) {
        stack || (stack = new Stack());
        return objIsArr || isTypedArray(object) ? equalArrays(object, other, bitmask, customizer, equalFunc, stack) : equalByTag(object, other, objTag, bitmask, customizer, equalFunc, stack);
      }
      if (!(bitmask & COMPARE_PARTIAL_FLAG)) {
        var objIsWrapped = objIsObj && hasOwnProperty.call(object, "__wrapped__"), othIsWrapped = othIsObj && hasOwnProperty.call(other, "__wrapped__");
        if (objIsWrapped || othIsWrapped) {
          var objUnwrapped = objIsWrapped ? object.value() : object, othUnwrapped = othIsWrapped ? other.value() : other;
          stack || (stack = new Stack());
          return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
        }
      }
      if (!isSameTag) {
        return false;
      }
      stack || (stack = new Stack());
      return equalObjects(object, other, bitmask, customizer, equalFunc, stack);
    }
    function baseIsNative(value) {
      if (!isObject(value) || isMasked(value)) {
        return false;
      }
      var pattern = isFunction(value) ? reIsNative : reIsHostCtor;
      return pattern.test(toSource(value));
    }
    function baseIsTypedArray(value) {
      return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[baseGetTag(value)];
    }
    function baseKeys(object) {
      if (!isPrototype(object)) {
        return nativeKeys(object);
      }
      var result = [];
      for (var key in Object(object)) {
        if (hasOwnProperty.call(object, key) && key != "constructor") {
          result.push(key);
        }
      }
      return result;
    }
    function equalArrays(array, other, bitmask, customizer, equalFunc, stack) {
      var isPartial = bitmask & COMPARE_PARTIAL_FLAG, arrLength = array.length, othLength = other.length;
      if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
        return false;
      }
      var stacked = stack.get(array);
      if (stacked && stack.get(other)) {
        return stacked == other;
      }
      var index = -1, result = true, seen = bitmask & COMPARE_UNORDERED_FLAG ? new SetCache() : void 0;
      stack.set(array, other);
      stack.set(other, array);
      while (++index < arrLength) {
        var arrValue = array[index], othValue = other[index];
        if (customizer) {
          var compared = isPartial ? customizer(othValue, arrValue, index, other, array, stack) : customizer(arrValue, othValue, index, array, other, stack);
        }
        if (compared !== void 0) {
          if (compared) {
            continue;
          }
          result = false;
          break;
        }
        if (seen) {
          if (!arraySome(other, function(othValue2, othIndex) {
            if (!cacheHas(seen, othIndex) && (arrValue === othValue2 || equalFunc(arrValue, othValue2, bitmask, customizer, stack))) {
              return seen.push(othIndex);
            }
          })) {
            result = false;
            break;
          }
        } else if (!(arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
          result = false;
          break;
        }
      }
      stack["delete"](array);
      stack["delete"](other);
      return result;
    }
    function equalByTag(object, other, tag, bitmask, customizer, equalFunc, stack) {
      switch (tag) {
        case dataViewTag:
          if (object.byteLength != other.byteLength || object.byteOffset != other.byteOffset) {
            return false;
          }
          object = object.buffer;
          other = other.buffer;
        case arrayBufferTag:
          if (object.byteLength != other.byteLength || !equalFunc(new Uint8Array2(object), new Uint8Array2(other))) {
            return false;
          }
          return true;
        case boolTag:
        case dateTag:
        case numberTag:
          return eq(+object, +other);
        case errorTag:
          return object.name == other.name && object.message == other.message;
        case regexpTag:
        case stringTag:
          return object == other + "";
        case mapTag:
          var convert = mapToArray;
        case setTag:
          var isPartial = bitmask & COMPARE_PARTIAL_FLAG;
          convert || (convert = setToArray);
          if (object.size != other.size && !isPartial) {
            return false;
          }
          var stacked = stack.get(object);
          if (stacked) {
            return stacked == other;
          }
          bitmask |= COMPARE_UNORDERED_FLAG;
          stack.set(object, other);
          var result = equalArrays(convert(object), convert(other), bitmask, customizer, equalFunc, stack);
          stack["delete"](object);
          return result;
        case symbolTag:
          if (symbolValueOf) {
            return symbolValueOf.call(object) == symbolValueOf.call(other);
          }
      }
      return false;
    }
    function equalObjects(object, other, bitmask, customizer, equalFunc, stack) {
      var isPartial = bitmask & COMPARE_PARTIAL_FLAG, objProps = getAllKeys(object), objLength = objProps.length, othProps = getAllKeys(other), othLength = othProps.length;
      if (objLength != othLength && !isPartial) {
        return false;
      }
      var index = objLength;
      while (index--) {
        var key = objProps[index];
        if (!(isPartial ? key in other : hasOwnProperty.call(other, key))) {
          return false;
        }
      }
      var stacked = stack.get(object);
      if (stacked && stack.get(other)) {
        return stacked == other;
      }
      var result = true;
      stack.set(object, other);
      stack.set(other, object);
      var skipCtor = isPartial;
      while (++index < objLength) {
        key = objProps[index];
        var objValue = object[key], othValue = other[key];
        if (customizer) {
          var compared = isPartial ? customizer(othValue, objValue, key, other, object, stack) : customizer(objValue, othValue, key, object, other, stack);
        }
        if (!(compared === void 0 ? objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack) : compared)) {
          result = false;
          break;
        }
        skipCtor || (skipCtor = key == "constructor");
      }
      if (result && !skipCtor) {
        var objCtor = object.constructor, othCtor = other.constructor;
        if (objCtor != othCtor && ("constructor" in object && "constructor" in other) && !(typeof objCtor == "function" && objCtor instanceof objCtor && typeof othCtor == "function" && othCtor instanceof othCtor)) {
          result = false;
        }
      }
      stack["delete"](object);
      stack["delete"](other);
      return result;
    }
    function getAllKeys(object) {
      return baseGetAllKeys(object, keys, getSymbols);
    }
    function getMapData(map, key) {
      var data = map.__data__;
      return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
    }
    function getNative(object, key) {
      var value = getValue(object, key);
      return baseIsNative(value) ? value : void 0;
    }
    function getRawTag(value) {
      var isOwn = hasOwnProperty.call(value, symToStringTag), tag = value[symToStringTag];
      try {
        value[symToStringTag] = void 0;
        var unmasked = true;
      } catch (e) {
      }
      var result = nativeObjectToString.call(value);
      if (unmasked) {
        if (isOwn) {
          value[symToStringTag] = tag;
        } else {
          delete value[symToStringTag];
        }
      }
      return result;
    }
    var getSymbols = !nativeGetSymbols ? stubArray : function(object) {
      if (object == null) {
        return [];
      }
      object = Object(object);
      return arrayFilter(nativeGetSymbols(object), function(symbol) {
        return propertyIsEnumerable.call(object, symbol);
      });
    };
    var getTag = baseGetTag;
    if (DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag || Map2 && getTag(new Map2()) != mapTag || Promise2 && getTag(Promise2.resolve()) != promiseTag || Set2 && getTag(new Set2()) != setTag || WeakMap2 && getTag(new WeakMap2()) != weakMapTag) {
      getTag = function(value) {
        var result = baseGetTag(value), Ctor = result == objectTag ? value.constructor : void 0, ctorString = Ctor ? toSource(Ctor) : "";
        if (ctorString) {
          switch (ctorString) {
            case dataViewCtorString:
              return dataViewTag;
            case mapCtorString:
              return mapTag;
            case promiseCtorString:
              return promiseTag;
            case setCtorString:
              return setTag;
            case weakMapCtorString:
              return weakMapTag;
          }
        }
        return result;
      };
    }
    function isIndex(value, length) {
      length = length == null ? MAX_SAFE_INTEGER : length;
      return !!length && (typeof value == "number" || reIsUint.test(value)) && (value > -1 && value % 1 == 0 && value < length);
    }
    function isKeyable(value) {
      var type = typeof value;
      return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null;
    }
    function isMasked(func) {
      return !!maskSrcKey && maskSrcKey in func;
    }
    function isPrototype(value) {
      var Ctor = value && value.constructor, proto = typeof Ctor == "function" && Ctor.prototype || objectProto;
      return value === proto;
    }
    function objectToString(value) {
      return nativeObjectToString.call(value);
    }
    function toSource(func) {
      if (func != null) {
        try {
          return funcToString.call(func);
        } catch (e) {
        }
        try {
          return func + "";
        } catch (e) {
        }
      }
      return "";
    }
    function eq(value, other) {
      return value === other || value !== value && other !== other;
    }
    var isArguments = baseIsArguments(/* @__PURE__ */ (function() {
      return arguments;
    })()) ? baseIsArguments : function(value) {
      return isObjectLike(value) && hasOwnProperty.call(value, "callee") && !propertyIsEnumerable.call(value, "callee");
    };
    var isArray = Array.isArray;
    function isArrayLike(value) {
      return value != null && isLength(value.length) && !isFunction(value);
    }
    var isBuffer = nativeIsBuffer || stubFalse;
    function isEqual(value, other) {
      return baseIsEqual(value, other);
    }
    function isFunction(value) {
      if (!isObject(value)) {
        return false;
      }
      var tag = baseGetTag(value);
      return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
    }
    function isLength(value) {
      return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
    }
    function isObject(value) {
      var type = typeof value;
      return value != null && (type == "object" || type == "function");
    }
    function isObjectLike(value) {
      return value != null && typeof value == "object";
    }
    var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;
    function keys(object) {
      return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
    }
    function stubArray() {
      return [];
    }
    function stubFalse() {
      return false;
    }
    module2.exports = isEqual;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/DownloadedUpdateHelper.js
var require_DownloadedUpdateHelper = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/DownloadedUpdateHelper.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DownloadedUpdateHelper = void 0;
    exports2.createTempUpdateFile = createTempUpdateFile;
    var crypto_1 = require("crypto");
    var fs_1 = require("fs");
    var isEqual = require_lodash();
    var fs_extra_1 = require_lib();
    var path = require("path");
    var DownloadedUpdateHelper = class {
      constructor(cacheDir) {
        this.cacheDir = cacheDir;
        this._file = null;
        this._packageFile = null;
        this.versionInfo = null;
        this.fileInfo = null;
        this._downloadedFileInfo = null;
      }
      get downloadedFileInfo() {
        return this._downloadedFileInfo;
      }
      get file() {
        return this._file;
      }
      get packageFile() {
        return this._packageFile;
      }
      get cacheDirForPendingUpdate() {
        return path.join(this.cacheDir, "pending");
      }
      async validateDownloadedPath(updateFile, updateInfo, fileInfo, logger) {
        if (this.versionInfo != null && this.file === updateFile && this.fileInfo != null) {
          if (isEqual(this.versionInfo, updateInfo) && isEqual(this.fileInfo.info, fileInfo.info) && await (0, fs_extra_1.pathExists)(updateFile)) {
            return updateFile;
          } else {
            return null;
          }
        }
        const cachedUpdateFile = await this.getValidCachedUpdateFile(fileInfo, logger);
        if (cachedUpdateFile === null) {
          return null;
        }
        logger.info(`Update has already been downloaded to ${updateFile}).`);
        this._file = cachedUpdateFile;
        return cachedUpdateFile;
      }
      async setDownloadedFile(downloadedFile, packageFile, versionInfo, fileInfo, updateFileName, isSaveCache) {
        this._file = downloadedFile;
        this._packageFile = packageFile;
        this.versionInfo = versionInfo;
        this.fileInfo = fileInfo;
        this._downloadedFileInfo = {
          fileName: updateFileName,
          sha512: fileInfo.info.sha512,
          isAdminRightsRequired: fileInfo.info.isAdminRightsRequired === true
        };
        if (isSaveCache) {
          await (0, fs_extra_1.outputJson)(this.getUpdateInfoFile(), this._downloadedFileInfo);
        }
      }
      async clear() {
        this._file = null;
        this._packageFile = null;
        this.versionInfo = null;
        this.fileInfo = null;
        await this.cleanCacheDirForPendingUpdate();
      }
      async cleanCacheDirForPendingUpdate() {
        try {
          await (0, fs_extra_1.emptyDir)(this.cacheDirForPendingUpdate);
        } catch (_ignore) {
        }
      }
      /**
       * Returns "update-info.json" which is created in the update cache directory's "pending" subfolder after the first update is downloaded.  If the update file does not exist then the cache is cleared and recreated.  If the update file exists then its properties are validated.
       * @param fileInfo
       * @param logger
       */
      async getValidCachedUpdateFile(fileInfo, logger) {
        const updateInfoFilePath = this.getUpdateInfoFile();
        const doesUpdateInfoFileExist = await (0, fs_extra_1.pathExists)(updateInfoFilePath);
        if (!doesUpdateInfoFileExist) {
          return null;
        }
        let cachedInfo;
        try {
          cachedInfo = await (0, fs_extra_1.readJson)(updateInfoFilePath);
        } catch (error) {
          let message = `No cached update info available`;
          if (error.code !== "ENOENT") {
            await this.cleanCacheDirForPendingUpdate();
            message += ` (error on read: ${error.message})`;
          }
          logger.info(message);
          return null;
        }
        const isCachedInfoFileNameValid = (cachedInfo === null || cachedInfo === void 0 ? void 0 : cachedInfo.fileName) !== null;
        if (!isCachedInfoFileNameValid) {
          logger.warn(`Cached update info is corrupted: no fileName, directory for cached update will be cleaned`);
          await this.cleanCacheDirForPendingUpdate();
          return null;
        }
        if (fileInfo.info.sha512 !== cachedInfo.sha512) {
          logger.info(`Cached update sha512 checksum doesn't match the latest available update. New update must be downloaded. Cached: ${cachedInfo.sha512}, expected: ${fileInfo.info.sha512}. Directory for cached update will be cleaned`);
          await this.cleanCacheDirForPendingUpdate();
          return null;
        }
        const updateFile = path.join(this.cacheDirForPendingUpdate, cachedInfo.fileName);
        if (!await (0, fs_extra_1.pathExists)(updateFile)) {
          logger.info("Cached update file doesn't exist");
          return null;
        }
        const sha512 = await hashFile(updateFile);
        if (fileInfo.info.sha512 !== sha512) {
          logger.warn(`Sha512 checksum doesn't match the latest available update. New update must be downloaded. Cached: ${sha512}, expected: ${fileInfo.info.sha512}`);
          await this.cleanCacheDirForPendingUpdate();
          return null;
        }
        this._downloadedFileInfo = cachedInfo;
        return updateFile;
      }
      getUpdateInfoFile() {
        return path.join(this.cacheDirForPendingUpdate, "update-info.json");
      }
    };
    exports2.DownloadedUpdateHelper = DownloadedUpdateHelper;
    function hashFile(file, algorithm = "sha512", encoding = "base64", options2) {
      return new Promise((resolve2, reject) => {
        const hash = (0, crypto_1.createHash)(algorithm);
        hash.on("error", reject).setEncoding(encoding);
        (0, fs_1.createReadStream)(file, {
          ...options2,
          highWaterMark: 1024 * 1024
          /* better to use more memory but hash faster */
        }).on("error", reject).on("end", () => {
          hash.end();
          resolve2(hash.read());
        }).pipe(hash, { end: false });
      });
    }
    async function createTempUpdateFile(name, cacheDir, log) {
      let nameCounter = 0;
      let result = path.join(cacheDir, name);
      for (let i2 = 0; i2 < 3; i2++) {
        try {
          await (0, fs_extra_1.unlink)(result);
          return result;
        } catch (e) {
          if (e.code === "ENOENT") {
            return result;
          }
          log.warn(`Error on remove temp update file: ${e}`);
          result = path.join(cacheDir, `${nameCounter++}-${name}`);
        }
      }
      return result;
    }
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/AppAdapter.js
var require_AppAdapter = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/AppAdapter.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getAppCacheDir = getAppCacheDir;
    var path = require("path");
    var os_1 = require("os");
    function getAppCacheDir() {
      const homedir = (0, os_1.homedir)();
      let result;
      if (process.platform === "win32") {
        result = process.env["LOCALAPPDATA"] || path.join(homedir, "AppData", "Local");
      } else if (process.platform === "darwin") {
        result = path.join(homedir, "Library", "Caches");
      } else {
        result = process.env["XDG_CACHE_HOME"] || path.join(homedir, ".cache");
      }
      return result;
    }
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/ElectronAppAdapter.js
var require_ElectronAppAdapter = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/ElectronAppAdapter.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ElectronAppAdapter = void 0;
    var path = require("path");
    var AppAdapter_1 = require_AppAdapter();
    var ElectronAppAdapter = class {
      constructor(app25 = require("electron").app) {
        this.app = app25;
      }
      whenReady() {
        return this.app.whenReady();
      }
      get version() {
        return this.app.getVersion();
      }
      get name() {
        return this.app.getName();
      }
      get isPackaged() {
        return this.app.isPackaged === true;
      }
      get appUpdateConfigPath() {
        return this.isPackaged ? path.join(process.resourcesPath, "app-update.yml") : path.join(this.app.getAppPath(), "dev-app-update.yml");
      }
      get userDataPath() {
        return this.app.getPath("userData");
      }
      get baseCachePath() {
        return (0, AppAdapter_1.getAppCacheDir)();
      }
      quit() {
        this.app.quit();
      }
      relaunch() {
        this.app.relaunch();
      }
      onQuit(handler) {
        this.app.once("quit", (_, exitCode) => handler(exitCode));
      }
    };
    exports2.ElectronAppAdapter = ElectronAppAdapter;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/electronHttpExecutor.js
var require_electronHttpExecutor = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/electronHttpExecutor.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ElectronHttpExecutor = exports2.NET_SESSION_NAME = void 0;
    exports2.getNetSession = getNetSession;
    var builder_util_runtime_1 = require_out();
    exports2.NET_SESSION_NAME = "electron-updater";
    function getNetSession() {
      return require("electron").session.fromPartition(exports2.NET_SESSION_NAME, {
        cache: false
      });
    }
    var ElectronHttpExecutor = class extends builder_util_runtime_1.HttpExecutor {
      constructor(proxyLoginCallback) {
        super();
        this.proxyLoginCallback = proxyLoginCallback;
        this.cachedSession = null;
      }
      async download(url, destination, options2) {
        return await options2.cancellationToken.createPromise((resolve2, reject, onCancel) => {
          const requestOptions = {
            headers: options2.headers || void 0,
            redirect: "manual"
          };
          (0, builder_util_runtime_1.configureRequestUrl)(url, requestOptions);
          (0, builder_util_runtime_1.configureRequestOptions)(requestOptions);
          this.doDownload(requestOptions, {
            destination,
            options: options2,
            onCancel,
            callback: (error) => {
              if (error == null) {
                resolve2(destination);
              } else {
                reject(error);
              }
            },
            responseHandler: null
          }, 0);
        });
      }
      createRequest(options2, callback) {
        if (options2.headers && options2.headers.Host) {
          options2.host = options2.headers.Host;
          delete options2.headers.Host;
        }
        if (this.cachedSession == null) {
          this.cachedSession = getNetSession();
        }
        const request = require("electron").net.request({
          ...options2,
          session: this.cachedSession
        });
        request.on("response", callback);
        if (this.proxyLoginCallback != null) {
          request.on("login", this.proxyLoginCallback);
        }
        return request;
      }
      addRedirectHandlers(request, options2, reject, redirectCount, handler) {
        request.on("redirect", (statusCode, method, redirectUrl) => {
          request.abort();
          if (redirectCount > this.maxRedirects) {
            reject(this.createMaxRedirectError());
          } else {
            handler(builder_util_runtime_1.HttpExecutor.prepareRedirectUrlOptions(redirectUrl, options2));
          }
        });
      }
    };
    exports2.ElectronHttpExecutor = ElectronHttpExecutor;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/util.js
var require_util = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/util.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.newBaseUrl = newBaseUrl;
    exports2.newUrlFromBase = newUrlFromBase;
    exports2.getChannelFilename = getChannelFilename;
    var url_1 = require("url");
    function newBaseUrl(url) {
      const result = new url_1.URL(url);
      if (!result.pathname.endsWith("/")) {
        result.pathname += "/";
      }
      return result;
    }
    function newUrlFromBase(pathname, baseUrl, addRandomQueryToAvoidCaching = false) {
      const result = new url_1.URL(pathname, baseUrl);
      const search = baseUrl.search;
      if (search != null && search.length !== 0) {
        result.search = search;
      } else if (addRandomQueryToAvoidCaching) {
        result.search = `noCache=${Date.now().toString(32)}`;
      }
      return result;
    }
    function getChannelFilename(channel) {
      return `${channel}.yml`;
    }
  }
});

// node_modules/.pnpm/lodash.escaperegexp@4.1.2/node_modules/lodash.escaperegexp/index.js
var require_lodash2 = __commonJS({
  "node_modules/.pnpm/lodash.escaperegexp@4.1.2/node_modules/lodash.escaperegexp/index.js"(exports2, module2) {
    var INFINITY = 1 / 0;
    var symbolTag = "[object Symbol]";
    var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
    var reHasRegExpChar = RegExp(reRegExpChar.source);
    var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
    var freeSelf = typeof self == "object" && self && self.Object === Object && self;
    var root = freeGlobal || freeSelf || Function("return this")();
    var objectProto = Object.prototype;
    var objectToString = objectProto.toString;
    var Symbol2 = root.Symbol;
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolToString = symbolProto ? symbolProto.toString : void 0;
    function baseToString(value) {
      if (typeof value == "string") {
        return value;
      }
      if (isSymbol(value)) {
        return symbolToString ? symbolToString.call(value) : "";
      }
      var result = value + "";
      return result == "0" && 1 / value == -INFINITY ? "-0" : result;
    }
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function isSymbol(value) {
      return typeof value == "symbol" || isObjectLike(value) && objectToString.call(value) == symbolTag;
    }
    function toString(value) {
      return value == null ? "" : baseToString(value);
    }
    function escapeRegExp(string) {
      string = toString(string);
      return string && reHasRegExpChar.test(string) ? string.replace(reRegExpChar, "\\$&") : string;
    }
    module2.exports = escapeRegExp;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/providers/Provider.js
var require_Provider = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/providers/Provider.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Provider = void 0;
    exports2.findFile = findFile;
    exports2.parseUpdateInfo = parseUpdateInfo;
    exports2.getFileList = getFileList;
    exports2.resolveFiles = resolveFiles;
    var builder_util_runtime_1 = require_out();
    var js_yaml_1 = require_js_yaml();
    var url_1 = require("url");
    var util_1 = require_util();
    var escapeRegExp = require_lodash2();
    var Provider = class {
      constructor(runtimeOptions) {
        this.runtimeOptions = runtimeOptions;
        this.requestHeaders = null;
        this.executor = runtimeOptions.executor;
      }
      // By default, the blockmap file is in the same directory as the main file
      // But some providers may have a different blockmap file, so we need to override this method
      getBlockMapFiles(baseUrl, oldVersion, newVersion, oldBlockMapFileBaseUrl = null) {
        const newBlockMapUrl = (0, util_1.newUrlFromBase)(`${baseUrl.pathname}.blockmap`, baseUrl);
        const oldBlockMapUrl = (0, util_1.newUrlFromBase)(`${baseUrl.pathname.replace(new RegExp(escapeRegExp(newVersion), "g"), oldVersion)}.blockmap`, oldBlockMapFileBaseUrl ? new url_1.URL(oldBlockMapFileBaseUrl) : baseUrl);
        return [oldBlockMapUrl, newBlockMapUrl];
      }
      get isUseMultipleRangeRequest() {
        return this.runtimeOptions.isUseMultipleRangeRequest !== false;
      }
      getChannelFilePrefix() {
        if (this.runtimeOptions.platform === "linux") {
          const arch = process.env["TEST_UPDATER_ARCH"] || process.arch;
          const archSuffix = arch === "x64" ? "" : `-${arch}`;
          return "-linux" + archSuffix;
        } else {
          return this.runtimeOptions.platform === "darwin" ? "-mac" : "";
        }
      }
      // due to historical reasons for windows we use channel name without platform specifier
      getDefaultChannelName() {
        return this.getCustomChannelName("latest");
      }
      getCustomChannelName(channel) {
        return `${channel}${this.getChannelFilePrefix()}`;
      }
      get fileExtraDownloadHeaders() {
        return null;
      }
      setRequestHeaders(value) {
        this.requestHeaders = value;
      }
      /**
       * Method to perform API request only to resolve update info, but not to download update.
       */
      httpRequest(url, headers, cancellationToken) {
        return this.executor.request(this.createRequestOptions(url, headers), cancellationToken);
      }
      createRequestOptions(url, headers) {
        const result = {};
        if (this.requestHeaders == null) {
          if (headers != null) {
            result.headers = headers;
          }
        } else {
          result.headers = headers == null ? this.requestHeaders : { ...this.requestHeaders, ...headers };
        }
        (0, builder_util_runtime_1.configureRequestUrl)(url, result);
        return result;
      }
    };
    exports2.Provider = Provider;
    function findFile(files, extension2, not) {
      var _a2;
      if (files.length === 0) {
        throw (0, builder_util_runtime_1.newError)("No files provided", "ERR_UPDATER_NO_FILES_PROVIDED");
      }
      const filteredFiles = files.filter((it) => it.url.pathname.toLowerCase().endsWith(`.${extension2.toLowerCase()}`));
      const result = (_a2 = filteredFiles.find((it) => [it.url.pathname, it.info.url].some((n) => n.includes(process.arch)))) !== null && _a2 !== void 0 ? _a2 : filteredFiles.shift();
      if (result) {
        return result;
      } else if (not == null) {
        return files[0];
      } else {
        return files.find((fileInfo) => !not.some((ext) => fileInfo.url.pathname.toLowerCase().endsWith(`.${ext.toLowerCase()}`)));
      }
    }
    function parseUpdateInfo(rawData, channelFile, channelFileUrl) {
      if (rawData == null) {
        throw (0, builder_util_runtime_1.newError)(`Cannot parse update info from ${channelFile} in the latest release artifacts (${channelFileUrl}): rawData: null`, "ERR_UPDATER_INVALID_UPDATE_INFO");
      }
      let result;
      try {
        result = (0, js_yaml_1.load)(rawData);
      } catch (e) {
        throw (0, builder_util_runtime_1.newError)(`Cannot parse update info from ${channelFile} in the latest release artifacts (${channelFileUrl}): ${e.stack || e.message}, rawData: ${rawData}`, "ERR_UPDATER_INVALID_UPDATE_INFO");
      }
      return result;
    }
    function getFileList(updateInfo) {
      const files = updateInfo.files;
      if (files != null && files.length > 0) {
        return files;
      }
      if (updateInfo.path != null) {
        return [
          {
            url: updateInfo.path,
            sha2: updateInfo.sha2,
            sha512: updateInfo.sha512
          }
        ];
      } else {
        throw (0, builder_util_runtime_1.newError)(`No files provided: ${(0, builder_util_runtime_1.safeStringifyJson)(updateInfo)}`, "ERR_UPDATER_NO_FILES_PROVIDED");
      }
    }
    function resolveFiles(updateInfo, baseUrl, pathTransformer = (p) => p) {
      const files = getFileList(updateInfo);
      const result = files.map((fileInfo) => {
        if (fileInfo.sha2 == null && fileInfo.sha512 == null) {
          throw (0, builder_util_runtime_1.newError)(`Update info doesn't contain nor sha256 neither sha512 checksum: ${(0, builder_util_runtime_1.safeStringifyJson)(fileInfo)}`, "ERR_UPDATER_NO_CHECKSUM");
        }
        return {
          url: (0, util_1.newUrlFromBase)(pathTransformer(fileInfo.url), baseUrl),
          info: fileInfo
        };
      });
      const packages = updateInfo.packages;
      const packageInfo = packages == null ? null : packages[process.arch] || packages.ia32;
      if (packageInfo != null) {
        ;
        result[0].packageInfo = {
          ...packageInfo,
          path: (0, util_1.newUrlFromBase)(pathTransformer(packageInfo.path), baseUrl).href
        };
      }
      return result;
    }
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/providers/GenericProvider.js
var require_GenericProvider = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/providers/GenericProvider.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.GenericProvider = void 0;
    var builder_util_runtime_1 = require_out();
    var util_1 = require_util();
    var Provider_1 = require_Provider();
    var GenericProvider = class extends Provider_1.Provider {
      constructor(configuration, updater, runtimeOptions) {
        super(runtimeOptions);
        this.configuration = configuration;
        this.updater = updater;
        this.baseUrl = (0, util_1.newBaseUrl)(this.configuration.url);
      }
      get channel() {
        const result = this.updater.channel || this.configuration.channel;
        return result == null ? this.getDefaultChannelName() : this.getCustomChannelName(result);
      }
      async getLatestVersion() {
        const channelFile = (0, util_1.getChannelFilename)(this.channel);
        const channelUrl = (0, util_1.newUrlFromBase)(channelFile, this.baseUrl, this.updater.isAddNoCacheQuery);
        for (let attemptNumber = 0; ; attemptNumber++) {
          try {
            return (0, Provider_1.parseUpdateInfo)(await this.httpRequest(channelUrl), channelFile, channelUrl);
          } catch (e) {
            if (e instanceof builder_util_runtime_1.HttpError && e.statusCode === 404) {
              throw (0, builder_util_runtime_1.newError)(`Cannot find channel "${channelFile}" update info: ${e.stack || e.message}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND");
            } else if (e.code === "ECONNREFUSED") {
              if (attemptNumber < 3) {
                await new Promise((resolve2, reject) => {
                  try {
                    setTimeout(resolve2, 1e3 * attemptNumber);
                  } catch (e2) {
                    reject(e2);
                  }
                });
                continue;
              }
            }
            throw e;
          }
        }
      }
      resolveFiles(updateInfo) {
        return (0, Provider_1.resolveFiles)(updateInfo, this.baseUrl);
      }
    };
    exports2.GenericProvider = GenericProvider;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/providers/BitbucketProvider.js
var require_BitbucketProvider = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/providers/BitbucketProvider.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.BitbucketProvider = void 0;
    var builder_util_runtime_1 = require_out();
    var util_1 = require_util();
    var Provider_1 = require_Provider();
    var BitbucketProvider = class extends Provider_1.Provider {
      constructor(configuration, updater, runtimeOptions) {
        super({
          ...runtimeOptions,
          isUseMultipleRangeRequest: false
        });
        this.configuration = configuration;
        this.updater = updater;
        const { owner, slug } = configuration;
        this.baseUrl = (0, util_1.newBaseUrl)(`https://api.bitbucket.org/2.0/repositories/${owner}/${slug}/downloads`);
      }
      get channel() {
        return this.updater.channel || this.configuration.channel || "latest";
      }
      async getLatestVersion() {
        const cancellationToken = new builder_util_runtime_1.CancellationToken();
        const channelFile = (0, util_1.getChannelFilename)(this.getCustomChannelName(this.channel));
        const channelUrl = (0, util_1.newUrlFromBase)(channelFile, this.baseUrl, this.updater.isAddNoCacheQuery);
        try {
          const updateInfo = await this.httpRequest(channelUrl, void 0, cancellationToken);
          return (0, Provider_1.parseUpdateInfo)(updateInfo, channelFile, channelUrl);
        } catch (e) {
          throw (0, builder_util_runtime_1.newError)(`Unable to find latest version on ${this.toString()}, please ensure release exists: ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND");
        }
      }
      resolveFiles(updateInfo) {
        return (0, Provider_1.resolveFiles)(updateInfo, this.baseUrl);
      }
      toString() {
        const { owner, slug } = this.configuration;
        return `Bitbucket (owner: ${owner}, slug: ${slug}, channel: ${this.channel})`;
      }
    };
    exports2.BitbucketProvider = BitbucketProvider;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/providers/GitHubProvider.js
var require_GitHubProvider = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/providers/GitHubProvider.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.GitHubProvider = exports2.BaseGitHubProvider = void 0;
    exports2.computeReleaseNotes = computeReleaseNotes;
    var builder_util_runtime_1 = require_out();
    var semver = require_semver2();
    var url_1 = require("url");
    var util_1 = require_util();
    var Provider_1 = require_Provider();
    var hrefRegExp = /\/tag\/([^/]+)$/;
    var BaseGitHubProvider = class extends Provider_1.Provider {
      constructor(options2, defaultHost, runtimeOptions) {
        super({
          ...runtimeOptions,
          /* because GitHib uses S3 */
          isUseMultipleRangeRequest: false
        });
        this.options = options2;
        this.baseUrl = (0, util_1.newBaseUrl)((0, builder_util_runtime_1.githubUrl)(options2, defaultHost));
        const apiHost = defaultHost === "github.com" ? "api.github.com" : defaultHost;
        this.baseApiUrl = (0, util_1.newBaseUrl)((0, builder_util_runtime_1.githubUrl)(options2, apiHost));
      }
      computeGithubBasePath(result) {
        const host = this.options.host;
        return host && !["github.com", "api.github.com"].includes(host) ? `/api/v3${result}` : result;
      }
    };
    exports2.BaseGitHubProvider = BaseGitHubProvider;
    var GitHubProvider = class extends BaseGitHubProvider {
      constructor(options2, updater, runtimeOptions) {
        super(options2, "github.com", runtimeOptions);
        this.options = options2;
        this.updater = updater;
      }
      get channel() {
        const result = this.updater.channel || this.options.channel;
        return result == null ? this.getDefaultChannelName() : this.getCustomChannelName(result);
      }
      async getLatestVersion() {
        var _a2, _b2, _c, _d, _e;
        const cancellationToken = new builder_util_runtime_1.CancellationToken();
        const feedXml = await this.httpRequest((0, util_1.newUrlFromBase)(`${this.basePath}.atom`, this.baseUrl), {
          accept: "application/xml, application/atom+xml, text/xml, */*"
        }, cancellationToken);
        const feed = (0, builder_util_runtime_1.parseXml)(feedXml);
        let latestRelease = feed.element("entry", false, `No published versions on GitHub`);
        let tag = null;
        try {
          if (this.updater.allowPrerelease) {
            const currentChannel = ((_a2 = this.updater) === null || _a2 === void 0 ? void 0 : _a2.channel) || ((_b2 = semver.prerelease(this.updater.currentVersion)) === null || _b2 === void 0 ? void 0 : _b2[0]) || null;
            if (currentChannel === null) {
              tag = hrefRegExp.exec(latestRelease.element("link").attribute("href"))[1];
            } else {
              for (const element of feed.getElements("entry")) {
                const hrefElement = hrefRegExp.exec(element.element("link").attribute("href"));
                if (hrefElement === null) {
                  continue;
                }
                const hrefTag = hrefElement[1];
                const hrefChannel = ((_c = semver.prerelease(hrefTag)) === null || _c === void 0 ? void 0 : _c[0]) || null;
                const shouldFetchVersion = !currentChannel || ["alpha", "beta"].includes(currentChannel);
                const isCustomChannel = hrefChannel !== null && !["alpha", "beta"].includes(String(hrefChannel));
                const channelMismatch = currentChannel === "beta" && hrefChannel === "alpha";
                if (shouldFetchVersion && !isCustomChannel && !channelMismatch) {
                  tag = hrefTag;
                  break;
                }
                const isNextPreRelease = hrefChannel && hrefChannel === currentChannel;
                if (isNextPreRelease) {
                  tag = hrefTag;
                  break;
                }
              }
            }
          } else {
            tag = await this.getLatestTagName(cancellationToken);
            for (const element of feed.getElements("entry")) {
              if (hrefRegExp.exec(element.element("link").attribute("href"))[1] === tag) {
                latestRelease = element;
                break;
              }
            }
          }
        } catch (e) {
          throw (0, builder_util_runtime_1.newError)(`Cannot parse releases feed: ${e.stack || e.message},
XML:
${feedXml}`, "ERR_UPDATER_INVALID_RELEASE_FEED");
        }
        if (tag == null) {
          throw (0, builder_util_runtime_1.newError)(`No published versions on GitHub`, "ERR_UPDATER_NO_PUBLISHED_VERSIONS");
        }
        let rawData;
        let channelFile = "";
        let channelFileUrl = "";
        const fetchData = async (channelName) => {
          channelFile = (0, util_1.getChannelFilename)(channelName);
          channelFileUrl = (0, util_1.newUrlFromBase)(this.getBaseDownloadPath(String(tag), channelFile), this.baseUrl);
          const requestOptions = this.createRequestOptions(channelFileUrl);
          try {
            return await this.executor.request(requestOptions, cancellationToken);
          } catch (e) {
            if (e instanceof builder_util_runtime_1.HttpError && e.statusCode === 404) {
              throw (0, builder_util_runtime_1.newError)(`Cannot find ${channelFile} in the latest release artifacts (${channelFileUrl}): ${e.stack || e.message}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND");
            }
            throw e;
          }
        };
        try {
          let channel = this.channel;
          if (this.updater.allowPrerelease && ((_d = semver.prerelease(tag)) === null || _d === void 0 ? void 0 : _d[0])) {
            channel = this.getCustomChannelName(String((_e = semver.prerelease(tag)) === null || _e === void 0 ? void 0 : _e[0]));
          }
          rawData = await fetchData(channel);
        } catch (e) {
          if (this.updater.allowPrerelease) {
            rawData = await fetchData(this.getDefaultChannelName());
          } else {
            throw e;
          }
        }
        const result = (0, Provider_1.parseUpdateInfo)(rawData, channelFile, channelFileUrl);
        if (result.releaseName == null) {
          result.releaseName = latestRelease.elementValueOrEmpty("title");
        }
        if (result.releaseNotes == null) {
          result.releaseNotes = computeReleaseNotes(this.updater.currentVersion, this.updater.fullChangelog, feed, latestRelease);
        }
        return {
          tag,
          ...result
        };
      }
      async getLatestTagName(cancellationToken) {
        const options2 = this.options;
        const url = options2.host == null || options2.host === "github.com" ? (0, util_1.newUrlFromBase)(`${this.basePath}/latest`, this.baseUrl) : new url_1.URL(`${this.computeGithubBasePath(`/repos/${options2.owner}/${options2.repo}/releases`)}/latest`, this.baseApiUrl);
        try {
          const rawData = await this.httpRequest(url, { Accept: "application/json" }, cancellationToken);
          if (rawData == null) {
            return null;
          }
          const releaseInfo = JSON.parse(rawData);
          return releaseInfo.tag_name;
        } catch (e) {
          throw (0, builder_util_runtime_1.newError)(`Unable to find latest version on GitHub (${url}), please ensure a production release exists: ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND");
        }
      }
      get basePath() {
        return `/${this.options.owner}/${this.options.repo}/releases`;
      }
      resolveFiles(updateInfo) {
        return (0, Provider_1.resolveFiles)(updateInfo, this.baseUrl, (p) => this.getBaseDownloadPath(updateInfo.tag, p.replace(/ /g, "-")));
      }
      getBaseDownloadPath(tag, fileName) {
        return `${this.basePath}/download/${tag}/${fileName}`;
      }
    };
    exports2.GitHubProvider = GitHubProvider;
    function getNoteValue(parent) {
      const result = parent.elementValueOrEmpty("content");
      return result === "No content." ? "" : result;
    }
    function computeReleaseNotes(currentVersion, isFullChangelog, feed, latestRelease) {
      if (!isFullChangelog) {
        return getNoteValue(latestRelease);
      }
      const releaseNotes = [];
      for (const release2 of feed.getElements("entry")) {
        const versionRelease = /\/tag\/v?([^/]+)$/.exec(release2.element("link").attribute("href"))[1];
        if (semver.valid(versionRelease) && semver.lt(currentVersion, versionRelease)) {
          releaseNotes.push({
            version: versionRelease,
            note: getNoteValue(release2)
          });
        }
      }
      return releaseNotes.sort((a, b) => semver.rcompare(a.version, b.version));
    }
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/providers/GitLabProvider.js
var require_GitLabProvider = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/providers/GitLabProvider.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.GitLabProvider = void 0;
    var builder_util_runtime_1 = require_out();
    var url_1 = require("url");
    var escapeRegExp = require_lodash2();
    var util_1 = require_util();
    var Provider_1 = require_Provider();
    var GitLabProvider = class extends Provider_1.Provider {
      /**
       * Normalizes filenames by replacing spaces and underscores with dashes.
       *
       * This is a workaround to handle filename formatting differences between tools:
       * - electron-builder formats filenames like "test file.txt" as "test-file.txt"
       * - GitLab may provide asset URLs using underscores, such as "test_file.txt"
       *
       * Because of this mismatch, we can't reliably extract the correct filename from
       * the asset path without normalization. This function ensures consistent matching
       * across different filename formats by converting all spaces and underscores to dashes.
       *
       * @param filename The filename to normalize
       * @returns The normalized filename with spaces and underscores replaced by dashes
       */
      normalizeFilename(filename) {
        return filename.replace(/ |_/g, "-");
      }
      constructor(options2, updater, runtimeOptions) {
        super({
          ...runtimeOptions,
          // GitLab might not support multiple range requests efficiently
          isUseMultipleRangeRequest: false
        });
        this.options = options2;
        this.updater = updater;
        this.cachedLatestVersion = null;
        const defaultHost = "gitlab.com";
        const host = options2.host || defaultHost;
        this.baseApiUrl = (0, util_1.newBaseUrl)(`https://${host}/api/v4`);
      }
      get channel() {
        const result = this.updater.channel || this.options.channel;
        return result == null ? this.getDefaultChannelName() : this.getCustomChannelName(result);
      }
      async getLatestVersion() {
        const cancellationToken = new builder_util_runtime_1.CancellationToken();
        const latestReleaseUrl = (0, util_1.newUrlFromBase)(`projects/${this.options.projectId}/releases/permalink/latest`, this.baseApiUrl);
        let latestRelease;
        try {
          const header = { "Content-Type": "application/json", ...this.setAuthHeaderForToken(this.options.token || null) };
          const releaseResponse = await this.httpRequest(latestReleaseUrl, header, cancellationToken);
          if (!releaseResponse) {
            throw (0, builder_util_runtime_1.newError)("No latest release found", "ERR_UPDATER_NO_PUBLISHED_VERSIONS");
          }
          latestRelease = JSON.parse(releaseResponse);
        } catch (e) {
          throw (0, builder_util_runtime_1.newError)(`Unable to find latest release on GitLab (${latestReleaseUrl}): ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND");
        }
        const tag = latestRelease.tag_name;
        let rawData = null;
        let channelFile = "";
        let channelFileUrl = null;
        const fetchChannelData = async (channelName) => {
          channelFile = (0, util_1.getChannelFilename)(channelName);
          const channelAsset = latestRelease.assets.links.find((asset) => asset.name === channelFile);
          if (!channelAsset) {
            throw (0, builder_util_runtime_1.newError)(`Cannot find ${channelFile} in the latest release assets`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND");
          }
          channelFileUrl = new url_1.URL(channelAsset.direct_asset_url);
          const headers = this.options.token ? { "PRIVATE-TOKEN": this.options.token } : void 0;
          try {
            const result2 = await this.httpRequest(channelFileUrl, headers, cancellationToken);
            if (!result2) {
              throw (0, builder_util_runtime_1.newError)(`Empty response from ${channelFileUrl}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND");
            }
            return result2;
          } catch (e) {
            if (e instanceof builder_util_runtime_1.HttpError && e.statusCode === 404) {
              throw (0, builder_util_runtime_1.newError)(`Cannot find ${channelFile} in the latest release artifacts (${channelFileUrl}): ${e.stack || e.message}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND");
            }
            throw e;
          }
        };
        try {
          rawData = await fetchChannelData(this.channel);
        } catch (e) {
          if (this.channel !== this.getDefaultChannelName()) {
            rawData = await fetchChannelData(this.getDefaultChannelName());
          } else {
            throw e;
          }
        }
        if (!rawData) {
          throw (0, builder_util_runtime_1.newError)(`Unable to parse channel data from ${channelFile}`, "ERR_UPDATER_INVALID_UPDATE_INFO");
        }
        const result = (0, Provider_1.parseUpdateInfo)(rawData, channelFile, channelFileUrl);
        if (result.releaseName == null) {
          result.releaseName = latestRelease.name;
        }
        if (result.releaseNotes == null) {
          result.releaseNotes = latestRelease.description || null;
        }
        const assetsMap = /* @__PURE__ */ new Map();
        for (const asset of latestRelease.assets.links) {
          assetsMap.set(this.normalizeFilename(asset.name), asset.direct_asset_url);
        }
        const gitlabUpdateInfo = {
          tag,
          assets: assetsMap,
          ...result
        };
        this.cachedLatestVersion = gitlabUpdateInfo;
        return gitlabUpdateInfo;
      }
      /**
       * Utility function to convert GitlabReleaseAsset to Map<string, string>
       * Maps asset names to their download URLs
       */
      convertAssetsToMap(assets) {
        const assetsMap = /* @__PURE__ */ new Map();
        for (const asset of assets.links) {
          assetsMap.set(this.normalizeFilename(asset.name), asset.direct_asset_url);
        }
        return assetsMap;
      }
      /**
       * Find blockmap file URL in assets map for a specific filename
       */
      findBlockMapInAssets(assets, filename) {
        const possibleBlockMapNames = [`${filename}.blockmap`, `${this.normalizeFilename(filename)}.blockmap`];
        for (const blockMapName of possibleBlockMapNames) {
          const assetUrl = assets.get(blockMapName);
          if (assetUrl) {
            return new url_1.URL(assetUrl);
          }
        }
        return null;
      }
      async fetchReleaseInfoByVersion(version) {
        const cancellationToken = new builder_util_runtime_1.CancellationToken();
        const possibleReleaseIds = [`v${version}`, version];
        for (const releaseId of possibleReleaseIds) {
          const releaseUrl = (0, util_1.newUrlFromBase)(`projects/${this.options.projectId}/releases/${encodeURIComponent(releaseId)}`, this.baseApiUrl);
          try {
            const header = { "Content-Type": "application/json", ...this.setAuthHeaderForToken(this.options.token || null) };
            const releaseResponse = await this.httpRequest(releaseUrl, header, cancellationToken);
            if (releaseResponse) {
              const release2 = JSON.parse(releaseResponse);
              return release2;
            }
          } catch (e) {
            if (e instanceof builder_util_runtime_1.HttpError && e.statusCode === 404) {
              continue;
            }
            throw (0, builder_util_runtime_1.newError)(`Unable to find release ${releaseId} on GitLab (${releaseUrl}): ${e.stack || e.message}`, "ERR_UPDATER_RELEASE_NOT_FOUND");
          }
        }
        throw (0, builder_util_runtime_1.newError)(`Unable to find release with version ${version} (tried: ${possibleReleaseIds.join(", ")}) on GitLab`, "ERR_UPDATER_RELEASE_NOT_FOUND");
      }
      setAuthHeaderForToken(token) {
        const headers = {};
        if (token != null) {
          if (token.startsWith("Bearer")) {
            headers.authorization = token;
          } else {
            headers["PRIVATE-TOKEN"] = token;
          }
        }
        return headers;
      }
      /**
       * Get version info for blockmap files, using cache when possible
       */
      async getVersionInfoForBlockMap(version) {
        if (this.cachedLatestVersion && this.cachedLatestVersion.version === version) {
          return this.cachedLatestVersion.assets;
        }
        const versionInfo = await this.fetchReleaseInfoByVersion(version);
        if (versionInfo && versionInfo.assets) {
          return this.convertAssetsToMap(versionInfo.assets);
        }
        return null;
      }
      /**
       * Find blockmap URLs from version assets
       */
      async findBlockMapUrlsFromAssets(oldVersion, newVersion, baseFilename) {
        let newBlockMapUrl = null;
        let oldBlockMapUrl = null;
        const newVersionAssets = await this.getVersionInfoForBlockMap(newVersion);
        if (newVersionAssets) {
          newBlockMapUrl = this.findBlockMapInAssets(newVersionAssets, baseFilename);
        }
        const oldVersionAssets = await this.getVersionInfoForBlockMap(oldVersion);
        if (oldVersionAssets) {
          const oldFilename = baseFilename.replace(new RegExp(escapeRegExp(newVersion), "g"), oldVersion);
          oldBlockMapUrl = this.findBlockMapInAssets(oldVersionAssets, oldFilename);
        }
        return [oldBlockMapUrl, newBlockMapUrl];
      }
      async getBlockMapFiles(baseUrl, oldVersion, newVersion, oldBlockMapFileBaseUrl = null) {
        if (this.options.uploadTarget === "project_upload") {
          const baseFilename = baseUrl.pathname.split("/").pop() || "";
          const [oldBlockMapUrl, newBlockMapUrl] = await this.findBlockMapUrlsFromAssets(oldVersion, newVersion, baseFilename);
          if (!newBlockMapUrl) {
            throw (0, builder_util_runtime_1.newError)(`Cannot find blockmap file for ${newVersion} in GitLab assets`, "ERR_UPDATER_BLOCKMAP_FILE_NOT_FOUND");
          }
          if (!oldBlockMapUrl) {
            throw (0, builder_util_runtime_1.newError)(`Cannot find blockmap file for ${oldVersion} in GitLab assets`, "ERR_UPDATER_BLOCKMAP_FILE_NOT_FOUND");
          }
          return [oldBlockMapUrl, newBlockMapUrl];
        } else {
          return super.getBlockMapFiles(baseUrl, oldVersion, newVersion, oldBlockMapFileBaseUrl);
        }
      }
      resolveFiles(updateInfo) {
        return (0, Provider_1.getFileList)(updateInfo).map((fileInfo) => {
          const possibleNames = [
            fileInfo.url,
            // Original filename
            this.normalizeFilename(fileInfo.url)
            // Normalized filename (spaces/underscores → dashes)
          ];
          const matchingAssetName = possibleNames.find((name) => updateInfo.assets.has(name));
          const assetUrl = matchingAssetName ? updateInfo.assets.get(matchingAssetName) : void 0;
          if (!assetUrl) {
            throw (0, builder_util_runtime_1.newError)(`Cannot find asset "${fileInfo.url}" in GitLab release assets. Available assets: ${Array.from(updateInfo.assets.keys()).join(", ")}`, "ERR_UPDATER_ASSET_NOT_FOUND");
          }
          return {
            url: new url_1.URL(assetUrl),
            info: fileInfo
          };
        });
      }
      toString() {
        return `GitLab (projectId: ${this.options.projectId}, channel: ${this.channel})`;
      }
    };
    exports2.GitLabProvider = GitLabProvider;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/providers/KeygenProvider.js
var require_KeygenProvider = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/providers/KeygenProvider.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.KeygenProvider = void 0;
    var builder_util_runtime_1 = require_out();
    var util_1 = require_util();
    var Provider_1 = require_Provider();
    var KeygenProvider = class extends Provider_1.Provider {
      constructor(configuration, updater, runtimeOptions) {
        super({
          ...runtimeOptions,
          isUseMultipleRangeRequest: false
        });
        this.configuration = configuration;
        this.updater = updater;
        this.defaultHostname = "api.keygen.sh";
        const host = this.configuration.host || this.defaultHostname;
        this.baseUrl = (0, util_1.newBaseUrl)(`https://${host}/v1/accounts/${this.configuration.account}/artifacts?product=${this.configuration.product}`);
      }
      get channel() {
        return this.updater.channel || this.configuration.channel || "stable";
      }
      async getLatestVersion() {
        const cancellationToken = new builder_util_runtime_1.CancellationToken();
        const channelFile = (0, util_1.getChannelFilename)(this.getCustomChannelName(this.channel));
        const channelUrl = (0, util_1.newUrlFromBase)(channelFile, this.baseUrl, this.updater.isAddNoCacheQuery);
        try {
          const updateInfo = await this.httpRequest(channelUrl, {
            Accept: "application/vnd.api+json",
            "Keygen-Version": "1.1"
          }, cancellationToken);
          return (0, Provider_1.parseUpdateInfo)(updateInfo, channelFile, channelUrl);
        } catch (e) {
          throw (0, builder_util_runtime_1.newError)(`Unable to find latest version on ${this.toString()}, please ensure release exists: ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND");
        }
      }
      resolveFiles(updateInfo) {
        return (0, Provider_1.resolveFiles)(updateInfo, this.baseUrl);
      }
      toString() {
        const { account, product, platform } = this.configuration;
        return `Keygen (account: ${account}, product: ${product}, platform: ${platform}, channel: ${this.channel})`;
      }
    };
    exports2.KeygenProvider = KeygenProvider;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/providers/PrivateGitHubProvider.js
var require_PrivateGitHubProvider = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/providers/PrivateGitHubProvider.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.PrivateGitHubProvider = void 0;
    var builder_util_runtime_1 = require_out();
    var js_yaml_1 = require_js_yaml();
    var path = require("path");
    var url_1 = require("url");
    var util_1 = require_util();
    var GitHubProvider_1 = require_GitHubProvider();
    var Provider_1 = require_Provider();
    var PrivateGitHubProvider = class extends GitHubProvider_1.BaseGitHubProvider {
      constructor(options2, updater, token, runtimeOptions) {
        super(options2, "api.github.com", runtimeOptions);
        this.updater = updater;
        this.token = token;
      }
      createRequestOptions(url, headers) {
        const result = super.createRequestOptions(url, headers);
        result.redirect = "manual";
        return result;
      }
      async getLatestVersion() {
        const cancellationToken = new builder_util_runtime_1.CancellationToken();
        const channelFile = (0, util_1.getChannelFilename)(this.getDefaultChannelName());
        const releaseInfo = await this.getLatestVersionInfo(cancellationToken);
        const asset = releaseInfo.assets.find((it) => it.name === channelFile);
        if (asset == null) {
          throw (0, builder_util_runtime_1.newError)(`Cannot find ${channelFile} in the release ${releaseInfo.html_url || releaseInfo.name}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND");
        }
        const url = new url_1.URL(asset.url);
        let result;
        try {
          result = (0, js_yaml_1.load)(await this.httpRequest(url, this.configureHeaders("application/octet-stream"), cancellationToken));
        } catch (e) {
          if (e instanceof builder_util_runtime_1.HttpError && e.statusCode === 404) {
            throw (0, builder_util_runtime_1.newError)(`Cannot find ${channelFile} in the latest release artifacts (${url}): ${e.stack || e.message}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND");
          }
          throw e;
        }
        ;
        result.assets = releaseInfo.assets;
        return result;
      }
      get fileExtraDownloadHeaders() {
        return this.configureHeaders("application/octet-stream");
      }
      configureHeaders(accept) {
        return {
          accept,
          authorization: `token ${this.token}`
        };
      }
      async getLatestVersionInfo(cancellationToken) {
        const allowPrerelease = this.updater.allowPrerelease;
        let basePath = this.basePath;
        if (!allowPrerelease) {
          basePath = `${basePath}/latest`;
        }
        const url = (0, util_1.newUrlFromBase)(basePath, this.baseUrl);
        try {
          const version = JSON.parse(await this.httpRequest(url, this.configureHeaders("application/vnd.github.v3+json"), cancellationToken));
          if (allowPrerelease) {
            return version.find((it) => it.prerelease) || version[0];
          } else {
            return version;
          }
        } catch (e) {
          throw (0, builder_util_runtime_1.newError)(`Unable to find latest version on GitHub (${url}), please ensure a production release exists: ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND");
        }
      }
      get basePath() {
        return this.computeGithubBasePath(`/repos/${this.options.owner}/${this.options.repo}/releases`);
      }
      resolveFiles(updateInfo) {
        return (0, Provider_1.getFileList)(updateInfo).map((it) => {
          const name = path.posix.basename(it.url).replace(/ /g, "-");
          const asset = updateInfo.assets.find((it2) => it2 != null && it2.name === name);
          if (asset == null) {
            throw (0, builder_util_runtime_1.newError)(`Cannot find asset "${name}" in: ${JSON.stringify(updateInfo.assets, null, 2)}`, "ERR_UPDATER_ASSET_NOT_FOUND");
          }
          return {
            url: new url_1.URL(asset.url),
            info: it
          };
        });
      }
    };
    exports2.PrivateGitHubProvider = PrivateGitHubProvider;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/providerFactory.js
var require_providerFactory = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/providerFactory.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.isUrlProbablySupportMultiRangeRequests = isUrlProbablySupportMultiRangeRequests;
    exports2.createClient = createClient;
    var builder_util_runtime_1 = require_out();
    var BitbucketProvider_1 = require_BitbucketProvider();
    var GenericProvider_1 = require_GenericProvider();
    var GitHubProvider_1 = require_GitHubProvider();
    var GitLabProvider_1 = require_GitLabProvider();
    var KeygenProvider_1 = require_KeygenProvider();
    var PrivateGitHubProvider_1 = require_PrivateGitHubProvider();
    function isUrlProbablySupportMultiRangeRequests(url) {
      return !url.includes("s3.amazonaws.com");
    }
    function createClient(data, updater, runtimeOptions) {
      if (typeof data === "string") {
        throw (0, builder_util_runtime_1.newError)("Please pass PublishConfiguration object", "ERR_UPDATER_INVALID_PROVIDER_CONFIGURATION");
      }
      const provider = data.provider;
      switch (provider) {
        case "github": {
          const githubOptions = data;
          const token = (githubOptions.private ? process.env["GH_TOKEN"] || process.env["GITHUB_TOKEN"] : null) || githubOptions.token;
          if (token == null) {
            return new GitHubProvider_1.GitHubProvider(githubOptions, updater, runtimeOptions);
          } else {
            return new PrivateGitHubProvider_1.PrivateGitHubProvider(githubOptions, updater, token, runtimeOptions);
          }
        }
        case "bitbucket":
          return new BitbucketProvider_1.BitbucketProvider(data, updater, runtimeOptions);
        case "gitlab":
          return new GitLabProvider_1.GitLabProvider(data, updater, runtimeOptions);
        case "keygen":
          return new KeygenProvider_1.KeygenProvider(data, updater, runtimeOptions);
        case "s3":
        case "spaces":
          return new GenericProvider_1.GenericProvider({
            provider: "generic",
            url: (0, builder_util_runtime_1.getS3LikeProviderBaseUrl)(data),
            channel: data.channel || null
          }, updater, {
            ...runtimeOptions,
            // https://github.com/minio/minio/issues/5285#issuecomment-350428955
            isUseMultipleRangeRequest: false
          });
        case "generic": {
          const options2 = data;
          return new GenericProvider_1.GenericProvider(options2, updater, {
            ...runtimeOptions,
            isUseMultipleRangeRequest: options2.useMultipleRangeRequest !== false && isUrlProbablySupportMultiRangeRequests(options2.url)
          });
        }
        case "custom": {
          const options2 = data;
          const constructor = options2.updateProvider;
          if (!constructor) {
            throw (0, builder_util_runtime_1.newError)("Custom provider not specified", "ERR_UPDATER_INVALID_PROVIDER_CONFIGURATION");
          }
          return new constructor(options2, updater, runtimeOptions);
        }
        default:
          throw (0, builder_util_runtime_1.newError)(`Unsupported provider: ${provider}`, "ERR_UPDATER_UNSUPPORTED_PROVIDER");
      }
    }
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/differentialDownloader/downloadPlanBuilder.js
var require_downloadPlanBuilder = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/differentialDownloader/downloadPlanBuilder.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.OperationKind = void 0;
    exports2.computeOperations = computeOperations;
    var OperationKind;
    (function(OperationKind2) {
      OperationKind2[OperationKind2["COPY"] = 0] = "COPY";
      OperationKind2[OperationKind2["DOWNLOAD"] = 1] = "DOWNLOAD";
    })(OperationKind || (exports2.OperationKind = OperationKind = {}));
    function computeOperations(oldBlockMap, newBlockMap, logger) {
      const nameToOldBlocks = buildBlockFileMap(oldBlockMap.files);
      const nameToNewBlocks = buildBlockFileMap(newBlockMap.files);
      let lastOperation = null;
      const blockMapFile = newBlockMap.files[0];
      const operations = [];
      const name = blockMapFile.name;
      const oldEntry = nameToOldBlocks.get(name);
      if (oldEntry == null) {
        throw new Error(`no file ${name} in old blockmap`);
      }
      const newFile = nameToNewBlocks.get(name);
      let changedBlockCount = 0;
      const { checksumToOffset: checksumToOldOffset, checksumToOldSize } = buildChecksumMap(nameToOldBlocks.get(name), oldEntry.offset, logger);
      let newOffset = blockMapFile.offset;
      for (let i2 = 0; i2 < newFile.checksums.length; newOffset += newFile.sizes[i2], i2++) {
        const blockSize = newFile.sizes[i2];
        const checksum = newFile.checksums[i2];
        let oldOffset = checksumToOldOffset.get(checksum);
        if (oldOffset != null && checksumToOldSize.get(checksum) !== blockSize) {
          logger.warn(`Checksum ("${checksum}") matches, but size differs (old: ${checksumToOldSize.get(checksum)}, new: ${blockSize})`);
          oldOffset = void 0;
        }
        if (oldOffset === void 0) {
          changedBlockCount++;
          if (lastOperation != null && lastOperation.kind === OperationKind.DOWNLOAD && lastOperation.end === newOffset) {
            lastOperation.end += blockSize;
          } else {
            lastOperation = {
              kind: OperationKind.DOWNLOAD,
              start: newOffset,
              end: newOffset + blockSize
              // oldBlocks: null,
            };
            validateAndAdd(lastOperation, operations, checksum, i2);
          }
        } else {
          if (lastOperation != null && lastOperation.kind === OperationKind.COPY && lastOperation.end === oldOffset) {
            lastOperation.end += blockSize;
          } else {
            lastOperation = {
              kind: OperationKind.COPY,
              start: oldOffset,
              end: oldOffset + blockSize
              // oldBlocks: [checksum]
            };
            validateAndAdd(lastOperation, operations, checksum, i2);
          }
        }
      }
      if (changedBlockCount > 0) {
        logger.info(`File${blockMapFile.name === "file" ? "" : " " + blockMapFile.name} has ${changedBlockCount} changed blocks`);
      }
      return operations;
    }
    var isValidateOperationRange = process.env["DIFFERENTIAL_DOWNLOAD_PLAN_BUILDER_VALIDATE_RANGES"] === "true";
    function validateAndAdd(operation, operations, checksum, index) {
      if (isValidateOperationRange && operations.length !== 0) {
        const lastOperation = operations[operations.length - 1];
        if (lastOperation.kind === operation.kind && operation.start < lastOperation.end && operation.start > lastOperation.start) {
          const min = [lastOperation.start, lastOperation.end, operation.start, operation.end].reduce((p, v) => p < v ? p : v);
          throw new Error(`operation (block index: ${index}, checksum: ${checksum}, kind: ${OperationKind[operation.kind]}) overlaps previous operation (checksum: ${checksum}):
abs: ${lastOperation.start} until ${lastOperation.end} and ${operation.start} until ${operation.end}
rel: ${lastOperation.start - min} until ${lastOperation.end - min} and ${operation.start - min} until ${operation.end - min}`);
        }
      }
      operations.push(operation);
    }
    function buildChecksumMap(file, fileOffset, logger) {
      const checksumToOffset = /* @__PURE__ */ new Map();
      const checksumToSize = /* @__PURE__ */ new Map();
      let offset = fileOffset;
      for (let i2 = 0; i2 < file.checksums.length; i2++) {
        const checksum = file.checksums[i2];
        const size = file.sizes[i2];
        const existing = checksumToSize.get(checksum);
        if (existing === void 0) {
          checksumToOffset.set(checksum, offset);
          checksumToSize.set(checksum, size);
        } else if (logger.debug != null) {
          const sizeExplanation = existing === size ? "(same size)" : `(size: ${existing}, this size: ${size})`;
          logger.debug(`${checksum} duplicated in blockmap ${sizeExplanation}, it doesn't lead to broken differential downloader, just corresponding block will be skipped)`);
        }
        offset += size;
      }
      return { checksumToOffset, checksumToOldSize: checksumToSize };
    }
    function buildBlockFileMap(list) {
      const result = /* @__PURE__ */ new Map();
      for (const item of list) {
        result.set(item.name, item);
      }
      return result;
    }
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/differentialDownloader/DataSplitter.js
var require_DataSplitter = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/differentialDownloader/DataSplitter.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DataSplitter = void 0;
    exports2.copyData = copyData;
    var builder_util_runtime_1 = require_out();
    var fs_1 = require("fs");
    var stream_1 = require("stream");
    var downloadPlanBuilder_1 = require_downloadPlanBuilder();
    var DOUBLE_CRLF = Buffer.from("\r\n\r\n");
    var ReadState;
    (function(ReadState2) {
      ReadState2[ReadState2["INIT"] = 0] = "INIT";
      ReadState2[ReadState2["HEADER"] = 1] = "HEADER";
      ReadState2[ReadState2["BODY"] = 2] = "BODY";
    })(ReadState || (ReadState = {}));
    function copyData(task, out, oldFileFd, reject, resolve2) {
      const readStream = (0, fs_1.createReadStream)("", {
        fd: oldFileFd,
        autoClose: false,
        start: task.start,
        // end is inclusive
        end: task.end - 1
      });
      readStream.on("error", reject);
      readStream.once("end", resolve2);
      readStream.pipe(out, {
        end: false
      });
    }
    var DataSplitter = class extends stream_1.Writable {
      constructor(out, options2, partIndexToTaskIndex, boundary, partIndexToLength, finishHandler, grandTotalBytes, onProgress) {
        super();
        this.out = out;
        this.options = options2;
        this.partIndexToTaskIndex = partIndexToTaskIndex;
        this.partIndexToLength = partIndexToLength;
        this.finishHandler = finishHandler;
        this.grandTotalBytes = grandTotalBytes;
        this.onProgress = onProgress;
        this.start = Date.now();
        this.nextUpdate = this.start + 1e3;
        this.transferred = 0;
        this.delta = 0;
        this.partIndex = -1;
        this.headerListBuffer = null;
        this.readState = ReadState.INIT;
        this.ignoreByteCount = 0;
        this.remainingPartDataCount = 0;
        this.actualPartLength = 0;
        this.boundaryLength = boundary.length + 4;
        this.ignoreByteCount = this.boundaryLength - 2;
      }
      get isFinished() {
        return this.partIndex === this.partIndexToLength.length;
      }
      // noinspection JSUnusedGlobalSymbols
      _write(data, encoding, callback) {
        if (this.isFinished) {
          console.error(`Trailing ignored data: ${data.length} bytes`);
          return;
        }
        this.handleData(data).then(() => {
          if (this.onProgress) {
            const now = Date.now();
            if ((now >= this.nextUpdate || this.transferred === this.grandTotalBytes) && this.grandTotalBytes && (now - this.start) / 1e3) {
              this.nextUpdate = now + 1e3;
              this.onProgress({
                total: this.grandTotalBytes,
                delta: this.delta,
                transferred: this.transferred,
                percent: this.transferred / this.grandTotalBytes * 100,
                bytesPerSecond: Math.round(this.transferred / ((now - this.start) / 1e3))
              });
              this.delta = 0;
            }
          }
          callback();
        }).catch(callback);
      }
      async handleData(chunk) {
        let start = 0;
        if (this.ignoreByteCount !== 0 && this.remainingPartDataCount !== 0) {
          throw (0, builder_util_runtime_1.newError)("Internal error", "ERR_DATA_SPLITTER_BYTE_COUNT_MISMATCH");
        }
        if (this.ignoreByteCount > 0) {
          const toIgnore = Math.min(this.ignoreByteCount, chunk.length);
          this.ignoreByteCount -= toIgnore;
          start = toIgnore;
        } else if (this.remainingPartDataCount > 0) {
          const toRead = Math.min(this.remainingPartDataCount, chunk.length);
          this.remainingPartDataCount -= toRead;
          await this.processPartData(chunk, 0, toRead);
          start = toRead;
        }
        if (start === chunk.length) {
          return;
        }
        if (this.readState === ReadState.HEADER) {
          const headerListEnd = this.searchHeaderListEnd(chunk, start);
          if (headerListEnd === -1) {
            return;
          }
          start = headerListEnd;
          this.readState = ReadState.BODY;
          this.headerListBuffer = null;
        }
        while (true) {
          if (this.readState === ReadState.BODY) {
            this.readState = ReadState.INIT;
          } else {
            this.partIndex++;
            let taskIndex = this.partIndexToTaskIndex.get(this.partIndex);
            if (taskIndex == null) {
              if (this.isFinished) {
                taskIndex = this.options.end;
              } else {
                throw (0, builder_util_runtime_1.newError)("taskIndex is null", "ERR_DATA_SPLITTER_TASK_INDEX_IS_NULL");
              }
            }
            const prevTaskIndex = this.partIndex === 0 ? this.options.start : this.partIndexToTaskIndex.get(this.partIndex - 1) + 1;
            if (prevTaskIndex < taskIndex) {
              await this.copyExistingData(prevTaskIndex, taskIndex);
            } else if (prevTaskIndex > taskIndex) {
              throw (0, builder_util_runtime_1.newError)("prevTaskIndex must be < taskIndex", "ERR_DATA_SPLITTER_TASK_INDEX_ASSERT_FAILED");
            }
            if (this.isFinished) {
              this.onPartEnd();
              this.finishHandler();
              return;
            }
            start = this.searchHeaderListEnd(chunk, start);
            if (start === -1) {
              this.readState = ReadState.HEADER;
              return;
            }
          }
          const partLength = this.partIndexToLength[this.partIndex];
          const end = start + partLength;
          const effectiveEnd = Math.min(end, chunk.length);
          await this.processPartStarted(chunk, start, effectiveEnd);
          this.remainingPartDataCount = partLength - (effectiveEnd - start);
          if (this.remainingPartDataCount > 0) {
            return;
          }
          start = end + this.boundaryLength;
          if (start >= chunk.length) {
            this.ignoreByteCount = this.boundaryLength - (chunk.length - end);
            return;
          }
        }
      }
      copyExistingData(index, end) {
        return new Promise((resolve2, reject) => {
          const w = () => {
            if (index === end) {
              resolve2();
              return;
            }
            const task = this.options.tasks[index];
            if (task.kind !== downloadPlanBuilder_1.OperationKind.COPY) {
              reject(new Error("Task kind must be COPY"));
              return;
            }
            copyData(task, this.out, this.options.oldFileFd, reject, () => {
              index++;
              w();
            });
          };
          w();
        });
      }
      searchHeaderListEnd(chunk, readOffset) {
        const headerListEnd = chunk.indexOf(DOUBLE_CRLF, readOffset);
        if (headerListEnd !== -1) {
          return headerListEnd + DOUBLE_CRLF.length;
        }
        const partialChunk = readOffset === 0 ? chunk : chunk.slice(readOffset);
        if (this.headerListBuffer == null) {
          this.headerListBuffer = partialChunk;
        } else {
          this.headerListBuffer = Buffer.concat([this.headerListBuffer, partialChunk]);
        }
        return -1;
      }
      onPartEnd() {
        const expectedLength = this.partIndexToLength[this.partIndex - 1];
        if (this.actualPartLength !== expectedLength) {
          throw (0, builder_util_runtime_1.newError)(`Expected length: ${expectedLength} differs from actual: ${this.actualPartLength}`, "ERR_DATA_SPLITTER_LENGTH_MISMATCH");
        }
        this.actualPartLength = 0;
      }
      processPartStarted(data, start, end) {
        if (this.partIndex !== 0) {
          this.onPartEnd();
        }
        return this.processPartData(data, start, end);
      }
      processPartData(data, start, end) {
        this.actualPartLength += end - start;
        this.transferred += end - start;
        this.delta += end - start;
        const out = this.out;
        if (out.write(start === 0 && data.length === end ? data : data.slice(start, end))) {
          return Promise.resolve();
        } else {
          return new Promise((resolve2, reject) => {
            out.on("error", reject);
            out.once("drain", () => {
              out.removeListener("error", reject);
              resolve2();
            });
          });
        }
      }
    };
    exports2.DataSplitter = DataSplitter;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/differentialDownloader/multipleRangeDownloader.js
var require_multipleRangeDownloader = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/differentialDownloader/multipleRangeDownloader.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.executeTasksUsingMultipleRangeRequests = executeTasksUsingMultipleRangeRequests;
    exports2.checkIsRangesSupported = checkIsRangesSupported;
    var builder_util_runtime_1 = require_out();
    var DataSplitter_1 = require_DataSplitter();
    var downloadPlanBuilder_1 = require_downloadPlanBuilder();
    function executeTasksUsingMultipleRangeRequests(differentialDownloader, tasks, out, oldFileFd, reject) {
      const w = (taskOffset) => {
        if (taskOffset >= tasks.length) {
          if (differentialDownloader.fileMetadataBuffer != null) {
            out.write(differentialDownloader.fileMetadataBuffer);
          }
          out.end();
          return;
        }
        const nextOffset = taskOffset + 1e3;
        doExecuteTasks(differentialDownloader, {
          tasks,
          start: taskOffset,
          end: Math.min(tasks.length, nextOffset),
          oldFileFd
        }, out, () => w(nextOffset), reject);
      };
      return w;
    }
    function doExecuteTasks(differentialDownloader, options2, out, resolve2, reject) {
      let ranges = "bytes=";
      let partCount = 0;
      let grandTotalBytes = 0;
      const partIndexToTaskIndex = /* @__PURE__ */ new Map();
      const partIndexToLength = [];
      for (let i2 = options2.start; i2 < options2.end; i2++) {
        const task = options2.tasks[i2];
        if (task.kind === downloadPlanBuilder_1.OperationKind.DOWNLOAD) {
          ranges += `${task.start}-${task.end - 1}, `;
          partIndexToTaskIndex.set(partCount, i2);
          partCount++;
          partIndexToLength.push(task.end - task.start);
          grandTotalBytes += task.end - task.start;
        }
      }
      if (partCount <= 1) {
        const w = (index) => {
          if (index >= options2.end) {
            resolve2();
            return;
          }
          const task = options2.tasks[index++];
          if (task.kind === downloadPlanBuilder_1.OperationKind.COPY) {
            (0, DataSplitter_1.copyData)(task, out, options2.oldFileFd, reject, () => w(index));
          } else {
            const requestOptions2 = differentialDownloader.createRequestOptions();
            requestOptions2.headers.Range = `bytes=${task.start}-${task.end - 1}`;
            const request2 = differentialDownloader.httpExecutor.createRequest(requestOptions2, (response) => {
              response.on("error", reject);
              if (!checkIsRangesSupported(response, reject)) {
                return;
              }
              response.pipe(out, {
                end: false
              });
              response.once("end", () => w(index));
            });
            differentialDownloader.httpExecutor.addErrorAndTimeoutHandlers(request2, reject);
            request2.end();
          }
        };
        w(options2.start);
        return;
      }
      const requestOptions = differentialDownloader.createRequestOptions();
      requestOptions.headers.Range = ranges.substring(0, ranges.length - 2);
      const request = differentialDownloader.httpExecutor.createRequest(requestOptions, (response) => {
        if (!checkIsRangesSupported(response, reject)) {
          return;
        }
        const contentType = (0, builder_util_runtime_1.safeGetHeader)(response, "content-type");
        const m = /^multipart\/.+?\s*;\s*boundary=(?:"([^"]+)"|([^\s";]+))\s*$/i.exec(contentType);
        if (m == null) {
          reject(new Error(`Content-Type "multipart/byteranges" is expected, but got "${contentType}"`));
          return;
        }
        const dicer = new DataSplitter_1.DataSplitter(out, options2, partIndexToTaskIndex, m[1] || m[2], partIndexToLength, resolve2, grandTotalBytes, differentialDownloader.options.onProgress);
        dicer.on("error", reject);
        response.pipe(dicer);
        response.on("end", () => {
          setTimeout(() => {
            request.abort();
            reject(new Error("Response ends without calling any handlers"));
          }, 1e4);
        });
      });
      differentialDownloader.httpExecutor.addErrorAndTimeoutHandlers(request, reject);
      request.end();
    }
    function checkIsRangesSupported(response, reject) {
      if (response.statusCode >= 400) {
        reject((0, builder_util_runtime_1.createHttpError)(response));
        return false;
      }
      if (response.statusCode !== 206) {
        const acceptRanges = (0, builder_util_runtime_1.safeGetHeader)(response, "accept-ranges");
        if (acceptRanges == null || acceptRanges === "none") {
          reject(new Error(`Server doesn't support Accept-Ranges (response code ${response.statusCode})`));
          return false;
        }
      }
      return true;
    }
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/differentialDownloader/ProgressDifferentialDownloadCallbackTransform.js
var require_ProgressDifferentialDownloadCallbackTransform = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/differentialDownloader/ProgressDifferentialDownloadCallbackTransform.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ProgressDifferentialDownloadCallbackTransform = void 0;
    var stream_1 = require("stream");
    var OperationKind;
    (function(OperationKind2) {
      OperationKind2[OperationKind2["COPY"] = 0] = "COPY";
      OperationKind2[OperationKind2["DOWNLOAD"] = 1] = "DOWNLOAD";
    })(OperationKind || (OperationKind = {}));
    var ProgressDifferentialDownloadCallbackTransform = class extends stream_1.Transform {
      constructor(progressDifferentialDownloadInfo, cancellationToken, onProgress) {
        super();
        this.progressDifferentialDownloadInfo = progressDifferentialDownloadInfo;
        this.cancellationToken = cancellationToken;
        this.onProgress = onProgress;
        this.start = Date.now();
        this.transferred = 0;
        this.delta = 0;
        this.expectedBytes = 0;
        this.index = 0;
        this.operationType = OperationKind.COPY;
        this.nextUpdate = this.start + 1e3;
      }
      _transform(chunk, encoding, callback) {
        if (this.cancellationToken.cancelled) {
          callback(new Error("cancelled"), null);
          return;
        }
        if (this.operationType == OperationKind.COPY) {
          callback(null, chunk);
          return;
        }
        this.transferred += chunk.length;
        this.delta += chunk.length;
        const now = Date.now();
        if (now >= this.nextUpdate && this.transferred !== this.expectedBytes && this.transferred !== this.progressDifferentialDownloadInfo.grandTotal) {
          this.nextUpdate = now + 1e3;
          this.onProgress({
            total: this.progressDifferentialDownloadInfo.grandTotal,
            delta: this.delta,
            transferred: this.transferred,
            percent: this.transferred / this.progressDifferentialDownloadInfo.grandTotal * 100,
            bytesPerSecond: Math.round(this.transferred / ((now - this.start) / 1e3))
          });
          this.delta = 0;
        }
        callback(null, chunk);
      }
      beginFileCopy() {
        this.operationType = OperationKind.COPY;
      }
      beginRangeDownload() {
        this.operationType = OperationKind.DOWNLOAD;
        this.expectedBytes += this.progressDifferentialDownloadInfo.expectedByteCounts[this.index++];
      }
      endRangeDownload() {
        if (this.transferred !== this.progressDifferentialDownloadInfo.grandTotal) {
          this.onProgress({
            total: this.progressDifferentialDownloadInfo.grandTotal,
            delta: this.delta,
            transferred: this.transferred,
            percent: this.transferred / this.progressDifferentialDownloadInfo.grandTotal * 100,
            bytesPerSecond: Math.round(this.transferred / ((Date.now() - this.start) / 1e3))
          });
        }
      }
      // Called when we are 100% done with the connection/download
      _flush(callback) {
        if (this.cancellationToken.cancelled) {
          callback(new Error("cancelled"));
          return;
        }
        this.onProgress({
          total: this.progressDifferentialDownloadInfo.grandTotal,
          delta: this.delta,
          transferred: this.transferred,
          percent: 100,
          bytesPerSecond: Math.round(this.transferred / ((Date.now() - this.start) / 1e3))
        });
        this.delta = 0;
        this.transferred = 0;
        callback(null);
      }
    };
    exports2.ProgressDifferentialDownloadCallbackTransform = ProgressDifferentialDownloadCallbackTransform;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/differentialDownloader/DifferentialDownloader.js
var require_DifferentialDownloader = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/differentialDownloader/DifferentialDownloader.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DifferentialDownloader = void 0;
    var builder_util_runtime_1 = require_out();
    var fs_extra_1 = require_lib();
    var fs_1 = require("fs");
    var DataSplitter_1 = require_DataSplitter();
    var url_1 = require("url");
    var downloadPlanBuilder_1 = require_downloadPlanBuilder();
    var multipleRangeDownloader_1 = require_multipleRangeDownloader();
    var ProgressDifferentialDownloadCallbackTransform_1 = require_ProgressDifferentialDownloadCallbackTransform();
    var DifferentialDownloader = class {
      // noinspection TypeScriptAbstractClassConstructorCanBeMadeProtected
      constructor(blockAwareFileInfo, httpExecutor, options2) {
        this.blockAwareFileInfo = blockAwareFileInfo;
        this.httpExecutor = httpExecutor;
        this.options = options2;
        this.fileMetadataBuffer = null;
        this.logger = options2.logger;
      }
      createRequestOptions() {
        const result = {
          headers: {
            ...this.options.requestHeaders,
            accept: "*/*"
          }
        };
        (0, builder_util_runtime_1.configureRequestUrl)(this.options.newUrl, result);
        (0, builder_util_runtime_1.configureRequestOptions)(result);
        return result;
      }
      doDownload(oldBlockMap, newBlockMap) {
        if (oldBlockMap.version !== newBlockMap.version) {
          throw new Error(`version is different (${oldBlockMap.version} - ${newBlockMap.version}), full download is required`);
        }
        const logger = this.logger;
        const operations = (0, downloadPlanBuilder_1.computeOperations)(oldBlockMap, newBlockMap, logger);
        if (logger.debug != null) {
          logger.debug(JSON.stringify(operations, null, 2));
        }
        let downloadSize = 0;
        let copySize = 0;
        for (const operation of operations) {
          const length = operation.end - operation.start;
          if (operation.kind === downloadPlanBuilder_1.OperationKind.DOWNLOAD) {
            downloadSize += length;
          } else {
            copySize += length;
          }
        }
        const newSize = this.blockAwareFileInfo.size;
        if (downloadSize + copySize + (this.fileMetadataBuffer == null ? 0 : this.fileMetadataBuffer.length) !== newSize) {
          throw new Error(`Internal error, size mismatch: downloadSize: ${downloadSize}, copySize: ${copySize}, newSize: ${newSize}`);
        }
        logger.info(`Full: ${formatBytes(newSize)}, To download: ${formatBytes(downloadSize)} (${Math.round(downloadSize / (newSize / 100))}%)`);
        return this.downloadFile(operations);
      }
      downloadFile(tasks) {
        const fdList = [];
        const closeFiles = () => {
          return Promise.all(fdList.map((openedFile) => {
            return (0, fs_extra_1.close)(openedFile.descriptor).catch((e) => {
              this.logger.error(`cannot close file "${openedFile.path}": ${e}`);
            });
          }));
        };
        return this.doDownloadFile(tasks, fdList).then(closeFiles).catch((e) => {
          return closeFiles().catch((closeFilesError) => {
            try {
              this.logger.error(`cannot close files: ${closeFilesError}`);
            } catch (errorOnLog) {
              try {
                console.error(errorOnLog);
              } catch (_ignored) {
              }
            }
            throw e;
          }).then(() => {
            throw e;
          });
        });
      }
      async doDownloadFile(tasks, fdList) {
        const oldFileFd = await (0, fs_extra_1.open)(this.options.oldFile, "r");
        fdList.push({ descriptor: oldFileFd, path: this.options.oldFile });
        const newFileFd = await (0, fs_extra_1.open)(this.options.newFile, "w");
        fdList.push({ descriptor: newFileFd, path: this.options.newFile });
        const fileOut = (0, fs_1.createWriteStream)(this.options.newFile, { fd: newFileFd });
        await new Promise((resolve2, reject) => {
          const streams = [];
          let downloadInfoTransform = void 0;
          if (!this.options.isUseMultipleRangeRequest && this.options.onProgress) {
            const expectedByteCounts = [];
            let grandTotalBytes = 0;
            for (const task of tasks) {
              if (task.kind === downloadPlanBuilder_1.OperationKind.DOWNLOAD) {
                expectedByteCounts.push(task.end - task.start);
                grandTotalBytes += task.end - task.start;
              }
            }
            const progressDifferentialDownloadInfo = {
              expectedByteCounts,
              grandTotal: grandTotalBytes
            };
            downloadInfoTransform = new ProgressDifferentialDownloadCallbackTransform_1.ProgressDifferentialDownloadCallbackTransform(progressDifferentialDownloadInfo, this.options.cancellationToken, this.options.onProgress);
            streams.push(downloadInfoTransform);
          }
          const digestTransform = new builder_util_runtime_1.DigestTransform(this.blockAwareFileInfo.sha512);
          digestTransform.isValidateOnEnd = false;
          streams.push(digestTransform);
          fileOut.on("finish", () => {
            ;
            fileOut.close(() => {
              fdList.splice(1, 1);
              try {
                digestTransform.validate();
              } catch (e) {
                reject(e);
                return;
              }
              resolve2(void 0);
            });
          });
          streams.push(fileOut);
          let lastStream = null;
          for (const stream of streams) {
            stream.on("error", reject);
            if (lastStream == null) {
              lastStream = stream;
            } else {
              lastStream = lastStream.pipe(stream);
            }
          }
          const firstStream = streams[0];
          let w;
          if (this.options.isUseMultipleRangeRequest) {
            w = (0, multipleRangeDownloader_1.executeTasksUsingMultipleRangeRequests)(this, tasks, firstStream, oldFileFd, reject);
            w(0);
            return;
          }
          let downloadOperationCount = 0;
          let actualUrl = null;
          this.logger.info(`Differential download: ${this.options.newUrl}`);
          const requestOptions = this.createRequestOptions();
          requestOptions.redirect = "manual";
          w = (index) => {
            var _a2, _b2;
            if (index >= tasks.length) {
              if (this.fileMetadataBuffer != null) {
                firstStream.write(this.fileMetadataBuffer);
              }
              firstStream.end();
              return;
            }
            const operation = tasks[index++];
            if (operation.kind === downloadPlanBuilder_1.OperationKind.COPY) {
              if (downloadInfoTransform) {
                downloadInfoTransform.beginFileCopy();
              }
              (0, DataSplitter_1.copyData)(operation, firstStream, oldFileFd, reject, () => w(index));
              return;
            }
            const range = `bytes=${operation.start}-${operation.end - 1}`;
            requestOptions.headers.range = range;
            (_b2 = (_a2 = this.logger) === null || _a2 === void 0 ? void 0 : _a2.debug) === null || _b2 === void 0 ? void 0 : _b2.call(_a2, `download range: ${range}`);
            if (downloadInfoTransform) {
              downloadInfoTransform.beginRangeDownload();
            }
            const request = this.httpExecutor.createRequest(requestOptions, (response) => {
              response.on("error", reject);
              response.on("aborted", () => {
                reject(new Error("response has been aborted by the server"));
              });
              if (response.statusCode >= 400) {
                reject((0, builder_util_runtime_1.createHttpError)(response));
              }
              response.pipe(firstStream, {
                end: false
              });
              response.once("end", () => {
                if (downloadInfoTransform) {
                  downloadInfoTransform.endRangeDownload();
                }
                if (++downloadOperationCount === 100) {
                  downloadOperationCount = 0;
                  setTimeout(() => w(index), 1e3);
                } else {
                  w(index);
                }
              });
            });
            request.on("redirect", (statusCode, method, redirectUrl) => {
              this.logger.info(`Redirect to ${removeQuery(redirectUrl)}`);
              actualUrl = redirectUrl;
              (0, builder_util_runtime_1.configureRequestUrl)(new url_1.URL(actualUrl), requestOptions);
              request.followRedirect();
            });
            this.httpExecutor.addErrorAndTimeoutHandlers(request, reject);
            request.end();
          };
          w(0);
        });
      }
      async readRemoteBytes(start, endInclusive) {
        const buffer = Buffer.allocUnsafe(endInclusive + 1 - start);
        const requestOptions = this.createRequestOptions();
        requestOptions.headers.range = `bytes=${start}-${endInclusive}`;
        let position = 0;
        await this.request(requestOptions, (chunk) => {
          chunk.copy(buffer, position);
          position += chunk.length;
        });
        if (position !== buffer.length) {
          throw new Error(`Received data length ${position} is not equal to expected ${buffer.length}`);
        }
        return buffer;
      }
      request(requestOptions, dataHandler) {
        return new Promise((resolve2, reject) => {
          const request = this.httpExecutor.createRequest(requestOptions, (response) => {
            if (!(0, multipleRangeDownloader_1.checkIsRangesSupported)(response, reject)) {
              return;
            }
            response.on("error", reject);
            response.on("aborted", () => {
              reject(new Error("response has been aborted by the server"));
            });
            response.on("data", dataHandler);
            response.on("end", () => resolve2());
          });
          this.httpExecutor.addErrorAndTimeoutHandlers(request, reject);
          request.end();
        });
      }
    };
    exports2.DifferentialDownloader = DifferentialDownloader;
    function formatBytes(value, symbol = " KB") {
      return new Intl.NumberFormat("en").format((value / 1024).toFixed(2)) + symbol;
    }
    function removeQuery(url) {
      const index = url.indexOf("?");
      return index < 0 ? url : url.substring(0, index);
    }
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/differentialDownloader/GenericDifferentialDownloader.js
var require_GenericDifferentialDownloader = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/differentialDownloader/GenericDifferentialDownloader.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.GenericDifferentialDownloader = void 0;
    var DifferentialDownloader_1 = require_DifferentialDownloader();
    var GenericDifferentialDownloader = class extends DifferentialDownloader_1.DifferentialDownloader {
      download(oldBlockMap, newBlockMap) {
        return this.doDownload(oldBlockMap, newBlockMap);
      }
    };
    exports2.GenericDifferentialDownloader = GenericDifferentialDownloader;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/types.js
var require_types = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.UpdaterSignal = exports2.UPDATE_DOWNLOADED = exports2.DOWNLOAD_PROGRESS = exports2.CancellationToken = void 0;
    exports2.addHandler = addHandler;
    var builder_util_runtime_1 = require_out();
    Object.defineProperty(exports2, "CancellationToken", { enumerable: true, get: function() {
      return builder_util_runtime_1.CancellationToken;
    } });
    exports2.DOWNLOAD_PROGRESS = "download-progress";
    exports2.UPDATE_DOWNLOADED = "update-downloaded";
    var UpdaterSignal = class {
      constructor(emitter) {
        this.emitter = emitter;
      }
      /**
       * Emitted when an authenticating proxy is [asking for user credentials](https://github.com/electron/electron/blob/master/docs/api/client-request.md#event-login).
       */
      login(handler) {
        addHandler(this.emitter, "login", handler);
      }
      progress(handler) {
        addHandler(this.emitter, exports2.DOWNLOAD_PROGRESS, handler);
      }
      updateDownloaded(handler) {
        addHandler(this.emitter, exports2.UPDATE_DOWNLOADED, handler);
      }
      updateCancelled(handler) {
        addHandler(this.emitter, "update-cancelled", handler);
      }
    };
    exports2.UpdaterSignal = UpdaterSignal;
    var isLogEvent = false;
    function addHandler(emitter, event, handler) {
      if (isLogEvent) {
        emitter.on(event, (...args2) => {
          console.log("%s %s", event, args2);
          handler(...args2);
        });
      } else {
        emitter.on(event, handler);
      }
    }
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/AppUpdater.js
var require_AppUpdater = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/AppUpdater.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.NoOpLogger = exports2.AppUpdater = void 0;
    var builder_util_runtime_1 = require_out();
    var crypto_1 = require("crypto");
    var os_1 = require("os");
    var events_1 = require("events");
    var fs_extra_1 = require_lib();
    var js_yaml_1 = require_js_yaml();
    var lazy_val_1 = require_main();
    var path = require("path");
    var semver_1 = require_semver2();
    var DownloadedUpdateHelper_1 = require_DownloadedUpdateHelper();
    var ElectronAppAdapter_1 = require_ElectronAppAdapter();
    var electronHttpExecutor_1 = require_electronHttpExecutor();
    var GenericProvider_1 = require_GenericProvider();
    var providerFactory_1 = require_providerFactory();
    var zlib_1 = require("zlib");
    var GenericDifferentialDownloader_1 = require_GenericDifferentialDownloader();
    var types_1 = require_types();
    var AppUpdater = class _AppUpdater extends events_1.EventEmitter {
      /**
       * Get the update channel. Doesn't return `channel` from the update configuration, only if was previously set.
       */
      get channel() {
        return this._channel;
      }
      /**
       * Set the update channel. Overrides `channel` in the update configuration.
       *
       * `allowDowngrade` will be automatically set to `true`. If this behavior is not suitable for you, simple set `allowDowngrade` explicitly after.
       */
      set channel(value) {
        if (this._channel != null) {
          if (typeof value !== "string") {
            throw (0, builder_util_runtime_1.newError)(`Channel must be a string, but got: ${value}`, "ERR_UPDATER_INVALID_CHANNEL");
          } else if (value.length === 0) {
            throw (0, builder_util_runtime_1.newError)(`Channel must be not an empty string`, "ERR_UPDATER_INVALID_CHANNEL");
          }
        }
        this._channel = value;
        this.allowDowngrade = true;
      }
      /**
       *  Shortcut for explicitly adding auth tokens to request headers
       */
      addAuthHeader(token) {
        this.requestHeaders = Object.assign({}, this.requestHeaders, {
          authorization: token
        });
      }
      // noinspection JSMethodCanBeStatic,JSUnusedGlobalSymbols
      get netSession() {
        return (0, electronHttpExecutor_1.getNetSession)();
      }
      /**
       * The logger. You can pass [electron-log](https://github.com/megahertz/electron-log), [winston](https://github.com/winstonjs/winston) or another logger with the following interface: `{ info(), warn(), error() }`.
       * Set it to `null` if you would like to disable a logging feature.
       */
      get logger() {
        return this._logger;
      }
      set logger(value) {
        this._logger = value == null ? new NoOpLogger() : value;
      }
      // noinspection JSUnusedGlobalSymbols
      /**
       * test only
       * @private
       */
      set updateConfigPath(value) {
        this.clientPromise = null;
        this._appUpdateConfigPath = value;
        this.configOnDisk = new lazy_val_1.Lazy(() => this.loadUpdateConfig());
      }
      /**
       * Allows developer to override default logic for determining if an update is supported.
       * The default logic compares the `UpdateInfo` minimum system version against the `os.release()` with `semver` package
       */
      get isUpdateSupported() {
        return this._isUpdateSupported;
      }
      set isUpdateSupported(value) {
        if (value) {
          this._isUpdateSupported = value;
        }
      }
      /**
       * Allows developer to override default logic for determining if the user is below the rollout threshold.
       * The default logic compares the staging percentage with numerical representation of user ID.
       * An override can define custom logic, or bypass it if needed.
       */
      get isUserWithinRollout() {
        return this._isUserWithinRollout;
      }
      set isUserWithinRollout(value) {
        if (value) {
          this._isUserWithinRollout = value;
        }
      }
      constructor(options2, app25) {
        super();
        this.autoDownload = true;
        this.autoInstallOnAppQuit = true;
        this.autoRunAppAfterInstall = true;
        this.allowPrerelease = false;
        this.fullChangelog = false;
        this.allowDowngrade = false;
        this.disableWebInstaller = false;
        this.disableDifferentialDownload = false;
        this.forceDevUpdateConfig = false;
        this.previousBlockmapBaseUrlOverride = null;
        this._channel = null;
        this.downloadedUpdateHelper = null;
        this.requestHeaders = null;
        this._logger = console;
        this.signals = new types_1.UpdaterSignal(this);
        this._appUpdateConfigPath = null;
        this._isUpdateSupported = (updateInfo) => this.checkIfUpdateSupported(updateInfo);
        this._isUserWithinRollout = (updateInfo) => this.isStagingMatch(updateInfo);
        this.clientPromise = null;
        this.stagingUserIdPromise = new lazy_val_1.Lazy(() => this.getOrCreateStagingUserId());
        this.configOnDisk = new lazy_val_1.Lazy(() => this.loadUpdateConfig());
        this.checkForUpdatesPromise = null;
        this.downloadPromise = null;
        this.updateInfoAndProvider = null;
        this._testOnlyOptions = null;
        this.on("error", (error) => {
          this._logger.error(`Error: ${error.stack || error.message}`);
        });
        if (app25 == null) {
          this.app = new ElectronAppAdapter_1.ElectronAppAdapter();
          this.httpExecutor = new electronHttpExecutor_1.ElectronHttpExecutor((authInfo, callback) => this.emit("login", authInfo, callback));
        } else {
          this.app = app25;
          this.httpExecutor = null;
        }
        const currentVersionString = this.app.version;
        const currentVersion = (0, semver_1.parse)(currentVersionString);
        if (currentVersion == null) {
          throw (0, builder_util_runtime_1.newError)(`App version is not a valid semver version: "${currentVersionString}"`, "ERR_UPDATER_INVALID_VERSION");
        }
        this.currentVersion = currentVersion;
        this.allowPrerelease = hasPrereleaseComponents(currentVersion);
        if (options2 != null) {
          this.setFeedURL(options2);
          if (typeof options2 !== "string" && options2.requestHeaders) {
            this.requestHeaders = options2.requestHeaders;
          }
        }
      }
      //noinspection JSMethodCanBeStatic,JSUnusedGlobalSymbols
      getFeedURL() {
        return "Deprecated. Do not use it.";
      }
      /**
       * Configure update provider. If value is `string`, [GenericServerOptions](./publish.md#genericserveroptions) will be set with value as `url`.
       * @param options If you want to override configuration in the `app-update.yml`.
       */
      setFeedURL(options2) {
        const runtimeOptions = this.createProviderRuntimeOptions();
        let provider;
        if (typeof options2 === "string") {
          provider = new GenericProvider_1.GenericProvider({ provider: "generic", url: options2 }, this, {
            ...runtimeOptions,
            isUseMultipleRangeRequest: (0, providerFactory_1.isUrlProbablySupportMultiRangeRequests)(options2)
          });
        } else {
          provider = (0, providerFactory_1.createClient)(options2, this, runtimeOptions);
        }
        this.clientPromise = Promise.resolve(provider);
      }
      /**
       * Asks the server whether there is an update.
       * @returns null if the updater is disabled, otherwise info about the latest version
       */
      checkForUpdates() {
        if (!this.isUpdaterActive()) {
          return Promise.resolve(null);
        }
        let checkForUpdatesPromise = this.checkForUpdatesPromise;
        if (checkForUpdatesPromise != null) {
          this._logger.info("Checking for update (already in progress)");
          return checkForUpdatesPromise;
        }
        const nullizePromise = () => this.checkForUpdatesPromise = null;
        this._logger.info("Checking for update");
        checkForUpdatesPromise = this.doCheckForUpdates().then((it) => {
          nullizePromise();
          return it;
        }).catch((e) => {
          nullizePromise();
          this.emit("error", e, `Cannot check for updates: ${(e.stack || e).toString()}`);
          throw e;
        });
        this.checkForUpdatesPromise = checkForUpdatesPromise;
        return checkForUpdatesPromise;
      }
      isUpdaterActive() {
        const isEnabled = this.app.isPackaged || this.forceDevUpdateConfig;
        if (!isEnabled) {
          this._logger.info("Skip checkForUpdates because application is not packed and dev update config is not forced");
          return false;
        }
        return true;
      }
      // noinspection JSUnusedGlobalSymbols
      checkForUpdatesAndNotify(downloadNotification) {
        return this.checkForUpdates().then((it) => {
          if (!(it === null || it === void 0 ? void 0 : it.downloadPromise)) {
            if (this._logger.debug != null) {
              this._logger.debug("checkForUpdatesAndNotify called, downloadPromise is null");
            }
            return it;
          }
          void it.downloadPromise.then(() => {
            const notificationContent = _AppUpdater.formatDownloadNotification(it.updateInfo.version, this.app.name, downloadNotification);
            new (require("electron")).Notification(notificationContent).show();
          });
          return it;
        });
      }
      static formatDownloadNotification(version, appName, downloadNotification) {
        if (downloadNotification == null) {
          downloadNotification = {
            title: "A new update is ready to install",
            body: `{appName} version {version} has been downloaded and will be automatically installed on exit`
          };
        }
        downloadNotification = {
          title: downloadNotification.title.replace("{appName}", appName).replace("{version}", version),
          body: downloadNotification.body.replace("{appName}", appName).replace("{version}", version)
        };
        return downloadNotification;
      }
      async isStagingMatch(updateInfo) {
        const rawStagingPercentage = updateInfo.stagingPercentage;
        let stagingPercentage = rawStagingPercentage;
        if (stagingPercentage == null) {
          return true;
        }
        stagingPercentage = parseInt(stagingPercentage, 10);
        if (isNaN(stagingPercentage)) {
          this._logger.warn(`Staging percentage is NaN: ${rawStagingPercentage}`);
          return true;
        }
        stagingPercentage = stagingPercentage / 100;
        const stagingUserId = await this.stagingUserIdPromise.value;
        const val = builder_util_runtime_1.UUID.parse(stagingUserId).readUInt32BE(12);
        const percentage = val / 4294967295;
        this._logger.info(`Staging percentage: ${stagingPercentage}, percentage: ${percentage}, user id: ${stagingUserId}`);
        return percentage < stagingPercentage;
      }
      computeFinalHeaders(headers) {
        if (this.requestHeaders != null) {
          Object.assign(headers, this.requestHeaders);
        }
        return headers;
      }
      async isUpdateAvailable(updateInfo) {
        const latestVersion = (0, semver_1.parse)(updateInfo.version);
        if (latestVersion == null) {
          throw (0, builder_util_runtime_1.newError)(`This file could not be downloaded, or the latest version (from update server) does not have a valid semver version: "${updateInfo.version}"`, "ERR_UPDATER_INVALID_VERSION");
        }
        const currentVersion = this.currentVersion;
        if ((0, semver_1.eq)(latestVersion, currentVersion)) {
          return false;
        }
        if (!await Promise.resolve(this.isUpdateSupported(updateInfo))) {
          return false;
        }
        const isUserWithinRollout = await Promise.resolve(this.isUserWithinRollout(updateInfo));
        if (!isUserWithinRollout) {
          return false;
        }
        const isLatestVersionNewer = (0, semver_1.gt)(latestVersion, currentVersion);
        const isLatestVersionOlder = (0, semver_1.lt)(latestVersion, currentVersion);
        if (isLatestVersionNewer) {
          return true;
        }
        return this.allowDowngrade && isLatestVersionOlder;
      }
      checkIfUpdateSupported(updateInfo) {
        const minimumSystemVersion = updateInfo === null || updateInfo === void 0 ? void 0 : updateInfo.minimumSystemVersion;
        const currentOSVersion = (0, os_1.release)();
        if (minimumSystemVersion) {
          try {
            if ((0, semver_1.lt)(currentOSVersion, minimumSystemVersion)) {
              this._logger.info(`Current OS version ${currentOSVersion} is less than the minimum OS version required ${minimumSystemVersion} for version ${currentOSVersion}`);
              return false;
            }
          } catch (e) {
            this._logger.warn(`Failed to compare current OS version(${currentOSVersion}) with minimum OS version(${minimumSystemVersion}): ${(e.message || e).toString()}`);
          }
        }
        return true;
      }
      async getUpdateInfoAndProvider() {
        await this.app.whenReady();
        if (this.clientPromise == null) {
          this.clientPromise = this.configOnDisk.value.then((it) => (0, providerFactory_1.createClient)(it, this, this.createProviderRuntimeOptions()));
        }
        const client = await this.clientPromise;
        const stagingUserId = await this.stagingUserIdPromise.value;
        client.setRequestHeaders(this.computeFinalHeaders({ "x-user-staging-id": stagingUserId }));
        return {
          info: await client.getLatestVersion(),
          provider: client
        };
      }
      createProviderRuntimeOptions() {
        return {
          isUseMultipleRangeRequest: true,
          platform: this._testOnlyOptions == null ? process.platform : this._testOnlyOptions.platform,
          executor: this.httpExecutor
        };
      }
      async doCheckForUpdates() {
        this.emit("checking-for-update");
        const result = await this.getUpdateInfoAndProvider();
        const updateInfo = result.info;
        if (!await this.isUpdateAvailable(updateInfo)) {
          this._logger.info(`Update for version ${this.currentVersion.format()} is not available (latest version: ${updateInfo.version}, downgrade is ${this.allowDowngrade ? "allowed" : "disallowed"}).`);
          this.emit("update-not-available", updateInfo);
          return {
            isUpdateAvailable: false,
            versionInfo: updateInfo,
            updateInfo
          };
        }
        this.updateInfoAndProvider = result;
        this.onUpdateAvailable(updateInfo);
        const cancellationToken = new builder_util_runtime_1.CancellationToken();
        return {
          isUpdateAvailable: true,
          versionInfo: updateInfo,
          updateInfo,
          cancellationToken,
          downloadPromise: this.autoDownload ? this.downloadUpdate(cancellationToken) : null
        };
      }
      onUpdateAvailable(updateInfo) {
        this._logger.info(`Found version ${updateInfo.version} (url: ${(0, builder_util_runtime_1.asArray)(updateInfo.files).map((it) => it.url).join(", ")})`);
        this.emit("update-available", updateInfo);
      }
      /**
       * Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.
       * @returns {Promise<Array<string>>} Paths to downloaded files.
       */
      downloadUpdate(cancellationToken = new builder_util_runtime_1.CancellationToken()) {
        const updateInfoAndProvider = this.updateInfoAndProvider;
        if (updateInfoAndProvider == null) {
          const error = new Error("Please check update first");
          this.dispatchError(error);
          return Promise.reject(error);
        }
        if (this.downloadPromise != null) {
          this._logger.info("Downloading update (already in progress)");
          return this.downloadPromise;
        }
        this._logger.info(`Downloading update from ${(0, builder_util_runtime_1.asArray)(updateInfoAndProvider.info.files).map((it) => it.url).join(", ")}`);
        const errorHandler = (e) => {
          if (!(e instanceof builder_util_runtime_1.CancellationError)) {
            try {
              this.dispatchError(e);
            } catch (nestedError) {
              this._logger.warn(`Cannot dispatch error event: ${nestedError.stack || nestedError}`);
            }
          }
          return e;
        };
        this.downloadPromise = this.doDownloadUpdate({
          updateInfoAndProvider,
          requestHeaders: this.computeRequestHeaders(updateInfoAndProvider.provider),
          cancellationToken,
          disableWebInstaller: this.disableWebInstaller,
          disableDifferentialDownload: this.disableDifferentialDownload
        }).catch((e) => {
          throw errorHandler(e);
        }).finally(() => {
          this.downloadPromise = null;
        });
        return this.downloadPromise;
      }
      dispatchError(e) {
        this.emit("error", e, (e.stack || e).toString());
      }
      dispatchUpdateDownloaded(event) {
        this.emit(types_1.UPDATE_DOWNLOADED, event);
      }
      async loadUpdateConfig() {
        if (this._appUpdateConfigPath == null) {
          this._appUpdateConfigPath = this.app.appUpdateConfigPath;
        }
        return (0, js_yaml_1.load)(await (0, fs_extra_1.readFile)(this._appUpdateConfigPath, "utf-8"));
      }
      computeRequestHeaders(provider) {
        const fileExtraDownloadHeaders = provider.fileExtraDownloadHeaders;
        if (fileExtraDownloadHeaders != null) {
          const requestHeaders = this.requestHeaders;
          return requestHeaders == null ? fileExtraDownloadHeaders : {
            ...fileExtraDownloadHeaders,
            ...requestHeaders
          };
        }
        return this.computeFinalHeaders({ accept: "*/*" });
      }
      async getOrCreateStagingUserId() {
        const file = path.join(this.app.userDataPath, ".updaterId");
        try {
          const id2 = await (0, fs_extra_1.readFile)(file, "utf-8");
          if (builder_util_runtime_1.UUID.check(id2)) {
            return id2;
          } else {
            this._logger.warn(`Staging user id file exists, but content was invalid: ${id2}`);
          }
        } catch (e) {
          if (e.code !== "ENOENT") {
            this._logger.warn(`Couldn't read staging user ID, creating a blank one: ${e}`);
          }
        }
        const id = builder_util_runtime_1.UUID.v5((0, crypto_1.randomBytes)(4096), builder_util_runtime_1.UUID.OID);
        this._logger.info(`Generated new staging user ID: ${id}`);
        try {
          await (0, fs_extra_1.outputFile)(file, id);
        } catch (e) {
          this._logger.warn(`Couldn't write out staging user ID: ${e}`);
        }
        return id;
      }
      /** @internal */
      get isAddNoCacheQuery() {
        const headers = this.requestHeaders;
        if (headers == null) {
          return true;
        }
        for (const headerName of Object.keys(headers)) {
          const s = headerName.toLowerCase();
          if (s === "authorization" || s === "private-token") {
            return false;
          }
        }
        return true;
      }
      async getOrCreateDownloadHelper() {
        let result = this.downloadedUpdateHelper;
        if (result == null) {
          const dirName = (await this.configOnDisk.value).updaterCacheDirName;
          const logger = this._logger;
          if (dirName == null) {
            logger.error("updaterCacheDirName is not specified in app-update.yml Was app build using at least electron-builder 20.34.0?");
          }
          const cacheDir = path.join(this.app.baseCachePath, dirName || this.app.name);
          if (logger.debug != null) {
            logger.debug(`updater cache dir: ${cacheDir}`);
          }
          result = new DownloadedUpdateHelper_1.DownloadedUpdateHelper(cacheDir);
          this.downloadedUpdateHelper = result;
        }
        return result;
      }
      async executeDownload(taskOptions) {
        const fileInfo = taskOptions.fileInfo;
        const downloadOptions = {
          headers: taskOptions.downloadUpdateOptions.requestHeaders,
          cancellationToken: taskOptions.downloadUpdateOptions.cancellationToken,
          sha2: fileInfo.info.sha2,
          sha512: fileInfo.info.sha512
        };
        if (this.listenerCount(types_1.DOWNLOAD_PROGRESS) > 0) {
          downloadOptions.onProgress = (it) => this.emit(types_1.DOWNLOAD_PROGRESS, it);
        }
        const updateInfo = taskOptions.downloadUpdateOptions.updateInfoAndProvider.info;
        const version = updateInfo.version;
        const packageInfo = fileInfo.packageInfo;
        function getCacheUpdateFileName() {
          const urlPath = decodeURIComponent(taskOptions.fileInfo.url.pathname);
          if (urlPath.toLowerCase().endsWith(`.${taskOptions.fileExtension.toLowerCase()}`)) {
            return path.basename(urlPath);
          } else {
            return taskOptions.fileInfo.info.url;
          }
        }
        const downloadedUpdateHelper = await this.getOrCreateDownloadHelper();
        const cacheDir = downloadedUpdateHelper.cacheDirForPendingUpdate;
        await (0, fs_extra_1.mkdir)(cacheDir, { recursive: true });
        const updateFileName = getCacheUpdateFileName();
        let updateFile = path.join(cacheDir, updateFileName);
        const packageFile = packageInfo == null ? null : path.join(cacheDir, `package-${version}${path.extname(packageInfo.path) || ".7z"}`);
        const done = async (isSaveCache) => {
          await downloadedUpdateHelper.setDownloadedFile(updateFile, packageFile, updateInfo, fileInfo, updateFileName, isSaveCache);
          await taskOptions.done({
            ...updateInfo,
            downloadedFile: updateFile
          });
          const currentBlockMapFile = path.join(cacheDir, "current.blockmap");
          if (await (0, fs_extra_1.pathExists)(currentBlockMapFile)) {
            await (0, fs_extra_1.copyFile)(currentBlockMapFile, path.join(downloadedUpdateHelper.cacheDir, "current.blockmap"));
          }
          return packageFile == null ? [updateFile] : [updateFile, packageFile];
        };
        const log = this._logger;
        const cachedUpdateFile = await downloadedUpdateHelper.validateDownloadedPath(updateFile, updateInfo, fileInfo, log);
        if (cachedUpdateFile != null) {
          updateFile = cachedUpdateFile;
          return await done(false);
        }
        const removeFileIfAny = async () => {
          await downloadedUpdateHelper.clear().catch(() => {
          });
          return await (0, fs_extra_1.unlink)(updateFile).catch(() => {
          });
        };
        const tempUpdateFile = await (0, DownloadedUpdateHelper_1.createTempUpdateFile)(`temp-${updateFileName}`, cacheDir, log);
        try {
          await taskOptions.task(tempUpdateFile, downloadOptions, packageFile, removeFileIfAny);
          await (0, builder_util_runtime_1.retry)(() => (0, fs_extra_1.rename)(tempUpdateFile, updateFile), {
            retries: 60,
            interval: 500,
            shouldRetry: (error) => {
              if (error instanceof Error && /^EBUSY:/.test(error.message)) {
                return true;
              }
              log.warn(`Cannot rename temp file to final file: ${error.message || error.stack}`);
              return false;
            }
          });
        } catch (e) {
          await removeFileIfAny();
          if (e instanceof builder_util_runtime_1.CancellationError) {
            log.info("cancelled");
            this.emit("update-cancelled", updateInfo);
          }
          throw e;
        }
        log.info(`New version ${version} has been downloaded to ${updateFile}`);
        return await done(true);
      }
      async differentialDownloadInstaller(fileInfo, downloadUpdateOptions, installerPath, provider, oldInstallerFileName) {
        try {
          if (this._testOnlyOptions != null && !this._testOnlyOptions.isUseDifferentialDownload) {
            return true;
          }
          const provider2 = downloadUpdateOptions.updateInfoAndProvider.provider;
          const blockmapFileUrls = await provider2.getBlockMapFiles(fileInfo.url, this.app.version, downloadUpdateOptions.updateInfoAndProvider.info.version, this.previousBlockmapBaseUrlOverride);
          this._logger.info(`Download block maps (old: "${blockmapFileUrls[0]}", new: ${blockmapFileUrls[1]})`);
          const downloadBlockMap = async (url) => {
            const data = await this.httpExecutor.downloadToBuffer(url, {
              headers: downloadUpdateOptions.requestHeaders,
              cancellationToken: downloadUpdateOptions.cancellationToken
            });
            if (data == null || data.length === 0) {
              throw new Error(`Blockmap "${url.href}" is empty`);
            }
            try {
              return JSON.parse((0, zlib_1.gunzipSync)(data).toString());
            } catch (e) {
              throw new Error(`Cannot parse blockmap "${url.href}", error: ${e}`);
            }
          };
          const downloadOptions = {
            newUrl: fileInfo.url,
            oldFile: path.join(this.downloadedUpdateHelper.cacheDir, oldInstallerFileName),
            logger: this._logger,
            newFile: installerPath,
            isUseMultipleRangeRequest: provider2.isUseMultipleRangeRequest,
            requestHeaders: downloadUpdateOptions.requestHeaders,
            cancellationToken: downloadUpdateOptions.cancellationToken
          };
          if (this.listenerCount(types_1.DOWNLOAD_PROGRESS) > 0) {
            downloadOptions.onProgress = (it) => this.emit(types_1.DOWNLOAD_PROGRESS, it);
          }
          const saveBlockMapToCacheDir = async (blockMapData, cacheDir) => {
            const blockMapFile = path.join(cacheDir, "current.blockmap");
            await (0, fs_extra_1.outputFile)(blockMapFile, (0, zlib_1.gzipSync)(JSON.stringify(blockMapData)));
          };
          const getBlockMapFromCacheDir = async (cacheDir) => {
            const blockMapFile = path.join(cacheDir, "current.blockmap");
            try {
              if (await (0, fs_extra_1.pathExists)(blockMapFile)) {
                return JSON.parse((0, zlib_1.gunzipSync)(await (0, fs_extra_1.readFile)(blockMapFile)).toString());
              }
            } catch (e) {
              this._logger.warn(`Cannot parse blockmap "${blockMapFile}", error: ${e}`);
            }
            return null;
          };
          const newBlockMapData = await downloadBlockMap(blockmapFileUrls[1]);
          await saveBlockMapToCacheDir(newBlockMapData, this.downloadedUpdateHelper.cacheDirForPendingUpdate);
          let oldBlockMapData = await getBlockMapFromCacheDir(this.downloadedUpdateHelper.cacheDir);
          if (oldBlockMapData == null) {
            oldBlockMapData = await downloadBlockMap(blockmapFileUrls[0]);
          }
          await new GenericDifferentialDownloader_1.GenericDifferentialDownloader(fileInfo.info, this.httpExecutor, downloadOptions).download(oldBlockMapData, newBlockMapData);
          return false;
        } catch (e) {
          this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`);
          if (this._testOnlyOptions != null) {
            throw e;
          }
          return true;
        }
      }
    };
    exports2.AppUpdater = AppUpdater;
    function hasPrereleaseComponents(version) {
      const versionPrereleaseComponent = (0, semver_1.prerelease)(version);
      return versionPrereleaseComponent != null && versionPrereleaseComponent.length > 0;
    }
    var NoOpLogger = class {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      info(message) {
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      warn(message) {
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      error(message) {
      }
    };
    exports2.NoOpLogger = NoOpLogger;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/BaseUpdater.js
var require_BaseUpdater = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/BaseUpdater.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.BaseUpdater = void 0;
    var child_process_1 = require("child_process");
    var AppUpdater_1 = require_AppUpdater();
    var BaseUpdater = class extends AppUpdater_1.AppUpdater {
      constructor(options2, app25) {
        super(options2, app25);
        this.quitAndInstallCalled = false;
        this.quitHandlerAdded = false;
      }
      quitAndInstall(isSilent = false, isForceRunAfter = false) {
        this._logger.info(`Install on explicit quitAndInstall`);
        const isInstalled = this.install(isSilent, isSilent ? isForceRunAfter : this.autoRunAppAfterInstall);
        if (isInstalled) {
          setImmediate(() => {
            require("electron").autoUpdater.emit("before-quit-for-update");
            this.app.quit();
          });
        } else {
          this.quitAndInstallCalled = false;
        }
      }
      executeDownload(taskOptions) {
        return super.executeDownload({
          ...taskOptions,
          done: (event) => {
            this.dispatchUpdateDownloaded(event);
            this.addQuitHandler();
            return Promise.resolve();
          }
        });
      }
      get installerPath() {
        return this.downloadedUpdateHelper == null ? null : this.downloadedUpdateHelper.file;
      }
      // must be sync (because quit even handler is not async)
      install(isSilent = false, isForceRunAfter = false) {
        if (this.quitAndInstallCalled) {
          this._logger.warn("install call ignored: quitAndInstallCalled is set to true");
          return false;
        }
        const downloadedUpdateHelper = this.downloadedUpdateHelper;
        const installerPath = this.installerPath;
        const downloadedFileInfo = downloadedUpdateHelper == null ? null : downloadedUpdateHelper.downloadedFileInfo;
        if (installerPath == null || downloadedFileInfo == null) {
          this.dispatchError(new Error("No update filepath provided, can't quit and install"));
          return false;
        }
        this.quitAndInstallCalled = true;
        try {
          this._logger.info(`Install: isSilent: ${isSilent}, isForceRunAfter: ${isForceRunAfter}`);
          return this.doInstall({
            isSilent,
            isForceRunAfter,
            isAdminRightsRequired: downloadedFileInfo.isAdminRightsRequired
          });
        } catch (e) {
          this.dispatchError(e);
          return false;
        }
      }
      addQuitHandler() {
        if (this.quitHandlerAdded || !this.autoInstallOnAppQuit) {
          return;
        }
        this.quitHandlerAdded = true;
        this.app.onQuit((exitCode) => {
          if (this.quitAndInstallCalled) {
            this._logger.info("Update installer has already been triggered. Quitting application.");
            return;
          }
          if (!this.autoInstallOnAppQuit) {
            this._logger.info("Update will not be installed on quit because autoInstallOnAppQuit is set to false.");
            return;
          }
          if (exitCode !== 0) {
            this._logger.info(`Update will be not installed on quit because application is quitting with exit code ${exitCode}`);
            return;
          }
          this._logger.info("Auto install update on quit");
          this.install(true, false);
        });
      }
      spawnSyncLog(cmd, args2 = [], env = {}) {
        this._logger.info(`Executing: ${cmd} with args: ${args2}`);
        const response = (0, child_process_1.spawnSync)(cmd, args2, {
          env: { ...process.env, ...env },
          encoding: "utf-8",
          shell: true
        });
        const { error, status, stdout, stderr } = response;
        if (error != null) {
          this._logger.error(stderr);
          throw error;
        } else if (status != null && status !== 0) {
          this._logger.error(stderr);
          throw new Error(`Command ${cmd} exited with code ${status}`);
        }
        return stdout.trim();
      }
      /**
       * This handles both node 8 and node 10 way of emitting error when spawning a process
       *   - node 8: Throws the error
       *   - node 10: Emit the error(Need to listen with on)
       */
      // https://github.com/electron-userland/electron-builder/issues/1129
      // Node 8 sends errors: https://nodejs.org/dist/latest-v8.x/docs/api/errors.html#errors_common_system_errors
      async spawnLog(cmd, args2 = [], env = void 0, stdio = "ignore") {
        this._logger.info(`Executing: ${cmd} with args: ${args2}`);
        return new Promise((resolve2, reject) => {
          try {
            const params = { stdio, env, detached: true };
            const p = (0, child_process_1.spawn)(cmd, args2, params);
            p.on("error", (error) => {
              reject(error);
            });
            p.unref();
            if (p.pid !== void 0) {
              resolve2(true);
            }
          } catch (error) {
            reject(error);
          }
        });
      }
    };
    exports2.BaseUpdater = BaseUpdater;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader.js
var require_FileWithEmbeddedBlockMapDifferentialDownloader = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.FileWithEmbeddedBlockMapDifferentialDownloader = void 0;
    var fs_extra_1 = require_lib();
    var DifferentialDownloader_1 = require_DifferentialDownloader();
    var zlib_1 = require("zlib");
    var FileWithEmbeddedBlockMapDifferentialDownloader = class extends DifferentialDownloader_1.DifferentialDownloader {
      async download() {
        const packageInfo = this.blockAwareFileInfo;
        const fileSize = packageInfo.size;
        const offset = fileSize - (packageInfo.blockMapSize + 4);
        this.fileMetadataBuffer = await this.readRemoteBytes(offset, fileSize - 1);
        const newBlockMap = readBlockMap(this.fileMetadataBuffer.slice(0, this.fileMetadataBuffer.length - 4));
        await this.doDownload(await readEmbeddedBlockMapData(this.options.oldFile), newBlockMap);
      }
    };
    exports2.FileWithEmbeddedBlockMapDifferentialDownloader = FileWithEmbeddedBlockMapDifferentialDownloader;
    function readBlockMap(data) {
      return JSON.parse((0, zlib_1.inflateRawSync)(data).toString());
    }
    async function readEmbeddedBlockMapData(file) {
      const fd2 = await (0, fs_extra_1.open)(file, "r");
      try {
        const fileSize = (await (0, fs_extra_1.fstat)(fd2)).size;
        const sizeBuffer = Buffer.allocUnsafe(4);
        await (0, fs_extra_1.read)(fd2, sizeBuffer, 0, sizeBuffer.length, fileSize - sizeBuffer.length);
        const dataBuffer = Buffer.allocUnsafe(sizeBuffer.readUInt32BE(0));
        await (0, fs_extra_1.read)(fd2, dataBuffer, 0, dataBuffer.length, fileSize - sizeBuffer.length - dataBuffer.length);
        await (0, fs_extra_1.close)(fd2);
        return readBlockMap(dataBuffer);
      } catch (e) {
        await (0, fs_extra_1.close)(fd2);
        throw e;
      }
    }
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/AppImageUpdater.js
var require_AppImageUpdater = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/AppImageUpdater.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.AppImageUpdater = void 0;
    var builder_util_runtime_1 = require_out();
    var child_process_1 = require("child_process");
    var fs_extra_1 = require_lib();
    var fs_1 = require("fs");
    var path = require("path");
    var BaseUpdater_1 = require_BaseUpdater();
    var FileWithEmbeddedBlockMapDifferentialDownloader_1 = require_FileWithEmbeddedBlockMapDifferentialDownloader();
    var Provider_1 = require_Provider();
    var types_1 = require_types();
    var AppImageUpdater = class extends BaseUpdater_1.BaseUpdater {
      constructor(options2, app25) {
        super(options2, app25);
      }
      isUpdaterActive() {
        if (process.env["APPIMAGE"] == null && !this.forceDevUpdateConfig) {
          if (process.env["SNAP"] == null) {
            this._logger.warn("APPIMAGE env is not defined, current application is not an AppImage");
          } else {
            this._logger.info("SNAP env is defined, updater is disabled");
          }
          return false;
        }
        return super.isUpdaterActive();
      }
      /*** @private */
      doDownloadUpdate(downloadUpdateOptions) {
        const provider = downloadUpdateOptions.updateInfoAndProvider.provider;
        const fileInfo = (0, Provider_1.findFile)(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "AppImage", ["rpm", "deb", "pacman"]);
        return this.executeDownload({
          fileExtension: "AppImage",
          fileInfo,
          downloadUpdateOptions,
          task: async (updateFile, downloadOptions) => {
            const oldFile = process.env["APPIMAGE"];
            if (oldFile == null) {
              throw (0, builder_util_runtime_1.newError)("APPIMAGE env is not defined", "ERR_UPDATER_OLD_FILE_NOT_FOUND");
            }
            if (downloadUpdateOptions.disableDifferentialDownload || await this.downloadDifferential(fileInfo, oldFile, updateFile, provider, downloadUpdateOptions)) {
              await this.httpExecutor.download(fileInfo.url, updateFile, downloadOptions);
            }
            await (0, fs_extra_1.chmod)(updateFile, 493);
          }
        });
      }
      async downloadDifferential(fileInfo, oldFile, updateFile, provider, downloadUpdateOptions) {
        try {
          const downloadOptions = {
            newUrl: fileInfo.url,
            oldFile,
            logger: this._logger,
            newFile: updateFile,
            isUseMultipleRangeRequest: provider.isUseMultipleRangeRequest,
            requestHeaders: downloadUpdateOptions.requestHeaders,
            cancellationToken: downloadUpdateOptions.cancellationToken
          };
          if (this.listenerCount(types_1.DOWNLOAD_PROGRESS) > 0) {
            downloadOptions.onProgress = (it) => this.emit(types_1.DOWNLOAD_PROGRESS, it);
          }
          await new FileWithEmbeddedBlockMapDifferentialDownloader_1.FileWithEmbeddedBlockMapDifferentialDownloader(fileInfo.info, this.httpExecutor, downloadOptions).download();
          return false;
        } catch (e) {
          this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`);
          return process.platform === "linux";
        }
      }
      doInstall(options2) {
        const appImageFile = process.env["APPIMAGE"];
        if (appImageFile == null) {
          throw (0, builder_util_runtime_1.newError)("APPIMAGE env is not defined", "ERR_UPDATER_OLD_FILE_NOT_FOUND");
        }
        (0, fs_1.unlinkSync)(appImageFile);
        let destination;
        const existingBaseName = path.basename(appImageFile);
        const installerPath = this.installerPath;
        if (installerPath == null) {
          this.dispatchError(new Error("No update filepath provided, can't quit and install"));
          return false;
        }
        if (path.basename(installerPath) === existingBaseName || !/\d+\.\d+\.\d+/.test(existingBaseName)) {
          destination = appImageFile;
        } else {
          destination = path.join(path.dirname(appImageFile), path.basename(installerPath));
        }
        (0, child_process_1.execFileSync)("mv", ["-f", installerPath, destination]);
        if (destination !== appImageFile) {
          this.emit("appimage-filename-updated", destination);
        }
        const env = {
          ...process.env,
          APPIMAGE_SILENT_INSTALL: "true"
        };
        if (options2.isForceRunAfter) {
          this.spawnLog(destination, [], env);
        } else {
          env.APPIMAGE_EXIT_AFTER_INSTALL = "true";
          (0, child_process_1.execFileSync)(destination, [], { env });
        }
        return true;
      }
    };
    exports2.AppImageUpdater = AppImageUpdater;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/LinuxUpdater.js
var require_LinuxUpdater = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/LinuxUpdater.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.LinuxUpdater = void 0;
    var BaseUpdater_1 = require_BaseUpdater();
    var LinuxUpdater = class extends BaseUpdater_1.BaseUpdater {
      constructor(options2, app25) {
        super(options2, app25);
      }
      /**
       * Returns true if the current process is running as root.
       */
      isRunningAsRoot() {
        var _a2;
        return ((_a2 = process.getuid) === null || _a2 === void 0 ? void 0 : _a2.call(process)) === 0;
      }
      /**
       * Sanitizies the installer path for using with command line tools.
       */
      get installerPath() {
        var _a2, _b2;
        return (_b2 = (_a2 = super.installerPath) === null || _a2 === void 0 ? void 0 : _a2.replace(/\\/g, "\\\\").replace(/ /g, "\\ ")) !== null && _b2 !== void 0 ? _b2 : null;
      }
      runCommandWithSudoIfNeeded(commandWithArgs) {
        if (this.isRunningAsRoot()) {
          this._logger.info("Running as root, no need to use sudo");
          return this.spawnSyncLog(commandWithArgs[0], commandWithArgs.slice(1));
        }
        const { name } = this.app;
        const installComment = `"${name} would like to update"`;
        const sudo = this.sudoWithArgs(installComment);
        this._logger.info(`Running as non-root user, using sudo to install: ${sudo}`);
        let wrapper = `"`;
        if (/pkexec/i.test(sudo[0]) || sudo[0] === "sudo") {
          wrapper = "";
        }
        return this.spawnSyncLog(sudo[0], [...sudo.length > 1 ? sudo.slice(1) : [], `${wrapper}/bin/bash`, "-c", `'${commandWithArgs.join(" ")}'${wrapper}`]);
      }
      sudoWithArgs(installComment) {
        const sudo = this.determineSudoCommand();
        const command = [sudo];
        if (/kdesudo/i.test(sudo)) {
          command.push("--comment", installComment);
          command.push("-c");
        } else if (/gksudo/i.test(sudo)) {
          command.push("--message", installComment);
        } else if (/pkexec/i.test(sudo)) {
          command.push("--disable-internal-agent");
        }
        return command;
      }
      hasCommand(cmd) {
        try {
          this.spawnSyncLog(`command`, ["-v", cmd]);
          return true;
        } catch {
          return false;
        }
      }
      determineSudoCommand() {
        const sudos = ["gksudo", "kdesudo", "pkexec", "beesu"];
        for (const sudo of sudos) {
          if (this.hasCommand(sudo)) {
            return sudo;
          }
        }
        return "sudo";
      }
      /**
       * Detects the package manager to use based on the available commands.
       * Allows overriding the default behavior by setting the ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER environment variable.
       * If the environment variable is set, it will be used directly. (This is useful for testing each package manager logic path.)
       * Otherwise, it checks for the presence of the specified package manager commands in the order provided.
       * @param pms - An array of package manager commands to check for, in priority order.
       * @returns The detected package manager command or "unknown" if none are found.
       */
      detectPackageManager(pms) {
        var _a2;
        const pmOverride = (_a2 = process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER) === null || _a2 === void 0 ? void 0 : _a2.trim();
        if (pmOverride) {
          return pmOverride;
        }
        for (const pm of pms) {
          if (this.hasCommand(pm)) {
            return pm;
          }
        }
        this._logger.warn(`No package manager found in the list: ${pms.join(", ")}. Defaulting to the first one: ${pms[0]}`);
        return pms[0];
      }
    };
    exports2.LinuxUpdater = LinuxUpdater;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/DebUpdater.js
var require_DebUpdater = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/DebUpdater.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DebUpdater = void 0;
    var Provider_1 = require_Provider();
    var types_1 = require_types();
    var LinuxUpdater_1 = require_LinuxUpdater();
    var DebUpdater = class _DebUpdater extends LinuxUpdater_1.LinuxUpdater {
      constructor(options2, app25) {
        super(options2, app25);
      }
      /*** @private */
      doDownloadUpdate(downloadUpdateOptions) {
        const provider = downloadUpdateOptions.updateInfoAndProvider.provider;
        const fileInfo = (0, Provider_1.findFile)(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "deb", ["AppImage", "rpm", "pacman"]);
        return this.executeDownload({
          fileExtension: "deb",
          fileInfo,
          downloadUpdateOptions,
          task: async (updateFile, downloadOptions) => {
            if (this.listenerCount(types_1.DOWNLOAD_PROGRESS) > 0) {
              downloadOptions.onProgress = (it) => this.emit(types_1.DOWNLOAD_PROGRESS, it);
            }
            await this.httpExecutor.download(fileInfo.url, updateFile, downloadOptions);
          }
        });
      }
      doInstall(options2) {
        const installerPath = this.installerPath;
        if (installerPath == null) {
          this.dispatchError(new Error("No update filepath provided, can't quit and install"));
          return false;
        }
        if (!this.hasCommand("dpkg") && !this.hasCommand("apt")) {
          this.dispatchError(new Error("Neither dpkg nor apt command found. Cannot install .deb package."));
          return false;
        }
        const priorityList = ["dpkg", "apt"];
        const packageManager = this.detectPackageManager(priorityList);
        try {
          _DebUpdater.installWithCommandRunner(packageManager, installerPath, this.runCommandWithSudoIfNeeded.bind(this), this._logger);
        } catch (error) {
          this.dispatchError(error);
          return false;
        }
        if (options2.isForceRunAfter) {
          this.app.relaunch();
        }
        return true;
      }
      static installWithCommandRunner(packageManager, installerPath, commandRunner, logger) {
        var _a2;
        if (packageManager === "dpkg") {
          try {
            commandRunner(["dpkg", "-i", installerPath]);
          } catch (error) {
            logger.warn((_a2 = error.message) !== null && _a2 !== void 0 ? _a2 : error);
            logger.warn("dpkg installation failed, trying to fix broken dependencies with apt-get");
            commandRunner(["apt-get", "install", "-f", "-y"]);
          }
        } else if (packageManager === "apt") {
          logger.warn("Using apt to install a local .deb. This may fail for unsigned packages unless properly configured.");
          commandRunner([
            "apt",
            "install",
            "-y",
            "--allow-unauthenticated",
            // needed for unsigned .debs
            "--allow-downgrades",
            // allow lower version installs
            "--allow-change-held-packages",
            installerPath
          ]);
        } else {
          throw new Error(`Package manager ${packageManager} not supported`);
        }
      }
    };
    exports2.DebUpdater = DebUpdater;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/PacmanUpdater.js
var require_PacmanUpdater = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/PacmanUpdater.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.PacmanUpdater = void 0;
    var types_1 = require_types();
    var Provider_1 = require_Provider();
    var LinuxUpdater_1 = require_LinuxUpdater();
    var PacmanUpdater = class _PacmanUpdater extends LinuxUpdater_1.LinuxUpdater {
      constructor(options2, app25) {
        super(options2, app25);
      }
      /*** @private */
      doDownloadUpdate(downloadUpdateOptions) {
        const provider = downloadUpdateOptions.updateInfoAndProvider.provider;
        const fileInfo = (0, Provider_1.findFile)(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "pacman", ["AppImage", "deb", "rpm"]);
        return this.executeDownload({
          fileExtension: "pacman",
          fileInfo,
          downloadUpdateOptions,
          task: async (updateFile, downloadOptions) => {
            if (this.listenerCount(types_1.DOWNLOAD_PROGRESS) > 0) {
              downloadOptions.onProgress = (it) => this.emit(types_1.DOWNLOAD_PROGRESS, it);
            }
            await this.httpExecutor.download(fileInfo.url, updateFile, downloadOptions);
          }
        });
      }
      doInstall(options2) {
        const installerPath = this.installerPath;
        if (installerPath == null) {
          this.dispatchError(new Error("No update filepath provided, can't quit and install"));
          return false;
        }
        try {
          _PacmanUpdater.installWithCommandRunner(installerPath, this.runCommandWithSudoIfNeeded.bind(this), this._logger);
        } catch (error) {
          this.dispatchError(error);
          return false;
        }
        if (options2.isForceRunAfter) {
          this.app.relaunch();
        }
        return true;
      }
      static installWithCommandRunner(installerPath, commandRunner, logger) {
        var _a2;
        try {
          commandRunner(["pacman", "-U", "--noconfirm", installerPath]);
        } catch (error) {
          logger.warn((_a2 = error.message) !== null && _a2 !== void 0 ? _a2 : error);
          logger.warn("pacman installation failed, attempting to update package database and retry");
          try {
            commandRunner(["pacman", "-Sy", "--noconfirm"]);
            commandRunner(["pacman", "-U", "--noconfirm", installerPath]);
          } catch (retryError) {
            logger.error("Retry after pacman -Sy failed");
            throw retryError;
          }
        }
      }
    };
    exports2.PacmanUpdater = PacmanUpdater;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/RpmUpdater.js
var require_RpmUpdater = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/RpmUpdater.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.RpmUpdater = void 0;
    var types_1 = require_types();
    var Provider_1 = require_Provider();
    var LinuxUpdater_1 = require_LinuxUpdater();
    var RpmUpdater = class _RpmUpdater extends LinuxUpdater_1.LinuxUpdater {
      constructor(options2, app25) {
        super(options2, app25);
      }
      /*** @private */
      doDownloadUpdate(downloadUpdateOptions) {
        const provider = downloadUpdateOptions.updateInfoAndProvider.provider;
        const fileInfo = (0, Provider_1.findFile)(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "rpm", ["AppImage", "deb", "pacman"]);
        return this.executeDownload({
          fileExtension: "rpm",
          fileInfo,
          downloadUpdateOptions,
          task: async (updateFile, downloadOptions) => {
            if (this.listenerCount(types_1.DOWNLOAD_PROGRESS) > 0) {
              downloadOptions.onProgress = (it) => this.emit(types_1.DOWNLOAD_PROGRESS, it);
            }
            await this.httpExecutor.download(fileInfo.url, updateFile, downloadOptions);
          }
        });
      }
      doInstall(options2) {
        const installerPath = this.installerPath;
        if (installerPath == null) {
          this.dispatchError(new Error("No update filepath provided, can't quit and install"));
          return false;
        }
        const priorityList = ["zypper", "dnf", "yum", "rpm"];
        const packageManager = this.detectPackageManager(priorityList);
        try {
          _RpmUpdater.installWithCommandRunner(packageManager, installerPath, this.runCommandWithSudoIfNeeded.bind(this), this._logger);
        } catch (error) {
          this.dispatchError(error);
          return false;
        }
        if (options2.isForceRunAfter) {
          this.app.relaunch();
        }
        return true;
      }
      static installWithCommandRunner(packageManager, installerPath, commandRunner, logger) {
        if (packageManager === "zypper") {
          return commandRunner(["zypper", "--non-interactive", "--no-refresh", "install", "--allow-unsigned-rpm", "-f", installerPath]);
        }
        if (packageManager === "dnf") {
          return commandRunner(["dnf", "install", "--nogpgcheck", "-y", installerPath]);
        }
        if (packageManager === "yum") {
          return commandRunner(["yum", "install", "--nogpgcheck", "-y", installerPath]);
        }
        if (packageManager === "rpm") {
          logger.warn("Installing with rpm only (no dependency resolution).");
          return commandRunner(["rpm", "-Uvh", "--replacepkgs", "--replacefiles", "--nodeps", installerPath]);
        }
        throw new Error(`Package manager ${packageManager} not supported`);
      }
    };
    exports2.RpmUpdater = RpmUpdater;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/MacUpdater.js
var require_MacUpdater = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/MacUpdater.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MacUpdater = void 0;
    var builder_util_runtime_1 = require_out();
    var fs_extra_1 = require_lib();
    var fs_1 = require("fs");
    var path = require("path");
    var http_1 = require("http");
    var AppUpdater_1 = require_AppUpdater();
    var Provider_1 = require_Provider();
    var child_process_1 = require("child_process");
    var crypto_1 = require("crypto");
    var MacUpdater = class extends AppUpdater_1.AppUpdater {
      constructor(options2, app25) {
        super(options2, app25);
        this.nativeUpdater = require("electron").autoUpdater;
        this.squirrelDownloadedUpdate = false;
        this.nativeUpdater.on("error", (it) => {
          this._logger.warn(it);
          this.emit("error", it);
        });
        this.nativeUpdater.on("update-downloaded", () => {
          this.squirrelDownloadedUpdate = true;
          this.debug("nativeUpdater.update-downloaded");
        });
      }
      debug(message) {
        if (this._logger.debug != null) {
          this._logger.debug(message);
        }
      }
      closeServerIfExists() {
        if (this.server) {
          this.debug("Closing proxy server");
          this.server.close((err2) => {
            if (err2) {
              this.debug("proxy server wasn't already open, probably attempted closing again as a safety check before quit");
            }
          });
        }
      }
      async doDownloadUpdate(downloadUpdateOptions) {
        let files = downloadUpdateOptions.updateInfoAndProvider.provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info);
        const log = this._logger;
        const sysctlRosettaInfoKey = "sysctl.proc_translated";
        let isRosetta = false;
        try {
          this.debug("Checking for macOS Rosetta environment");
          const result = (0, child_process_1.execFileSync)("sysctl", [sysctlRosettaInfoKey], { encoding: "utf8" });
          isRosetta = result.includes(`${sysctlRosettaInfoKey}: 1`);
          log.info(`Checked for macOS Rosetta environment (isRosetta=${isRosetta})`);
        } catch (e) {
          log.warn(`sysctl shell command to check for macOS Rosetta environment failed: ${e}`);
        }
        let isArm64Mac = false;
        try {
          this.debug("Checking for arm64 in uname");
          const result = (0, child_process_1.execFileSync)("uname", ["-a"], { encoding: "utf8" });
          const isArm = result.includes("ARM");
          log.info(`Checked 'uname -a': arm64=${isArm}`);
          isArm64Mac = isArm64Mac || isArm;
        } catch (e) {
          log.warn(`uname shell command to check for arm64 failed: ${e}`);
        }
        isArm64Mac = isArm64Mac || process.arch === "arm64" || isRosetta;
        const isArm64 = (file) => {
          var _a2;
          return file.url.pathname.includes("arm64") || ((_a2 = file.info.url) === null || _a2 === void 0 ? void 0 : _a2.includes("arm64"));
        };
        if (isArm64Mac && files.some(isArm64)) {
          files = files.filter((file) => isArm64Mac === isArm64(file));
        } else {
          files = files.filter((file) => !isArm64(file));
        }
        const zipFileInfo = (0, Provider_1.findFile)(files, "zip", ["pkg", "dmg"]);
        if (zipFileInfo == null) {
          throw (0, builder_util_runtime_1.newError)(`ZIP file not provided: ${(0, builder_util_runtime_1.safeStringifyJson)(files)}`, "ERR_UPDATER_ZIP_FILE_NOT_FOUND");
        }
        const provider = downloadUpdateOptions.updateInfoAndProvider.provider;
        const CURRENT_MAC_APP_ZIP_FILE_NAME = "update.zip";
        return this.executeDownload({
          fileExtension: "zip",
          fileInfo: zipFileInfo,
          downloadUpdateOptions,
          task: async (destinationFile, downloadOptions) => {
            const cachedUpdateFilePath = path.join(this.downloadedUpdateHelper.cacheDir, CURRENT_MAC_APP_ZIP_FILE_NAME);
            const canDifferentialDownload = () => {
              if (!(0, fs_extra_1.pathExistsSync)(cachedUpdateFilePath)) {
                log.info("Unable to locate previous update.zip for differential download (is this first install?), falling back to full download");
                return false;
              }
              return !downloadUpdateOptions.disableDifferentialDownload;
            };
            let differentialDownloadFailed = true;
            if (canDifferentialDownload()) {
              differentialDownloadFailed = await this.differentialDownloadInstaller(zipFileInfo, downloadUpdateOptions, destinationFile, provider, CURRENT_MAC_APP_ZIP_FILE_NAME);
            }
            if (differentialDownloadFailed) {
              await this.httpExecutor.download(zipFileInfo.url, destinationFile, downloadOptions);
            }
          },
          done: async (event) => {
            if (!downloadUpdateOptions.disableDifferentialDownload) {
              try {
                const cachedUpdateFilePath = path.join(this.downloadedUpdateHelper.cacheDir, CURRENT_MAC_APP_ZIP_FILE_NAME);
                await (0, fs_extra_1.copyFile)(event.downloadedFile, cachedUpdateFilePath);
              } catch (error) {
                this._logger.warn(`Unable to copy file for caching for future differential downloads: ${error.message}`);
              }
            }
            return this.updateDownloaded(zipFileInfo, event);
          }
        });
      }
      async updateDownloaded(zipFileInfo, event) {
        var _a2;
        const downloadedFile = event.downloadedFile;
        const updateFileSize = (_a2 = zipFileInfo.info.size) !== null && _a2 !== void 0 ? _a2 : (await (0, fs_extra_1.stat)(downloadedFile)).size;
        const log = this._logger;
        const logContext = `fileToProxy=${zipFileInfo.url.href}`;
        this.closeServerIfExists();
        this.debug(`Creating proxy server for native Squirrel.Mac (${logContext})`);
        this.server = (0, http_1.createServer)();
        this.debug(`Proxy server for native Squirrel.Mac is created (${logContext})`);
        this.server.on("close", () => {
          log.info(`Proxy server for native Squirrel.Mac is closed (${logContext})`);
        });
        const getServerUrl = (s) => {
          const address = s.address();
          if (typeof address === "string") {
            return address;
          }
          return `http://127.0.0.1:${address === null || address === void 0 ? void 0 : address.port}`;
        };
        return await new Promise((resolve2, reject) => {
          const pass = (0, crypto_1.randomBytes)(64).toString("base64").replace(/\//g, "_").replace(/\+/g, "-");
          const authInfo = Buffer.from(`autoupdater:${pass}`, "ascii");
          const fileUrl = `/${(0, crypto_1.randomBytes)(64).toString("hex")}.zip`;
          this.server.on("request", (request, response) => {
            const requestUrl = request.url;
            log.info(`${requestUrl} requested`);
            if (requestUrl === "/") {
              if (!request.headers.authorization || request.headers.authorization.indexOf("Basic ") === -1) {
                response.statusCode = 401;
                response.statusMessage = "Invalid Authentication Credentials";
                response.end();
                log.warn("No authenthication info");
                return;
              }
              const base64Credentials = request.headers.authorization.split(" ")[1];
              const credentials = Buffer.from(base64Credentials, "base64").toString("ascii");
              const [username, password] = credentials.split(":");
              if (username !== "autoupdater" || password !== pass) {
                response.statusCode = 401;
                response.statusMessage = "Invalid Authentication Credentials";
                response.end();
                log.warn("Invalid authenthication credentials");
                return;
              }
              const data = Buffer.from(`{ "url": "${getServerUrl(this.server)}${fileUrl}" }`);
              response.writeHead(200, { "Content-Type": "application/json", "Content-Length": data.length });
              response.end(data);
              return;
            }
            if (!requestUrl.startsWith(fileUrl)) {
              log.warn(`${requestUrl} requested, but not supported`);
              response.writeHead(404);
              response.end();
              return;
            }
            log.info(`${fileUrl} requested by Squirrel.Mac, pipe ${downloadedFile}`);
            let errorOccurred = false;
            response.on("finish", () => {
              if (!errorOccurred) {
                this.nativeUpdater.removeListener("error", reject);
                resolve2([]);
              }
            });
            const readStream = (0, fs_1.createReadStream)(downloadedFile);
            readStream.on("error", (error) => {
              try {
                response.end();
              } catch (e) {
                log.warn(`cannot end response: ${e}`);
              }
              errorOccurred = true;
              this.nativeUpdater.removeListener("error", reject);
              reject(new Error(`Cannot pipe "${downloadedFile}": ${error}`));
            });
            response.writeHead(200, {
              "Content-Type": "application/zip",
              "Content-Length": updateFileSize
            });
            readStream.pipe(response);
          });
          this.debug(`Proxy server for native Squirrel.Mac is starting to listen (${logContext})`);
          this.server.listen(0, "127.0.0.1", () => {
            this.debug(`Proxy server for native Squirrel.Mac is listening (address=${getServerUrl(this.server)}, ${logContext})`);
            this.nativeUpdater.setFeedURL({
              url: getServerUrl(this.server),
              headers: {
                "Cache-Control": "no-cache",
                Authorization: `Basic ${authInfo.toString("base64")}`
              }
            });
            this.dispatchUpdateDownloaded(event);
            if (this.autoInstallOnAppQuit) {
              this.nativeUpdater.once("error", reject);
              this.nativeUpdater.checkForUpdates();
            } else {
              resolve2([]);
            }
          });
        });
      }
      handleUpdateDownloaded() {
        if (this.autoRunAppAfterInstall) {
          this.nativeUpdater.quitAndInstall();
        } else {
          this.app.quit();
        }
        this.closeServerIfExists();
      }
      quitAndInstall() {
        if (this.squirrelDownloadedUpdate) {
          this.handleUpdateDownloaded();
        } else {
          this.nativeUpdater.on("update-downloaded", () => this.handleUpdateDownloaded());
          if (!this.autoInstallOnAppQuit) {
            this.nativeUpdater.checkForUpdates();
          }
        }
      }
    };
    exports2.MacUpdater = MacUpdater;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/windowsExecutableCodeSignatureVerifier.js
var require_windowsExecutableCodeSignatureVerifier = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/windowsExecutableCodeSignatureVerifier.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.verifySignature = verifySignature2;
    var builder_util_runtime_1 = require_out();
    var child_process_1 = require("child_process");
    var os = require("os");
    var path = require("path");
    function preparePowerShellExec(command, timeout) {
      const executable = `set "PSModulePath=" & chcp 65001 >NUL & powershell.exe`;
      const args2 = ["-NoProfile", "-NonInteractive", "-InputFormat", "None", "-Command", command];
      const options2 = {
        shell: true,
        timeout
      };
      return [executable, args2, options2];
    }
    function verifySignature2(publisherNames, unescapedTempUpdateFile, logger) {
      return new Promise((resolve2, reject) => {
        const tempUpdateFile = unescapedTempUpdateFile.replace(/'/g, "''");
        logger.info(`Verifying signature ${tempUpdateFile}`);
        (0, child_process_1.execFile)(...preparePowerShellExec(`"Get-AuthenticodeSignature -LiteralPath '${tempUpdateFile}' | ConvertTo-Json -Compress"`, 20 * 1e3), (error, stdout, stderr) => {
          var _a2;
          try {
            if (error != null || stderr) {
              handleError(logger, error, stderr, reject);
              resolve2(null);
              return;
            }
            const data = parseOut(stdout);
            if (data.Status === 0) {
              try {
                const normlaizedUpdateFilePath = path.normalize(data.Path);
                const normalizedTempUpdateFile = path.normalize(unescapedTempUpdateFile);
                logger.info(`LiteralPath: ${normlaizedUpdateFilePath}. Update Path: ${normalizedTempUpdateFile}`);
                if (normlaizedUpdateFilePath !== normalizedTempUpdateFile) {
                  handleError(logger, new Error(`LiteralPath of ${normlaizedUpdateFilePath} is different than ${normalizedTempUpdateFile}`), stderr, reject);
                  resolve2(null);
                  return;
                }
              } catch (error2) {
                logger.warn(`Unable to verify LiteralPath of update asset due to missing data.Path. Skipping this step of validation. Message: ${(_a2 = error2.message) !== null && _a2 !== void 0 ? _a2 : error2.stack}`);
              }
              const subject = (0, builder_util_runtime_1.parseDn)(data.SignerCertificate.Subject);
              let match = false;
              for (const name of publisherNames) {
                const dn = (0, builder_util_runtime_1.parseDn)(name);
                if (dn.size) {
                  const allKeys = Array.from(dn.keys());
                  match = allKeys.every((key) => {
                    return dn.get(key) === subject.get(key);
                  });
                } else if (name === subject.get("CN")) {
                  logger.warn(`Signature validated using only CN ${name}. Please add your full Distinguished Name (DN) to publisherNames configuration`);
                  match = true;
                }
                if (match) {
                  resolve2(null);
                  return;
                }
              }
            }
            const result = `publisherNames: ${publisherNames.join(" | ")}, raw info: ` + JSON.stringify(data, (name, value) => name === "RawData" ? void 0 : value, 2);
            logger.warn(`Sign verification failed, installer signed with incorrect certificate: ${result}`);
            resolve2(result);
          } catch (e) {
            handleError(logger, e, null, reject);
            resolve2(null);
            return;
          }
        });
      });
    }
    function parseOut(out) {
      const data = JSON.parse(out);
      delete data.PrivateKey;
      delete data.IsOSBinary;
      delete data.SignatureType;
      const signerCertificate = data.SignerCertificate;
      if (signerCertificate != null) {
        delete signerCertificate.Archived;
        delete signerCertificate.Extensions;
        delete signerCertificate.Handle;
        delete signerCertificate.HasPrivateKey;
        delete signerCertificate.SubjectName;
      }
      return data;
    }
    function handleError(logger, error, stderr, reject) {
      if (isOldWin6()) {
        logger.warn(`Cannot execute Get-AuthenticodeSignature: ${error || stderr}. Ignoring signature validation due to unsupported powershell version. Please upgrade to powershell 3 or higher.`);
        return;
      }
      try {
        (0, child_process_1.execFileSync)(...preparePowerShellExec("ConvertTo-Json test", 10 * 1e3));
      } catch (testError) {
        logger.warn(`Cannot execute ConvertTo-Json: ${testError.message}. Ignoring signature validation due to unsupported powershell version. Please upgrade to powershell 3 or higher.`);
        return;
      }
      if (error != null) {
        reject(error);
      }
      if (stderr) {
        reject(new Error(`Cannot execute Get-AuthenticodeSignature, stderr: ${stderr}. Failing signature validation due to unknown stderr.`));
      }
    }
    function isOldWin6() {
      const winVersion = os.release();
      return winVersion.startsWith("6.") && !winVersion.startsWith("6.3");
    }
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/NsisUpdater.js
var require_NsisUpdater = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/NsisUpdater.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.NsisUpdater = void 0;
    var builder_util_runtime_1 = require_out();
    var path = require("path");
    var BaseUpdater_1 = require_BaseUpdater();
    var FileWithEmbeddedBlockMapDifferentialDownloader_1 = require_FileWithEmbeddedBlockMapDifferentialDownloader();
    var types_1 = require_types();
    var Provider_1 = require_Provider();
    var fs_extra_1 = require_lib();
    var windowsExecutableCodeSignatureVerifier_1 = require_windowsExecutableCodeSignatureVerifier();
    var url_1 = require("url");
    var NsisUpdater = class extends BaseUpdater_1.BaseUpdater {
      constructor(options2, app25) {
        super(options2, app25);
        this._verifyUpdateCodeSignature = (publisherNames, unescapedTempUpdateFile) => (0, windowsExecutableCodeSignatureVerifier_1.verifySignature)(publisherNames, unescapedTempUpdateFile, this._logger);
      }
      /**
       * The verifyUpdateCodeSignature. You can pass [win-verify-signature](https://github.com/beyondkmp/win-verify-trust) or another custom verify function: ` (publisherName: string[], path: string) => Promise<string | null>`.
       * The default verify function uses [windowsExecutableCodeSignatureVerifier](https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/windowsExecutableCodeSignatureVerifier.ts)
       */
      get verifyUpdateCodeSignature() {
        return this._verifyUpdateCodeSignature;
      }
      set verifyUpdateCodeSignature(value) {
        if (value) {
          this._verifyUpdateCodeSignature = value;
        }
      }
      /*** @private */
      doDownloadUpdate(downloadUpdateOptions) {
        const provider = downloadUpdateOptions.updateInfoAndProvider.provider;
        const fileInfo = (0, Provider_1.findFile)(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "exe");
        return this.executeDownload({
          fileExtension: "exe",
          downloadUpdateOptions,
          fileInfo,
          task: async (destinationFile, downloadOptions, packageFile, removeTempDirIfAny) => {
            const packageInfo = fileInfo.packageInfo;
            const isWebInstaller = packageInfo != null && packageFile != null;
            if (isWebInstaller && downloadUpdateOptions.disableWebInstaller) {
              throw (0, builder_util_runtime_1.newError)(`Unable to download new version ${downloadUpdateOptions.updateInfoAndProvider.info.version}. Web Installers are disabled`, "ERR_UPDATER_WEB_INSTALLER_DISABLED");
            }
            if (!isWebInstaller && !downloadUpdateOptions.disableWebInstaller) {
              this._logger.warn("disableWebInstaller is set to false, you should set it to true if you do not plan on using a web installer. This will default to true in a future version.");
            }
            if (isWebInstaller || downloadUpdateOptions.disableDifferentialDownload || await this.differentialDownloadInstaller(fileInfo, downloadUpdateOptions, destinationFile, provider, builder_util_runtime_1.CURRENT_APP_INSTALLER_FILE_NAME)) {
              await this.httpExecutor.download(fileInfo.url, destinationFile, downloadOptions);
            }
            const signatureVerificationStatus = await this.verifySignature(destinationFile);
            if (signatureVerificationStatus != null) {
              await removeTempDirIfAny();
              throw (0, builder_util_runtime_1.newError)(`New version ${downloadUpdateOptions.updateInfoAndProvider.info.version} is not signed by the application owner: ${signatureVerificationStatus}`, "ERR_UPDATER_INVALID_SIGNATURE");
            }
            if (isWebInstaller) {
              if (await this.differentialDownloadWebPackage(downloadUpdateOptions, packageInfo, packageFile, provider)) {
                try {
                  await this.httpExecutor.download(new url_1.URL(packageInfo.path), packageFile, {
                    headers: downloadUpdateOptions.requestHeaders,
                    cancellationToken: downloadUpdateOptions.cancellationToken,
                    sha512: packageInfo.sha512
                  });
                } catch (e) {
                  try {
                    await (0, fs_extra_1.unlink)(packageFile);
                  } catch (_ignored) {
                  }
                  throw e;
                }
              }
            }
          }
        });
      }
      // $certificateInfo = (Get-AuthenticodeSignature 'xxx\yyy.exe'
      // | where {$_.Status.Equals([System.Management.Automation.SignatureStatus]::Valid) -and $_.SignerCertificate.Subject.Contains("CN=siemens.com")})
      // | Out-String ; if ($certificateInfo) { exit 0 } else { exit 1 }
      async verifySignature(tempUpdateFile) {
        let publisherName;
        try {
          publisherName = (await this.configOnDisk.value).publisherName;
          if (publisherName == null) {
            return null;
          }
        } catch (e) {
          if (e.code === "ENOENT") {
            return null;
          }
          throw e;
        }
        return await this._verifyUpdateCodeSignature(Array.isArray(publisherName) ? publisherName : [publisherName], tempUpdateFile);
      }
      doInstall(options2) {
        const installerPath = this.installerPath;
        if (installerPath == null) {
          this.dispatchError(new Error("No update filepath provided, can't quit and install"));
          return false;
        }
        const args2 = ["--updated"];
        if (options2.isSilent) {
          args2.push("/S");
        }
        if (options2.isForceRunAfter) {
          args2.push("--force-run");
        }
        if (this.installDirectory) {
          args2.push(`/D=${this.installDirectory}`);
        }
        const packagePath = this.downloadedUpdateHelper == null ? null : this.downloadedUpdateHelper.packageFile;
        if (packagePath != null) {
          args2.push(`--package-file=${packagePath}`);
        }
        const callUsingElevation = () => {
          this.spawnLog(path.join(process.resourcesPath, "elevate.exe"), [installerPath].concat(args2)).catch((e) => this.dispatchError(e));
        };
        if (options2.isAdminRightsRequired) {
          this._logger.info("isAdminRightsRequired is set to true, run installer using elevate.exe");
          callUsingElevation();
          return true;
        }
        this.spawnLog(installerPath, args2).catch((e) => {
          const errorCode = e.code;
          this._logger.info(`Cannot run installer: error code: ${errorCode}, error message: "${e.message}", will be executed again using elevate if EACCES, and will try to use electron.shell.openItem if ENOENT`);
          if (errorCode === "UNKNOWN" || errorCode === "EACCES") {
            callUsingElevation();
          } else if (errorCode === "ENOENT") {
            require("electron").shell.openPath(installerPath).catch((err2) => this.dispatchError(err2));
          } else {
            this.dispatchError(e);
          }
        });
        return true;
      }
      async differentialDownloadWebPackage(downloadUpdateOptions, packageInfo, packagePath, provider) {
        if (packageInfo.blockMapSize == null) {
          return true;
        }
        try {
          const downloadOptions = {
            newUrl: new url_1.URL(packageInfo.path),
            oldFile: path.join(this.downloadedUpdateHelper.cacheDir, builder_util_runtime_1.CURRENT_APP_PACKAGE_FILE_NAME),
            logger: this._logger,
            newFile: packagePath,
            requestHeaders: this.requestHeaders,
            isUseMultipleRangeRequest: provider.isUseMultipleRangeRequest,
            cancellationToken: downloadUpdateOptions.cancellationToken
          };
          if (this.listenerCount(types_1.DOWNLOAD_PROGRESS) > 0) {
            downloadOptions.onProgress = (it) => this.emit(types_1.DOWNLOAD_PROGRESS, it);
          }
          await new FileWithEmbeddedBlockMapDifferentialDownloader_1.FileWithEmbeddedBlockMapDifferentialDownloader(packageInfo, this.httpExecutor, downloadOptions).download();
        } catch (e) {
          this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`);
          return process.platform === "win32";
        }
        return false;
      }
    };
    exports2.NsisUpdater = NsisUpdater;
  }
});

// node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/main.js
var require_main2 = __commonJS({
  "node_modules/.pnpm/electron-updater@6.8.3/node_modules/electron-updater/out/main.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.NsisUpdater = exports2.MacUpdater = exports2.RpmUpdater = exports2.PacmanUpdater = exports2.DebUpdater = exports2.AppImageUpdater = exports2.Provider = exports2.NoOpLogger = exports2.AppUpdater = exports2.BaseUpdater = void 0;
    var fs_extra_1 = require_lib();
    var path = require("path");
    var BaseUpdater_1 = require_BaseUpdater();
    Object.defineProperty(exports2, "BaseUpdater", { enumerable: true, get: function() {
      return BaseUpdater_1.BaseUpdater;
    } });
    var AppUpdater_1 = require_AppUpdater();
    Object.defineProperty(exports2, "AppUpdater", { enumerable: true, get: function() {
      return AppUpdater_1.AppUpdater;
    } });
    Object.defineProperty(exports2, "NoOpLogger", { enumerable: true, get: function() {
      return AppUpdater_1.NoOpLogger;
    } });
    var Provider_1 = require_Provider();
    Object.defineProperty(exports2, "Provider", { enumerable: true, get: function() {
      return Provider_1.Provider;
    } });
    var AppImageUpdater_1 = require_AppImageUpdater();
    Object.defineProperty(exports2, "AppImageUpdater", { enumerable: true, get: function() {
      return AppImageUpdater_1.AppImageUpdater;
    } });
    var DebUpdater_1 = require_DebUpdater();
    Object.defineProperty(exports2, "DebUpdater", { enumerable: true, get: function() {
      return DebUpdater_1.DebUpdater;
    } });
    var PacmanUpdater_1 = require_PacmanUpdater();
    Object.defineProperty(exports2, "PacmanUpdater", { enumerable: true, get: function() {
      return PacmanUpdater_1.PacmanUpdater;
    } });
    var RpmUpdater_1 = require_RpmUpdater();
    Object.defineProperty(exports2, "RpmUpdater", { enumerable: true, get: function() {
      return RpmUpdater_1.RpmUpdater;
    } });
    var MacUpdater_1 = require_MacUpdater();
    Object.defineProperty(exports2, "MacUpdater", { enumerable: true, get: function() {
      return MacUpdater_1.MacUpdater;
    } });
    var NsisUpdater_1 = require_NsisUpdater();
    Object.defineProperty(exports2, "NsisUpdater", { enumerable: true, get: function() {
      return NsisUpdater_1.NsisUpdater;
    } });
    __exportStar(require_types(), exports2);
    var _autoUpdater;
    function doLoadAutoUpdater() {
      if (process.platform === "win32") {
        _autoUpdater = new (require_NsisUpdater()).NsisUpdater();
      } else if (process.platform === "darwin") {
        _autoUpdater = new (require_MacUpdater()).MacUpdater();
      } else {
        _autoUpdater = new (require_AppImageUpdater()).AppImageUpdater();
        try {
          const identity = path.join(process.resourcesPath, "package-type");
          if (!(0, fs_extra_1.existsSync)(identity)) {
            return _autoUpdater;
          }
          const fileType = (0, fs_extra_1.readFileSync)(identity).toString().trim();
          switch (fileType) {
            case "deb":
              _autoUpdater = new (require_DebUpdater()).DebUpdater();
              break;
            case "rpm":
              _autoUpdater = new (require_RpmUpdater()).RpmUpdater();
              break;
            case "pacman":
              _autoUpdater = new (require_PacmanUpdater()).PacmanUpdater();
              break;
            default:
              break;
          }
        } catch (error) {
          console.warn("Unable to detect 'package-type' for autoUpdater (rpm/deb/pacman support). If you'd like to expand support, please consider contributing to electron-builder", error.message);
        }
      }
      return _autoUpdater;
    }
    Object.defineProperty(exports2, "autoUpdater", {
      enumerable: true,
      get: () => {
        return _autoUpdater || doLoadAutoUpdater();
      }
    });
  }
});

// src/midnightcord/shared/utils/millis.ts
var init_millis = __esm({
  "src/midnightcord/shared/utils/millis.ts"() {
    "use strict";
  }
});

// src/midnightcord/main/utils/ipcWrappers.ts
function validateSender2(frame, event) {
  if (!frame) throw new Error(`ipc[${event}]: No sender frame`);
  if (!frame.url) return;
  try {
    var { hostname, protocol: protocol3 } = new URL(frame.url);
  } catch (e) {
    throw new Error(`ipc[${event}]: Invalid URL ${frame.url}`);
  }
  if (protocol3 === "file:" || protocol3 === "vesktop:" || protocol3 === "Midnightcord:") return;
  if (!DISCORD_HOSTNAMES.includes(hostname)) {
    throw new Error(`ipc[${event}]: Disallowed hostname ${hostname}`);
  }
}
function handleSync(event, cb) {
  import_electron14.ipcMain.on(event, (e, ...args2) => {
    validateSender2(e.senderFrame, event);
    e.returnValue = cb(e, ...args2);
  });
}
function handle(event, cb) {
  import_electron14.ipcMain.handle(event, (e, ...args2) => {
    validateSender2(e.senderFrame, event);
    return cb(e, ...args2);
  });
}
var import_electron14;
var init_ipcWrappers = __esm({
  "src/midnightcord/main/utils/ipcWrappers.ts"() {
    "use strict";
    import_electron14 = require("electron");
    init_constants2();
  }
});

// src/midnightcord/main/updater.ts
function openUpdater(update) {
  if (updaterWindow && !updaterWindow.isDestroyed()) {
    updaterWindow.focus();
    return;
  }
  import_electron15.ipcMain.removeHandler("VCD_UPDATER_GET_DATA" /* GET_DATA */);
  import_electron15.ipcMain.removeHandler("VCD_UPDATER_INSTALL" /* INSTALL */);
  import_electron15.ipcMain.removeHandler("VCD_UPDATER_SNOOZE_UPDATE" /* SNOOZE_UPDATE */);
  import_electron15.ipcMain.removeHandler("VCD_UPDATER_IGNORE_UPDATE" /* IGNORE_UPDATE */);
  updaterWindow = new import_electron15.BrowserWindow({
    title: "Midnightcord Updater",
    autoHideMenuBar: true,
    ...process.platform === "win32" ? { icon: (0, import_path12.join)(STATIC_DIR, "icon.ico") } : process.platform === "linux" ? { icon: (0, import_path12.join)(STATIC_DIR, "icon.png") } : {},
    webPreferences: {
      preload: (0, import_path12.join)(__dirname, "updaterPreload.js")
    },
    minHeight: 400,
    minWidth: 750
  });
  makeLinksOpenExternally(updaterWindow);
  handle("VCD_UPDATER_GET_DATA" /* GET_DATA */, () => ({
    update,
    version: import_electron15.app.getVersion(),
    autoUpdate: true
  }));
  handle("VCD_UPDATER_INSTALL" /* INSTALL */, async () => {
    await import_electron_updater.autoUpdater.downloadUpdate();
    import_electron_updater.autoUpdater.quitAndInstall(false, true);
  });
  handle("VCD_UPDATER_SNOOZE_UPDATE" /* SNOOZE_UPDATE */, () => {
    State.store.updater ??= {};
    State.store.updater.snoozeUntil = Date.now() + 1 * 864e5 /* DAY */;
    updaterWindow?.close();
  });
  handle("VCD_UPDATER_IGNORE_UPDATE" /* IGNORE_UPDATE */, () => {
    State.store.updater ??= {};
    State.store.updater.ignoredVersion = update.version;
    updaterWindow?.close();
  });
  updaterWindow.on("closed", () => {
    import_electron15.ipcMain.removeHandler("VCD_UPDATER_GET_DATA" /* GET_DATA */);
    import_electron15.ipcMain.removeHandler("VCD_UPDATER_INSTALL" /* INSTALL */);
    import_electron15.ipcMain.removeHandler("VCD_UPDATER_SNOOZE_UPDATE" /* SNOOZE_UPDATE */);
    import_electron15.ipcMain.removeHandler("VCD_UPDATER_IGNORE_UPDATE" /* IGNORE_UPDATE */);
    updaterWindow = null;
  });
  loadView(updaterWindow, "updater/index.html");
}
var import_electron15, import_path12, import_electron_updater, MIDNIGHTCORD_PREFS, updaterWindow, isOutdated;
var init_updater = __esm({
  "src/midnightcord/main/updater.ts"() {
    "use strict";
    import_electron15 = require("electron");
    import_path12 = require("path");
    import_electron_updater = __toESM(require_main2());
    init_IpcEvents2();
    init_paths();
    init_millis();
    init_settings2();
    init_ipcWrappers();
    init_makeLinksOpenExternally();
    init_vesktopStatic();
    MIDNIGHTCORD_PREFS = { defaultPlugins: true, autoUpdate: true };
    handle(IpcEvents2.GET_INSTALLER_PREFS, () => MIDNIGHTCORD_PREFS);
    updaterWindow = null;
    import_electron_updater.autoUpdater.on("update-available", (update) => {
      if (State.store.updater?.ignoredVersion === update.version) return;
      if ((State.store.updater?.snoozeUntil ?? 0) > Date.now()) return;
      if (update.version === import_electron15.app.getVersion()) return;
      if (updaterWindow && !updaterWindow.isDestroyed()) return;
      openUpdater(update);
    });
    import_electron_updater.autoUpdater.on("update-downloaded", () => {
      updaterWindow?.webContents.send("VCD_UPDATER_DOWNLOAD_PROGRESS" /* DOWNLOAD_PROGRESS */, 100);
    });
    import_electron_updater.autoUpdater.on(
      "download-progress",
      (p) => updaterWindow?.webContents.send("VCD_UPDATER_DOWNLOAD_PROGRESS" /* DOWNLOAD_PROGRESS */, p.percent)
    );
    import_electron_updater.autoUpdater.on("error", (err2) => updaterWindow?.webContents.send("VCD_UPDATER_ERROR" /* ERROR */, err2.message));
    import_electron_updater.autoUpdater.autoDownload = false;
    import_electron_updater.autoUpdater.autoInstallOnAppQuit = false;
    import_electron_updater.autoUpdater.fullChangelog = true;
    isOutdated = new Promise((resolve2) => {
      import_electron15.app.whenReady().then(() => {
        setTimeout(() => {
          import_electron_updater.autoUpdater.checkForUpdates().then((res) => {
            if (!res?.isUpdateAvailable) return resolve2(false);
            if (res.updateInfo?.version === import_electron15.app.getVersion()) return resolve2(false);
            resolve2(true);
          }).catch(() => resolve2(false));
        }, 5e3);
      });
    });
    handle("VCD_UPDATER_IS_OUTDATED" /* UPDATER_IS_OUTDATED */, () => isOutdated);
    handle("VCD_UPDATER_OPEN" /* UPDATER_OPEN */, async () => {
      const res = await import_electron_updater.autoUpdater.checkForUpdates();
      if (res?.isUpdateAvailable && res.updateInfo) openUpdater(res.updateInfo);
    });
  }
});

// src/midnightcord/shared/utils/debounce.ts
function debounce2(func, delay = 300) {
  let timeout;
  return function(...args2) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(...args2);
    }, delay);
  };
}
var init_debounce2 = __esm({
  "src/midnightcord/shared/utils/debounce.ts"() {
    "use strict";
  }
});

// src/midnightcord/main/arrpcWindow.ts
function createArRPCWindow() {
  if (arrpcWindow && !arrpcWindow.isDestroyed()) {
    arrpcWindow.focus();
    return arrpcWindow;
  }
  arrpcWindow = new import_electron16.BrowserWindow({
    center: true,
    autoHideMenuBar: true,
    ...process.platform === "win32" ? { icon: (0, import_path13.join)(STATIC_DIR, "icon.ico") } : process.platform === "linux" ? { icon: (0, import_path13.join)(STATIC_DIR, "icon.png") } : {},
    height: 450,
    width: 500,
    resizable: false
  });
  makeLinksOpenExternally(arrpcWindow);
  const settings = Settings.store;
  const status = getArRPCStatus();
  const data = new URLSearchParams({
    arRPCDisabled: String(settings.arRPCDisabled ?? false),
    arRPC: String(settings.arRPC ?? false),
    arRPCProcessScanning: String(settings.arRPCProcessScanning ?? true),
    arRPCDebug: String(settings.arRPCDebug ?? false),
    arRPCWebSocketAutoReconnect: String(settings.arRPCWebSocketAutoReconnect ?? true),
    arRPCWebSocketCustomHost: settings.arRPCWebSocketCustomHost ?? "",
    arRPCWebSocketCustomPort: String(settings.arRPCWebSocketCustomPort ?? ""),
    status: JSON.stringify(status)
  });
  loadView(arrpcWindow, "arrpc.html", data);
  statusInterval = setInterval(() => {
    if (arrpcWindow && !arrpcWindow.isDestroyed()) {
      const currentStatus = getArRPCStatus();
      arrpcWindow.webContents.executeJavaScript(
        `window.updateStatus && window.updateStatus(${JSON.stringify(currentStatus)})`
      );
    }
  }, 2e3);
  arrpcWindow.webContents.addListener("console-message", (e) => {
    const msg = e.message;
    if (msg === "close") {
      arrpcWindow?.close();
      return;
    }
    if (msg === "restart") {
      restartArRPC();
      return;
    }
    if (!msg.startsWith("set:")) return;
    const [key, value] = msg.slice(4).split("=");
    switch (key) {
      case "arRPCDisabled":
        Settings.store.arRPCDisabled = value === "true";
        break;
      case "arRPC":
        Settings.store.arRPC = value === "true";
        break;
      case "arRPCProcessScanning":
        Settings.store.arRPCProcessScanning = value === "true";
        break;
      case "arRPCDebug":
        Settings.store.arRPCDebug = value === "true";
        break;
      case "arRPCWebSocketAutoReconnect":
        Settings.store.arRPCWebSocketAutoReconnect = value === "true";
        break;
      case "arRPCWebSocketCustomHost":
        Settings.store.arRPCWebSocketCustomHost = value || void 0;
        break;
      case "arRPCWebSocketCustomPort":
        Settings.store.arRPCWebSocketCustomPort = value ? parseInt(value, 10) : void 0;
        break;
    }
  });
  arrpcWindow.on("closed", () => {
    if (statusInterval) {
      clearInterval(statusInterval);
      statusInterval = null;
    }
    arrpcWindow = null;
  });
  return arrpcWindow;
}
var import_electron16, import_path13, arrpcWindow, statusInterval;
var init_arrpcWindow = __esm({
  "src/midnightcord/main/arrpcWindow.ts"() {
    "use strict";
    import_electron16 = require("electron");
    import_path13 = require("path");
    init_paths();
    init_arrpc();
    init_settings2();
    init_makeLinksOpenExternally();
    init_vesktopStatic();
    arrpcWindow = null;
    statusInterval = null;
  }
});

// src/midnightcord/main/utils/desktopFileEscape.ts
function escapeDesktopFileArgument(arg) {
  let needsQuoting = false;
  let out = "";
  for (const c of arg) {
    if (desktopFileReservedChars.has(c)) {
      needsQuoting = true;
      if (c === '"' || c === "`" || c === "$" || c === "\\") {
        out += "\\";
      }
    }
    if (c === "%") {
      out += "%%";
    } else {
      out += c;
    }
  }
  return needsQuoting ? `"${out}"` : out;
}
var desktopFileReservedChars;
var init_desktopFileEscape = __esm({
  "src/midnightcord/main/utils/desktopFileEscape.ts"() {
    "use strict";
    desktopFileReservedChars = /* @__PURE__ */ new Set([
      " ",
      "	",
      "\n",
      '"',
      "'",
      "\\",
      ">",
      "<",
      "~",
      "|",
      "&",
      ";",
      "$",
      "*",
      "?",
      "#",
      "(",
      ")",
      "`"
    ]);
  }
});

// src/midnightcord/main/autoStart.ts
function getEscapedCommandLine() {
  const args2 = process.argv.map(escapeDesktopFileArgument);
  if (Settings.store.autoStartMinimized) args2.push("--start-minimized");
  return args2;
}
function makeAutoStartLinuxDesktop() {
  const configDir = process.env.XDG_CONFIG_HOME || (0, import_path14.join)(process.env.HOME, ".config");
  const dir = (0, import_path14.join)(configDir, "autostart");
  const file = (0, import_path14.join)(dir, "Midnightcord.desktop");
  return {
    isEnabled: () => (0, import_fs5.existsSync)(file),
    enable() {
      const desktopFile = stripIndent`
                [Desktop Entry]
                Type=Application
                Name=Midnightcord
                Comment=Midnightcord autostart script
                Exec=${getEscapedCommandLine().join(" ")}
                StartupNotify=false
                Terminal=false
                Icon=Midnightcord
            `;
      (0, import_fs5.mkdirSync)(dir, { recursive: true });
      (0, import_fs5.writeFileSync)(file, desktopFile);
    },
    disable: () => (0, import_fs5.rmSync)(file, { force: true })
  };
}
function makeAutoStartLinuxPortal() {
  return {
    isEnabled: () => State.store.linuxAutoStartEnabled === true,
    enable() {
      const success = requestBackground(true, getEscapedCommandLine());
      if (success) {
        State.store.linuxAutoStartEnabled = true;
      }
      return success;
    },
    disable() {
      const success = requestBackground(false, []);
      if (success) {
        State.store.linuxAutoStartEnabled = false;
      }
      return success;
    }
  };
}
var import_electron17, import_fs5, import_path14, autoStartWindowsMac, autoStart;
var init_autoStart = __esm({
  "src/midnightcord/main/autoStart.ts"() {
    "use strict";
    import_electron17 = require("electron");
    import_fs5 = require("fs");
    import_path14 = require("path");
    init_text();
    init_constants2();
    init_dbus();
    init_settings2();
    init_desktopFileEscape();
    autoStartWindowsMac = {
      isEnabled: () => import_electron17.app.getLoginItemSettings().openAtLogin,
      enable: () => import_electron17.app.setLoginItemSettings({
        openAtLogin: true,
        args: Settings.store.autoStartMinimized ? ["--start-minimized"] : []
      }),
      disable: () => import_electron17.app.setLoginItemSettings({ openAtLogin: false })
    };
    autoStart = process.platform !== "linux" ? autoStartWindowsMac : IS_FLATPAK ? makeAutoStartLinuxPortal() : makeAutoStartLinuxDesktop();
    Settings.addChangeListener("autoStartMinimized", () => {
      if (!autoStart.isEnabled()) return;
      autoStart.enable();
    });
  }
});

// src/midnightcord/main/utils/popout.ts
function focusWindow(window2) {
  window2.setAlwaysOnTop(true);
  window2.focus();
  window2.setAlwaysOnTop(false);
}
function parseFeatureValue(feature) {
  if (feature === "yes") return true;
  if (feature === "no") return false;
  const n = Number(feature);
  if (!isNaN(n)) return n;
  return feature;
}
function parseWindowFeatures(features) {
  const keyValuesParsed = features.split(",");
  return keyValuesParsed.reduce((features2, feature) => {
    const [key, value] = feature.split("=");
    if (ALLOWED_FEATURES.has(key)) features2[key] = parseFeatureValue(value);
    return features2;
  }, {});
}
function createOrFocusPopup(key, features) {
  const existingWindow = PopoutWindows.get(key);
  if (existingWindow) {
    focusWindow(existingWindow);
    return { action: "deny" };
  }
  return {
    action: "allow",
    overrideBrowserWindowOptions: {
      ...DEFAULT_POPOUT_OPTIONS,
      ...parseWindowFeatures(features)
    }
  };
}
function setupPopout(win, key) {
  win.setMenuBarVisibility(false);
  PopoutWindows.set(key, win);
  win.on("enter-html-full-screen", () => {
    win.setFullScreen(true);
  });
  win.on("leave-html-full-screen", () => {
    win.setFullScreen(false);
  });
  win.webContents.setWindowOpenHandler(({ url }) => handleExternalUrl(url));
  win.once("closed", () => {
    win.removeAllListeners();
    PopoutWindows.delete(key);
  });
}
var ALLOWED_FEATURES, MIN_POPOUT_WIDTH, MIN_POPOUT_HEIGHT, DEFAULT_POPOUT_OPTIONS, PopoutWindows;
var init_popout = __esm({
  "src/midnightcord/main/utils/popout.ts"() {
    "use strict";
    init_settings2();
    init_makeLinksOpenExternally();
    ALLOWED_FEATURES = /* @__PURE__ */ new Set([
      "width",
      "height",
      "left",
      "top",
      "resizable",
      "movable",
      "alwaysOnTop",
      "frame",
      "transparent",
      "hasShadow",
      "closable",
      "skipTaskbar",
      "backgroundColor",
      "menubar",
      "toolbar",
      "location",
      "directories",
      "titleBarStyle"
    ]);
    MIN_POPOUT_WIDTH = 320;
    MIN_POPOUT_HEIGHT = 180;
    DEFAULT_POPOUT_OPTIONS = {
      title: "Discord Popout",
      backgroundColor: "#2f3136",
      minWidth: MIN_POPOUT_WIDTH,
      minHeight: MIN_POPOUT_HEIGHT,
      frame: Settings.store.customTitleBar !== true,
      titleBarStyle: process.platform === "darwin" ? "hidden" : void 0,
      trafficLightPosition: process.platform === "darwin" ? {
        x: 10,
        y: 3
      } : void 0,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      },
      autoHideMenuBar: Settings.store.enableMenu
    };
    PopoutWindows = /* @__PURE__ */ new Map();
  }
});

// src/midnightcord/main/utils/steamOS.ts
function applyDeckKeyboardFix() {
  if (!isDeckGameMode) return;
  process.env.GTK_IM_MODULE = "None";
}
function getAppId() {
  const path = process.env.STEAM_COMPAT_MEDIA_PATH;
  if (!path) return null;
  const pathElems = path?.split("/");
  const appId = pathElems[pathElems.length - 2];
  if (appId.match(numberRegex)) {
    console.log(`Got Steam App ID ${appId}`);
    return appId;
  }
  return null;
}
function execSteamURL(url) {
  steamPipeQueue = steamPipeQueue.then(
    () => (0, import_promises2.writeFile)(
      (0, import_path15.join)(process.env.HOME || "/home/deck", ".steam", "steam.pipe"),
      // replace ' to prevent argument injection
      `'${process.env.HOME}/.local/share/Steam/ubuntu12_32/steam' '-ifrunning' '${url.replaceAll("'", "%27")}'
`,
      "utf-8"
    )
  );
}
function steamOpenURL(url) {
  execSteamURL(`steam://openurl/${url}`);
}
async function showGamePage() {
  const appId = getAppId();
  if (!appId) return;
  await execSteamURL(`steam://nav/games/details/${appId}`);
}
async function showLayout(appId) {
  execSteamURL(`steam://controllerconfig/${appId}/${layoutId}`);
}
async function askToApplySteamLayout(win) {
  const appId = getAppId();
  if (!appId) return;
  if (State.store.steamOSLayoutVersion === layoutVersion) return;
  const update = Boolean(State.store.steamOSLayoutVersion);
  const { response } = await import_electron18.dialog.showMessageBox(win, {
    message: `${update ? "Update" : "Apply"} Midnightcord Steam Input Layout?`,
    detail: `Would you like to ${update ? "Update" : "Apply"} Midnightcord's recommended Steam Deck controller settings?
${update ? "Click yes using the touchpad" : "Tap yes"}, then press the X button or tap Apply Layout to confirm.${update ? " Doing so will undo any customizations you have made." : ""}
${update ? "Click" : "Tap"} no to keep your current layout.`,
    buttons: ["Yes", "No"],
    cancelId: 1 /* Cancel */,
    defaultId: 0 /* Default */,
    type: "question"
  });
  if (State.store.steamOSLayoutVersion !== layoutVersion) {
    State.store.steamOSLayoutVersion = layoutVersion;
  }
  if (response === 1 /* Cancel */) return;
  await showLayout(appId);
}
var import_electron18, import_promises2, import_path15, layoutVersion, layoutId, numberRegex, steamPipeQueue, isDeckGameMode;
var init_steamOS = __esm({
  "src/midnightcord/main/utils/steamOS.ts"() {
    "use strict";
    import_electron18 = require("electron");
    import_promises2 = require("fs/promises");
    import_path15 = require("path");
    init_constants2();
    init_settings2();
    layoutVersion = 2;
    layoutId = "3080264545";
    numberRegex = /^[0-9]*$/;
    steamPipeQueue = Promise.resolve();
    isDeckGameMode = process.env.SteamOS === "1" && process.env.SteamGamepadUI === "1";
  }
});

// src/midnightcord/main/vencordDir.ts
var import_electron19, import_path16, VENCORD_DIR;
var init_vencordDir = __esm({
  "src/midnightcord/main/vencordDir.ts"() {
    "use strict";
    import_electron19 = require("electron");
    import_path16 = require("path");
    VENCORD_DIR = import_electron19.app.isPackaged ? (0, import_path16.join)(process.resourcesPath, "midnightcord.asar") : (0, import_path16.join)(__dirname, "..", "..", "..", "dist", "midnightcord.asar");
  }
});

// src/midnightcord/main/utils/http.ts
async function downloadFile(url, file, options2 = {}, fetchieOpts) {
  const res = await fetchie(url, options2, fetchieOpts);
  (0, import_original_fs3.mkdirSync)((0, import_path17.dirname)(file), { recursive: true });
  await (0, import_promises3.pipeline)(
    // @ts-expect-error odd type error
    import_stream2.Readable.fromWeb(res.body),
    (0, import_original_fs3.createWriteStream)(file, {
      autoClose: true
    })
  );
}
async function fetchie(url, options2, { retryOnNetworkError } = {}) {
  let res;
  try {
    res = await fetch(url, options2);
  } catch (err2) {
    if (retryOnNetworkError) {
      console.error("Failed to fetch", url + ".", "Gonna retry with backoff.");
      for (let tries = 0, delayMs = 500; tries < 20; tries++, delayMs = Math.min(2 * delayMs, ONE_MINUTE_MS)) {
        await (0, import_promises4.setTimeout)(delayMs);
        try {
          res = await fetch(url, options2);
          break;
        } catch {
        }
      }
    }
    if (!res) throw new Error(`Failed to fetch ${url}
${err2}`);
  }
  if (res.ok) return res;
  let msg = `Got non-OK response for ${url}: ${res.status} ${res.statusText}`;
  const reason = await res.text().catch(() => "");
  if (reason) msg += `
${reason}`;
  throw new Error(msg);
}
var import_original_fs3, import_path17, import_stream2, import_promises3, import_promises4, ONE_MINUTE_MS;
var init_http3 = __esm({
  "src/midnightcord/main/utils/http.ts"() {
    "use strict";
    import_original_fs3 = require("original-fs");
    import_path17 = require("path");
    import_stream2 = require("stream");
    import_promises3 = require("stream/promises");
    import_promises4 = require("timers/promises");
    ONE_MINUTE_MS = 1e3 * 60;
  }
});

// src/midnightcord/main/utils/vencordLoader.ts
async function downloadVencordAsar() {
  await downloadFile(
    `https://git.${domain}/nightcord/nightcord/releases/download/latest/Midnightcord.asar`,
    VENCORD_DIR,
    {},
    { retryOnNetworkError: true }
  );
}
function isValidVencordInstall(dir) {
  return (0, import_fs6.existsSync)((0, import_path18.join)(dir, "Midnightcord/main.js"));
}
async function ensureVencordFiles() {
  if (!(0, import_fs6.existsSync)(VENCORD_DIR)) {
    console.error("Bundled midnightcord.asar not found at", VENCORD_DIR);
  }
}
var import_fs6, import_path18, API_BASE2;
var init_vencordLoader = __esm({
  "src/midnightcord/main/utils/vencordLoader.ts"() {
    "use strict";
    import_fs6 = require("fs");
    import_path18 = require("path");
    init_constants2();
    init_vencordDir();
    init_http3();
    init_DOMAIN();
    API_BASE2 = `https://git.${domain}/api/v1`;
  }
});

// src/midnightcord/main/venmic.ts
var venmic_exports = {};
function importVenmic() {
  if (imported) {
    return;
  }
  imported = true;
  try {
    PatchBay = require((0, import_path19.join)(STATIC_DIR, `dist/venmic-${process.arch}.node`)).PatchBay;
    hasPipewirePulse = PatchBay.hasPipeWire();
  } catch (e) {
    console.error("Failed to import venmic", e);
    isGlibCxxOutdated = (e?.stack || e?.message || "").toLowerCase().includes("glibc");
  }
}
function obtainVenmic() {
  if (!imported) {
    importVenmic();
  }
  if (PatchBay && !initialized) {
    initialized = true;
    try {
      patchBayInstance = new PatchBay();
    } catch (e) {
      console.error("Failed to instantiate venmic", e);
    }
  }
  return patchBayInstance;
}
function getRendererAudioServicePid() {
  return import_electron20.app.getAppMetrics().find((proc) => proc.name === "Audio Service")?.pid?.toString() ?? "owo";
}
var import_electron20, import_path19, PatchBay, patchBayInstance, imported, initialized, hasPipewirePulse, isGlibCxxOutdated;
var init_venmic = __esm({
  "src/midnightcord/main/venmic.ts"() {
    "use strict";
    import_electron20 = require("electron");
    import_path19 = require("path");
    init_IpcEvents2();
    init_paths();
    init_settings2();
    imported = false;
    initialized = false;
    hasPipewirePulse = false;
    isGlibCxxOutdated = false;
    import_electron20.ipcMain.handle("VCD_VIRT_MIC_LIST" /* VIRT_MIC_LIST */, () => {
      const audioPid = getRendererAudioServicePid();
      const { granularSelect } = Settings.store.audio ?? {};
      const targets = obtainVenmic()?.list(granularSelect ? ["node.name"] : void 0).filter((s) => s["application.process.id"] !== audioPid);
      return targets ? { ok: true, targets, hasPipewirePulse } : { ok: false, isGlibCxxOutdated };
    });
    import_electron20.ipcMain.handle("VCD_VIRT_MIC_START" /* VIRT_MIC_START */, (_, include) => {
      const pid = getRendererAudioServicePid();
      const { ignoreDevices, ignoreInputMedia, ignoreVirtual, workaround } = Settings.store.audio ?? {};
      const data = {
        include,
        exclude: [{ "application.process.id": pid }],
        ignore_devices: ignoreDevices
      };
      if (ignoreInputMedia ?? true) {
        data.exclude.push({ "media.class": "Stream/Input/Audio" });
      }
      if (ignoreVirtual) {
        data.exclude.push({ "node.virtual": "true" });
      }
      if (workaround) {
        data.workaround = [{ "application.process.id": pid, "media.name": "RecordStream" }];
      }
      return obtainVenmic()?.link(data);
    });
    import_electron20.ipcMain.handle("VCD_VIRT_MIC_START_ALL" /* VIRT_MIC_START_SYSTEM */, (_, exclude) => {
      const pid = getRendererAudioServicePid();
      const { workaround, ignoreDevices, ignoreInputMedia, ignoreVirtual, onlySpeakers, onlyDefaultSpeakers } = Settings.store.audio ?? {};
      const data = {
        include: [],
        exclude: [{ "application.process.id": pid }, ...exclude],
        only_speakers: onlySpeakers,
        ignore_devices: ignoreDevices,
        only_default_speakers: onlyDefaultSpeakers
      };
      if (ignoreInputMedia ?? true) {
        data.exclude.push({ "media.class": "Stream/Input/Audio" });
      }
      if (ignoreVirtual) {
        data.exclude.push({ "node.virtual": "true" });
      }
      if (workaround) {
        data.workaround = [{ "application.process.id": pid, "media.name": "RecordStream" }];
      }
      return obtainVenmic()?.link(data);
    });
    import_electron20.ipcMain.handle("VCD_VIRT_MIC_STOP" /* VIRT_MIC_STOP */, () => obtainVenmic()?.unlink());
  }
});

// src/midnightcord/main/ipc.ts
function getWindow(e, key) {
  return key ? PopoutWindows.get(key) : import_electron21.BrowserWindow.fromWebContents(e.sender) ?? mainWin;
}
function openDebugPage(page) {
  const win = new import_electron21.BrowserWindow({
    autoHideMenuBar: true,
    ...process.platform === "win32" ? { icon: (0, import_node_path2.join)(STATIC_DIR, "icon.ico") } : process.platform === "linux" ? { icon: (0, import_node_path2.join)(STATIC_DIR, "icon.png") } : {}
  });
  win.loadURL(page);
}
function readCss() {
  return (0, import_promises5.readFile)(VENCORD_QUICKCSS_FILE, "utf-8").catch(() => "");
}
function cleanupFileWatchers() {
  if (quickCssWatcher) {
    quickCssWatcher.close();
    quickCssWatcher = null;
  }
  if (themesWatcher) {
    themesWatcher.close();
    themesWatcher = null;
  }
}
var import_node_child_process2, import_node_fs2, import_promises5, import_node_os, import_node_path2, import_electron21, VESKTOP_RENDERER_JS_PATH, VESKTOP_RENDERER_CSS_PATH, quickCssWatcher, themesWatcher;
var init_ipc = __esm({
  "src/midnightcord/main/ipc.ts"() {
    "use strict";
    import_node_child_process2 = require("node:child_process");
    import_node_fs2 = require("node:fs");
    import_promises5 = require("node:fs/promises");
    import_node_os = require("node:os");
    import_node_path2 = require("node:path");
    import_electron21 = require("electron");
    init_paths();
    init_debounce2();
    init_IpcEvents2();
    init_appBadge();
    init_arrpcWindow();
    init_autoStart();
    init_constants2();
    init_events();
    init_gnuSpoofing();
    init_mainWindow();
    init_settings2();
    init_startup();
    init_ipcWrappers();
    init_popout();
    init_steamOS();
    init_vencordLoader();
    init_vencordDir();
    if (process.platform === "linux") Promise.resolve().then(() => init_venmic());
    handleSync("DEPRECATED_GET_VENCORD_PRELOAD_SCRIPT_PATH" /* DEPRECATED_GET_VENCORD_PRELOAD_SCRIPT_PATH */, () => (0, import_node_path2.join)(VENCORD_DIR, "preload.js"));
    handleSync("VCD_GET_VC_PRELOAD_SCRIPT" /* GET_VENCORD_PRELOAD_SCRIPT */, () => (0, import_node_fs2.readFileSync)((0, import_node_path2.join)(VENCORD_DIR, "preload.js"), "utf-8"));
    handleSync("VCD_GET_VC_RENDERER_SCRIPT" /* GET_VENCORD_RENDERER_SCRIPT */, () => (0, import_node_fs2.readFileSync)((0, import_node_path2.join)(VENCORD_DIR, "renderer.js"), "utf-8"));
    VESKTOP_RENDERER_JS_PATH = (0, import_node_path2.join)(__dirname, "renderer.js");
    VESKTOP_RENDERER_CSS_PATH = (0, import_node_path2.join)(__dirname, "renderer.css");
    handleSync("VCD_GET_RENDERER_SCRIPT" /* GET_VESKTOP_RENDERER_SCRIPT */, () => (0, import_node_fs2.readFileSync)(VESKTOP_RENDERER_JS_PATH, "utf-8"));
    handle("VCD_GET_RENDERER_CSS" /* GET_VESKTOP_RENDERER_CSS */, () => (0, import_promises5.readFile)(VESKTOP_RENDERER_CSS_PATH, "utf-8"));
    if (IS_DEV) {
      (0, import_node_fs2.watch)(VESKTOP_RENDERER_CSS_PATH, { persistent: false }, async () => {
        mainWin?.webContents.postMessage(
          "VCD_PRELOAD_RENDERER_CSS_UPDATE" /* VESKTOP_RENDERER_CSS_UPDATE */,
          await (0, import_promises5.readFile)(VESKTOP_RENDERER_CSS_PATH, "utf-8")
        );
      });
    }
    handleSync("VCD_GET_SETTINGS" /* GET_SETTINGS */, () => Settings.plain);
    handleSync("VCD_GET_VERSION" /* GET_VERSION */, () => import_electron21.app.getVersion());
    handleSync("VCD_GET_GIT_HASH" /* GET_GIT_HASH */, () => Midnightcord_GIT_HASH);
    handleSync("VCD_GET_ENABLE_HARDWARE_ACCELERATION" /* GET_ENABLE_HARDWARE_ACCELERATION */, () => enableHardwareAcceleration);
    handleSync(
      "VCD_SUPPORTS_WINDOWS_TRANSPARENCY" /* SUPPORTS_WINDOWS_TRANSPARENCY */,
      () => process.platform === "win32" && Number((0, import_node_os.release)().split(".").pop()) >= 22621
    );
    handleSync("VCD_AUTOSTART_ENABLED" /* AUTOSTART_ENABLED */, () => autoStart.isEnabled());
    handle("VCD_ENABLE_AUTOSTART" /* ENABLE_AUTOSTART */, autoStart.enable);
    handle("VCD_DISABLE_AUTOSTART" /* DISABLE_AUTOSTART */, autoStart.disable);
    handle("VCD_ARRPC_OPEN_SETTINGS" /* ARRPC_OPEN_SETTINGS */, () => {
      createArRPCWindow();
    });
    handleSync("VCD_GET_PLATFORM_SPOOF_INFO" /* GET_PLATFORM_SPOOF_INFO */, () => getPlatformSpoofInfo());
    handle("VCD_SET_SETTINGS" /* SET_SETTINGS */, (_, settings, path) => {
      Settings.setData(settings, path);
    });
    handle("VCD_RELAUNCH" /* RELAUNCH */, async () => {
      setBadgeCount(0);
      const options2 = {
        args: process.argv.slice(1).concat(["--relaunch"])
      };
      if (isDeckGameMode) {
        await showGamePage();
      } else if (import_electron21.app.isPackaged && process.env.APPIMAGE) {
        (0, import_node_child_process2.execFile)(process.env.APPIMAGE, options2.args);
      } else {
        import_electron21.app.relaunch(options2);
      }
      import_electron21.app.exit();
    });
    handle("MidnightcordRelaunchApp" /* RELAUNCH_APP */, async () => {
      setBadgeCount(0);
      if (isDeckGameMode) {
        await showGamePage();
        import_electron21.app.exit();
        return;
      }
      if (process.env.APPIMAGE) {
        (0, import_node_child_process2.execFile)(process.env.APPIMAGE, process.argv.slice(1));
        import_electron21.app.exit();
        return;
      }
      if (import_electron21.app.isPackaged && process.platform === "win32") {
        const { spawn: spawn2 } = await import("node:child_process");
        spawn2(process.execPath, [], {
          detached: true,
          stdio: "ignore"
        }).unref();
        import_electron21.app.exit(0);
        return;
      }
      const options2 = {
        args: process.argv.slice(1).concat(["--relaunch"])
      };
      import_electron21.app.relaunch(options2);
      import_electron21.app.exit();
    });
    handleSync("VCD_IS_USING_CUSTOM_VENCORD_DIR" /* IS_USING_CUSTOM_VENCORD_DIR */, () => !!State.store.MidnightcordDir);
    handle("VCD_SHOW_CUSTOM_VENCORD_DIR" /* SHOW_CUSTOM_VENCORD_DIR */, async () => {
      const { MidnightcordDir: MidnightcordDir2 } = State.store;
      if (!MidnightcordDir2) return;
      const stats = await (0, import_promises5.stat)(MidnightcordDir2);
      if (!stats.isDirectory()) return;
      import_electron21.shell.openPath(MidnightcordDir2);
    });
    handle("VCD_FOCUS" /* FOCUS */, () => {
      mainWin.show();
      mainWin.setSkipTaskbar(false);
    });
    handle("VCD_CLOSE" /* CLOSE */, (e, key) => {
      getWindow(e, key).close();
    });
    handle("VCD_MINIMIZE" /* MINIMIZE */, (e, key) => {
      getWindow(e, key).minimize();
    });
    handle("VCD_MAXIMIZE" /* MAXIMIZE */, (e, key) => {
      const win = getWindow(e, key);
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    });
    handleSync("VCD_SPELLCHECK_GET_AVAILABLE_LANGUAGES" /* SPELLCHECK_GET_AVAILABLE_LANGUAGES */, (e) => {
      e.returnValue = import_electron21.session.defaultSession.availableSpellCheckerLanguages;
    });
    handle("VCD_SPELLCHECK_REPLACE_MISSPELLING" /* SPELLCHECK_REPLACE_MISSPELLING */, (e, word) => {
      e.sender.replaceMisspelling(word);
    });
    handle("VCD_SPELLCHECK_ADD_TO_DICTIONARY" /* SPELLCHECK_ADD_TO_DICTIONARY */, (e, word) => {
      e.sender.session.addWordToSpellCheckerDictionary(word);
    });
    handle("VCD_SELECT_VENCORD_DIR" /* SELECT_VENCORD_DIR */, async (_e, value) => {
      if (value === null) {
        delete State.store.MidnightcordDir;
        return "ok";
      }
      const res = await import_electron21.dialog.showOpenDialog(mainWin, {
        properties: ["openDirectory"]
      });
      if (!res.filePaths.length) return "cancelled";
      const dir = res.filePaths[0];
      if (!isValidVencordInstall(dir)) return "invalid";
      State.store.MidnightcordDir = dir;
      return "ok";
    });
    handle("VCD_SET_BADGE_COUNT" /* SET_BADGE_COUNT */, (_, count) => setBadgeCount(count));
    handle("FLASH_FRAME" /* FLASH_FRAME */, (_, flag) => {
      if (!mainWin || mainWin.isDestroyed() || flag && mainWin.isFocused()) return;
      mainWin.flashFrame(flag);
    });
    handle("VCD_CLIPBOARD_COPY_IMAGE" /* CLIPBOARD_COPY_IMAGE */, async (_, buf, src) => {
      import_electron21.clipboard.write({
        html: `<img src="${src.replaceAll('"', '\\"')}">`,
        image: import_electron21.nativeImage.createFromBuffer(Buffer.from(buf))
      });
    });
    handle("VCD_DEBUG_LAUNCH_GPU" /* DEBUG_LAUNCH_GPU */, () => openDebugPage("chrome://gpu"));
    handle("VCD_DEBUG_LAUNCH_WEBRTC" /* DEBUG_LAUNCH_WEBRTC_INTERNALS */, () => openDebugPage("chrome://webrtc-internals"));
    quickCssWatcher = null;
    themesWatcher = null;
    (0, import_promises5.open)(VENCORD_QUICKCSS_FILE, "a+").then((fd2) => {
      fd2.close();
      quickCssWatcher = (0, import_node_fs2.watch)(
        VENCORD_QUICKCSS_FILE,
        { persistent: false },
        debounce2(async () => {
          mainWin?.webContents.postMessage("VencordQuickCssUpdate", await readCss());
        }, 50)
      );
    }).catch((err2) => {
      console.error("Failed to setup quickCss file watcher:", err2);
    });
    (0, import_node_fs2.mkdirSync)(VENCORD_THEMES_DIR, { recursive: true });
    themesWatcher = (0, import_node_fs2.watch)(
      VENCORD_THEMES_DIR,
      { persistent: false },
      debounce2(() => {
        mainWin?.webContents.postMessage("VencordThemeUpdate", void 0);
      })
    );
    import_electron21.app.on("quit", cleanupFileWatchers);
    handle("VCD_VOICE_STATE_CHANGED" /* VOICE_STATE_CHANGED */, (_, variant) => {
      AppEvents.emit("setTrayVariant", variant);
    });
    handle("VCD_VOICE_CALL_STATE_CHANGED" /* VOICE_CALL_STATE_CHANGED */, (_, inCall) => {
      AppEvents.emit("voiceCallStateChanged", inCall);
    });
  }
});

// src/midnightcord/main/userAssets.ts
async function resolveAssetPath(asset) {
  if (!CUSTOMIZABLE_ASSETS.includes(asset)) {
    throw new Error(`Invalid asset: ${asset}`);
  }
  const assetPath = (0, import_path20.join)(UserAssetFolder, asset);
  if (await fileExistsAsync(assetPath)) {
    return assetPath;
  }
  return (0, import_path20.join)(STATIC_DIR, DEFAULT_ASSETS[asset]);
}
async function handleVesktopAssetsProtocol(path, req) {
  const asset = path.slice(1);
  if (!CUSTOMIZABLE_ASSETS.includes(asset)) {
    return new Response(null, { status: 404 });
  }
  try {
    const res = await import_electron22.net.fetch((0, import_url2.pathToFileURL)((0, import_path20.join)(UserAssetFolder, asset)).href);
    if (res.ok) return res;
  } catch {
  }
  return import_electron22.net.fetch((0, import_url2.pathToFileURL)((0, import_path20.join)(STATIC_DIR, DEFAULT_ASSETS[asset])).href);
}
var import_electron22, import_promises6, import_path20, import_url2, CUSTOMIZABLE_ASSETS, DEFAULT_ASSETS, UserAssetFolder;
var init_userAssets = __esm({
  "src/midnightcord/main/userAssets.ts"() {
    "use strict";
    import_electron22 = require("electron");
    import_promises6 = require("fs/promises");
    import_path20 = require("path");
    init_IpcEvents2();
    init_paths();
    import_url2 = require("url");
    init_constants2();
    init_events();
    init_mainWindow();
    init_fileExists();
    init_ipcWrappers();
    CUSTOMIZABLE_ASSETS = [
      "splash",
      "tray",
      "trayUnread",
      "traySpeaking",
      "trayIdle",
      "trayMuted",
      "trayDeafened"
    ];
    DEFAULT_ASSETS = {
      splash: "tray.png",
      tray: process.platform === "darwin" ? "tray/trayTemplate.png" : "tray/tray.png",
      trayUnread: "tray/trayUnread.png",
      traySpeaking: "tray/speaking.png",
      trayIdle: "tray/idle.png",
      trayMuted: "tray/muted.png",
      trayDeafened: "tray/deafened.png"
    };
    UserAssetFolder = (0, import_path20.join)(DATA_DIR2, "userAssets");
    handle("VCD_CHOOSE_USER_ASSET" /* CHOOSE_USER_ASSET */, async (_event, asset, value) => {
      if (!CUSTOMIZABLE_ASSETS.includes(asset)) {
        throw `Invalid asset: ${asset}`;
      }
      const assetPath = (0, import_path20.join)(UserAssetFolder, asset);
      if (value === null) {
        try {
          await (0, import_promises6.rm)(assetPath, { force: true });
          AppEvents.emit("userAssetChanged", asset);
          return "ok";
        } catch (e) {
          console.error(`Failed to remove user asset ${asset}:`, e);
          return "failed";
        }
      }
      const res = await import_electron22.dialog.showOpenDialog(mainWin, {
        properties: ["openFile"],
        title: `Select an image to use as ${asset}`,
        defaultPath: import_electron22.app.getPath("pictures"),
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"]
          }
        ]
      });
      if (res.canceled || !res.filePaths.length) return "cancelled";
      try {
        await (0, import_promises6.mkdir)(UserAssetFolder, { recursive: true });
        await (0, import_promises6.copyFile)(res.filePaths[0], assetPath);
        AppEvents.emit("userAssetChanged", asset);
        return "ok";
      } catch (e) {
        console.error(`Failed to copy user asset ${asset}:`, e);
        return "failed";
      }
    });
  }
});

// src/midnightcord/main/vesktopProtocol.ts
var import_electron23;
var init_vesktopProtocol = __esm({
  "src/midnightcord/main/vesktopProtocol.ts"() {
    "use strict";
    import_electron23 = require("electron");
    init_userAssets();
    init_vesktopStatic();
    import_electron23.app.whenReady().then(() => {
      import_electron23.protocol.handle("midnightcord", async (req) => {
        const url = new URL(req.url);
        switch (url.hostname) {
          case "assets":
            return handleVesktopAssetsProtocol(url.pathname, req);
          case "static":
            return handleVesktopStaticProtocol(url.pathname, req);
          default:
            return new Response(null, { status: 404 });
        }
      });
    });
  }
});

// src/midnightcord/main/firstLaunch.ts
function createFirstLaunchTour() {
  const win = new import_main.BrowserWindow({
    ...SplashProps,
    transparent: false,
    frame: true,
    autoHideMenuBar: true,
    ...process.platform === "win32" ? { icon: (0, import_path21.join)(STATIC_DIR, "icon.ico") } : process.platform === "linux" ? { icon: (0, import_path21.join)(STATIC_DIR, "icon.png") } : {},
    height: 550,
    width: 600
  });
  makeLinksOpenExternally(win);
  loadView(win, "first-launch.html");
  win.webContents.addListener("console-message", (_e, _l, msg) => {
    if (msg === "cancel") return import_electron24.app.exit();
    if (!msg.startsWith("form:")) return;
    const data = JSON.parse(msg.slice(5));
    State.store.firstLaunch = false;
    Settings.store.discordBranch = data.discordBranch;
    Settings.store.minimizeToTray = !!data.minimizeToTray;
    Settings.store.arRPC = !!data.richPresence;
    if (data.autoStart) autoStart.enable();
    if (data.importSettings) {
      const from = (0, import_path21.join)(import_electron24.app.getPath("userData"), "..", "Vencord", "settings");
      const to = (0, import_path21.join)(DATA_DIR2, "settings");
      try {
        const files = (0, import_fs7.readdirSync)(from);
        (0, import_fs7.mkdirSync)(to, { recursive: true });
        for (const file of files) {
          (0, import_fs7.copyFileSync)((0, import_path21.join)(from, file), (0, import_path21.join)(to, file));
        }
      } catch (e) {
        if (e instanceof Error && "code" in e && e.code === "ENOENT") {
          console.log("No Vencord settings found to import.");
        } else {
          console.error("Failed to import Vencord settings:", e);
        }
      }
    }
    win.close();
    createWindows();
  });
}
var import_electron24, import_main, import_fs7, import_path21;
var init_firstLaunch = __esm({
  "src/midnightcord/main/firstLaunch.ts"() {
    "use strict";
    import_electron24 = require("electron");
    import_main = require("electron/main");
    import_fs7 = require("fs");
    import_path21 = require("path");
    init_browserWinProperties();
    init_paths();
    init_autoStart();
    init_constants2();
    init_mainWindow();
    init_settings2();
    init_makeLinksOpenExternally();
    init_vesktopStatic();
  }
});

// src/midnightcord/main/mediaPermissions.ts
function registerMediaPermissionsForSession(ses) {
  ses.setPermissionCheckHandler((_webContents, permission, _requestingOrigin, details) => {
    if (permission === "media") {
      return true;
    }
    return true;
  });
  ses.setPermissionRequestHandler(async (_webContents, permission, callback, details) => {
    if (permission === "media") {
      let granted = true;
      if (process.platform === "darwin" && "mediaTypes" in details) {
        if (details.mediaTypes?.includes("audio")) {
          granted &&= await import_electron25.systemPreferences.askForMediaAccess("microphone");
        }
        if (details.mediaTypes?.includes("video")) {
          granted &&= await import_electron25.systemPreferences.askForMediaAccess("camera");
        }
      }
      return callback(granted);
    }
    callback(true);
  });
}
function registerMediaPermissionsHandler() {
  registerMediaPermissionsForSession(import_electron25.session.defaultSession);
}
var import_electron25;
var init_mediaPermissions = __esm({
  "src/midnightcord/main/mediaPermissions.ts"() {
    "use strict";
    import_electron25 = require("electron");
  }
});

// src/midnightcord/main/screenShare.ts
function registerScreenShareHandler() {
  handle("VCD_CAPTURER_GET_LARGE_THUMBNAIL" /* CAPTURER_GET_LARGE_THUMBNAIL */, async (_, id) => {
    const sources = await import_electron26.desktopCapturer.getSources({
      types: ["window", "screen"],
      thumbnailSize: {
        width: 1920,
        height: 1080
      }
    });
    return sources.find((s) => s.id === id)?.thumbnail.toDataURL();
  });
  let capturerReady = false;
  async function warmUpCapturer() {
    if (capturerReady) return;
    try {
      await import_electron26.desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } });
      capturerReady = true;
    } catch {
    }
  }
  warmUpCapturer();
  import_electron26.session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!capturerReady) {
      await warmUpCapturer().catch(() => {
      });
      await new Promise((r) => setTimeout(r, 300));
    }
    const width = isWayland ? 1920 : 176;
    let sources;
    for (let attempt = 0; attempt < 2; attempt++) {
      sources = await import_electron26.desktopCapturer.getSources({
        types: ["window", "screen"],
        thumbnailSize: {
          width,
          height: width * (9 / 16)
        }
      }).catch((err2) => {
        console.error(`Error during screenshare picker (attempt ${attempt + 1})`, err2);
        return void 0;
      });
      if (sources) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!sources) return callback({});
    const data = sources.map(({ id, name, thumbnail }) => ({
      id,
      name,
      url: thumbnail.toDataURL()
    }));
    if (isWayland) {
      const video = data[0];
      if (video) {
        const stream = await sendRendererCommand("screenshare:picker" /* SCREEN_SHARE_PICKER */, {
          screens: [video],
          skipPicker: true
        }).catch(() => null);
        if (stream === null) return callback({});
      }
      callback(video ? { video: sources[0] } : {});
      return;
    }
    const choice = await sendRendererCommand("screenshare:picker" /* SCREEN_SHARE_PICKER */, {
      screens: data,
      skipPicker: false
    }).catch((e) => {
      console.error("Error during screenshare picker", e);
      return null;
    });
    if (!choice) return callback({});
    const source = sources.find((s) => s.id === choice.id);
    if (!source) return callback({});
    const streams = {
      video: source
    };
    if (choice.audio && getPlatformSpoofInfo().originalPlatform === "win32") streams.audio = "loopback";
    callback(streams);
  });
}
var import_electron26;
var init_screenShare = __esm({
  "src/midnightcord/main/screenShare.ts"() {
    "use strict";
    import_electron26 = require("electron");
    init_IpcEvents2();
    init_constants2();
    init_gnuSpoofing();
    init_ipcCommands();
    init_ipcWrappers();
  }
});

// src/midnightcord/main/utils/setAsDefaultProtocolClient.ts
async function setAsDefaultProtocolClient(protocol3) {
  if (process.platform !== "linux") {
    return import_electron27.app.setAsDefaultProtocolClient(protocol3);
  }
  const { CHROME_DESKTOP } = process.env;
  if (!CHROME_DESKTOP) return false;
  return new Promise((resolve2) => {
    (0, import_child_process3.execFile)("xdg-mime", ["default", CHROME_DESKTOP, `x-scheme-handler/${protocol3}`], (err2) => {
      resolve2(err2 == null);
    });
  });
}
var import_child_process3, import_electron27;
var init_setAsDefaultProtocolClient = __esm({
  "src/midnightcord/main/utils/setAsDefaultProtocolClient.ts"() {
    "use strict";
    import_child_process3 = require("child_process");
    import_electron27 = require("electron");
  }
});

// src/midnightcord/main/startup.ts
function init() {
  setAsDefaultProtocolClient("discord");
  const { disableSmoothScroll, hardwareAcceleration, hardwareVideoAcceleration } = Settings.store;
  const { launchArguments } = State.store;
  const enabledFeatures = new Set(import_electron28.app.commandLine.getSwitchValue("enable-features").split(","));
  const disabledFeatures = new Set(import_electron28.app.commandLine.getSwitchValue("disable-features").split(","));
  import_electron28.app.commandLine.removeSwitch("enable-features");
  import_electron28.app.commandLine.removeSwitch("disable-features");
  if (hardwareAcceleration === false || process.argv.includes("--disable-gpu")) {
    enableHardwareAcceleration = false;
    import_electron28.app.disableHardwareAcceleration();
  } else {
    if (hardwareVideoAcceleration) {
      enabledFeatures.add("AcceleratedVideoEncoder");
      enabledFeatures.add("AcceleratedVideoDecoder");
      if (isLinux) {
        enabledFeatures.add("AcceleratedVideoDecodeLinuxGL");
        enabledFeatures.add("AcceleratedVideoDecodeLinuxZeroCopyGL");
      }
    }
  }
  if (disableSmoothScroll) {
    import_electron28.app.commandLine.appendSwitch("disable-smooth-scrolling");
  }
  import_electron28.app.commandLine.appendSwitch("disable-renderer-backgrounding");
  import_electron28.app.commandLine.appendSwitch("disable-background-timer-throttling");
  import_electron28.app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
  if (process.platform === "win32") {
    disabledFeatures.add("CalculateNativeWinOcclusion");
  }
  if (launchArguments) {
    const args2 = launchArguments.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    for (const arg of args2) {
      const cleanArg = arg.replace(/^["']|["']$/g, "");
      if (cleanArg.startsWith("--")) {
        const eqIndex = cleanArg.indexOf("=");
        if (eqIndex !== -1) {
          const key = cleanArg.slice(2, eqIndex);
          const value = cleanArg.slice(eqIndex + 1);
          import_electron28.app.commandLine.appendSwitch(key, value);
        } else {
          import_electron28.app.commandLine.appendSwitch(cleanArg.slice(2));
        }
      }
    }
    console.log("Applied launch arguments:", launchArguments);
  }
  import_electron28.app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
  disabledFeatures.add("WinRetrieveSuggestionsOnlyOnDemand");
  disabledFeatures.add("HardwareMediaKeyHandling");
  disabledFeatures.add("MediaSessionService");
  if (isLinux) {
    import_electron28.app.commandLine.appendSwitch("enable-speech-dispatcher");
    import_electron28.app.commandLine.appendSwitch("log-level", "3");
  }
  disabledFeatures.forEach((feat) => enabledFeatures.delete(feat));
  const enabledFeaturesArray = [...enabledFeatures].filter(Boolean);
  const disabledFeaturesArray = [...disabledFeatures].filter(Boolean);
  if (enabledFeaturesArray.length) {
    import_electron28.app.commandLine.appendSwitch("enable-features", enabledFeaturesArray.join(","));
    console.log("Enabled Chromium features:", enabledFeaturesArray.join(", "));
  }
  if (disabledFeaturesArray.length) {
    import_electron28.app.commandLine.appendSwitch("disable-features", disabledFeaturesArray.join(","));
    console.log("Disabled Chromium features:", disabledFeaturesArray.join(", "));
  }
  if (isDeckGameMode) import_electron28.nativeTheme.themeSource = "dark";
  import_electron28.app.whenReady().then(async () => {
    if (process.platform === "win32") {
      const discordBranch = Settings.store.discordBranch ?? "stable";
      const aumidMap = {
        stable: "com.squirrel.Discord.Discord",
        canary: "com.squirrel.DiscordCanary.DiscordCanary",
        ptb: "com.squirrel.DiscordPTB.DiscordPTB"
      };
      const aumid = aumidMap[discordBranch] ?? "com.squirrel.Discord.Discord";
      import_electron28.app.setAppUserModelId(aumid);
    }
    registerScreenShareHandler();
    registerMediaPermissionsHandler();
    bootstrap();
    import_electron28.app.on("activate", () => {
      if (import_electron28.BrowserWindow.getAllWindows().length === 0) createWindows();
    });
  });
}
async function bootstrap() {
  if (!Object.hasOwn(State.store, "firstLaunch")) {
    createFirstLaunchTour();
  } else {
    createWindows();
  }
}
var import_electron28, isLinux, enableHardwareAcceleration, darwinURL;
var init_startup = __esm({
  "src/midnightcord/main/startup.ts"() {
    "use strict";
    init_updater();
    init_ipc();
    init_userAssets();
    init_vesktopProtocol();
    import_electron28 = require("electron");
    init_constants2();
    init_firstLaunch();
    init_mainWindow();
    init_mediaPermissions();
    init_screenShare();
    init_settings2();
    init_setAsDefaultProtocolClient();
    init_steamOS();
    console.log("Midnightcord v" + import_electron28.app.getVersion());
    process.env.Midnightcord_USER_DATA_DIR = DATA_DIR2;
    isLinux = process.platform === "linux";
    enableHardwareAcceleration = true;
    init();
    import_electron28.app.on("open-url", (_, url) => {
      darwinURL = url;
    });
    import_electron28.app.on("window-all-closed", () => {
      if (process.platform !== "darwin") import_electron28.app.quit();
    });
  }
});

// src/midnightcord/main/arguments.ts
function createArgumentsWindow() {
  if (argumentsWindow && !argumentsWindow.isDestroyed()) {
    argumentsWindow.focus();
    return argumentsWindow;
  }
  argumentsWindow = new import_electron29.BrowserWindow({
    center: true,
    autoHideMenuBar: true,
    ...process.platform === "win32" ? { icon: (0, import_path22.join)(STATIC_DIR, "icon.ico") } : process.platform === "linux" ? { icon: (0, import_path22.join)(STATIC_DIR, "icon.png") } : {},
    height: 300,
    width: 500,
    resizable: false
  });
  makeLinksOpenExternally(argumentsWindow);
  const data = new URLSearchParams({
    CURRENT_ARGS: State.store.launchArguments ?? ""
  });
  loadView(argumentsWindow, "arguments.html", data);
  argumentsWindow.webContents.addListener("console-message", (_e, _l, msg) => {
    if (msg === "close") {
      argumentsWindow?.close();
      return;
    }
    if (!msg.startsWith("save:")) return;
    const args2 = msg.slice(5);
    State.store.launchArguments = args2 || void 0;
    argumentsWindow?.close();
  });
  argumentsWindow.on("closed", () => {
    argumentsWindow = null;
  });
  return argumentsWindow;
}
var import_electron29, import_path22, argumentsWindow;
var init_arguments = __esm({
  "src/midnightcord/main/arguments.ts"() {
    "use strict";
    import_electron29 = require("electron");
    import_path22 = require("path");
    init_paths();
    init_settings2();
    init_makeLinksOpenExternally();
    init_vesktopStatic();
    argumentsWindow = null;
  }
});

// src/midnightcord/main/utils/clearData.ts
async function clearData(win) {
  const { response } = await import_electron30.dialog.showMessageBox(win, {
    message: "Are you sure you want to reset Midnightcord?",
    detail: "This will log you out, clear caches and reset all your settings!\n\nMidnightcord will automatically restart after this operation.",
    buttons: ["Yes", "No"],
    cancelId: 1 /* Cancel */,
    defaultId: 0 /* Default */,
    type: "warning"
  });
  if (response === 1 /* Cancel */) return;
  win.close();
  await win.webContents.session.clearStorageData();
  await win.webContents.session.clearCache();
  await win.webContents.session.clearCodeCaches({});
  await (0, import_promises7.rm)(DATA_DIR2, { force: true, recursive: true });
  import_electron30.app.relaunch();
  import_electron30.app.quit();
}
var import_electron30, import_promises7;
var init_clearData = __esm({
  "src/midnightcord/main/utils/clearData.ts"() {
    "use strict";
    import_electron30 = require("electron");
    import_promises7 = require("fs/promises");
    init_constants2();
  }
});

// src/midnightcord/main/tray.ts
async function getCachedTrayImage(variant) {
  const path = await resolveAssetPath(variant);
  const cached = trayImageCache.get(path);
  if (cached) return cached;
  const image = import_electron31.nativeImage.createFromPath(path);
  const resized = image.resize({ width: 32, height: 32 });
  trayImageCache.set(path, resized);
  return resized;
}
function nativeImageToPixmap(image) {
  return new Promise((resolve2) => {
    setImmediate(() => {
      const { width, height } = image.getSize();
      const bitmap = image.toBitmap();
      const pixmapSize = 8 + bitmap.length;
      const pixmap = Buffer.allocUnsafe(pixmapSize);
      pixmap.writeUInt32LE(width, 0);
      pixmap.writeUInt32LE(height, 4);
      for (let i2 = 0; i2 < bitmap.length; i2 += 4) {
        const r = bitmap[i2];
        const g = bitmap[i2 + 1];
        const b = bitmap[i2 + 2];
        const a = bitmap[i2 + 3];
        const alpha = a / 255;
        const premultR = Math.round(r * alpha);
        const premultG = Math.round(g * alpha);
        const premultB = Math.round(b * alpha);
        pixmap[8 + i2] = a;
        pixmap[8 + i2 + 1] = premultB;
        pixmap[8 + i2 + 2] = premultG;
        pixmap[8 + i2 + 3] = premultR;
      }
      resolve2(pixmap);
    });
  });
}
async function getCachedTrayPixmap(variant) {
  const path = await resolveAssetPath(variant);
  const cached = trayPixmapCache.get(path);
  if (cached) return cached;
  const image = await getCachedTrayImage(variant);
  const pixmap = await nativeImageToPixmap(image);
  trayPixmapCache.set(path, pixmap);
  return pixmap;
}
async function updateTrayIconNative(variant) {
  if (trayVariant === variant) return;
  trayVariant = variant;
  try {
    if (useNativeTray && nativeSNI) {
      const pixmap = await getCachedTrayPixmap(variant);
      nativeSNI.setStatusNotifierIcon(pixmap);
    }
  } catch (e) {
    console.error("[Tray] Failed to update native tray icon:", e);
  }
}
async function updateTrayIconElectron(variant) {
  if (!tray || trayVariant === variant) return;
  trayVariant = variant;
  try {
    const image = await getCachedTrayImage(trayVariant);
    tray.setImage(image);
  } catch (e) {
    console.error("[Tray] Failed to update Electron tray icon:", e);
  }
}
function destroyTray() {
  AppEvents.off("userAssetChanged", userAssetChangedListener);
  AppEvents.off("setTrayVariant", setTrayVariantListener);
  if (useNativeTray && nativeSNI) {
    try {
      if (nativeTrayWindow && nativeTrayUpdateCallback) {
        nativeTrayWindow.off("show", nativeTrayUpdateCallback);
        nativeTrayWindow.off("hide", nativeTrayUpdateCallback);
        nativeTrayWindow = null;
        nativeTrayUpdateCallback = null;
      }
      nativeSNI.destroyStatusNotifierItem();
      nativeTrayInitialized = false;
    } catch (e) {
      console.error("[Tray] Failed to destroy native StatusNotifierItem:", e);
    }
  }
  if (tray) {
    try {
      if (onTrayClick) {
        tray.removeListener("click", onTrayClick);
        onTrayClick = null;
      }
      tray.destroy();
    } catch (e) {
      console.error("[Tray] Failed to destroy Electron tray:", e);
    }
    tray = null;
  }
  trayImageCache.clear();
  trayPixmapCache.clear();
  useNativeTray = false;
}
async function initTray(win, setIsQuitting) {
  if (tray || nativeTrayInitialized) {
    try {
      destroyTray();
    } catch (e) {
      console.error("[Tray] Failed to destroy existing tray during init:", e);
    }
  }
  if (isLinux2 && nativeSNI) {
    try {
      const success = nativeSNI.initStatusNotifierItem();
      if (success) {
        useNativeTray = true;
        nativeTrayInitialized = true;
        const pixmap = await getCachedTrayPixmap(trayVariant);
        nativeSNI.setStatusNotifierIcon(pixmap);
        nativeSNI.setStatusNotifierTitle("Midnightcord");
        const menuItems = [
          { id: 1, label: win.isVisible() ? "Hide" : "Open", enabled: true, visible: true },
          { id: 2, label: "About", enabled: true, visible: true },
          { id: 3, label: "Repair Midnightcord", enabled: true, visible: true },
          { id: 4, label: "Reset Midnightcord", enabled: true, visible: true },
          { id: 5, label: "Launch Arguments", enabled: true, visible: true },
          {
            id: 6,
            label: "Restart arRPC",
            enabled: true,
            visible: Settings.store.arRPC === true
          },
          { id: 7, type: "separator", enabled: true, visible: true },
          { id: 8, label: "Restart", enabled: true, visible: true },
          { id: 9, label: "Quit", enabled: true, visible: true }
        ];
        const menuResult = nativeSNI.setStatusNotifierMenu(menuItems);
        nativeTrayWindow = win;
        nativeTrayUpdateCallback = () => {
          try {
            nativeSNI.updateStatusNotifierMenuItem(1, win.isVisible() ? "Hide" : "Open");
          } catch (e) {
            console.error("[Tray] Failed to update native menu item:", e);
          }
        };
        win.on("show", nativeTrayUpdateCallback);
        win.on("hide", nativeTrayUpdateCallback);
        nativeSNI.setStatusNotifierMenuClickCallback((id) => {
          switch (id) {
            case 1:
              if (win.isVisible()) win.hide();
              else win.show();
              break;
            case 2:
              createAboutWindow();
              break;
            case 3:
              downloadVencordAsar().then(() => {
                setTimeout(() => {
                  destroyTray();
                  import_electron31.app.relaunch();
                  import_electron31.app.quit();
                }, 0);
              });
              break;
            case 4:
              clearData(win);
              break;
            case 5:
              createArgumentsWindow();
              break;
            case 6:
              restartArRPC();
              break;
            case 8:
              setTimeout(() => {
                destroyTray();
                import_electron31.app.relaunch();
                import_electron31.app.quit();
              }, 0);
              break;
            case 9:
              setIsQuitting(true);
              import_electron31.app.quit();
              break;
          }
        });
        nativeSNI.setStatusNotifierActivateCallback(() => {
          if (Settings.store.clickTrayToShowHide && win.isVisible()) win.hide();
          else win.show();
        });
        return;
      }
    } catch (e) {
      console.warn("[Tray] Failed to initialize native StatusNotifierItem, falling back to Electron Tray:", e);
    }
  }
  useNativeTray = false;
  onTrayClick = () => {
    if (Settings.store.clickTrayToShowHide && win.isVisible()) win.hide();
    else win.show();
  };
  const trayMenu = import_electron31.Menu.buildFromTemplate([
    {
      label: "Open",
      click() {
        win.show();
      }
    },
    {
      label: "About",
      click: createAboutWindow
    },
    {
      label: "Repair Midnightcord",
      async click() {
        await downloadVencordAsar();
        destroyTray();
        import_electron31.app.relaunch();
        import_electron31.app.quit();
      }
    },
    {
      label: "Reset Midnightcord",
      async click() {
        await clearData(win);
      }
    },
    {
      label: "Launch Arguments",
      click: createArgumentsWindow
    },
    {
      label: "Restart arRPC",
      visible: Settings.store.arRPC === true,
      async click() {
        await restartArRPC();
      }
    },
    {
      type: "separator"
    },
    {
      label: "Restart",
      click() {
        destroyTray();
        import_electron31.app.relaunch();
        import_electron31.app.quit();
      }
    },
    {
      label: "Quit",
      click() {
        setIsQuitting(true);
        import_electron31.app.quit();
      }
    }
  ]);
  try {
    const initialImage = await getCachedTrayImage(trayVariant);
    tray = new import_electron31.Tray(initialImage);
    tray.setToolTip("Midnightcord");
    if (isLinux2) {
      tray.on("click", onTrayClick);
      tray.on("right-click", () => {
        tray.popUpContextMenu(trayMenu);
      });
    } else {
      tray.setContextMenu(trayMenu);
      tray.on("click", onTrayClick);
    }
  } catch (e) {
    console.error("[Tray] Failed to initialize Electron tray:", e);
    tray = null;
  }
}
var import_electron31, import_path23, isLinux2, nativeSNI, tray, trayVariant, onTrayClick, nativeTrayWindow, nativeTrayUpdateCallback, trayImageCache, trayPixmapCache, useNativeTray, nativeTrayInitialized, userAssetChangedListener, setTrayVariantListener;
var init_tray = __esm({
  "src/midnightcord/main/tray.ts"() {
    "use strict";
    import_electron31 = require("electron");
    import_path23 = require("path");
    init_paths();
    init_about();
    init_arguments();
    init_arrpc();
    init_events();
    init_settings2();
    init_userAssets();
    init_clearData();
    init_vencordLoader();
    isLinux2 = process.platform === "linux";
    nativeSNI = null;
    if (isLinux2) {
      try {
        nativeSNI = require((0, import_path23.join)(STATIC_DIR, `dist/libvesktop-${process.arch}.node`));
      } catch (e) {
        console.warn("[Tray] Failed to load native StatusNotifierItem, falling back to Electron Tray:", e);
      }
    }
    tray = null;
    trayVariant = "tray";
    onTrayClick = null;
    nativeTrayWindow = null;
    nativeTrayUpdateCallback = null;
    trayImageCache = /* @__PURE__ */ new Map();
    trayPixmapCache = /* @__PURE__ */ new Map();
    useNativeTray = false;
    nativeTrayInitialized = false;
    userAssetChangedListener = async (asset) => {
      if (!asset.startsWith("tray")) return;
      try {
        if (useNativeTray && nativeSNI) {
          trayImageCache.clear();
          trayPixmapCache.clear();
          const pixmap = await getCachedTrayPixmap(trayVariant);
          nativeSNI.setStatusNotifierIcon(pixmap);
        } else if (tray) {
          trayImageCache.clear();
          trayPixmapCache.clear();
          const image = await getCachedTrayImage(trayVariant);
          tray.setImage(image);
        }
      } catch (e) {
        console.error("[Tray] Failed to update tray icon on asset change:", e);
      }
    };
    setTrayVariantListener = (variant) => {
      if (useNativeTray) {
        updateTrayIconNative(variant);
      } else {
        updateTrayIconElectron(variant);
      }
    };
    if (!AppEvents.listeners("userAssetChanged").includes(userAssetChangedListener)) {
      AppEvents.on("userAssetChanged", userAssetChangedListener);
    }
    if (!AppEvents.listeners("setTrayVariant").includes(setTrayVariantListener)) {
      AppEvents.on("setTrayVariant", setTrayVariantListener);
    }
  }
});

// src/midnightcord/main/mainWindow.ts
var mainWindow_exports = {};
__export(mainWindow_exports, {
  createWindows: () => createWindows,
  loadUrl: () => loadUrl,
  mainWin: () => mainWin
});
function makeSettingsListenerHelpers(o) {
  const listeners = /* @__PURE__ */ new Map();
  const addListener = (path, cb) => {
    listeners.set(cb, path);
    o.addChangeListener(path, cb);
  };
  const removeAllListeners = () => {
    for (const [listener, path] of listeners) {
      o.removeChangeListener(path, listener);
    }
    listeners.clear();
  };
  return [addListener, removeAllListeners];
}
function initMenuBar(win) {
  const isWindows = process.platform === "win32";
  const isDarwin = process.platform === "darwin";
  const wantCtrlQ = !isWindows || VencordSettings.store.winCtrlQ;
  const subMenu = [
    {
      label: "About Midnightcord",
      click: createAboutWindow
    },
    {
      label: "Force Update Midnightcord",
      async click() {
        await downloadVencordAsar();
        destroyTray();
        import_electron32.app.relaunch();
        import_electron32.app.quit();
      },
      toolTip: "Midnightcord will automatically restart after this operation"
    },
    {
      label: "Reset Midnightcord",
      async click() {
        await clearData(win);
      },
      toolTip: "Midnightcord will automatically restart after this operation"
    },
    {
      label: "Relaunch",
      accelerator: "CmdOrCtrl+Shift+R",
      click() {
        destroyTray();
        import_electron32.app.relaunch();
        import_electron32.app.quit();
      }
    },
    ...!isDarwin ? [] : [
      {
        type: "separator"
      },
      {
        label: "Settings",
        accelerator: "CmdOrCtrl+,",
        async click() {
          sendRendererCommand("navigate:settings" /* NAVIGATE_SETTINGS */);
        }
      },
      {
        type: "separator"
      },
      {
        role: "hide"
      },
      {
        role: "hideOthers"
      },
      {
        role: "unhide"
      },
      {
        type: "separator"
      }
    ],
    {
      label: "Quit",
      accelerator: wantCtrlQ ? "CmdOrCtrl+Q" : void 0,
      visible: !isWindows,
      role: "quit",
      click() {
        import_electron32.app.quit();
      }
    },
    isWindows && {
      label: "Quit",
      accelerator: "Alt+F4",
      role: "quit",
      click() {
        import_electron32.app.quit();
      }
    },
    // See https://github.com/electron/electron/issues/14742 and https://github.com/electron/electron/issues/5256
    {
      label: "Zoom in (hidden, hack for Qwertz and others)",
      accelerator: "CmdOrCtrl+=",
      role: "zoomIn",
      visible: false
    }
  ];
  const menuItems = [
    {
      label: "Midnightcord",
      role: "appMenu",
      submenu: subMenu.filter(isTruthy)
    },
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    isDarwin && { role: "windowMenu" }
  ];
  const menu = import_electron32.Menu.buildFromTemplate(menuItems.filter(isTruthy));
  import_electron32.Menu.setApplicationMenu(menu);
}
function initWindowBoundsListeners(win) {
  const saveState = () => {
    State.store.maximized = win.isMaximized();
    State.store.minimized = win.isMinimized();
  };
  win.on("maximize", saveState);
  win.on("minimize", saveState);
  win.on("unmaximize", saveState);
  const saveBounds = () => {
    State.store.windowBounds = win.getBounds();
  };
  win.on("resize", saveBounds);
  win.on("move", saveBounds);
}
function initSettingsListeners(win) {
  addSettingsListener("tray", (enable) => {
    if (enable) initTray(win, (q) => isQuitting = q);
    else destroyTray();
  });
  addSettingsListener("disableMinSize", (disable) => {
    if (disable) {
      win.setMinimumSize(1, 1);
    } else {
      win.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);
      const { width, height } = win.getBounds();
      win.setBounds({
        width: Math.max(width, MIN_WIDTH),
        height: Math.max(height, MIN_HEIGHT)
      });
    }
  });
  addVencordSettingsListener("macosTranslucency", (enabled) => {
    if (enabled) {
      win.setVibrancy("sidebar");
      win.setBackgroundColor("#ffffff00");
    } else {
      win.setVibrancy(null);
      win.setBackgroundColor("#ffffff");
    }
  });
  addSettingsListener("enableMenu", (enabled) => {
    win.setAutoHideMenuBar(enabled ?? false);
  });
  addSettingsListener("spellCheckLanguages", (languages) => initSpellCheckLanguages(win, languages));
}
async function initSpellCheckLanguages(_win, languages) {
  languages ??= await sendRendererCommand("navigator.languages" /* GET_LANGUAGES */);
  if (!languages) return;
  const ses = import_electron32.session.defaultSession;
  const available = ses.availableSpellCheckerLanguages;
  const applicable = languages.filter((l) => available.includes(l)).slice(0, 5);
  if (applicable.length) ses.setSpellCheckerLanguages(applicable);
}
function initSpellCheck(win) {
  win.webContents.on("context-menu", (_, data) => {
    win.webContents.send("VCD_SPELLCHECK_RESULT" /* SPELLCHECK_RESULT */, data.misspelledWord, data.dictionarySuggestions);
  });
  initSpellCheckLanguages(win, Settings.store.spellCheckLanguages);
}
function initDevtoolsListeners(win) {
  win.webContents.on("devtools-opened", () => {
    win.webContents.send("VCD_DEVTOOLS_OPENED" /* DEVTOOLS_OPENED */);
  });
  win.webContents.on("devtools-closed", () => {
    win.webContents.send("VCD_DEVTOOLS_CLOSED" /* DEVTOOLS_CLOSED */);
  });
}
function initStaticTitle(win) {
  const listener = (e) => e.preventDefault();
  if (Settings.store.staticTitle) win.on("page-title-updated", listener);
  addSettingsListener("staticTitle", (enabled) => {
    if (enabled) {
      win.setTitle("Midnightcord");
      win.on("page-title-updated", listener);
    } else {
      win.off("page-title-updated", listener);
    }
  });
}
function getWindowBoundsOptions() {
  addSplashLog();
  if (isDeckGameMode) return {};
  const { x: x2, y, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = State.store.windowBounds ?? {};
  const options2 = { width, height };
  if (x2 != null && y != null) {
    let isInBounds2 = function(rect, display) {
      return !(rect.x + rect.width < display.x || rect.x > display.x + display.width || rect.y + rect.height < display.y || rect.y > display.y + display.height);
    };
    var isInBounds = isInBounds2;
    const inBounds = import_electron32.screen.getAllDisplays().some((d) => isInBounds2({ x: x2, y, width, height }, d.bounds));
    if (inBounds) {
      options2.x = x2;
      options2.y = y;
    }
  }
  if (!Settings.store.disableMinSize) {
    options2.minWidth = MIN_WIDTH;
    options2.minHeight = MIN_HEIGHT;
  }
  return options2;
}
function buildBrowserWindowOptions() {
  addSplashLog();
  const { staticTitle, transparencyOption, enableMenu, customTitleBar, splashTheming, splashBackground } = Settings.store;
  const { frameless, transparent, macosVibrancyStyle } = VencordSettings.store;
  const noFrame = frameless === true || customTitleBar === true;
  const backgroundColor = splashTheming !== false ? splashBackground : import_electron32.nativeTheme.shouldUseDarkColors ? "#313338" : "#ffffff";
  const options2 = {
    show: Settings.store.enableSplashScreen === false && !CommandLine.values["start-minimized"],
    backgroundColor,
    ...process.platform === "win32" ? { icon: (0, import_node_path3.join)(STATIC_DIR, "icon.ico") } : process.platform === "linux" ? { icon: (0, import_node_path3.join)(STATIC_DIR, "icon.png") } : {},
    webPreferences: {
      nodeIntegration: false,
      sandbox: true,
      contextIsolation: true,
      devTools: true,
      preload: (0, import_node_path3.join)(__dirname, "preload.js"),
      spellcheck: true,
      ...Settings.store.middleClickAutoscroll && {
        enableBlinkFeatures: "MiddleClickAutoscroll"
      },
      // disable renderer backgrounding to prevent the app from unloading when in the background
      backgroundThrottling: false
    },
    ...noFrame && process.platform !== "darwin" ? { frame: false, titleBarStyle: "hidden" } : { frame: !noFrame },
    autoHideMenuBar: enableMenu,
    ...getWindowBoundsOptions()
  };
  if (transparent) {
    options2.transparent = true;
    options2.backgroundColor = "#00000000";
  }
  if (transparencyOption && transparencyOption !== "none") {
    options2.backgroundColor = "#00000000";
    options2.backgroundMaterial = transparencyOption;
    if (customTitleBar) {
      options2.transparent = true;
    }
  }
  if (staticTitle) {
    options2.title = "Midnightcord";
  }
  if (process.platform === "darwin") {
    options2.titleBarStyle = "hidden";
    options2.trafficLightPosition = { x: 10, y: 10 };
    if (macosVibrancyStyle) {
      options2.vibrancy = macosVibrancyStyle;
      options2.backgroundColor = "#00000000";
    }
  }
  return options2;
}
function safeMaximizeLater(win, delayMs = 2500) {
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isMaximized()) {
      win.maximize();
    }
  }, delayMs);
}
function createMainWindow() {
  removeSettingsListeners();
  removeVencordSettingsListeners();
  const win = mainWin = new import_electron32.BrowserWindow(buildBrowserWindowOptions());
  win.webContents.setMaxListeners(15);
  win.setMenuBarVisibility(false);
  addSplashLog();
  if (process.platform === "darwin" && Settings.store.customTitleBar) win.setWindowButtonVisibility(false);
  if (process.platform !== "win32" && CommandLine.values["windows-spoof"]) {
    spoofGnu(win);
  }
  win.on("close", (e) => {
    const useTray = !isDeckGameMode && Settings.store.minimizeToTray !== false && Settings.store.tray !== false;
    if (isQuitting || process.platform !== "darwin" && !useTray) return;
    e.preventDefault();
    if (process.platform === "darwin") import_electron32.app.hide();
    else win.hide();
    return false;
  });
  win.on("focus", () => {
    win.flashFrame(false);
  });
  initWindowBoundsListeners(win);
  win.on("leave-html-full-screen", () => {
    if (win.isFullScreen()) win.setFullScreen(false);
  });
  if (!isDeckGameMode && (Settings.store.tray ?? true) && process.platform !== "darwin")
    initTray(win, (q) => isQuitting = q);
  initMenuBar(win);
  makeLinksOpenExternally(win);
  initSettingsListeners(win);
  initSpellCheck(win);
  initDevtoolsListeners(win);
  initStaticTitle(win);
  addSplashLog();
  win.webContents.setUserAgent(BrowserUserAgent);
  addSplashLog();
  loadUrl(darwinURL || process.argv.find((arg) => arg.startsWith("discord://")));
  addSplashLog();
  return win;
}
function loadUrl(uri) {
  const branch = Settings.store.discordBranch;
  const subdomain = branch === "canary" || branch === "ptb" ? `${branch}.` : "";
  mainWin.loadURL(`https://${subdomain}discord.com/${uri ? new URL(uri).pathname.slice(1) || "app" : "app"}`).then(() => AppEvents.emit("appLoaded")).catch((error) => retryUrl(error.url, error.code));
}
function retryUrl(url, description) {
  console.log(`retrying in ${retryDelay}ms`);
  updateSplashMessage(`Failed to load Discord: ${description}`);
  setTimeout(() => loadUrl(url), retryDelay);
}
async function createWindows() {
  const startMinimized = CommandLine.values["start-minimized"];
  let splash2;
  if (Settings.store.enableSplashScreen !== false) {
    splash2 = await createSplashWindow(startMinimized);
    if (isDeckGameMode) splash2.setFullScreen(true);
    addSplashLog();
  }
  addSplashLog();
  await ensureVencordFiles();
  runVencordMain();
  addSplashLog();
  mainWin = createMainWindow();
  AppEvents.on("appLoaded", () => {
    splash2?.destroy();
    if (!startMinimized) {
      if (splash2) mainWin?.show();
      const shouldMaximize = State.store.maximized === true && !isDeckGameMode && !State.store.windowBounds;
      if (shouldMaximize) {
        safeMaximizeLater(mainWin, 2500);
      }
    }
    if (isDeckGameMode) {
      mainWin?.setFullScreen(true);
      askToApplySteamLayout(mainWin);
    }
    mainWin.once("show", () => {
      const shouldMaximize = State.store.maximized === true && !mainWin?.isMaximized() && !isDeckGameMode && !State.store.windowBounds;
      if (shouldMaximize) {
        safeMaximizeLater(mainWin, 2500);
      }
    });
  });
  mainWin.webContents.on("did-navigate", (_, url, responseCode) => {
    updateSplashMessage("");
    if (responseCode >= 300 && new URL(url).pathname !== "/app") {
      loadUrl(void 0);
      console.warn(`'did-navigate': Caught bad page response: ${responseCode}, redirecting to main app`);
    }
  });
  setupArRPC();
  initArRPC();
  if (isLinux3) initKeybinds();
}
var import_node_path3, import_electron32, isQuitting, mainWin, addSettingsListener, removeSettingsListeners, addVencordSettingsListener, removeVencordSettingsListeners, runVencordMain, retryDelay;
var init_mainWindow = __esm({
  "src/midnightcord/main/mainWindow.ts"() {
    "use strict";
    import_node_path3 = require("node:path");
    import_electron32 = require("electron");
    init_IpcEvents2();
    init_paths();
    init_guards();
    init_once();
    init_about();
    init_appBadge();
    init_arrpc();
    init_cli();
    init_constants2();
    init_events();
    init_gnuSpoofing();
    init_ipcCommands();
    init_keybinds();
    init_settings2();
    init_splash();
    init_startup();
    init_tray();
    init_clearData();
    init_makeLinksOpenExternally();
    init_steamOS();
    init_vencordLoader();
    init_vencordDir();
    isQuitting = false;
    applyDeckKeyboardFix();
    import_electron32.app.on("before-quit", async () => {
      isQuitting = true;
      destroyTray();
      destroyAppBadge();
      await cleanupArRPC();
    });
    [addSettingsListener, removeSettingsListeners] = makeSettingsListenerHelpers(Settings);
    [addVencordSettingsListener, removeVencordSettingsListeners] = makeSettingsListenerHelpers(VencordSettings);
    runVencordMain = once(() => require(VENCORD_DIR));
    retryDelay = 1e3;
  }
});

// src/midnightcord/main/cli.ts
function checkCommandLineForHelpOrVersion() {
  const { help, version } = CommandLine.values;
  if (version) {
    console.log(`Midnightcord v${import_electron33.app.getVersion()}`);
    import_electron33.app.exit(0);
  }
  if (help) {
    const base = stripIndent`
            Midnightcord v${import_electron33.app.getVersion()}

            Usage: ${(0, import_path24.basename)(process.execPath)} [options] [url]

            Electron Options:
              See <https://www.electronjs.org/docs/latest/api/command-line-switches#electron-cli-flags>

            Chromium Options:
              See <https://peter.sh/experiments/chromium-command-line-switches> - only some of them work

            Vesktop Options:
        `;
    const optionLines = Object.entries(options).sort(([a], [b]) => a.localeCompare(b)).concat(Object.entries(extraOptions)).filter(([, opt]) => !("hidden" in opt && opt.hidden)).map(([name, opt]) => {
      const flags = [
        "short" in opt && `-${opt.short}`,
        `--${name}`,
        opt.type !== "boolean" && ("options" in opt ? `<${opt.options.join(" | ")}>` : `<${opt.argumentName ?? opt.type}>`)
      ].filter(Boolean).join(" ");
      return [flags, opt.description];
    });
    const padding = optionLines.reduce((max2, [flags]) => Math.max(max2, flags.length), 0) + 4;
    const optionsHelp = optionLines.map(([flags, description]) => `  ${flags.padEnd(padding, " ")}${description}`).join("\n");
    console.log(base + "\n" + optionsHelp);
    import_electron33.app.exit(0);
  }
  for (const [name, def] of Object.entries(options)) {
    const value = CommandLine.values[name];
    if (value == null) continue;
    if (typeof value !== def.type) {
      console.error(`Invalid options. Expected ${def.type === "boolean" ? "no" : "an"} argument for --${name}`);
      import_electron33.app.exit(1);
    }
    if ("options" in def && !def.options?.includes(value)) {
      console.error(`Invalid value for --${name}: ${value}
Expected one of: ${def.options.join(", ")}`);
      import_electron33.app.exit(1);
    }
  }
}
function checkCommandLineForToggleCommands() {
  const { "toggle-mic": toggleMic, "toggle-deafen": toggleDeafen } = CommandLine.values;
  if (!toggleMic && !toggleDeafen) return false;
  if (!import_electron33.app.requestSingleInstanceLock({ IS_DEV })) {
    import_electron33.app.exit(0);
  }
  console.error("Midnightcord is not running. Toggle commands require a running instance.");
  import_electron33.app.exit(1);
}
function setupSecondInstanceHandler() {
  import_electron33.app.on("second-instance", (_event, commandLine, _cwd, data) => {
    if (data.IS_DEV) {
      import_electron33.app.quit();
      return;
    }
    const isToggleCommand = commandLine.some((arg) => arg === "--toggle-mic" || arg === "--toggle-deafen");
    if (isToggleCommand) {
      const command = commandLine.includes("--toggle-mic") ? "VCD_TOGGLE_SELF_MUTE" /* TOGGLE_SELF_MUTE */ : "VCD_TOGGLE_SELF_DEAF" /* TOGGLE_SELF_DEAF */;
      Promise.resolve().then(() => (init_mainWindow(), mainWindow_exports)).then(({ mainWin: mainWin2 }) => {
        if (mainWin2) {
          mainWin2.webContents.send(command);
        }
      });
    } else {
      Promise.resolve().then(() => (init_mainWindow(), mainWindow_exports)).then(({ mainWin: mainWin2 }) => {
        if (mainWin2) {
          if (mainWin2.isMinimized()) mainWin2.restore();
          if (!mainWin2.isVisible()) mainWin2.show();
          mainWin2.focus();
        }
      });
    }
  });
}
function checkForSecondInstance() {
  if (checkCommandLineForToggleCommands()) return;
  if (!import_electron33.app.requestSingleInstanceLock({ IS_DEV })) {
    if (IS_DEV) {
      console.log("Midnightcord is already running. Quitting previous instance...");
      return;
    } else {
      console.log("Midnightcord is already running. Quitting...");
      import_electron33.app.exit(0);
    }
  }
  setupSecondInstanceHandler();
}
var import_electron33, import_path24, import_util, options, extraOptions, args, CommandLine;
var init_cli = __esm({
  "src/midnightcord/main/cli.ts"() {
    "use strict";
    import_electron33 = require("electron");
    import_path24 = require("path");
    init_IpcEvents2();
    init_text();
    import_util = require("util");
    options = {
      "start-minimized": {
        default: false,
        type: "boolean",
        short: "m",
        description: "Start the application minimized to the system tray"
      },
      "windows-spoof": {
        default: false,
        type: "boolean",
        description: "Spoofs the Operating System to Windows (only available on non-windows based OS)"
      },
      version: {
        type: "boolean",
        short: "v",
        description: "Print the application version and exit"
      },
      help: {
        type: "boolean",
        short: "h",
        description: "Print help information and exit"
      },
      "user-agent": {
        type: "string",
        argumentName: "ua",
        description: "Set a custom User-Agent. May trigger anti-spam or break voice chat"
      },
      "user-agent-os": {
        type: "string",
        description: "Set User-Agent to a specific operating system. May trigger anti-spam or break voice chat",
        options: ["windows", "linux", "darwin"]
      },
      "toggle-mic": {
        type: "boolean",
        hidden: process.platform !== "linux",
        description: "Toggle your microphone status"
      },
      "toggle-deafen": {
        type: "boolean",
        hidden: process.platform !== "linux",
        description: "Toggle your deafen status"
      },
      repair: {
        type: "boolean",
        short: "r",
        description: "Re-download Midnightcord and restart"
      }
    };
    extraOptions = {
      "enable-features": {
        type: "string",
        description: "Enable specific Chromium features",
        argumentName: "feature1,feature2,\u2026"
      },
      "disable-features": {
        type: "string",
        description: "Disable specific Chromium features",
        argumentName: "feature1,feature2,\u2026"
      },
      "ozone-platform": {
        hidden: process.platform !== "linux",
        type: "string",
        description: "Whether to run Midnightcord in Wayland or X11 (XWayland)",
        options: ["x11", "wayland"]
      }
    };
    args = (0, import_path24.basename)(process.argv[0]).toLowerCase().startsWith("electron") ? process.argv.slice(2) : process.argv.slice(1);
    CommandLine = (0, import_util.parseArgs)({
      args,
      options,
      strict: false,
      // we manually check later, so cast to true to get better types
      allowPositionals: true
    });
    checkCommandLineForHelpOrVersion();
    checkForSecondInstance();
  }
});

// src/midnightcord/main/constants.ts
var import_electron34, import_fs8, import_path25, MidnightcordDir, PORTABLE, DATA_DIR2, SESSION_DATA_DIR, VENCORD_SETTINGS_DIR, VENCORD_QUICKCSS_FILE, VENCORD_SETTINGS_FILE, VENCORD_THEMES_DIR, USER_AGENT, MIN_WIDTH, MIN_HEIGHT, DEFAULT_WIDTH, DEFAULT_HEIGHT, DISCORD_HOSTNAMES, VersionString, BrowserUserAgents, BrowserUserAgent, IS_FLATPAK, isWayland, isLinux3;
var init_constants2 = __esm({
  "src/midnightcord/main/constants.ts"() {
    "use strict";
    import_electron34 = require("electron");
    import_fs8 = require("fs");
    import_path25 = require("path");
    init_cli();
    init_DOMAIN();
    MidnightcordDir = (0, import_path25.dirname)(process.execPath);
    PORTABLE = process.platform === "win32" && !process.execPath.toLowerCase().endsWith("electron.exe") && !(0, import_fs8.existsSync)((0, import_path25.join)(MidnightcordDir, "Uninstall Midnightcord.exe"));
    DATA_DIR2 = process.env.Midnightcord_USER_DATA_DIR || (PORTABLE ? (0, import_path25.join)(MidnightcordDir, "Data") : (0, import_path25.join)(import_electron34.app.getPath("userData")));
    (0, import_fs8.mkdirSync)(DATA_DIR2, { recursive: true });
    SESSION_DATA_DIR = (0, import_path25.join)(DATA_DIR2, "sessionData");
    import_electron34.app.setPath("sessionData", SESSION_DATA_DIR);
    VENCORD_SETTINGS_DIR = (0, import_path25.join)(DATA_DIR2, "settings");
    (0, import_fs8.mkdirSync)(VENCORD_SETTINGS_DIR, { recursive: true });
    VENCORD_QUICKCSS_FILE = (0, import_path25.join)(VENCORD_SETTINGS_DIR, "quickCss.css");
    VENCORD_SETTINGS_FILE = (0, import_path25.join)(VENCORD_SETTINGS_DIR, "settings.json");
    VENCORD_THEMES_DIR = (0, import_path25.join)(DATA_DIR2, "themes");
    USER_AGENT = `Midnightcord/${import_electron34.app.getVersion()} (https://git.${domain}/nightcord/nightcord)`;
    MIN_WIDTH = 940;
    MIN_HEIGHT = 500;
    DEFAULT_WIDTH = 1280;
    DEFAULT_HEIGHT = 720;
    DISCORD_HOSTNAMES = ["discord.com", "canary.discord.com", "ptb.discord.com"];
    VersionString = `AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome.split(".")[0]}.0.0.0 Safari/537.36`;
    BrowserUserAgents = {
      darwin: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${VersionString}`,
      linux: `Mozilla/5.0 (X11; Linux x86_64) ${VersionString}`,
      windows: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${VersionString}`
    };
    BrowserUserAgent = CommandLine.values["user-agent"] || BrowserUserAgents[CommandLine.values["user-agent-os"] || process.platform] || BrowserUserAgents.windows;
    IS_FLATPAK = process.env.FLATPAK_ID !== void 0;
    isWayland = process.platform === "linux" && (process.env.XDG_SESSION_TYPE === "wayland" || !!process.env.WAYLAND_DISPLAY);
    isLinux3 = process.platform === "linux";
  }
});

// src/midnightcord/main/utils/makeLinksOpenExternally.ts
function isPopoutRateLimited() {
  const now = Date.now();
  while (popoutTimestamps.length > 0 && now - popoutTimestamps[0] > POPOUT_RATE_LIMIT_WINDOW_MS) {
    popoutTimestamps.shift();
  }
  if (popoutTimestamps.length >= POPOUT_RATE_LIMIT_MAX) {
    console.warn("[Midnightcord] Popout rate-limited \u2014 too many popout requests (overlay crash loop?)");
    return true;
  }
  popoutTimestamps.push(now);
  return false;
}
function stablePopoutKey(frameName) {
  if (frameName.startsWith("DISCORD_")) return frameName;
  if (frameName) return `DISCORD_${frameName}`;
  return `DISCORD_POPOUT_${++popoutCounter}`;
}
function handleExternalUrl(url, protocol3) {
  if (protocol3 == null) {
    try {
      protocol3 = new URL(url).protocol;
    } catch {
      return { action: "deny" };
    }
  }
  switch (protocol3) {
    case "http:":
    case "https:":
      if (Settings.store.openLinksWithElectron) {
        return { action: "allow" };
      }
    // eslint-disable-next-line no-fallthrough
    case "mailto:":
    case "spotify:":
      if (isDeckGameMode) {
        steamOpenURL(url);
      } else {
        import_electron35.shell.openExternal(url);
      }
      break;
    case "steam:":
      if (isDeckGameMode) {
        execSteamURL(url);
      } else {
        import_electron35.shell.openExternal(url);
      }
      break;
  }
  return { action: "deny" };
}
function makeLinksOpenExternally(win) {
  win.webContents.setWindowOpenHandler(({ url, frameName, features }) => {
    console.log("[Midnightcord][LINK] setWindowOpenHandler url=", url, "frameName=", frameName);
    try {
      var { protocol: protocol3, hostname, pathname, searchParams } = new URL(url);
    } catch {
      return { action: "deny" };
    }
    const isDiscordPopout = pathname === "/popout" && DISCORD_HOSTNAMES.includes(hostname);
    if (isDiscordPopout || frameName.startsWith("DISCORD_") && pathname === "/popout" && DISCORD_HOSTNAMES.includes(hostname)) {
      if (OVERLAY_FRAME_NAMES.has(frameName)) {
        console.log("[Midnightcord] Blocked overlay popout (overlay unsupported):", frameName);
        return { action: "deny" };
      }
      if (isPopoutRateLimited()) {
        return { action: "deny" };
      }
      const key = stablePopoutKey(frameName);
      const result = createOrFocusPopup(key, features);
      if (result.action === "allow") {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            ...result.overrideBrowserWindowOptions,
            isDiscordPopout: true
          }
        };
      }
      return result;
    }
    if (url === "about:blank") return { action: "allow" };
    if (frameName === "authorize" && searchParams.get("loading") === "true") return { action: "deny" };
    if (hostname.includes("hcaptcha.com") || hostname.includes("recaptcha.net") || hostname.includes("google.com") && pathname.startsWith("/recaptcha") || hostname.includes("discord.com") && pathname.startsWith("/cdn-cgi/") || // Discord sometimes opens its own captcha flow on discord.com
    DISCORD_HOSTNAMES.includes(hostname) && (pathname.includes("captcha") || searchParams.has("captcha"))) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 500,
          height: 600,
          frame: true,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
          }
        }
      };
    }
    return handleExternalUrl(url, protocol3);
  });
  win.webContents.on("did-create-window", (childWin, { frameName, options: options2, url }) => {
    console.log("[Midnightcord][LINK] did-create-window url=", url, "frameName=", frameName);
    let isCaptcha = false;
    if (url) {
      try {
        const { hostname, pathname } = new URL(url);
        isCaptcha = hostname.includes("hcaptcha.com") || hostname.includes("recaptcha.net") || hostname.includes("google.com") && pathname.startsWith("/recaptcha") || hostname.includes("discord.com") && pathname.startsWith("/cdn-cgi/") || DISCORD_HOSTNAMES.includes(hostname) && pathname.includes("captcha");
      } catch {
      }
    }
    if (isCaptcha) {
      childWin.setMenuBarVisibility(false);
      childWin.webContents.setWindowOpenHandler(({ url: url2 }) => handleExternalUrl(url2));
      childWin.once("closed", () => childWin.removeAllListeners());
      return;
    }
    let isPopout = frameName.startsWith("DISCORD_");
    if (!isPopout) {
      if (options2 && options2.isDiscordPopout) {
        isPopout = true;
      } else if (url) {
        try {
          const { pathname, hostname } = new URL(url);
          if (pathname === "/popout" && DISCORD_HOSTNAMES.includes(hostname)) {
            isPopout = true;
          }
        } catch {
        }
      }
    }
    if (isPopout) {
      if (OVERLAY_FRAME_NAMES.has(frameName)) {
        childWin.close();
        return;
      }
      const key = stablePopoutKey(frameName);
      setupPopout(childWin, key);
    } else {
      childWin.hide();
      childWin.webContents.on("will-navigate", (e, navUrl) => {
        e.preventDefault();
        setImmediate(() => {
          if (!childWin.isDestroyed()) childWin.close();
        });
        if (navUrl && navUrl !== "about:blank") {
          handleExternalUrl(navUrl);
        }
      });
      setTimeout(() => {
        if (!childWin.isDestroyed()) childWin.close();
      }, 2e3);
    }
  });
}
var import_electron35, OVERLAY_FRAME_NAMES, POPOUT_RATE_LIMIT_WINDOW_MS, POPOUT_RATE_LIMIT_MAX, popoutTimestamps, popoutCounter;
var init_makeLinksOpenExternally = __esm({
  "src/midnightcord/main/utils/makeLinksOpenExternally.ts"() {
    "use strict";
    import_electron35 = require("electron");
    init_constants2();
    init_settings2();
    init_popout();
    init_steamOS();
    OVERLAY_FRAME_NAMES = /* @__PURE__ */ new Set([
      "DISCORD_OutOfProcessOverlay",
      "DISCORD_Overlay",
      "DISCORD_GAME_OVERLAY"
    ]);
    POPOUT_RATE_LIMIT_WINDOW_MS = 5e3;
    POPOUT_RATE_LIMIT_MAX = 3;
    popoutTimestamps = [];
    popoutCounter = 0;
  }
});

// src/shared/onceDefined.ts
function onceDefined(target, property, callback) {
  const propertyAsAny = property;
  if (property in target)
    return void callback(target[propertyAsAny]);
  Object.defineProperty(target, property, {
    set(v) {
      delete target[propertyAsAny];
      target[propertyAsAny] = v;
      callback(v);
    },
    configurable: true,
    enumerable: false
  });
}
var init_onceDefined = __esm({
  "src/shared/onceDefined.ts"() {
    "use strict";
  }
});

// src/main/trayMenu.ts
function patchTrayMenu() {
}
var import_electron39, import_about3, cachedUpdateAvailable;
var init_trayMenu = __esm({
  "src/main/trayMenu.ts"() {
    "use strict";
    init_IpcEvents();
    init_vencordUserAgent();
    import_electron39 = require("electron");
    import_about3 = __toESM(require("file://about.html?minify"));
    init_constants();
    cachedUpdateAvailable = false;
    import_electron39.ipcMain.on("VencordSetTrayUpdateState" /* SET_TRAY_UPDATE_STATE */, (_, available) => {
      cachedUpdateAvailable = available;
    });
  }
});

// src/main/patchWin32Updater.ts
var patchWin32Updater_exports = {};
function isNewer2($new, old) {
  const newParts = $new.slice(4).split(".").map(Number);
  const oldParts = old.slice(4).split(".").map(Number);
  for (let i2 = 0; i2 < oldParts.length; i2++) {
    if (newParts[i2] > oldParts[i2]) return true;
    if (newParts[i2] < oldParts[i2]) return false;
  }
  return false;
}
function patchLatest() {
  try {
    const currentAppPath = (0, import_path28.dirname)(process.execPath);
    const currentVersion = (0, import_path28.basename)(currentAppPath);
    const discordPath = (0, import_path28.join)(currentAppPath, "..");
    const latestVersion = (0, import_original_fs4.readdirSync)(discordPath).filter((name) => name.startsWith("app-") && (0, import_original_fs4.statSync)((0, import_path28.join)(discordPath, name)).isDirectory()).reduce((prev, curr) => isNewer2(curr, prev) ? curr : prev, currentVersion);
    if (latestVersion === currentVersion) return;
    const resources = (0, import_path28.join)(discordPath, latestVersion, "resources");
    const appAsar = (0, import_path28.join)(resources, "app.asar");
    const _appAsar = (0, import_path28.join)(resources, "_app.asar");
    if (!(0, import_original_fs4.existsSync)(appAsar) || (0, import_original_fs4.statSync)(appAsar).isDirectory()) return;
    console.info("[Midnightcord] Detected Host Update. Repatching...");
    (0, import_original_fs4.renameSync)(appAsar, _appAsar);
    (0, import_original_fs4.mkdirSync)(appAsar);
    (0, import_original_fs4.writeFileSync)((0, import_path28.join)(appAsar, "package.json"), JSON.stringify({
      name: "discord",
      main: "index.js"
    }));
    const indexJs = [
      "// Midnightcord repatch",
      '"use strict";',
      'const path = require("path");',
      'const fs = require("fs");',
      "try {",
      `    require(${JSON.stringify(OUR_PATCHER_PATH)});`,
      "} catch (e) {",
      '    console.error("[Midnightcord] Repatch injection failed, falling back to vanilla Discord:", e);',
      '    const originalAsar = path.join(__dirname, "..", "_app.asar");',
      "    if (fs.existsSync(originalAsar)) {",
      "        require(originalAsar);",
      "    }",
      "}",
      ""
    ].join("\n");
    (0, import_original_fs4.writeFileSync)((0, import_path28.join)(appAsar, "index.js"), indexJs);
  } catch (err2) {
    console.error("[Midnightcord] Failed to repatch latest host update", err2);
  }
}
var import_electron40, import_original_fs4, import_path28, OUR_PATCHER_PATH;
var init_patchWin32Updater = __esm({
  "src/main/patchWin32Updater.ts"() {
    "use strict";
    import_electron40 = require("electron");
    import_original_fs4 = require("original-fs");
    import_path28 = require("path");
    OUR_PATCHER_PATH = __filename;
    import_electron40.app.on("before-quit", patchLatest);
  }
});

// src/main/patcher.ts
var patcher_exports = {};
var import_electron41, import_original_fs5, import_path29, injectorPath, _asarFromInjector, _asarFromResources, asarPath, discordPkg;
var init_patcher = __esm({
  "src/main/patcher.ts"() {
    "use strict";
    init_onceDefined();
    import_electron41 = __toESM(require("electron"));
    import_original_fs5 = require("original-fs");
    import_path29 = require("path");
    init_mediaPermissions();
    init_settings();
    init_trayMenu();
    init_constants();
    console.log("[Midnightcord] Starting up...");
    injectorPath = require.main.filename;
    _asarFromInjector = (0, import_path29.join)((0, import_path29.dirname)(injectorPath), "..", "_app.asar");
    _asarFromResources = (0, import_path29.join)(process.resourcesPath, "_app.asar");
    asarPath = (0, import_original_fs5.existsSync)(_asarFromInjector) && !(0, import_original_fs5.statSync)(_asarFromInjector).isDirectory() ? _asarFromInjector : _asarFromResources;
    discordPkg = require((0, import_path29.join)(asarPath, "package.json"));
    require.main.filename = (0, import_path29.join)(asarPath, discordPkg.main);
    if (IS_VESKTOP || IS_EQUIBOP) require.main.filename = (0, import_path29.join)((0, import_path29.dirname)(injectorPath), "..", "..", "package.json");
    import_electron41.app.setAppPath(asarPath);
    if (!IS_VANILLA) {
      const settings = RendererSettings.store;
      patchTrayMenu();
      if (process.platform === "win32") {
        init_patchWin32Updater();
        if (settings.winCtrlQ) {
          const originalBuild = import_electron41.Menu.buildFromTemplate;
          import_electron41.Menu.buildFromTemplate = function(template) {
            if (template[0]?.label === "&File") {
              const { submenu } = template[0];
              if (Array.isArray(submenu)) {
                submenu.push({
                  label: "Quit (Hidden)",
                  visible: false,
                  acceleratorWorksWhenHidden: true,
                  accelerator: "Control+Q",
                  click: () => import_electron41.app.quit()
                });
              }
            }
            return originalBuild.call(this, template);
          };
        }
      }
      class BrowserWindow16 extends import_electron41.default.BrowserWindow {
        constructor(options2) {
          const ourPreload = (0, import_path29.join)(__dirname, "preload.js");
          const preloadIsOurs = options2.webPreferences.preload === ourPreload;
          const KNOWN_TITLES = /^(Discord|Vesktop|Equibop)$|^(Midnightcord|Equicord)/;
          const isTrustedTitle = !!(options2.title && KNOWN_TITLES.test(options2.title));
          const isVBCable = !!(options2.title && options2.title.includes("VB-Cable"));
          if (options2?.webPreferences?.preload && (isTrustedTitle || isVBCable || preloadIsOurs)) {
            const original = options2.webPreferences.preload;
            const isMainWindow = options2.title === "Discord";
            options2.webPreferences.preload = (0, import_path29.join)(__dirname, "preload.js");
            options2.webPreferences.sandbox = false;
            options2.webPreferences.backgroundThrottling = false;
            let ses = options2.webPreferences.session;
            if (!ses && options2.webPreferences.partition) {
              ses = import_electron41.default.session.fromPartition(options2.webPreferences.partition);
            }
            ses ??= import_electron41.default.session.defaultSession;
            registerMediaPermissionsForSession(ses);
            if (settings.frameless) {
              options2.frame = false;
            } else if (settings.mainWindowFrameless && isMainWindow) {
              options2.frame = false;
            } else if (process.platform === "win32" && settings.winNativeTitleBar) {
              delete options2.frame;
            }
            if (settings.transparent) {
              options2.transparent = true;
              options2.backgroundColor = "#00000000";
            }
            const winMaterial = settings.windowMaterial;
            if (process.platform === "win32" && winMaterial && winMaterial !== "none") {
              options2.transparent = true;
              options2.backgroundColor = "#00000000";
            }
            if (settings.disableMinSize) {
              options2.minWidth = 0;
              options2.minHeight = 0;
            }
            const needsVibrancy = process.platform === "darwin" && settings.macosVibrancyStyle;
            if (needsVibrancy) {
              options2.backgroundColor = "#00000000";
              if (settings.macosVibrancyStyle) {
                options2.vibrancy = settings.macosVibrancyStyle;
              }
            }
            options2.fullscreenable = true;
            process.env.DISCORD_PRELOAD = original;
            super(options2);
            if (settings.streamProof) {
              try {
                this.setContentProtection(true);
              } catch (e) {
                console.error("Failed to set content protection on startup:", e);
              }
            }
            const isTransparent = !!options2.transparent;
            let isFakeFullScreen = false;
            let originalBounds = null;
            let isMaximizedBefore = false;
            let transitioning = false;
            const superSetFullScreen = this.setFullScreen.bind(this);
            const superIsFullScreen = this.isFullScreen.bind(this);
            this.setFullScreen = (flag) => {
              if (transitioning) return;
              transitioning = true;
              try {
                if (isTransparent) {
                  if (flag) {
                    if (isFakeFullScreen) return;
                    isFakeFullScreen = true;
                    originalBounds = this.getBounds();
                    isMaximizedBefore = this.isMaximized();
                    const display = import_electron41.default.screen.getDisplayMatching(originalBounds).bounds;
                    this.setResizable(false);
                    this.setBounds(display);
                    this.setAlwaysOnTop(true, "screen-saver");
                    this.emit("enter-full-screen");
                  } else {
                    if (!isFakeFullScreen) return;
                    isFakeFullScreen = false;
                    this.setAlwaysOnTop(false);
                    this.setResizable(true);
                    if (isMaximizedBefore) {
                      this.maximize();
                    } else if (originalBounds) {
                      this.setBounds(originalBounds);
                    }
                    this.emit("leave-full-screen");
                  }
                } else {
                  superSetFullScreen(flag);
                }
              } finally {
                transitioning = false;
              }
            };
            this.isFullScreen = () => {
              if (isTransparent) return isFakeFullScreen;
              return superIsFullScreen();
            };
            if (isTransparent) {
              this.on("enter-html-full-screen", () => {
                if (!isFakeFullScreen) this.setFullScreen(true);
              });
              this.on("leave-html-full-screen", () => {
                if (isFakeFullScreen) this.setFullScreen(false);
              });
            } else {
              this.on("enter-html-full-screen", () => {
                if (!superIsFullScreen()) superSetFullScreen(true);
              });
              this.on("leave-html-full-screen", () => {
                if (superIsFullScreen()) superSetFullScreen(false);
              });
            }
            this.webContents.on("before-input-event", (event, input) => {
              if (input.type === "keyDown" && input.key === "F11" && !input.control && !input.shift && !input.alt && !input.meta) {
                event.preventDefault();
                this.setFullScreen(!this.isFullScreen());
              }
            });
            if (process.platform === "win32" && winMaterial && winMaterial !== "none") {
              try {
                let applied = false;
                if (typeof this.setBackgroundMaterial === "function") {
                  this.setBackgroundMaterial(winMaterial);
                  applied = true;
                }
                if (!applied && typeof this.setVibrancy === "function") {
                  this.setVibrancy(winMaterial === "acrylic" ? "acrylic" : "under-window");
                  applied = true;
                }
                if (!applied) {
                  console.warn("[Midnightcord] No background material API available on this system");
                }
              } catch (e) {
                console.error("[Midnightcord] setBackgroundMaterial failed:", e);
              }
            }
            if (settings.disableMinSize) {
              this.setMinimumSize = (_width, _height) => {
              };
            }
          } else {
            super(options2);
          }
        }
      }
      Object.assign(BrowserWindow16, import_electron41.default.BrowserWindow);
      Object.defineProperty(BrowserWindow16, "name", { value: "BrowserWindow", configurable: true });
      const electronPath = require.resolve("electron");
      delete require.cache[electronPath].exports;
      require.cache[electronPath].exports = {
        ...import_electron41.default,
        BrowserWindow: BrowserWindow16
      };
      if (IS_DEV) {
        onceDefined(global, "appSettings", (s) => {
          s.set("DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING", true);
        });
      }
      process.env.DATA_DIR = (0, import_path29.join)(import_electron41.app.getPath("userData"), "..", "Midnightcord");
      import_electron41.app.whenReady().then(() => {
        registerMediaPermissionsForSession(import_electron41.session.defaultSession);
      });
      {
        const _originalHandle = import_electron41.default.ipcMain.handle.bind(import_electron41.default.ipcMain);
        const FULLSCREEN_CHANNEL = "DISCORD_WINDOW_TOGGLE_FULLSCREEN";
        let _fullscreenPatched = false;
        import_electron41.default.ipcMain.handle = function(channel, listener) {
          if (channel === FULLSCREEN_CHANNEL) {
            if (_fullscreenPatched) return;
            _fullscreenPatched = true;
            _originalHandle(FULLSCREEN_CHANNEL, (_event) => {
            });
            return;
          }
          try {
            return _originalHandle(channel, listener);
          } catch (e) {
            if (e?.message?.includes?.("Attempted to register a second handler")) {
              console.warn(`[Midnightcord] Ignored duplicate IPC handler for '${channel}'`);
              return;
            }
            throw e;
          }
        };
      }
      const originalAppend = import_electron41.app.commandLine.appendSwitch;
      const _ncDisabledFeatures = /* @__PURE__ */ new Set(["WidgetLayering", "UseEcoQoSForBackgroundProcess", "CalculateNativeWinOcclusion"]);
      import_electron41.app.commandLine.appendSwitch = function(...args2) {
        if (args2[0] === "process-per-site") return;
        if (args2[0] === "disable-features") {
          (args2[1] ?? "").split(",").filter(Boolean).forEach((f) => _ncDisabledFeatures.add(f));
          args2[1] = [..._ncDisabledFeatures].join(",");
        }
        return originalAppend.apply(this, args2);
      };
      import_electron41.app.commandLine.appendSwitch("disable-renderer-backgrounding");
      import_electron41.app.commandLine.appendSwitch("disable-background-timer-throttling");
      import_electron41.app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
    } else {
      console.log("[Midnightcord] Running in vanilla mode. Not loading Midnightcord");
    }
    console.log("[Midnightcord] Loading original Discord app.asar");
    require(require.main.filename);
  }
});

// src/main/index.ts
var import_electron42 = require("electron");
var import_path30 = require("path");
var import_url3 = require("url");

// src/main/csp/index.ts
init_settings();
var import_electron3 = require("electron");
var ConnectSrc = ["connect-src"];
var ImageSrc = [...ConnectSrc, "img-src"];
var CssSrc = ["style-src", "font-src"];
var ImageAndCssSrc = [...ImageSrc, ...CssSrc];
var ImageScriptsAndCssSrc = [...ImageAndCssSrc, "script-src", "worker-src"];
var CSPSrc = ["style-src", "connect-src", "img-src", "frame-src", "font-src", "media-src", "worker-src"];
var CspPolicies = {
  "http://localhost:*": ImageAndCssSrc,
  "http://127.0.0.1:*": ImageAndCssSrc,
  "localhost:*": ImageAndCssSrc,
  "127.0.0.1:*": ImageAndCssSrc,
  "*.github.io": ImageAndCssSrc,
  "github.com": ImageAndCssSrc,
  "raw.githubusercontent.com": ImageAndCssSrc,
  "*.raw.githubusercontent.com": ImageAndCssSrc,
  "github-production-user-asset-6210df.s3.amazonaws.com": CSPSrc,
  "*.gitlab.io": ImageAndCssSrc,
  "gitlab.com": ImageAndCssSrc,
  "*.codeberg.page": ImageAndCssSrc,
  "codeberg.org": ImageAndCssSrc,
  "*.githack.com": ImageAndCssSrc,
  "jsdelivr.net": ImageAndCssSrc,
  "fonts.googleapis.com": CssSrc,
  "i.imgur.com": ImageSrc,
  "i.ibb.co": ImageSrc,
  "i.pinimg.com": ImageSrc,
  "*.tenor.com": ImageSrc,
  "files.catbox.moe": ImageAndCssSrc,
  "cdn.discordapp.com": ImageAndCssSrc,
  "media.discordapp.net": ImageSrc,
  "cdnjs.cloudflare.com": ImageScriptsAndCssSrc,
  "cdn.jsdelivr.net": ImageScriptsAndCssSrc,
  "api.groq.com": ConnectSrc,
  "*.speech.googleapis.com": ConnectSrc,
  "speech.googleapis.com": ConnectSrc,
  "www.google.com": ConnectSrc,
  "*.google.com": ConnectSrc,
  "api.github.com": ConnectSrc,
  "ws.audioscrobbler.com": ConnectSrc,
  "translate-pa.googleapis.com": ConnectSrc,
  "*.vencord.dev": ImageSrc,
  "manti.vendicated.dev": ImageSrc,
  "decor.fieryflames.dev": ConnectSrc,
  "ugc.decor.fieryflames.dev": ImageSrc,
  "sponsor.ajay.app": ConnectSrc,
  "dearrow-thumb.ajay.app": ImageSrc,
  "usrbg.is-hardly.online": ImageSrc,
  "icons.duckduckgo.com": ImageSrc,
  "*.sndcdn.com": CSPSrc,
  "soundcloud.com": CSPSrc,
  "*.soundcloud.com": CSPSrc,
  // hCaptcha (Discord captcha system)
  "hcaptcha.com": ImageScriptsAndCssSrc,
  "*.hcaptcha.com": ImageScriptsAndCssSrc,
  "newassets.hcaptcha.com": ImageScriptsAndCssSrc,
  "imgs.hcaptcha.com": ImageScriptsAndCssSrc,
  "api2.hcaptcha.com": ImageScriptsAndCssSrc,
  // Cloudflare Turnstile / cdn-cgi captcha
  "challenges.cloudflare.com": ImageScriptsAndCssSrc,
  "*.cloudflare.com": ImageScriptsAndCssSrc
};
var findHeader = (headers, headerName) => {
  return Object.keys(headers).find((h) => h.toLowerCase() === headerName);
};
var parsePolicy = (policy) => {
  const result = {};
  policy.split(";").forEach((directive) => {
    const [directiveKey, ...directiveValue] = directive.trim().split(/\s+/g);
    if (directiveKey && !Object.prototype.hasOwnProperty.call(result, directiveKey)) {
      result[directiveKey] = directiveValue;
    }
  });
  return result;
};
var stringifyPolicy = (policy) => Object.entries(policy).filter(([, values]) => values?.length).map((directive) => directive.flat().join(" ")).join("; ");
var patchCsp = (headers) => {
  const reportOnlyHeader = findHeader(headers, "content-security-policy-report-only");
  if (reportOnlyHeader)
    delete headers[reportOnlyHeader];
  const permissionsPolicyHeader = findHeader(headers, "permissions-policy");
  if (permissionsPolicyHeader) delete headers[permissionsPolicyHeader];
  const permissionsPolicyReportOnlyHeader = findHeader(headers, "permissions-policy-report-only");
  if (permissionsPolicyReportOnlyHeader) delete headers[permissionsPolicyReportOnlyHeader];
  const featurePolicyHeader = findHeader(headers, "feature-policy");
  if (featurePolicyHeader) delete headers[featurePolicyHeader];
  const featurePolicyReportOnlyHeader = findHeader(headers, "feature-policy-report-only");
  if (featurePolicyReportOnlyHeader) delete headers[featurePolicyReportOnlyHeader];
  const header = findHeader(headers, "content-security-policy");
  if (header) {
    const csp = parsePolicy(headers[header][0]);
    const pushDirective = (directive, ...values) => {
      csp[directive] ??= [...csp["default-src"] ?? []];
      csp[directive].push(...values);
    };
    pushDirective("style-src", "'unsafe-inline'");
    pushDirective("script-src", "'unsafe-inline'", "'unsafe-eval'");
    for (const directive of ["style-src", "connect-src", "img-src", "font-src", "media-src", "worker-src"]) {
      pushDirective(directive, "blob:", "data:", "vencord:", "vesktop:", "equicord:", "equibop:", "https://*.githubusercontent.com", "https://*.amazonaws.com");
    }
    for (const [host, directives] of Object.entries(NativeSettings.store.customCspRules)) {
      for (const directive of directives) {
        pushDirective(directive, host);
      }
    }
    for (const [host, directives] of Object.entries(CspPolicies)) {
      for (const directive of directives) {
        pushDirective(directive, host);
      }
    }
    headers[header] = [stringifyPolicy(csp)];
  }
};
function initCsp() {
  import_electron3.session.defaultSession.webRequest.onHeadersReceived(({ responseHeaders, resourceType }, cb) => {
    if (responseHeaders) {
      if (resourceType === "mainFrame" || resourceType === "subFrame")
        patchCsp(responseHeaders);
      if (resourceType === "stylesheet") {
        const header = findHeader(responseHeaders, "content-type");
        if (header)
          responseHeaders[header] = ["text/css"];
      }
    }
    cb({ cancel: false, responseHeaders });
  });
}

// src/main/updater/index.ts
init_IpcEvents();
var import_electron5 = require("electron");
var import_git_remote2 = __toESM(require("~git-remote"));
init_common();
if (!IS_UPDATER_DISABLED) {
  init_http2();
} else {
  import_electron5.ipcMain.handle("VencordGetRepo" /* GET_REPO */, serializeErrors(() => `https://github.com/${import_git_remote2.default}`));
  import_electron5.ipcMain.handle("VencordGetUpdates" /* GET_UPDATES */, serializeErrors(() => []));
}

// src/main/ipcPlugins.ts
init_IpcEvents();
var import_electron6 = require("electron");
var import_pluginNatives = __toESM(require("~pluginNatives"));
var PluginIpcMappings = {};
for (const [plugin, methods] of Object.entries(import_pluginNatives.default)) {
  const entries = Object.entries(methods);
  if (!entries.length) continue;
  const mappings = PluginIpcMappings[plugin] = {};
  for (const [methodName, method] of entries) {
    const key = `VencordPluginNative_${plugin}_${methodName}`;
    import_electron6.ipcMain.handle(key, method);
    mappings[methodName] = key;
  }
}
import_electron6.ipcMain.on("VencordGetPluginIpcMethodMap" /* GET_PLUGIN_IPC_METHOD_MAP */, (e) => {
  e.returnValue = PluginIpcMappings;
});

// src/main/ipcMain.ts
init_settings();
init_debounce();
init_IpcEvents();
var import_electron36 = require("electron");
var import_monacoWin = __toESM(require("file://monacoWin.html?minify&base64"));
var import_fs9 = require("fs");
var import_promises8 = require("fs/promises");
var import_path26 = require("path");
init_DOMAIN();

// src/main/csp/manager.ts
init_settings();
init_IpcEvents();
var import_electron7 = require("electron");
function registerCspIpcHandlers() {
  import_electron7.ipcMain.handle("VencordCspRemoveOverride" /* CSP_REMOVE_OVERRIDE */, removeCspRule);
  import_electron7.ipcMain.handle("VencordCspRequestAddOverride" /* CSP_REQUEST_ADD_OVERRIDE */, addCspRule);
  import_electron7.ipcMain.handle("VencordCspIsDomainAllowed" /* CSP_IS_DOMAIN_ALLOWED */, isDomainAllowed);
}
function validate(url, directives) {
  try {
    const { host } = new URL(url);
    if (/[;'"\\]/.test(host)) return false;
  } catch {
    return false;
  }
  if (directives.length === 0) return false;
  if (directives.some((d) => !ImageAndCssSrc.includes(d))) return false;
  return true;
}
function getMessage(url, directives, callerName) {
  const domain2 = new URL(url).host;
  const message = `${callerName} wants to allow connections to ${domain2}`;
  let detail = `Unless you recognise and fully trust ${domain2}, you should cancel this request!

You will have to fully close and restart ${IS_DISCORD_DESKTOP ? "Discord" : "Vesktop"} for the changes to take effect.`;
  if (directives.length === 1 && directives[0] === "connect-src") {
    return { message, detail };
  }
  const contentTypes = directives.filter((type) => type !== "connect-src").map((type) => {
    switch (type) {
      case "img-src":
        return "Images";
      case "style-src":
        return "CSS & Themes";
      case "font-src":
        return "Fonts";
      default:
        throw new Error(`Illegal CSP directive: ${type}`);
    }
  }).sort().join(", ");
  detail = `The following types of content will be allowed to load from ${domain2}:
${contentTypes}

${detail}`;
  return { message, detail };
}
var cspDialogQueue = Promise.resolve("cancelled");
async function addCspRule(event, url, directives, callerName) {
  if (!validateSender(event)) {
    throw new Error("Unauthorized IPC invocation");
  }
  const result = cspDialogQueue.then(() => _addCspRule(url, directives, callerName));
  cspDialogQueue = result.catch(() => "cancelled");
  return result;
}
async function _addCspRule(url, directives, callerName) {
  if (!validate(url, directives)) {
    return "invalid";
  }
  const domain2 = new URL(url).host;
  if (domain2 in NativeSettings.store.customCspRules) {
    return "conflict";
  }
  const { checkboxChecked, response } = await import_electron7.dialog.showMessageBox({
    ...getMessage(url, directives, callerName),
    type: callerName ? "info" : "warning",
    title: "Midnightcord Host Permissions",
    buttons: ["Cancel", "Allow"],
    defaultId: 0,
    cancelId: 0,
    checkboxLabel: `I fully trust ${domain2} and understand the risks of allowing connections to it.`,
    checkboxChecked: false
  });
  if (response !== 1) {
    return "cancelled";
  }
  if (!checkboxChecked) {
    return "unchecked";
  }
  NativeSettings.store.customCspRules[domain2] = directives;
  return "ok";
}
function removeCspRule(event, domain2) {
  if (!validateSender(event)) {
    throw new Error("Unauthorized IPC invocation");
  }
  if (domain2 in NativeSettings.store.customCspRules) {
    delete NativeSettings.store.customCspRules[domain2];
    return true;
  }
  return false;
}
function isDomainAllowed(event, url, directives) {
  if (!validateSender(event)) {
    return false;
  }
  try {
    const domain2 = new URL(url).host;
    const ruleForDomain = CspPolicies[domain2] ?? NativeSettings.store.customCspRules[domain2];
    if (!ruleForDomain) return false;
    return directives.every((d) => ruleForDomain.includes(d));
  } catch (e) {
    return false;
  }
}

// src/main/ipcMain.ts
init_constants();
init_makeLinksOpenExternally();
var RENDERER_CSS_PATH = (0, import_path26.join)(__dirname, "renderer.css");
var USERPLUGINS_DIR = (0, import_path26.join)(DATA_DIR, "userplugins");
(0, import_fs9.mkdirSync)(THEMES_DIR, { recursive: true });
(0, import_fs9.mkdirSync)(USERPLUGINS_DIR, { recursive: true });
registerCspIpcHandlers();
function ensureSafePath(basePath, path) {
  const normalizedBasePath = (0, import_path26.normalize)(basePath + "/");
  const newPath = (0, import_path26.join)(basePath, path);
  const normalizedPath = (0, import_path26.normalize)(newPath);
  const base = normalizedBasePath.toLowerCase();
  const target = normalizedPath.toLowerCase();
  return target.startsWith(base) ? normalizedPath : null;
}
function validateSender(event) {
  if (!event || !event.sender) return false;
  const frame = event.senderFrame;
  if (!frame) return false;
  const url = frame.url;
  if (!url) return false;
  if (url.startsWith("file://")) {
    const normalizedPath = (0, import_path26.normalize)(url.replace("file://", ""));
    const appPath = (0, import_path26.normalize)(import_electron36.app.getAppPath());
    return normalizedPath.startsWith(appPath);
  }
  if (url.startsWith("data:")) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") {
      const host = parsed.hostname.toLowerCase();
      return host === "discord.com" || host.endsWith(".discord.com") || host === "discordapp.com" || host.endsWith(".discordapp.com");
    }
  } catch {
  }
  return false;
}
function verifySignature(filePath) {
  if (process.platform !== "win32") return Promise.resolve(true);
  const { execFile: execFile3 } = require("child_process");
  return new Promise((resolve2) => {
    execFile3("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `(Get-AuthenticodeSignature -FilePath '${filePath.replace(/'/g, "''")}').Status`
    ], (error, stdout) => {
      if (error) {
        resolve2(false);
        return;
      }
      resolve2(stdout.trim() === "Valid");
    });
  });
}
function readCss2() {
  return (0, import_promises8.readFile)(QUICK_CSS_PATH, "utf-8").catch(() => "");
}
async function listThemes() {
  try {
    const files = await (0, import_promises8.readdir)(THEMES_DIR);
    return await Promise.all(files.map(async (fileName) => ({ fileName, content: await getThemeData(fileName) })));
  } catch {
    return [];
  }
}
function getThemeData(fileName) {
  fileName = fileName.replace(/\?v=\d+$/, "");
  const safePath = ensureSafePath(THEMES_DIR, fileName);
  if (!safePath) return Promise.reject(`Unsafe path ${fileName}`);
  return (0, import_promises8.readFile)(safePath, "utf-8");
}
import_electron36.ipcMain.handle("WorldBombType" /* WORLD_BOMB_TYPE */, async (event, text, delay = 50) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  if (process.platform !== "win32") return;
  const { spawn: spawn2 } = require("child_process");
  const { writeFileSync: writeFileSync8, unlinkSync: unlinkSync2, mkdtempSync, rmSync: rmSync3 } = require("fs");
  const { join: join31 } = require("path");
  const { tmpdir: tmpdir2 } = require("os");
  if (!/^[\x20-\x7E]*$/.test(text)) {
    throw new Error("WorldBombType: disallowed characters");
  }
  const safeDelay = Math.max(0, Math.min(1e4, delay));
  const psLines = [
    "Add-Type -AssemblyName System.WindowsForms;",
    "$text = $args[0];",
    "$delay = [int]$args[1];",
    "foreach ($char in $text.ToCharArray()) {",
    "  [System.Windows.Forms.SendKeys]::SendWait($char);",
    "  if ($delay -gt 0) { Start-Sleep -m $delay; }",
    "}"
  ];
  const psScript = psLines.join("\r\n");
  const tempDir = mkdtempSync(join31(tmpdir2(), "midnightcord-wb-"));
  const tempFile = join31(tempDir, "sendkeys.ps1");
  try {
    writeFileSync8(tempFile, "\uFEFF" + psScript, "utf8");
    const child = spawn2("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      tempFile,
      text,
      String(safeDelay)
    ]);
    await new Promise((resolve2, reject) => {
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) resolve2();
        else reject(new Error(`PowerShell exit code ${code}`));
      });
    });
  } finally {
    try {
      unlinkSync2(tempFile);
    } catch {
    }
    try {
      rmSync3(tempDir, { recursive: true, force: true });
    } catch {
    }
  }
});
function runPowershellScript(psScript) {
  if (process.platform !== "win32") return Promise.resolve();
  const { spawn: spawn2 } = require("child_process");
  const { writeFileSync: writeFileSync8, unlinkSync: unlinkSync2, mkdtempSync, rmSync: rmSync3 } = require("fs");
  const { join: join31 } = require("path");
  const { tmpdir: tmpdir2 } = require("os");
  const tempDir = mkdtempSync(join31(tmpdir2(), "midnightcord-ps-"));
  const tempFile = join31(tempDir, "script.ps1");
  return new Promise((resolve2, reject) => {
    try {
      writeFileSync8(tempFile, "\uFEFF" + psScript, "utf8");
      const child = spawn2("powershell", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        tempFile
      ]);
      child.on("error", reject);
      child.on("exit", (code) => {
        try {
          unlinkSync2(tempFile);
        } catch {
        }
        try {
          rmSync3(tempDir, { recursive: true, force: true });
        } catch {
        }
        if (code === 0) resolve2();
        else reject(new Error(`PowerShell exit code ${code}`));
      });
    } catch (e) {
      try {
        unlinkSync2(tempFile);
      } catch {
      }
      try {
        rmSync3(tempDir, { recursive: true, force: true });
      } catch {
      }
      reject(e);
    }
  });
}
import_electron36.ipcMain.handle("WorldBombPressEnter" /* WORLD_BOMB_PRESS_ENTER */, (event) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  return runPowershellScript(`
        $sig = '[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);'
        Add-Type -MemberDefinition $sig -Name WinAPI -Namespace NC -ErrorAction SilentlyContinue
        [NC.WinAPI]::keybd_event(0x0D, 0x1C, 0, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 20
        [NC.WinAPI]::keybd_event(0x0D, 0x1C, 2, [UIntPtr]::Zero)
    `);
});
import_electron36.ipcMain.handle("WorldBombPressBackspace" /* WORLD_BOMB_PRESS_BACKSPACE */, (event) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  return runPowershellScript("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{BACKSPACE}')");
});
import_electron36.ipcMain.handle("WorldBombClick" /* WORLD_BOMB_CLICK */, (event, x2, y) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  const safeX = Math.max(0, Math.min(99999, Math.round(x2)));
  const safeY = Math.max(0, Math.min(99999, Math.round(y)));
  return runPowershellScript(`
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
        Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);' -Name "Win32" -Namespace Win32 -PassThru | Out-Null;
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${safeX}, ${safeY});
        [Win32.Win32]::mouse_event(0x0002, 0, 0, 0, 0);
        [Win32.Win32]::mouse_event(0x0004, 0, 0, 0, 0);
    `);
});
import_electron36.ipcMain.handle("WorldBombSequence" /* WORLD_BOMB_SEQUENCE */, async (event, word, lps, humanChance, targetX = -1, targetY = -1) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  if (process.platform !== "win32") return;
  const { spawn: spawn2 } = require("child_process");
  const { writeFileSync: writeFileSync8, unlinkSync: unlinkSync2, mkdtempSync, rmSync: rmSync3 } = require("fs");
  const { join: join31 } = require("path");
  const { tmpdir: tmpdir2 } = require("os");
  if (!/^[\x20-\x7E]+$/.test(word)) {
    throw new Error("WorldBombSequence: disallowed characters");
  }
  const safeLps = Math.max(1, Math.min(100, lps));
  const safeHumanChance = Math.max(0, Math.min(100, humanChance));
  let targetWindow = import_electron36.BrowserWindow.fromWebContents(event.sender);
  let mainHwnd = 0;
  if (streamProofWindow && targetWindow === streamProofWindow) {
    const allWins = import_electron36.BrowserWindow.getAllWindows();
    const mainWin2 = allWins.find((w) => w !== streamProofWindow && !w.isDestroyed());
    if (mainWin2) {
      targetWindow = mainWin2;
      try {
        const handleBuf = mainWin2.getNativeWindowHandle();
        if (handleBuf && handleBuf.length >= 4) {
          mainHwnd = handleBuf.readInt32LE(0);
        }
      } catch (err2) {
        console.error("Error reading main window handle:", err2);
      }
    }
  } else if (targetWindow) {
    try {
      const handleBuf = targetWindow.getNativeWindowHandle();
      if (handleBuf && handleBuf.length >= 4) {
        mainHwnd = handleBuf.readInt32LE(0);
      }
    } catch (err2) {
      console.error("Error reading window handle:", err2);
    }
  }
  const bounds = targetWindow?.getBounds() ?? { x: 0, y: 0, width: 1280, height: 720 };
  const centerX = targetX >= 0 ? Math.round(targetX) : Math.round(bounds.x + bounds.width / 2);
  const centerY = targetY >= 0 ? Math.round(targetY) : Math.round(bounds.y + bounds.height / 2);
  const minMs = Math.max(10, Math.round(1e3 / (safeLps * 1.5)));
  const maxMs = Math.max(minMs + 1, Math.round(1e3 / safeLps));
  const baseMs = Math.round((minMs + maxMs) / 2);
  const lines = [
    '$ErrorActionPreference = "Stop"',
    "try {",
    "  Add-Type -AssemblyName System.Windows.Forms",
    "  Add-Type -AssemblyName System.Drawing",
    `  $sig = '[DllImport("user32.dll")] public static extern void mouse_event(uint a, uint b, uint c, uint d, uint e); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);'`,
    "  Add-Type -MemberDefinition $sig -Name WinAPI -Namespace NC -ErrorAction SilentlyContinue",
    "  $handle = [IntPtr]::Zero"
  ];
  if (mainHwnd > 0) {
    lines.push(`  $handle = [IntPtr]${mainHwnd}`);
  } else {
    lines.push(`  $proc = Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue`);
    lines.push("  if ($proc) { $handle = $proc.MainWindowHandle }");
  }
  lines.push(
    "  if ($handle -ne [IntPtr]::Zero) {",
    "    [NC.WinAPI]::SetForegroundWindow($handle) | Out-Null",
    "    Start-Sleep -Milliseconds 10",
    "  }",
    `  [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${centerX}, ${centerY})`,
    "  [NC.WinAPI]::mouse_event(2, 0, 0, 0, 0)",
    "  [NC.WinAPI]::mouse_event(4, 0, 0, 0, 0)",
    "  Start-Sleep -Milliseconds 10"
  );
  for (const char of word) {
    if (safeHumanChance > 0) {
      lines.push(`  if ((Get-Random -Minimum 1 -Maximum 101) -le ${safeHumanChance}) {`);
      lines.push("    [System.Windows.Forms.SendKeys]::SendWait('x')");
      lines.push(`    Start-Sleep -Milliseconds ${baseMs}`);
      lines.push("    [System.Windows.Forms.SendKeys]::SendWait('{BACKSPACE}')");
      lines.push(`    Start-Sleep -Milliseconds ${baseMs}`);
      lines.push("  }");
    }
    lines.push(`  [System.Windows.Forms.SendKeys]::SendWait('${char.replace(/'/g, "''")}')`);
    lines.push(`  Start-Sleep -Milliseconds (Get-Random -Minimum ${minMs} -Maximum ${maxMs})`);
  }
  lines.push("  [NC.WinAPI]::keybd_event(0x0D, 0x1C, 0, [UIntPtr]::Zero)");
  lines.push("  Start-Sleep -Milliseconds 20");
  lines.push("  [NC.WinAPI]::keybd_event(0x0D, 0x1C, 2, [UIntPtr]::Zero)");
  lines.push("} catch { exit 1 }");
  const psScript = lines.join("\r\n");
  const tempDir = mkdtempSync(join31(tmpdir2(), "midnightcord-wbs-"));
  const tempFile = join31(tempDir, "sequence.ps1");
  try {
    writeFileSync8(tempFile, "\uFEFF" + psScript, "utf8");
    await new Promise((resolve2, reject) => {
      const child = spawn2("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        tempFile
      ]);
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) resolve2();
        else reject(new Error(`PowerShell exit code ${code}`));
      });
    });
  } finally {
    try {
      unlinkSync2(tempFile);
    } catch {
    }
    try {
      rmSync3(tempDir, { recursive: true, force: true });
    } catch {
    }
  }
});
import_electron36.ipcMain.handle("WorldBombGetCursorPos" /* WORLD_BOMB_GET_CURSOR_POS */, (event) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  return import_electron36.screen.getCursorScreenPoint();
});
var streamProofWindow = null;
import_electron36.ipcMain.handle("WorldBombOpenWindow" /* WORLD_BOMB_OPEN_WINDOW */, (event, lps = 50, humanChance = 10, safeMode = false, theme = "", playMode = "Normal", noSpace = false, groqKey = "", words = [], streamProof = false) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  if (streamProofWindow) {
    streamProofWindow.close();
    streamProofWindow = null;
    return { status: "closed" };
  }
  streamProofWindow = new import_electron36.BrowserWindow({
    width: 326,
    height: 180,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: (0, import_path26.join)(__dirname, "worldbomb-preload.js"),
      sandbox: false,
      webSecurity: false
    }
  });
  try {
    streamProofWindow.setContentProtection(streamProof);
  } catch (e) {
    console.error("setContentProtection error:", e);
  }
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { margin: 0; padding: 12px; background: transparent; overflow: hidden; font-family: system-ui, -apple-system, sans-serif; -webkit-app-region: no-drag; }
* { -webkit-app-region: no-drag; }
#drag-header { -webkit-app-region: drag; }
.nc-wb-overlay {
    position: relative;
    background: #242528;
    color: #dbdee1;
    border-radius: 12px;
    padding: 16px;
    width: 300px;
    box-sizing: border-box;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
    user-select: none;
    border: 1px solid rgba(255, 255, 255, 0.08);
}
.nc-wb-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    width: calc(100% - 30px);
    cursor: grab;
}
.nc-wb-header h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #ffffff;
    display: flex;
    align-items: center;
    gap: 6px;
}
.nc-wb-close {
    position: absolute;
    top: 14px;
    right: 14px;
    cursor: pointer;
    color: #b5bac1;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    font-size: 10px;
    z-index: 99999;
    -webkit-app-region: no-drag;
}
.nc-wb-close:hover {
    color: #dbdee1;
    background: rgba(78, 80, 88, 0.16);
}
.nc-wb-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.nc-wb-input-row {
    display: flex;
    gap: 8px;
}
.nc-wb-input {
    flex: 1;
    background: #1e1f22;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 8px 10px;
    color: #dbdee1;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
}
.nc-wb-input:focus {
    border-color: #5865f2;
}
.nc-wb-button {
    background: #5865f2;
    color: #ffffff;
    border: none;
    border-radius: 6px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s ease;
}
.nc-wb-button:hover {
    background: #4e5dcd;
}
.nc-wb-button:active {
    background: #3c4aa9;
}
.nc-wb-status {
    font-size: 11px;
    color: #949ba4;
    font-weight: 500;
}
.nc-wb-definition {
    font-size: 11px;
    line-height: 1.4;
    color: #dbdee1;
    background: #2b2d31;
    padding: 8px 10px;
    border-radius: 0 6px 6px 0;
    border-left: 3px solid #5865f2;
    max-height: 60px;
    overflow-y: auto;
}
.nc-wb-definition::-webkit-scrollbar {
    width: 4px;
}
.nc-wb-definition::-webkit-scrollbar-track {
    background: transparent;
}
.nc-wb-definition::-webkit-scrollbar-thumb {
    background: #4e5058;
    border-radius: 2px;
}
.nc-wb-definition::-webkit-scrollbar-thumb:hover {
    background: #6d6f78;
}

/* Settings styling */
.nc-wb-range-container {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
}
.nc-wb-range-container label {
    font-size: 11px;
    font-weight: 600;
    color: #949ba4;
    text-transform: uppercase;
}
.nc-wb-range-val {
    color: #dbdee1;
    font-weight: 700;
    float: right;
}
.nc-wb-slider {
    -webkit-appearance: none;
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: #1e1f22;
    outline: none;
    margin: 4px 0;
}
.nc-wb-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #5865f2;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}
.nc-wb-settings-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.nc-wb-settings-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
}
.nc-wb-settings-label {
    font-size: 12px;
    font-weight: 600;
    color: #ffffff;
}
.nc-wb-settings-sublabel {
    font-size: 10px;
    color: #949ba4;
}
.nc-wb-switch {
    position: relative;
    display: inline-block;
    width: 36px;
    height: 20px;
    cursor: pointer;
}
.nc-wb-switch input {
    opacity: 0;
    width: 0;
    height: 0;
}
.nc-wb-switch-slider {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-color: #80848e;
    transition: .15s ease;
    border-radius: 10px;
}
.nc-wb-switch-slider:before {
    position: absolute;
    content: "";
    height: 14px;
    width: 14px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: .15s ease;
    border-radius: 50%;
}
input:checked + .nc-wb-switch-slider {
    background-color: #23a55a;
}
input:checked + .nc-wb-switch-slider:before {
    transform: translateX(16px);
}

/* Custom Dropdown select style */
.nc-wb-select-custom {
    position: relative;
    width: 100%;
}
.nc-wb-select-trigger {
    background: #1e1f22;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 8px 10px;
    color: #dbdee1;
    font-size: 13px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    box-sizing: border-box;
}
.nc-wb-select-trigger:hover {
    border-color: rgba(255, 255, 255, 0.16);
}
.nc-wb-select-dropdown {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0; right: 0;
    background: #1e1f22;
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 6px;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.24);
    z-index: 10000;
    overflow: hidden;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    box-sizing: border-box;
}
.nc-wb-select-option {
    padding: 6px 10px;
    color: #b5bac1;
    font-size: 13px;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    box-sizing: border-box;
}
.nc-wb-select-option:hover {
    background: rgba(78, 80, 88, 0.16);
    color: #dbdee1;
}
.nc-wb-select-option.selected {
    background: #5865f2;
    color: #ffffff;
}

/* Footer & Settings Toggle button */
.nc-wb-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    -webkit-app-region: no-drag;
    pointer-events: auto;
}
.nc-wb-settings-btn {
    cursor: pointer;
    color: #b5bac1;
    font-size: 14px;
    transition: color 0.15s ease, transform 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-app-region: no-drag;
    pointer-events: auto;
    padding: 4px;
}
.nc-wb-settings-btn:hover {
    color: #dbdee1;
    transform: rotate(30deg);
}
.nc-wb-status-footer {
    font-size: 10px;
    color: #949ba4;
    font-weight: 500;
}
</style>
</head>
<body>
<div class="nc-wb-overlay">
    <div class="nc-wb-close" id="btn-close">\u2715</div>
    <div class="nc-wb-header" id="drag-header">
        <h3>\u{1F3AF} WordBomb Helper</h3>
    </div>
    
    <!-- Home View -->
    <div class="nc-wb-content" id="view-home">
        <div class="nc-wb-input-row">
            <input type="text" class="nc-wb-input" id="syllable" placeholder="Enter Syllable..." autofocus autocomplete="off" spellcheck="false" />
            <button class="nc-wb-button" id="btn-find">FIND</button>
        </div>
        <div class="nc-wb-status" id="status">Ready...</div>
        <div id="definition-container" style="display: none;" class="nc-wb-definition">
            <strong style="color: #5865f2">Definition:</strong> <span id="definition-text"></span>
        </div>
    </div>

    <!-- Settings View -->
    <div class="nc-wb-content" id="view-settings" style="display: none;">
        <div class="nc-wb-range-container">
            <label>Speed (LPS) <span class="nc-wb-range-val" id="val-lps">50</span></label>
            <input type="range" min="10" max="100" step="1" class="nc-wb-slider" id="slide-lps" />
        </div>
        <div class="nc-wb-range-container">
            <label>Error Chance <span class="nc-wb-range-val" id="val-error">0%</span></label>
            <input type="range" min="0" max="100" step="1" class="nc-wb-slider" id="slide-error" />
        </div>
        <div class="nc-wb-range-container">
            <label>Theme (Optional)</label>
            <input type="text" class="nc-wb-input" id="input-theme" placeholder="e.g. tech, nature..." />
        </div>
        <div class="nc-wb-range-container" style="margin-bottom: 12px;">
            <label>Play Style</label>
            <div class="nc-wb-select-custom" id="select-playmode">
                <div class="nc-wb-select-trigger" id="playmode-trigger">
                    <span id="playmode-label">Normal</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 10l5 5 5-5H7z"/>
                    </svg>
                </div>
                <div class="nc-wb-select-dropdown" id="playmode-dropdown" style="display: none;">
                    <div class="nc-wb-select-option" data-value="Normal">Normal</div>
                    <div class="nc-wb-select-option" data-value="Pro">Pro Mod (Long & Complex)</div>
                    <div class="nc-wb-select-option" data-value="Noob">Noob Mod (Short & Simple)</div>
                </div>
            </div>
        </div>
        <div class="nc-wb-settings-row">
            <div class="nc-wb-settings-info">
                <span class="nc-wb-settings-label">No Spaces or Dashes</span>
                <span class="nc-wb-settings-sublabel">Do not type words with spaces/dashes</span>
            </div>
            <label class="nc-wb-switch">
                <input type="checkbox" id="chk-nospace" />
                <span class="nc-wb-switch-slider"></span>
            </label>
        </div>
        <div class="nc-wb-settings-row">
            <div class="nc-wb-settings-info">
                <span class="nc-wb-settings-label">Safe Mode (Def.)</span>
                <span class="nc-wb-settings-sublabel">Generate AI word definitions</span>
            </div>
            <label class="nc-wb-switch">
                <input type="checkbox" id="chk-safemode" />
                <span class="nc-wb-switch-slider"></span>
            </label>
        </div>
        <div class="nc-wb-settings-row" style="margin-bottom: 12px;">
            <div class="nc-wb-settings-info">
                <span class="nc-wb-settings-label">StreamProof</span>
                <span class="nc-wb-settings-sublabel">Hide window from stream capture</span>
            </div>
            <label class="nc-wb-switch">
                <input type="checkbox" id="chk-streamproof" />
                <span class="nc-wb-switch-slider"></span>
            </label>
        </div>
        <button class="nc-wb-button" id="btn-back" style="width: 100%;">BACK</button>
    </div>

    <!-- Footer -->
    <div class="nc-wb-footer">
        <div class="nc-wb-settings-btn" id="btn-settings">\u2699</div>
        <div class="nc-wb-status-footer" id="status-footer">LPS: 50 | Error: 0%</div>
    </div>
</div>

<script>
    // Variables & settings
    let dictionary = ${JSON.stringify(words)};
    let history = [];
    let badWords = new Set();
    let themeWords = new Set();
    
    // Load local storage settings or default values
    const loadSetting = (key, def) => {
        try {
            const val = localStorage.getItem(key);
            if (val !== null) return val;
        } catch {}
        return def;
    };
    const saveSetting = (key, val) => {
        try { localStorage.setItem(key, String(val)); } catch {}
    };

    let lps = parseFloat(loadSetting('wb_lps', '${lps}'));
    let humanChance = parseInt(loadSetting('wb_humanChance', '${humanChance}'));
    let safeMode = loadSetting('wb_safeMode', '${safeMode}') === 'true';
    let theme = loadSetting('wb_theme', '${theme}');
    let playMode = loadSetting('wb_playMode', '${playMode}');
    let noSpace = loadSetting('wb_noSpace', '${noSpace}') === 'true';
    let streamProof = loadSetting('wb_streamProof', '${streamProof}') === 'true';
    const groqKey = "${groqKey}";

    // Set initial UI states
    document.getElementById('status').innerText = "Ready (" + dictionary.length + " words)";
    document.getElementById('status-footer').innerText = "LPS: " + lps + " | Error: " + humanChance + "%";
    
    // Setup inputs values in settings
    document.getElementById('slide-lps').value = lps;
    document.getElementById('val-lps').innerText = lps;
    document.getElementById('slide-error').value = humanChance;
    document.getElementById('val-error').innerText = humanChance + "%";
    document.getElementById('input-theme').value = theme;
    document.getElementById('chk-nospace').checked = noSpace;
    document.getElementById('chk-safemode').checked = safeMode;
    document.getElementById('chk-streamproof').checked = streamProof;
    window.worldBombAPI.setStreamProof(streamProof);
    
    // Setup PlayMode selected
    const trigger = document.getElementById('playmode-trigger');
    const dropdown = document.getElementById('playmode-dropdown');
    const playmodeLabel = document.getElementById('playmode-label');
    
    // Set playmode trigger label text
    const styleOptions = {
        'Normal': 'Normal',
        'Pro': 'Pro Mod (Long & Complex)',
        'Noob': 'Noob Mod (Short & Simple)'
    };
    playmodeLabel.innerText = styleOptions[playMode] || 'Normal';
    document.querySelectorAll('.nc-wb-select-option').forEach(o => {
        if (o.getAttribute('data-value') === playMode) o.classList.add('selected');
        else o.classList.remove('selected');
    });

    // Theme fetching
    function fetchTheme() {
        if (theme.trim().length > 0) {
            fetch("https://fr.wikipedia.org/w/api.php?action=query&list=search&srsearch=" + encodeURIComponent(theme) + "&utf8=&format=json&srlimit=1")
                .then(r => r.json())
                .then(d => {
                    if (d.query && d.query.search && d.query.search[0] && d.query.search[0].pageid) {
                        const pageId = d.query.search[0].pageid;
                        return fetch("https://fr.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&pageids=" + pageId + "&format=json");
                    }
                    throw new Error("No page");
                })
                .then(r => r.json())
                .then(d => {
                    const pages = d.query && d.query.pages;
                    if (pages) {
                        const textObj = Object.values(pages)[0];
                        if (textObj && textObj.extract) {
                            themeWords.clear();
                            const words = textObj.extract.toLowerCase().match(/[a-z\xE0\xE2\xE7\xE9\xE8\xEA\xEB\xEE\xEF\xF4\xFB\xF9\xFC\xFF\xF1\xE6\u0153]+/g) || [];
                            words.forEach(w => {
                                if (w.length > 3) themeWords.add(w);
                            });
                            if (themeWords.size > 0) {
                                document.getElementById('status').innerText = "Ready (" + dictionary.length + " words) (+ Theme)";
                            }
                        }
                    }
                }).catch(e => console.error("Theme fetch error:", e));
        }
    }
    fetchTheme();

    // Toggle Settings panel
    let isSettingsOpen = false;
    const homeView = document.getElementById('view-home');
    const settingsView = document.getElementById('view-settings');
    const btnSettings = document.getElementById('btn-settings');
    
    function toggleSettings() {
        isSettingsOpen = !isSettingsOpen;
        if (isSettingsOpen) {
            homeView.style.display = 'none';
            settingsView.style.display = 'flex';
            btnSettings.innerText = '\u2715';
            window.worldBombAPI.resize(326, 450);
        } else {
            settingsView.style.display = 'none';
            homeView.style.display = 'flex';
            btnSettings.innerText = '\u2699';
            
            // Adjust height based on definition container visibility
            const hasDef = document.getElementById('definition-container').style.display !== 'none';
            window.worldBombAPI.resize(326, hasDef ? 220 : 180);
            setTimeout(() => document.getElementById('syllable').focus(), 50);
        }
    }
    btnSettings.onclick = toggleSettings;
    document.getElementById('btn-back').onclick = toggleSettings;

    // Trigger settings updates
    document.getElementById('slide-lps').oninput = (e) => {
        lps = parseFloat(e.target.value);
        document.getElementById('val-lps').innerText = lps;
        document.getElementById('status-footer').innerText = "LPS: " + lps + " | Error: " + humanChance + "%";
        saveSetting('wb_lps', lps);
    };
    document.getElementById('slide-error').oninput = (e) => {
        humanChance = parseInt(e.target.value);
        document.getElementById('val-error').innerText = humanChance + "%";
        document.getElementById('status-footer').innerText = "LPS: " + lps + " | Error: " + humanChance + "%";
        saveSetting('wb_humanChance', humanChance);
    };
    document.getElementById('input-theme').onchange = (e) => {
        theme = e.target.value.toLowerCase().trim();
        saveSetting('wb_theme', theme);
        fetchTheme();
    };
    document.getElementById('chk-nospace').onchange = (e) => {
        noSpace = e.target.checked;
        saveSetting('wb_noSpace', noSpace);
    };
    document.getElementById('chk-safemode').onchange = (e) => {
        safeMode = e.target.checked;
        saveSetting('wb_safeMode', safeMode);
        if (!safeMode) document.getElementById('definition-container').style.display = 'none';
    };
    document.getElementById('chk-streamproof').onchange = (e) => {
        streamProof = e.target.checked;
        saveSetting('wb_streamProof', streamProof);
        window.worldBombAPI.setStreamProof(streamProof);
    };

    // Custom select trigger
    trigger.onclick = (e) => {
        e.stopPropagation();
        const isOpen = dropdown.style.display === 'flex';
        dropdown.style.display = isOpen ? 'none' : 'flex';
        trigger.style.borderColor = isOpen ? 'rgba(255, 255, 255, 0.08)' : '#5865f2';
    };
    document.addEventListener('click', () => {
        dropdown.style.display = 'none';
        trigger.style.borderColor = 'rgba(255, 255, 255, 0.08)';
    });
    document.querySelectorAll('.nc-wb-select-option').forEach(opt => {
        opt.onclick = (e) => {
            e.stopPropagation();
            const val = opt.getAttribute('data-value');
            playMode = val;
            playmodeLabel.innerText = opt.innerText;
            dropdown.style.display = 'none';
            trigger.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            saveSetting('wb_playMode', val);
            document.querySelectorAll('.nc-wb-select-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
        };
    });

    // FIND / Search Logic
    const letters = "abcdefghijklmnopqrstuvwxyz-".split("");
    function getMissingAlphabet() {
        if (history.length === 0) return letters;
        return history[history.length - 1].alphabet;
    }

    function computeScore(word, currentMissing) {
        let score = 0;
        let found = new Set();
        for (let char of word) {
            if (currentMissing.includes(char) && !found.has(char)) {
                score += 100;
                found.add(char);
            }
        }
        if (themeWords.has(word)) {
            score += 1000;
        }
        if (playMode === "Pro") {
            score += word.length * 5;
        } else if (playMode === "Noob") {
            score -= word.length * 10;
        }
        return score;
    }

    function processSearch() {
        const syl = document.getElementById('syllable').value.toLowerCase().trim();
        if (!syl || dictionary.length === 0) return;
        
        let validWords = dictionary.filter(w => {
            const low = w.toLowerCase();
            if (!low.includes(syl)) return false;
            if (badWords.has(low)) return false;
            if (noSpace && (low.includes(' ') || low.includes('-'))) return false;
            if (playMode === "Pro" && low.length < 13) return false;
            if (playMode === "Noob" && low.length > 7) return false;
            return true;
        });
        if (validWords.length === 0) {
            document.getElementById('status').innerText = "No word found!";
            document.getElementById('status').style.color = "#ef4444";
            return;
        }

        const currentMissing = getMissingAlphabet();
        validWords.sort((a, b) => computeScore(b, currentMissing) - computeScore(a, currentMissing));
        
        const bestWord = validWords[0];
        document.getElementById('status').innerText = "Typing: " + bestWord + "...";
        document.getElementById('status').style.color = "#5865f2";
        
        let newMissing = currentMissing.filter(c => !bestWord.includes(c));
        if (newMissing.length === 0) newMissing = letters;
        history.push({ alphabet: newMissing, word: bestWord });
        badWords.add(bestWord);
        
        document.getElementById('syllable').value = "";
        document.body.style.pointerEvents = "none";
        
        if (safeMode) {
            const defContainer = document.getElementById('definition-container');
            const defText = document.getElementById('definition-text');
            defContainer.style.display = 'block';
            defText.innerText = 'Generating AI definition...';
            
            // Adjust height since definition container is shown
            if (!isSettingsOpen) window.worldBombAPI.resize(326, 220);

            if (!groqKey) {
                defText.innerText = "Error: Groq API key not found.";
            } else {
                fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: "Bearer " + groqKey,
                    },
                    body: JSON.stringify({
                        model: "llama-3.1-8b-instant",
                        temperature: 0.7,
                        max_tokens: 150,
                        messages: [{
                            role: "user",
                            content: 'Give a very short definition (1 simple sentence) for the following word in French, explaining what it is concretely. Word: "' + bestWord + '"'
                        }]
                    }),
                })
                .then(r => r.json())
                .then(data => {
                    const ans = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
                    if (ans) {
                        defText.innerText = ans.trim();
                    } else {
                        defText.innerText = "AI could not define this word.";
                    }
                })
                .catch(() => defText.innerText = "Network error.");
            }
        } else {
            document.getElementById('definition-container').style.display = 'none';
            if (!isSettingsOpen) window.worldBombAPI.resize(326, 180);
        }

        let timeoutId = setTimeout(() => {
            document.body.style.pointerEvents = "auto";
            document.getElementById('status').innerText = "Ready (Timeout)";
            document.getElementById('status').style.color = "#ef4444";
            document.getElementById('syllable').focus();
        }, 5000);

        window.worldBombAPI.sequence(bestWord, lps, humanChance)
            .then(() => {
                clearTimeout(timeoutId);
                document.getElementById('status').innerText = "Ready!";
            })
            .catch(err => {
                clearTimeout(timeoutId);
                document.getElementById('status').innerText = "Input error";
                document.getElementById('status').style.color = "#ef4444";
            })
            .finally(() => {
                document.body.style.pointerEvents = "auto";
                setTimeout(() => document.getElementById('syllable').focus(), 50);
            });
    }

    document.getElementById('btn-find').onclick = processSearch;
    document.getElementById('btn-close').onclick = () => {
        window.worldBombAPI.closeWindow();
    };
    document.getElementById('syllable').onkeydown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            processSearch();
        }
    };
</script>
</body>
</html>
    `;
  try {
    const { writeFileSync: writeFileSync8 } = require("fs");
    const { join: join31 } = require("path");
    const { DATA_DIR: DATA_DIR3 } = (init_constants(), __toCommonJS(constants_exports));
    const htmlPath = join31(DATA_DIR3, "worldbomb.html");
    writeFileSync8(htmlPath, htmlContent, "utf-8");
    streamProofWindow.loadFile(htmlPath);
  } catch (e) {
    streamProofWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(htmlContent));
  }
  streamProofWindow.on("closed", () => {
    streamProofWindow = null;
  });
});
import_electron36.ipcMain.on("WorldBombCloseWindow" /* WORLD_BOMB_CLOSE_WINDOW */, () => {
  if (streamProofWindow) {
    streamProofWindow.close();
    streamProofWindow = null;
  }
});
import_electron36.ipcMain.on("WorldBombSetStreamProof" /* WORLD_BOMB_SET_STREAM_PROOF */, (event, enabled) => {
  if (streamProofWindow) {
    try {
      streamProofWindow.setContentProtection(enabled);
    } catch (e) {
      console.error("setContentProtection error:", e);
    }
  }
});
import_electron36.ipcMain.on("WorldBombResizeWindow" /* WORLD_BOMB_RESIZE_WINDOW */, (event, width, height) => {
  if (streamProofWindow) {
    try {
      streamProofWindow.setSize(width, height);
    } catch (e) {
      console.error("setSize error:", e);
    }
  }
});
import_electron36.ipcMain.handle("MidnightcordSetContentProtection" /* SET_CONTENT_PROTECTION */, (event, enabled) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  const win = import_electron36.BrowserWindow.fromWebContents(event.sender);
  if (win) {
    try {
      win.setContentProtection(enabled);
      return true;
    } catch (e) {
      console.error("Failed to set content protection:", e);
    }
  }
  return false;
});
import_electron36.ipcMain.handle("VencordOpenQuickCss" /* OPEN_QUICKCSS */, (event) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  return import_electron36.shell.openPath(QUICK_CSS_PATH);
});
import_electron36.ipcMain.handle("VencordOpenExternal" /* OPEN_EXTERNAL */, (event, url) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  try {
    var { protocol: protocol3 } = new URL(url);
  } catch {
    throw "Malformed URL";
  }
  if (!ALLOWED_PROTOCOLS.includes(protocol3))
    throw "Disallowed protocol.";
  import_electron36.shell.openExternal(url);
});
import_electron36.ipcMain.handle("VencordGetQuickCss" /* GET_QUICK_CSS */, (event) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  return readCss2();
});
import_electron36.ipcMain.handle("VencordSetQuickCss" /* SET_QUICK_CSS */, (event, css) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  return (0, import_fs9.writeFileSync)(QUICK_CSS_PATH, css);
});
import_electron36.ipcMain.handle("VencordGetThemesDir" /* GET_THEMES_DIR */, (event) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  return THEMES_DIR;
});
import_electron36.ipcMain.handle("VencordGetThemesList" /* GET_THEMES_LIST */, (event) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  return listThemes();
});
import_electron36.ipcMain.handle("VencordGetThemeData" /* GET_THEME_DATA */, (event, fileName) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  return getThemeData(fileName);
});
import_electron36.ipcMain.handle("VencordDeleteTheme" /* DELETE_THEME */, (event, fileName) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  const safePath = ensureSafePath(THEMES_DIR, fileName);
  if (!safePath) return Promise.reject(`Unsafe path ${fileName}`);
  return (0, import_promises8.unlink)(safePath);
});
import_electron36.ipcMain.handle("VencordGetThemeSystemValues" /* GET_THEME_SYSTEM_VALUES */, (event) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  let accentColor = import_electron36.systemPreferences.getAccentColor?.() ?? "";
  if (accentColor.length && accentColor[0] !== "#") {
    accentColor = `#${accentColor}`;
  }
  return {
    "os-accent-color": accentColor
  };
});
import_electron36.ipcMain.handle("VencordOpenThemesFolder" /* OPEN_THEMES_FOLDER */, (event) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  return import_electron36.shell.openPath(THEMES_DIR);
});
import_electron36.ipcMain.handle("VencordOpenSettingsFolder" /* OPEN_SETTINGS_FOLDER */, (event) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  return import_electron36.shell.openPath(SETTINGS_DIR);
});
import_electron36.ipcMain.handle("VencordInitFileWatchers" /* INIT_FILE_WATCHERS */, (event) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  const { sender } = event;
  let quickCssWatcher2;
  let rendererCssWatcher;
  (0, import_promises8.open)(QUICK_CSS_PATH, "a+").then((fd2) => {
    fd2.close();
    quickCssWatcher2 = (0, import_fs9.watch)(QUICK_CSS_PATH, { persistent: false }, debounce(async () => {
      sender.postMessage("VencordQuickCssUpdate" /* QUICK_CSS_UPDATE */, await readCss2());
    }, 50));
  }).catch(() => {
  });
  const themesWatcher2 = (0, import_fs9.watch)(THEMES_DIR, { persistent: false }, debounce(() => {
    sender.postMessage("VencordThemeUpdate" /* THEME_UPDATE */, void 0);
  }));
  if (IS_DEV) {
    rendererCssWatcher = (0, import_fs9.watch)(RENDERER_CSS_PATH, { persistent: false }, async () => {
      sender.postMessage("VencordRendererCssUpdate" /* RENDERER_CSS_UPDATE */, await (0, import_promises8.readFile)(RENDERER_CSS_PATH, "utf-8"));
    });
  }
  sender.once("destroyed", () => {
    quickCssWatcher2?.close();
    themesWatcher2.close();
    rendererCssWatcher?.close();
  });
});
import_electron36.ipcMain.on("VencordGetMonacoTheme" /* GET_MONACO_THEME */, (e) => {
  e.returnValue = import_electron36.nativeTheme.shouldUseDarkColors ? "vs-dark" : "vs-light";
});
import_electron36.ipcMain.handle("VencordGetDesktopSources" /* GET_DESKTOP_SOURCES */, async (event) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  try {
    const sources = await import_electron36.desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1, height: 1 }
    });
    return sources.map((s) => ({ id: s.id, name: s.name }));
  } catch {
    return [];
  }
});
var monacoWin = null;
import_electron36.ipcMain.handle("VencordOpenMonacoEditor" /* OPEN_MONACO_EDITOR */, async (event) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  if (monacoWin && !monacoWin.isDestroyed()) {
    monacoWin.show();
    monacoWin.focus();
    return;
  }
  monacoWin = new import_electron36.BrowserWindow({
    title: "Midnightcord QuickCSS Editor",
    autoHideMenuBar: true,
    darkTheme: true,
    webPreferences: {
      preload: (0, import_path26.join)(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  monacoWin.once("closed", () => {
    monacoWin = null;
  });
  monacoWin.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": ["default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval';"]
      }
    });
  });
  makeLinksOpenExternally(monacoWin);
  await monacoWin.loadURL(`data:text/html;base64,${import_monacoWin.default}`);
});
import_electron36.app.on("before-quit", async (event) => {
  if (monacoWin && !monacoWin.isDestroyed() && !monacoWin.isVisible()) {
    const result = await import_electron36.dialog.showMessageBox({
      type: "question",
      buttons: ["Cancel", "Close Anyway"],
      defaultId: 0,
      title: "QuickCSS Editor Open",
      message: "QuickCSS editor is still open in the background.",
      detail: "Do you want to close Discord anyway? This will also close the QuickCSS editor."
    });
    if (result.response === 1) {
      import_electron36.app.exit();
    }
  }
});
import_electron36.ipcMain.handle("VencordGetRendererCss" /* GET_RENDERER_CSS */, (event) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  return (0, import_promises8.readFile)(RENDERER_CSS_PATH, "utf-8");
});
import_electron36.ipcMain.handle("MidnightcordSetWindowBackgroundMaterial" /* SET_WINDOW_BACKGROUND_MATERIAL */, (event, material) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  const win = import_electron36.BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  try {
    const canSetMaterial = typeof win.setBackgroundMaterial === "function";
    const canSetVibrancy = typeof win.setVibrancy === "function";
    if (material === "none") {
      win.setBackgroundColor("#36393f");
      if (canSetMaterial) {
        win.setBackgroundMaterial("none");
      }
      if (canSetVibrancy) {
        win.setVibrancy(null);
      }
    } else {
      win.setBackgroundColor("#00000000");
      if (canSetMaterial) {
        win.setBackgroundMaterial(material);
      } else if (canSetVibrancy) {
        win.setVibrancy(material === "acrylic" ? "acrylic" : "under-window");
      }
    }
  } catch (e) {
    console.error("[CreateTheme] setBackgroundMaterial failed:", e);
  }
});
var THUMBAR_ICONS = {
  prev: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAY0lEQVR4nGNgGLngPxIgRy+MzUKpI9DFmKhpGAMDGS4kFCQkuZCY8CXKhaREFEEXkhrrOF1ITvJhYMDjQkYooJqByAZT1UCYocQaTFKyIcZQknMKIdeSnfXIiTCiAblJbGAAADXRMBdqfKdTAAAAAElFTkSuQmCC",
  next: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAZklEQVR4nOXUMQrAMAxDUbXk/ld2lwoMwbGcein5YxMeylLg7MzMqvcZv93Rpd1RE+jhVpBoFV6CHm4FiSqwDHp4dT6qYIaWFwLA9dYCRhCTn5xBTFqoYkCysAKxcOEONvXlp/CfHp4sPAHr7DkEAAAAAElFTkSuQmCC",
  play: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAXElEQVR4nO3UsQoAIAhFUY3+/5dtCiTS9NnQ0N0cOohDRD8Rkcr7ZqEovAUrsAsicAjU8FVwoh6cBk8wDFpwr4LMzHqGwRWCQQuapW54woiCG0agEJiBzKq/zfsN8Hg8AZZiLwgAAAAASUVORK5CYII=",
  pause: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAKklEQVR4nGNgGHGAEV3g/////1EUMDIykiLPRE3XjRo4auCogcPHwBEIAFPvCBxAwtPtAAAAAElFTkSuQmCC"
};
import_electron36.ipcMain.handle("SoundCordSetThumbarButtons" /* SET_THUMBAR_BUTTONS */, (event, state) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  const win = import_electron36.BrowserWindow.fromWebContents(event.sender);
  if (!win || process.platform !== "win32") return;
  const { nativeImage: nativeImage4 } = require("electron");
  if (state === "stopped") {
    win.setThumbarButtons([]);
    return;
  }
  const prevIcon = nativeImage4.createFromDataURL(`data:image/png;base64,${THUMBAR_ICONS.prev}`);
  const nextIcon = nativeImage4.createFromDataURL(`data:image/png;base64,${THUMBAR_ICONS.next}`);
  const midIcon = nativeImage4.createFromDataURL(`data:image/png;base64,${state === "playing" ? THUMBAR_ICONS.pause : THUMBAR_ICONS.play}`);
  const midTip = state === "playing" ? "Pause" : "Play";
  const midAction = state === "playing" ? "pause" : "play";
  win.setThumbarButtons([
    {
      tooltip: "Previous",
      icon: prevIcon,
      click() {
        event.sender.send("SoundCordThumbarButtonClick" /* THUMBAR_BUTTON_CLICK */, "prev");
      }
    },
    {
      tooltip: midTip,
      icon: midIcon,
      click() {
        event.sender.send("SoundCordThumbarButtonClick" /* THUMBAR_BUTTON_CLICK */, midAction);
      }
    },
    {
      tooltip: "Next",
      icon: nextIcon,
      click() {
        event.sender.send("SoundCordThumbarButtonClick" /* THUMBAR_BUTTON_CLICK */, "next");
      }
    }
  ]);
});
if (IS_DISCORD_DESKTOP) {
  let rendererJsCache = null;
  import_electron36.ipcMain.on("VencordPreloadGetRendererJs" /* PRELOAD_GET_RENDERER_JS */, (e) => {
    if (!rendererJsCache) {
      rendererJsCache = (0, import_fs9.readFileSync)((0, import_path26.join)(__dirname, "renderer.js"), "utf-8");
    }
    e.returnValue = rendererJsCache;
  });
}
import_electron36.ipcMain.handle("MidnightcordRelaunchApp" /* RELAUNCH_APP */, async (event) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  if (process.platform === "win32") {
    const { spawn: spawn2 } = await import("node:child_process");
    spawn2(process.execPath, process.argv.slice(1), {
      detached: true,
      stdio: "ignore"
    }).unref();
    import_electron36.app.exit(0);
    return;
  }
  import_electron36.app.relaunch();
  import_electron36.app.exit(0);
});
var OFFICIAL_UPDATE_URL = `https://git.${domain}/nightcord/nightcord/releases/download/latest/Midnightcord-Installer.exe`;
import_electron36.ipcMain.handle("MidnightcordDownloadAndRun" /* MIDNIGHTCORD_DOWNLOAD_AND_RUN */, async (event, url) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  if (url !== OFFICIAL_UPDATE_URL) {
    throw new Error("Unauthorized update URL");
  }
  const https = require("https");
  const os = require("os");
  const path = require("path");
  const fs = require("original-fs");
  const crypto = require("crypto");
  const tmpPath = path.join(os.tmpdir(), "MidnightcordUpdate-Setup.exe");
  await new Promise((resolve2, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(tmpPath);
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve2()));
      file.on("error", (err2) => {
        fs.unlink(tmpPath, () => {
        });
        reject(err2);
      });
      res.on("error", (err2) => {
        fs.unlink(tmpPath, () => {
        });
        reject(err2);
      });
    }).on("error", (err2) => {
      fs.unlink(tmpPath, () => {
      });
      reject(err2);
    });
  });
  const isSigned = await verifySignature(tmpPath);
  if (!isSigned) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
    }
    throw new Error("Signature validation failed for the downloaded update file.");
  }
  const { response } = await import_electron36.dialog.showMessageBox({
    type: "info",
    buttons: ["Install update", "Cancel"],
    defaultId: 0,
    title: "Midnightcord Update",
    message: "A Midnightcord update is available.",
    detail: "Do you want to install the update now?"
  });
  if (response === 1) return false;
  const { spawn: spawn2 } = require("child_process");
  const child = spawn2(tmpPath, [], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  return true;
});
import_electron36.ipcMain.handle("MidnightcordCheckVBCable" /* CHECK_VB_CABLE */, async (event) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  if (process.platform !== "win32") return { installed: false };
  const { existsSync: existsSync8 } = require("fs");
  const p1 = "C:\\Program Files\\VB\\Cable\\VBCABLE_ControlPanel.exe";
  const p2 = "C:\\Program Files (x86)\\VB\\Cable\\VBCABLE_ControlPanel.exe";
  return { installed: existsSync8(p1) || existsSync8(p2) };
});
import_electron36.ipcMain.handle("MidnightcordInstallVBCable" /* INSTALL_VB_CABLE */, async (event) => {
  if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
  if (process.platform !== "win32") return { success: false, error: "Windows only" };
  const { spawn: spawn2 } = require("child_process");
  const os = require("os");
  const path = require("path");
  const fs = require("fs");
  const zipUrl = "https://download.vb-audio.com/Download_Html/VBCABLE_Setup.zip";
  const tmpDir = path.join(os.tmpdir(), "Midnightcord-VBCable");
  const tmpZip = path.join(os.tmpdir(), "VBCable_Setup.zip");
  try {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
  }
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    await new Promise((resolve2, reject) => {
      const child = spawn2("powershell", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Invoke-WebRequest -Uri "${zipUrl}" -OutFile "${tmpZip}";Expand-Archive -Path "${tmpZip}" -DestinationPath "${tmpDir}" -Force;`
      ]);
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) resolve2();
        else reject(new Error(`Download/Extract failed with code ${code}`));
      });
    });
    const installerPath = path.join(tmpDir, "VBCABLE_Setup_x64.exe");
    if (!fs.existsSync(installerPath)) {
      return { success: false, error: "Installer not found after extraction" };
    }
    const isSigned = await verifySignature(installerPath);
    if (!isSigned) {
      return { success: false, error: "Signature validation failed for the VB-Cable installer." };
    }
    const { response } = await import_electron36.dialog.showMessageBox({
      type: "info",
      buttons: ["Install VB-Cable", "Cancel"],
      defaultId: 0,
      title: "VB-Cable Installation",
      message: "VB-Cable must be installed with administrator privileges.",
      detail: "A UAC window will open to confirm the installation."
    });
    if (response === 1) return { success: false, error: "Cancelled by user" };
    await new Promise((resolve2, reject) => {
      const child = spawn2("powershell", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Start-Process -FilePath "${installerPath}" -ArgumentList "/SILENT" -Verb RunAs -Wait;`
      ]);
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) resolve2();
        else reject(new Error(`Install failed with code ${code}`));
      });
    });
    return { success: true };
  } catch (err2) {
    console.error("[Midnightcord] VBCable install failed:", err2);
    return { success: false, error: "Installation failed: " + (err2.message || err2) };
  } finally {
    try {
      fs.unlinkSync(tmpZip);
    } catch {
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
    }
  }
});

// src/main/mellowtel.ts
init_IpcEvents();
var import_electron37 = require("electron");
init_settings();
var MELLOWTEL_CONFIGURATION_KEY = "intgr-xbMMjQpcsJ";
var MELLOWTEL_INTEGRATION_ID = MELLOWTEL_CONFIGURATION_KEY;
var mellowtelInstance = null;
async function getMellowtel() {
  if (mellowtelInstance) return mellowtelInstance;
  const { default: Mellowtel } = await import("mellowtel");
  mellowtelInstance = new Mellowtel({ integrationId: MELLOWTEL_INTEGRATION_ID });
  await mellowtelInstance.init();
  return mellowtelInstance;
}
function getStoredConsent() {
  return NativeSettings.plain.mellowtel ?? null;
}
async function applyStoredMellowtelConsent() {
  const stored = getStoredConsent();
  if (!stored || stored.consent !== "accepted") return;
  try {
    const mellowtel = await getMellowtel();
    await mellowtel.optIn();
    await mellowtel.start();
  } catch (e) {
    console.error("[Mellowtel] Failed to re-apply stored consent", e);
  }
}
import_electron37.ipcMain.handle("MidnightcordMellowtelSetConsent" /* MELLOWTEL_SET_CONSENT */, async (_event, accepted, onboardingVersion) => {
  NativeSettings.store.mellowtel = {
    consent: accepted ? "accepted" : "declined",
    version: onboardingVersion
  };
  try {
    const mellowtel = await getMellowtel();
    if (accepted) {
      await mellowtel.optIn();
      await mellowtel.start();
    } else {
      await mellowtel.optOut();
    }
  } catch (e) {
    console.error("[Mellowtel] Failed to apply consent choice", e);
  }
});
import_electron37.ipcMain.on("MidnightcordMellowtelGetConsent" /* MELLOWTEL_GET_CONSENT */, (event) => {
  event.returnValue = getStoredConsent();
});

// src/main/index.ts
init_settings();
init_constants();

// src/main/utils/extensions.ts
var import_electron38 = require("electron");

// node_modules/.pnpm/fflate@0.8.2/node_modules/fflate/esm/index.mjs
var import_module = require("module");
var require2 = (0, import_module.createRequire)("/");
var Worker;
var workerAdd = ";var __w=require('worker_threads');__w.parentPort.on('message',function(m){onmessage({data:m})}),postMessage=function(m,t){__w.parentPort.postMessage(m,t)},close=process.exit;self=global";
try {
  Worker = require2("worker_threads").Worker;
} catch (e) {
}
var wk = Worker ? function(c, _, msg, transfer, cb) {
  var done = false;
  var w = new Worker(c + workerAdd, { eval: true }).on("error", function(e) {
    return cb(e, null);
  }).on("message", function(m) {
    return cb(null, m);
  }).on("exit", function(c2) {
    if (c2 && !done)
      cb(new Error("exited with code " + c2), null);
  });
  w.postMessage(msg, transfer);
  w.terminate = function() {
    done = true;
    return Worker.prototype.terminate.call(w);
  };
  return w;
} : function(_, __, ___, ____, cb) {
  setImmediate(function() {
    return cb(new Error("async operations unsupported - update to Node 12+ (or Node 10-11 with the --experimental-worker CLI flag)"), null);
  });
  var NOP = function() {
  };
  return {
    terminate: NOP,
    postMessage: NOP
  };
};
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i2 = 0; i2 < 31; ++i2) {
    b[i2] = start += 1 << eb[i2 - 1];
  }
  var r = new i32(b[30]);
  for (var i2 = 1; i2 < 30; ++i2) {
    for (var j = b[i2]; j < b[i2 + 1]; ++j) {
      r[j] = j - b[i2] << 5 | i2;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i2 = 0;
  var l = new u16(mb);
  for (; i2 < s; ++i2) {
    if (cd[i2])
      ++l[cd[i2] - 1];
  }
  var le = new u16(mb);
  for (i2 = 1; i2 < mb; ++i2) {
    le[i2] = le[i2 - 1] + l[i2 - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i2 = 0; i2 < s; ++i2) {
      if (cd[i2]) {
        var sv = i2 << 4 | cd[i2];
        var r_1 = mb - cd[i2];
        var v = le[cd[i2] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i2 = 0; i2 < s; ++i2) {
      if (cd[i2]) {
        co[i2] = rev[le[cd[i2] - 1]++] >> 15 - cd[i2];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i2 = 1; i2 < a.length; ++i2) {
    if (a[i2] > m)
      m = a[i2];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf)
    buf = new u8(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i2 = 0; i2 < hcLen; ++i2) {
          clt[clim[i2]] = bits(dat, pos + i2 * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i2 = 0; i2 < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i2++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i2 - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i2++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i2 = sym - 257, b = fleb[i2];
          add = bits(dat, pos, (1 << b) - 1) + fl[i2];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift = dl - dt, dend = Math.min(dt, end);
          if (shift + bt < 0)
            err(3);
          for (; bt < dend; ++bt)
            buf[bt] = dict[shift + bt];
        }
        for (; bt < end; ++bt)
          buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var et = /* @__PURE__ */ new u8(0);
var mrg = function(a, b) {
  var o = {};
  for (var k in a)
    o[k] = a[k];
  for (var k in b)
    o[k] = b[k];
  return o;
};
var wcln = function(fn, fnStr, td2) {
  var dt = fn();
  var st = fn.toString();
  var ks = st.slice(st.indexOf("[") + 1, st.lastIndexOf("]")).replace(/\s+/g, "").split(",");
  for (var i2 = 0; i2 < dt.length; ++i2) {
    var v = dt[i2], k = ks[i2];
    if (typeof v == "function") {
      fnStr += ";" + k + "=";
      var st_1 = v.toString();
      if (v.prototype) {
        if (st_1.indexOf("[native code]") != -1) {
          var spInd = st_1.indexOf(" ", 8) + 1;
          fnStr += st_1.slice(spInd, st_1.indexOf("(", spInd));
        } else {
          fnStr += st_1;
          for (var t in v.prototype)
            fnStr += ";" + k + ".prototype." + t + "=" + v.prototype[t].toString();
        }
      } else
        fnStr += st_1;
    } else
      td2[k] = v;
  }
  return fnStr;
};
var ch = [];
var cbfs = function(v) {
  var tl = [];
  for (var k in v) {
    if (v[k].buffer) {
      tl.push((v[k] = new v[k].constructor(v[k])).buffer);
    }
  }
  return tl;
};
var wrkr = function(fns, init2, id, cb) {
  if (!ch[id]) {
    var fnStr = "", td_1 = {}, m = fns.length - 1;
    for (var i2 = 0; i2 < m; ++i2)
      fnStr = wcln(fns[i2], fnStr, td_1);
    ch[id] = { c: wcln(fns[m], fnStr, td_1), e: td_1 };
  }
  var td2 = mrg({}, ch[id].e);
  return wk(ch[id].c + ";onmessage=function(e){for(var k in e.data)self[k]=e.data[k];onmessage=" + init2.toString() + "}", id, td2, cbfs(td2), cb);
};
var bInflt = function() {
  return [u8, u16, i32, fleb, fdeb, clim, fl, fd, flrm, fdrm, rev, ec, hMap, max, bits, bits16, shft, slc, err, inflt, inflateSync, pbf, gopt];
};
var pbf = function(msg) {
  return postMessage(msg, [msg.buffer]);
};
var gopt = function(o) {
  return o && {
    out: o.size && new u8(o.size),
    dictionary: o.dictionary
  };
};
var cbify = function(dat, opts, fns, init2, id, cb) {
  var w = wrkr(fns, init2, id, function(err2, dat2) {
    w.terminate();
    cb(err2, dat2);
  });
  w.postMessage([dat, opts], opts.consume ? [dat.buffer] : []);
  return function() {
    w.terminate();
  };
};
var b2 = function(d, b) {
  return d[b] | d[b + 1] << 8;
};
var b4 = function(d, b) {
  return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var b8 = function(d, b) {
  return b4(d, b) + b4(d, b + 4) * 4294967296;
};
function inflate(data, opts, cb) {
  if (!cb)
    cb = opts, opts = {};
  if (typeof cb != "function")
    err(7);
  return cbify(data, opts, [
    bInflt
  ], function(ev) {
    return pbf(inflateSync(ev.data[0], gopt(ev.data[1])));
  }, 1, cb);
}
function inflateSync(data, opts) {
  return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}
var dutf8 = function(d) {
  for (var r = "", i2 = 0; ; ) {
    var c = d[i2++];
    var eb = (c > 127) + (c > 223) + (c > 239);
    if (i2 + eb > d.length)
      return { s: r, r: slc(d, i2 - 1) };
    if (!eb)
      r += String.fromCharCode(c);
    else if (eb == 3) {
      c = ((c & 15) << 18 | (d[i2++] & 63) << 12 | (d[i2++] & 63) << 6 | d[i2++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
    } else if (eb & 1)
      r += String.fromCharCode((c & 31) << 6 | d[i2++] & 63);
    else
      r += String.fromCharCode((c & 15) << 12 | (d[i2++] & 63) << 6 | d[i2++] & 63);
  }
};
function strFromU8(dat, latin1) {
  if (latin1) {
    var r = "";
    for (var i2 = 0; i2 < dat.length; i2 += 16384)
      r += String.fromCharCode.apply(null, dat.subarray(i2, i2 + 16384));
    return r;
  } else if (td) {
    return td.decode(dat);
  } else {
    var _a2 = dutf8(dat), s = _a2.s, r = _a2.r;
    if (r.length)
      err(8);
    return s;
  }
}
var slzh = function(d, b) {
  return b + 30 + b2(d, b + 26) + b2(d, b + 28);
};
var zh = function(d, b, z) {
  var fnl = b2(d, b + 28), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl, bs = b4(d, b + 20);
  var _a2 = z && bs == 4294967295 ? z64e(d, es) : [bs, b4(d, b + 24), b4(d, b + 42)], sc = _a2[0], su = _a2[1], off = _a2[2];
  return [b2(d, b + 10), sc, su, fn, es + b2(d, b + 30) + b2(d, b + 32), off];
};
var z64e = function(d, b) {
  for (; b2(d, b) != 1; b += 4 + b2(d, b + 2))
    ;
  return [b8(d, b + 12), b8(d, b + 4), b8(d, b + 20)];
};
var mt = typeof queueMicrotask == "function" ? queueMicrotask : typeof setTimeout == "function" ? setTimeout : function(fn) {
  fn();
};
function unzip(data, opts, cb) {
  if (!cb)
    cb = opts, opts = {};
  if (typeof cb != "function")
    err(7);
  var term = [];
  var tAll = function() {
    for (var i3 = 0; i3 < term.length; ++i3)
      term[i3]();
  };
  var files = {};
  var cbd = function(a, b) {
    mt(function() {
      cb(a, b);
    });
  };
  mt(function() {
    cbd = cb;
  });
  var e = data.length - 22;
  for (; b4(data, e) != 101010256; --e) {
    if (!e || data.length - e > 65558) {
      cbd(err(13, 0, 1), null);
      return tAll;
    }
  }
  ;
  var lft = b2(data, e + 8);
  if (lft) {
    var c = lft;
    var o = b4(data, e + 16);
    var z = o == 4294967295 || c == 65535;
    if (z) {
      var ze = b4(data, e - 12);
      z = b4(data, ze) == 101075792;
      if (z) {
        c = lft = b4(data, ze + 32);
        o = b4(data, ze + 48);
      }
    }
    var fltr = opts && opts.filter;
    var _loop_3 = function(i3) {
      var _a2 = zh(data, o, z), c_1 = _a2[0], sc = _a2[1], su = _a2[2], fn = _a2[3], no = _a2[4], off = _a2[5], b = slzh(data, off);
      o = no;
      var cbl = function(e2, d) {
        if (e2) {
          tAll();
          cbd(e2, null);
        } else {
          if (d)
            files[fn] = d;
          if (!--lft)
            cbd(null, files);
        }
      };
      if (!fltr || fltr({
        name: fn,
        size: sc,
        originalSize: su,
        compression: c_1
      })) {
        if (!c_1)
          cbl(null, slc(data, b, b + sc));
        else if (c_1 == 8) {
          var infl = data.subarray(b, b + sc);
          if (su < 524288 || sc > 0.8 * su) {
            try {
              cbl(null, inflateSync(infl, { out: new u8(su) }));
            } catch (e2) {
              cbl(e2, null);
            }
          } else
            term.push(inflate(infl, { size: su }, cbl));
        } else
          cbl(err(14, "unknown compression type " + c_1, 1), null);
      } else
        cbl(null, null);
    };
    for (var i2 = 0; i2 < c; ++i2) {
      _loop_3(i2);
    }
  } else
    cbd(null, {});
  return tAll;
}

// src/main/utils/extensions.ts
var import_fs10 = require("fs");
var import_promises9 = require("fs/promises");
var import_path27 = require("path");
init_constants();

// src/main/utils/crxToZip.ts
function crxToZip(buf) {
  function calcLength(a, b, c, d) {
    let length = 0;
    length += a << 0;
    length += b << 8;
    length += c << 16;
    length += d << 24 >>> 0;
    return length;
  }
  if (buf[0] === 80 && buf[1] === 75 && buf[2] === 3 && buf[3] === 4) {
    return buf;
  }
  if (buf[0] !== 67 || buf[1] !== 114 || buf[2] !== 50 || buf[3] !== 52) {
    throw new Error("Invalid header: Does not start with Cr24");
  }
  const isV3 = buf[4] === 3;
  const isV2 = buf[4] === 2;
  if (!isV2 && !isV3 || buf[5] || buf[6] || buf[7]) {
    throw new Error("Unexpected crx format version number.");
  }
  if (isV2) {
    const publicKeyLength = calcLength(buf[8], buf[9], buf[10], buf[11]);
    const signatureLength = calcLength(buf[12], buf[13], buf[14], buf[15]);
    const zipStartOffset2 = 16 + publicKeyLength + signatureLength;
    return buf.subarray(zipStartOffset2, buf.length);
  }
  const headerSize = calcLength(buf[8], buf[9], buf[10], buf[11]);
  const zipStartOffset = 12 + headerSize;
  return buf.subarray(zipStartOffset, buf.length);
}

// src/main/utils/extensions.ts
init_http();
init_DOMAIN();
var extensionCacheDir = (0, import_path27.join)(DATA_DIR, "ExtensionCache");
async function extract(data, outDir) {
  await (0, import_promises9.mkdir)(outDir, { recursive: true });
  return new Promise((resolve2, reject) => {
    unzip(data, (err2, files) => {
      if (err2) return void reject(err2);
      Promise.all(Object.keys(files).map(async (f) => {
        if (f.startsWith("_metadata/")) return;
        if (f.endsWith("/")) return void (0, import_promises9.mkdir)((0, import_path27.join)(outDir, f), { recursive: true });
        const pathElements = f.split("/");
        const name = pathElements.pop();
        const directories = pathElements.join("/");
        const dir = (0, import_path27.join)(outDir, directories);
        if (directories) {
          await (0, import_promises9.mkdir)(dir, { recursive: true });
        }
        await (0, import_promises9.writeFile)((0, import_path27.join)(dir, name), files[f]);
      })).then(() => resolve2()).catch((err3) => {
        (0, import_promises9.rm)(outDir, { recursive: true, force: true });
        reject(err3);
      });
    });
  });
}
async function installExt(id) {
  const extDir = (0, import_path27.join)(extensionCacheDir, `${id}`);
  try {
    await (0, import_promises9.access)(extDir, import_fs10.constants.F_OK);
  } catch (err2) {
    const url = `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&x=id%3D${id}%26uc&prodversion=${process.versions.chrome}`;
    const buf = await fetchBuffer(url, {
      headers: {
        "User-Agent": `Electron ${process.versions.electron} ~ Midnightcord (https://git.${domain}/nightcord/nightcord)`
      }
    });
    await extract(crxToZip(buf), extDir).catch((err3) => console.error(`Failed to extract extension ${id}`, err3));
  }
  import_electron38.session.defaultSession.extensions ? import_electron38.session.defaultSession.extensions.loadExtension(extDir) : import_electron38.session.defaultSession.loadExtension(extDir);
}

// src/main/index.ts
if (!IS_VANILLA && !IS_EXTENSION) {
  import_electron42.app.whenReady().then(() => {
    import_electron42.protocol.handle("vencord", ({ url: unsafeUrl }) => {
      let url = decodeURI(unsafeUrl).slice("vencord://".length).replace(/\?v=\d+$/, "");
      if (url.endsWith("/")) url = url.slice(0, -1);
      if (url.startsWith("/themes/")) {
        const theme = url.slice("/themes/".length);
        const safeUrl = ensureSafePath(THEMES_DIR, theme);
        if (!safeUrl) {
          return new Response(null, {
            status: 404
          });
        }
        return import_electron42.net.fetch((0, import_url3.pathToFileURL)(safeUrl).toString());
      }
      switch (url) {
        case "renderer.js.map":
        case "preload.js.map":
        case "patcher.js.map":
        case "main.js.map":
          return import_electron42.net.fetch((0, import_url3.pathToFileURL)((0, import_path30.join)(__dirname, url)).toString());
        default:
          return new Response(null, {
            status: 404
          });
      }
    });
    import_electron42.protocol.handle("equicord", ({ url: unsafeUrl }) => {
      let url = decodeURI(unsafeUrl).slice("equicord://".length).replace(/\?v=\d+$/, "");
      if (url.endsWith("/")) url = url.slice(0, -1);
      if (url.startsWith("/themes/")) {
        const theme = url.slice("/themes/".length);
        const safeUrl = ensureSafePath(THEMES_DIR, theme);
        if (!safeUrl) {
          return new Response(null, {
            status: 404
          });
        }
        return import_electron42.net.fetch((0, import_url3.pathToFileURL)(safeUrl).toString());
      }
      switch (url) {
        case "renderer.js.map":
        case "preload.js.map":
        case "patcher.js.map":
        case "main.js.map":
          return import_electron42.net.fetch((0, import_url3.pathToFileURL)((0, import_path30.join)(__dirname, url)).toString());
        default:
          return new Response(null, {
            status: 404
          });
      }
    });
    try {
      if (RendererSettings.store.enableReactDevtools)
        installExt("fmkadmapgofadopljbjfkapdkoienihi").then(() => console.info("[Midnightcord] Installed React Developer Tools")).catch((err2) => console.error("[Midnightcord] Failed to install React Developer Tools", err2));
    } catch {
    }
    initCsp();
    applyStoredMellowtelConsent().catch(
      (err2) => console.error("[Midnightcord] Failed to apply stored Mellowtel consent", err2)
    );
  });
}
if (IS_DISCORD_DESKTOP) {
  init_patcher();
}
/*!
 * crxToZip
 * Copyright (c) 2013 Rob Wu <rob@robwu.nl>
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/*! Bundled license information:

sax/lib/sax.js:
  (*! http://mths.be/fromcodepoint v0.1.0 by @mathias *)
*/
