variable "project_name" {
  description = "Name used for DigitalOcean resources."
  type        = string
  default     = "fila-saude"
}
variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "production"
}

variable "region" {
  description = "DigitalOcean region slug."
  type        = string
  default     = "nyc3"
}

variable "droplet_size" {
  description = "DigitalOcean Droplet size slug."
  type        = string
  default     = "s-1vcpu-1gb"
}

variable "droplet_image" {
  description = "DigitalOcean Droplet image slug."
  type        = string
  default     = "ubuntu-24-04-x64"
}

variable "ssh_public_key" {
  description = "Public SSH key authorized for the deploy user."
  type        = string
  sensitive   = true
}

variable "ssh_allowed_cidrs" {
  description = "CIDR blocks allowed to connect over SSH."
  type        = list(string)

  validation {
    condition     = length(var.ssh_allowed_cidrs) > 0
    error_message = "At least one CIDR must be allowed for SSH access."
  }
}

variable "enable_backups" {
  description = "Enable DigitalOcean Droplet backups."
  type        = bool
  default     = false
}

variable "domain_name" {
  description = "Root domain delegated to DigitalOcean DNS. Leave null to manage DNS elsewhere."
  type        = string
  default     = null
  nullable    = true
}

variable "domain_record" {
  description = "DNS record name created below domain_name, for example saude or @."
  type        = string
  default     = "saude"
}
