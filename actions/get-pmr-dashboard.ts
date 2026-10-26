import { defineAction } from "@agent-native/core/action";
import { getPrivateBlobStorageReadinessForRequest } from "@agent-native/core/private-blob";
import { resolveSecretDetailed } from "@agent-native/core/server";
import { desc } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db";
import { identity, orderFilter } from "../server/pmr/access";
import { checklists } from "../shared/checklists";
export default defineAction({
  description:
    "Get assigned PMR work orders, role, checklist catalogue and integration readiness.",
  http: { method: "GET" },
  schema: z.object({}),
  run: async () => {
    const user = await identity();
    const orders =
      user.role === "unassigned"
        ? []
        : await getDb()
            .select({
              id: schema.pmrOrders.id,
              siteId: schema.pmrOrders.siteId,
              siteType: schema.pmrOrders.siteType,
              region: schema.pmrOrders.region,
              team: schema.pmrOrders.team,
              wo: schema.pmrOrders.wo,
              tcn: schema.pmrOrders.tcn,
              status: schema.pmrOrders.status,
              scheduledStart: schema.pmrOrders.scheduledStart,
              scheduledEnd: schema.pmrOrders.scheduledEnd,
              assignee: schema.pmrOrders.assignee,
              month: schema.pmrOrders.month,
            })
            .from(schema.pmrOrders)
            .where(orderFilter(user))
            .orderBy(desc(schema.pmrOrders.scheduledStart))
            .limit(200);
    const storage = await getPrivateBlobStorageReadinessForRequest();
    const secret = await resolveSecretDetailed("PMR_OPENAI_API_KEY");
    return {
      user,
      orders,
      readiness: {
        storage: storage.configured,
        vision: Boolean(secret.value),
        message:
          "Camera and GPS must be tested on the field device. AI results require supervisor review.",
      },
    };
  },
});
