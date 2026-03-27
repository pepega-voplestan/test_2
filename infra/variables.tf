variable "do_token" {
  description = "DigitalOcean API token (generate at cloud.digitalocean.com/account/api/tokens)"
  type        = string
  sensitive   = true
}

variable "region" {
  description = "DigitalOcean region slug (https://slugs.do-api.dev)"
  type        = string
  default     = "ams3"
}

variable "droplet_size" {
  description = "Droplet size slug (https://slugs.do-api.dev)"
  type        = string
  default     = "s-1vcpu-2gb"
}

variable "volume_size_gb" {
  description = "Block volume size in GB"
  type        = number
  default     = 20
}

variable "ssh_public_key_path" {
  description = "Path to the SSH public key to register with DigitalOcean"
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "ssh_private_key_path" {
  description = "Path to the SSH private key used by Terraform provisioners"
  type        = string
  default     = "~/.ssh/id_ed25519"
}

variable "ssh_allowed_ips" {
  description = "CIDR blocks allowed to reach port 22"
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}

variable "do_ssh_key_name" {
  description = "Name of an existing SSH key in your DigitalOcean account (Settings → Security)"
  type        = string
}

variable "tailscale_auth_key" {
  description = "Tailscale reusable auth key"
  type        = string
  sensitive   = true
}

variable "deploy_ssh_public_key" {
  description = "Public SSH key for GitHub Actions deploy access (contents of ~/.ssh/github_actions_deploy.pub)"
  type        = string
}

variable "admin_user" {
  description = "Username for nginx basic auth (/admin and /workers)"
  type        = string
}

variable "admin_password" {
  description = "Password for nginx basic auth (/admin and /workers)"
  type        = string
  sensitive   = true
}

variable "domain" {
  description = "Root domain name"
  type        = string
  default     = ""
}
