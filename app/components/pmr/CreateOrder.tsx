import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useActionMutation } from "@/lib/pmr-actions";

import { localToIso } from "../../../shared/pmr";
export function CreateOrder({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const action = useActionMutation("create-pmr-order");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const f = new FormData(event.currentTarget);
    const s = (key: string) => String(f.get(key) ?? "");
    try {
      const inventory = JSON.parse(s("inventory") || "{}");
      await action.mutateAsync({
        siteId: s("siteId"),
        siteType: s("siteType") as "ODU" | "SHELTER",
        region: s("region") as "CR" | "ER" | "WR" | "SR",
        team: s("team"),
        assignee: s("assignee"),
        wo: s("wo"),
        tcn: s("tcn"),
        month: s("month"),
        latitude: Number(s("latitude")),
        longitude: Number(s("longitude")),
        scheduledStart: localToIso(s("scheduledStart")),
        scheduledEnd: localToIso(s("scheduledEnd")),
        tcnStart: localToIso(s("tcnStart")),
        tcnEnd: localToIso(s("tcnEnd")),
        inventory,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="pmr-form-dialog">
        <DialogHeader>
          <DialogTitle>Schedule a PMR visit</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="pmr-form-grid">
          {[
            ["siteId", "Site ID", "text"],
            ["wo", "Work order", "text"],
            ["tcn", "TCN ticket", "text"],
            ["month", "PMR month", "month"],
            ["team", "Team", "text"],
            ["assignee", "Technician email", "email"],
            ["latitude", "Site latitude", "number"],
            ["longitude", "Site longitude", "number"],
            ["scheduledStart", "Visit starts · Riyadh", "datetime-local"],
            ["scheduledEnd", "Visit ends · Riyadh", "datetime-local"],
            ["tcnStart", "TCN starts · Riyadh", "datetime-local"],
            ["tcnEnd", "TCN ends · Riyadh", "datetime-local"],
          ].map(([name, label, type]) => (
            <label key={name}>
              {label}
              <Input
                name={name}
                type={type}
                step={type === "number" ? "any" : undefined}
                required
              />
            </label>
          ))}
          <label>
            Site type
            <select name="siteType">
              <option value="ODU">ODU · 67 ETLs</option>
              <option value="SHELTER">Shelter · 144 ETLs</option>
            </select>
          </label>
          <label>
            Region
            <select name="region">
              {["CR", "ER", "WR", "SR"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="pmr-span">
            Equipment repetitions (optional)
            <Input
              name="inventory"
              placeholder={
                'Example: {"O07":2,"O09":2} — repeat every relevant group for each generator'
              }
            />
          </label>
          {error && (
            <p className="pmr-error pmr-span" role="alert">
              {error}
            </p>
          )}
          <div className="pmr-span pmr-row">
            <Button disabled={action.isPending}>
              {action.isPending ? "Scheduling…" : "Schedule visit"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
