import { generate, lexer, parse, walk, type CssNode, type Declaration } from "css-tree";
import { WEB_PROJECT_LIMITS, webLimitError, webSourceError } from "./web-model.js";

const properties = new Set(["display", "gap", "row-gap", "column-gap", "grid-template-columns", "grid-template-rows",
  "grid-column", "grid-row", "align-items", "align-content", "justify-items", "justify-content", "flex", "flex-direction",
  "flex-wrap", "flex-grow", "flex-shrink", "flex-basis", "order", "width", "min-width", "max-width", "height", "min-height", "max-height",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left", "margin-inline", "margin-block",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left", "padding-inline", "padding-block",
  "box-sizing", "border", "border-width", "border-style", "border-color", "border-radius", "border-collapse", "border-spacing",
  "color", "background-color", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing",
  "text-align", "text-decoration", "text-transform", "white-space", "overflow-wrap", "word-break", "vertical-align",
  "list-style-type", "outline", "outline-width", "outline-style", "outline-color", "outline-offset", "opacity", "visibility",
  "overflow", "overflow-x", "overflow-y", "cursor", "transition-property", "transition-duration", "transition-timing-function"]);
const functions = new Set(["rgb", "rgba", "hsl", "hsla", "var", "min", "max", "clamp", "calc", "repeat", "minmax", "fit-content", "steps", "cubic-bezier"]);
const pseudoClasses = new Set(["root", "hover", "focus", "focus-visible", "focus-within", "active", "checked", "disabled", "enabled",
  "first-child", "last-child", "nth-child", "nth-of-type", "empty", "not"]);
const units = new Set(["px", "em", "rem", "ch", "fr", "s", "ms", "deg"]);

/** Validate a bounded stylesheet without evaluating it or loading resources. */
export function parseWebCss(css: string, checkOpen: () => void): string {
  checkOpen();
  const ast = parse(css, { positions: false, parseCustomProperty: true, onParseError: webSourceError });
  let nodes = 0;
  let depth = 0;
  const declarations: Declaration[] = [];
  walk(ast, {
    enter(node: CssNode) {
      checkOpen();
      if (++nodes > WEB_PROJECT_LIMITS.cssNodes || ++depth > WEB_PROJECT_LIMITS.cssDepth) return webLimitError();
      if (["Raw", "Url"].includes(node.type)) return webSourceError();
      if (node.type === "Atrule") {
        if (node.name !== "media" || !node.prelude || !node.block) return webSourceError();
        const query = generate(node.prelude).replace(/\s+/gu, "");
        if (!/^\((?:min-width|max-width):\d{1,4}(?:px|rem)\)$/u.test(query)
          && !/^\(prefers-reduced-motion:(?:reduce|no-preference)\)$/u.test(query)
          && !/^\(prefers-color-scheme:(?:light|dark)\)$/u.test(query)) return webSourceError();
      }
      if (node.type === "Declaration") {
        if (node.important) return webSourceError();
        const custom = /^--[a-z][a-z0-9-]{0,31}$/u.test(node.property);
        if (!custom && !properties.has(node.property)) return webSourceError();
        if (!custom) declarations.push(node);
      }
      if (node.type === "Function" && !functions.has(node.name)) return webSourceError();
      if (node.type === "PseudoClassSelector" && !pseudoClasses.has(node.name)) return webSourceError();
      if (node.type === "PseudoElementSelector") return webSourceError();
      if (node.type === "AttributeSelector") {
        const name = node.name.name;
        const value = node.value?.type === "String" ? node.value.value : node.value?.name;
        if (node.matcher !== "=" || node.flags || typeof value !== "string"
          || (!["aria-pressed", "aria-expanded", "aria-invalid", "aria-required"].includes(name) && name !== "type")
          || !(name === "type" ? ["text", "number", "range", "checkbox", "button", "submit"].includes(value) : ["true", "false"].includes(value))) return webSourceError();
      }
      if (node.type === "Dimension" || node.type === "Number" || node.type === "Percentage") {
        const value = Number(node.value);
        if (!Number.isFinite(value) || Math.abs(value) > 4096) return webSourceError();
        if (node.type === "Dimension" && (!units.has(node.unit)
          || (node.unit === "s" && (value < 0 || value > 2)) || (node.unit === "ms" && (value < 0 || value > 2000)))) return webSourceError();
      }
      if (node.type === "Function" && node.name === "repeat") {
        const first = node.children.first;
        if (!first || (first.type === "Number" ? !Number.isInteger(Number(first.value)) || Number(first.value) < 1 || Number(first.value) > 12
          : first.type !== "Identifier" || !["auto-fit", "auto-fill"].includes(first.name))) return webSourceError();
      }
    },
    leave() { depth -= 1; },
  });
  // Validate property grammars only after bounding the complete syntax tree.
  for (const declaration of declarations) {
    checkOpen();
    let variable = false;
    walk(declaration.value, candidate => { if (candidate.type === "Function" && candidate.name === "var") variable = true; });
    if (!variable && !lexer.matchProperty(declaration.property, declaration.value).matched) return webSourceError();
  }
  checkOpen();
  const result = generate(ast);
  if (result.length > WEB_PROJECT_LIMITS.cssCharacters) return webLimitError();
  return result;
}
