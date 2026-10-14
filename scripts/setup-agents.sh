#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -L .agents ]]; then
  printf 'ERROR: .agents must be a real directory, not a symlink.\n' >&2
  exit 1
fi

mkdir -p .agents/instructions .agents/prompts .github .codex .claude

if [[ -L .agents/skills ]]; then
  printf 'ERROR: .agents/skills must be a real directory, not a symlink.\n' >&2
  exit 1
fi
mkdir -p .agents/skills

merge_directory() {
  local source="$1"
  local destination="$2"
  local entry
  local name

  if [[ -L "$source" ]]; then
    return
  fi
  if [[ ! -d "$source" ]]; then
    if [[ -e "$source" ]]; then
      printf 'ERROR: %s exists and is not a directory or symlink.\n' "$source" >&2
      return 1
    fi
    return
  fi

  while IFS= read -r -d '' entry; do
    name="${entry##*/}"
    if [[ -e "$destination/$name" || -L "$destination/$name" ]]; then
      printf 'ERROR: name conflict while moving %s into %s: %s\n' \
        "$source" "$destination" "$name" >&2
      return 1
    fi
  done < <(find "$source" -mindepth 1 -maxdepth 1 -print0)

  while IFS= read -r -d '' entry; do
    name="${entry##*/}"
    mv "$entry" "$destination/$name"
  done < <(find "$source" -mindepth 1 -maxdepth 1 -print0)
  rmdir "$source"
}

ensure_link() {
  local path="$1"
  local target="$2"

  if [[ -d "$path" && ! -L "$path" ]]; then
    merge_directory "$path" "${target#../}"
  elif [[ -e "$path" && ! -L "$path" ]]; then
    printf 'ERROR: %s exists and is not a symlink or directory.\n' "$path" >&2
    return 1
  fi

  ln -sfn "$target" "$path"
}

ensure_link .github/instructions ../.agents/instructions
ensure_link .github/prompts ../.agents/prompts
ensure_link .github/skills ../.agents/skills
ensure_link .codex/skills ../.agents/skills
ensure_link .claude/skills ../.agents/skills
