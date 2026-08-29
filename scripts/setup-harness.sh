#!/usr/bin/env bash
#
# Configure a local TrueForge harness for Upstream Watch, entirely from the terminal.
#
# This is the TrueForge quickstart's seven browser steps done over its REST API. It is
# idempotent: every step checks first and skips what already exists, so it is safe to
# re-run after adding a missing key.
#
#   ./scripts/setup-harness.sh
#
# Reads from .env (never printed):
#   OPENAI_API_KEY / ANTHROPIC_API_KEY   step 2 — model provider
#   DAYTONA_API_KEY                      step 5 — sandbox. Create at
#                                        https://app.daytona.io/dashboard/keys with the
#                                        write:sandboxes and delete:sandboxes scopes.
# GitHub (step 3) uses `gh auth token`; the connector is header-PAT, not OAuth.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="${TRUEFORGE_URL:-http://localhost:8790}/api/v1"
REPO_URL="${REPO_URL:-https://github.com/Kush614/upstream-watch}"
SKILL_REF="${SKILL_REF:-main}"
AGENT_NAME="upstream-watch"
SKILL_NAME="brightdata-changelog-scraper"

[ -f "$ROOT/.env" ] && set -a && . "$ROOT/.env" && set +a

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
skip() { printf '  \033[90m·\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }

# Prefer IPv6 loopback: TrueForge binds [::1], and `localhost` may resolve to 127.0.0.1.
api() { curl -s -m 60 "${API//localhost/[::1]}$1" "${@:2}"; }
code() { api "$1" -o /dev/null -w '%{http_code}' "${@:2}"; }
count() { api "$1" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d.get('data',[])) if 'data' in d else 0)" 2>/dev/null || echo 0; }

echo
echo "TrueForge setup — $API"
echo

# ── 1. harness reachable ─────────────────────────────────────────────────────
if [ "$(code /capabilities)" = "200" ]; then
  ok "step 1: harness reachable"
else
  warn "step 1: harness not reachable. Start it with:  npx @truefoundry/trueforge"
  exit 1
fi

# ── 2. model provider ────────────────────────────────────────────────────────
if [ "$(count /settings/model-providers)" -gt 0 ]; then
  skip "step 2: model provider already configured"
