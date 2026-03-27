region         = "ams3"
droplet_size   = "s-1vcpu-1gb"
volume_size_gb = 10

ssh_public_key_path  = "~/.ssh/terraform_do.pub"
ssh_private_key_path = "~/.ssh/terraform_do"
deploy_ssh_public_key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEwtaEUhOw3MIvQlPbc0WCQq0AcELlYhjUHlafHwjT6l github-actions-deploy"

# Dev: allow SSH from anywhere for now
ssh_allowed_ips = ["0.0.0.0/0", "::/0"]

tailscale_auth_key = "tskey-auth-kSAvNHnRYe11CNTRL-wzNqEH9CMi1AaUVXmxuai17tFFekzGNsc"

admin_user     = "admin"
admin_password = "zbv.bhc3qhr-VUC5zjc"
