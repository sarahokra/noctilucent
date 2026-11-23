# Noctilucent

**PDF, Office Viewer, and Markdown Reading View highlighting and annotations for Obsidian.**

**Current version:** 0.1.9 (desktop-only preview) · **Author:** AOI · **Minimum Obsidian version declared:** 1.12.0

> **Preview status:** This project is not yet released through Obsidian Community Plugins. Earlier development notes report JavaScript/static checks, but not comprehensive real-world Obsidian testing. Back up your vault and annotation data, and try it in a test vault before using it for important research.

[繁體中文說明](README.zh-TW.md) · [Development changelog](CHANGELOG.md)

## Features in the current preview

- **PDF annotations:** Text highlighting with an eight-color palette, note cards, continuous highlighting, free-position sticky notes, and area highlighting.
- **Reading tools:** A draggable floating toolbar, annotation sidebar with document-specific search and filters, note editing, and annotation navigation.
- **Annotation management:** Session-based undo/redo, eraser tools, pinning (up to three annotations per document), and a bulk-delete workflow with a backup safeguard.
- **Markdown Reading View:** Text highlighting and notes in reading mode. Markdown editing mode is intentionally left unchanged; free-position notes and area highlighting are not supported in Markdown.
- **Office Viewer compatibility preview:** DOCX and PPTX selectable text highlighting and notes, subject to the rendering and text-anchoring limitations of the Office Viewer. This is experimental rather than guaranteed support for every document.
- **Markdown export (introduced in v0.1.8):** Export annotations from the current document into a separate Markdown snapshot without altering the source file or the original annotations. Exports are not synchronized with subsequent edits.
- **English and Traditional Chinese interface (v0.1.9):** Auto, English, and 繁體中文 language choices. Auto uses Traditional Chinese for Chinese Obsidian locales and English for other locales. This affects interface strings, not selected text or existing annotation data.

These capabilities are described in the project's version notes. Their reliability on a particular Obsidian version, operating system, PDF, or Office file still requires hands-on verification.

## Installation (manual preview)

1. Back up your Obsidian vault and, if updating, the existing `.obsidian/plugins/noctilucent/data.json` file.
2. Copy `manifest.json`, `main.js`, and `styles.css` into `<your vault>/.obsidian/plugins/noctilucent/`.
3. Restart Obsidian or reload its plugins, then enable **Noctilucent** under **Settings → Community plugins**.
4. Open a supported document in a **test vault** to try the available annotation controls.

The `src/i18n/` files are maintainable language resources. The currently supplied `main.js` already contains the language dictionaries; these source resources are not separately required for manual installation.

## Interface language

Under **Settings → Community plugins → Noctilucent → Interface language**, choose **Auto**, **English**, or **繁體中文**. See [繁體中文說明](README.zh-TW.md) for details.

## Data and important limitations

- Annotation data is stored locally in the plugin's `data.json`. **Do not delete or overwrite this file when upgrading.** Keep an independent backup before testing updates or bulk operations.
- Highlighting and annotation data are maintained separately from the source PDF, Office, or Markdown files; source files are not intentionally rewritten by these annotation features.
- Text positioning depends on the host viewer and whether the original text remains selectable and uniquely identifiable. Some selections may not be safely re-anchored after changes, resizing, or viewer updates; the plugin may suppress a marker rather than display it in the wrong place.
- Markdown annotations are limited to Reading View. `Homepage.md` and configured homepage-style documents are excluded from the Markdown annotation overlay.
- Office Viewer compatibility is experimental: rasterized text, some PowerPoint slide content, and varying viewer structures may not support selectable text or reliable positioning.
- Exported Markdown is a **one-time snapshot**, not a live bidirectional synchronization. PDF page links are available; precise jumps to text in Office/Markdown are not guaranteed.
- Coexistence with other selection/translation plugins, including Vittra, should be verified in your environment. Earlier notes do not claim full compatibility testing.

## Project status and development notes

Noctilucent is under active development. The repository currently includes a bundled JavaScript plugin and language-resource files; a complete reproducible source/build workflow and broader compatibility testing remain publication preparation tasks.

For individual changes, hotfixes, historical limitations, and test caveats through v0.1.9, see the [CHANGELOG](CHANGELOG.md).

## License

Noctilucent is licensed under the [MIT License](LICENSE). Copyright (c) 2026 AOI. The license permits use, modification, redistribution, and commercial use, provided the copyright and license notices are retained. Third-party components, if any, remain subject to their own licenses.
