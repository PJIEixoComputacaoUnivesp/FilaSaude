# Deploy na DigitalOcean

A produção do FilaSaúde usa um único Droplet e quatro containers:

- Caddy recebe o tráfego público, emite certificados TLS e encaminha as
  requisições;
- o frontend é servido por Nginx em uma rede interna do Compose;
- a API NestJS fica disponível externamente pelo prefixo `/api`;
- o PostgreSQL guarda os dados da API e só é acessível pela rede interna.

As imagens são publicadas no GitHub Container Registry (GHCR) somente no
deploy, identificadas pelo SHA do commit. O servidor não compila o projeto:
ele apenas baixa essas imagens.

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
| `POSTGRES_PASSWORD` | Senha do PostgreSQL de produção (`openssl rand -hex 32`) |
| `ADMIN_API_TOKENS` | Opcional. Liga a administração das posições. Uma entrada `login:token` por administrador, separadas por vírgula (ver "Correções manuais de posição") |
| `WEBHOOK_SOURCE_CONFIG` | Objeto JSON com os segredos das fontes e os códigos CNES autorizados para cada fonte |

O valor de `WEBHOOK_SOURCE_CONFIG` deve seguir este formato, sem incluir
segredos no repositório:

```json
{"academic-simulator":{"secret":"<openssl rand -hex 32>","unitCnes":["1234567"]}}
```

O deploy de produção exige essa configuração; sem ela, o serviço não inicia
pelo Compose.

Gere o secret fora do repositório e salve o JSON resultante como secret do
environment `production`:

```bash
WEBHOOK_SECRET="$(openssl rand -hex 32)"
printf '{"academic-simulator":{"secret":"%s","unitCnes":["1234567"]}}\n' "$WEBHOOK_SECRET"
```

Em produção, o webhook é acessível pelo prefixo público da API:
`https://<domínio>/api/webhooks/v1/occupancy`.

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

### Notificações no Discord (opcional)

O workflow `Deploy` avisa o resultado (sucesso, falha ou cancelamento) em um
canal do Discord, e o workflow `Notificar pull requests` avisa quando um PR para
a `main` é aberto, reaberto ou fechado. Os dois usam os secrets
`DISCORD_WEBHOOK_ID` e `DISCORD_WEBHOOK_TOKEN`, que são do **repositório** e não
do environment `production`, porque o job de notificação não usa esse
environment. Sem eles, a notificação é ignorada com um aviso e o deploy não é
afetado.

## 4. Publicação e rollback

Pull requests e pushes na `main` executam o workflow `CI`: lint, typecheck,
testes, build e os testes e2e da API (job "Qualidade do monorepo"), o fluxo da
interface com Playwright e a validação do Terraform. A CI não constrói as
imagens Docker nem atualiza o Droplet: as imagens são construídas e publicadas
só no deploy. Assim, o registro guarda apenas versões que foram de fato para
produção, o que mantém os pacotes privados dentro da cota gratuita de
armazenamento. Como consequência, um erro no `Dockerfile` só aparece no deploy.

O deploy é manual, pelo workflow `Deploy`: na aba Actions, clique em "Run
workflow" na branch `main`. Pela linha de comando:

```bash
# último commit da main (espere a CI desse commit terminar)
gh workflow run deploy.yml --ref main

# uma imagem específica, por exemplo para voltar a uma versão anterior
gh workflow run deploy.yml --ref main -f image_tag=sha-<commit completo>
```

O workflow segue quatro etapas:

1. **Validar commit:** o commit precisa estar na `main` e ter passado no check
   "Qualidade do monorepo" da CI.
2. **Publicar imagens:** se a imagem `sha-<commit>` ainda não existe no GHCR
   (commit nunca publicado, ou versão já apagada), ela é construída a partir
   desse commit e enviada. Se já existe, o build é ignorado. As camadas ficam
   no cache do GitHub Actions (separado do GHCR), o que acelera os próximos
   deploys.
3. **Deploy:** os arquivos de `deploy/` também vêm desse commit, para que o
   compose e os scripts correspondam à imagem.
4. **Notificar:** avisa o resultado no Discord, inclusive quando uma etapa
   anterior falha. É opcional; ver "Notificações no Discord".

Qualquer commit da `main` com CI aprovada pode ser publicado ou usado num
rollback (`git log --format='sha-%H' origin/main`).

O deploy acontece em duas etapas. Primeiro, `deploy.sh deploy <tag>` sobe a
versão do PostgreSQL, aplica as migrations da imagem e sobe a nova versão,
aguardando os health checks do Compose. Depois, a CI verifica
`https://<APP_DOMAIN>/api/health` pela internet, o que também cobre DNS,
firewall, emissão do certificado TLS e roteamento do Caddy. Somente quando essa
verificação pública passa, `deploy.sh confirm <tag>` registra a tag como a
última versão bem-sucedida em `/opt/filasaude/.last-successful-tag` e remove as
imagens Docker sem uso (`docker image prune`).

Se qualquer uma das verificações falhar e já existir uma versão anterior
bem-sucedida, a tag anterior é reaplicada automaticamente. No primeiro deploy
ainda não há versão anterior, então a falha apenas interrompe a publicação.
Cada tag tem o formato `sha-<commit>`.

O rollback troca só as imagens: as migrations que o deploy aplicou **não** são
desfeitas, e a versão anterior da API volta a rodar sobre o schema novo. Antes
de publicar uma migration que remove ou renomeia colunas ou tabelas, leve isso
em conta: acrescentar costuma ser seguro, e uma remoção fica mais segura em duas
versões (primeiro o código deixa de usar, depois a migration remove).

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

### Correções manuais de posição

