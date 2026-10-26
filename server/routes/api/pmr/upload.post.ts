import { getSession, runWithRequestContext } from "@agent-native/core/server";
import { defineEventHandler, HTTPError, assertBodySize } from "h3";

import { storeEvidence } from "../../../pmr/upload";
export default defineEventHandler(async (event) => {
  const session = await getSession(event);
  if (!session)
    throw new HTTPError({ status: 401, message: "Sign in to upload." });
  const origin = event.req.headers.get("origin");
  if (origin && origin !== new URL(event.req.url).origin)
    throw new HTTPError({
      status: 403,
      message: "Cross-origin upload refused.",
    });
  const length = Number(event.req.headers.get("content-length") ?? 0);
  if (length > 16 * 1024 * 1024)
    throw new HTTPError({ status: 413, message: "Photo exceeds 15 MB." });
  assertBodySize(event, 16 * 1024 * 1024);
  const form = await event.req.formData();
  const file = form.get("photo");
  if (!(file instanceof File) || file.size > 15 * 1024 * 1024)
    throw new HTTPError({
      status: 400,
      message: "Choose a valid photo below 15 MB.",
    });
  let metadata: unknown;
  try {
    metadata = JSON.parse(String(form.get("metadata")));
  } catch {
    throw new HTTPError({ status: 400, message: "Invalid capture metadata." });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  return runWithRequestContext(
    { userEmail: session.email, orgId: session.orgId },
    () => storeEvidence(bytes, metadata),
  );
});
