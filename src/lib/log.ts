// One line per server-side action, in a consistent key=value shape so
// `flyctl logs -a comp4020-final-u8033161 | grep action=card.submit` (or any
// other field) finds exactly what it names. Never includes a participant's
// or presenter's secret token -- only the public, already-safe-to-show
// identifiers (participantId, name, room code) ever reach a log line. See
// docs/access-control.md.
export interface LogFields {
  room: string;
  actor: string;
  action: string;
  target?: string;
  result: "allowed" | "denied";
  reason?: string;
}

function escape(value: string): string {
  // key=value pairs break if a value contains a space or an embedded quote --
  // and a value here can come straight from a sanitized-but-attacker-chosen
  // display name, so quote anything that isn't a single bare token.
  return /[\s"=]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

// Builds the single `actor=` token: role plus, when known, the public
// (never the secret) identity -- participantId before name, because two
// people can pick the same name but never the same publicId. An action with
// no resolved identity (a rejected request with a missing or invalid cookie)
// passes just the role, e.g. "participant" with no id or name.
export function formatActor(role: "presenter" | "participant", id?: string, name?: string): string {
  const parts = [`role=${role}`];
  if (id !== undefined) parts.push(`id=${id}`);
  if (name !== undefined) parts.push(`name=${escape(name)}`);
  return parts.join(",");
}

export function logAction(fields: LogFields): void {
  const parts = [
    `ts=${new Date().toISOString()}`,
    `room=${escape(fields.room)}`,
    `actor=${escape(fields.actor)}`,
    `action=${escape(fields.action)}`,
  ];
  if (fields.target !== undefined) parts.push(`target=${escape(fields.target)}`);
  parts.push(`result=${fields.result}`);
  if (fields.reason !== undefined) parts.push(`reason=${escape(fields.reason)}`);
  console.log(parts.join(" "));
}
