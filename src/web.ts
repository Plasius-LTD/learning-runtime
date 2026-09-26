import { serializeProjectJson, type ProjectJsonValue } from "./javascript.js";
import { parseWebHtml } from "./web-html.js";
import { parseWebCss } from "./web-css.js";
import { WEB_PROJECT_LIMITS, WebProjectError, webLimitError, webSourceError, webViewError,
  type WebProject, type WebProjectOptions, type WebProjection, type WebRenderNode, type WebTemplateElement, type WebTemplateNode } from "./web-model.js";
export { WEB_PROJECT_LIMITS, WebProjectError } from "./web-model.js";
export type { WebProject, WebProjectOptions, WebProjection, WebRenderNode, WebRenderElement, WebTemplateNode, WebTemplateElement, WebField } from "./web-model.js";

function ownPath(value: ProjectJsonValue, path: string): ProjectJsonValue {
  let current = value;
  for (const key of path.split(".")) {
    if (current === null || typeof current !== "object" || Array.isArray(current) || !Object.hasOwn(current, key)) return webViewError();
    current = current[key]!;
  }
  return current;
}
const scalarText = (value: ProjectJsonValue): string => typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : webViewError();
const bool = (value: ProjectJsonValue): boolean => typeof value === "boolean" ? value : webViewError();

/**
 * Compile a documented HTML/CSS subset with no DOM, network or execution effects.
 * Call inside a disposable host worker; render only its inert representation with
 * the sandbox/CSP boundary in ADR 0004. JavaScript execution remains separate.
 */
export function createWebProject(source: { html: string; css: string }, options: WebProjectOptions = {}): WebProject {
  let snapshot: { html: string; css: string };
  try { snapshot = JSON.parse(serializeProjectJson(source)) as typeof snapshot; } catch { return webSourceError(); }
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || Object.keys(snapshot).length !== 2
    || typeof snapshot.html !== "string" || typeof snapshot.css !== "string" || (snapshot.html + snapshot.css).includes("\0")) return webSourceError();
  if (snapshot.html.length > WEB_PROJECT_LIMITS.htmlCharacters || snapshot.css.length > WEB_PROJECT_LIMITS.cssCharacters) return webLimitError();
  if (!options || typeof options !== "object" || Array.isArray(options)
    || (Object.getPrototypeOf(options) !== Object.prototype && Object.getPrototypeOf(options) !== null)
    || Object.getOwnPropertySymbols(options).length) return webSourceError();
  const descriptors = Object.getOwnPropertyDescriptors(options);
  if (Object.entries(descriptors).some(([key, descriptor]) => key !== "signal" || descriptor.get || descriptor.set || !descriptor.enumerable)) return webSourceError();
  const signal: AbortSignal | undefined = descriptors.signal?.value;
  if (signal !== undefined && !(signal instanceof AbortSignal)) return webSourceError();
  let closed = signal?.aborted === true;
  const checkOpen = () => { if (closed || signal?.aborted) throw new WebProjectError("CLOSED"); };
  let template: WebTemplateNode[] = [];
  let css = "";
  const dispose = () => { closed = true; template = []; css = ""; signal?.removeEventListener("abort", dispose); };
  try {
    checkOpen();
    template = parseWebHtml(snapshot.html, checkOpen);
    css = parseWebCss(snapshot.css, checkOpen);
  } catch (error) { dispose(); if (error instanceof WebProjectError) throw error; return webSourceError(); }
  signal?.addEventListener("abort", dispose, { once: true });
  return {
    get closed() { return closed; },
    get template() { checkOpen(); return structuredClone(template); },
    dispose,
    render(value: unknown): WebProjection {
      checkOpen();
      try {
        const view = JSON.parse(serializeProjectJson(value)) as ProjectJsonValue;
        if (view === null || typeof view !== "object" || Array.isArray(view)) return webViewError();
        let nodes = 0;
        function project(node: WebTemplateNode, context: ProjectJsonValue, skipRepeat = false): WebRenderNode[] {
          checkOpen();
          if (++nodes > WEB_PROJECT_LIMITS.projectedNodes) return webLimitError();
          if (node.kind === "text") return [{ ...node }];
          if (node.repeat && !skipRepeat) {
            const items = ownPath(context, node.repeat);
            if (!Array.isArray(items)) return webViewError();
            if (items.length > WEB_PROJECT_LIMITS.repeatedItems) return webLimitError();
            const ids = new Set<string>();
            return items.flatMap(item => {
              const id = ownPath(item, "id");
              if (typeof id !== "string" || !id.trim() || id.length > 128 || ids.has(id)) return webViewError();
              ids.add(id);
              return project(node, item, true);
            });
          }
          if (node.bindings.if && !bool(ownPath(context, node.bindings.if))) return [];
          const attributes = { ...node.attributes };
          for (const [binding, path] of Object.entries(node.bindings)) {
            if (["text", "if"].includes(binding)) continue;
            const data = ownPath(context, path);
            if (binding === "disabled" || binding === "checked") {
              if (bool(data)) attributes[binding] = "";
              else delete attributes[binding];
            } else if (binding === "pressed" || binding === "invalid") attributes[`aria-${binding}`] = String(bool(data));
            else if (binding === "label") {
              const label = scalarText(data);
              if (!label.trim() || label.length > WEB_PROJECT_LIMITS.attributeCharacters) return webViewError();
              attributes["aria-label"] = label;
            } else {
              const value = scalarText(data);
              if (value.length > 2000) return webLimitError();
              attributes.value = value;
            }
          }
          if (node.bindings.text && ++nodes > WEB_PROJECT_LIMITS.projectedNodes) return webLimitError();
          const children: WebRenderNode[] = node.bindings.text ? [{ kind: "text", text: scalarText(ownPath(context, node.bindings.text)) }]
            : node.children.flatMap(child => project(child, context));
          const action = actionFor(node, context);
          return [{ kind: "element", tag: node.tag, attributes, children,
            ...(action ? { action } : {}), ...(node.field ? { field: { ...node.field } } : {}) }];
        }
        const result = { nodes: template.flatMap(node => project(node, view)), css };
        if (JSON.stringify(result).length > WEB_PROJECT_LIMITS.outputCharacters) return webLimitError();
        return result;
      } catch (error) {
        // A bad view can be corrected on the next reducer result; keep this parsed
        // template usable. Cancellation alone permanently closes the project.
        if (error instanceof WebProjectError) throw error;
        return webViewError();
      }
    },
  };
}

function actionFor(node: WebTemplateElement, context: ProjectJsonValue): { type: string; id?: string } | undefined {
  if (!node.action) return undefined;
  if (!node.action.idPath) return { type: node.action.type };
  const id = ownPath(context, node.action.idPath);
  if (typeof id !== "string" || !id.trim() || id.length > 128) return webViewError();
  return { type: node.action.type, id };
}
