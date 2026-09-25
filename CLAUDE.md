# CLAUDE.md

As instruções para agentes deste projeto ficam em `AGENTS.md`, a fonte única.
O import abaixo faz o Claude Code carregar o mesmo conteúdo sem duplicação.
Edite apenas `AGENTS.md`.

@AGENTS.md

## Skills no Claude Code

As skills do projeto ficam em `.agents/skills`, e `.claude/skills` é ignorada
pelo Git porque costuma guardar skills pessoais ou de marketplace. Para o
Claude Code enxergar as skills do projeto sem copiá-las, crie um link para cada
uma:

```bash
mkdir -p .claude/skills
for d in .agents/skills/*/; do
  name=$(basename "$d")
  [ -e ".claude/skills/$name" ] || ln -s "../../.agents/skills/$name" ".claude/skills/$name"
done
```

Rode de novo quando uma skill for adicionada ao projeto. Se uma skill do
projeto já estiver copiada em `.claude/skills`, apague a cópia antes para
trocá-la pelo link.
