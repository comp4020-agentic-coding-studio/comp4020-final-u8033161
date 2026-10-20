import { randomBytes, randomInt } from "node:crypto";

import { eq, inArray } from "drizzle-orm";

import { db } from "../db/client.ts";
import { cards, participants, rooms } from "../db/schema.ts";
import type { Step } from "./steps.ts";

export function presenterCookieName(code: string): string {
  return `presenter_${code}`;
}

function generateCode(): string {
  // Kahoot-style 6-digit PIN: easy to thumb-type on a phone.
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function createRoom(): Promise<{ code: string; presenterToken: string }> {
  const presenterToken = randomBytes(24).toString("base64url");

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    try {
      await db.insert(rooms).values({ code, presenterToken });
      return { code, presenterToken };
    } catch (err) {
      // SQLite's unique constraint failure -- code collision, try another.
      if (err instanceof Error && /UNIQUE/.test(err.message)) continue;
      throw err;
    }
  }
  throw new Error("could not allocate a free room code");
}

export async function getRoomByCode(code: string) {
  return db.query.rooms.findFirst({ where: eq(rooms.code, code) });
}

export async function setCurrentStep(roomId: number, step: Step): Promise<void> {
  await db.update(rooms).set({ currentStep: step }).where(eq(rooms.id, roomId));
}

export async function addCard(roomId: number, step: Step, body: string, participantId: string) {
  const [card] = await db.insert(cards).values({ roomId, step, body, participantId }).returning();
  return card;
}

// Includes the author's current display name alongside each card, so a
// rename doesn't require rewriting past cards -- a card's participantId is
// the fixed attribution, and the name resolved from it is always the
// participant's latest. A card with no participantId (submitted before
// participant identity existed) gets no participantName; callers render
// that as "anonymous".
export async function listCards(roomId: number) {
  const roomCards = await db.query.cards.findMany({ where: eq(cards.roomId, roomId) });
  const participantIds = [...new Set(roomCards.map((c) => c.participantId).filter((id) => id !== null))];
  const authors =
    participantIds.length > 0
      ? await db.query.participants.findMany({ where: inArray(participants.publicId, participantIds) })
      : [];
  const names = new Map(authors.map((p) => [p.publicId, p.name]));
  return roomCards.map((card) => ({
    ...card,
    participantName: card.participantId ? (names.get(card.participantId) ?? null) : null,
  }));
}
