# Noctilucent — Development Changelog

This is the complete English-language record of versions v0.1.1 through v0.1.9, including individual hotfixes, technical limitations, and testing caveats. Entries are ordered from oldest to newest; historical caveats may have changed in later versions. These are development notes, **not proof of completed in-app acceptance testing**.

**Language:** English | [Traditional Chinese](CHANGELOG.zh-TW.md) | [Original unabridged record](docs/CHANGELOG.original.md)

## v0.1.1 — Highlight and Annotation Fixes

- Obtain selection rectangles from individual text nodes and merge adjacent fragments on the same line, using the coordinate reference of the actual annotation overlay.
- Anchor annotation cards to the end marker and attempt to avoid Vittra and the toolbar; keep the card at its manually dragged position.
- Move the end marker toward the upper-right and make it smaller; hovering for 350 ms previews existing annotation text.
- Allow changing an existing highlight's color inside its annotation card.
- Preserve the previous `data.json` format. Old highlights are not recalculated automatically; if misaligned, select and highlight the original text again or back up and recreate the item. Partially overlapping selections may remain separate annotations.
- Back up `data.json` before upgrading. Replace only `main.js`, `styles.css`, `manifest.json`, and `README.md`; do not delete the existing plugin folder.
- Not validated in a live Obsidian installation. Test with a sample PDF first. Support is still limited to selectable text on one PDF page; there is no Markdown synchronization or PDF export.

---

## v0.1.2 — Undo (Based on v0.1.1)

- Retain v0.1.1 highlight coordinates, rendering, overlap behavior, and Vittra coexistence design; do not adopt the earlier SVG-based v0.1.2 implementation.
- In a PDF reading pane, press Ctrl+Z (Cmd+Z on macOS) to undo the most recent highlight creation or re-marking color/coordinate change for the current PDF since this plugin activation. Multiple undos are supported. Manual deletion, card-palette changes, and note editing are not included.
- Do not intercept Ctrl+Z in text inputs. Ask for confirmation before undoing a newly created highlight with an attached note. Automatically save and refresh windows after undoing. History exists only during the current plugin session and is cleared on restart or disable.
- Preserve `data.json` during upgrades. If the earlier SVG v0.1.2 was installed, back up first; this version does not migrate its coordinates.
- Not yet tested in a live Obsidian environment.

---

### v0.1.2 — Redo Follow-up

- Ctrl+Y (Cmd+Y on macOS) restores the most recently undone highlight or re-marking operation for the current PDF, including repeated redo. Preserve the original ID, position, color, and saved note text.
- Creating or re-marking a highlight, manually deleting it, or changing its card palette clears that PDF's redo history. Text input fields retain their own shortcuts.
- Undo and redo history only last while the plugin is active. The version remains 0.1.2; rendering and Vittra behavior are unchanged.

---

## v0.1.3 — Annotation Sidebar Preview

Experimental preview, not yet tested in an actual Obsidian environment. Use a test vault first.

- **Installation:** Copy the `noctilucent` directory to `Vault/.obsidian/plugins/`, restart Obsidian, and enable the plugin under Community plugins. Node.js is not required.
- **Use:** Select text on a single PDF page and click the floating toolbar's ▰ highlight action or ＋note. Select a color, optionally enable continuous mode, and click the + or ▣ marker to open a card and delete a highlight if needed. Drag ⠿ to move the toolbar. Notes save automatically.
- **Data:** The plugin stores records in its `data.json`, without rewriting the source PDF. Manually back up `data.json` after disabling the plugin; this version does not provide Markdown sync, automatic backup, or export. Do not delete the plugin directory. Documents are associated by path, so moving or replacing a PDF externally may prevent correct repositioning.
- **Limitations:** Selectable text, single-page selections, and normally oriented PDFs only; rotation and zoom require testing. Other planned tools, docking, rich text, and cross-device support are absent. Vittra is unchanged; native selection is preserved and only annotation buttons receive pointer events. Translation-overlay avoidance is attempted when opening a card, not guaranteed. Continuous highlighting may trigger Vittra translation too.
- **Testing:** Confirm Vittra translation on a PDF, enable Noctilucent, then test selecting, translating, highlighting, opening cards, reopening the PDF, zooming, and finally disabling Noctilucent to recheck Vittra. If issues occur, disable the preview and retain `data.json`.

---

### v0.1.3 — Annotation Sidebar

