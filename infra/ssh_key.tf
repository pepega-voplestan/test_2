# References an SSH key that already exists in your DigitalOcean account.
# Find the name at: cloud.digitalocean.com/account/security
# Or via API: curl -s -H "Authorization: Bearer $TF_VAR_do_token" https://api.digitalocean.com/v2/account/keys | jq '.ssh_keys[].name'
data "digitalocean_ssh_key" "default" {
  name = var.do_ssh_key_name
}
