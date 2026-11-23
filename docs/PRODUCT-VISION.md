# Noctilucent — Product Vision

**Highlight freely. Annotate naturally.**

**Document scope:** Product motivation, user experience principles, and design intent.  
**Baseline:** Noctilucent v0.1.9 (desktop preview).

## 1. Why Noctilucent exists

Academic reading is not a continuous sequence of fully formed notes. Sometimes a passage is worth remembering but does not yet require interpretation. At other times, a question, connection, or personal observation arises while the original passage is still in view.

Noctilucent was created to make those moments easier. It aims to avoid three kinds of interruption:

1. **Spatial interruption:** moving attention away from the document to a permanent annotation panel, or shrinking the document to make room for notes.
2. **Decision interruption:** requiring a semantic label before a thought has taken shape.
3. **Workflow interruption:** treating highlighting and commenting as separate, mandatory steps rather than one flexible progression.

The aim is not to maximize the number of annotation controls. It is to preserve the reader's focus while keeping notes readily available.

## 2. The core interaction: highlight first, annotate later

A highlight is a complete and useful action. It must not require a written comment.

When a reader wants to go further, a comment can be attached to the existing highlight. This allows a passage to move naturally from **noticed** to **considered** without requiring the reader to choose that progression in advance.

The reader may:

- Highlight and continue reading.
- Revisit a highlight and add a comment later.
- Open an existing comment in context, edit it, and return to the document.

The presence or absence of a comment should not determine whether a highlight is valid.

## 3. Notes belong near their context

Comments should be accessible from the passage they refer to, in the **current document view**.

Noctilucent uses on-demand, movable, sticky-note-style cards. The goal is to make a note available where the reader is looking, without permanently reserving a sidebar or requiring spare page margins. Cards can temporarily overlap document content while open; this is an intentional, user-controlled trade-off rather than a claim of zero obstruction.

An annotation management sidebar can still be helpful for finding and organizing notes. It should remain an optional management surface, not the only place where the reader can write or edit a note.

## 4. Color is not a mandatory category

Color and meaning serve different purposes:

- **Color** is a direct visual choice by the reader.
- **Comment text** captures whatever the reader wants to say.
- **Semantic classification**, if added in the future, is optional metadata rather than a prerequisite.

A purple highlight does not have to mean “question,” and an orange highlight does not have to mean “correction.” A note may be an observation, uncertainty, definition, connection, or unstructured thought without fitting into a predefined taxonomy.

The reader should be able to choose a color and make a mark without first naming the thought.

## 5. Design principles

1. **Reading first.** Keep the document as the main workspace.
2. **Highlight independently.** Never force a comment for a simple mark.
3. **Progressive annotation.** Allow notes to be added after highlighting, not only during selection.
4. **On-demand context.** Make notes available next to the relevant passage without requiring a permanent annotation panel.
5. **User-directed color.** Never make predefined note categories a condition of choosing a highlight color.
6. **Optional structure.** Advanced organization must not block quick, informal note-taking.
7. **Predictable control.** Clearly distinguish ordinary reading, highlighting, editing, and erasing so the user can act intentionally.
8. **Respect source documents.** Maintain annotation data separately from original files, with clear limits and backup guidance.
9. **Consistent intent across formats.** Preserve the same interaction logic across supported document views while acknowledging each viewer's anchoring limitations.
10. **Accessible language.** Support English and Traditional Chinese interface choices without altering the reader's source text or existing notes.

## 6. Current expression in v0.1.9

The desktop preview implements the reading-first approach through:

- PDF eight-color highlighting, continuous highlight mode, and comments attached to marks.
- Movable annotation cards that open inside the document view.
- PDF free-position sticky notes and area highlighting.
- Annotation sidebar, document-level search and filters, navigation, pinning, eraser tools, and session undo/redo.
- Markdown Reading View highlighting and comments.
- DOCX and PPTX selectable-text highlighting and comments in supported Office Viewer contexts.
- One-time Markdown export of current-document annotations, without overwriting the source document.
- English and Traditional Chinese interface options.

The author has used and tested these available features in a real Obsidian desktop environment. Specific behavior can still depend on operating system, Obsidian version, rendering engine, and document structure. Office text anchoring and Markdown reading-mode boundaries are documented in the [README](../README.md).

This document describes the intended experience rather than asserting exhaustive compatibility.

## 7. Intended readers and reading moments

Noctilucent is particularly suited to people who move between research articles, lecture slides, reports, and personal Markdown notes—especially readers who often highlight without immediately composing a formal annotation.

A typical flow is to read a paper, mark a useful methodological passage, continue reading, then return to that passage to write a question or connection. The note should remain visibly attached to its original context and should not demand an arbitrary label.

## 8. Guardrails for future development

Future functionality should preserve the original reason this project exists.

- Do not require a category for highlighting or adding an ordinary comment.
- Do not automatically equate a color with a semantic classification.
- Do not make a sidebar the exclusive editing surface.
- Do not make expanded annotation cards permanent or unavoidable.
- Do not force a written note when the user only wants to highlight.
- Do not prioritize a longer feature list over a clear, low-friction reading flow.

Optional organization, global search, richer exports, and other research-oriented functions may grow around these principles, but should not replace them.

---

**Product promise:** Let readers mark what matters now, develop their thoughts when ready, and keep those thoughts close to the source.
