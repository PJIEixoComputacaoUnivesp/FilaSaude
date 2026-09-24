# Infraestrutura na DigitalOcean

Este módulo cria um Droplet, um IP reservado, regras de firewall, uma chave SSH
e, opcionalmente, o domínio e o registro DNS da aplicação. O token da
DigitalOcean deve ser fornecido somente pelo ambiente:

```bash
export DIGITALOCEAN_TOKEN="..."
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan -out=production.tfplan
terraform apply production.tfplan
```

O `terraform.tfvars` e os arquivos de estado são locais e não devem ser
versionados. Guarde uma cópia segura do estado: sem ele, o Terraform não
consegue relacionar a configuração aos recursos já criados.

Os runners hospedados do GitHub não possuem um único endereço de saída. O
exemplo libera a porta SSH para a internet para permitir o deploy, mas o
cloud-init aceita somente chave, bloqueia senha e desabilita login de root. Se
usar um runner com IP fixo, restrinja `ssh_allowed_cidrs` a esse endereço.

Se o domínio já estiver cadastrado na DigitalOcean, importe-o antes do primeiro
`apply` ou mantenha `domain_name = null` e gerencie o registro A fora deste
módulo.
