import { useState } from "react";

import { Shell, Badge } from "@/components/pmr/Shell";
import { useActionQuery } from "@/lib/pmr-actions";

import { checklists } from "../../shared/checklists";
export function meta() {
  return [{ title: "PMR checklists · FSM Performance Check" }];
}
export default function Checklists() {
  const { data } = useActionQuery("get-pmr-dashboard", {});
  const [type, setType] = useState<"ODU" | "SHELTER">("ODU");
  const [search, setSearch] = useState("");
  return (
    <>
      <div className="pmr-page-heading">
        <div>
          <h1>Capture by equipment.</h1>
          <p>Every ETL stays traceable to its original requirement.</p>
        </div>
        <select
          aria-label="Checklist site type"
          value={type}
          onChange={(e) => setType(e.target.value as "ODU" | "SHELTER")}
        >
          <option value="ODU">ODU · 67 ETLs · 15 groups</option>
          <option value="SHELTER">Shelter · 144 ETLs · 28 groups</option>
        </select>
      </div>
      <input
        className="pmr-native-input"
        aria-label="Search checklist"
        placeholder="Search equipment or ETL"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="pmr-checklists">
        {checklists[type]
          .filter((g) =>
            `${g.title} ${g.etls.map((e) => e.description).join(" ")}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((g) => (
            <details key={g.id}>
              <summary>
                <Badge tone="purple">{g.id}</Badge>
                <strong>{g.title}</strong>
                <span>{g.etls.length} ETLs</span>
              </summary>
              {g.etls.map((e) => (
                <div key={e.code} className="pmr-catalogue-etl">
                  <code>{e.code}</code>
                  <p>{e.description}</p>
                  {e.requiresClarification && (
                    <Badge tone="orange">Source clarification required</Badge>
                  )}
                  <small>{e.source}</small>
                </div>
              ))}
            </details>
          ))}
      </div>
    </>
  );
}
