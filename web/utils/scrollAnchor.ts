// Shared by ShoutFeed and ProfilePage's identity-based scroll restoration
// (see specs/009-anchor-scroll-restore). Waits for an anchor shout's DOM
// node to actually be rendered (populated into `shoutRefs` by a ref callback
// during commit, which lands slightly after the state update that added the
// shout to the list), then scrolls so its top edge lands at `offsetFromTop`
// — the only way to get the real position, since it depends on the rendered
// height of everything above it. Gives up at `deadline` regardless (a slow/
// failed render never hangs this forever).
export function scrollToAnchorWhenRendered(
  shoutRefs: Map<string, HTMLDivElement>,
  shoutId: string,
  offsetFromTop: number,
  deadline: number
) {
  const el = shoutRefs.get(shoutId);
  if (el) {
    window.scrollBy(0, el.getBoundingClientRect().top - offsetFromTop);
    return;
  }
  if (Date.now() >= deadline) return;
  requestAnimationFrame(() => scrollToAnchorWhenRendered(shoutRefs, shoutId, offsetFromTop, deadline));
}
