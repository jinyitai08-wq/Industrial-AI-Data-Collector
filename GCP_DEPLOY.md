# GCP VM 部署指南 (Docker 方式)

這套系統已經配置好 Dockerfile，您可以透過以下步驟在 GCP VM 上運行。

## 1. 在 GCP VM 上安裝 Docker
如果您還沒安裝 Docker，請執行：
```bash
sudo apt-get update
sudo apt-get install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker
```

## 2. 準備檔案
將專案原始碼上傳到 VM，或在 VM 上 clone 專案。

## 3. 設定環境變數
在專案根目錄建立 `.env` 檔案（或在執行時傳入）：
```env
GEMINI_API_KEY=您的_GEMINI_API_KEY
PORT=3000
```

## 4. 建立與執行 Docker 容器
在專案目錄下執行：

```bash
# 建立映像檔
docker build -t solar-monitor .

# 執行容器
docker run -d \
  -p 80:3000 \
  --name solar-app \
  -e GEMINI_API_KEY=您的_GEMINI_API_KEY \
  -v $(pwd)/plant_monitor.db:/app/plant_monitor.db \
  solar-monitor
```

> **注意**：`-v` 參數是為了將資料庫檔案持久化到主機，避免容器重啟後資料遺失。

## 5. 設定 GCP 防火牆
請確保您的 GCP VM 執行個體已開啟 **HTTP (80)** 流量。

---

# 非 Docker 部署方式 (直接執行)

如果您不想使用 Docker，請確保 VM 已安裝 **Node.js 20+**：

1. `npm install`
2. `npm run build`
3. `export GEMINI_API_KEY=您的_KEY`
4. `npm start`
