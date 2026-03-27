output "droplet_ip" {
  description = "Public IP — add to GitHub Actions secrets as DO_HOST_DEV or DO_HOST_PROD"
  value       = digitalocean_droplet.app.ipv4_address
}

output "droplet_id" {
  description = "Droplet ID"
  value       = digitalocean_droplet.app.id
}

output "volume_id" {
  description = "Block volume ID"
  value       = digitalocean_volume.data.id
}

output "ssh_command" {
  description = "SSH into the droplet"
  value       = "ssh root@${digitalocean_droplet.app.ipv4_address}"
}

output "environment" {
  description = "Active Terraform workspace"
  value       = local.env
}
