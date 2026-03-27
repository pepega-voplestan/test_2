resource "digitalocean_firewall" "app" {
  name        = "${local.prefix}-firewall"
  droplet_ids = [digitalocean_droplet.app.id]

  # SSH — restrict ssh_allowed_ips to your own IP(s) in prod
  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = var.ssh_allowed_ips
  }

  # App port (nginx)
  inbound_rule {
    protocol         = "tcp"
    port_range       = "3005"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # HTTP — for when you add a domain + SSL
  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # HTTPS — for when you add SSL
  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # Allow all outbound (package installs, Docker pulls, email, etc.)
  outbound_rule {
    protocol              = "tcp"
    port_range            = "all"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "all"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}
