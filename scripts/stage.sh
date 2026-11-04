#!/usr/bin/env bash
# Start one stage of the agent chain as a cloud session. Run it from `main`.
#
#   bash scripts/stage.sh <stage> TASK=<slug> [NAME=value ...] [--dry-run]
#
# TASK is the task file's name without .md: TASK=save-a-url is docs/tasks/save-a-url.md.
# Every session starts from `main` as it is on GitHub; the prompt then tells the agent
# to move its own branch onto the branch it continues from. You never check that
# branch out. The branch name is found for you (see below) or given as NAME=value.
#
# Stages (see docs/tasks/prompts.md):
#   builder                                       nothing else needed
#   verify-1  [BUILDER_BRANCH=...]                found: the claude/* branch with <TASK>.plan.md and no report
#   fix       [VERIFIER_BRANCH=...] [ALREADY_FIXED=...]
#                                                 found: the claude/* branch with <TASK>.report.md
#   verify-2  [FIX_BRANCH=...]                    found the same way
#   draft     [FOCUS=...]                         no TASK: drafts task files (docs/tasks/AUTHORING.md)
#
# Finding a branch lists up to 5 unmerged claude/* branches, newest first, and asks you to
# confirm (Enter takes the first). It only reads remote refs; your working tree is not touched.
#
# The draft stage works on no existing task, so it takes no TASK. FOCUS names what to
# draft ("search UI", "everything frontend"); without it the session starts by choosing.
#
# --dry-run prints the filled prompt and does not start a session, so you can
# paste it into claude.ai/code instead.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dir="$root/docs/tasks/prompts"

stage="${1:-}"
[ -n "$stage" ] || { sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
shift
file="$dir/$stage.txt"
[ -f "$file" ] || { echo "unknown stage '$stage' (builder, verify-1, fix, verify-2, draft)" >&2; exit 2; }

dry=0
pairs=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry=1 ;;
    [A-Z_]*=*) pairs+=("$arg") ;;
    *) echo "unrecognised argument: $arg" >&2; exit 2 ;;
  esac
done

# value_of KEY prints the value given as KEY=value, or nothing.
value_of() {
  local p
  for p in ${pairs[@]+"${pairs[@]}"}; do
    [ "${p%%=*}" = "$1" ] && { printf '%s' "${p#*=}"; return 0; }
  done
  return 0
}

task="$(value_of TASK)"
if [ "$stage" != draft ]; then
  [ -n "$task" ] || { echo "TASK=<slug> is required" >&2; exit 2; }
  [ -f "$root/docs/tasks/$task.md" ] || { echo "no task file docs/tasks/$task.md" >&2; exit 2; }
fi

cd "$root"

# The session clones main from GitHub, so main must be what is pushed.
git fetch -q origin main
have="$(git rev-parse --abbrev-ref HEAD)"
if [ "$have" != main ]; then
  echo "run this from main (you are on '$have'): git checkout main" >&2
  [ "$dry" = 1 ] || exit 1
fi
if [ -n "$(git rev-list origin/main..HEAD 2>/dev/null)" ]; then
  echo "main has commits that are not on GitHub. Push them first: the cloud session cannot see them." >&2
  [ "$dry" = 1 ] || exit 1
fi

# pick_branch MARKER LACKING sets $chosen to a pushed, unmerged claude/* branch that
# contains the file MARKER and, when LACKING is given, does not contain that file.
chosen=""
pick_branch() {
  local marker="$1" lacking="$2" ref n=0 i choice
  local found=()
  git fetch -q origin '+refs/heads/claude/*:refs/remotes/origin/claude/*'
  while IFS= read -r ref; do
    [ -n "$ref" ] || continue
    git merge-base --is-ancestor "$ref" origin/main 2>/dev/null && continue
    git cat-file -e "$ref:$marker" 2>/dev/null || continue
    if [ -n "$lacking" ] && git cat-file -e "$ref:$lacking" 2>/dev/null; then continue; fi
    found+=("$ref")
    n=$((n + 1))
    [ "$n" -ge 5 ] && break
  done < <(git for-each-ref --sort=-committerdate --format='%(refname:short)' refs/remotes/origin/claude/)

  if [ "$n" -eq 0 ]; then
    echo "no unmerged claude/* branch has $marker${lacking:+ without $lacking}. Pass the branch as NAME=value." >&2
    exit 2
  fi
  echo "Branches with $marker${lacking:+ and no $lacking}, newest first:" >&2
  i=0
  for ref in "${found[@]}"; do
    i=$((i + 1))
    echo "  $i) ${ref#origin/}   $(git log -1 --format='%h  %cr  %s' "$ref")" >&2
  done
  choice=1
  if [ -t 0 ]; then
    read -r -p "Use which? [1] " choice || true
    choice="${choice:-1}"
  elif [ "$n" -gt 1 ]; then
    echo "more than one candidate and no terminal to ask on. Pass the branch as NAME=value." >&2
    exit 2
  fi
  case "$choice" in
    ''|*[!0-9]*) echo "not a number: $choice" >&2; exit 2 ;;
  esac
  [ "$choice" -ge 1 ] && [ "$choice" -le "$n" ] || { echo "no such choice: $choice" >&2; exit 2; }
  chosen="${found[$((choice - 1))]#origin/}"
}

plan="docs/tasks/$task.plan.md"
report="docs/tasks/$task.report.md"
case "$stage" in
  verify-1)
    if [ -z "$(value_of BUILDER_BRANCH)" ]; then pick_branch "$plan" "$report"; pairs+=("BUILDER_BRANCH=$chosen"); fi ;;
  fix)
    if [ -z "$(value_of VERIFIER_BRANCH)" ]; then pick_branch "$report" ""; pairs+=("VERIFIER_BRANCH=$chosen"); fi
    if [ -z "$(value_of ALREADY_FIXED)" ]; then pairs+=("ALREADY_FIXED=nothing"); fi ;;
  verify-2)
    if [ -z "$(value_of FIX_BRANCH)" ]; then pick_branch "$report" ""; pairs+=("FIX_BRANCH=$chosen"); fi
    ;;
  draft)
    if [ -z "$(value_of FOCUS)" ]; then pairs+=("FOCUS=nothing named: start with Phase 0 and propose a plan"); fi ;;
esac

prompt="$(cat "$file")"
for pair in ${pairs[@]+"${pairs[@]}"}; do
  key="${pair%%=*}"; val="${pair#*=}"
  # Not ${prompt//<$key>/$val}: bash 5.2 reads a "&" in $val as the matched text.
  out=""; rest="$prompt"
  while [[ "$rest" == *"<$key>"* ]]; do
    out+="${rest%%"<$key>"*}$val"
    rest="${rest#*"<$key>"}"
  done
  prompt="$out$rest"
done

missing="$(printf '%s' "$prompt" | grep -o '<[A-Z_]\{3,\}>' | sort -u | tr '\n' ' ' || true)"
if [ -n "$missing" ]; then
  echo "missing values for: $missing" >&2
  exit 2
fi

if [ "$dry" = 1 ]; then
  printf '%s\n' "$prompt"
  exit 0
fi

exec claude --remote "$prompt"
