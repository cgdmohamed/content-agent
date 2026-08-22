export function extractJson(value: string): unknown {
  const cleaned = value.trim().replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  const direct = tryParse(cleaned);
  if (direct !== null) return direct;
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    const parsed = tryParse(arrayMatch[0]);
    if (parsed !== null) return parsed;
  }
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    const parsed = tryParse(objectMatch[0]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function tryParse(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}
