export const jsonBodyLimit = "2mb";
export const formBodyLimit = "128kb";

export const fieldLimits = {
  email: 254,
  password: 256,
  siteName: 120,
  wordpressUrl: 2048,
  wordpressUsername: 200,
  wordpressApplicationPassword: 512,
  market: 20,
  language: 2,
  writingStandard: 10_000,
  gscProperty: 512,
  gscServiceAccountJson: 20_000,
  topic: 300,
  bulkTopics: 20_000,
  contentGoal: 1_000,
  audience: 1_000,
  searchIntent: 200,
  title: 300,
  draftHtml: 1_000_000,
  metaDescription: 320,
  category: 120,
  imageAlt: 300,
  tag: 80,
  tags: 20,
  publishTime: 5
} as const;
