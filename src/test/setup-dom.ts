import { JSDOM } from "jsdom";
import React from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3000",
});

const globals = {
  React,
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  HTMLSelectElement: dom.window.HTMLSelectElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  NodeFilter: dom.window.NodeFilter,
  SVGElement: dom.window.SVGElement,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  EventTarget: dom.window.EventTarget,
  MouseEvent: dom.window.MouseEvent,
  KeyboardEvent: dom.window.KeyboardEvent,
  PointerEvent: dom.window.PointerEvent ?? dom.window.MouseEvent,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle,
  requestAnimationFrame: (callback: FrameRequestCallback) =>
    setTimeout(callback, 0),
  cancelAnimationFrame: (id: number) => clearTimeout(id),
};

for (const [key, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.assign(globalThis, { ResizeObserver });
Object.defineProperty(dom.window.navigator, "clipboard", {
  configurable: true,
  value: { writeText: async () => undefined },
});
