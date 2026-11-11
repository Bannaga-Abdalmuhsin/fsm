import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import config from "../app.json";
import { supabase } from "./supabase";

const deviceTokenKey = "pmr.expo-push-token";
export const pushEnabled = process.env.EXPO_PUBLIC_PMR_PUSH_ENABLED === "true";

if (pushEnabled) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function unregisterPushDevice() {
  const token = await SecureStore.getItemAsync(deviceTokenKey);
  if (!token || !supabase) return;
  const { error } = await supabase.rpc("pmr_unregister_push_device", { p_token: token });
  if (error) throw error;
  await SecureStore.deleteItemAsync(deviceTokenKey);
}

export async function registerPushDevice(userId: string, isActive: () => boolean) {
  if (!pushEnabled || !supabase) return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("work-orders", {
      name: "Work orders",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted || !current.canAskAgain
    ? current
    : await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    if (isActive()) await unregisterPushDevice();
    return;
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({
    projectId: config.expo.extra.eas.projectId,
  });
  const { data: { session } } = await supabase.auth.getSession();
  if (!isActive() || session?.user.id !== userId) return;

  const previous = await SecureStore.getItemAsync(deviceTokenKey);
  if (previous && previous !== token) await unregisterPushDevice();
  if (!isActive()) return;
  await SecureStore.setItemAsync(deviceTokenKey, token);
  const { error } = await supabase.rpc("pmr_register_push_device", { p_token: token });
  if (error) throw error;
}

export function listenForAssignments(onAssignment: () => void) {
  const isAssignment = (notification: Notifications.Notification) =>
    notification.request.content.data?.type === "pmr-assignment";
  const received = Notifications.addNotificationReceivedListener(notification => {
    if (isAssignment(notification)) onAssignment();
  });
  const opened = Notifications.addNotificationResponseReceivedListener(response => {
    if (isAssignment(response.notification)) onAssignment();
  });
  return () => {
    received.remove();
    opened.remove();
  };
}
