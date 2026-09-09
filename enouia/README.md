# Enouia

An independent, static single-page site inside the Moriium repository. It has
its own Astro configuration, assets, styles, build output, and Nginx virtual
host. It imports no Moriium layouts, content, Vue, Tiptap, or server code.

## Local preview

From the repository root, use the existing Node 24 and pnpm 11.22 toolchain:

```sh
pnpm install --frozen-lockfile
pnpm enouia:verify
pnpm enouia:preview
```

Open `http://127.0.0.1:4188`. After an edit, rebuild and refresh the browser:

```sh
pnpm enouia:verify
```

Output is `enouia/dist/`. Only this directory is public. The source directory,
package files, and deployment scripts must never be the Nginx document root.
Repository commands use Moriium's existing locked Astro toolchain without
adding this folder to the pnpm workspace or changing its dependencies. The
standalone package manifest allows a future move to another repository;
copying this folder alone requires a fresh dependency install and lockfile.

The local preview uses a small loopback-only static server and the proposed
production CSP. It avoids a child-process startup failure observed with Astro
preview on this Windows host. Node is only a local preview/build tool here.

## Design and scope

This revision develops Enouia through observation, experimentation, and small
personal choices. Five connected passages have distinct subjects: a rainy
courtyard miniature, an immersive greenhouse, a refraction study, a table of
three small objects, and a short first-person note about changing one's mind.
The original stairway and repeated material/linework comparison were removed.
Each generated artwork appears once. The objects have their own SVG geometry.

The courtyard and greenhouse are generated fictional environments, not records
of real places or private memories. See `ASSETS.md` for provenance. Spatial
Specimen informs the courtyard; Quiet Geometry organizes the optics and table.
Site Translation's photo-to-linework sequence was deliberately dropped: using
it again would repeat the subject instead of revealing another part of Enouia.
Instead, a brief structural observation and one scroll-revealed construction
line connect the greenhouse to the optical study. The courtyard remains the
Spatial Specimen entrance, without an additional poster or section.

Fog (`#edf0f1`), stone (`#e5e9e7`), night (`#172c35`), ink (`#253d46`),
and clay (`#a17357`) form an independent palette. Georgia supplies the display
wordmark; local system sans faces handle Chinese and controls. No remote font
or media service is contacted. Moriium's design system is unchanged.

The greenhouse has three accessible observation buttons. The Canvas 2D study
traces refraction and internal reflection through a prism, with enlarged
dispersion for readability. It is an artistic study, not a calibrated physics
instrument. Angle and light color are user-controlled; drawing is scheduled
only after input, resize, or visibility changes. DPR is capped at two, and
offscreen/hidden pages do not keep rendering. Six tests cover ray behavior.
Short observation notes respond to three angle bands and the selected light.
Greenhouse notes distinguish distortion, waiting, and traces of a visitor;
pointer activation gives the selected ring a 180 ms response.

The table offers four small arrangements with different comments. Keyboard
changes are immediate. Pointer changes may transition; a static-picture toggle
and the system reduced-motion setting disable that transition and courtyard
depth response, as well as ring motion and the construction-line reveal.
Mobile uses its own composition and puts observation buttons
in a reachable row. Without JavaScript, the images, SVG prism, objects, and
note remain visible and inert controls stay hidden.

The full build, including both responsive sizes of both WebP artworks, has a
1 MB verification budget. The larger images are about 255 KB and 273 KB; the
mobile alternatives are about 75 KB and 92 KB. The lower image is lazy-loaded.
This replaces the first draft's all-vector 200 KB budget to support richer
original artwork without adding a runtime framework or animation dependency.

The local design index returned spatial-product and newsletter templates;
neither matched the brief. Only its keyboard, contrast, mobile, and reduced
motion guidance was retained. No external visual reference was copied.

## Deploy two sites from one repository

Moriium's existing CI packages the entire tracked repository with `git archive`.
Once these files are committed and merged, Enouia source travels in that same
archive. **The existing deployment does not automatically publish Enouia.**
Keep the two output roots separate:

```text
Moriium workspace/enouia/       source delivered with the repository
Moriium workspace/enouia/dist/  independently built static output
/var/www/moriium/current        existing Moriium release
/var/www/enouia/current         independently selected Enouia release
```

Build both sites from the same checkout with `pnpm build` and
`pnpm enouia:verify`. Moriium's content-release state machine remains unchanged.
Enouia needs no resident Node process, database, service restart, or proxy.

After approval to launch, an administrator must create
`/var/www/enouia/releases`, grant the deployment user write access and Nginx
read/traverse access, provision DNS and TLS, and install
`deploy/nginx.conf.example` as a separate virtual host. The brief's hostname
`enouia.moriium.com` is a proposal, not a verified domain. The current Moriium
checkout uses `https://morii9961.top`; the outgoing links use that value by
default. Set `MORIIUM_PUBLIC_URL` at build time if the approved host changes.

After building and verifying, publish explicitly on the Linux server:

```sh
bash enouia/deploy/release.sh enouia/dist approved-release-id
sudo nginx -t
```

The publisher copies only the static build into a new immutable release, then
switches `/var/www/enouia/current`. It neither deletes previous releases nor
touches Moriium. Record the printed previous release before running an HTTPS
smoke test. To roll back, create a new temporary symlink to that recorded
`releases/<id>` target and atomically rename it over `current` with `mv -Tf`.
Keep previous releases until rollback and in-flight visitor behavior are checked.

Before launch, verify root/assets, unknown-path 404, TLS, CSP, and rollback on
the real server. Stop the Moriium author Node service during an approved
maintenance window and confirm both public sites remain reachable. Local
build success does not prove any of these server checks.

Add `Enouia ↗` to Moriium's navigation only when the approved Enouia URL is
reachable. This draft provides the Enouia-to-Moriium exit and leaves Moriium's
live navigation unchanged to avoid sending visitors to an unlaunched site.

## Acceptance status

See `VALIDATION.md` for checks performed against this implementation. DNS,
certificate issuance, server publication, and the reciprocal production link
are launch work, not outcomes of the local implementation.
