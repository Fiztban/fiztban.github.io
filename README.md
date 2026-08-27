# Kinder Minds Website

The static website for Kinder Minds, a child and adolescent psychiatry practice in
Whangārei. Lightweight and responsive, deployed via GitHub Pages so the only
running cost is the domain, rather than paying monthly for a hosted site builder.

Live at [kinderminds.nz](https://kinderminds.nz).

## What is in here

- **The site** — `index.html`, one page with hash-routed sections.
- **Client guides** — `guide/`, five per-service pages driven by URL parameters and
  sent to families individually. Public but unlisted; nothing links to them.
  Published as dated releases (`guide/20260827/`) so a family's link keeps the
  fees and terms they were quoted; `_build/versions.json` is the registry.
- **Staff tooling** — `staff/link-builder.html`, which builds those guide links.
- **Form prototypes** — `forms/`, work in progress. In the repository, but excluded
  from the published site by `_config.yml`.

## Working on it

`CLAUDE.md` is the orientation document: architecture, the publishing model, the
styling conventions and the gotchas worth knowing before touching anything.
`guide/HANDOVER.md` covers the guides, which are generated from sources in
`_build/` rather than edited directly.

No build step for the site itself. Edit, commit, push to `main`, live in under a
minute.
