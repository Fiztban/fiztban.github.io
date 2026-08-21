#!/usr/bin/env python3
"""Fold combined-consent.html and its whole dependency chain into one file.

    python forms/build-single-file.py <clientHash> <formNumber>
    python forms/build-single-file.py                  (no client link)

Writes forms/combined-consent.local.html — open it by double-clicking; it needs
no server and no network.

WHY THIS EXISTS
    The normal page fetches zanda-combined-consent.json at load. Browsers give
    every file:// document its own opaque origin, so a fetch from one local file
    to another is a cross-origin request and is refused outright — which is the
    only reason the normal page needs to be served over HTTP. Everything else
    about it works fine from disk.

    This build embeds the snapshot instead, so there is nothing left to fetch.

WHAT IT IS NOT
    Not the deployed page. The output is a throwaway for local testing, and it
    hard-codes a client hash — never commit it or put it on a web server.
    .gitignore covers *.local.html for exactly that reason.
"""

import base64, hashlib, io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
OUT = os.path.join(HERE, "combined-consent.local.html")

# The @import chain, flattened in dependency order.
CHAIN = ["reset.css", "leaflets/leaflet.css", "intake/intake.css",
         "guide/guide.css", "forms/consent.css"]


def read(rel):
    return io.open(os.path.join(SITE, rel), encoding="utf-8").read()


def data_uri(path, mime):
    with open(os.path.join(SITE, path), "rb") as fh:
        return f"data:{mime};base64," + base64.b64encode(fh.read()).decode()


