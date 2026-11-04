module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_PMR_PUSH_ENABLED !== "true") return config;
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  if (!googleServicesFile) return config;
  return { ...config, android: { ...config.android, googleServicesFile } };
};
