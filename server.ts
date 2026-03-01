import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import http from "http";

// Vite middleware setup
async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

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
    res.json({ status: "ok" });
  });

  // --- Collector APIs ---
  app.get("/api/collectors", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM collectors ORDER BY created_at DESC").all();
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.post("/api/collectors", (req, res) => {
    try {
      const { name, device_id, description, location, plant } = req.body;
      if (!name || !device_id) return res.status(400).json({ error: "Missing required fields" });
      
      const stmt = db.prepare("INSERT INTO collectors (name, device_id, description, location, plant) VALUES (?, ?, ?, ?, ?)");
      const info = stmt.run(name, device_id, description || "", location || "", plant || "");
      res.json({ id: info.lastInsertRowid, name, device_id, description, location, plant });
    } catch (error: any) {
      if (error.message.includes("UNIQUE constraint failed")) {
        return res.status(400).json({ error: "設備 ID 已存在" });
      }
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.delete("/api/collectors/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM collectors WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
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
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
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
      
      const rows = db.prepare(`
        SELECT timestamp, SUM(power_kw) as total_power, SUM(daily_energy_kwh) as daily_energy_kwh, GROUP_CONCAT(status) as statuses
        FROM telemetry 
        WHERE timestamp >= ?
        GROUP BY timestamp
        ORDER BY timestamp DESC
      `).all(startTimeStr);
      
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
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
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
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
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
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.delete("/api/telemetry", (req, res) => {
    try {
      db.prepare("DELETE FROM telemetry").run();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // The Pub/Sub push handler endpoint (Simulating MQTT data from EdgeLink)
  app.post("/push-handler", async (req, res) => {
    try {
      const envelope = req.body;
      if (!envelope || !envelope.message || !envelope.message.data) {
        return res.status(400).send("Bad Request: Invalid Pub/Sub message format");
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
    } catch (error) {
      console.error("Error processing message:", error);
      res.status(500).send("Internal Server Error");
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
    app.use(express.static("dist"));
    // SPA fallback for production
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: process.cwd() });
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
