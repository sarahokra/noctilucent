# Building Noctilucent v0.2.4

This dependency-free Node.js build reproduces the author's tested v0.2.4 distributed JavaScript without altering runtime code.

## Layout

- `src/main.template.js`: JavaScript with two marked PDF recovery index placeholders.
- `src/data/verified-context.json` and `src/data/verified-spacing.json`: embedded recovery data extracted losslessly from the supplied v0.2.4 distribution.
- `src/i18n/en.js`, `src/i18n/zh-TW.js`: maintenance references included in the supplied archive. The build does not import these files automatically; update the embedded dictionaries in the template when editing UI translations.
- `scripts/build.mjs`: deterministic, dependency-free reconstruction. The replacement callback preserves literal dollar sequences in index data; check mode compares bytes.

## Commands

Install Node.js 18 or newer. No npm install is required.

```sh
npm run check
npm run build
npm run check
```

The builder validates the JSON indexes and manifest/package identity and version. Check mode does not modify `main.js`; build mode writes it and checks JavaScript syntax.

Expected SHA-256 of the supplied and reconstructed `main.js`:

`e2e9c313e2aea9c03a02a445e5a6456a39574abf19a0bf7367b9655ae550d14b`

Size: 1,193,500 bytes. The two indexes remain embedded in the distributable; this does not reduce its runtime size. Release assets are still `main.js`, `manifest.json` and `styles.css` only. Never distribute personal `data.json` or backups. Reproducible reconstruction is not an Obsidian integration or cross-platform acceptance test.
