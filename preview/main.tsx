import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route, Link } from "react-router";

import QualitySettings from "@/components/pmr/QualitySettings";
import { Shell } from "@/components/pmr/Shell";
import { AppToolkitProvider } from "@/components/ui/toolkit-provider";
import Home from "@/routes/_index";
import Checklists from "@/routes/checklists";
import Order from "@/routes/orders.$id";
import Report from "@/routes/reports.$id";
import Review from "@/routes/review";

import { PreviewProvider, usePreview, demoEmail } from "./actions";

import "@/global.css";
import "./preview.css";
function App() {
  const { state } = usePreview();
  return (
    <Shell role={state.role} email={demoEmail}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/orders/:id" element={<Order />} />
        <Route path="/checklists" element={<Checklists />} />
        <Route path="/review" element={<Review />} />
        <Route path="/reports/:id" element={<Report />} />
        <Route path="/settings/*" element={<QualitySettings />} />
        <Route
          path="*"
          element={
            <p>
              Demo page not found. <Link to="/">Open work orders</Link>
            </p>
          }
        />
      </Routes>
      <div className="demo-footer">
        Demonstration uses the app’s existing screens with an isolated,
        in-memory sample adapter. Production authentication and server actions
        are unchanged.
      </div>
    </Shell>
  );
}
createRoot(document.getElementById("root")!).render(
  <AppToolkitProvider>
    <HashRouter>
      <PreviewProvider>
        <App />
      </PreviewProvider>
    </HashRouter>
  </AppToolkitProvider>,
);
