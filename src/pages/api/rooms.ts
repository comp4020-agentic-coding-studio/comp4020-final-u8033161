import type { APIRoute } from "astro";

import { createRoom, presenterCookieName } from "../../lib/rooms.ts";

export const POST: APIRoute = async ({ cookies, url }) => {
  const { code, presenterToken } = await createRoom();

  // httpOnly: the stage is projected, so the presenter's key must never be
  // visible in the address bar. Scoped to this room's code so a presenter
  // can run more than one crit without the cookies colliding.
  cookies.set(presenterCookieName(code), presenterToken, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return new Response(JSON.stringify({ code }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
};
