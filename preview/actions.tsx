import { createContext, useContext, useState, type ReactNode } from "react";

import { checklists } from "../shared/checklists";
import { defaultPolicy } from "../shared/pmr";
const one = "11111111-1111-4111-8111-111111111111",
  two = "22222222-2222-4222-8222-222222222222";
export const demoEmail = "technician@example.invalid";
function makeOrder(id: string, type: "ODU" | "SHELTER", status: string) {
  const start = new Date();
  start.setUTCHours(6, 0, 0, 0);
  const end = new Date(start.getTime() + 8 * 3600000);
  return {
    id,
    ownerEmail: "supervisor@example.invalid",
    orgId: "synthetic-demo",
    siteId: type === "ODU" ? "DEMO-ODU-001" : "DEMO-SHL-002",
    siteType: type,
    region: type === "ODU" ? "CR" : "ER",
    team: type === "ODU" ? "Sample team A" : "Sample team B",
    assignee: demoEmail,
    wo: type === "ODU" ? "DEMO-WO-001" : "DEMO-WO-002",
    tcn: type === "ODU" ? "DEMO-TCN-001" : "DEMO-TCN-002",
    month: start.toISOString().slice(0, 7),
    latitude: 0,
    longitude: 0,
    scheduledStart: start.toISOString(),
    scheduledEnd: end.toISOString(),
    tcnStart: start.toISOString(),
    tcnEnd: end.toISOString(),
    status,
    checkedInAt: start.toISOString(),
    checkIn: null,
    inventory: {},
    checklist: checklists[type],
    policy: defaultPolicy,
    version: 1,
    createdAt: start.toISOString(),
    updatedAt: start.toISOString(),
    reviewNote: "",
  };
}
const sampleOrders = [
  makeOrder(one, "ODU", "In progress"),
  makeOrder(two, "SHELTER", "Assigned"),
];
const samplePhoto = {
  id: "sample-rectifier",
  ownerEmail: demoEmail,
  orderId: one,
  groupId: "O13",
  instance: "1",
  source: "camera",
  capturedAt: new Date().toISOString(),
  uploadedAt: new Date().toISOString(),
  state: "Supervisor review",
  linkedEtls: ["COW ODU_MONTHLY_ONSITE_62", "COW ODU_MONTHLY_ONSITE_66"],
  quality: {
    score: 88,
    provisional: false,
    dimensions: {
      clarity: 90,
      coverage: 85,
      integrity: 90,
      location: 100,
      time: 75,
    },
  },
  findings: [
    {
      code: "demo-readable-label",
      message:
        "Illustrative finding: confirm the module labels and configuration before acceptance.",
      severity: "review",
      confidence: 0.86,
    },
  ],
  analysis: {
    complete: false,
    error:
      "DEMO: this is a labeled synthetic illustration. The score and finding are predefined examples, not real OCR or image analysis.",
  },
  reviewNote: "",
  revision: 1,
};
type State = {
  orders: any[];
  results: any[];
  evidence: any[];
  approvals: any[];
  audit: any[];
  role: string;
  policy: any;
  notice: string;
};
const initial = (): State => ({
  orders: structuredClone(sampleOrders),
  results: [],
  evidence: [structuredClone(samplePhoto)],
  approvals: [],
  audit: [],
  role: "admin",
  policy: structuredClone(defaultPolicy),
  notice: "",
});
const Context = createContext<{
  state: State;
  setState: React.Dispatch<React.SetStateAction<State>>;
} | null>(null);
export function PreviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initial);
  return (
    <Context.Provider value={{ state, setState }}>
      <div className="demo-ribbon">
        <div>
          <strong>INTERACTIVE DEMO</strong>
          <span>
            Sample data only · no live login, uploads, GPS verification or AI
            analysis
          </span>
        </div>
        <div className="demo-role">
          <label>
            Explore as{" "}
            <select
              aria-label="Demo role"
              value={state.role}
              onChange={(e) =>
                setState((s) => ({ ...s, role: e.target.value }))
              }
            >
              <option value="admin">Administrator</option>
              <option value="supervisor">Supervisor</option>
              <option value="technician">Technician</option>
            </select>
          </label>
          <button onClick={() => setState(initial())}>Reset demo</button>
          <a
            href="https://github.com/Bannaga-Abdalmuhsin/fsm"
            target="_blank"
            rel="noreferrer"
          >
            View source ↗
          </a>
        </div>
      </div>
      {state.notice && (
        <div className="demo-toast" role="status">
          {state.notice}
          <button
            onClick={() => setState((s) => ({ ...s, notice: "" }))}
            aria-label="Dismiss demo notification"
          >
            ×
          </button>
        </div>
      )}
      {children}
    </Context.Provider>
  );
}
export function usePreview() {
  const value = useContext(Context);
  if (!value) throw new Error("Demo context missing");
  return value;
}
export function useActionQuery(name: string, params: any = {}) {
  const { state } = usePreview();
  const user = {
    email: demoEmail,
    orgId: "synthetic-demo",
    role: state.role,
    regions: ["CR", "ER", "WR", "SR"],
  };
  let data: any;
  if (name === "get-pmr-dashboard")
    data = {
      user,
      orders: state.orders,
      readiness: {
        storage: false,
        vision: false,
        message: "Public demonstration only.",
      },
    };
  if (name === "get-pmr-order") {
    const order = state.orders.find((o) => o.id === params.id);
    if (order)
      data = {
        user,
        order,
        results: state.results.filter((r) => r.orderId === order.id),
        evidence: state.evidence.filter((r) => r.orderId === order.id),
        approvals: state.approvals.filter((r) => r.orderId === order.id),
        audit: state.audit.filter((r) => r.orderId === order.id),
      };
  }
  return {
    data,
    isLoading: false,
    error: data ? null : new Error("Sample work order not found."),
    refetch: async () => ({ data }),
  };
}
export function useActionMutation(name: string) {
  const { state, setState } = usePreview();
  const [isPending, setPending] = useState(false);
  async function mutateAsync(args: any): Promise<any> {
    setPending(true);
    try {
      if (name === "create-pmr-order") {
        if (state.role === "technician")
          throw new Error("Demo: supervisor access is required.");
        if (state.orders.some((o) => o.wo === args.wo))
          throw new Error("This work order already exists.");
        const id = crypto.randomUUID();
        setState((s) => ({
          ...s,
          orders: [
            {
              ...makeOrder(id, args.siteType, "Assigned"),
              ...args,
              id,
              checklist: checklists[args.siteType as "ODU" | "SHELTER"],
              policy: s.policy,
              latitude: 0,
              longitude: 0,
              assignee: demoEmail,
            },
            ...s.orders,
          ],
          notice:
            "Demo work order created in memory. Nothing was uploaded or saved on a server.",
        }));
        return { id };
      }
      if (name === "check-in-pmr") {
        setState((s) => ({
          ...s,
          orders: s.orders.map((o) =>
            o.id === args.id
              ? {
                  ...o,
                  status: "In progress",
                  checkedInAt: new Date().toISOString(),
                }
              : o,
          ),
          notice: "Simulated check-in only. No GPS was read or verified.",
        }));
        return { id: args.id };
      }
      if (name === "save-pmr-result") {
        if (
          ["Not applicable", "Not tested"].includes(args.status) &&
          !args.remarks.trim()
        )
          throw new Error("A reason is required.");
        if (args.status === "Fail" && !args.tt.trim())
          throw new Error("Add the corrective TT or pending action.");
        const record = {
          ...args,
          orderId: args.id,
          id: crypto.randomUUID(),
          updatedAt: new Date().toISOString(),
        };
        setState((s) => ({
          ...s,
          results: [
            ...s.results.filter(
              (r) =>
                !(
                  r.orderId === args.id &&
                  r.etlCode === args.etlCode &&
                  r.instance === args.instance
                ),
            ),
            record,
          ],
          notice: "Demo checklist result saved in memory.",
        }));
        return { id: record.id };
      }
      if (name === "save-pmr-policy") {
        if (state.role !== "admin") throw new Error("Admin access required.");
        if (
          Object.values(args.weights).reduce((n: any, v: any) => n + v, 0) !==
            100 ||
          args.review >= args.pass
        )
          throw new Error("Weights must total 100; review must be below pass.");
        const policy = {
          ...state.policy,
          ...args,
          version: state.policy.version + 1,
        };
        setState((s) => ({
          ...s,
          policy,
          notice: "Demo policy updated in memory only.",
        }));
        return { id: "demo-policy", policy };
      }
      if (name === "review-pmr-evidence") {
        if (state.role === "technician")
          throw new Error("Supervisor access required.");
        if (!args.linkedEtls.length)
          throw new Error("Select at least one visible ETL.");
        setState((s) => ({
          ...s,
          evidence: s.evidence.map((p) =>
            p.id === args.id
              ? {
                  ...p,
                  state: args.conditionIssue
                    ? "Retake required"
                    : args.decision,
                  linkedEtls: args.linkedEtls,
                  reviewNote: args.note,
                  revision: p.revision + 1,
                }
              : p,
          ),
          notice:
            "Illustrative review updated. No real photograph was analysed.",
        }));
        return { id: args.id };
      }
      if (name === "manage-pmr-approval") {
        if (state.role !== "admin") throw new Error("Admin access required.");
        const id = crypto.randomUUID();
        setState((s) => ({
          ...s,
          approvals: [
            ...s.approvals,
            {
              ...args,
              id,
              orderId: args.id,
              technician: demoEmail,
              used: 0,
              revokedAt: null,
            },
          ],
          notice:
            "Demo gallery exception recorded. Public preview never accepts image uploads.",
        }));
        return { id };
      }
      if (name === "update-pmr-order")
        throw new Error(
          "Demo: final PMR submission needs the configured live backend, completed ETLs and accepted evidence.",
        );
      throw new Error("This operation requires the live backend.");
    } finally {
      setPending(false);
    }
  }
  return {
    mutateAsync,
    mutate: (args: any) => void mutateAsync(args),
    isPending,
  };
}
export async function signOut() {
  window.location.hash = "/";
}
