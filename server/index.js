const express = require("express");
const cors = require("cors");
const path = require("path");
const { initDb } = require("./db");
const apiRouter = require("./api");
const monitorService = require("./monitor");

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Database & Live Monitoring Service
initDb();
monitorService.init();

// Middlewares
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// API Routes
app.use("/api", apiRouter);

// Static Web App Serving
const staticDir = path.join(__dirname, "..");
app.use(express.static(staticDir));

// Fallback to index.html for SPA-like routes
app.get("*", (req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("==================================================================");
  console.log(`🌊 한국수자원조사기술원 자동유량관측시설 관리시스템 (2차 개발 서버)`);
  console.log(`🚀 서버 구동 완료: http://localhost:${PORT}`);
  console.log(`🌐 사내 네트워크 접속: http://[서버IP]:${PORT}`);
  console.log("==================================================================");
});
