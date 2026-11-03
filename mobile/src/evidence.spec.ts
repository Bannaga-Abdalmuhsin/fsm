import { beforeEach, describe, expect, it, vi } from "vitest";
const location = vi.hoisted(() => ({
  getForegroundPermissionsAsync: vi.fn(),
  requestForegroundPermissionsAsync: vi.fn(),
  hasServicesEnabledAsync: vi.fn(),
  getLastKnownPositionAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
  Accuracy: { High: 4 },
}));
vi.mock("expo-location", () => location);
vi.mock("expo-crypto", () => ({}));
vi.mock("expo-file-system", () => ({
  Directory: class {},
  File: class {},
  Paths: {},
}));
vi.mock("./config", () => ({
  supabaseUrl: "https://example.supabase.co",
  supabasePublishableKey: "test-publishable",
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  location.getForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  location.hasServicesEnabledAsync.mockResolvedValue(true);
});
const fix = () => ({
  timestamp: Date.now() - 2000,
  coords: { latitude: 24, longitude: 46, accuracy: 8 },
  mocked: false,
});
describe("fresh GPS reuse without weakening capture gates", () => {
  it("reuses only the bounded native last-known request and preserves GPS time", async () => {
    const f = fix();
    location.getLastKnownPositionAsync.mockResolvedValue(f);
    const { getFix } = await import("./evidence");
    const result = await getFix(300);
    expect(location.getLastKnownPositionAsync).toHaveBeenCalledWith({
      maxAge: 10000,
      requiredAccuracy: 50,
    });
    expect(location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(Date.parse(result.timestamp)).toBe(f.timestamp + 300);
  });
  it("requests an accurate current fix when no recent fix exists", async () => {
    location.getLastKnownPositionAsync.mockResolvedValue(null);
    location.getCurrentPositionAsync.mockResolvedValue(fix());
    const { getFix } = await import("./evidence");
    expect((await getFix()).accuracy).toBe(8);
    expect(location.getCurrentPositionAsync).toHaveBeenCalledWith({
      accuracy: 4,
    });
  });
  it("rejects disabled GPS even if a cached fix could exist", async () => {
    location.hasServicesEnabledAsync.mockResolvedValue(false);
    const { getFix } = await import("./evidence");
    await expect(getFix()).rejects.toThrow("Enable GPS");
    expect(location.getLastKnownPositionAsync).not.toHaveBeenCalled();
  });
  it("rejects a mocked cached location", async () => {
    location.getLastKnownPositionAsync.mockResolvedValue({
      ...fix(),
      mocked: true,
    });
    const { getFix } = await import("./evidence");
    await expect(getFix()).rejects.toThrow("mock GPS");
  });
});
