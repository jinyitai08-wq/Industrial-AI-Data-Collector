import { useState, useEffect, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line, Legend } from "recharts";
import { Zap, Battery, Activity, RefreshCw, MapPin, Factory, Wifi, Download, FileText, Sparkles, X, AlertTriangle, ServerCrash } from "lucide-react";
import { format } from "date-fns";
import { toJpeg } from "html-to-image";
import ReactMarkdown from "react-markdown";
import { GoogleGenAI, Type } from "@google/genai";

interface AIChartData {
  title: string;
  type: string;
  xAxisName: string;
  yAxisName: string;
  dataPoints: {
    label: string;
    value: number;
    secondaryValue?: number;
  }[];
  seriesNames: string[];
}

interface AIAnalysisResponse {
  markdownReport: string;
  hasChart: boolean;
  chartData?: AIChartData;
}

interface KPI {
  current_power: number;
  today_energy: number;
  active_collectors: number;
}

interface Telemetry {
  id: number;
  device_id: string;
  timestamp: string;
  power_kw: number;
  daily_energy_kwh: number;
  temperature: number;
  status: string;
  collector_name: string;
  location: string;
  plant: string;
}

interface PowerData {
  timestamp: string;
  total_power: number;
  status?: string;
  daily_energy_kwh?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    let formattedDate = label;
    try {
      if (label) {
        formattedDate = format(new Date(label), "yyyy-MM-dd HH:mm:ss");
      }
    } catch (e) {
      // fallback to original label
    }
    
    return (
      <div className="bg-white p-4 rounded-lg shadow-lg border border-gray-100">
        <p className="text-sm font-semibold text-gray-800 mb-2">{formattedDate}</p>
        <div className="space-y-1">
          <p className="text-sm text-gray-600">
            <span className="font-medium">總功率:</span> <span className="text-orange-600 font-bold">{data.total_power.toFixed(2)} kW</span>
          </p>
          {data.daily_energy_kwh !== undefined && (
            <p className="text-sm text-gray-600">
              <span className="font-medium">今日發電量:</span> <span className="text-blue-600 font-bold">{data.daily_energy_kwh.toFixed(2)} kWh</span>
            </p>
          )}
          <p className="text-sm text-gray-600">
            <span className="font-medium">狀態:</span> <span className={data.status === "異常" ? "text-red-600" : data.status === "發電中" ? "text-emerald-600" : "text-gray-500"}>{data.status || "未知"}</span>
          </p>
        </div>
      </div>
    );
  }
  return null;
};

