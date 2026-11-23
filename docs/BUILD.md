# Building Noctilucent v0.1.9

This repository includes the source template for the existing desktop-only v0.1.9 distribution and two PDF recovery-data indexes. The build is designed to reproduce the original distributed `main.js` without changing runtime behavior.

## Layout

- `src/main.template.js`: plugin JavaScript, with two large index literals replaced by marked placeholders.
- `src/data/verified-context.json`: verified PDF context and glyph mapping data.
- `src/data/verified-spacing.json`: verified PDF spacing mapping data.
- `src/i18n/en.js` and `src/i18n/zh-TW.js`: existing language-maintenance dictionaries. **The v0.1.9 builder does not import these files automatically**, because its source template already includes the embedded localization dictionaries. When editing a dictionary, also update the source template or extend the build script.
- `scripts/build.mjs`: dependency-free Node.js build tool.

## Build commands

Install Node.js 18 or newer. No `npm install` is required for this build.

```sh
npm run check
npm run build
```

`npm run check` reconstructs the file in memory and checks it against tracked `main.js` without modifying it. `npm run build` writes `main.js` and checks its syntax.

The builder validates the JSON indexes and checks that `manifest.json` and `package.json` have matching plugin ID and version. **Distributable release files are still only `main.js`, `manifest.json`, and `styles.css`.**

## Large-file note

The two verified PDF recovery indexes have been moved into `src/data/` for source maintenance, but the build **still embeds them in `main.js`**. This deliberately maintains the original v0.1.9 behavior, output bytes, and three-file installation process. It does **not** reduce the published `main.js` size. Future compression or runtime asset loading would require separate testing.

This reconstruction proves that the file can be built reproducibly; it does not replace Obsidian integration testing or official directory review. Back up plugin `data.json` before testing changes.
