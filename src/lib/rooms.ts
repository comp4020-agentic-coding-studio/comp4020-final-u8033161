import { randomBytes, randomInt } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "../db/client.ts";
import { cards, rooms } from "../db/schema.ts";
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

export async function addCard(roomId: number, step: Step, body: string) {
  const [card] = await db.insert(cards).values({ roomId, step, body }).returning();
  return card;
}

export async function listCards(roomId: number) {
  return db.query.cards.findMany({ where: eq(cards.roomId, roomId) });
}
