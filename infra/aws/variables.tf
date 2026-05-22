variable "aws_region" {
  description = "AWS region for low-idle pilot resources."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used in resource names."
  type        = string
  default     = "sovereign-source"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "pilot"
}

variable "cloudflare_pages_url" {
  description = "Primary Cloudflare Pages URL for callbacks and CORS."
  type        = string
  default     = "https://sovereign-source-mvp.pages.dev"
}

variable "callback_urls" {
  description = "Additional Cognito callback URLs."
  type        = list(string)
  default     = ["http://localhost:3000/dashboard"]
}

variable "logout_urls" {
  description = "Additional Cognito logout URLs."
  type        = list(string)
  default     = ["http://localhost:3000/"]
}

variable "allowed_origins" {
  description = "Additional origins allowed to call the Lambda Function URL."
  type        = list(string)
  default     = ["http://localhost:3000"]
}

variable "cognito_domain_prefix" {
  description = "Optional globally unique Cognito hosted UI domain prefix. Leave blank to generate one."
  type        = string
  default     = ""
}

variable "monthly_budget_amount_usd" {
  description = "Monthly AWS budget alert amount."
  type        = string
  default     = "10"
}

variable "budget_alert_email" {
  description = "Email for AWS Budget alerts. Empty disables budget creation."
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch log retention for the serverless API."
  type        = number
  default     = 7
}

variable "enable_point_in_time_recovery" {
  description = "Enable DynamoDB PITR. Low idle cost at tiny data volume, but disabled by default for the strictest budget posture."
  type        = bool
  default     = false
}
