# Changelog

## 11.2.0

### Minor Changes

- 01d2655: refactor: replace @verdaccio/streams with native Node.js PassThrough streams

### Patch Changes

- 01d2655: Fix `/-/v1/search`, which answered 500 and then hung.

  The core drives the plugin through `search(onPackage, onEnd)` and reads
  `item.package.name` from whatever is emitted. The plugin emitted the bare
  `{name, path, time}` shape, so the endpoint answered 500, and its promise branch
  resolved to an empty array. Both paths now emit `SearchItem`, and `onEnd` runs on
  failure too — without it the request hung until the client aborted.

  Fix removing a package, which answered 422 and leaked every object.

  Cloud Storage has no directories, so `<package-name>` is not an object — the files live
  under the `<package-name>/` prefix. `removePackage` deleted the bare name, which 404s,
  and left the metadata and every tarball behind. It now deletes the whole prefix.

- 01d2655: Stop a missing tarball from crashing the registry process.

  Cloud Storage reports a missing object through both the `response` handler (404) and
  the `error` handler, so `readTarball` emitted `error` twice. By the second emit
  verdaccio has already answered and dropped its listener, and an `error` event with no
  listener throws — as an uncaught exception, taking the whole process down. The error is
  now emitted once.

  Fix `unpublish`, which could never remove a package.

  Packages are stored under a name key, so the key carries `name` and its `id` is
  undefined. `getEntities` returned only that id and `remove` rebuilt the key with
  `datastore.int(undefined)`, which threw `Cannot read properties of undefined (reading
'toString')` and answered 422. Entities now carry their own key and `remove` deletes it
  directly.

## 11.1.3

### Patch Changes

- ecf04d6: chore: force release with env

## 11.1.2

### Patch Changes

- 31d5809: chore: release bump

## 11.1.1

### Patch Changes

- 66013ba: fix: build package before publishing so `lib/` is included in the published tarball

## 11.1.0

### Minor Changes

- 1e0d2e6: feat: ignore files

## 11.0.0

### Major Changes

- 4ff997a: feat: new package release

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.0.10](https://github.com/verdaccio/verdaccio-google-cloud/compare/v0.0.9...v0.0.10) (2019-06-22)

### Bug Fixes

- **config:** add resumable flag to configuration ([30de355](https://github.com/verdaccio/verdaccio-google-cloud/commit/30de355))
- **storage:** disable resumable uploads ([aa8328c](https://github.com/verdaccio/verdaccio-google-cloud/commit/aa8328c))
- remove unused dependency ([fdd90a9](https://github.com/verdaccio/verdaccio-google-cloud/commit/fdd90a9))
- update [@google-cloud](https://github.com/google-cloud) deps ([71be436](https://github.com/verdaccio/verdaccio-google-cloud/commit/71be436))

<a name="0.0.9"></a>

## [0.0.9](https://github.com/verdaccio/verdaccio-google-cloud/compare/v0.0.8...v0.0.9) (2018-10-23)

### Bug Fixes

- changed how key is generated for datastore.save to prevent duplicate entries. Key is now the name of the package ([#8](https://github.com/verdaccio/verdaccio-google-cloud/issues/8)) ([e21331b](https://github.com/verdaccio/verdaccio-google-cloud/commit/e21331b))

<a name="0.0.8"></a>

## [0.0.8](https://github.com/verdaccio/verdaccio-google-cloud/compare/v0.0.7...v0.0.8) (2018-07-22)
