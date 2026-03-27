locals {
  env         = terraform.workspace          # "dev" or "prod"
  prefix      = "vopli-${terraform.workspace}"
  volume_name = "vopli-${terraform.workspace}-data"
  volume_dev  = "/dev/disk/by-id/scsi-0DO_Volume_vopli-${terraform.workspace}-data"
  mount_path  = "/mnt/vopli-data"
}
