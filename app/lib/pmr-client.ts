export { formatRiyadh } from "../../server/lib/time";

export type GeoFix = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};

export type ImageAnalysis = {
  imageSha256: string;
  averageHash: string;
  width: number;
  height: number;
  sharpness: number;
  skyFraction: number;
  meanLuma: number;
};

export function getPosition(): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GPS is not available in this browser, so capture is blocked."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        }),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? "Location permission is denied. Allow location access and retry GPS."
              : "GPS position unavailable. Move to an open area and retry GPS.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

function readPixels(source: ImageBitmap, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable in this browser.");
  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

async function sha256Hex(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function analyzeImage(blob: Blob): Promise<ImageAnalysis> {
  const bitmap = await createImageBitmap(blob);
  try {
    const { width, height } = bitmap;
    const imageSha256 = await sha256Hex(await blob.arrayBuffer());

    const sampleWidth = 320;
    const sampleHeight = Math.max(1, Math.round((height / width) * sampleWidth));
    const pixels = readPixels(bitmap, sampleWidth, sampleHeight);
    const gray = new Float32Array(sampleWidth * sampleHeight);
    const topRows = Math.max(1, Math.floor(sampleHeight / 3));
    let lumaSum = 0;
    let skyCount = 0;
    for (let i = 0; i < gray.length; i++) {
      const p = i * 4;
      const r = pixels[p];
      const g = pixels[p + 1];
      const b = pixels[p + 2];
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      gray[i] = luma * 255;
      lumaSum += luma;
      if (Math.floor(i / sampleWidth) < topRows && b > r + 15 && b > g && luma > 0.5) {
        skyCount++;
      }
    }

    let lapSum = 0;
    let lapSquares = 0;
    let lapCount = 0;
    for (let y = 1; y < sampleHeight - 1; y++) {
      for (let x = 1; x < sampleWidth - 1; x++) {
        const i = y * sampleWidth + x;
        const laplacian =
          4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - sampleWidth] - gray[i + sampleWidth];
        lapSum += laplacian;
        lapSquares += laplacian * laplacian;
        lapCount++;
      }
    }
    const lapMean = lapSum / lapCount;

    const tiny = readPixels(bitmap, 8, 8);
    const tinyGray: number[] = [];
    for (let i = 0; i < 64; i++) {
      const p = i * 4;
      tinyGray.push(0.299 * tiny[p] + 0.587 * tiny[p + 1] + 0.114 * tiny[p + 2]);
    }
    const tinyMean = tinyGray.reduce((sum, value) => sum + value, 0) / 64;

    return {
      imageSha256,
      averageHash: tinyGray.map((value) => (value >= tinyMean ? "1" : "0")).join(""),
      width,
      height,
      sharpness: lapSquares / lapCount - lapMean * lapMean,
      skyFraction: skyCount / (topRows * sampleWidth),
      meanLuma: lumaSum / gray.length,
    };
  } finally {
    bitmap.close();
  }
}

export const DECISION_LABEL: Record<string, string> = {
  pending_analysis: "Pending analysis",
  accepted: "Accepted",
  retake_required: "Retake required",
  supervisor_review: "Supervisor review",
};

export const DECISION_TONE: Record<string, string> = {
  pending_analysis: "bg-muted text-muted-foreground",
  accepted: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400",
  retake_required: "bg-red-600/15 text-red-700 dark:text-red-400",
  supervisor_review: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
};

export const TASK_LABEL: Record<string, string> = {
  open: "Open",
  in_review: "Awaiting review",
  complete: "Complete",
  corrective_action_required: "Incomplete — corrective action required",
};

export const TASK_TONE: Record<string, string> = {
  open: "bg-muted text-muted-foreground",
  in_review: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  complete: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400",
  corrective_action_required: "bg-red-600/15 text-red-700 dark:text-red-400",
};
