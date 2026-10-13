// In-memory per-room SSE fan-out. Deliberately not persisted to SQLite: an
// open connection only describes which browser tabs happen to be attached
// right now, which has no meaning across a restart, and `pendingStep` (the
// presenter's not-yet-committed rung change, set by the countdown logic in
// step.ts) is equally transient. Both only work because fly.toml pins this
// app to a single machine (`--ha=false`) -- a second instance would keep its
// own, disjoint table and its clients would never hear from the other's.
// See PROCESS.md ADR 2 for the consequence: a restart mid-countdown drops
// the pending change, and the presenter just clicks the rung again.

type Controller = ReadableStreamDefaultController<Uint8Array>;

const connections = new Map<string, Set<Controller>>();

export interface PendingStep {
  closingStep: number;
  nextStep: number;
  closesAt: number; // epoch ms
}

const pending = new Map<string, PendingStep>();

export function getPendingStep(code: string): PendingStep | undefined {
  return pending.get(code);
}

export function setPendingStep(code: string, value: PendingStep | undefined): void {
  if (value) pending.set(code, value);
  else pending.delete(code);
}

const encoder = new TextEncoder();

function frame(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function addConnection(code: string, controller: Controller): void {
  let set = connections.get(code);
  if (!set) {
    set = new Set();
    connections.set(code, set);
  }
  set.add(controller);
}

export function removeConnection(code: string, controller: Controller): void {
  const set = connections.get(code);
  if (!set) return;
  set.delete(controller);
  if (set.size === 0) connections.delete(code);
}

// One connection's `enqueue` throwing (a half-closed socket, a client that
// vanished without a clean close) must not stop the rest of the room from
// hearing the event -- each write is isolated, and a failing connection is
// simply dropped from the table. Its own EventSource reconnects on its own
// and gets caught up by the snapshot every new connection receives.
export function broadcast(code: string, event: string, data: unknown): void {
  const set = connections.get(code);
  if (!set) return;
  const payload = frame(event, data);
  for (const controller of set) {
    try {
      controller.enqueue(payload);
    } catch {
      set.delete(controller);
    }
  }
}

export function sendTo(controller: Controller, event: string, data: unknown): void {
  try {
    controller.enqueue(frame(event, data));
  } catch {
    // the connection is already gone; the stream's own cancel() cleans up
    // its entry in `connections`
  }
}
