variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "imaging-360"
}

# Database
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "imaging"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "imaging_admin"
  sensitive   = true
}

# Worker
variable "worker_memory" {
  description = "Worker Lambda memory in MB"
  type        = number
  default     = 2048
}

variable "worker_timeout" {
  description = "Worker Lambda timeout in seconds"
  type        = number
  default     = 120
}
