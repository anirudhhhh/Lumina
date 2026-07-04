# Bundled native tools

This directory is populated at **build time** by
`src-tauri/scripts/fetch-tools.(ps1|sh)` and packaged into the installer so the
shipped app needs **no external downloads**:

- `jadx/` — the [JADX](https://github.com/skylot/jadx) decompiler (Java).
- `jre/`  — a [Temurin](https://adoptium.net) JRE used to run JADX.

Both are git-ignored (they're large and platform-specific — fetch per OS). The
Rust core (`src-tauri/src/python.rs`) points the analysis service at them via
`LUMINA_JADX_PATH` and `JAVA_HOME` when they're present, and falls back to a
system `jadx`/`java` on `PATH` otherwise.

Run `npm run tools:fetch` (Windows) or `npm run tools:fetch:unix` before
`npm run app:build`.
