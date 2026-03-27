resource "digitalocean_volume" "data" {
  name                    = local.volume_name
  region                  = var.region
  size                    = var.volume_size_gb
  initial_filesystem_type = "ext4"
  description             = "Persistent storage for ${local.prefix}: Docker data, SQLite DB, uploaded media"

  lifecycle {
    prevent_destroy = true
  }
}

resource "digitalocean_volume_attachment" "data" {
  droplet_id = digitalocean_droplet.app.id
  volume_id  = digitalocean_volume.data.id
}

resource "null_resource" "configure_volume" {
  depends_on = [
    null_resource.wait_for_cloud_init,
    digitalocean_volume_attachment.data,
  ]

  triggers = {
    volume_attachment_id = digitalocean_volume_attachment.data.id
  }

  connection {
    type        = "ssh"
    host        = digitalocean_droplet.app.ipv4_address
    user        = "root"
    private_key = file(var.ssh_private_key_path)
  }

  provisioner "file" {
    source      = local.env_file
    destination = "/opt/vopli/.env"
  }

  provisioner "remote-exec" {
    inline = [
      # Mount the volume
      "mkdir -p ${local.mount_path}",
      "mount ${local.volume_dev} ${local.mount_path} || true",

      # Persist the mount across reboots
      "grep -q '${local.volume_name}' /etc/fstab || echo '${local.volume_dev} ${local.mount_path} ext4 defaults,nofail,discard 0 2' >> /etc/fstab",

      # Configure Docker to store all data (images, containers, volumes) on the block volume.
      "mkdir -p ${local.mount_path}/docker",
      "mkdir -p /etc/docker",
      "echo '{\"data-root\":\"${local.mount_path}/docker\"}' > /etc/docker/daemon.json",

      # Restart Docker to pick up the new data-root
      "systemctl restart docker",
      "systemctl enable docker",
      "mkdir -p /opt/vopli",

      # Generate nginx basic auth
      "docker run --rm httpd:alpine htpasswd -nbB '${var.admin_user}' '${var.admin_password}' > /opt/vopli/.htpasswd",
    ]
  }
}
