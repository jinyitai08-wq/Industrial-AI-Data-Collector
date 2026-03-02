import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

// 取得當前檔案路徑的替代方案（兼容性更好）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  // 載入所有環境變數
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        // 建議映射到 src 資料夾，如果你的代碼在根目錄則維持 '.'
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // 修正：使用從 loadEnv 讀取的 env 物件，確保 .env 檔案中的設定能生效
      hmr: env.DISABLE_HMR !== 'true',
      
      // 針對 Cloud Run 或 AI Studio 的連接埠適配（可選）
      host: '0.0.0.0',
      port: 5173,
    },
  };
});
