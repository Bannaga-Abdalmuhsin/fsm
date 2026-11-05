import { Navigate } from "react-router";
import { RequireMember } from "@/components/pmr/pmr-shell";
export default function HomeRoute() {
  return (
    <RequireMember
      render={(m) => (
        <Navigate
          to={m.role === "technician" ? "/field-submissions" : "/dashboard"}
          replace
        />
      )}
    />
  );
}
