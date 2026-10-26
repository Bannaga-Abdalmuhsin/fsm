import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { z } from "zod";

import { resolveStaff } from "../server/lib/pmr.js";

export default defineAction({
  description: "Return the signed-in user's PMR role, or null when none is assigned.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const email = getRequestUserEmail();
    if (!email) fail("Sign in required.", { statusCode: 401 });
    const member = await resolveStaff(email);
    return member
      ? { email: member.email, name: member.name, role: member.role }
      : null;
  },
});
