import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "../db/client.ts";
import { participants } from "../db/schema.ts";

export const MAX_NAME_LENGTH = 30;

export function participantCookieName(code: string): string {
  return `participant_${code}`;
}

// Short and hex: safe to put in a log line or show next to a card, unlike
// the token below. Collisions are handled the same way createRoom handles a
// code collision -- retry with a fresh one.
function generatePublicId(): string {
  return randomBytes(4).toString("hex");
}

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

// Strips newlines and other control characters so a name can never forge a
// second field into a log line (see docs/access-control.md) or break the
// layout it's displayed in, then caps length. Trims first so padding
// whitespace doesn't count against the cap.
export function sanitizeName(raw: string): string {
  return raw
    .trim()
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .slice(0, MAX_NAME_LENGTH)
    .trim();
}

export async function createParticipant(
  roomId: number,
  rawName: string,
): Promise<{ publicId: string; token: string; name: string }> {
  const name = sanitizeName(rawName);
  if (!name) throw new Error("name must not be empty");

  const token = generateToken();

  for (let attempt = 0; attempt < 10; attempt++) {
    const publicId = generatePublicId();
    try {
      await db.insert(participants).values({ publicId, roomId, token, name });
      return { publicId, token, name };
    } catch (err) {
      if (err instanceof Error && /UNIQUE/.test(err.message)) continue;
      throw err;
    }
  }
  throw new Error("could not allocate a free participant id");
}

// Resolves a participant from the request's own cookie-held token, never
// from anything a request body claims. Also checked against roomId: the
// cookie name already scopes it to one room (participant_<code>), but a
// participant row always belongs to exactly the room it was created in, so
// this is a cheap second check rather than the only one.
export async function getParticipantByToken(roomId: number, token: string) {
  const participant = await db.query.participants.findFirst({ where: eq(participants.token, token) });
  if (!participant || participant.roomId !== roomId) return undefined;
  return participant;
}