- Build on v0.1.2 Undo/Redo while preserving rectangular rendering, highlight coordinates, and data format.
- Open an Obsidian-native right sidebar using the floating toolbar's ☰ button, the left ribbon highlighter icon, or the `Open PDF annotations` command. The sidebar starts closed.
- Follow the most recently focused PDF that remains open (keep that PDF selected while interacting with the sidebar or other notes). A document can be locked so switching PDFs does not change the target; the lock lasts for the current sidebar session.
- Provide All / With Notes / Highlights Only views, eight-color filtering, text and note search, page grouping or newest-first ordering, compact/detailed layouts, and item counts.
- Click the quote or ↗ to jump to a marker, with a notice when the page or marker cannot be found. Support autosaved edits, recoloring, confirmed deletion, and copying one annotation or every annotation in the current PDF (independent of filters).
- PDF and sidebar share `data.json` and refresh after creation, deletion, recoloring, and Undo/Redo. Avoid reconstructing a focused sidebar text editor; refresh after focus leaves it.
- Undo/Redo retains the earlier scope: creating and re-marking highlights only. Manual deletions, card recoloring, and note edits are not included in undo history.
- Not yet verified inside Obsidian. Precise navigation must be tested with PDF page loading, zoom, and rotation. Do not overwrite `data.json`.

---

### v0.1.3 — Toolbar and Focus Hotfix

- Automatically reattach the toolbar when the PDF container changes or zoom changes, and keep it within visible bounds. The `Reset floating toolbar` command restores its position.
- Allow shortcuts when the current PDF tab header has focus, without changing text-editor shortcuts. Undo history still lasts for this activation only.
- Keep the Stars icon and original data format. Not yet tested in Obsidian.

---

### v0.1.3 — Shortcut Hotfix

- Handle PDF Ctrl+Z/Y at the window capture phase while preserving text editor behavior.
- Add ↶ / ↷ buttons to the toolbar and `Undo PDF highlight` / `Redo PDF highlight` to the command palette.
- History is limited to the current session and cannot restore actions from before a restart.

---

### v0.1.3 — Sidebar Toggle Follow-up

- Floating-toolbar ☰ now opens or collapses the annotation sidebar. Preserve its tab and state when the native right sidebar is available; otherwise close its tab. The ribbon button and existing open command are unchanged.

---

### v0.1.3 — Performance Hotfix

- Build on the Sidebar Toggle version without changing the toolbar, Stars, sidebar, Undo/Redo, Vittra coexistence, or established highlight coordinates.
- Both annotation editors share delayed persistence: default 500 ms and a forced commit after roughly five seconds of continuous typing; update body text only after IME composition ends. Manual Save, Ctrl+S, blur, closing a card, or switching PDFs flush pending writes. Disabling automatic save only disables the typing timer; other data operations and leaving the editor still commit to reduce loss.
- The settings pane controls the delay, Save button, and status visibility. Preferences are stored in an optional `savePreferences` field in `data.json`; the `items`, color, position, and annotation schemas remain unchanged.
- Serialize writes and merge pending versions. On failure retain in-memory data and show a retry prompt. On disable, attempt a final flush; unexpected power loss, forced exit, or I/O failure can still lose recent unsaved data. This is not a transactional disk backup.
- Typing no longer triggers a full PDF scan. Locally update text and icons, and refresh search/counts when idle, without rebuilding a focused sidebar editor. Keep the 350 ms lifecycle scan, but use version caches to skip unchanged highlight/sidebar calculations.
- Back up `data.json` before upgrading. Replace `main.js`, `styles.css`, `manifest.json`, and `README.md`, but do not overwrite data. Not yet tested in an actual Obsidian session.

---

### v0.1.3 — Input Latency Hotfix

- Pause the recurring 350 ms PDF scan while an annotation text input has focus; refresh after exiting the editor. Explicit highlight operations may still scan.
- Update in-memory text immediately while typing, but postpone synchronization to other editors, sidebar summaries, and markers until leaving the editor. Save delays, manual Save, Ctrl+S, and periodic saves remain unchanged.
- Prioritize status updates for the active editor and remove stale editor references when the sidebar is rebuilt.
- No live Obsidian performance measurements yet. If latency remains, compare English/Chinese input, floating card/sidebar input, and temporarily disabling Vittra for diagnosis; permanent removal of Vittra is not necessary.

---

### v0.1.3 — Overlay Isolation Hotfix

