import { Parser, type DefaultTreeAdapterMap } from "parse5";
import { WEB_BINDINGS, WEB_CONTROLS, WEB_INPUT_TYPES, WEB_PROJECT_LIMITS, WEB_TAGS, WEB_VOID_TAGS,
  webIdentifier, webLimitError, webPath, webSourceError, type WebBinding, type WebField, type WebTemplateNode } from "./web-model.js";

const globalText = new Set(["title", "aria-label", "aria-description"]);
const references = new Set(["for", "aria-labelledby", "aria-describedby", "aria-controls"]);
const booleanAttributes = new Set(["hidden", "disabled", "checked", "required", "readonly", "selected", "open"]);
const numericAttributes = new Set(["min", "max", "step", "value", "maxlength", "rows", "cols", "colspan", "rowspan"]);
const roles = new Set(["status", "alert", "group", "region", "list", "listitem", "note", "progressbar", "presentation", "none"]);

function attributes(tag: string, values: { name: string; value: string; namespace?: string }[]) {
  if (values.length > WEB_PROJECT_LIMITS.attributes) return webLimitError();
  const output: Record<string, string> = {};
  for (const { name, value, namespace } of values) {
    if (namespace || Object.hasOwn(output, name) || value.length > WEB_PROJECT_LIMITS.attributeCharacters
      || [...value].some(character => character.charCodeAt(0) < 32 && ![9, 10, 13].includes(character.charCodeAt(0)))) return webSourceError();
    if (name.startsWith("data-")) {
      const key = name.slice(5);
      if (key === "action") {
        if (!webIdentifier(value) || (tag !== "button" && tag !== "form")) return webSourceError();
      } else if (key === "repeat" || key === "id" || WEB_BINDINGS.has(key)) {
        if (!webPath(value)) return webSourceError();
        if (key === "checked" && tag !== "input") return webSourceError();
        if (key === "disabled" && !WEB_CONTROLS.has(tag)) return webSourceError();
        if (key === "pressed" && tag !== "button") return webSourceError();
        if (key === "value" && !["input", "textarea", "select", "progress", "meter", "output"].includes(tag)) return webSourceError();
        if ((key === "text" || key === "repeat") && WEB_VOID_TAGS.has(tag)) return webSourceError();
      } else return webSourceError();
    } else if (name === "id" || name === "name") {
      if (!webIdentifier(value) || (name === "name" && !["input", "textarea", "select"].includes(tag))) return webSourceError();
    } else if (name === "class") {
      const names = value.trim().split(/\s+/u);
      if (names.length > 16 || !names.every(webIdentifier)) return webSourceError();
    } else if (globalText.has(name)) {
      if (!value.trim()) return webSourceError();
    } else if (references.has(name)) {
      if (!value.split(/\s+/u).every(webIdentifier) || (name === "for" && tag !== "label")) return webSourceError();
    } else if (booleanAttributes.has(name)) {
      if (value !== "" && value !== name) return webSourceError();
      if (["disabled", "required", "readonly"].includes(name) && !WEB_CONTROLS.has(tag)) return webSourceError();
      if (name === "checked" && tag !== "input") return webSourceError();
      if (name === "selected" && tag !== "option") return webSourceError();
      if (name === "open" && tag !== "details") return webSourceError();
    } else if (name === "type") {
      if (tag === "input" ? !WEB_INPUT_TYPES.has(value) : tag !== "button" || !["button", "submit"].includes(value)) return webSourceError();
    } else if (name === "value" && ["input", "option"].includes(tag)) {
      // Text/option values are inert form data; range constraints are assessed separately.
    } else if (numericAttributes.has(name)) {
      if (!/^-?(?:0|[1-9]\d{0,3})(?:\.\d{1,3})?$/u.test(value) || Math.abs(Number(value)) > 1000) return webSourceError();
    } else if (name === "placeholder" && ["input", "textarea"].includes(tag)) {
      if (value.length > 160) return webSourceError();
    } else if (name === "role") {
      if (!roles.has(value)) return webSourceError();
    } else if (name === "aria-live") {
      if (!["polite", "assertive", "off"].includes(value)) return webSourceError();
    } else if (["aria-atomic", "aria-pressed", "aria-expanded", "aria-hidden"].includes(name)) {
      if (!["true", "false"].includes(value)) return webSourceError();
    } else if (name === "tabindex") {
      if (value !== "0" && value !== "-1") return webSourceError();
    } else if (name === "scope" && tag === "th") {
      if (!["row", "col", "rowgroup", "colgroup"].includes(value)) return webSourceError();
    } else return webSourceError();
    output[name] = value;
  }
  if (output["data-id"] && !output["data-action"]) return webSourceError();
  if ((output.checked !== undefined || output["data-checked"]) && output.type !== "checkbox") return webSourceError();
  if (tag === "button" && output["data-action"] && output.type !== "button") return webSourceError();
  return output;
}

