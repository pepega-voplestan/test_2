# Contract: Media Serving (`media-nginx.conf`)

**Surface**: the nginx tier serving `/media/*`. Its consumers are browsers holding addresses cached for up to a year under `immutable` — including addresses issued *before* a sweep invalidated them (D3).

---

## WebP variants — unchanged

```nginx
location ~* ^/(?<mid>[^/]+)/(320|960|1600)\.webp$ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri /$mid/960.webp =404;
}
```

This rule already delivers FR-006 for expired `1600.webp`: a stale address degrades to `960.webp` rather than 404ing. **No change is required**, and none should be made — D3 relies on exactly this behaviour.

The consequence is intentional and must be understood: a client requesting `.../1600.webp` receives a 960-wide body under an `immutable` header, and may cache that smaller image under the 1600 address for up to a year. That is the accepted cost of bounding retention by the window rather than by cache lifetime.

## Video — changed

The mp4 fallback gets its **own** location. It must not be added to the shared extension location:

```nginx
# Videos only. A stale address for an expired video answers with the placeholder.
location ~* ^/.+\.mp4$ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    add_header X-Content-Type-Options "nosniff";
    try_files $uri /_deleted.mp4;
}

# Images keep =404 — see "Why mp4 needs its own location" below.
location ~* ^/.+\.(webp|jpg|jpeg|png|gif)$ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    add_header X-Content-Type-Options "nosniff";
    try_files $uri =404;
}

location = /_deleted.mp4 {
    root /assets;
    add_header Cache-Control "no-store";
    add_header X-Content-Type-Options "nosniff";
}
```

**Why mp4 needs its own location.** Putting `try_files $uri /_deleted.mp4` on the shared `(webp|jpg|jpeg|png|gif|mp4)` location would answer a stale `original.gif` address with an MP4 body under an image URL. `nosniff` then guarantees the browser will not recover: the user gets a broken image, which is the visible-failure outcome §III forbids. Images already have their correct fallback — the WebP rule above degrades to `960.webp`, and `original.gif` is exempt from age-based reclamation entirely, so its only reachable failure is a genuine 404.

**Why an exact-match location for the placeholder.** `try_files` with a URI fallback performs an internal redirect, which re-runs location matching. Landing back in the regex location would re-apply `immutable` to the placeholder — precisely what FR-012 forbids. An exact (`=`) match has higher precedence than any regex location in nginx, so the placeholder is guaranteed its own headers. The `root /assets` override lives here too.

**FR-012 compliance**: the fallback fires only when the real file is absent, and carries `no-store`. A placeholder can therefore never be retained under the address of a video whose file is still present.

## The placeholder asset

**Committed to the repo at `media-assets/_deleted.mp4`** and bind-mounted read-only at `/assets` on the media service in all three compose files. Served through the `location = /_deleted.mp4` block's `root /assets`.

| Property | Value |
|---|---|
| Content | `Срок хранения видео истёк`, centred, light grey on near-black |
| Format | H.264 baseline / yuv420p, 1280×720, 4s, silent, `+faststart` |
| Size | 8.6 KB |
| Location | `media-assets/` in the repo — **not** the media volume |

**Why not the media volume root**, as originally specified: `/media` is a Docker named volume populated only by uploads at runtime. Nothing in the repo writes to it, the media service mounts it `:ro`, and no service has a build context — so a placeholder "at the volume root" would simply not exist on a fresh deploy, and `try_files` would fall through to a 404 in exactly the case the placeholder exists to prevent. A committed file with its own mount is version-controlled, survives `make restore` of the media volume, and cannot collide with a `{mediaId}/` directory — which also retires the leading-underscore naming requirement, though the name is kept for continuity with the URI.

## Unchanged rules

- `location ~ /\.` — dotfile deny
- `location /` — 403 for everything else, including directory listings and `meta.json`
- `autoindex off`

## Verification

| Check | Expected |
|---|---|
| `curl -I .../{id}/1600.webp` after image expiry | `200`, body is the 960 variant, `immutable` |
| `curl -I .../{id}/960.webp` at any age | `200`, always present |
| `curl -I .../{id}/original.mp4` before expiry | `200`, `immutable` |
| `curl -I .../{id}/original.mp4` after expiry | `200`, `Cache-Control: no-store`, placeholder body |
| `curl -I .../{id}/original.gif` for a missing gif | `404` — **never** the mp4 placeholder |
| `curl -I .../{id}/meta.json` | `403` |