- Based on the Input Latency Hotfix. Mount floating annotation cards and hover previews in a fixed-position layer outside the PDF, using the existing PDF-relative coordinates and drag boundaries; keep the layer synchronized when the window, PDF container, or active tab changes.
- Add CSS layout/paint/style containment. Prevent editor input/keyboard events from bubbling outward (capture-phase listeners may still receive them). Preserve native text undo, Ctrl+S, IME, 500 ms autosave, sidebar toggle, and the highlight engine.
- Do not change the data schema, Vittra, or existing annotations. Disable the plugin and back up `data.json` before replacing `main.js`, `styles.css`, and `README.md`.
- Syntax and package checks are not equivalent to live Obsidian tests. Verify typing latency, card position, drag, tab switching, hover preview, themes, and multiple windows. CSS containment cannot guarantee elimination of global style recalculation.

---

## v0.1.4 — Free-position Annotations

Based on the v0.1.3 Overlay Isolation Hotfix.

- **Compact UI hotfix:** Change the free-position annotation icon to a sticky note and arrange the eight toolbar colors in two columns and four rows. Preserve the Stars brand icon in the sidebar and ribbon.
- Clicking the toolbar's Sticky Note action enters one-shot placement mode. Click any loaded PDF page to create a free-position note; Esc or clicking the action again cancels. Continuous highlighting is automatically turned off.
- Click the note marker to open the existing independent floating editor. Drag a note within the same page, preview it on hover, or change its color using eight swatches.
- Right-click an unselected area of a PDF to create a free-position note. Shift+right-click or right-click after selecting text uses the native context menu.
- Add free-position notes to sidebar filters/statistics, with search, sort, navigate, edit, recolor, copy, and delete actions.
- Creating, moving, recoloring, and deleting free-position notes can be undone/redone during the current session; note text editing still uses native undo.
- Keep the existing `items` array in `data.json`; new entries use `type=sticky-note` and an anchor based on page-relative coordinates. Existing highlights are not migrated. Back up and remove the new entry type before downgrading because older versions cannot recognize it.
- Not yet verified in a live Obsidian installation. Back up `data.json` and especially test zoom, rotation, context menus, dragging, and Vittra.

---

### v0.1.4 — Save & Close Hotfix

- Clicking Save in a floating annotation card closes only that card after a successful write (or if already saved). Background autosave, Ctrl+S and sidebar editing keep their existing behavior. Failed writes or changes during the pending save leave the card open. Existing data and UI layout are unchanged.


---

---

## v0.1.5 — Area Highlight Annotations

- Click the scan tool, drag a rectangle on one PDF page, release to create an area and open the existing floating editor. Esc cancels. The tool exits after one rectangle.
- Default: 15% fill with colored border. Card controls offer fill, border, both, 5–60% opacity, image copy and geometry editing. All eight colors remain available.
- Right-click the area sticky-note marker for edit, move/resize, copy image and delete. In geometry editing mode use the center move handle or eight edge/corner handles; Esc exits. Shift-right-click preserves the native menu.
- Area records use type `area`, normalized `rects` (one rectangle), `rotation`, `areaStyle`, `opacity`. Existing highlight and sticky-note records are not migrated. Do not downgrade with new area records without a backup.
- Image copy crops the currently rendered PDF canvas as PNG without annotation overlays. Requires a rendered canvas and supported ClipboardItem API; resolution follows current canvas, not original vector quality. Rotated/alternate PDF renderers need live verification; no OCR.
- Area history reuses the existing create/update/delete machinery; note text editing retains native textarea undo. The existing portal, save-on-click close and compact toolbar are retained.
- Desktop runtime testing in Obsidian is required, particularly iframe input, rotation and canvas clipboard support, overlapping regions and coexistence with Vittra. Backup data.json before installation.

---

### v0.1.5 — Area Interaction Hotfix

- Remove the ＋note button from the floating toolbar. Notes can still be opened through the marker after highlighting text, and the command palette retains `Highlight and comment`. Group the continuous-mode switch with text highlighting.
- While adjusting an area, clicking elsewhere on the PDF exits geometry-edit mode and keeps completed adjustments; ordinary page clicks are not intercepted.
- For one area annotation, the sidebar and floating card's “Copy image + note” action uses HTML with an embedded PNG and a plain-text fallback. Rich-text paste support is required; Obsidian or other targets may paste only text, but copying the image alone remains possible. If the page has not rendered, attempt to navigate and wait for its canvas. “Copy all” stays text-only.
- Not tested in a live Obsidian environment.

