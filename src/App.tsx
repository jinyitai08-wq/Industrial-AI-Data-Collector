import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import Layout from "./components/Layout";
import Overview from "./pages/Overview";
import Collectors from "./pages/Collectors";
import UnderConstruction from "./pages/UnderConstruction";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="collectors" element={<Collectors />} />
          {/* Catch-all for other sidebar items */}
          <Route path="*" element={<UnderConstruction />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
