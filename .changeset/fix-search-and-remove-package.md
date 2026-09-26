---
'verdaccio-google-cloud': patch
---

Fix `/-/v1/search`, which answered 500 and then hung.

The core drives the plugin through `search(onPackage, onEnd)` and reads
`item.package.name` from whatever is emitted. The plugin emitted the bare
`{name, path, time}` shape, so the endpoint answered 500, and its promise branch
resolved to an empty array. Both paths now emit `SearchItem`, and `onEnd` runs on
failure too — without it the request hung until the client aborted.

Fix removing a package, which answered 422 and leaked every object.

Cloud Storage has no directories, so `<package-name>` is not an object — the files live
under the `<package-name>/` prefix. `removePackage` deleted the bare name, which 404s,
and left the metadata and every tarball behind. It now deletes the whole prefix.
