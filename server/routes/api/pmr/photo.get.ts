import {
  readPrivateBlob,
  type PrivateBlobHandle,
} from "@agent-native/core/private-blob";
import { getSession, runWithRequestContext } from "@agent-native/core/server";
import { eq } from "drizzle-orm";
import { defineEventHandler, HTTPError } from "h3";

import { getDb, schema } from "../../../db";
import { orderAccess } from "../../../pmr/access";
export default defineEventHandler(async (event) => {
  const session = await getSession(event);
  if (!session)
    throw new HTTPError({ status: 401, message: "Sign in to view evidence." });
  const id = new URL(event.req.url).searchParams.get("id");
  return runWithRequestContext(
    { userEmail: session.email, orgId: session.orgId },
    async () => {
      const [photo] = await getDb()
        .select()
        .from(schema.pmrEvidence)
        .where(eq(schema.pmrEvidence.id, id ?? ""))
        .limit(1);
      if (!photo)
        throw new HTTPError({ status: 404, message: "Photo not found." });
      await orderAccess(photo.orderId);
      const blob = await readPrivateBlob(
        photo.handle as unknown as PrivateBlobHandle,
      );
      if (!blob)
        throw new HTTPError({
          status: 503,
          message: "Photo storage is unavailable.",
        });
      return new Response(new Uint8Array(blob.data), {
        headers: {
          "Content-Type": photo.mime,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'",
        },
      });
    },
  );
});