/** Parse with the HTML parser's own token stream, validating even tags it would discard. */
export function parseWebHtml(html: string, checkOpen: () => void): WebTemplateNode[] {
  const parser = Parser.getFragmentParser<DefaultTreeAdapterMap>(null, { scriptingEnabled: false, onParseError: webSourceError });
  const start = parser.onStartTag.bind(parser);
  const end = parser.onEndTag.bind(parser);
  let tokens = 0;
  parser.onStartTag = token => {
    checkOpen();
    if (++tokens > WEB_PROJECT_LIMITS.templateNodes) return webLimitError();
    if (!WEB_TAGS.has(token.tagName)) return webSourceError();
    attributes(token.tagName, token.attrs);
    start(token);
  };
  parser.onEndTag = token => {
    checkOpen();
    if (!WEB_TAGS.has(token.tagName)) return webSourceError();
    end(token);
  };
  parser.onDoctype = webSourceError;
  parser.tokenizer.write(html, true);
  const ids = new Set<string>();
  let count = 0;
  function convert(node: DefaultTreeAdapterMap["childNode"], depth: number, repeating: boolean): WebTemplateNode[] {
    checkOpen();
    if (++count > WEB_PROJECT_LIMITS.templateNodes || depth > WEB_PROJECT_LIMITS.templateDepth) return webLimitError();
    if (node.nodeName === "#comment") return [];
    if ("value" in node) return [{ kind: "text", text: node.value }];
    if (!("tagName" in node) || node.namespaceURI !== "http://www.w3.org/1999/xhtml" || !WEB_TAGS.has(node.tagName)) return webSourceError();
    const attrs = attributes(node.tagName, node.attrs);
    const repeat = attrs["data-repeat"];
    if (attrs.id) {
      if (repeating || repeat || ids.has(attrs.id)) return webSourceError();
      ids.add(attrs.id);
    }
    const bindings: Partial<Record<WebBinding, string>> = {};
    for (const binding of WEB_BINDINGS) if (attrs[`data-${binding}`]) bindings[binding as WebBinding] = attrs[`data-${binding}`];
    const action = attrs["data-action"] ? { type: attrs["data-action"], ...(attrs["data-id"] ? { idPath: attrs["data-id"] } : {}) } : undefined;
    const field = attrs.name ? { name: attrs.name, type: (node.tagName === "input" ? attrs.type ?? "text" : node.tagName) as WebField["type"] } : undefined;
    const safeAttributes = Object.fromEntries(Object.entries(attrs).filter(([name]) => !name.startsWith("data-")));
    return [{ kind: "element", tag: node.tagName, attributes: safeAttributes, bindings,
      children: node.childNodes.flatMap(child => convert(child, depth + 1, repeating || !!repeat)),
      ...(repeat ? { repeat } : {}), ...(action ? { action } : {}), ...(field ? { field } : {}) }];
  }
  return parser.getFragment().childNodes.flatMap(node => convert(node, 1, false));
}
