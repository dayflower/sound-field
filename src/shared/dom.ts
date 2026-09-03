export type ElementConstructor<T extends Element> = {
  new (): T;
};

/**
 * Returns a required element and fails at startup with a useful message when
 * the page markup no longer matches the TypeScript view contract.
 */
export function requiredElement<T extends Element>(
  selector: string,
  elementType: ElementConstructor<T>,
  root: ParentNode = document,
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof elementType)) {
    throw new Error(`Expected ${selector} to be a ${elementType.name}.`);
  }
  return element;
}

export function requiredCanvasContext(
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error(`Unable to create a 2D context for #${canvas.id}.`);
  }
  return context;
}
