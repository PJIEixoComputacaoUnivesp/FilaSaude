locals {
  resource_name = "${var.project_name}-${var.environment}"
  tags          = [var.project_name, var.environment, "terraform"]
}
resource "digitalocean_project" "this" {
  count = var.project_id == null ? 1 : 0

  name        = local.resource_name
  description = "Infraestrutura ${var.environment} do FilaSaúde"
  purpose     = "Web Application"
  environment = "Production"
}

resource "digitalocean_ssh_key" "deploy" {
  name       = "${local.resource_name}-deploy"
  public_key = var.ssh_public_key
}

resource "digitalocean_droplet" "app" {
  name       = local.resource_name
  region     = var.region
  size       = var.droplet_size
  image      = var.droplet_image
  monitoring = true
  backups    = var.enable_backups
  ipv6       = true
  ssh_keys   = [digitalocean_ssh_key.deploy.fingerprint]
  tags       = local.tags

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    ssh_public_key = var.ssh_public_key
  })

  lifecycle {
    ignore_changes = [user_data]
  }
}

resource "digitalocean_reserved_ip" "app" {
  region = var.region
}

resource "digitalocean_reserved_ip_assignment" "app" {
  ip_address = digitalocean_reserved_ip.app.ip_address
  droplet_id = digitalocean_droplet.app.id
}

resource "digitalocean_firewall" "app" {
  name        = "${local.resource_name}-firewall"
  droplet_ids = [digitalocean_droplet.app.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = var.ssh_allowed_cidrs
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "udp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "icmp"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

resource "digitalocean_domain" "app" {
  count = var.domain_name == null ? 0 : 1
  name  = var.domain_name
}

resource "digitalocean_record" "app" {
  count  = var.domain_name == null ? 0 : 1
  domain = digitalocean_domain.app[0].id
  type   = "A"
  name   = var.domain_record
  value  = digitalocean_reserved_ip.app.ip_address
  ttl    = 300
}

resource "digitalocean_project_resources" "this" {
  project = var.project_id != null ? var.project_id : digitalocean_project.this[0].id
  resources = [
    digitalocean_droplet.app.urn,
    digitalocean_reserved_ip.app.urn,
  ]
}
