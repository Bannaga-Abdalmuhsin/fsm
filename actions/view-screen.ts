import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { z } from "zod";

import getOrder from "./get-pmr-order";
export default defineAction({
  description:
    "Read current PMR navigation and the authorized selected work order.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  run: async () => {
    const navigation = (await readAppState("navigation")) as {
      path?: string;
    } | null;
    const id = navigation?.path?.match(/^\/orders\/([\w-]+)/)?.[1];
    return {
      navigation,
      ...(id ? { workOrder: await getOrder.run({ id }) } : {}),
    };
  },
});
