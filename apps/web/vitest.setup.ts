/**
 * What jsdom does not have, and the component tests need.
 *
 * Nothing here is a shim for the app's own behaviour — a setup file that
 * fakes what is under test is how a green suite stops meaning anything.
 * These are browser APIs jsdom has never implemented.
 */
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
// toHaveTextContent / toHaveAttribute / toBeEmptyDOMElement — assertions about
// a DOM node rather than about a string, so a failure names the element.
import "@testing-library/jest-dom/vitest";

// Radix measures with these before it opens anything.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (typeof Element.prototype.scrollIntoView === "undefined") {
  Element.prototype.scrollIntoView = () => {};
}

if (typeof globalThis.matchMedia === "undefined") {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof matchMedia;
}

// Each test gets a clean document; a leaked one turns getByRole into a
// "found multiple elements" failure three tests later.
afterEach(() => cleanup());