Quando o cadastro do CNES traz uma coordenada errada, um administrador define a
posição da unidade em tempo de execução, sem novo deploy, pela página `/admin`
do site (não aparece no menu) ou pela API. A função fica **desligada** enquanto o
secret `ADMIN_API_TOKENS` não existir ou estiver malformado: nesse caso as rotas
`/admin/*` respondem 404 e o motivo vai para o log. O grupo confirma o uso de
posições que não vêm do CNES caso a caso, no momento em que um administrador faz
cada correção (ver "Licença e referências" no ADR 0001).

**Quem é administrador.** Quem tem um token na lista, e cada pessoa tem o seu.
Há um único nível de acesso e nenhuma rota ou tela que cadastre administradores:
eles existem só por esse secret. As alterações ficam registradas em nome do
login do token, e não de um nome digitado.

Formato: `login:token,login:token`. O login é o login do GitHub (letras, números e
hífen, até 39 caracteres). O token tem no mínimo 32 caracteres, sem `:` nem `,`;
use hexadecimal (`openssl rand -hex 32`), pois o valor é gravado no `.env` do
servidor. Uma entrada com erro, ou com login ou token repetido, desliga todas as
rotas, e o log aponta a posição da entrada, nunca o valor.

```bash
# gere um token por pessoa e monte a lista para colar no secret
printf 'maria-souza:%s,joao:%s' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)"
```

**Entrada e saída de pessoas.** Entregue cada token só à própria pessoa, nunca em
chat aberto. Para revogar o acesso de alguém, remova a entrada do secret e faça
um deploy: o novo `.env` substitui o anterior e o token deixa de valer. A lista
é o inventário de quem pode corrigir posições, então mantenha-a atualizada.

**Usando a página.** Abra `https://SEU_DOMINIO/admin`, informe o seu token (ele
fica só na memória da aba e é pedido de novo ao recarregar), escolha a unidade
pela busca ou pelo código CNES, clique no mapa para marcar a posição correta (ou
cole "latitude, longitude" copiados de um mapa, ou digite os valores) e descreva
como a posição foi verificada. A mesma página lista as correções em vigor, remove
uma correção (com confirmação) e mostra o histórico de alterações de uma unidade.

**Usando a API.** O token vai no header `Authorization: Bearer`:

```bash
export API=https://SEU_DOMINIO/api
export ADMIN_TOKEN="o-seu-token"

# quem sou eu (valida o token)
curl -H "Authorization: Bearer $ADMIN_TOKEN" "$API/admin/me"

# definir ou substituir a posição da unidade com CNES 5563704
curl -X PUT "$API/admin/location-corrections/5563704" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"latitude": -23.5343, "longitude": -46.8368, "method": "Como foi verificada"}'

# listar, ver o histórico de uma unidade e remover
curl -H "Authorization: Bearer $ADMIN_TOKEN" "$API/admin/location-corrections"
curl -H "Authorization: Bearer $ADMIN_TOKEN" "$API/admin/location-corrections/5563704/events"
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" "$API/admin/location-corrections/5563704"
```

Quem verificou não vai no corpo: vem do token. A posição precisa estar dentro do
município da unidade (tolerância de 5 km) e no Brasil. A resposta pública mostra
apenas `precision: "manual"` e a data, e o login e o método ficam só para os
administradores. A correção vale enquanto o município e o endereço da unidade no
CNES forem os de quando ela foi feita. Se algum mudar, ela deixa de valer e o
motivo vai para o log. Se, em vez disso, a coordenada do CNES mudar depois da
correção, ela continua valendo e a mudança só é registrada no log, para
revisão. A visão nacional vem de um snapshot que pode atrasar em relação ao
CNES, então uma correção feita contra um endereço mais novo pode ficar de fora
dela até o snapshot ser atualizado.

**Histórico.** Cada definição, substituição e remoção grava quem fez, quando, o
método e a posição anterior e a nova, na tabela `unit_location_correction_events`,
só com inserções. Uma remoção também fica registrada.

**Tentativas inválidas.** Depois de 20 tentativas com token inválido em 10
minutos, as novas tentativas inválidas recebem 429, e o log avisa uma vez,
sem o token. Isso sinaliza o abuso, mas **não impede adivinhar** um token: quem
acertasse o valor continuaria passando, porque um token válido nunca é
bloqueado (para que ninguém trave a equipe de propósito). A proteção contra
adivinhação é o tamanho e a aleatoriedade do token, por isso use
`openssl rand -hex 32`, que tem 256 bits.

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

O cron não é criado pelo cloud-init: agende-o uma vez, depois do primeiro
deploy, que é quando o `backup.sh` chega ao servidor. Os arquivos ficam no
próprio Droplet, então um Droplet perdido leva os backups junto. O Terraform tem
a variável `enable_backups` (desligada por padrão) para os backups do Droplet na
DigitalOcean; considere também copiar os dumps para fora do servidor.

Para restaurar um backup (o dump recria as tabelas existentes):

```bash
cd /opt/filasaude
gunzip -c backups/filasaude-AAAAMMDDTHHMMSSZ.sql.gz |
  docker compose --env-file .env -f compose.prod.yaml exec -T postgres \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

Hoje o banco guarda as posições corrigidas por administradores, o histórico de
cada alteração e a inbox de snapshots do webhook. Nada disso vem do CNES, então
não pode ser reconstruído por ele: **o backup é a única cópia**. O cadastro de
unidades ainda não é gravado no banco; quando a ingestão (#23) existir, ele
poderá ser refeito a partir do CNES, mas as correções continuarão dependendo do
backup.

O volume do Caddy guarda certificados e estado, e pode ser recriado.
