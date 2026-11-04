#!/usr/bin/env bash
# Show which stage each task is at. Run it from anywhere in the repo.
#
#   bash scripts/status.sh [--all]
#
# Nothing is written down by hand: the stage is read from git, from the same markers that
# scripts/stage.sh uses to find a branch.
#
#   drafted     the task file is in your working tree but not on origin/main yet (push it)
#   ready       the task file is on origin/main and no branch has a plan for it
#   built       an unmerged claude/* branch has <task>.plan.md and no report
#   verified    an unmerged claude/* branch has <task>.report.md; the script reads the
#               report for "no Blocking findings" and says whether a PR is open
#   merged      the plan and the report are both on origin/main (hidden unless --all)
#
# It only reads: it fetches remote refs and never touches your working tree.
# Blind spots: a builder shows up only after it has pushed its plan; the PR column needs
# `gh` signed in on this machine (without it the script just leaves the PR out); "verified"
# does not tell a first report from the report after a fix round, so read the branch name.
set -euo pipefail

all=0
for arg in "$@"; do
  case "$arg" in
    --all) all=1 ;;
    -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unrecognised argument: $arg" >&2; exit 2 ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"
git fetch -q origin main '+refs/heads/claude/*:refs/remotes/origin/claude/*'

# Names of the task files in a list of paths on stdin: docs/tasks/<slug>.md, minus the
# plan and report records and the files that are not tasks. A task slug is lowercase
# words joined by hyphens, so the uppercase guides (TEMPLATE.md, AUTHORING.md, any
# future one) never count; backlog.md and prompts.md are lowercase and named here.
slugs() {
  sed -n 's#^docs/tasks/\([^/]*\)\.md$#\1#p' \
    | grep -E '^[a-z0-9][a-z0-9-]*$' \
    | grep -v -E '^(backlog|prompts)$' || true
}

on_main="$(git ls-tree --name-only origin/main docs/tasks/ | slugs)"
local_only="$( (ls docs/tasks/*.md 2>/dev/null || true) | slugs | grep -v -x -F -f <(printf '%s\n' "$on_main") || true)"

# Unmerged claude/* branches, newest first.
branches=()
while IFS= read -r ref; do
  [ -n "$ref" ] || continue
  git merge-base --is-ancestor "$ref" origin/main 2>/dev/null && continue
  branches+=("$ref")
done < <(git for-each-ref --sort=-committerdate --format='%(refname:short)' refs/remotes/origin/claude/)

# Open PRs as "<head branch><TAB><number>", if gh works here.
prs=""
if command -v gh >/dev/null 2>&1; then
  prs="$(gh pr list --state open --json number,headRefName --jq '.[] | "\(.headRefName)\t\(.number)"' 2>/dev/null || true)"
fi

has() { git cat-file -e "$1:$2" 2>/dev/null; }

# report_clean REF PATH: succeeds when the report says there are no Blocking findings.
report_clean() {
  local text
  text="$(git show "$1:$2" 2>/dev/null || true)"
  if grep -qiE 'no blocking findings|blocking[^a-z]*none' <<<"$text"; then return 0; fi
  awk '/^#+[ ]*Blocking/ { f = 1; next } f && NF { ok = ($0 ~ /^None/); exit } END { exit ok ? 0 : 1 }' <<<"$text"
}

lines=()
merged=0
add() { lines+=("$(printf '%s\t%-26s %-34s %s' "$1" "$2" "$3" "$4")"); }

for task in $on_main; do
  plan="docs/tasks/$task.plan.md"
  report="docs/tasks/$task.report.md"
  stamp="$(git log --diff-filter=A --format=%ct origin/main -- "docs/tasks/$task.md" | tail -1)"
  stamp="${stamp:-0}"

  if has origin/main "$plan" && has origin/main "$report"; then
    merged=$((merged + 1))
    [ "$all" = 1 ] && add "$stamp" "$task" "merged" ""
    continue
  fi

  # The furthest branch: the newest one that has the report, else the newest with the plan.
  best=""
  for ref in ${branches[@]+"${branches[@]}"}; do
    if has "$ref" "$plan" && has "$ref" "$report"; then best="$ref"; break; fi
  done
  if [ -z "$best" ]; then
    for ref in ${branches[@]+"${branches[@]}"}; do
      if has "$ref" "$plan"; then best="$ref"; break; fi
    done
  fi
  short="${best#origin/}"

  if [ -z "$best" ]; then
    if has origin/main "$plan"; then
      add "$stamp" "$task" "on main, no report" "plan is on main without a report"
    else
      add "$stamp" "$task" "ready" "next: bash scripts/stage.sh builder TASK=$task"
    fi
  elif ! has "$best" "$report"; then
    add "$stamp" "$task" "built" "$short   next: bash scripts/stage.sh verify-1 TASK=$task"
  else
    pr="$(printf '%s\n' "$prs" | awk -F'\t' -v b="$short" '$1 == b { print $2 }')"
    if report_clean "$best" "$report"; then
      if [ -n "$pr" ]; then
        add "$stamp" "$task" "verified, clean, PR #$pr open" "$short   next: review and merge"
      else
        add "$stamp" "$task" "verified, clean, no PR seen" "$short   next: review, or open the PR"
      fi
    else
      add "$stamp" "$task" "verified, read the report" "$short   Blocking findings? next: bash scripts/stage.sh fix TASK=$task"
    fi
  fi
done

for task in $local_only; do
  add "9999999999" "$task" "drafted, not on main" "push docs/tasks/$task.md to main to use it"
done

printf '%-26s %-34s %s\n' TASK STAGE DETAIL
if [ "${#lines[@]}" -gt 0 ]; then
  printf '%s\n' "${lines[@]}" | sort -n | cut -f2-
else
  echo "(nothing in progress)"
fi
if [ "$all" = 0 ] && [ "$merged" -gt 0 ]; then
  echo
  echo "$merged merged (bash scripts/status.sh --all to list them)"
fi
