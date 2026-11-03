#!/usr/bin/env bash
# Start one stage of the agent chain as a cloud session.
#
#   bash scripts/stage.sh <stage> TASK=<slug> [NAME=value ...] [--dry-run]
#
# TASK is the task file's name without .md: TASK=save-a-url is docs/tasks/save-a-url.md.
# Stages and the other placeholders they need (see docs/tasks/prompts.md):
#   builder                                  base branch: main
#   verify-1  BUILDER_BRANCH=...             base branch: the builder's branch
#   fix       VERIFIER_BRANCH=... [ALREADY_FIXED=...]
#   verify-2  FIX_BRANCH=... PR_NUMBER=...
#
# --dry-run prints the filled prompt and does not start a session, so you can
# paste it into claude.ai/code instead.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dir="$root/docs/tasks/prompts"

stage="${1:-}"
[ -n "$stage" ] || { sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
shift
file="$dir/$stage.txt"
[ -f "$file" ] || { echo "unknown stage '$stage' (builder, verify-1, fix, verify-2)" >&2; exit 2; }

dry=0
declare -a pairs=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry=1 ;;
    [A-Z_]*=*) pairs+=("$arg") ;;
    *) echo "unrecognised argument: $arg" >&2; exit 2 ;;
  esac
done

prompt="$(cat "$file")"
# ALREADY_FIXED is optional.
if [ "$stage" = fix ]; then
  case " ${pairs[*]:-} " in *" ALREADY_FIXED="*) ;; *) pairs+=("ALREADY_FIXED=nothing") ;; esac
fi
for pair in "${pairs[@]:-}"; do
  [ -n "$pair" ] || continue
  key="${pair%%=*}"; val="${pair#*=}"
  prompt="${prompt//<$key>/$val}"
done

missing="$(printf '%s' "$prompt" | grep -o '<[A-Z_]\{3,\}>' | sort -u | tr '\n' ' ' || true)"
if [ -n "$missing" ]; then
  echo "missing values for: $missing" >&2
  exit 2
fi

# The session starts from the branch you are on, so check it is the right one.
case "$stage" in
  builder)  want=main ;;
  verify-1) want="$(printf '%s' "$prompt" | sed -n 's/.*[Ff]etch and check out branch \([^ ,.]*\).*/\1/p' | head -1)" ;;
  fix)      want="$(printf '%s' "$prompt" | sed -n 's/.*Check out \([^ ]*\) and work.*/\1/p' | head -1)" ;;
  verify-2) want="$(printf '%s' "$prompt" | sed -n 's/.*Check out \([^ ]*\) and work.*/\1/p' | head -1)" ;;
esac
have="$(git -C "$root" rev-parse --abbrev-ref HEAD)"
if [ -n "$want" ] && [ "$have" != "$want" ]; then
  echo "you are on '$have' but this stage should start from '$want'." >&2
  echo "run: git checkout $want" >&2
  [ "$dry" = 1 ] || exit 1
fi

if [ "$dry" = 1 ]; then
  printf '%s\n' "$prompt"
  exit 0
fi

cd "$root"
exec claude --remote "$prompt"
