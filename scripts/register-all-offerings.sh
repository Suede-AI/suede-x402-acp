#!/usr/bin/env bash
# Register all 19 Producer ACP offerings on Virtuals marketplace.
# Run after `acp login` (interactive browser auth) succeeds.
# Skips offerings that are already listed; logs failures without aborting.
#
# Usage:
#   cd ~/producer-agent
#   ./bin/acp.ts login                    # interactive browser auth
#   ./scripts/register-all-offerings.sh   # this script
#
# Virtuals upstream was 504-ing on 2026-05-24 — if any of the below errors
# with a 5xx, wait 2-5 minutes and re-run. The script re-checks `sell list`
# state first and only attempts new registrations.

set -uo pipefail
cd "$(dirname "$0")/.."

ACP="./bin/acp.ts"
FAILED=()
SKIPPED=()
REGISTERED=()

OFFERINGS=(
  acapella_extract
  audio_stems_separation
  general_video
  ip_attestation_check
  lyric_sync_timestamps
  lyrics_generation
  meme_video
  midi_transcription
  original_music_track
  product_showcase_video
  product_showcase_video_10s
  stems_basic_2track
  stems_pro_4track
  style_coach
  suede_continue
  suede_cover
  suede_extend
  suede_voice_cover
  wav_mastering
)

echo "Producer ACP registration — 19 offerings"
echo "Active agent (from config.json):"
jq -r '.agents[] | select(.active == true) | "  name: \(.name)\n  wallet: \(.walletAddress)\n  id: \(.id)"' config.json
echo ""

# Snapshot current state so we don't double-register.
LISTED_JSON=$($ACP sell list --json 2>/dev/null || echo "[]")
ALREADY_LISTED=$(echo "$LISTED_JSON" | jq -r '.[] | select(.listed == true) | .name' 2>/dev/null || echo "")

for name in "${OFFERINGS[@]}"; do
  if echo "$ALREADY_LISTED" | grep -qx "$name"; then
    echo "SKIP  $name (already listed)"
    SKIPPED+=("$name")
    continue
  fi
  echo "→     $name ..."
  if $ACP sell create "$name" --json 2>&1 | tee /tmp/acp-create-"$name".log | grep -qE '"error"|status.+5[0-9]{2}'; then
    echo "FAIL  $name — see /tmp/acp-create-$name.log"
    FAILED+=("$name")
  else
    echo "OK    $name"
    REGISTERED+=("$name")
  fi
  # Backoff between calls so we don't hammer Virtuals.
  sleep 1
done

echo ""
echo "=== summary ==="
echo "registered: ${#REGISTERED[@]} / 19"
echo "skipped:    ${#SKIPPED[@]} (already listed)"
echo "failed:     ${#FAILED[@]}"
if [ "${#FAILED[@]}" -gt 0 ]; then
  printf '  - %s\n' "${FAILED[@]}"
  echo ""
  echo "Re-run this script after waiting 2-5 minutes if failures look like 5xx upstream errors."
  exit 1
fi

echo ""
echo "Next: start the seller runtime to accept jobs"
echo "  $ACP serve start"
echo ""
echo "Then verify with:"
echo "  $ACP sell list --json | jq -r '.[] | select(.listed == true) | .name'"
echo "  $ACP serve status"
