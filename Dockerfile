# 使用 Node.js 官方映像檔作為基礎
FROM node:20-slim AS builder

# 安裝 SQLite3 編譯需要的工具
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 複製 package.json 並安裝依賴
COPY package*.json ./
RUN npm install

# 複製所有原始碼
COPY . .

# 執行編譯 (Vite build)
RUN npm run build

# --- 運行階段 ---
FROM node:20-slim

# 安裝 SQLite3 運行需要的庫
RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 僅從 builder 階段複製必要的檔案
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/plant_monitor.db ./plant_monitor.db

# 設定環境變數
ENV NODE_ENV=production
ENV PORT=3000

# 開放連接埠
EXPOSE 3000

# 啟動應用程式
CMD ["npm", "start"]
