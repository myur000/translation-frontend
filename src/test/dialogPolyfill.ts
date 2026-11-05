/**
 * jsdom has no modal <dialog> support. Install a minimal showModal/close
 * for a test block; the returned function restores the originals.
 */
export function installDialogPolyfill() {
  const prototype = HTMLDialogElement.prototype
  const originals = {
    showModal: Object.getOwnPropertyDescriptor(prototype, 'showModal'),
    close: Object.getOwnPropertyDescriptor(prototype, 'close'),
  }
  Object.defineProperty(prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) { this.open = true },
  })
  Object.defineProperty(prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) { this.open = false },
  })

  return () => {
    for (const name of ['showModal', 'close'] as const) {
      const original = originals[name]
      if (original) Object.defineProperty(prototype, name, original)
      else delete (prototype as unknown as Record<string, unknown>)[name]
    }
  }
}
