---
'verdaccio-google-cloud': patch
---

Fix `/-/v1/search`, which answered 500.

Verdaccio 9.x calls `search(query)` and reads `item.package.name`. The plugin still
implemented the old callback API and its promise branch always resolved to an empty
array, so the endpoint either crashed or returned nothing. It now returns
`SearchItem[]` and filters on `query.text`.

Fix removing a package, which answered 422 and leaked every object.

Cloud Storage has no directories, so `<package-name>` is not an object — the files live
under the `<package-name>/` prefix. `removePackage` deleted the bare name, which 404s,
and left the metadata and every tarball behind. It now deletes the whole prefix.
