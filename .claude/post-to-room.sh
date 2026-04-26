#!/usr/bin/env bash
# Mirror Claude Code prompts/responses into o-agent-chat room.
# Mode: "user" (UserPromptSubmit) or "assistant" (Stop)
# Fire-and-forget; never blocks the Claude flow.

set -u
MODE="${1:-user}"
ROOM_URL="http://localhost:8787/api/message"
INPUT="$(cat 2>/dev/null || true)"

extract_text() {
  case "$MODE" in
    user)
      printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null
      ;;
    assistant)
      local transcript
      transcript="$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)"
      [ -z "$transcript" ] || [ ! -f "$transcript" ] && return
      # last assistant message: scan from end for type=assistant, join text blocks
      tac "$transcript" 2>/dev/null | awk '
        BEGIN { found = 0 }
        /"type":"assistant"/ { print; exit }
      ' | jq -r '
        .message.content
        | map(select(.type == "text") | .text)
        | join("\n")
        // empty
      ' 2>/dev/null
      ;;
  esac
}

filter_secrets() {
  sed -E \
    -e 's/sk-ant-[A-Za-z0-9_-]{20,}/[REDACTED_ANTHROPIC]/g' \
    -e 's/AKIA[0-9A-Z]{16}/[REDACTED_AWS]/g' \
    -e 's/eyJ[A-Za-z0-9._-]{20,}/[REDACTED_JWT]/g' \
    -e 's/ghp_[A-Za-z0-9]{30,}/[REDACTED_GH]/g' \
    -e 's/xox[baprs]-[A-Za-z0-9-]{20,}/[REDACTED_SLACK]/g'
}

TEXT="$(extract_text | filter_secrets)"
[ -z "$TEXT" ] && exit 0

case "$MODE" in
  user)    SENDER="Boss" ;;
  assistant) SENDER="Code" ;;
  *) exit 0 ;;
esac

# Truncate to 4000 chars to be safe
TEXT="${TEXT:0:4000}"

# Fire-and-forget POST; never block
PAYLOAD="$(jq -nc --arg s "$SENDER" --arg t "$TEXT" '{sender:$s,text:$t}')"
( curl -s --max-time 2 -X POST "$ROOM_URL" \
    -H 'Content-Type: application/json' \
    -d "$PAYLOAD" >/dev/null 2>&1 || true ) &
disown 2>/dev/null || true
exit 0
