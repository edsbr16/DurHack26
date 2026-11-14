terraform {
  required_providers {
    vultr = {
      source  = "vultr/vultr"
      version = "2.33.2"
    }
  }
}

provider "vultr" {
  api_key     = var.vultr_api_key
  rate_limit  = 100
  retry_limit = 3
}

resource "vultr_vpc" "vpc" {
  description    = "${var.vultr_tag}VPC"
  region         = var.vultr_region
  v4_subnet      = "10.0.0.0"
  v4_subnet_mask = 24
}

resource "vultr_ssh_key" "ssh_key" {
  name    = "${var.vultr_tag}Key"
  ssh_key = var.vultr_ssh_pub_key
}

resource "vultr_nat_gateway" "nat_gateway" {
  vpc_id = vultr_vpc.vpc.id
  label  = "${var.vultr_tag}NatGateway"
  tag    = var.vultr_tag
}

resource "vultr_nat_gateway_port_forwarding_rule" "port_forwarding_rule" {
  vpc_id         = vultr_nat_gateway.nat_gateway.vpc_id
  nat_gateway_id = vultr_nat_gateway.nat_gateway.id
  name           = "${var.vultr_tag}NatPortForwardingRule"
  protocol       = "tcp"
  internal_port  = "22"
  internal_ip    = vultr_instance.web.internal_ip
  external_port  = "22"
  enabled        = true
  description    = "Allow to SSH into the web VPS"
}

resource "vultr_firewall_group" "firewall_web" {
  description = "Firewall for the web instance"
}

resource "vultr_firewall_rule" "allow_22" {
  firewall_group_id = vultr_firewall_group.firewall_web.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = "0.0.0.0"
  subnet_size       = 0
  port              = "22"
  notes             = "Allow SSH"
}

resource "vultr_firewall_rule" "allow_80" {
  firewall_group_id = vultr_firewall_group.firewall_web.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = "0.0.0.0"
  subnet_size       = 0
  port              = "80"
  notes             = "Allow HTTP"
}

resource "vultr_firewall_rule" "allow_443" {
  firewall_group_id = vultr_firewall_group.firewall_web.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = "0.0.0.0"
  subnet_size       = 0
  port              = "443"
  notes             = "Allow HTTPs"
}

resource "vultr_firewall_rule" "allow_webrtc_udp" {
  firewall_group_id = vultr_firewall_group.firewall_web.id
  protocol          = "udp"
  ip_type           = "v4"
  subnet            = "0.0.0.0"
  subnet_size       = 0
  port              = "10000:60000"
  notes             = "Allow WebRTC UDP media traffic"
}

resource "vultr_reserved_ip" "reserved_ip" {
  label       = "${var.vultr_tag}Ipv4"
  region      = var.vultr_region
  ip_type     = "v4"
  instance_id = vultr_instance.web.id
}

resource "vultr_instance" "web" {
  plan                = var.vultr_plan_web
  region              = var.vultr_region
  os_id               = var.vultr_os_id
  label               = "${var.vultr_tag}Web"
  tags                = [var.vultr_tag]
  firewall_group_id   = vultr_firewall_group.firewall_web.id
  enable_ipv6         = false
  vpc_ids             = [vultr_vpc.vpc.id]
  disable_public_ipv4 = true
  backups             = "disabled"
  user_scheme         = "limited"
  ddos_protection     = false
  activation_email    = false
  ssh_key_ids         = [vultr_ssh_key.ssh_key.id]
  vpc_only            = true
}

output "web_ip" {
  value = "${vultr_nat_gateway.nat_gateway.public_ips[0]}:${vultr_nat_gateway_port_forwarding_rule.port_forwarding_rule.external_port}"
}
