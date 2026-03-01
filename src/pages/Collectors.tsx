import { useState, useEffect } from "react";
import { Plus, Trash2, MapPin, Factory } from "lucide-react";

interface Collector {
  id: number;
  device_id: string;
  name: string;
  location: string;
  plant: string;
  created_at: string;
}

export default function Collectors() {
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [formData, setFormData] = useState({ id: "", name: "", location: "", plant: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchCollectors = async () => {
    try {
      const res = await fetch("/api/collectors");
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("API returned non-JSON response");
      }
      const data = await res.json();
      setCollectors(data);
    } catch (err) {
      console.error("Failed to fetch collectors:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollectors();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/collectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: formData.id,
          name: formData.name,
          location: formData.location,
          plant: formData.plant
        }),
      });
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("API returned non-JSON response");
      }
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "新增失敗");
      setFormData({ id: "", name: "", location: "", plant: "" });
      fetchCollectors();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("確定要刪除此收集器嗎？這將會刪除所有相關的歷史數據！")) return;
    try {
      const res = await fetch(`/api/collectors/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      fetchCollectors();
    } catch (err) {
      console.error("Failed to delete collector:", err);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">資料擷取器設定</h1>
        <p className="text-gray-500">
          管理您的 ADAM-ECU-1051TL-R10 / ECU-1051TL-R10AAE 研華資料擷取閘道器。
          <br />
          <span className="text-sm text-gray-400">
            架構說明：閘道器透過 MQTT 將資料發送至 EMQX Cloud，再由 Rule Engine 轉發至 Google Pub/Sub，最後由本系統的 Webhook 接收並儲存。
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Add Form */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Plus className="w-5 h-5 mr-2 text-orange-500" />
            添加數據收集器
          </h2>
          {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">設備 ID (Client ID)</label>
              <input
                type="text"
                required
                value={formData.id}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                placeholder="例如: ECU1051_SN001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">設備名稱</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                placeholder="例如: 一號逆變器收集器"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">地點 (Location)</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                placeholder="例如: 台南市安南區"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">設備廠房 (Plant)</label>
              <input
                type="text"
                value={formData.plant}
                onChange={(e) => setFormData({ ...formData, plant: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                placeholder="例如: A棟屋頂太陽能"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              新增設備
            </button>
          </form>
        </div>

        {/* List */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-lg font-semibold text-gray-800">已註冊設備列表</h2>
          </div>
          <div className="p-0">
            {loading ? (
              <div className="p-8 text-center text-gray-500">載入中...</div>
            ) : collectors.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                目前沒有任何收集器，請從左側新增。
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {collectors.map((c) => (
                  <div key={c.id} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">{c.name}</h3>
                      <div className="mt-1 flex items-center text-sm text-gray-500 space-x-4">
                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">{c.device_id}</span>
                        {c.location && (
                          <span className="flex items-center">
                            <MapPin className="w-3.5 h-3.5 mr-1" />
                            {c.location}
                          </span>
                        )}
                        {c.plant && (
                          <span className="flex items-center">
                            <Factory className="w-3.5 h-3.5 mr-1" />
                            {c.plant}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="刪除設備"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
