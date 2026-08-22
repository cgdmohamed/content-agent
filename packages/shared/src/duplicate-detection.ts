const arabicStopWords = new Set([
  "عن",
  "في",
  "من",
  "على",
  "الى",
  "إلى",
  "مع",
  "هذا",
  "هذه",
  "ذلك",
  "تلك",
  "كيف",
  "ماهو",
  "ماهي",
  "افضل",
  "أفضل"
]);

export interface DuplicateCandidate {
  id: string;
  topic: string;
  title?: string | null;
  keyword?: string | null;
  status: string;
}

export interface DuplicateMatch extends DuplicateCandidate {
  similarity: number;
}

export function normalizeArabicText(value: string): string {
  const words = value
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{Script=Arabic}a-z0-9\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter((word) => word.length > 2 && !arabicStopWords.has(word));

  return words.join(" ").trim();
}

function bigrams(value: string): Set<string> {
  const normalized = normalizeArabicText(value);
  if (normalized.length < 2) return new Set(normalized ? [normalized] : []);
  const grams = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    grams.add(normalized.slice(index, index + 2));
  }
  return grams;
}

export function similarityScore(left: string, right: string): number {
  const a = normalizeArabicText(left);
  const b = normalizeArabicText(right);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 92;

  const aGrams = bigrams(a);
  const bGrams = bigrams(b);
  const intersection = [...aGrams].filter((gram) => bGrams.has(gram)).length;
  const union = new Set([...aGrams, ...bGrams]).size;
  return Math.round((intersection / union) * 100);
}

export function findDuplicateMatches(
  requestedTopic: string,
  candidates: DuplicateCandidate[],
  threshold = 68
): DuplicateMatch[] {
  return candidates
    .map((candidate) => {
      const memory = [candidate.topic, candidate.title, candidate.keyword].filter(Boolean).join(" ");
      return { ...candidate, similarity: similarityScore(requestedTopic, memory) };
    })
    .filter((candidate) => candidate.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);
}
