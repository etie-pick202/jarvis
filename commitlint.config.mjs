// Règle n°1 du dépôt : aucune mention d'IA dans les commits (voir CONTRIBUTING.md).
const AI_MENTION =
  /claude|anthropic|chatgpt|openai|copilot|gemini|codex|\bgpt\b|\bllm\b|\bIA\b|generated with|co-authored-by:[^\n]*\b(ai|llm|gpt)\b/i;

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "no-ai-mention": (parsed) => [
          !AI_MENTION.test(parsed.raw ?? ""),
          "Règle n°1 : aucune mention d'IA dans un commit (message, signature, Co-Authored-By).",
        ],
      },
    },
  ],
  rules: {
    "no-ai-mention": [2, "always"],
    "type-enum": [2, "always", ["feat", "fix", "refactor", "test", "docs", "chore", "ci", "perf"]],
    "scope-enum": [
      1,
      "always",
      [
        "auth",
        "catalogue",
        "stock",
        "ventes",
        "caisses",
        "livraisons",
        "services",
        "rapports",
        "documents",
        "notifications",
        "audit",
        "web",
        "api",
        "shared",
        "db",
        "infra",
        "deps",
      ],
    ],
    "subject-case": [0],
    "header-max-length": [2, "always", 100],
  },
};
