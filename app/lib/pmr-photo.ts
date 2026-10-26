import { appPath } from "@agent-native/core/client/api-path";
export function pmrPhotoUrl(id: string) {
  return appPath(`/api/pmr/photo?id=${encodeURIComponent(id)}`);
}
