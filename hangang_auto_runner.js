/**
 * Hangang Bridge Server Auto-Updater & Watchdog Runner
 * - Runs `server/index.js` and automatically restarts on crash
 * - Polls GitHub (`origin/main`) every 60 seconds
 * - Before pulling new code, backs up and preserves local `data/khydro.db`, `data/notification_config.json`, `data/notification_logs.json`
 * - Zero manual intervention required on the Hangang Bridge server after initial launch
 */

const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const PROTECTED_FILES = [
  "khydro.db",
  "notification_config.json",
  "notification_logs.json"
];

const CHECK_INTERVAL_MS = 60 * 1000; // Check GitHub every 60 seconds
let serverProc = null;
let isUpdating = false;

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function backupProtectedFiles() {
  ensureDirs();
  const snapshot = {};
  for (const name of PROTECTED_FILES) {
    const src = path.join(DATA_DIR, name);
    if (fs.existsSync(src)) {
      const buf = fs.readFileSync(src);
      snapshot[name] = buf;
      fs.writeFileSync(path.join(BACKUP_DIR, `${name}.latest.bak`), buf);
    }
  }
  return snapshot;
}

function restoreProtectedFiles(snapshot) {
  ensureDirs();
  for (const [name, buf] of Object.entries(snapshot)) {
    const dest = path.join(DATA_DIR, name);
    fs.writeFileSync(dest, buf);
  }
}

function startServer() {
  if (serverProc) return;
  console.log(`\n🚀 [HangangRunner] Starting server/index.js at ${new Date().toLocaleString("ko-KR")}...`);
  serverProc = spawn(process.execPath, [path.join(ROOT_DIR, "server/index.js")], {
    cwd: ROOT_DIR,
    stdio: "inherit",
    env: { ...process.env }
  });

  serverProc.on("exit", (code, signal) => {
    serverProc = null;
    if (!isUpdating) {
      console.warn(`⚠️ [HangangRunner] Server exited (code=${code}, signal=${signal}). Restarting in 3s...`);
      setTimeout(() => startServer(), 3000);
    }
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!serverProc) return resolve();
    const proc = serverProc;
    const timer = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch (_) {}
      resolve();
    }, 5000);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    try { proc.kill("SIGTERM"); } catch (_) { resolve(); }
  });
}

async function checkForUpdates() {
  if (isUpdating) return;
  try {
    execSync("git fetch origin main --quiet", { cwd: ROOT_DIR, stdio: "ignore", timeout: 15000 });
    const localRev = execSync("git rev-parse HEAD", { cwd: ROOT_DIR, encoding: "utf-8" }).trim();
    const remoteRev = execSync("git rev-parse origin/main", { cwd: ROOT_DIR, encoding: "utf-8" }).trim();

    if (localRev && remoteRev && localRev !== remoteRev) {
      isUpdating = true;
      console.log(`\n🔄 [HangangRunner] New deployment detected (${localRev.slice(0, 7)} -> ${remoteRev.slice(0, 7)})!`);
      console.log(`💾 [HangangRunner] Backing up local DB (khydro.db) & notification settings...`);
      const snapshot = backupProtectedFiles();

      await stopServer();

      try {
        execSync("git reset --hard origin/main", { cwd: ROOT_DIR, stdio: "inherit", timeout: 30000 });
      } catch (gitErr) {
        console.error("⚠️ [HangangRunner] Git update warning:", gitErr.message);
      }

      restoreProtectedFiles(snapshot);
      console.log(`✅ [HangangRunner] Local DB & settings restored safely. Restarting server...`);
      isUpdating = false;
      startServer();
    }
  } catch (err) {
    isUpdating = false;
    // Ignore transient network errors when polling git
  }
}

console.log("==================================================================");
console.log("🛡️ 한강대교 서버 자동 배포 감시기 및 무중단 구동 데몬 (Hangang Auto-Updater)");
console.log("   - 매 60초마다 GitHub(main) 신규 배포 여부 자동 확인");
console.log("   - 로컬 DB (data/khydro.db) 및 이메일 설정 자동 보존");
console.log("==================================================================");

ensureDirs();
backupProtectedFiles();
startServer();
setInterval(checkForUpdates, CHECK_INTERVAL_MS);
