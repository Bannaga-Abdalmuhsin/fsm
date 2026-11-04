module.exports = ({ config }) => {
  const pushEnabled = process.env.EXPO_PUBLIC_PMR_PUSH_ENABLED === "true";
  const googleServicesFile = pushEnabled ? process.env.GOOGLE_SERVICES_JSON : undefined;
  return {
    ...config,
    plugins: config.plugins.map((plugin) =>
      plugin === "expo-notifications"
        ? ["expo-notifications", { enableRemoteNotifications: pushEnabled }]
        : plugin,
    ),
    ...(googleServicesFile && { android: { ...config.android, googleServicesFile } }),
  };
};
