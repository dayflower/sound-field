/** Updates the CSS custom property used by the shared range-track fill. */
export function paintRange(input: HTMLInputElement): void {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const ratio = max > min ? (value - min) / (max - min) : 0;
  input.style.setProperty(
    "--fill",
    `${Math.min(1, Math.max(0, ratio)) * 100}%`,
  );
}
