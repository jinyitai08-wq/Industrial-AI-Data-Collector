import { useState, useEffect, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line, Legend } from "recharts";
import { Zap, Battery, Activity, RefreshCw, MapPin, Factory, Wifi, Download, FileText, Sparkles, X, TrendingUp, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import html2canvas from "html2canvas";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "motion/react";

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
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("API returned non-JSON response");
        }
        return res.json();
      };

      setKpi(await checkResponse(kpiRes));
      setTelemetry(await checkResponse(telRes));
      setPowerCurve(await checkResponse(curveRes));
    } catch (err) {
      console.error("Failed to fetch data:", err);
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
    try {
      const canvas = await html2canvas(dashboardRef.current, { scale: 1.5 });
      const base64Image = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
      
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ base64Image }),
      });

      if (!response.ok) {
        throw new Error("API request failed");
      }

      const data = await response.json();
      setAnalysisResult(data);
    } catch (err) {
      console.error("AI Analysis failed:", err);
      setAnalysisResult({ markdownReport: "AI 分析過程中發生錯誤，請稍後再試。", hasChart: false });
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
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2"
      >
        <div>
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-2 bg-clip-text text-transparent bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900">
            電站總覽
          </h1>
          <div className="flex items-center text-gray-500 font-medium">
            <div className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></div>
            即時監控您的太陽能發電廠狀態與效能
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => {
              document.getElementById('data-table')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all shadow-sm hover:shadow-md active:scale-95"
          >
            <FileText className="w-4 h-4 mr-2 text-gray-500" />
            歷史資料
          </button>
          <button
            onClick={fetchGatewayData}
            className="flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all shadow-sm hover:shadow-md active:scale-95"
          >
            <RefreshCw className="w-4 h-4 mr-2 text-gray-500" />
            模擬數據
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-sm hover:shadow-md active:scale-95"
          >
            <Download className="w-4 h-4 mr-2" />
            匯出 CSV
          </button>
          <button
            onClick={analyzeDashboard}
            disabled={analyzing}
            className={`flex items-center px-5 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-lg active:scale-95 ${
              analyzing 
                ? 'bg-indigo-400 text-white cursor-not-allowed' 
                : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700'
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
      </motion.div>

      <AnimatePresence>
        {analysisResult && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-gradient-to-br from-indigo-50 via-white to-violet-50 border border-indigo-100 rounded-2xl p-8 relative shadow-xl overflow-hidden group"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-200/20 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-indigo-300/30 transition-colors duration-700"></div>
            <button 
              onClick={() => setAnalysisResult(null)}
              className="absolute top-6 right-6 p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100 rounded-full transition-all z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-start relative z-10">
              <div className="bg-gradient-to-br from-indigo-500 to-violet-600 p-3 rounded-2xl mr-6 shadow-lg shadow-indigo-200">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-indigo-950 mb-4">AI 智能分析報告</h3>
                <div className="prose prose-indigo prose-lg max-w-none text-indigo-900/80 markdown-body leading-relaxed">
                  <ReactMarkdown>{analysisResult.markdownReport}</ReactMarkdown>
                </div>
                
                {analysisResult.hasChart && analysisResult.chartData && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl border border-indigo-100 shadow-xl mt-8"
                  >
                    <h4 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
                      <TrendingUp className="w-5 h-5 mr-2 text-indigo-600" />
                      {analysisResult.chartData.title}
                    </h4>
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        {analysisResult.chartData.type === 'bar' ? (
                          <BarChart data={analysisResult.chartData.dataPoints} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="label" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip 
                              cursor={{ fill: '#f8fafc' }}
                              contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", padding: "12px" }} 
                            />
                            <Legend wrapperStyle={{ paddingTop: "20px" }} />
                            <Bar dataKey="value" name={analysisResult.chartData.seriesNames[0] || "Value"} fill="#6366f1" radius={[6, 6, 0, 0]} barSize={40} />
                            {analysisResult.chartData.seriesNames.length > 1 && (
                              <Bar dataKey="secondaryValue" name={analysisResult.chartData.seriesNames[1]} fill="#a5b4fc" radius={[6, 6, 0, 0]} barSize={40} />
                            )}
                          </BarChart>
                        ) : (
                          <LineChart data={analysisResult.chartData.dataPoints} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="label" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", padding: "12px" }} />
                            <Legend wrapperStyle={{ paddingTop: "20px" }} />
                            <Line type="monotone" dataKey="value" name={analysisResult.chartData.seriesNames[0] || "Value"} stroke="#6366f1" strokeWidth={4} dot={{ r: 5, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8, strokeWidth: 0 }} />
                            {analysisResult.chartData.seriesNames.length > 1 && (
                              <Line type="monotone" dataKey="secondaryValue" name={analysisResult.chartData.seriesNames[1]} stroke="#a5b4fc" strokeWidth={4} dot={{ r: 5, fill: '#a5b4fc', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8, strokeWidth: 0 }} />
                            )}
                          </LineChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={dashboardRef} className="space-y-8">
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { 
              label: "當前發電功率", 
              value: `${kpi.current_power.toFixed(2)} kW`, 
              icon: Zap, 
              color: "orange",
              bg: "bg-orange-50",
              text: "text-orange-600",
              border: "border-orange-100",
              shadow: "shadow-orange-100"
            },
            { 
              label: "今日發電量", 
              value: `${kpi.today_energy.toFixed(2)} kWh`, 
              icon: Battery, 
              color: "blue",
              bg: "bg-blue-50",
              text: "text-blue-600",
              border: "border-blue-100",
              shadow: "shadow-blue-100"
            },
            { 
              label: "系統健康度", 
              value: kpi.active_collectors > 0 ? "良好" : "待機", 
              icon: ShieldCheck, 
              color: "emerald",
              bg: "bg-emerald-50",
              text: "text-emerald-600",
              border: "border-emerald-100",
              shadow: "shadow-emerald-100"
            },
            { 
              label: "雲端連線狀態", 
              value: "EMQX 在線", 
              icon: Wifi, 
              color: "indigo",
              bg: "bg-indigo-50",
              text: "text-indigo-600",
              border: "border-indigo-100",
              shadow: "shadow-indigo-100",
              isLive: true
            }
          ].map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              whileHover={{ y: -5, scale: 1.02 }}
              className={`bg-white rounded-3xl p-6 shadow-lg ${item.shadow} border ${item.border} flex items-center transition-all duration-300 group cursor-default`}
            >
              <div className={`w-14 h-14 rounded-2xl ${item.bg} flex items-center justify-center mr-5 group-hover:scale-110 transition-transform duration-300 shadow-inner`}>
                <item.icon className={`w-7 h-7 ${item.text}`} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">{item.label}</p>
                <div className="flex items-center">
                  {item.isLive && (
                    <span className="relative flex h-3 w-3 mr-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                  )}
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">{item.value}</h3>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Chart */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-[2rem] p-8 shadow-xl shadow-gray-100 border border-gray-100 overflow-hidden relative group"
        >
          <div className="absolute top-0 right-0 w-96 h-96 bg-orange-50/50 rounded-full -mr-48 -mt-48 blur-3xl group-hover:bg-orange-100/50 transition-colors duration-700"></div>
          
          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
              <div className="flex items-center">
                <div className="w-1.5 h-8 bg-orange-500 rounded-full mr-4"></div>
                <h2 className="text-2xl font-bold text-gray-900">發電功率即時趨勢</h2>
              </div>
              <div className="flex space-x-1 bg-gray-100/80 backdrop-blur-sm p-1.5 rounded-2xl border border-gray-200">
                {['24h', '7d', '30d'].map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-5 py-2 text-sm font-bold rounded-xl transition-all ${
                      timeRange === range 
                        ? 'bg-white text-gray-900 shadow-md' 
                        : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                    }`}
                  >
                    {range === '24h' ? '24小時' : range === '7d' ? '7天' : '30天'}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="h-[400px] w-full">
              {powerCurve.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={powerCurve} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={formatTime}
                      stroke="#94a3b8"
                      fontSize={12}
                      fontWeight={600}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={40}
                      dy={10}
                    />
                    <YAxis 
                      stroke="#94a3b8" 
                      fontSize={12} 
                      fontWeight={600}
                      tickLine={false} 
                      axisLine={false}
                      dx={-10}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="total_power"
                      name="總功率 (kW)"
                      stroke="#f97316"
                      strokeWidth={4}
                      fillOpacity={1}
                      fill="url(#colorPower)"
                      animationDuration={2000}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                    <Activity className="w-8 h-8 text-gray-200" />
                  </div>
                  <p className="font-medium">暫無發電數據</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Data Table */}
        <motion.div 
          id="data-table"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white rounded-[2rem] shadow-xl shadow-gray-100 border border-gray-100 overflow-hidden"
        >
          <div className="px-8 py-6 border-b border-gray-100 bg-gray-50/30 flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-900">歷史接收數據日誌</h2>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-white px-3 py-1 rounded-full border border-gray-200">
              {telemetry.length} 筆紀錄
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50/50 text-gray-400 uppercase text-[10px] font-black tracking-[0.2em]">
                <tr>
                  <th className="px-8 py-5">時間</th>
                  <th className="px-8 py-5">設備名稱</th>
                  <th className="px-8 py-5">廠房 / 地點</th>
                  <th className="px-8 py-5">功率 (kW)</th>
                  <th className="px-8 py-5">溫度 (°C)</th>
                  <th className="px-8 py-5">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-8 py-16 text-center">
                      <div className="flex flex-col items-center space-y-3">
                        <RefreshCw className="w-8 h-8 text-indigo-200 animate-spin" />
                        <p className="text-gray-400 font-medium">數據載入中...</p>
                      </div>
                    </td>
                  </tr>
                ) : telemetry.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-8 py-16 text-center">
                      <div className="flex flex-col items-center space-y-3">
                        <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center">
                          <Download className="w-6 h-6 text-gray-200" />
                        </div>
                        <p className="text-gray-400 font-medium">尚無數據，請點擊右上角「模擬數據」</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  telemetry.map((row, idx) => (
                    <motion.tr 
                      key={row.id} 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + (idx * 0.02), duration: 0.3 }}
                      className="hover:bg-indigo-50/30 transition-colors group"
                    >
                      <td className="px-8 py-5 whitespace-nowrap font-mono text-xs text-gray-400 group-hover:text-indigo-600 transition-colors">
                        {formatDate(row.timestamp)}
                      </td>
                      <td className="px-8 py-5">
                        <div className="font-bold text-gray-900 group-hover:text-indigo-700 transition-colors">
                          {row.collector_name || <span className="text-gray-300 font-normal italic">未註冊 ({row.device_id})</span>}
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex flex-col space-y-1">
                          {row.plant && (
                            <span className="flex items-center text-xs font-bold text-gray-600">
                              <Factory className="w-3 h-3 mr-1.5 text-gray-400" /> {row.plant}
                            </span>
                          )}
                          {row.location && (
                            <span className="flex items-center text-xs font-medium text-gray-400">
                              <MapPin className="w-3 h-3 mr-1.5" /> {row.location}
                            </span>
                          )}
                          {!row.plant && !row.location && <span className="text-gray-300">-</span>}
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className="font-mono font-black text-lg text-orange-600">
                          {row.power_kw.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-8 py-5 font-mono font-bold text-gray-500">{row.temperature.toFixed(1)}</td>
                      <td className="px-8 py-5">
                        <span
                          className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm ${
                            row.status === "Normal"
                              ? "bg-emerald-500 text-white shadow-emerald-100"
                              : "bg-red-500 text-white shadow-red-100"
                          }`}
                        >
                          {row.status === "Normal" ? "運作正常" : "異常"}
                        </span>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
