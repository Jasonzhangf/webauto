// Browser observation projection. Anchors remain owned by the browser adapter.

function stableFingerprint(parts) {
  return parts
    .map((part) => String(part ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join('|');
}

export function buildObservation({
  profileId,
  pageInfo,
  screenshotRef = null,
  capturedAt = new Date().toISOString(),
}) {
  const viewport = pageInfo?.viewport || { width: 0, height: 0 };
  const scroll = pageInfo?.scroll || { x: 0, y: 0 };
  const revision = stableFingerprint([
    pageInfo?.url || '',
    pageInfo?.title || '',
    viewport.width,
    viewport.height,
    scroll.x,
    scroll.y,
    pageInfo?.textDigest || '',
  ]);
  return {
    observation_id: `obs_${revision || 'empty'}`,
    revision: revision || 'rev_empty',
    profile_id: profileId || null,
    url: pageInfo?.url || '',
    title: pageInfo?.title || '',
    viewport,
    scroll,
    text_digest: pageInfo?.textDigest || '',
    screenshot_ref: screenshotRef,
    captured_at: capturedAt,
  };
}
