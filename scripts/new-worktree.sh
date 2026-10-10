#!/usr/bin/env sh

# Creates a worktree in .worktrees/<name>, ready to work in.
#
# Usage:
#   scripts/new-worktree.sh <branch> [--base <ref>] [--no-install]
#
# Example:
#   scripts/new-worktree.sh feat/units-cnes
#
# The worktree is named after the branch without its prefix (feat/units-cnes
# becomes .worktrees/units-cnes) and starts from origin/main unless --base says
# otherwise. Besides `git worktree add`, it:
#   - installs the dependencies, because the Git hooks and the tests need
#     node_modules;
#   - recreates the .claude/skills links, which Git ignores;
#   - copies .env from the main checkout when there is one (Git ignores it too).
#
# It never runs git add, git commit or git push. Local changes of the checkout
# it is run from do not move to the new worktree. What goes into a commit and
# into a push is decided by whoever works there, and anything outside the scope
# of the task is committed and pushed only when that is asked for explicitly.

set -eu

usage() {
  cat <<'EOF'
Uso: scripts/new-worktree.sh <branch> [--base <ref>] [--no-install]

Cria .worktrees/<nome> com uma branch nova, a partir de origin/main (ou de
--base), instala as dependências, recria os links de .claude/skills e copia o
.env, se existir. O nome é a branch sem o prefixo: feat/units-cnes vira
.worktrees/units-cnes.

  --base <ref>    ponto de partida da branch (padrão: origin/main)
  --no-install    não roda pnpm install --frozen-lockfile
  -h, --help      mostra esta ajuda

O script não faz git add, commit nem push.
EOF
}

die() {
  echo "Erro: $1" >&2
  exit 1
}

branch=""
base="origin/main"
install=1

while [ $# -gt 0 ]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    --no-install)
      install=0
      ;;
    --base)
      [ $# -ge 2 ] || die "--base precisa de uma referência."
      base=$2
      shift
      ;;
    -*)
      die "opção desconhecida: $1"
      ;;
    *)
      [ -z "$branch" ] || die "informe uma única branch."
      branch=$1
      ;;
  esac
  shift
done

if [ -z "$branch" ]; then
  usage >&2
  exit 1
fi

git rev-parse --git-dir >/dev/null 2>&1 || die "execute dentro do repositório."
git check-ref-format --branch "$branch" >/dev/null 2>&1 \
  || die "nome de branch inválido: $branch"

# The first entry of the list is always the main checkout, wherever this runs.
main_root=$(git worktree list --porcelain | sed -n 's/^worktree //p' | head -n 1)

name=${branch#*/}
name=$(printf '%s' "$name" | tr '/' '-')
printf '%s' "$name" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]*$' \
  || die "não consegui derivar um nome de pasta de $branch."

target="$main_root/.worktrees/$name"
[ ! -e "$target" ] || die ".worktrees/$name já existe."
if git show-ref --verify --quiet "refs/heads/$branch"; then
  die "a branch $branch já existe. Para usá-la: git worktree add .worktrees/$name $branch"
fi

case "$base" in
  origin/*)
    echo "Atualizando $base..."
    git fetch --quiet origin "${base#origin/}" \
      || die "não consegui atualizar $base. Confira o nome ou use --base com uma referência local."
    ;;
esac
git rev-parse --verify --quiet "$base^{commit}" >/dev/null \
  || die "referência inexistente: $base"

# Counted before the worktree exists, to say what stays behind.
local_changes=$(git status --porcelain | wc -l | tr -d ' ')

git worktree add --quiet -b "$branch" "$target" "$base"
# The branch is created from a remote-tracking ref, which would make a plain
# `git push` aim at it. The first push is explicit: git push -u origin HEAD.
git -C "$target" branch --unset-upstream "$branch" 2>/dev/null || true

if [ -d "$target/.agents/skills" ]; then
  mkdir -p "$target/.claude/skills"
  for dir in "$target"/.agents/skills/*/; do
    [ -d "$dir" ] || continue
    skill=$(basename "$dir")
    if [ ! -e "$target/.claude/skills/$skill" ]; then
      ln -s "../../.agents/skills/$skill" "$target/.claude/skills/$skill"
    fi
  done
fi

env_copied=0
if [ -f "$main_root/.env" ] && [ ! -e "$target/.env" ]; then
  cp "$main_root/.env" "$target/.env"
  env_copied=1
fi

if [ "$install" -eq 1 ]; then
  if command -v pnpm >/dev/null 2>&1; then
    echo "Instalando dependências..."
    (cd "$target" && pnpm install --frozen-lockfile) \
      || echo "Aviso: o pnpm install falhou. Rode-o em .worktrees/$name antes de commitar." >&2
  else
    echo "Aviso: pnpm não encontrado. Instale as dependências em .worktrees/$name antes de commitar." >&2
  fi
fi

echo
echo "Worktree pronta: .worktrees/$name"
echo "  branch: $branch (a partir de $base)"
echo "  entrar: cd $target"
[ "$env_copied" -eq 0 ] || echo "  .env copiado da checkout principal (ignorado pelo Git)."
echo
echo "Lembretes:"
if [ "$local_changes" -gt 0 ]; then
  echo "  - A checkout atual tem $local_changes alteração(ões) local(is) não commitada(s). Elas não foram trazidas."
else
  echo "  - A worktree parte de $base. Alterações locais de outras checkouts não vêm junto."
fi
echo "  - Nada foi adicionado, commitado nem enviado. Arquivos fora do escopo da tarefa"
echo "    só entram em commit e push quando isso for pedido de forma explícita."
echo "    Adicione por caminho (git add <arquivo>); evite git add -A, git add . e git commit -a."
echo "  - Primeiro envio: git push -u origin HEAD"
echo "  - Ao terminar: git worktree remove .worktrees/$name && git worktree prune"
