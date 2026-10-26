import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router";

import QualitySettings from "@/components/pmr/QualitySettings";
import { AppToolkitProvider } from "@/components/ui/toolkit-provider";
import Home from "@/routes/_index";
import Checklists from "@/routes/checklists";
import Order from "@/routes/orders.$id";

import { PreviewProvider } from "./actions";
export function smoke() {
  function render(element: React.ReactNode, path = "/", route = "/") {
    return renderToString(
      <AppToolkitProvider>
        <MemoryRouter initialEntries={[path]}>
          <PreviewProvider>
            <Routes>
              <Route path={route} element={element} />
            </Routes>
          </PreviewProvider>
        </MemoryRouter>
      </AppToolkitProvider>,
    );
  }
  const home = render(<Home />);
  if (
    !home.includes("DEMO-ODU-001") ||
    !home.includes("DEMO-SHL-002") ||
    !home.includes("INTERACTIVE DEMO")
  )
    throw new Error("Demo landing missing");
  const order = render(
    <Order />,
    "/orders/11111111-1111-4111-8111-111111111111",
    "/orders/:id",
  );
  if (!order.includes("DEMO-WO-001") || !order.includes("Evidence groups"))
    throw new Error("Demo order missing");
  const checklist = render(<Checklists />);
  if (
    !checklist.includes("COW ODU_MONTHLY_67") ||
    !checklist.includes("Rectifier")
  )
    throw new Error("Checklist missing");
  const settings = render(<QualitySettings />);
  if (
    !settings.includes("Quality controls") ||
    !settings.includes("Configuration required")
  )
    throw new Error("Settings missing");
  return "PASS: demo landing, sample order, ODU catalogue and quality settings render with the real app components.";
}