#### Compact Toolbar Order Hotfix
- Move the continuous-mode switch above the highlighter within the text-highlighting group. Behavior and data format are unchanged.

#### Quote Wrapping Hotfix
Use visually unwrapped PDF quote text for source-text cards, searching, and copying. Join adjacent Chinese characters without spaces and retain spaces between English words. The original `text` field, PDF position, and user-entered note line breaks stay unchanged. Do not remove hyphens automatically.

---

### v0.1.5 — Smart Text Extraction Hotfix

- Based on Quote Wrap Hotfix. New text highlights only: store original `text` plus `normalizedText`, `normalizationVersion`, and `normalizationStatus`. No old-item migration or backfill.
- Normalizes visual line breaks and whitespace; infers U+0001 spacing at limited word boundaries. Inference is not font verification. Ambiguous controls are rendered as visible Unicode code markers; mathematical operators are not guessed.
- Sidebar search/display and copy use the cached new quote; old quotes retain their previous behavior. New unresolved quotes show a warning. Setting applies prospectively only.
- No new PDF scan, font parser, OCR, timers or changes to overlay/geometry. Font-level recovery is not implemented because the selection does not carry a verified glyph mapping.

---

### v0.1.5 — Font-aware Recovery & Smart Geometry Preview (Experimental)

This version is a separate test ZIP using the same plugin ID and version as the Smart Text Extraction Hotfix. It is not a second plugin that can run alongside the stable build. Test in a separate vault, or first back up the previous `main.js`, `README.md`, and `data.json`. CSS and manifest are unchanged.

- **Settings → PDF text extraction:** Add “Experimental: font-aware symbol recovery” and “Experimental: smart highlight gap bridging”, enabled by default and applied only to new highlights. Each may be disabled independently. Symbol recovery also requires “New-highlight text tolerance” to be enabled.
- **Verified-sample-first path:** For two examined Economos 2007 PDFs (English and bilingual), match the original file SHA-256, page number, short selected-context SHA-256, and mappings checked against font Encoding Differences and the rendered appearance. The index stores only hashes and symbols, not full text, filenames, personal paths, or PDF bytes. A different PDF version does not match even with the same filename. Ambiguous context or very short selections still receive warnings.
- **Generic path:** Use Obsidian's private `PDFViewerChild.getPage` to obtain a PDF.js page proxy only for anomalous new highlights without a verified-sample match. Require evidence consistent across unique page-text matching, font ID, raw character codes from the operator list, glyph names, and control-character counts. Never guess from font name or control code alone. If Obsidian/PDF.js does not expose this evidence, safely fall back to the prior normalization and warning; other PDFs are not guaranteed to recover. The implementation references public PDF++ typings (https://github.com/RyotaUshio/obsidian-pdf-plus/blob/master/src/typings.d.ts) and PDF.js issues 15651/21968, without importing those projects' libraries.
- Keep the original `text`. Store new recovery results in `normalizedText`, `normalizationVersion`, `normalizationStatus`, and `symbolRecoveryMethod` / `symbolRecoveryCount`. Do not batch-migrate, modify PDFs, or rewrite old annotations. The earlier U+0001 spacing inference remains.
- **Smart bridging:** Reuse the original rectangle engine. Bridge only when consecutive selected nodes contain control characters and adjacent normal rectangles are on the same line and satisfy spacing/vertical-alignment thresholds; preserve larger column gaps. Bridge at most two consecutive control-character nodes, with a gap no larger than 1.4 times line height and at most 28 CSS px. Conservative thresholds may leave some gaps; narrow columns require live checks. No arbitrary PDF layout is guaranteed. Existing rectangles are not redrawn or repaired.
- No added timers, OCR, AI, network requests, or third-party libraries. Cache at most eight document hashes and run at most two recoveries concurrently. Selections exceeding 16,000 characters or 64 anomalous characters retain warnings without advanced recovery. Started PDF.js tasks may complete after editing begins, but results are not committed during editing; they are committed afterward through the existing flow. No live Obsidian performance measurement has been taken.
- **Diagnostics:** Run `Noctilucent: Symbol recovery preview diagnostics` in the command palette and inspect the last recovery summary in Developer Tools Console (`method`, `recovered`, `geometryBridges`, `verifiedSample`, `nativePage`, `uniqueText`, `namedGlyphs`, `unknownGlyphs`; no selected text or paths). `verified-sample` means a verified mapping succeeded; `native-glyph` means glyph evidence came from the generic path; `none` means recovery failed. If the selected passage already has an old highlight, select a new unmarked area or test a PDF copy in a test vault.
- **Test cases:** Economos English and bilingual PDFs, p. 1: n = 1178, 7.6 ± 1.0, −0.1005 (p = 0.001); p. 5: α, χ, and the less-than sign; p. 8: β; plus a normal English Salvo PDF. Also test Vittra, text input, area highlighting, and the sidebar. The validation build passed 24 offline Node checks (including PDF hashes/font indexes, synthetic rectangles, and unchanged legacy 283-item data), **not live Obsidian acceptance testing**.

