region         = "ams3"
droplet_size   = "s-1vcpu-1gb"
volume_size_gb = 10

ssh_public_key_path = "~/.ssh/id_ed25519.pub"

# Dev: allow SSH from anywhere for now
ssh_allowed_ips = ["0.0.0.0/0", "::/0"]
