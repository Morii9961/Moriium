# Enouia

Enouia is Morii's independent static site, selected for publication on 2026-09-11. Its source lives in `enouia/`. It has its own workspace boundary, package manifest, lockfile, TypeScript configuration, assets, and build output. It can also be copied outside Moriium and built independently.

## Run locally

Use Node 24 and pnpm 11.22.0. Run these commands from this directory:

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm preview
```

Open `http://localhost:4342/`. `pnpm dev` uses the same port; stop one before running the other. From the repository root, the equivalent build, verification, and preview commands are `pnpm enouia:build`, `pnpm enouia:verify`, and `pnpm enouia:preview`. Install this directory's dependencies separately before using them.

Set `MORIIUM_PUBLIC_URL` before building to change the two external exits. It must be a complete HTTP(S) URL and defaults to the repository's public Chinese home, `https://morii9961.top/zh/`. No article titles or author-filter routes are invented.

## Design

The site is a room by the water, moving from looking to remembering. The generated room and its traced structure share exactly the same frame. Scroll moves the boundary; focusing or changing the native range control gives the visitor control until reload. Reduced motion keeps a static split and allows direct adjustment.

- Mineral paper `#e9ede8`, slate ink `#344d50`, water `#aac0c1`, and muted green construction lines establish an identity separate from Moriium blue.
- Georgia gives the name a soft, open shape; system sans-serif supports short Chinese observations and utility labels without a font download.
- The room supplies the arrival and its structural translation. A separate generated coastal stairway introduces a new setting in the third passage, followed by two observations and a brief closing note.
- There is no character image, relationship story, analytics, content collection, server API, or persistent visitor data.

Enouia's design is independent of the main site's typography, navigation, and tokens. The illustrations depict imagined places. See `ASSETS.md` for their provenance.

## Deploy beside Moriium

A shared Git checkout transports the source for both sites. Each site keeps its own output and release directory:

```text
repository/
  src/                      Moriium
  enouia/                   Enouia

/var/www/moriium/current/    existing main-site release
/var/www/enouia/current/     Enouia dist contents
```

Build Moriium with its existing release procedure. Separately run `pnpm --dir enouia install --frozen-lockfile` and `pnpm --dir enouia build`. Copy only `enouia/dist/` into a new Enouia release directory. Point the separate Enouia virtual host at that directory through its own `current` symlink. Keep the preceding Enouia release for rollback; switching it must not switch Moriium's release.

`deploy/nginx.conf.example` supplies the static routing configuration. Replace its example host with the selected domain, configure DNS and TLS through the server's established process, check `nginx -t`, and then activate it. The final domain and server configuration still need deployment acceptance. Do not serve the Git checkout, source files, dependency directories, or environment files.

Production requires a static HTTP server only. Node is used to build and for the optional local preview. Enouia does not depend on the resident Moriium Admin process. CI installs and verifies both sites separately. The existing Moriium deployment workflow does not activate Enouia's virtual host or copy its output into an Enouia release.

Source selection and local verification do not mean the site has been deployed. DNS, TLS, and server deployment remain pending.

## Sources and validation

The implementation follows [Astro's static output configuration](https://docs.astro.build/en/reference/configuration-reference/#output) and [CSS clip-path](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/clip-path). `pnpm verify` runs Astro diagnostics, builds the page, checks all local assets and anchors, checks for unwanted server/admin output, tests the built interaction, and enforces a 12 KB JavaScript / 450 KB total output budget.

See `VALIDATION.md` for the checks performed and their limits. Local checks do not constitute Linux Nginx, DNS, TLS, or production acceptance.
