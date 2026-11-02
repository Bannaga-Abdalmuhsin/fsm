import "react-native-url-polyfill/auto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

import { supabaseConfigured, supabasePublishableKey, supabaseUrl } from "./config";

// SecureStore limits each value to 2048 bytes; session JSON can exceed that.
const CHUNK_SIZE = 1800;

async function clearChunks(key: string) {
  const count = Number(await SecureStore.getItemAsync(`${key}.count`));
  for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
  await SecureStore.deleteItemAsync(`${key}.count`);
}

const secureStorage = {
  async getItem(key: string) {
    const count = await SecureStore.getItemAsync(`${key}.count`);
    if (count === null) return SecureStore.getItemAsync(key);
    let value = "";
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part === null) return null;
      value += part;
    }
    return value;
  },
  async setItem(key: string, value: string) {
    await clearChunks(key);
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const parts = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < parts; i++) {
      await SecureStore.setItemAsync(
        `${key}.${i}`,
        value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      );
    }
    await SecureStore.setItemAsync(`${key}.count`, String(parts));
  },
  async removeItem(key: string) {
    await clearChunks(key);
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        storage: secureStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
