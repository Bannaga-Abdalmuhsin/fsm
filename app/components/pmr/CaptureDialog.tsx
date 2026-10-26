import { useActionMutation } from "@agent-native/core/client/hooks";
import { IconCamera, IconUpload } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  analyzeImage,
  DECISION_LABEL,
  DECISION_TONE,
  getPosition,
} from "@/lib/pmr-client";

export type CaptureTask = {
  id: string;
  title: string;
  evidenceGroup: string;
  expectedEquipment: string;
  requiredDetails: string;
};

export type GalleryAccess = {
  id: string;
  evidenceGroups: string[];
  reason: string;
  expiresAt: string;
  imagesRemaining: number;
};

type EvidenceResult = {
  evidence: {
    decision: string;
    distanceMeters: number;
    accuracyMeters: number;
    findings: { id: string; code: string; message: string; severity: string }[];
  };
  expectedEquipment: string;
  requiredDetails: string;
};

type Props = {
  workOrderId: string;
  task: CaptureTask | null;
  galleryAccess: GalleryAccess[];
  onClose: () => void;
};

export function CaptureDialog({ workOrderId, task, galleryAccess, onClose }: Props) {
  const videoElement = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvidenceResult | null>(null);
  const submit = useActionMutation("submit-evidence");
  const taskId = task?.id;

  const attachStream = useCallback((element: HTMLVideoElement | null) => {
    videoElement.current = element;
    if (element && streamRef.current && element.srcObject !== streamRef.current) {
      element.srcObject = streamRef.current;
      void element.play().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    setCameraError(null);
    setResult(null);
    setError(null);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera is not available in this browser, so capture is blocked.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoElement.current) {
          videoElement.current.srcObject = stream;
          void videoElement.current.play().catch(() => undefined);
        }
      } catch (caught) {
        if (!cancelled) {
          setCameraError(
            caught instanceof Error
              ? `${caught.message} Allow camera access and retry.`
              : "Camera unavailable. Allow camera access and retry.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [taskId]);

  const submitImage = async (input: {
    blob: Blob;
    capturedAt: Date;
    source: "camera" | "admin_import";
    galleryApprovalId?: string;
  }) => {
    if (!task) return;
    setBusy("Reading GPS…");
    const fix = await getPosition();
    setBusy("Analyzing photograph…");
    const analysis = await analyzeImage(input.blob);
    setBusy("Checking evidence…");
    const response = await submit.mutateAsync({
      workOrderId,
      taskId: task.id,
      source: input.source,
      galleryApprovalId: input.galleryApprovalId,
      imageSha256: analysis.imageSha256,
      averageHash: analysis.averageHash,
      width: analysis.width,
      height: analysis.height,
      sharpness: analysis.sharpness,
      skyFraction: analysis.skyFraction,
      meanLuma: analysis.meanLuma,
      deviceCapturedAt: input.capturedAt.toISOString(),
      deviceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      clientSentAt: new Date().toISOString(),
      location: fix,
    });
    setResult(response);
  };

  const capture = async () => {
    const video = videoElement.current;
    if (!video || !streamRef.current || !video.videoWidth) {
      setError("Camera frame is not ready. Wait a moment and capture again.");
      return;
    }
    setError(null);
    setBusy("Capturing…");
    try {
      const capturedAt = new Date();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable in this browser.");
      context.drawImage(video, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (encoded) =>
            encoded ? resolve(encoded) : reject(new Error("Could not encode the photograph.")),
          "image/jpeg",
          0.92,
        ),
      );
      await submitImage({ blob, capturedAt, source: "camera" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Capture failed.");
    } finally {
      setBusy(null);
    }
  };

  const importApproval = task
    ? galleryAccess.find(
        (access) =>
          access.evidenceGroups.includes(task.evidenceGroup) && access.imagesRemaining > 0,
      )
    : undefined;

  const importFile = async (file: File) => {
    if (!importApproval) return;
    setError(null);
    setBusy("Importing approved photograph…");
    try {
      await submitImage({
        blob: file,
        capturedAt: new Date(file.lastModified),
        source: "admin_import",
        galleryApprovalId: importApproval.id,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed.");
    } finally {
      setBusy(null);
    }
  };

  const retake = () => {
    setResult(null);
    setError(null);
  };

  const blockEvent = (event: React.SyntheticEvent) => event.preventDefault();

  return (
    <Dialog open={task !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl"
        onPaste={blockEvent}
        onDrop={blockEvent}
        onDragOver={blockEvent}
      >
        <DialogHeader>
          <DialogTitle>{task?.title}</DialogTitle>
          <DialogDescription>
            Expected: {task?.expectedEquipment}. Required: {task?.requiredDetails}.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${DECISION_TONE[result.evidence.decision] ?? ""}`}
              >
                {DECISION_LABEL[result.evidence.decision] ?? result.evidence.decision}
              </span>
              <span className="text-xs text-muted-foreground">
                {Math.round(result.evidence.distanceMeters)} m from site · GPS ±
                {Math.round(result.evidence.accuracyMeters)} m
              </span>
            </div>
            {result.evidence.decision === "pending_analysis" && (
              <p className="text-sm text-muted-foreground">
                Equipment recognition and label OCR are not connected yet, so this photograph cannot be accepted automatically. It is stored as pending analysis.
              </p>
            )}
            {result.evidence.findings.length > 0 && (
              <ul className="space-y-2">
                {result.evidence.findings.map((finding) => (
                  <li key={finding.id} className="rounded-md border p-3 text-sm">
                    {finding.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={retake}>
                Capture again
              </Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {cameraError ? (
              <div className="rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm">
                {cameraError}
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-md bg-black">
                <video
                  ref={attachStream}
                  autoPlay
                  playsInline
                  muted
                  className="aspect-video w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-6 rounded-md border border-white/60" />
              </div>
            )}
            {error && (
              <p className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm">
                {error}
              </p>
            )}
            {busy && <p className="text-sm text-muted-foreground">{busy}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Capture is camera-only. Frame the whole subject with its label visible.
              </p>
              <div className="flex gap-2">
                {importApproval && (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
                    <IconUpload size={16} />
                    Import approved photo
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void importFile(file);
                      }}
                    />
                  </label>
                )}
                <Button onClick={capture} disabled={!!busy || !!cameraError}>
                  <IconCamera size={16} />
                  Capture photograph
                </Button>
              </div>
            </div>
            {importApproval && (
              <p className="text-xs text-muted-foreground">
                Admin-approved import allowed: {importApproval.reason}. Imports keep the label “Admin-approved import” and still pass quality, location, time, and duplicate checks.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
