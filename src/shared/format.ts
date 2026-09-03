export function formatTime(value: number): string {
  if (!Number.isFinite(value)) return "00:00";
  const seconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const tail = `${String(minutes).padStart(hours ? 2 : 1, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return hours ? `${hours}:${tail}` : tail;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const unit = units[index] ?? "GB";
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${unit}`;
}

export type FrequencyFormat = "compact" | "hertz";

export function formatFrequency(
  value: number,
  format: FrequencyFormat = "compact",
): string {
  if (format === "hertz") {
    return value >= 1000
      ? `${(value / 1000).toFixed(value === 20000 ? 1 : 2)} kHz`
      : `${value} Hz`;
  }
  return value >= 1000
    ? `${(value / 1000).toFixed(value % 1000 ? 1 : 0)}k`
    : `${value}`;
}