elif [ -n "${OPENAI_API_KEY:-}" ] || [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  # Build the manifest from the harness's own preset models so the properties are valid.
  python3 - "$API" > /tmp/uw-mp.json <<'PY'
import json, os, sys, urllib.request
api = sys.argv[1].replace("localhost", "[::1]")
provider = "openai" if os.environ.get("OPENAI_API_KEY") else "anthropic"
key = os.environ.get("OPENAI_API_KEY") or os.environ["ANTHROPIC_API_KEY"]
cat = json.load(urllib.request.urlopen(f"{api}/catalogs/model-providers", timeout=15))
preset = next(p for p in cat["data"] if p.get("type") == provider)
print(json.dumps({"manifest": {"type": provider, "auth": {"api_key": key},
                               "models": preset["models"][:3]}}))
PY
  if [ "$(code /settings/model-providers -X POST -H 'content-type: application/json' --data-binary @/tmp/uw-mp.json)" = "201" ]; then
    ok "step 2: model provider configured"
  else
    warn "step 2: model provider request rejected"
  fi
  rm -f /tmp/uw-mp.json
else
  warn "step 2: no OPENAI_API_KEY or ANTHROPIC_API_KEY in .env — the agent cannot run without one"
fi

# ── 3. GitHub connector ──────────────────────────────────────────────────────
if [ "$(count /settings/mcp-servers)" -gt 0 ]; then
  skip "step 3: MCP connector already configured"
elif command -v gh >/dev/null && gh auth token >/dev/null 2>&1; then
  python3 - > /tmp/uw-mcp.json <<'PY'
import json, subprocess
tok = subprocess.check_output(["gh", "auth", "token"], text=True).strip()
print(json.dumps({"manifest": {
    "type": "remote", "name": "github", "url": "https://api.githubcopilot.com/mcp/",
    "description": "GitHub MCP server: branches, pull requests, reviews, merges.",
    "auth": {"type": "header", "headers": {"Authorization": f"Bearer {tok}"}}}}))
PY
  if [ "$(code /settings/mcp-servers -X POST -H 'content-type: application/json' --data-binary @/tmp/uw-mcp.json)" = "201" ]; then
    ok "step 3: GitHub connector configured (header PAT via gh auth token)"
  else
    warn "step 3: GitHub connector request rejected"
  fi
  rm -f /tmp/uw-mcp.json
else
  warn "step 3: gh not authenticated — run \`gh auth login\`"
fi

# ── 4. skill ─────────────────────────────────────────────────────────────────
if [ "$(count /settings/skills)" -gt 0 ]; then
  skip "step 4: skill already registered"
else
  DESC=$(python3 -c "
import re,sys
s=open('$ROOT/skills/$SKILL_NAME/SKILL.md').read()
print(re.search(r'^description:\s*(.+)$', s, re.M).group(1))")
  python3 - "$SKILL_NAME" "$REPO_URL" "$SKILL_REF" "$DESC" > /tmp/uw-skill.json <<'PY'
import json, sys
name, url, ref, desc = sys.argv[1:5]
print(json.dumps({"manifest": {"type": "git", "name": name, "url": url,
                               "path": f"skills/{name}", "ref": ref, "description": desc}}))
PY
  if [ "$(code /settings/skills -X POST -H 'content-type: application/json' --data-binary @/tmp/uw-skill.json)" = "201" ]; then
    ok "step 4: skill registered from $REPO_URL@$SKILL_REF"
  else
    warn "step 4: skill request rejected (is $SKILL_REF pushed?)"
  fi
  rm -f /tmp/uw-skill.json
fi

# ── 5. sandbox ───────────────────────────────────────────────────────────────
if api /settings/sandbox-providers | grep -q '"type"'; then
  skip "step 5: sandbox provider already configured"
elif [ -n "${DAYTONA_API_KEY:-}" ]; then
  # SandboxProviderManifest: the key lives under auth, and the four interval fields are
  # all required — so take them from the harness's own catalog rather than inventing them.
  python3 - "$API" > /tmp/uw-sb.json <<'PY'
import json, os, sys, urllib.request
api = sys.argv[1].replace("localhost", "[::1]")
cat = json.load(urllib.request.urlopen(f"{api}/catalogs/sandbox-providers", timeout=15))
preset = next(p for p in cat["data"] if p.get("type") == "daytona")
manifest = {**preset, "auth": {"api_key": os.environ["DAYTONA_API_KEY"]}}
print(json.dumps({"manifest": manifest}))
PY
  if [ "$(code /settings/sandbox-providers -X PUT -H 'content-type: application/json' --data-binary @/tmp/uw-sb.json)" = "200" ]; then
    ok "step 5: Daytona sandbox configured"
  else
    warn "step 5: Daytona request rejected"
  fi
  rm -f /tmp/uw-sb.json
else
  warn "step 5: no DAYTONA_API_KEY in .env"
  warn "        the LOCAL sandbox cannot run this project: it denies /Library/Developer"
  warn "        (so git-backed skills fail) and refuses host binaries (so pnpm is"
  warn "        'Operation not permitted'). See NOTES.md 2026-08-30."
fi

# ── 6 + 7. compose and save the agent ────────────────────────────────────────
MODEL=$(api /models | python3 -c "import json,sys;d=json.load(sys.stdin)['data'];print(d[-1]['name'] if d else '')" 2>/dev/null || true)

if [ "$(count /agents)" -gt 0 ]; then
  skip "step 6+7: agent '$AGENT_NAME' already saved"
elif [ -n "$MODEL" ]; then
  python3 - "$MODEL" "$ROOT" "$SKILL_NAME" > /tmp/uw-agent.json <<'PY'
import json, sys
model, root, skill = sys.argv[1:4]
print(json.dumps({"name": "upstream-watch", "manifest": {
    "model": {"name": model},
    "instructions": open(f"{root}/agent/prompts/orchestrator.md").read(),
    # Gate the merge BY NAME. Opening a PR is reversible and stays ungated, so the agent
    # does its work and stops only at the irreversible step (specs/agent.md §Approval).
    "mcp_servers": [{"name": "github", "require_approval_for_tools": ["merge_pull_request"]}],
    "skills": [{"name": skill}],
    "config": {"sandbox": {"enabled": True}, "dynamic_sub_agents": {"enabled": True}}}}))
PY
  if [ "$(code /agents -X POST -H 'content-type: application/json' --data-binary @/tmp/uw-agent.json)" = "201" ]; then
    ok "step 6+7: agent '$AGENT_NAME' saved on $MODEL, merge_pull_request gated"
  else
    warn "step 6+7: agent request rejected"
  fi
  rm -f /tmp/uw-agent.json
else
  warn "step 6+7: no model available — configure step 2 first"
fi

echo
echo "Open http://localhost:8790 and start a session with '$AGENT_NAME', or:"
echo "  curl -X POST $API/sessions -H 'content-type: application/json' \\"
echo "    -d '{\"agent\":{\"name\":\"$AGENT_NAME\"}}'"
echo
