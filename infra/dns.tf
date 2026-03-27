# DNS (uncomment when domain is ready)

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
