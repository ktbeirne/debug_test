# LLM Ops Demo - Simple Deployment Script

Write-Host "=== LLM Ops Demo - Deployment ===" -ForegroundColor Green
Write-Host ""

# 環境変数を読み込み
$envFile = Get-Content .env
$env:AWS_REGION = ($envFile | Select-String "AWS_REGION=(.+)").Matches.Groups[1].Value
$env:AWS_ACCOUNT_ID = ($envFile | Select-String "AWS_ACCOUNT_ID=(.+)").Matches.Groups[1].Value
$env:GITHUB_TOKEN = ($envFile | Select-String "GITHUB_TOKEN=(.+)").Matches.Groups[1].Value
$env:GITHUB_OWNER = ($envFile | Select-String "GITHUB_OWNER=(.+)").Matches.Groups[1].Value
$env:GITHUB_REPO = ($envFile | Select-String "GITHUB_REPO=(.+)").Matches.Groups[1].Value

Write-Host "Step 1: Building TypeScript..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nStep 2: Creating ZIP files..." -ForegroundColor Cyan
Compress-Archive -Path dist\lambda\sample-app\* -DestinationPath lambda-sample-app.zip -Force
Compress-Archive -Path dist\lambda\trigger-workflow\* -DestinationPath lambda-trigger.zip -Force

Write-Host "`nStep 3: Creating IAM roles..." -ForegroundColor Cyan

# サンプルアプリ用のIAMロール
$trustPolicy = @"
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "lambda.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
"@

try {
    aws iam get-role --role-name llm-ops-sample-app-role 2>$null
    Write-Host "IAM Role already exists: llm-ops-sample-app-role" -ForegroundColor Yellow
} catch {
    aws iam create-role --role-name llm-ops-sample-app-role --assume-role-policy-document $trustPolicy
    aws iam attach-role-policy --role-name llm-ops-sample-app-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    Write-Host "Waiting for IAM role to propagate..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
}

try {
    aws iam get-role --role-name llm-ops-trigger-role 2>$null
    Write-Host "IAM Role already exists: llm-ops-trigger-role" -ForegroundColor Yellow
} catch {
    aws iam create-role --role-name llm-ops-trigger-role --assume-role-policy-document $trustPolicy
    aws iam attach-role-policy --role-name llm-ops-trigger-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    Write-Host "Waiting for IAM role to propagate..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
}

Write-Host "`nStep 4: Deploying Lambda functions..." -ForegroundColor Cyan

# サンプルアプリLambda
try {
    aws lambda get-function --function-name llm-ops-sample-app 2>$null
    Write-Host "Updating Lambda function: llm-ops-sample-app" -ForegroundColor Yellow
    aws lambda update-function-code --function-name llm-ops-sample-app --zip-file fileb://lambda-sample-app.zip
} catch {
    Write-Host "Creating Lambda function: llm-ops-sample-app" -ForegroundColor Yellow
    aws lambda create-function `
        --function-name llm-ops-sample-app `
        --runtime nodejs22.x `
        --role arn:aws:iam::$($env:AWS_ACCOUNT_ID):role/llm-ops-sample-app-role `
        --handler index.handler `
        --zip-file fileb://lambda-sample-app.zip `
        --timeout 30 `
        --memory-size 256
}

# トリガーLambda
try {
    aws lambda get-function --function-name llm-ops-trigger-workflow 2>$null
    Write-Host "Updating Lambda function: llm-ops-trigger-workflow" -ForegroundColor Yellow
    aws lambda update-function-code --function-name llm-ops-trigger-workflow --zip-file fileb://lambda-trigger.zip
    aws lambda update-function-configuration `
        --function-name llm-ops-trigger-workflow `
        --environment "Variables={GITHUB_TOKEN=$($env:GITHUB_TOKEN),GITHUB_OWNER=$($env:GITHUB_OWNER),GITHUB_REPO=$($env:GITHUB_REPO)}"
} catch {
    Write-Host "Creating Lambda function: llm-ops-trigger-workflow" -ForegroundColor Yellow
    aws lambda create-function `
        --function-name llm-ops-trigger-workflow `
        --runtime nodejs22.x `
        --role arn:aws:iam::$($env:AWS_ACCOUNT_ID):role/llm-ops-trigger-role `
        --handler index.handler `
        --zip-file fileb://lambda-trigger.zip `
        --timeout 30 `
        --memory-size 256 `
        --environment "Variables={GITHUB_TOKEN=$($env:GITHUB_TOKEN),GITHUB_OWNER=$($env:GITHUB_OWNER),GITHUB_REPO=$($env:GITHUB_REPO)}"
}

Write-Host "`nStep 5: Creating API Gateway..." -ForegroundColor Cyan
Write-Host "Please create API Gateway manually in AWS Console and link to llm-ops-sample-app Lambda" -ForegroundColor Yellow
Write-Host "Or use AWS SAM/CDK for automated deployment" -ForegroundColor Yellow

Write-Host "`n=== Deployment Completed! ===" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Create API Gateway in AWS Console" -ForegroundColor White
Write-Host "2. Link API Gateway to llm-ops-sample-app Lambda" -ForegroundColor White
Write-Host "3. Set up CloudWatch Logs subscription filter" -ForegroundColor White
