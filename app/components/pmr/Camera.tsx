import {
  IconCamera,
  IconMapPin,
  IconRefresh,
  IconShieldCheck,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFix, saveDraft, type CaptureMeta } from "@/lib/pmr-offline";

import type { EvidenceGroup } from "../../../shared/checklists";
import { locationGate, type Policy } from "../../../shared/pmr";
export function Camera({
  open,
  onClose,
  group,
  order,
  instance,
  owner,
  onSaved,
  approval,
}: {
  open: boolean;
  onClose: () => void;
  group: EvidenceGroup;
  order: { id: string; latitude: number; longitude: number; policy: Policy };
  instance: string;
  owner: string;
  onSaved: () => void;
  approval?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let disposed = false;
    navigator.mediaDevices
      ?.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then((s) => {
        if (disposed) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        if (video.current) video.current.srcObject = s;
        setReady(true);
      })
      .catch(() =>
        setError(
          "Camera access is required. Open the app directly in HTTPS, allow the camera, and retry.",
        ),
      );
    return () => {
      disposed = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      setReady(false);
    };
  }, [open]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function keep(
    blob: Blob,
    source: "camera" | "gallery",
    capturedAt = new Date().toISOString(),
  ) {
    setBusy(true);
    setError("");
    try {
      const gps = await getFix();
      const gate = locationGate(gps, order, Date.now(), order.policy);
      if (!gate.allowed) throw new Error(gate.reason!);
      const captureId = crypto.randomUUID();
      const metadata: CaptureMeta = {
        orderId: order.id,
        groupId: group.id,
        instance,
        captureId,
        capturedAt,
        gps,
        source,
        ...(source === "gallery" ? { approvalId: approval } : {}),
      };
      await saveDraft({
        id: captureId,
        owner,
        metadata,
        blob,
        createdAt: new Date().toISOString(),
      });
      setPreview(URL.createObjectURL(blob));
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function capture() {
    if (!video.current || busy) return;
    setBusy(true);
    try {
      const el = video.current;
      if (!el.videoWidth) throw new Error("Camera is not ready.");
      const canvas = document.createElement("canvas");
      canvas.width = el.videoWidth;
      canvas.height = el.videoHeight;
      const capturedAt = new Date().toISOString();
      canvas.getContext("2d")!.drawImage(el, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Capture failed."))),
          "image/jpeg",
          0.94,
        ),
      );
      await keep(blob, "camera", capturedAt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="pmr-camera-dialog">
        <DialogHeader>
          <DialogTitle>
            {group.id} · {group.title} / {instance}
          </DialogTitle>
        </DialogHeader>
        <p className="pmr-hint">
          Capture an overview, then readable labels, meters or defects. This
          group contains {group.etls.length} checks.
        </p>
        <div className="pmr-viewfinder">
          {preview ? (
            <img src={preview} alt="Saved capture preview" />
          ) : (
            <video ref={video} autoPlay playsInline muted />
          )}
          <span className="pmr-viewfinder-label">
            <IconShieldCheck size={16} /> Original camera capture
          </span>
        </div>
        {error && (
          <p className="pmr-error" role="alert">
            {error}
          </p>
        )}
        <div className="pmr-row">
          <Button disabled={!ready || busy || !!preview} onClick={capture}>
            <IconCamera size={18} />
            {busy ? "Checking location…" : "Capture photo"}
          </Button>
          {preview && (
            <Button variant="outline" onClick={() => setPreview(null)}>
              <IconRefresh size={18} />
              Another angle
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
        {preview && (
          <p className="pmr-success">
            Encrypted draft saved. Sync to store and analyse.
          </p>
        )}
        {approval && (
          <label className="pmr-import">
            Admin-approved import
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void keep(file, "gallery");
                e.target.value = "";
              }}
            />
          </label>
        )}
        <p className="pmr-hint">
          <IconMapPin size={14} /> Location is checked again for each capture.
          Imported photos remain marked for provenance review.
        </p>
      </DialogContent>
    </Dialog>
  );
}