def photo_uri(path):
    """The photo renders at 22rem, so the 424KB original is far more than the
    page can show — and base64 would add a third again on top. Downscale where
    Pillow is available, embed as-is where it is not."""
    try:
        from PIL import Image
    except ImportError:
        print("  (Pillow not installed — embedding the photo at full size)")
        return data_uri(path, "image/jpeg")

    img = Image.open(os.path.join(SITE, path))
    img.thumbnail((700, 700), Image.LANCZOS)
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=82, optimize=True, progressive=True)
    print(f"  photo {os.path.getsize(os.path.join(SITE, path)):,} -> {len(buf.getvalue()):,} bytes")
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def main():
    client = sys.argv[1] if len(sys.argv) > 1 else None
    form = sys.argv[2] if len(sys.argv) > 2 else None

    if client and not re.fullmatch(r"[A-Za-z0-9_-]{4,64}", client):
        sys.exit(f"not a valid client hash: {client!r}")
    if form and not re.fullmatch(r"\d{1,10}", form):
        sys.exit(f"not a valid form number: {form!r}")

    css = "\n\n".join(
        f"/* ===== {f} ===== */\n" + re.sub(r"^\s*@import\s+[^;]+;\s*$", "", read(f), flags=re.M).strip()
        for f in CHAIN
    )

    html = read("forms/combined-consent.html")
    body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
    body = body.replace('src="../assets/Logos/km-logo-name-below.svg"',
                        f'src="{data_uri("assets/Logos/km-logo-name-below.svg", "image/svg+xml")}"')
    body = body.replace('href="../index.html"',
                        'href="https://kinderminds.nz" target="_blank" rel="noopener"')
    # The favicon links point at paths that will not resolve from a lone file.
    body = re.sub(r'\s*<link rel="icon"[^>]*>', "", body)

    js = read("forms/consent.js")
    snapshot = json.load(io.open(os.path.join(HERE, "zanda-combined-consent.json"), encoding="utf-8"))

    # --- embed the drawings the page actually references --------------------
    # consent.js maps each Zanda drawing name to a local file; here those paths
    # become data URIs. Read from the map rather than named here, so adding a
    # drawing to the form is a one-line change in consent.js and this follows.
    dmap = re.search(r"var DRAWINGS = \{(.*?)\n  \};", js, re.S)
    assert dmap, "DRAWINGS map not found — consent.js changed shape"

    embedded = []
    for name, rel in re.findall(r"'([^']+)':\s*'([^']+)'", dmap.group(1)):
        path = os.path.normpath(os.path.join(HERE, rel))
        if not os.path.exists(path):
            sys.exit(f"REFUSING TO BUILD: DRAWINGS points at {rel}, which does not exist.")
        embedded.append(f"    '{name}': '{photo_uri(os.path.relpath(path, SITE).replace(os.sep, '/'))}'")

    js = js.replace(dmap.group(0), "var DRAWINGS = {\n" + ",\n".join(embedded) + "\n  };", 1)

    # Every drawing the form selects must have a local copy, or the page would
    # silently render without its illustration.
    for si, sec in enumerate(snapshot["sections"]):
        for fi, fld in enumerate(sec["fields"]):
            picked = fld.get("selectedDrawing")
            if picked and picked not in dict(re.findall(r"'([^']+)':\s*'([^']+)'", dmap.group(1))):
                sys.exit(f"REFUSING TO BUILD: field {si}.{fi} selects drawing {picked!r}, "
                         f"which is not in the DRAWINGS map in consent.js.")

    # --- verify the snapshot here, at build time ---------------------------
    # The served page recomputes this in the browser because the snapshot it
    # fetches is a separate file that could drift out from under the field map.
    # Embedded, there is no separate file, so checking it here is the equivalent
    # guarantee — and one nobody can skip.
    skeleton = [[s["label"], [[f["type"], f["label"], [o["value"] for o in f["options"]]]
                              for f in s["fields"]]] for s in snapshot["sections"]]
    built = hashlib.sha256(
        json.dumps(skeleton, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:16]

    expected = re.search(r"var EXPECTED_SKELETON = '([0-9a-f]+)';", js).group(1)
    if built != expected:
        sys.exit(f"REFUSING TO BUILD: snapshot hashes to {built}, consent.js expects {expected}.\n"
                 f"Run capture-form.mjs --check before going any further.")
    print(f"  skeleton verified: {built}")

    # crypto.subtle needs a secure context. https and localhost always qualify;
    # file:// is treated as trustworthy by Chrome and Firefox, but that is not
    # something to stake a consent form on. Where it is missing the build-time
    # check above stands in, having verified this exact embedded copy.
    old_fn = ("  function skeletonHash(sections) {\n"
              "    var bytes = new TextEncoder().encode(skeletonOf(sections));")
    new_fn = ("  function skeletonHash(sections) {\n"
              "    /* Single-file build: the snapshot is embedded here and was hashed when\n"
              "       this file was generated, so there is no second file to drift. Where the\n"
              "       browser exposes crypto.subtle the check still runs for real; where it\n"
              "       does not, that build-time verification stands in. */\n"
              "    if (!(window.crypto && window.crypto.subtle)) {\n"
              f"      return Promise.resolve('{built}');\n"
              "    }\n"
              "    var bytes = new TextEncoder().encode(skeletonOf(sections));")
    assert old_fn in js, "skeletonHash not found — consent.js changed shape"
    js = js.replace(old_fn, new_fn, 1)

    old_boot = re.search(r"  document\.addEventListener\('DOMContentLoaded', function \(\) \{\n"
                         r"    fetch\(SNAPSHOT.*?\n  \}\);", js, re.S)
    assert old_boot, "boot block not found — consent.js changed shape"
    js = js.replace(old_boot.group(0),
                    "  /* Embedded rather than fetched, so this file needs no server. */\n"
                    "  function boot() { start(window.__KM_FORM__); }\n\n"
                    "  if (document.readyState === 'loading') {\n"
                    "    document.addEventListener('DOMContentLoaded', boot);\n"
                    "  } else {\n"
                    "    boot();\n"
                    "  }", 1)

    # A query string on the URL still wins; this is only the fallback.
    if client and form:
        demo = f"?client={client}&form={form}"
        old_params = "var params = new URLSearchParams(window.location.search);"
        assert old_params in js, "params line not found — consent.js changed shape"
        js = js.replace(old_params,
                        f"var params = new URLSearchParams(window.location.search || '{demo}');", 1)
        print(f"  linked to: client {client} / form {form}")
    else:
        print("  no client link — the page will run in demo mode")

    # "</" inside the prose would close the script tag early.
    data = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    io.open(OUT, "w", encoding="utf-8").write(
        f"<!DOCTYPE html>\n<html lang=\"en-NZ\">\n<head>\n<meta charset=\"UTF-8\">\n"
        f"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
        f"<meta name=\"robots\" content=\"noindex, nofollow\">\n"
        f"<meta name=\"referrer\" content=\"no-referrer\">\n"
        f"<title>Consent and information form | Kinder Minds</title>\n"
        f"<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n"
        f"<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n"
        f"<link href=\"https://fonts.googleapis.com/css2?family=Fira+Sans:ital,wght@0,400;0,500;0,600;0,700;1,500"
        f"&family=Fira+Sans+Condensed:wght@400;500;600;700"
        f"&family=Source+Sans+3:ital,wght@0,300;0,400;0,600;1,400&display=swap\" rel=\"stylesheet\">\n"
        f"<style>\n{css}\n</style>\n</head>\n<body>\n{body}\n"
        f"<script>window.__KM_FORM__ = {data};</script>\n<script>\n{js}\n</script>\n</body>\n</html>\n"
    )

    print(f"  written: {OUT}  ({os.path.getsize(OUT) / 1024:.0f} KB)")
    print("\nDouble-click it. No server, no network.")


if __name__ == "__main__":
    main()
