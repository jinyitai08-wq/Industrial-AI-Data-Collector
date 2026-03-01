import { Construction } from "lucide-react";

export default function UnderConstruction() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-6">
        <Construction className="w-12 h-12 text-blue-600" />
      </div>
      <h1 className="text-3xl font-bold text-gray-900 mb-4">功能建置中</h1>
      <p className="text-gray-500 max-w-md">
        此功能模組目前正在開發中，我們將盡快為您提供服務。請先使用左側選單中的「電站總覽」或「裝置管理」功能。
      </p>
    </div>
  );
}
