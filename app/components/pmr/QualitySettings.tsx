import { useState } from "react";

import { Shell, Badge } from "@/components/pmr/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionQuery, useActionMutation } from "@/lib/pmr-actions";

import { defaultPolicy, dimensions } from "../../../shared/pmr";
export default function Settings() {
  const { data } = useActionQuery("get-pmr-dashboard", {});
  const save = useActionMutation("save-pmr-policy");
  const [message, setMessage] = useState("");
  return (
    <>
      <div className="pmr-page-heading">
        <div>
          <h1>Quality controls</h1>
          <p>Policy changes apply to newly scheduled work orders.</p>
        </div>
      </div>
      <section className="pmr-settings">
        <h2>Integration readiness</h2>
        <div className="pmr-setting-row">
          <div>
            <strong>Private evidence storage</strong>
            <p>Original images must persist before they can be reviewed.</p>
          </div>
          <Badge tone={data?.readiness.storage ? "green" : "orange"}>
            {data?.readiness.storage ? "Available" : "Configuration required"}
          </Badge>
        </div>
        <div className="pmr-setting-row">
          <div>
            <strong>Equipment recognition & OCR</strong>
            <p>
              Connect the registered PMR OpenAI vision secret through framework
              settings. Photos are sent to OpenAI only when that key is
              available.
            </p>
          </div>
          <Badge tone={data?.readiness.vision ? "green" : "orange"}>
            {data?.readiness.vision
              ? "Key configured · verify with a pilot"
              : "Pending configuration"}
          </Badge>
        </div>
        <p className="pmr-hint">
          Web capture cannot independently prove device GPS, clock integrity or
          camera provenance. Native device attestation requires a mobile
          integration.
        </p>
      </section>
      <section className="pmr-settings">
        <h2>Scoring policy</h2>
        <p className="pmr-hint">
          Initial weights shown below. Published policy snapshots remain
          attached to each work order.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const weights = Object.fromEntries(
              dimensions.map((k) => [k, Number(f.get(k))]),
            ) as typeof defaultPolicy.weights;
            setMessage("Saving policy…");
            void save
              .mutateAsync({
                weights,
                pass: Number(f.get("pass")),
                review: Number(f.get("review")),
              })
              .then((r) =>
                setMessage(`Policy version ${r.policy.version} published.`),
              )
              .catch((e) => setMessage(e.message));
          }}
        >
          <fieldset disabled={data?.user.role !== "admin" || save.isPending}>
            <div className="pmr-policy-grid">
              {dimensions.map((k) => (
                <label key={k}>
                  {k}
                  <Input
                    name={k}
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={defaultPolicy.weights[k]}
                  />
                </label>
              ))}
              <label>
                Pass threshold
                <Input name="pass" type="number" defaultValue={90} />
              </label>
              <label>
                Review threshold
                <Input name="review" type="number" defaultValue={75} />
              </label>
            </div>
            <Button>Publish new policy</Button>
          </fieldset>
          {message && (
            <p role="status" className="pmr-notice">
              {message}
            </p>
          )}
        </form>
      </section>
      <section className="pmr-settings">
        <h2>Mandatory evidence rules</h2>
        <ul>
          <li>
            Direct camera capture; gallery requires an expiring, scoped admin
            exception.
          </li>
          <li>
            Location must be reliably inside 250 metres with a fresh, accurate
            fix.
          </li>
          <li>
            Original capture time must fall within the authorized TCN window.
          </li>
          <li>
            Wrong equipment, confirmed historical reuse and unresolved condition
            findings block acceptance.
          </li>
          <li>
            Functional checks need readings and test records; photos never
            auto-pass them.
          </li>
        </ul>
      </section>
    </>
  );
}
