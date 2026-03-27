resource "digitalocean_droplet" "app" {
  name      = local.prefix
  region    = var.region
  size      = var.droplet_size
  image     = "ubuntu-24-04-x64"
  ssh_keys  = [data.digitalocean_ssh_key.default.fingerprint]
  user_data = file("${path.module}/cloud-init.yml")

  lifecycle {
    prevent_destroy = true
  }
}

# Wait for cloud-init to finish before any provisioners run against this droplet.
resource "null_resource" "wait_for_cloud_init" {
  depends_on = [digitalocean_droplet.app]

  triggers = {
    droplet_id = digitalocean_droplet.app.id
  }

  connection {
    type  = "ssh"
    host  = digitalocean_droplet.app.ipv4_address
    user  = "root"
    agent = true
  }

  provisioner "remote-exec" {
    inline = ["cloud-init status --wait"]
  }
}