---

### v0.1.5 — Diagnostic Logging Hotfix

- Keep symbol mapping and highlight gap-bridging logic unchanged. Add logging of successfully bridged pixel distances, original characters, recovered values, unidentified characters, and normalized text.
- The `verified-sample` index does not contain font names, so diagnostics explicitly report `null` rather than guessing. The `native-glyph` path may record an actual `fontId`.
- The existing `Symbol recovery preview diagnostics` command prints the most recent completed recovery. `Copy symbol recovery diagnostics` copies JSON for the last 20 completed diagnostic entries in the current session. **It includes selected original text; review before sharing.**
- Do not write diagnostic files, scan old annotations, or add background timers. Reloading clears diagnostic history.

---

### v0.1.5 — Mixed-script Normalization Hotfix

- Based on the Diagnostic Logging Hotfix. This changes normalization for new highlights only; existing mathematical symbol mappings, geometry bridging, interface, CSS, and manifest are unchanged.
- The whitespace glyph in the Economos 2007 bilingual PDF's Source Han Serif TW font was verified against the embedded font and character coordinates (glyph ID 1, no outline, and normal space advance width). Add an index of that PDF's SHA-256, page number, and text-free context hashes. Exclude samples where the same context has a non-space glyph. Only previously unresolved control characters with this sample evidence are converted into ordinary spaces. Existing symbol mappings take precedence; old spacing rules remain. Other PDFs, unmatched selections, and unknown control characters may still display warnings. This is a limited-sample fix, **not a generic space-glyph recognizer**.
- Add a `verifiedSpaces` diagnostic count and `spacing-verified` classification for `otherControls`. The unidentified list and final normalized result use the same classifications. The mathematical-symbol `recovered` count excludes spaces.
- Preserve original `text` and existing annotations; add no scans or timers. Parse and cache the index on demand. Do not implement superscript or English hyphenation repairs, or insert extra Chinese–English spacing that did not exist in the original text.
- Run offline Node regression tests using three Chinese and three English user-provided `rawText` samples: anomalous controls before χ and after α become spaces; χ2 stays unchanged. No index is applied to unknown PDFs or page numbers. No live in-app performance measurement or acceptance test yet.

---

## v0.1.6 — Office Persistent Comment Markers Hotfix

- For DOCX/PPTX, show a small boxed `+` annotation entry beside every text highlight that can be safely re-anchored, similar to PDFs; display `▣` when it contains a note. The marker no longer appears only for the latest highlight.
- Recompute markers from text anchors when switching slides, reopening documents, scrolling, or changing window layout. If an anchor cannot be safely resolved, hide its marker while retaining the underlying data.
- Keep markers and notes in the existing `data.json`; do not modify Office document bytes.
- Do not change Homepage exclusions, Markdown Reading View limits, PDF functionality, or Vittra.
- Performance: share a single Office scrolling-position listener rather than attaching timers/observers to individual markers. Large-annotation performance still requires live testing.
- Before installing, back up the plugin directory and `data.json`. Replace only `main.js`, `styles.css`, `manifest.json`, and `README.md`.
- JavaScript syntax and static checks passed; Obsidian in-app validation remains pending.

---

### v0.1.6 — Markdown Reading View Text-only Preview

