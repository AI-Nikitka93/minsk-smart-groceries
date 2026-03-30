# Execution Plan

Status legend: `TODO | IN_PROGRESS | DONE | BLOCKED | CANCELLED`

1. `DONE` Create project memory, root execution anchor, and baseline project map.
2. `DONE` Research current free-tier hosting, DB, and LLM options for 24/7 operation.
3. `DONE` Produce architecture document with layers, modules, Mermaid diagram, and NFRs.
4. `DONE` Align project memory with architecture decisions and next implementation step.
5. `DONE` Validate there are no unresolved blockers for engineering handoff.
6. `DONE` Implement live-validated store parser adapters and endpoint map for Green, Edostavka, Gippo, and Emall.
7. `DONE` Wrap parser adapters into parser-worker services, env config, and persistence pipeline.
8. `TODO` Add Wrangler config, local scheduled smoke test, and promo-candidate/publish-log write-path.
9. `DONE` Implement Telegram bot-worker webhook with Turso search, native Telegram Bot API calls, and Groq-backed assistant replies.
10. `BLOCKED` Stabilize `bot-worker` product intelligence: exact-match cheapest lookup, profile-only confirmations, sensible basket assembly, Telegram send fallback, and planner contract validation.
13. `IN_PROGRESS` Execute Stabilization Sprint: separate profile updates from search, add exact-match gates, add Markdown-to-plain-text retry, and ensure final replies are synthesized by Groq after tool execution instead of leaking deterministic fallback text.
14. `TODO` Harden the new tool-contract layer for agentic actions (`save_user_profile`, `search_products`, `find_cheapest_offer`, `build_budget_basket`, `analyze_composition`) with stronger validation, cleaner tool payloads, and live-proof of response quality.
15. `TODO` Improve read-model coverage for staple commodity terms (`масло`, `молоко`, `гречка`, `торт`, `хлеб`, `яйца`).
16. `TODO` Translate the world-class market roadmap into delivery: basket engine v2, category read-models, health/composition scoring, household memory, and standing intents.
11. `DONE` Publish the codebase as a public GitHub repository with Apache-2.0 license and bilingual README files.
12. `DONE` Add deploy scaffolding for Cloudflare bot-worker and GitHub Actions parser-worker execution.
