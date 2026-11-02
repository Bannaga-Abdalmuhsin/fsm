import { Platform } from "react-native";
export const colors = {
 background: "#F4F7F5", secondary: "#F0F5F2", panel: "#FFFFFF", panelRaised: "#E8F5ED",
 border: "#DDE7E0", foreground: "#142C21", muted: "#64796D", action: "#087D49",
 actionInk: "#FFFFFF", actionHover: "#06633A", danger: "#BC343A", warning: "#986200",
} as const;
export const fonts = { regular: Platform.OS === "ios" ? "System" : "sans-serif", medium: Platform.OS === "ios" ? "System" : "sans-serif-medium", bold: Platform.OS === "ios" ? "System" : "sans-serif-medium" } as const;
