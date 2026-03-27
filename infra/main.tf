terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }

  # Optional: store state remotely in DigitalOcean Spaces so the team shares it.
  # Uncomment and fill in after creating a Spaces bucket.
  #
  # backend "s3" {
  #   endpoint                    = "https://fra1.digitaloceanspaces.com"
  #   bucket                      = "your-spaces-bucket"
  #   key                         = "vopli/terraform.tfstate"
  #   region                      = "us-east-1"   # required by the s3 backend, value doesn't matter
  #   skip_credentials_validation = true
  #   skip_metadata_api_check     = true
  #   skip_region_validation      = true
  #   force_path_style            = true
  # }
}

provider "digitalocean" {
  token = var.do_token
}