- Enable text highlights and text annotations only in Obsidian Markdown **Reading View**. No Noctilucent Markdown toolbar, markers, or cards appear in editing mode. PDF features are unchanged.
- In Reading View, select text inside one paragraph and use the toolbar's ▰ (highlight only) or note action (highlight and annotate), or a Markdown Reading View command. Eight colors and the annotation sidebar are available. **Area highlights and free-position annotations are not supported in Markdown.**
- Use the browser's CSS Custom Highlight API to color selected ranges without rewriting the Markdown source or rendered text DOM. Store markers and notes in the plugin's `data.json`; back it up. Attempt re-matching when reentering Reading View.
- Anchors combine source text, paragraph index, offsets, and surrounding context. Adding text elsewhere or editing text before a highlighted passage can often be tolerated if the selected text and relevant context remain intact. If selected text changes, matches are duplicated, or context is insufficient to identify the passage safely, the highlight is temporarily hidden while retaining annotation data, **not silently moved**.
- Initially support plain text inside a single paragraph only; no cross-paragraph selections, code, rendered LaTeX, or complex embeds. Live Obsidian 1.15.1 behavior, re-anchoring after edits, and browser highlight support still need validation.
- Do not add writes to Markdown source, reprocess earlier PDF notes, or alter Vittra; preserve existing PDF features.

---

### v0.1.6 — Markdown Floating Toolbar and Continuous Highlighting

- Change the Markdown Reading View toolbar to a draggable floating toolbar (⠿). Its position is stored separately in `mdToolbarPos`, without affecting the PDF toolbar.
- With **Continuous: On**, selecting text within a single paragraph creates a highlight automatically; click again or press Esc to disable.
- With **Continuous: Off**, select text first, then click ▰ to highlight or the note action to add a text annotation.
- Preserve eight colors, Undo/Redo, and the sidebar; no free-position or area annotation tools.
- Switching to editing mode removes the Markdown toolbar and rendered highlights. Annotation data stays in the plugin and Reading View attempts safe matching using quote and context.
- `Reset floating toolbar` resets both PDF and Markdown toolbar positions independently.

---

### v0.1.6 — Compatibility Preview: Homepage, Markdown, Office Viewer

Based on `Noctilucent-0.1.6-floating-toolbar-continuous-hotfix`, with all existing PDF functions and annotation data preserved.

- **Homepage:** For any Markdown file whose basename is `Homepage.md` (case-insensitive), suppress Noctilucent's toolbar and text highlights even in Reading View; retain all existing data.
- **Markdown:** Keep the draggable toolbar, continuous highlighting switch, eight colors, Undo/Redo, and sidebar; remove the note button from the toolbar. Existing highlights can be clicked to open a note card, and the command palette retains `Highlight and comment in Markdown Reading View`. Free-position and area annotations remain unavailable; editing mode is unaffected.
- **Office Viewer (compatibility preview):** Mount the floating toolbar only in dedicated `.docx` / `.pptx` viewer tabs that expose selectable DOM text and support CSS Highlights, after safety checks. Store marks and notes in Noctilucent `data.json`, without changing Office source files. Re-anchor using selected text, paragraph index, and context; do not render marks if a unique anchor cannot be established.
- **Limitations:** Office Viewer uses different rendering engines. Large segmented DOCX documents, PPTX slide navigation, and content not represented as DOM text may prevent mounting or reliable re-anchoring. This is an **experimental compatibility preview**, not comprehensive Office support. If mounting fails, record the display and Office Viewer version; do not test first on important files.
- **Data:** `data.json` is not included in installation ZIPs. Back it up before upgrading. Deleting the source file does not automatically erase saved annotations.

---

### v0.1.6 — Homepage Emoji and PPTX Follow-up

- Expand Homepage exclusion: files named `Homepage.md` or with emoji prefixes such as `🏠 Homepage.md`, tab titles, and documents with `type: homepage` or `cssclasses: pc-homepage` do not show the Markdown Reading View toolbar/highlights. Existing annotations are never deleted.
- Office Viewer PPTX now uses the actual `.pptx-viewer__slide` slide container rather than incorrectly treating it as a DOCX paragraph. Activate only in the main Office Viewer tab, not for PPTX embedded in Markdown.
- Conservatively extract text from PPTX DOM or SVG within one text block. Include a fingerprint of visible slide text in highlight anchors; after switching slides, hide a mark if the slide cannot be confirmed to avoid anchoring it on the wrong slide. Image-only or Canvas-rendered slide text cannot be text-highlighted. No OCR; do not rewrite Office files.
- Reposition marks when Office Viewer content changes, preserving DOCX, Markdown, and PDF logic. This remains a technical preview requiring in-app testing of PPTX selections and cross-slide re-anchoring.

