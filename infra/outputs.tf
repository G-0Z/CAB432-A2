output "bucket_name"         { value = aws_s3_bucket.app.bucket }
output "dynamodb_table_arn"  { value = aws_dynamodb_table.notes.arn }
