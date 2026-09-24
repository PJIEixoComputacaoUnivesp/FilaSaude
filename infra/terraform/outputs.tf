output "droplet_id" {
  description = "ID of the application Droplet."
  value       = digitalocean_droplet.app.id
}

output "reserved_ip" {
  description = "Stable public IP assigned to the application."
  value       = digitalocean_reserved_ip.app.ip_address
}

output "application_hostname" {
  description = "Hostname configured in DigitalOcean DNS, when enabled."
  value = var.domain_name == null ? null : (
    var.domain_record == "@" ? var.domain_name : "${var.domain_record}.${var.domain_name}"
  )
}

