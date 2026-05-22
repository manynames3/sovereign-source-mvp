output "api_base_url" {
  description = "Lambda Function URL for NEXT_PUBLIC_API_BASE_URL."
  value       = aws_lambda_function_url.api.function_url
}

output "cognito_user_pool_id" {
  description = "Cognito user pool id."
  value       = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  description = "Cognito web app client id."
  value       = aws_cognito_user_pool_client.web.id
}

output "cognito_domain" {
  description = "Cognito hosted UI domain for NEXT_PUBLIC_COGNITO_DOMAIN."
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "document_bucket" {
  description = "Private S3 bucket for controlled document objects."
  value       = aws_s3_bucket.documents.bucket
}

output "dynamodb_table" {
  description = "DynamoDB single-table name."
  value       = aws_dynamodb_table.pilot.name
}
