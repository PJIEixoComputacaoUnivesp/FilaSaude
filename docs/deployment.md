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

### Sem domínio

Enquanto não houver domínio, use `APP_DOMAIN=http://IP_RESERVADO`. Com o prefixo
`http://`, o Caddy serve a aplicação somente por HTTP na porta 80 e não solicita
certificado. Não há criptografia nesse modo, então use-o apenas temporariamente.
Para ativar o HTTPS, crie o registro A, troque `APP_DOMAIN` pelo domínio sem
protocolo e execute um novo deploy.

## 3. Configurar o ambiente do GitHub

Crie um environment chamado `production` nas configurações do repositório e
adicione os secrets:

| Secret | Conteúdo |
| --- | --- |
| `DROPLET_HOST` | IP reservado retornado pelo Terraform |
| `DEPLOY_SSH_KEY` | Chave SSH privada correspondente à chave pública do Terraform |
| `DROPLET_KNOWN_HOSTS` | Linha de host key confiável do servidor |
| `APP_DOMAIN` | Domínio completo, sem protocolo, ou `http://IP` sem domínio |
| `ACME_EMAIL` | E-mail usado na emissão dos certificados TLS |
| `POSTGRES_PASSWORD` | Senha do PostgreSQL de produção (`openssl rand -hex 32`) |

Crie também duas variáveis de Actions:

- `DEPLOY_ENABLED` com o valor `true`, somente depois que o Droplet, o DNS e
  todos os secrets estiverem prontos. Sem ela, o workflow de deploy não faz
  nada.
- `DEPLOYERS` com os logins do GitHub autorizados a publicar, separados por
  vírgula e sem espaços (ex.: `edvardsanta`). Qualquer pessoa com escrita no
  repositório vê o botão "Run workflow", mas para quem não está na lista o job
  é pulado.

No environment `production`, restrinja **Deployment branches and tags** à
branch `main`. A checagem de `DEPLOYERS` fica no workflow; essa regra impede
que um workflow alterado em outra branch acesse os secrets de produção.

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
build das imagens (workflow `CI`). Um push na `main`, depois dessas
verificações, publica as imagens no GHCR com a tag `sha-<commit>`, mas **não**
atualiza o Droplet.

O deploy é manual, pelo workflow `Deploy`: na aba Actions, clique em "Run
workflow" na branch `main`. Pela linha de comando:

```bash
# último commit da main (espere a CI desse commit terminar)
gh workflow run deploy.yml --ref main

# uma imagem específica, por exemplo para voltar a uma versão anterior
gh workflow run deploy.yml --ref main -f image_tag=sha-<commit completo>
```

Com `image_tag`, os arquivos de `deploy/` também vêm desse commit, para que o
compose e os scripts correspondam à imagem. O workflow confere se as imagens
existem no GHCR antes de acessar o servidor. As tags disponíveis são os
commits da `main` cuja CI passou (`git log --format='sha-%H' origin/main`).

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

Para voltar a uma versão específica, rode o workflow `Deploy` com o
`image_tag` desejado, como acima. Para reaplicar direto no servidor a última
versão bem-sucedida:

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

### PostgreSQL

O PostgreSQL roda no mesmo Droplet, como o serviço `postgres` do
`compose.prod.yaml`, acessível somente pela rede interna do Compose. O volume
`postgres_data` guarda os dados.

O conjunto de dados é pequeno (poucos MB) e o projeto não deve crescer, então o
serviço tem recursos limitados para caber em um Droplet de 1 GB:

| Configuração | Valor |
| --- | --- |
| `mem_limit` / `cpus` | 192 MB / 0,5 |
| `shared_buffers` | 32 MB |
| `effective_cache_size` | 128 MB |
| `work_mem` / `maintenance_work_mem` | 2 MB / 16 MB |
| `max_connections` | 10 |

Adicione o secret `POSTGRES_PASSWORD` ao environment `production` antes do
próximo deploy. Gere a senha com `openssl rand -hex 32`. `POSTGRES_DB` e
`POSTGRES_USER` usam `filasaude` por padrão.

### Swap

Droplets novos recebem 1 GB de swap pelo cloud-init. Em um Droplet já criado,
configure uma única vez:

```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Backups

`deploy/backup.sh` gera um `pg_dump` compactado em `/opt/filasaude/backups` e
mantém os 7 arquivos mais recentes. Agende a execução diária no crontab do
usuário `deploy` (`crontab -e`):

```cron
30 3 * * * /opt/filasaude/backup.sh >> /opt/filasaude/backups/backup.log 2>&1
```

Para restaurar um backup (o dump recria as tabelas existentes):

```bash
cd /opt/filasaude
gunzip -c backups/filasaude-AAAAMMDDTHHMMSSZ.sql.gz |
  docker compose --env-file .env -f compose.prod.yaml exec -T postgres \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

Como os dados de unidades vêm do CNES, eles também podem ser reconstruídos por
uma nova ingestão. O backup evita depender da disponibilidade da fonte.

O volume do Caddy guarda certificados e estado, e pode ser recriado.
