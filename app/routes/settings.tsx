import { SettingsTabsPage } from "@agent-native/toolkit/app/settings";

import QualitySettings from "@/components/pmr/QualitySettings";
export default function Settings() {
  return (
    <SettingsTabsPage
      appAreas={[
        {
          id: "pmr-quality",
          label: "PMR quality",
          content: (
            <div className="pmr-shell">
              <div className="pmr-content">
                <QualitySettings />
              </div>
            </div>
          ),
        },
      ]}
      mcpAbout="Schedule PMRs, record ETLs, review evidence and export authorized reports."
    />
  );
}