#### 2026-11-23 — Office Add-comment Action Hotfix
- In DOCX/PPTX, a small `＋` action beside the most recent text highlight opens its existing annotation card. Previously created highlights remain clickable to edit notes.
- PPTX highlights created by this build are now stored as `office-highlight` rather than `markdown-highlight`; legacy PPTX data remains readable.
- Office Viewer text rendered as pixels or not exposed as selectable text cannot be safely highlighted; variation in slide DOM may limit selection to one text block.
- Homepage suppression, PDF annotations, Vittra, and the `data.json` schema are unchanged.

---

### v0.1.6 — Office Card Parity Hotfix

- DOCX/PPTX comment cards have the same eight-colour in-card highlight palette as PDF. Colour changes update persistent Office markers and highlights without modifying the Office file.
- Show the shared autosave status and Save button; clicking Save closes the card **only after** the save has been confirmed. Autosave and Ctrl+S still do not close it.
- Add Copy quote + note and Delete highlight controls, mirroring PDF while preserving existing persistent comment markers.
- Homepage exclusion, Markdown reading-only behavior, Office viewer compatibility, PDF and Vittra behavior remain unchanged.

---

### v0.1.6 — Office Card Save Status and Drag Hotfix

- DOCX/PPTX comment cards continue to use the PDF shared saved/pending/writing/error status and Save & Close controls.
- Hold left **or right** mouse button on the card heading to move the card; right-click context menu is suppressed only on the heading.
- Dragging is constrained to the Office reading pane; it never writes to DOCX/PPTX or annotation data.
- Existing PDF, Markdown highlighter, Homepage exclusion, and annotations remain unchanged.

---

### v0.1.6 — Reading and Office Card Parity Preview (2026-11-23)

PDF remains the canonical interface and is unchanged in this release. For Markdown Reading View and Office Viewer DOCX/PPTX:

- Persistent 12px annotation markers for every safely located text highlight: `+` when its note is empty and `▣` when a note exists. Markdown editing mode and excluded Homepage documents are unaffected.
- Hover or keyboard-focus a marker to preview its **existing note** without opening an editor. Avoid previews on highlighted words to minimize conflict with dictionary and translation plugins.
- Each document pane supports several independent open annotation cards. Clicking an already-open note's marker brings that card forward and focuses it rather than duplicating it.
- Markdown and Office card headers support dragging with either mouse button. The full card can be resized using CSS corners (minimum 260px by 190px); note editing and saving behave as before.
- Remove the duplicate source quotation from the editor card but retain it in storage and the sidebar.
- Autosave, Ctrl+S, Save and Close, eight colors, copy, and delete operations remain available. Neither Markdown nor Office source files are modified.

**Preview caveats:** Only offline JavaScript/structure checks have passed. Test in a copied vault first. PDF rendering and positioning are unchanged. The native Office Viewer may not expose selectable text in all PPTX text boxes. Cards and markers are recreated after leaving and returning to a reading pane. Hover previews show note text only, not the original quote.

- Office Viewer and Markdown Reading View cards use the same four save-state messages as PDF: Pending save, Saving…, Saved, and Save failed · Please retry.

---

### v0.1.6 — Office and Markdown Reading View Shortcuts

- `Ctrl+Z` undoes the most recent text-highlight creation or recoloring in the active Word, PowerPoint, or Markdown reading pane.
- `Ctrl+Y` redoes that action; on Mac, use `Cmd+Z` / `Cmd+Y`.
- Annotation text inputs, edit mode, and other plugins' input components keep their native text-undo behavior; typed text is not intercepted.
- Confirm before undoing a highlight with an attached text note. History exists only during the current Obsidian session; existing `data.json` records are unchanged.

---

### v0.1.6 — Sidebar Management Preview (2026-11-23)

This update builds on `Noctilucent-0.1.6-office-md-undo-redo-hotfix.zip` and preserves the PDF-first interface, Office Viewer, Markdown Reading View, and the original data structure.

- **Search scope:** the existing sidebar search supports “Source Text + Annotations”, “Source Text Only”, and “Annotations Only”. All searches apply only to the selected document; existing color and type filters still apply.
- **Pin annotations:** the small pin on each sidebar row pins that annotation above unpinned rows, to a maximum of three **per source document**. Pure highlights and notes can both be pinned. Pin state is stored as the optional `pinnedAt` field on the annotation; no data migration is needed.
- **Bulk-open / close cards:** only annotations with nonempty note text are eligible. A second click closes only cards opened by that bulk action, preserving already-open manually created cards. More than twelve notes requires confirmation. Only safely resolved/loaded locations are opened; offscreen, unloaded, or ambiguous PDF/Office/Markdown anchors are skipped rather than opening cards at incorrect locations.
- **Delete current document:** a confirmation names the file and count. It first flushes pending saves and writes a **full** independent `data.json` snapshot to `.obsidian/plugins/noctilucent/backups/before-delete-*.json` (actual config directory when customized). If backup creation fails, nothing is deleted. The bulk operation is added to session undo/redo history. The source PDF/DOCX/PPTX/Markdown file is not changed.
- **Undo:** Ctrl+Z or the existing undo button restores the entire deleted set in the same Obsidian session. Ctrl+Y redoes the deletion. The backup remains available even after restart. Other document records are untouched.

