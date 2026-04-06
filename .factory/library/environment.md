# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Required Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | For LLM features | — | OpenRouter API key (recommended provider) |
| `ANTHROPIC_API_KEY` | Alternative | — | Anthropic Claude API key |
| `OPENAI_API_KEY` | Alternative | — | OpenAI API key |
| `BROPILOT_API` | No | `true` | Set `false` to disable API server |
| `BROPILOT_API_PORT` | No | `4000` | API server port |
| `BROPILOT_BACKEND` | No | `local` | Backend mode: `local` (Elixir) or `cloud` (future CF Workers) |

## LLM Provider Priority

OpenRouter → Anthropic → OpenAI → Mock (fallback). Detection is by env var presence.

## External Dependencies

- **Elixir 1.19+** / **OTP 27+**
- **Node.js 20+** (for Astro web UI)
- **cloudflared** (optional, for remote tunnel access)
- **qrencode** (optional, for QR code generation)

## Elixir Dependencies (mix.exs)

yaml_elixir ~> 2.11, jason ~> 1.4, req ~> 0.5, bandit ~> 1.6, plug ~> 1.16, corsica ~> 2.1

## Web Dependencies (web/package.json)

astro, @astrojs/node, @astrojs/alpinejs, alpinejs, js-yaml, nanostores, @nanostores/persistent

## Notes

- The mock LLM provider returns hardcoded data — no API key needed for development/testing
- `mix test` disables the API server automatically (Mix.env() == :test check in Application)
- The API server binds to 0.0.0.0 (all interfaces) when started
