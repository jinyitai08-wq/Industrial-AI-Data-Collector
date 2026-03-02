import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import http from "http";
import { GoogleGenAI, Type } from "@google/genai";
import cookieParser from "cookie-parser";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";

// Vite middleware setup
async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(cookieParser());

  const JWT_SECRET = process.env.JWT_SECRET || "super-secret-solar-key";
  const googleClient = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  // Helper for unified error responses
  const sendError = (res: express.Response, message: string, code: string = "INTERNAL_ERROR", status: number = 500) => {
    res.status(status).json({
      error: {
        message,
        code,
        timestamp: new Date().toISOString()
      }
    });
  };

  // Initialize SQLite database
  const db = new Database("plant_monitor.db");
  
  // Migration: Drop old telemetry table if it has the 'power' column (to fix NOT NULL constraint)
  try {
    const tableInfo = db.prepare("PRAGMA table_info(telemetry)").all() as any[];
    if (tableInfo.some(c => c.name === 'power')) {
      console.log("Migrating database: dropping old telemetry table with 'power' column");
      db.exec("DROP TABLE telemetry");
    }
  } catch (e) {
    // Ignore errors
  }

  // Create tables for Collectors and Telemetry
  db.exec(`
    CREATE TABLE IF NOT EXISTS collectors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      device_id TEXT UNIQUE NOT NULL,
      description TEXT,
      location TEXT,
      plant TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      power_kw REAL NOT NULL,
      daily_energy_kwh REAL NOT NULL,
      temperature REAL,
      status TEXT NOT NULL
    );
  `);

  // Add columns if they don't exist (for existing DBs)
  try {
    db.exec("ALTER TABLE collectors ADD COLUMN location TEXT DEFAULT ''");
    db.exec("ALTER TABLE collectors ADD COLUMN plant TEXT DEFAULT ''");
  } catch (e) {
    // Columns likely already exist
  }
  
  try {
    db.exec("ALTER TABLE telemetry ADD COLUMN power_kw REAL DEFAULT 0");
    db.exec("ALTER TABLE telemetry ADD COLUMN daily_energy_kwh REAL DEFAULT 0");
    db.exec("ALTER TABLE telemetry ADD COLUMN temperature REAL DEFAULT 25");
  } catch (e) {
    // Columns likely already exist
  }

  // Insert a default collector if none exists
  try {
    const count = db.prepare("SELECT COUNT(*) as count FROM collectors").get() as { count: number };
    if (count.count === 0) {
      db.prepare("INSERT INTO collectors (name, device_id, description, location, plant) VALUES (?, ?, ?, ?, ?)").run(
        "主發電站收集器", "ECU-1051-MAIN", "預設的研華資料收集器", "台北市內湖區", "內湖一廠"
      );
    }
  } catch (e) {
    console.error("Error initializing default collector:", e);
  }

  app.get("/api/health", (req, res) => {
    try {
      res.json({ status: "ok" });
    } catch (error: any) {
      sendError(res, "Health check failed", "HEALTH_CHECK_FAILED");
    }
  });

  // --- Auth APIs ---
  app.get("/api/auth/google/url", (req, res) => {
    try {
      const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/google/callback`;
      const url = googleClient.generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/userinfo.profile", "https://www.googleapis.com/auth/userinfo.email"],
        redirect_uri: redirectUri,
      });
      res.json({ url });
    } catch (error: any) {
      sendError(res, "Failed to generate auth URL", "AUTH_URL_ERROR");
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code } = req.query;
      if (!code) return res.status(400).send("Missing code");

      const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/google/callback`;
      const { tokens } = await googleClient.getToken({
        code: code as string,
        redirect_uri: redirectUri,
      });

      const ticket = await googleClient.verifyIdToken({
        idToken: tokens.id_token!,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) throw new Error("Invalid token payload");

      const user = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      };

      const sessionToken = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });

      res.cookie("session", sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>驗證成功，正在關閉視窗...</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Auth callback error:", error);
      res.status(500).send("Authentication failed");
    }
  });

  app.get("/api/auth/me", (req, res) => {
    try {
      const token = req.cookies.session;
      if (!token) return res.json({ user: null });

      const user = jwt.verify(token, JWT_SECRET);
      res.json({ user });
    } catch (error) {
      res.json({ user: null });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("session", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
    res.json({ success: true });
  });

  // --- Collector APIs ---
  app.get("/api/collectors", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM collectors ORDER BY created_at DESC").all();
      res.json(rows);
    } catch (error: any) {
      sendError(res, "Failed to fetch collectors", "FETCH_COLLECTORS_ERROR");
    }
  });

  app.post("/api/collectors", (req, res) => {
    try {
      const { name, device_id, description, location, plant } = req.body;
      if (!name || !device_id) {
        return sendError(res, "Missing required fields: name, device_id", "MISSING_FIELDS", 400);
      }
      
      const stmt = db.prepare("INSERT INTO collectors (name, device_id, description, location, plant) VALUES (?, ?, ?, ?, ?)");
      const info = stmt.run(name, device_id, description || "", location || "", plant || "");
      res.json({ id: info.lastInsertRowid, name, device_id, description, location, plant });
    } catch (error: any) {
      if (error.message.includes("UNIQUE constraint failed")) {
        return sendError(res, "設備 ID 已存在", "DUPLICATE_DEVICE_ID", 400);
      }
      sendError(res, "Failed to create collector", "CREATE_COLLECTOR_ERROR");
    }
  });

  app.delete("/api/collectors/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM collectors WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      sendError(res, "Failed to delete collector", "DELETE_COLLECTOR_ERROR");
    }
  });

  // --- Telemetry APIs ---
  app.get("/api/telemetry", (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const rows = db.prepare(`
        SELECT t.*, c.name as collector_name, c.location, c.plant 
        FROM telemetry t 
        LEFT JOIN collectors c ON t.device_id = c.device_id 
        ORDER BY t.timestamp DESC LIMIT ?
      `).all(limit);
      res.json(rows);
    } catch (error: any) {
      sendError(res, "Failed to fetch telemetry", "FETCH_TELEMETRY_ERROR");
    }
  });

  app.get("/api/power-curve", (req, res) => {
    try {
      const range = req.query.range as string || '24h';
      const now = new Date();
      let startTime = new Date();
      
      if (range === '24h') {
        startTime.setHours(now.getHours() - 24);
      } else if (range === '7d') {
        startTime.setDate(now.getDate() - 7);
      } else if (range === '30d') {
        startTime.setDate(now.getDate() - 30);
      }
      
      const startTimeStr = startTime.toISOString();
      
      let query = `
        SELECT timestamp, SUM(power_kw) as total_power, SUM(daily_energy_kwh) as daily_energy_kwh, GROUP_CONCAT(status) as statuses
        FROM telemetry 
        WHERE timestamp >= ?
        GROUP BY timestamp
        ORDER BY timestamp DESC
      `;

      if (range === '7d' || range === '30d') {
        query = `
          SELECT strftime('%Y-%m-%d %H:00:00', timestamp) as timestamp, 
                 AVG(total_power) as total_power, 
                 AVG(daily_energy_kwh) as daily_energy_kwh,
                 GROUP_CONCAT(statuses) as statuses
          FROM (
            SELECT timestamp, SUM(power_kw) as total_power, SUM(daily_energy_kwh) as daily_energy_kwh, GROUP_CONCAT(status) as statuses
            FROM telemetry 
            WHERE timestamp >= ?
            GROUP BY timestamp
          )
          GROUP BY timestamp
          ORDER BY timestamp DESC
        `;
      }

      const rows = db.prepare(query).all(startTimeStr);
      
      const processedRows = rows.map((row: any) => {
        let overallStatus = '正常';
        if (row.statuses) {
          const statusArray = row.statuses.split(',');
          if (statusArray.includes('異常') || statusArray.includes('Offline')) {
            overallStatus = '異常';
          } else if (row.total_power === 0) {
            overallStatus = '未發電';
          } else {
            overallStatus = '發電中';
          }
        }
        return {
          timestamp: row.timestamp,
          total_power: row.total_power,
          daily_energy_kwh: row.daily_energy_kwh,
          status: overallStatus
        };
      });
      
      // Reverse to chronological order
      res.json(processedRows.reverse());
    } catch (error: any) {
      sendError(res, "Failed to fetch power curve", "FETCH_POWER_CURVE_ERROR");
    }
  });

  app.get("/api/kpis", (req, res) => {
    try {
      const latest = db.prepare(`
        SELECT SUM(power_kw) as current_power, SUM(daily_energy_kwh) as today_energy
        FROM (
          SELECT device_id, power_kw, daily_energy_kwh
          FROM telemetry
          WHERE timestamp = (SELECT MAX(timestamp) FROM telemetry)
        )
      `).get() as any;
      
      const collectorCount = db.prepare("SELECT COUNT(*) as count FROM collectors").get() as any;
      
      res.json({
        current_power: latest?.current_power || 0,
        today_energy: latest?.today_energy || 0,
        active_collectors: collectorCount.count || 0
      });
    } catch (error: any) {
      sendError(res, "Failed to fetch KPIs", "FETCH_KPIS_ERROR");
    }
  });

  app.get("/api/history", (req, res) => {
    try {
      const { start, end, device_id } = req.query;
      let query = `
        SELECT t.*, c.name as collector_name 
        FROM telemetry t 
        LEFT JOIN collectors c ON t.device_id = c.device_id 
        WHERE 1=1
      `;
      const params: any[] = [];
      
      if (start) {
        query += ` AND t.timestamp >= ?`;
        params.push(start);
      }
      if (end) {
        query += ` AND t.timestamp <= ?`;
        params.push(end);
      }
      if (device_id) {
        query += ` AND t.device_id = ?`;
        params.push(device_id);
      }
      
      query += ` ORDER BY t.timestamp DESC LIMIT 1000`;
      
      const rows = db.prepare(query).all(...params);
      res.json(rows);
    } catch (error: any) {
      sendError(res, "Failed to fetch history", "FETCH_HISTORY_ERROR");
    }
  });

  app.delete("/api/telemetry", (req, res) => {
    try {
      db.prepare("DELETE FROM telemetry").run();
      res.json({ success: true });
    } catch (error: any) {
      sendError(res, "Failed to clear telemetry", "CLEAR_TELEMETRY_ERROR");
    }
  });

  // The Pub/Sub push handler endpoint (Simulating MQTT data from EdgeLink)
  app.post("/push-handler", async (req, res) => {
    try {
      const envelope = req.body;
      if (!envelope || !envelope.message || !envelope.message.data) {
        return sendError(res, "Bad Request: Invalid Pub/Sub message format", "INVALID_PUBSUB_FORMAT", 400);
      }

      const dataPayload = Buffer.from(envelope.message.data, "base64").toString("utf-8");
      const msgJson = JSON.parse(dataPayload);
      
      const deviceId = msgJson.device_id || "unknown_device";
      const power = msgJson.power_kw || msgJson.power || 0;
      const energyToday = msgJson.daily_energy_kwh || msgJson.energy_today || 0;
      const temperature = msgJson.temperature || 25;
      let status = msgJson.status || "Normal";

      // Basic anomaly detection (replace AI)
      if (power < 0 || power > 1000) {
        status = "異常";
      }

      const stmt = db.prepare("INSERT INTO telemetry (device_id, power_kw, daily_energy_kwh, temperature, status) VALUES (?, ?, ?, ?, ?)");
      stmt.run(deviceId, power, energyToday, temperature, status);

      console.log(`Processed PV data for ${deviceId}: power=${power}kW, status=${status}`);
      res.status(200).send("OK");
    } catch (error: any) {
      console.error("Error processing message:", error);
      sendError(res, "Internal Server Error during push processing", "PUSH_PROCESSING_ERROR");
    }
  });

  app.post("/api/gemini", async (req, res) => {
    try {
      const { base64Image } = req.body;
      if (!base64Image) {
        return sendError(res, "Missing base64Image", "MISSING_IMAGE", 400);
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image,
              },
            },
            {
              text: "這是一個太陽能發電監控儀表板。請根據畫面上的數據（包含當前功率、今日發電量、設備狀態、發電曲線等），提供繁體中文分析與營運建議。如果發現任何趨勢或值得注意的數據點，請提供一組圖表數據來視覺化這些發現（例如：預測趨勢、異常對比等）。",
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              markdownReport: {
                type: Type.STRING,
                description: "使用 Markdown 格式排版的分析報告與營運建議",
              },
              hasChart: {
                type: Type.BOOLEAN,
                description: "是否有圖表數據",
              },
              chartData: {
                type: Type.OBJECT,
                description: "圖表數據（如果有的話）",
                properties: {
                  title: { type: Type.STRING, description: "圖表標題" },
                  type: { type: Type.STRING, description: "圖表類型，'line' 或 'bar'" },
                  xAxisName: { type: Type.STRING, description: "X 軸名稱" },
                  yAxisName: { type: Type.STRING, description: "Y 軸名稱" },
                  dataPoints: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING, description: "X 軸標籤" },
                        value: { type: Type.NUMBER, description: "主要數值" },
                        secondaryValue: { type: Type.NUMBER, description: "次要數值 (選填)" }
                      },
                      required: ["label", "value"]
                    }
                  },
                  seriesNames: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "數值系列的名稱，例如 ['預測發電量', '實際發電量']"
                  }
                },
                required: ["title", "type", "xAxisName", "yAxisName", "dataPoints", "seriesNames"]
              }
            },
            required: ["markdownReport", "hasChart"]
          }
        }
      });

      if (response.text) {
        try {
          res.json(JSON.parse(response.text));
        } catch (e) {
          res.json({ markdownReport: response.text, hasChart: false });
        }
      } else {
        res.json({ markdownReport: "無法產生分析結果。", hasChart: false });
      }
    } catch (error: any) {
      console.error("Gemini API error:", error);
      sendError(res, "Gemini analysis failed", "GEMINI_ERROR");
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server }
      },
      appType: "spa",
    });
    app.use((req, res, next) => {
      if (req.path.startsWith('/api') || req.path === '/push-handler') {
        next();
      } else {
        vite.middlewares(req, res, next);
      }
    });
  } else {
    // 靜態文件服務
    app.use(express.static("dist"));
    
    // API 路由需要放在 SPA fallback 之前，確保 API 仍可運作
    // SPA fallback 修復：使用 (.*)
    app.get("(.*)", (req, res, next) => {
      // 如果是 API 請求但沒被之前的路由攔截，不要回傳 HTML
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile("dist/index.html", { root: process.cwd() });
    });
  }

  server.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
