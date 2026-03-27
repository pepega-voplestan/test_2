# DNS — uncomment when your domain is ready.
#
# First, point your domain's nameservers at your registrar to:
#   ns1.digitalocean.com
#   ns2.digitalocean.com
#   ns3.digitalocean.com
#
# Then set var.domain = "vopley.net" in terraform.tfvars and uncomment below.

# resource "digitalocean_domain" "default" {
#   name = var.domain
# }
#
# resource "digitalocean_record" "root" {
#   domain = digitalocean_domain.default.id
#   type   = "A"
#   name   = "@"
#   value  = digitalocean_droplet.app.ipv4_address
#   ttl    = 300
# }
#
# resource "digitalocean_record" "www" {
#   domain = digitalocean_domain.default.id
#   type   = "A"
#   name   = "www"
#   value  = digitalocean_droplet.app.ipv4_address
#   ttl    = 300
# }
