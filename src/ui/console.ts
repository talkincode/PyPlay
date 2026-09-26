import { explain } from "../errors/friendly";
import type { PyError } from "../protocol";

/** The output panel: program text, echoed input, info lines, error cards. */
export class ConsoleView {
  constructor(private readonly el: HTMLElement) {}

  clear(): void {
    this.el.textContent = "";
  }

  write(text: string): void {
    const last = this.el.lastChild;
    if (last && last.nodeType === Node.TEXT_NODE) last.textContent += text;
    else this.el.append(document.createTextNode(text));
    this.scroll();
  }

  echo(text: string): void {
    this.span("echo", `${text}\n`);
  }

  info(text: string): void {
    this.span("info", `${text}\n`);
  }

  /** A lesson ran, and the printed text or drawing did not match. */
  miss(text: string): void {
    this.ensureNewline();
    const card = document.createElement("div");
    card.className = "lesson-miss";
    card.textContent = text;
    this.el.append(card);
    this.scroll();
  }

  error(err: PyError, source: string): void {
    const f = explain(err, source);
    const card = document.createElement("div");
    card.className = "error-card";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `😵 ${f.title}`;
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = `💡 ${f.hint}`;
    const pre = document.createElement("pre");
    pre.textContent = err.traceback.trimEnd();
    card.append(title, hint, pre);
    this.ensureNewline();
    this.el.append(card);
    this.scroll();
  }

  private ensureNewline(): void {
    const t = this.el.textContent ?? "";
    if (t.length > 0 && !t.endsWith("\n") && this.el.lastChild?.nodeType === Node.TEXT_NODE) this.write("\n");
  }

  private span(cls: string, text: string): void {
    this.ensureNewline();
    const s = document.createElement("span");
    s.className = cls;
    s.textContent = text;
    this.el.append(s);
    this.scroll();
  }

  private scroll(): void {
    this.el.scrollTop = this.el.scrollHeight;
  }
}
