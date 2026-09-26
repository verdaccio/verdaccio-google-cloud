---
'verdaccio-google-cloud': patch
---

Stop a missing tarball from crashing the registry process.

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
