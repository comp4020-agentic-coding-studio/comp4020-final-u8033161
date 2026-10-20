import { JSDOM } from "jsdom";
import { expect, inject, it } from "vitest";

// HTTP-only against the running app, same as invariants.test.ts.
const baseUrl = inject("baseUrl");

// Server-side fetch (unlike a browser) doesn't send an Origin header on its
// own, and Astro rejects cross-site POSTs without one -- so every POST here
// sets it to the app's own origin, same as a same-origin browser request
// would. `cookie`, when given, is the participant or presenter cookie to
// send -- node's fetch has no cookie jar of its own, unlike a browser.
function post(path: string, body: unknown, cookie?: string): Promise<Response> {
  return fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: new URL(baseUrl).origin,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function createRoom(): Promise<string> {
  const res = await post("/api/rooms", {});
  expect(res.status).toBe(201);
  const { code } = (await res.json()) as { code: string };
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

// Same as createRoom, but also hands back the presenter cookie -- needed by
// anything that has to load the stage page itself (GET /stage/<code>),
// which redirects anyone without it.
async function createRoomWithPresenterCookie(): Promise<{ code: string; presenterCookie: string }> {
  const res = await post("/api/rooms", {});
  expect(res.status).toBe(201);
  const { code } = (await res.json()) as { code: string };
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie, "createRoom's response carried no Set-Cookie header").toBeTruthy();
  return { code, presenterCookie: setCookie!.split(";")[0] };
}

// Joins a room as a fresh participant, returning the Cookie header value for
// the identity the server just minted -- see docs/access-control.md for why
// card submission requires this rather than accepting an identity the
// request body claims.
async function joinParticipant(code: string, name = "[example] participant"): Promise<string> {
  const res = await post(`/api/rooms/${code}/join`, { name });
  expect(res.status).toBe(201);
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie, "join's response carried no Set-Cookie header").toBeTruthy();
  return setCookie!.split(";")[0];
}

it("creates a room", async () => {
  const res = await post("/api/rooms", {});
  expect(res.status).toBe(201);
  const body = (await res.json()) as { code: string };
  expect(body.code).toMatch(/^\d{6}$/);
});

it("keeps a card submitted on the open rung after a refresh", async () => {
  const code = await createRoom();
  const participantCookie = await joinParticipant(code);
  const text = "[example] clarifying question submitted on the open rung";

  const submit = await post(`/api/rooms/${code}/cards`, { step: 1, body: text }, participantCookie);
  expect(submit.status).toBe(201);

  for (let refresh = 0; refresh < 2; refresh++) {
    const state = await fetch(new URL(`/api/rooms/${code}`, baseUrl));
    expect(state.status).toBe(200);
    const { currentStep, cards } = (await state.json()) as {
      currentStep: number;
      cards: { step: number; body: string }[];
    };
    expect(currentStep).toBe(1);
    expect(cards.some((c) => c.body === text)).toBe(true);
  }
});

it("rejects a card sent to a rung that isn't open", async () => {
  const code = await createRoom();
  const participantCookie = await joinParticipant(code);
  const text = "[example] suggestion sent before its rung opened";

  // Room starts on rung 1 (Clarify); rung 3 (Concerns) isn't open yet.
  const submit = await post(`/api/rooms/${code}/cards`, { step: 3, body: text }, participantCookie);
  expect(submit.status).toBe(409);

  const state = await fetch(new URL(`/api/rooms/${code}`, baseUrl));
  const { cards } = (await state.json()) as { cards: { body: string }[] };
  expect(cards.some((c) => c.body === text)).toBe(false);
});

it("rejects a card submitted with no participant identity", async () => {
  const code = await createRoom();
  const text = "[example] submitted with no participant cookie at all";

  const submit = await post(`/api/rooms/${code}/cards`, { step: 1, body: text });
  expect(submit.status).toBe(403);

  const state = await fetch(new URL(`/api/rooms/${code}`, baseUrl));
  const { cards } = (await state.json()) as { cards: { body: string }[] };
  expect(cards.some((c) => c.body === text)).toBe(false);
});

it("attributes a card to the submitting participant's own cookie, never to an identity the body claims", async () => {
  const code = await createRoom();
  const aliceCookie = await joinParticipant(code, "[example] Alice");
  await joinParticipant(code, "[example] Bob"); // a real participant to impersonate
  const text = "[example] Alice tries to submit a card as Bob";

  // Alice's own cookie is what the server trusts -- claiming to be Bob in
  // the body must not attribute the card to Bob.
  const submit = await post(
    `/api/rooms/${code}/cards`,
    { step: 1, body: text, participantId: "forged", name: "Bob" },
    aliceCookie,
  );
  expect(submit.status).toBe(201);

  const state = await fetch(new URL(`/api/rooms/${code}`, baseUrl));
  const { cards } = (await state.json()) as { cards: { body: string; participantName: string | null }[] };
  const posted = cards.find((c) => c.body === text);
  expect(posted?.participantName).toBe("[example] Alice");
});

// Regression test for the author-glued-to-body rendering: a card used to
// render as "Alicedo you have a question" with no separator at all, because
// the author span and the card text were siblings with no element wrapping
// the body -- indistinguishable once CSS failed to apply (see
// src/pages/stage/[code].astro's card-chip-template comment). This checks
// the structure the stage serves, not just the text content, so a future
// regression back to a bare text node next to .card-author would fail here
// even if the two still happened to read unambiguously.
it("renders a card's author and text as separate elements on the stage", async () => {
  const { code, presenterCookie } = await createRoomWithPresenterCookie();
  const participantCookie = await joinParticipant(code, "[example] Alice");
  const text = "[example] do you have any questions";

  const submit = await post(`/api/rooms/${code}/cards`, { step: 1, body: text }, participantCookie);
  expect(submit.status).toBe(201);

  const stage = await fetch(new URL(`/stage/${code}`, baseUrl), { headers: { cookie: presenterCookie } });
  expect(stage.status).toBe(200);
  const dom = new JSDOM(await stage.text());

  const chip = [...dom.window.document.querySelectorAll(".card-chip")].find((el) =>
    el.querySelector(".card-body")?.textContent?.includes(text),
  );
  expect(chip, "no .card-chip rendered the submitted card's text").toBeTruthy();

  const author = chip!.querySelector(".card-author");
  const cardBody = chip!.querySelector(".card-body");
  expect(author, ".card-chip has no .card-author element").toBeTruthy();
  expect(cardBody, ".card-chip has no .card-body element").toBeTruthy();
  expect(author!.textContent?.trim()).toBe("[example] Alice");
  expect(cardBody!.textContent?.trim()).toBe(text);

  // The two must be separate elements, not one text node the author's name
  // was concatenated into -- this is what actually failed before the fix.
  expect(author).not.toBe(cardBody);
  expect(chip!.children).toHaveLength(2);
});
