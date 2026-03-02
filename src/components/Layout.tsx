import { useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router";
import { 
  Home, 
  Bell, 
  Wrench, 
  BarChart2, 
  FileText, 
  Monitor, 
  Settings,
  ChevronDown,
  ChevronRight,
  Sun,
  LogIn,
  LogOut,
  User
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const menuStructure = [
  {
    title: "總覽",
    icon: Home,
    items: [
      { name: "電站總覽", path: "/overview" },
      { name: "維運總覽", path: "/maintenance-overview" },
      { name: "即時電站診斷", path: "/realtime-diagnosis" },
      { name: "地圖總覽", path: "/map-overview" },
    ]
  },
  {
    title: "監控",
    icon: Bell,
    items: [
      { name: "事件管理", path: "/event-management" },
      { name: "即時運轉監控", path: "/realtime-monitoring" },
      { name: "即時圖控", path: "/realtime-control" },
      { name: "變流器監控", path: "/inverter-monitoring" },
      { name: "遠端控制", path: "/remote-control" },
    ]
  },
  {
    title: "維運",
    icon: Wrench,
    items: [
      { name: "工單系統", path: "/work-order" },
      { name: "工單總覽", path: "/work-order-overview" },
      { name: "維運分析", path: "/maintenance-analysis" },
      { name: "維運日誌", path: "/maintenance-log" },
    ]
  },
  {
    title: "分析",
    icon: BarChart2,
    items: [
      { name: "變流器熱圖", path: "/inverter-heatmap" },
      { name: "電站運轉效率", path: "/plant-efficiency" },
      { name: "變流器效率", path: "/inverter-efficiency" },
      { name: "串列監測", path: "/string-monitoring" },
      { name: "事件分析", path: "/event-analysis" },
    ]
  },
  {
    title: "報表",
    icon: FileText,
    items: [
      { name: "電站報表", path: "/plant-report" },
      { name: "財務報表", path: "/financial-report" },
      { name: "電站發電收入", path: "/revenue-report" },
      { name: "電站評等", path: "/plant-rating" },
      { name: "報表下載", path: "/report-download" },
      { name: "資料下載", path: "/data-download" },
    ]
  },
  {
    title: "看板",
    icon: Monitor,
    items: [
      { name: "區域看板一", path: "/dashboard-region-1" },
      { name: "區域看板二", path: "/dashboard-region-2" },
      { name: "輪播看板一", path: "/dashboard-carousel-1" },
      { name: "電站看板一", path: "/dashboard-plant-1" },
      { name: "電站看板二", path: "/dashboard-plant-2" },
      { name: "電站看板三", path: "/dashboard-plant-3" },
    ]
  },
  {
    title: "系統管理",
    icon: Settings,
    items: [
      { name: "使用者管理", path: "/user-management" },
      { name: "電站管理", path: "/plant-management" },
      { name: "裝置管理", path: "/collectors" },
      { name: "控制模式設定", path: "/control-mode" },
      { name: "客製化設定", path: "/custom-settings" },
      { name: "電站看板管理", path: "/dashboard-management" },
      { name: "系統日誌", path: "/system-log" },
    ]
  }
];

export default function Layout() {
  const location = useLocation();
  const { user, loading, login, logout } = useAuth();
  
  // Find which menu section is active based on current path
  const getActiveSection = () => {
    const activeIndex = menuStructure.findIndex(section => 
      section.items.some(item => location.pathname.startsWith(item.path))
    );
    return activeIndex >= 0 ? activeIndex : 0; // Default to first section
  };

  const [expandedSection, setExpandedSection] = useState<number | null>(getActiveSection());

  const toggleSection = (index: number) => {
    setExpandedSection(expandedSection === index ? null : index);
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-[#1c3144] flex flex-col text-white shadow-xl z-10 overflow-y-auto custom-scrollbar">
        <div className="h-16 flex items-center px-6 bg-[#152433] flex-shrink-0 sticky top-0 z-20">
          <Sun className="w-6 h-6 text-orange-400 mr-2" />
          <span className="text-xl font-bold tracking-wider">JYT-PV</span>
        </div>
        
        <nav className="flex-1 py-2">
          <ul className="space-y-1">
            {menuStructure.map((section, index) => {
              const isExpanded = expandedSection === index;
              const Icon = section.icon;
              
              return (
                <li key={section.title} className="flex flex-col">
                  <button
                    onClick={() => toggleSection(index)}
                    className={`flex items-center justify-between px-6 py-4 transition-colors ${
                      isExpanded 
                        ? "bg-gradient-to-b from-[#4a90e2] to-[#2c5282] text-white" 
                        : "hover:bg-[#243f5a] text-gray-300"
                    }`}
                  >
                    <div className="flex items-center">
                      <Icon className="w-6 h-6 mr-4" />
                      <span className="text-lg font-medium">{section.title}</span>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 opacity-70" />
                    ) : (
                      <ChevronRight className="w-5 h-5 opacity-70" />
                    )}
                  </button>
                  
                  {isExpanded && (
                    <ul className="bg-[#152433] py-2">
                      {section.items.map((item) => (
                        <li key={item.name}>
                          <NavLink
                            to={item.path}
                            className={({ isActive }) =>
                              `block px-16 py-3 text-sm transition-colors ${
                                isActive
                                  ? "text-[#4a90e2] bg-[#1a2b3c] border-l-4 border-[#4a90e2]"
                                  : "text-gray-400 hover:text-white hover:bg-[#1a2b3c] border-l-4 border-transparent"
                              }`
                            }
                          >
                            {item.name}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User Profile / Login Section */}
        <div className="mt-auto p-4 bg-[#152433] border-t border-gray-700">
          {loading ? (
            <div className="flex items-center justify-center py-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            </div>
          ) : user ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <img 
                  src={user.picture} 
                  alt={user.name} 
                  className="w-10 h-10 rounded-full border-2 border-[#4a90e2]"
                  referrerPolicy="no-referrer"
                />
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-medium truncate">{user.name}</span>
                  <span className="text-xs text-gray-400 truncate">{user.email}</span>
                </div>
              </div>
              <button 
                onClick={logout}
                className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                title="登出"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="w-full flex items-center justify-center space-x-2 py-2 px-4 bg-[#4a90e2] hover:bg-[#357abd] text-white rounded-lg transition-colors font-medium"
            >
              <LogIn className="w-5 h-5" />
              <span>Google 登入</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-[#f0f4f8]">
        <Outlet />
      </main>
    </div>
  );
}
