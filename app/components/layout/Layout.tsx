import { useActionQuery } from "@agent-native/core/client/hooks";
import { HeaderActionsProvider } from "@agent-native/toolkit/app-shell";
import { useLocation } from "react-router";

import { Shell } from "@/components/pmr/Shell";
export function Layout({ children }: { children: React.ReactNode }) {
  const { data } = useActionQuery("get-pmr-dashboard", {});
  const location = useLocation();
  return (
    <HeaderActionsProvider>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
        <main className="agent-native-app-main min-w-0 flex-1 overflow-y-auto overscroll-contain">
          {location.pathname.startsWith("/settings") ? (
            children
          ) : (
            <Shell role={data?.user.role} email={data?.user.email}>
              {children}
            </Shell>
          )}
        </main>
      </div>
    </HeaderActionsProvider>
  );
}
