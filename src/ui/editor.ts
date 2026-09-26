import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { defaultHighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap, lineNumbers } from "@codemirror/view";
import { basicSetup } from "codemirror";

/** Line decorations: the line currently running, and the line that failed. */
const setMarks = StateEffect.define<{ current: number | null; error: number | null }>();

const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setMarks)) continue;
      const ranges = [];
      const doc = tr.state.doc;
      const { current, error } = e.value;
      if (error !== null && error >= 1 && error <= doc.lines) {
        ranges.push(Decoration.line({ class: "pyplay-error-line" }).range(doc.line(error).from));
      }
      if (current !== null && current >= 1 && current <= doc.lines && current !== error) {
        ranges.push(Decoration.line({ class: "pyplay-current" }).range(doc.line(current).from));
      }
      ranges.sort((a, b) => a.from - b.from);
      deco = Decoration.set(ranges);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export interface CodeEditor {
  getCode(): string;
  /** Replace the document as a user edit would (undoable). */
  setCode(code: string): void;
  /** Start over with a new document and an empty undo history (switching projects). */
  load(code: string): void;
  markLines(current: number | null, error: number | null): void;
  focus(): void;
  hasFocus(): boolean;
}

export function createEditor(
  parent: HTMLElement,
  initial: string,
  opts: { onChange(code: string): void; onRun(): void },
): CodeEditor {
  let silent = false;
  const makeState = (doc: string) =>
    EditorState.create({
      doc,
      extensions: [
        basicSetup,
        history(),
        python(),
        indentUnit.of("    "),
        EditorState.tabSize.of(4),
        marksField,
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              opts.onRun();
              return true;
            },
          },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            if (!silent) opts.onChange(u.state.doc.toString());
            u.view.dispatch({ effects: setMarks.of({ current: null, error: null }) });
          }
        }),
      ],
    });
  const view = new EditorView({ parent, state: makeState(initial) });
  return {
    getCode: () => view.state.doc.toString(),
    setCode: (code) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } }),
    load: (code) => {
      silent = true;
      try {
        view.setState(makeState(code));
      } finally {
        silent = false;
      }
    },
    markLines: (current, error) => view.dispatch({ effects: setMarks.of({ current, error }) }),
    focus: () => view.focus(),
    hasFocus: () => view.hasFocus,
  };
}

/** Read-only, syntax-highlighted code (example previews). */
export function createCodeView(parent: HTMLElement): { show(code: string): void } {
  const makeState = (doc: string) =>
    EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        python(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
      ],
    });
  const view = new EditorView({ parent, state: makeState("") });
  return { show: (code) => view.setState(makeState(code)) };
}
