# Deploy na DigitalOcean

A produção do FilaSaúde usa um único Droplet e três containers:

- Caddy recebe o tráfego público, emite certificados TLS e encaminha as
  requisições;
- o frontend é servido por Nginx em uma rede interna do Compose;
- a API NestJS fica disponível externamente pelo prefixo `/api`.

As imagens são publicadas no GitHub Container Registry (GHCR). O servidor não
compila o projeto: ele apenas baixa imagens identificadas pelo SHA do commit.

## 1. Provisionar a infraestrutura

Instale Terraform 1.8 ou superior e copie o exemplo de variáveis:

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

Crie um token de API da DigitalOcean e disponibilize-o apenas na sessão do
terminal:

```bash
export DIGITALOCEAN_TOKEN="..."
terraform init
terraform plan -out=production.tfplan
terraform apply production.tfplan
```

O módulo cria o usuário `deploy`, instala Docker e reserva `/opt/filasaude`
para os arquivos da aplicação. Aguarde a conclusão do cloud-init antes do
primeiro deploy:

```bash
ssh deploy@IP_DO_DROPLET cloud-init status --wait
```

## 2. Configurar DNS

Se `domain_name` for informado ao Terraform, o domínio deve estar delegado aos
nameservers da DigitalOcean. Se o DNS estiver em outro provedor, deixe a
variável nula e crie manualmente um registro A apontando o domínio da aplicação
para o output `reserved_ip`.

O Caddy só consegue emitir o certificado depois que o DNS público resolve para
o Droplet e as portas 80 e 443 estão acessíveis.

## 3. Configurar o ambiente do GitHub

Crie um environment chamado `production` nas configurações do repositório e
adicione os secrets:

| Secret | Conteúdo |
| --- | --- |
| `DROPLET_HOST` | IP reservado retornado pelo Terraform |
| `DEPLOY_SSH_KEY` | Chave SSH privada correspondente à chave pública do Terraform |
| `DROPLET_KNOWN_HOSTS` | Linha de host key confiável do servidor |
| `APP_DOMAIN` | Domínio completo, sem protocolo |
| `ACME_EMAIL` | E-mail usado na emissão dos certificados TLS |

Crie também a variável de Actions `DEPLOY_ENABLED` com o valor `true` somente
depois que o Droplet, o DNS e todos os secrets estiverem prontos. Enquanto ela
não existir, a CI publica as imagens, mas não tenta acessar um servidor ainda
inexistente.

Confirme a fingerprint do host por um canal confiável antes de salvar
`DROPLET_KNOWN_HOSTS`. Depois da confirmação, a linha pode ser coletada com:

```bash
ssh-keyscan -H IP_DO_DROPLET
```

Se desejar aprovação manual antes de cada deploy, configure required reviewers
no environment `production`.

O exemplo do Terraform mantém a porta 22 acessível porque runners hospedados do
GitHub não têm IP de saída fixo. O servidor aceita somente autenticação por
chave e não permite login de root. Para restringir também a origem da conexão,
use um runner com IP fixo e atualize `ssh_allowed_cidrs`.

## 4. Publicação e rollback

Pull requests executam lint, typecheck, testes, build, validação do Terraform e
build das imagens. Um push na `main`, depois dessas verificações, publica as
imagens no GHCR e atualiza o Droplet.

O deploy acontece em duas etapas. Primeiro, `deploy.sh deploy <tag>` sobe a
nova versão e aguarda os health checks do Compose. Depois, a CI verifica
`https://<APP_DOMAIN>/api/health` pela internet, o que também cobre DNS,
firewall, emissão do certificado TLS e roteamento do Caddy. Somente quando essa
verificação pública passa, `deploy.sh confirm <tag>` registra a tag como a
última versão bem-sucedida em `/opt/filasaude/.last-successful-tag`.

Se qualquer uma das verificações falhar e já existir uma versão anterior
bem-sucedida, a tag anterior é reaplicada automaticamente. No primeiro deploy
ainda não há versão anterior, então a falha apenas interrompe a publicação.
Cada tag tem o formato `sha-<commit>`.

Para reaplicar manualmente a última versão bem-sucedida:

```bash
/opt/filasaude/deploy.sh rollback
```

Para inspecionar a aplicação no servidor:

```bash
cd /opt/filasaude
docker compose --env-file .env -f compose.prod.yaml ps
docker compose --env-file .env -f compose.prod.yaml logs --tail=200
```

## Dados e backups

Enquanto os dados forem mockados, os containers são stateless e podem ser
recriados a qualquer momento. O único volume persistente contém certificados e
estado do Caddy. Antes de introduzir PostgreSQL ou uploads, defina migrations,
retenção e restauração de backups e então habilite os backups adequados.
