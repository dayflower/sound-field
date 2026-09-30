import {
  normalizePatch,
  OPERATOR_IDS,
  type Patch,
  routingError,
} from "./patch";

export const PATCH_FORMAT = "modulate-field-patch";
export const PATCH_VERSION = 2;

export type ParsedPatch = { name: string; patch: Patch } | { error: string };

export function formatPatchFile(patch: Patch, name: string): string {
  return `${JSON.stringify({ format: PATCH_FORMAT, version: PATCH_VERSION, name, patch }, null, 2)}\n`;
}

/** Validates the exported patch structure and normalizes its parameters. */
export function parsePatchFile(
  text: string,
  fallbackName: string,
): ParsedPatch {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { error: `invalid JSON (${(error as Error).message})` };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return { error: "expected a JSON object." };
  const file = data as Record<string, unknown>;
  const wrapped = "format" in file;
  if (wrapped) {
    if (file.format !== PATCH_FORMAT)
      return { error: `format must be "${PATCH_FORMAT}".` };
    if (file.version !== PATCH_VERSION)
      return { error: `version must be ${PATCH_VERSION}.` };
  }
  const raw = wrapped ? file.patch : file;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return { error: "patch must be an object." };
  const body = raw as Record<string, unknown>;
  if (
    !Array.isArray(body.operators) ||
    body.operators.length !== OPERATOR_IDS.length
  )
    return {
      error: `patch.operators must contain exactly ${OPERATOR_IDS.length} operators.`,
    };
  const routing = routingError(body.routing);
  if (routing) return { error: `patch.${routing}` };
  const name =
    wrapped && typeof file.name === "string" && file.name.trim()
      ? file.name.trim()
      : fallbackName;
  return { name, patch: normalizePatch(body) };
}
