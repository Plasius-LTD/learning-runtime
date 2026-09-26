export const WEB_PROJECT_LIMITS = Object.freeze({ htmlCharacters: 24000, cssCharacters: 16000,
  templateNodes: 256, templateDepth: 20, attributes: 16, attributeCharacters: 240,
  cssNodes: 2048, cssDepth: 16, repeatedItems: 50, projectedNodes: 768, outputCharacters: 64000 });

export class WebProjectError extends Error {
  constructor(readonly code: "INVALID_SOURCE" | "INVALID_VIEW" | "LIMIT_EXCEEDED" | "CLOSED") {
    super(`Web project: ${code}`); this.name = "WebProjectError";
  }
}

export const WEB_TAGS = new Set(["main", "section", "article", "aside", "header", "footer", "nav", "div", "span", "p",
  "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "small", "code", "pre", "blockquote", "ul", "ol", "li",
  "dl", "dt", "dd", "table", "caption", "thead", "tbody", "tfoot", "tr", "th", "td", "form", "fieldset", "legend",
  "label", "input", "textarea", "select", "option", "button", "output", "progress", "meter", "br", "hr", "details", "summary"]);
export const WEB_VOID_TAGS = new Set(["input", "br", "hr"]);
export const WEB_CONTROLS = new Set(["input", "textarea", "select", "button"]);
export const WEB_INPUT_TYPES = new Set(["text", "number", "range", "checkbox"]);
export const WEB_BINDINGS = new Set(["text", "value", "checked", "disabled", "pressed", "label", "if"]);
export type WebBinding = "text" | "value" | "checked" | "disabled" | "pressed" | "label" | "if";

export interface WebTextNode { kind: "text"; text: string }
export interface WebField { name: string; type: "text" | "number" | "range" | "checkbox" | "textarea" | "select" }
export interface WebTemplateElement {
  kind: "element";
  tag: string;
  attributes: Record<string, string>;
  children: WebTemplateNode[];
  bindings: Partial<Record<WebBinding, string>>;
  repeat?: string;
  action?: { type: string; idPath?: string };
  field?: WebField;
}
export type WebTemplateNode = WebTextNode | WebTemplateElement;
export interface WebRenderElement {
  kind: "element";
  tag: string;
  attributes: Record<string, string>;
  children: WebRenderNode[];
  action?: { type: string; id?: string };
  field?: WebField;
}
export type WebRenderNode = WebTextNode | WebRenderElement;
export interface WebProjection { nodes: WebRenderNode[]; css: string }
export interface WebProject {
  readonly closed: boolean;
  /** Detached parsed representation, for structural checks; never execute as HTML. */
  readonly template: WebTemplateNode[];
  /** Project bounded JSON view data into inert nodes and explicit action metadata. */
  render(view: unknown): WebProjection;
  dispose(): void;
}
export interface WebProjectOptions { signal?: AbortSignal }

const forbiddenNames = new Set(["__proto__", "prototype", "constructor"]);
export function webIdentifier(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/u.test(value) && !forbiddenNames.has(value);
}
export function webPath(value: string): boolean {
  const parts = value.split(".");
  return value.length <= 128 && parts.length <= 4 && parts.every(part => /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/u.test(part) && !forbiddenNames.has(part));
}
export const webSourceError = (): never => { throw new WebProjectError("INVALID_SOURCE"); };
export const webLimitError = (): never => { throw new WebProjectError("LIMIT_EXCEEDED"); };
export const webViewError = (): never => { throw new WebProjectError("INVALID_VIEW"); };
