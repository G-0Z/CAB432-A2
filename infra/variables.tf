variable "aws_region" {
  type = string
}

variable "aws_profile" {
  type    = string
  default = "CAB432-STUDENT"
}

variable "project_name" {
  type = string
}

variable "bucket_name" {
  type = string
}

variable "dynamodb_table_name" {
  type = string
}

variable "domain_name" {
  type    = string
  default = ""
}

variable "subdomain" {
  type    = string
  default = ""
}

variable "ec2_instance_id" {
  type    = string
  default = ""
}