export default function Overview() {
  const [kpi, setKpi] = useState<KPI>({ current_power: 0, today_energy: 0, active_collectors: 0 });
  const [telemetry, setTelemetry] = useState<Telemetry[]>([]);
  const [powerCurve, setPowerCurve] = useState<PowerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<string>('24h');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      const [kpiRes, telRes, curveRes] = await Promise.all([
        fetch("/api/kpis"),
        fetch("/api/telemetry"),
        fetch(`/api/power-curve?range=${timeRange}`),
      ]);
      
      // Check if responses are OK and are JSON
      const checkResponse = async (res: Response) => {
        if (!res.ok) throw new Error(`伺服器回應錯誤: ${res.status}`);
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("伺服器回傳了非 JSON 格式的資料");
        }
        return res.json();
      };

      setKpi(await checkResponse(kpiRes));
      setTelemetry(await checkResponse(telRes));
      setPowerCurve(await checkResponse(curveRes));
      setConnectionError(null);
    } catch (err) {
      console.error("Failed to fetch data:", err);
      setConnectionError(err instanceof Error ? err.message : "無法連線至伺服器 (連線中斷)");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 900000); // 15 minutes
    return () => clearInterval(interval);
  }, [timeRange]);

  const fetchGatewayData = async () => {
    const hour = new Date().getHours();
    // Simulate bell curve for solar power during the day (6AM to 6PM)
    let power = 0;
    if (hour >= 6 && hour <= 18) {
      const peak = 12;
      const distance = Math.abs(hour - peak);
      power = Math.max(0, 100 - distance * 15) + Math.random() * 5; // Base bell curve + noise
    }

    const payload = {
      message: {
        data: btoa(
          JSON.stringify({
            device_id: "ECU1051_SN001", // Assuming this is the default ID
            timestamp: new Date().toISOString(),
            power_kw: parseFloat(power.toFixed(2)),
            daily_energy_kwh: parseFloat((power * 0.25).toFixed(2)), // Rough estimate for 15 mins
            temperature: parseFloat((25 + Math.random() * 10).toFixed(1)),
            status: power > 0 ? "Normal" : "Offline",
          })
        ),
      },
    };

    try {
      await fetch("/push-handler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const exportToCSV = () => {
    if (telemetry.length === 0) {
      alert("沒有可輸出的資料");
      return;
    }
    
    // Create CSV header
    const headers = ["時間", "設備 ID", "收集器名稱", "地點", "廠房", "發電功率 (kW)", "今日發電量 (kWh)", "溫度 (°C)", "狀態"];
    
    // Create CSV rows
    const rows = telemetry.map(t => [
      formatDate(t.timestamp),
      t.device_id,
      t.collector_name || "未知",
      t.location || "未知",
      t.plant || "未知",
      t.power_kw,
      t.daily_energy_kwh,
      t.temperature,
      t.status
    ]);
    
    // Combine header and rows
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");
    
    // Create a Blob and download link
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `telemetry_export_${format(new Date(), "yyyyMMdd_HHmmss")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const analyzeDashboard = async () => {
    if (!dashboardRef.current) return;
    setAnalyzing(true);
    setAnalysisResult(null);
    setAiError(null);
    try {
      const dataUrl = await toJpeg(dashboardRef.current, { quality: 0.8, pixelRatio: 1.5 });
      const base64Image = dataUrl.split(",")[1];
      
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
          setAnalysisResult(JSON.parse(response.text));
        } catch (e) {
          setAnalysisResult({ markdownReport: response.text, hasChart: false });
        }
      } else {
        setAiError("無法產生分析結果，AI 回應為空。");
      }
    } catch (err) {
      console.error("AI Analysis failed:", err);
      setAiError(err instanceof Error ? err.message : "AI 分析過程中發生未知錯誤，請稍後再試。");
    } finally {
      setAnalyzing(false);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      return format(new Date(isoString), "HH:mm");
    } catch {
      return isoString;
    }
  };

  const formatDate = (isoString: string) => {
    try {
      return format(new Date(isoString), "yyyy-MM-dd HH:mm:ss");
    } catch {
      return isoString;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">電站總覽</h1>
          <p className="text-gray-500">即時監控您的太陽能發電廠狀態與效能。</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => {
              document.getElementById('data-table')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex items-center px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            <FileText className="w-4 h-4 mr-2" />
            顯示歷史資料
          </button>
          <button
            onClick={fetchGatewayData}
            className="flex items-center px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            擷取資料按鈕1
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            匯出歷史資料 (.csv)
          </button>
          <button
            onClick={analyzeDashboard}
            disabled={analyzing}
            className={`flex items-center px-4 py-2 rounded-lg transition-colors shadow-sm ${
              analyzing 
                ? 'bg-indigo-400 text-white cursor-not-allowed' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {analyzing ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {analyzing ? 'AI 分析中...' : 'AI 智能分析'}
          </button>
        </div>
      </div>

      {connectionError && (
        <div className="mb-8 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start shadow-sm">
          <ServerCrash className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-red-800">系統連線異常</h3>
            <p className="text-sm text-red-600 mt-1">{connectionError}</p>
            <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
              <li>請檢查您的網路連線是否正常。</li>
              <li>確認後端伺服器 (API/WebSocket) 是否正在運行。</li>
              <li>若持續發生，請聯絡系統管理員。</li>
            </ul>
          </div>
        </div>
      )}

      {aiError && (
        <div className="mb-8 bg-orange-50 border border-orange-200 rounded-xl p-6 relative shadow-sm">
          <button 
            onClick={() => setAiError(null)}
            className="absolute top-4 right-4 text-orange-400 hover:text-orange-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-start">
            <div className="bg-orange-100 p-2 rounded-lg mr-4 mt-1">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-orange-900 mb-2">AI 分析失敗</h3>
              <p className="text-orange-800 text-sm mb-3">
                在產生分析報告時發生錯誤：<span className="font-mono bg-orange-100 px-1 py-0.5 rounded">{aiError}</span>
              </p>
              <div className="bg-white/60 rounded-lg p-4 border border-orange-100">
                <h4 className="text-sm font-semibold text-orange-900 mb-2">疑難排解建議：</h4>
                <ul className="text-sm text-orange-800 space-y-1 list-disc list-inside">
                  <li>確認環境變數 <code className="bg-orange-100 px-1 rounded">GEMINI_API_KEY</code> 是否已正確設定。</li>
                  <li>檢查瀏覽器控制台 (Console) 是否有跨域 (CORS) 或網路連線錯誤。</li>
                  <li>稍後再試，可能是 AI 服務暫時無法連線或達到請求限制 (Rate Limit)。</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {analysisResult && (
        <div className="mb-8 bg-indigo-50 border border-indigo-100 rounded-xl p-6 relative shadow-sm">
          <button 
            onClick={() => setAnalysisResult(null)}
            className="absolute top-4 right-4 text-indigo-400 hover:text-indigo-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-start">
            <div className="bg-indigo-100 p-2 rounded-lg mr-4 mt-1">
              <Sparkles className="w-6 h-6 text-indigo-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-indigo-900 mb-2">AI 智能分析報告</h3>
              <div className="prose prose-indigo prose-sm max-w-none text-indigo-800 markdown-body">
                <ReactMarkdown>{analysisResult.markdownReport}</ReactMarkdown>
              </div>
              
              {analysisResult.hasChart && analysisResult.chartData && (
                <div className="bg-white p-6 rounded-xl border border-indigo-100 shadow-sm mt-6">
                  <h4 className="text-md font-semibold text-gray-800 mb-4 text-center">{analysisResult.chartData.title}</h4>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      {analysisResult.chartData.type === 'bar' ? (
                        <BarChart data={analysisResult.chartData.dataPoints} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                          <XAxis dataKey="label" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                          <Legend />
                          <Bar dataKey="value" name={analysisResult.chartData.seriesNames[0] || "Value"} fill="#6366f1" radius={[4, 4, 0, 0]} />
                          {analysisResult.chartData.seriesNames.length > 1 && (
                            <Bar dataKey="secondaryValue" name={analysisResult.chartData.seriesNames[1]} fill="#a5b4fc" radius={[4, 4, 0, 0]} />
                          )}
                        </BarChart>
                      ) : (
                        <LineChart data={analysisResult.chartData.dataPoints} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                          <XAxis dataKey="label" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                          <Legend />
                          <Line type="monotone" dataKey="value" name={analysisResult.chartData.seriesNames[0] || "Value"} stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                          {analysisResult.chartData.seriesNames.length > 1 && (
                            <Line type="monotone" dataKey="secondaryValue" name={analysisResult.chartData.seriesNames[1]} stroke="#a5b4fc" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                          )}
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div ref={dashboardRef} className="space-y-8 p-2 rounded-xl -m-2">
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex items-center">
            <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mr-4">
              <Zap className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">當前發電功率 (kW)</p>
              <h3 className="text-3xl font-bold text-gray-900">{kpi.current_power.toFixed(2)}</h3>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex items-center">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mr-4">
              <Battery className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">今日發電量 (kWh)</p>
              <h3 className="text-3xl font-bold text-gray-900">{kpi.today_energy.toFixed(2)}</h3>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex items-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mr-4">
              <Activity className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">系統狀態</p>
              <h3 className="text-3xl font-bold text-gray-900">
                {kpi.active_collectors > 0 ? "運行中" : "無設備"}
              </h3>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex items-center">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 ${connectionError ? 'bg-red-100' : 'bg-blue-100'}`}>
              <Wifi className={`w-6 h-6 ${connectionError ? 'text-red-600' : 'text-blue-600'}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">系統連線狀態</p>
              <div className="flex items-center">
                <span className="relative flex h-3 w-3 mr-2">
                  {!connectionError && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${connectionError ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                </span>
                <h3 className={`text-xl font-bold ${connectionError ? 'text-red-600' : 'text-gray-900'}`}>
                  {connectionError ? '連線中斷' : '已連線 (正常)'}
                </h3>
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-gray-800">發電功率曲線</h2>
            <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setTimeRange('24h')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${timeRange === '24h' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                24小時
              </button>
              <button
                onClick={() => setTimeRange('7d')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${timeRange === '7d' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                7天
              </button>
              <button
                onClick={() => setTimeRange('30d')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${timeRange === '30d' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                30天
              </button>
            </div>
          </div>
          <div className="h-80 w-full">
            {powerCurve.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={powerCurve} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={formatTime}
                    stroke="#9ca3af"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={30}
                  />
                  <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="total_power"
                    name="總功率 (kW)"
                    stroke="#f97316"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorPower)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                暫無發電數據
              </div>
            )}
          </div>
        </div>

        {/* Data Table */}
        <div id="data-table" className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-lg font-semibold text-gray-800">歷史接收數據</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-semibold">
                <tr>
                  <th className="px-6 py-4">時間</th>
                  <th className="px-6 py-4">設備名稱</th>
                  <th className="px-6 py-4">
                    <div className="flex items-center">
                      <Factory className="w-4 h-4 mr-1" /> 廠房 / <MapPin className="w-4 h-4 ml-1 mr-1" /> 地點
                    </div>
                  </th>
                  <th className="px-6 py-4">功率 (kW)</th>
                  <th className="px-6 py-4">溫度 (°C)</th>
                  <th className="px-6 py-4">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                      載入中...
                    </td>
                  </tr>
                ) : telemetry.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                      尚無數據，請點擊右上角「模擬接收數據」
                    </td>
                  </tr>
                ) : (
                  telemetry.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-xs">
                        {formatDate(row.timestamp)}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {row.collector_name || <span className="text-gray-400 italic">未註冊設備 ({row.device_id})</span>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col space-y-1">
                          {row.plant && (
                            <span className="flex items-center text-xs text-gray-600">
                              <Factory className="w-3 h-3 mr-1" /> {row.plant}
                            </span>
                          )}
                          {row.location && (
                            <span className="flex items-center text-xs text-gray-500">
                              <MapPin className="w-3 h-3 mr-1" /> {row.location}
                            </span>
                          )}
                          {!row.plant && !row.location && <span className="text-gray-400">-</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono font-medium text-orange-600">
                        {row.power_kw.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 font-mono">{row.temperature.toFixed(1)}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            row.status === "Normal"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
