/**
 * TEMPORARY DIAGNOSTIC — stuck unread badge (tab title keeps "(1)" while every
 * notification reads as read, clearing only on reload).
 *
 * Collects evidence from three places that cannot see each other (the SSE
 * transport, the notification store, the dropdown's rendered list) so the whole
 * picture can be emitted as ONE console block a reporting user can copy.
 *
 * Delete this file and its call sites once the cause is known.
 */

export const notifDiag = {
  /** EventSource objects created this session. >1 means we reconnected. */
  socketsOpened: 0,
  /** Sockets replaced while still open — these keep delivering and are never closed. */
  socketsOrphaned: 0,
  /** Reconnects scheduled while another was already pending (leaked timer). */
  duplicateReconnects: 0,
  /** SSE pushed a notification id the client had already seen. */
  redeliveries: 0,
  redeliveredIds: new Set<string>(),
  /** notification id -> where it first entered client state. */
  origin: new Map<string, string>(),
  /** ids currently rendered in the dropdown; null until it is first opened. */
  renderedIds: null as Set<string> | null,
};

export function describeUnread(
  unread: { id: string; type: string; timestamp: string }[],
  loadedCount: number
): string {
  const rows = unread.map((n) => {
    const t = new Date(n.timestamp).getTime();
    const age = Number.isFinite(t) ? `${Math.round((Date.now() - t) / 60000)} min old` : "unknown age";
    const origin = notifDiag.origin.get(n.id) ?? "unknown";
    const redelivered = notifDiag.redeliveredIds.has(n.id) ? " RE-DELIVERED BY SSE" : "";
    const visible =
      notifDiag.renderedIds === null
        ? "dropdown not opened yet"
        : notifDiag.renderedIds.has(n.id)
          ? "shown in dropdown"
          : "NOT SHOWN IN DROPDOWN";
    return `    - id=${n.id}\n      ${n.type}, ${age}, arrived via ${origin}${redelivered}\n      ${visible}`;
  });

  return [
    `[NOTIF-DIAG] tab badge now shows (${unread.length})`,
    `  loaded: ${loadedCount} notification(s), ${unread.length} counted as unread`,
    unread.length ? `  entries the badge is counting:` : `  nothing unread — badge should be clear`,
    ...rows,
    `  SSE sockets opened: ${notifDiag.socketsOpened} (orphaned: ${notifDiag.socketsOrphaned}, duplicate reconnects: ${notifDiag.duplicateReconnects})`,
    `  SSE re-deliveries of an already-known notification: ${notifDiag.redeliveries}`,
    `  >> If the badge is stuck, copy this whole block.`,
  ].join("\n");
}