**Testing note:** Obsidian UI behavior and large documents must still be tested in the actual vault. This is a preview build, not a production-certified migration or a substitute for the user's own backup.


---

---

## v0.1.7 — Eraser and Markdown Smart Re-anchoring Preview

- PDF / DOCX / PPTX / Markdown Reading View floating toolbars: eraser (⌫) removes the entire selected text-highlight record and its note, with confirmation for nonempty notes; Ctrl+Z / Ctrl+Y undo or redo the erasure in the current session. Free-position and area annotations are excluded. Escape exits eraser mode. Eraser and continuous highlighter are mutually exclusive.
- Markdown reading-view re-anchoring: match unchanged selected quote anywhere in rendered blocks, tolerate changes to adjacent context and shifts from inserted or reordered paragraphs, score repeated quotes with prefix/suffix agreement and original location. Ambiguous matches stay unbound. No fuzzy rewriting or silent movement to modified text.
- Existing data.json records and Markdown original bytes are not modified or migrated. No background OCR, AI, or new periodic scans.

---

### v0.1.7 — Eraser and Navigation Hotfix

- Eraser: click or left-drag through existing highlights in PDF / Office / Markdown reading mode; deleting a highlight also removes its note, with undo/redo. Markdown editing remains untouched.
- Sidebar arrows now jump to the text only, without opening the annotation editor.
- PPTX captures slide numbers in new annotation anchors, and legacy anchors can be located through bounded slide navigation via Office Viewer's own controls. Original slide fingerprints remain mandatory.

---

### v0.1.7 — PDF Eraser Cursor and Special Annotation Hotfix

- Eraser pointer now uses a local SVG cursor (with hotspot) across PDF, Office Viewer and Markdown Reading View, including PDF iframe pages. Cursor reverts when eraser is turned off.
- PDF toolbar: Eraser now appears immediately after Area Highlight.
- PDF eraser supports text highlights, free-position notes (click marker), and area highlights (click/drag inside the region or click marker). Existing note confirmation and undo/redo are retained. Text highlights take precedence over area highlights where they overlap.



---

---

## v0.1.8 — Export Highlights and Annotations to Markdown

In the Noctilucent sidebar, choose **Export highlights and annotations…**. This exports **every annotation in the current document**—including text highlights, highlights with notes, PDF free-position notes, and area highlights—regardless of search, color filters, or pinned status.

- **Format:** `.md`; default destination `Noctilucent Exports/<document name> - Highlights.md`.
- Each entry contains the selected quote, annotation text, HEX color, pin status, document location, and Noctilucent ID.
- PDFs use reliable page-number links (Obsidian `#page=N`). Other file types use document links only; **precise navigation to the original Office/Markdown text is not guaranteed**.
- Newer PPT annotations with slide numbers display `Slide N`. Older records without a page number are labeled “Slide number unverified”; do not assume slide zero.
- PDF area annotations currently export descriptions and notes, not screenshots.
- Flush pending saves before exporting. Generate an independent note from a complete data snapshot without modifying existing `data.json` or source documents.
- If a destination filename already exists, create a new version with suffixes such as `(2)` or `(3)`; never overwrite the previous exported note.
- Export is a one-time snapshot. Later edits to the exported Markdown note do not synchronize back to the original annotations.

---

## v0.1.9 — Internationalization (Traditional Chinese / English)

- Add **Auto**, **English**, and **Traditional Chinese** to Noctilucent settings. Auto displays Traditional Chinese for any Chinese-language Obsidian locale and English for other locales.
- Share localization dictionaries across PDF, Office, and Markdown Reading View, including sidebar strings, annotation cards, save statuses, export dialogs, and system notices.
- Translation changes user-interface strings only; source documents, text anchors, and existing annotation content in `data.json` remain untouched.
- Development notes continue to use Traditional Chinese. More details are available in `README.zh-TW.md`.
