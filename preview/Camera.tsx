import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
export function Camera({
  open,
  onClose,
  group,
}: {
  open: boolean;
  onClose: () => void;
  group: { id: string; title: string };
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {group.id} · {group.title}
          </DialogTitle>
        </DialogHeader>
        <p>
          This is the public GitHub Pages preview. Camera, gallery and
          operational photo uploads are disabled here.
        </p>
        <p>
          The live application uses its authenticated backend for capture,
          geofence checks, private storage and analysis.
        </p>
        <Button onClick={onClose}>Back to checklist</Button>
      </DialogContent>
    </Dialog>
  );
}
