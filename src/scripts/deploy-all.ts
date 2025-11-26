import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import { promisify } from 'util';
import {
    LambdaClient,
    CreateFunctionCommand,
    UpdateFunctionCodeCommand,
    GetFunctionCommand,
    AddPermissionCommand,
    ResourceNotFoundException,
} from '@aws-sdk/client-lambda';
import {
    IAMClient,
    CreateRoleCommand,
    AttachRolePolicyCommand,
    GetRoleCommand,
} from '@aws-sdk/client-iam';
import {
    CloudWatchLogsClient,
    PutSubscriptionFilterCommand,
    DescribeSubscriptionFiltersCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import {
    APIGatewayClient,
    CreateRestApiCommand,
    GetResourcesCommand,
    CreateResourceCommand,
    PutMethodCommand,
    PutIntegrationCommand,
    CreateDeploymentCommand,
    GetRestApisCommand,
} from '@aws-sdk/client-api-gateway';
import * as dotenv from 'dotenv';

dotenv.config();

const exec = promisify(child_process.exec);

const region = process.env.AWS_REGION || 'ap-northeast-1';
const accountId = process.env.AWS_ACCOUNT_ID!;
const githubToken = process.env.GITHUB_TOKEN!;
const githubOwner = process.env.GITHUB_OWNER!;
const githubRepo = process.env.GITHUB_REPO!;

const lambdaClient = new LambdaClient({ region });
const iamClient = new IAMClient({ region });
const logsClient = new CloudWatchLogsClient({ region });
const apiGatewayClient = new APIGatewayClient({ region });

/**
 * ZIPファイルを作成
 */
async function createZipFile(sourceDir: string, outputFile: string): Promise<void> {
    console.log(`Creating ZIP file: ${outputFile}`);

    const cwd = path.dirname(sourceDir);
    const dirName = path.basename(sourceDir);

    await exec(`cd ${cwd} && zip -r ${outputFile} ${dirName}`, { shell: 'powershell.exe' });
    console.log(`ZIP file created: ${outputFile}`);
}

/**
 * IAMロールを作成または取得
 */
async function ensureIAMRole(roleName: string, policyArns: string[]): Promise<string> {
    try {
        const { Role } = await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
        console.log(`IAM Role already exists: ${roleName}`);
        return Role!.Arn!;
    } catch (error) {
        if (error instanceof Error && error.name === 'NoSuchEntity') {
            console.log(`Creating IAM Role: ${roleName}`);

            const assumeRolePolicyDocument = JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Principal: { Service: 'lambda.amazonaws.com' },
                    Action: 'sts:AssumeRole',
                }],
            });

            const { Role } = await iamClient.send(new CreateRoleCommand({
                RoleName: roleName,
                AssumeRolePolicyDocument: assumeRolePolicyDocument,
            }));

            // ポリシーをアタッチ
            for (const policyArn of policyArns) {
                await iamClient.send(new AttachRolePolicyCommand({
                    RoleName: roleName,
                    PolicyArn: policyArn,
                }));
            }

            // ロールが作成されるまで待機
            await new Promise(resolve => setTimeout(resolve, 10000));

            console.log(`IAM Role created: ${roleName}`);
            return Role!.Arn!;
        }
        throw error;
    }
}

/**
 * Lambda関数をデプロイ
 */
async function deployLambdaFunction(
    functionName: string,
    zipFilePath: string,
    handler: string,
    roleArn: string,
    environment?: Record<string, string>
): Promise<string> {
    const zipFile = fs.readFileSync(zipFilePath);

    try {
        // 既存の関数を取得
        await lambdaClient.send(new GetFunctionCommand({ FunctionName: functionName }));

        console.log(`Updating existing Lambda function: ${functionName}`);
        await lambdaClient.send(new UpdateFunctionCodeCommand({
            FunctionName: functionName,
            ZipFile: zipFile,
        }));
    } catch (error) {
        if (error instanceof ResourceNotFoundException) {
            console.log(`Creating new Lambda function: ${functionName}`);
            await lambdaClient.send(new CreateFunctionCommand({
                FunctionName: functionName,
                Runtime: 'nodejs22.x',
                Role: roleArn,
                Handler: handler,
                Code: { ZipFile: zipFile },
                Timeout: 30,
                MemorySize: 256,
                Environment: environment ? { Variables: environment } : undefined,
            }));
        } else {
            throw error;
        }
    }

    const { Configuration } = await lambdaClient.send(new GetFunctionCommand({ FunctionName: functionName }));
    console.log(`Lambda function deployed: ${functionName}`);
    return Configuration!.FunctionArn!;
}

/**
 * API Gatewayを作成
 */
async function createAPIGateway(lambdaFunctionArn: string): Promise<string> {
    const apiName = 'llm-ops-demo-api';

    // 既存のAPIを確認
    const { items } = await apiGatewayClient.send(new GetRestApisCommand({}));
    let apiId = items?.find(api => api.name === apiName)?.id;

    if (!apiId) {
        console.log(`Creating API Gateway: ${apiName}`);
        const { id } = await apiGatewayClient.send(new CreateRestApiCommand({
            name: apiName,
            description: 'LLM Ops Demo API',
        }));
        apiId = id!;
    } else {
        console.log(`API Gateway already exists: ${apiName}`);
    }

    // リソースを取得
    const { items: resources } = await apiGatewayClient.send(new GetResourcesCommand({ restApiId: apiId }));
    const rootResource = resources?.find(r => r.path === '/');

    if (!rootResource) {
        throw new Error('Root resource not found');
    }

    // Lambda統合を設定（プロキシ統合）
    await apiGatewayClient.send(new PutMethodCommand({
        restApiId: apiId,
        resourceId: rootResource.id!,
        httpMethod: 'ANY',
        authorizationType: 'NONE',
    }));

    await apiGatewayClient.send(new PutIntegrationCommand({
        restApiId: apiId,
        resourceId: rootResource.id!,
        httpMethod: 'ANY',
        type: 'AWS_PROXY',
        integrationHttpMethod: 'POST',
        uri: `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${lambdaFunctionArn}/invocations`,
    }));

    // デプロイ
    await apiGatewayClient.send(new CreateDeploymentCommand({
        restApiId: apiId,
        stageName: 'dev',
    }));

    // Lambda権限を追加
    try {
        await lambdaClient.send(new AddPermissionCommand({
            FunctionName: lambdaFunctionArn.split(':').pop()!,
            StatementId: 'apigateway-invoke',
            Action: 'lambda:InvokeFunction',
            Principal: 'apigateway.amazonaws.com',
            SourceArn: `arn:aws:execute-api:${region}:${accountId}:${apiId}/*/*`,
        }));
    } catch (error) {
        // 権限が既に存在する場合はスキップ
    }

    const apiUrl = `https://${apiId}.execute-api.${region}.amazonaws.com/dev`;
    console.log(`API Gateway URL: ${apiUrl}`);
    return apiUrl;
}

/**
 * CloudWatch Logsサブスクリプションフィルターを設定
 */
async function setupSubscriptionFilter(
    logGroupName: string,
    filterName: string,
    lambdaFunctionArn: string
): Promise<void> {
    // 既存のフィルターを確認
    const { subscriptionFilters } = await logsClient.send(new DescribeSubscriptionFiltersCommand({
        logGroupName,
    }));

    if (subscriptionFilters?.some(f => f.filterName === filterName)) {
        console.log(`Subscription filter already exists: ${filterName}`);
        return;
    }

    console.log(`Creating subscription filter: ${filterName}`);
    await logsClient.send(new PutSubscriptionFilterCommand({
        logGroupName,
        filterName,
        filterPattern: '{ $.severity = "ERROR" }',
        destinationArn: lambdaFunctionArn,
    }));

    // Lambda権限を追加
    try {
        await lambdaClient.send(new AddPermissionCommand({
            FunctionName: lambdaFunctionArn.split(':').pop()!,
            StatementId: 'cloudwatch-logs-invoke',
            Action: 'lambda:InvokeFunction',
            Principal: 'logs.amazonaws.com',
            SourceArn: `arn:aws:logs:${region}:${accountId}:log-group:${logGroupName}:*`,
        }));
    } catch (error) {
        // 権限が既に存在する場合はスキップ
    }

    console.log(`Subscription filter created: ${filterName}`);
}

/**
 * メイン処理
 */
async function main() {
    console.log('=== LLM Ops Demo - Deployment Script ===\n');

    // 1. TypeScriptをビルド
    console.log('Step 1: Building TypeScript...');
    await exec('npm run build');
    console.log('Build completed\n');

    // 2. ZIPファイルを作成
    console.log('Step 2: Creating ZIP files...');
    const sampleAppZip = path.join(__dirname, '../../lambda-sample-app.zip');
    const triggerZip = path.join(__dirname, '../../lambda-trigger.zip');

    await createZipFile(path.join(__dirname, '../../dist/lambda/sample-app'), sampleAppZip);
    await createZipFile(path.join(__dirname, '../../dist/lambda/trigger-workflow'), triggerZip);
    console.log('ZIP files created\n');

    // 3. IAMロールを作成
    console.log('Step 3: Creating IAM roles...');
    const sampleAppRoleArn = await ensureIAMRole('llm-ops-sample-app-role', [
        'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
    ]);

    const triggerRoleArn = await ensureIAMRole('llm-ops-trigger-role', [
        'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
    ]);
    console.log('IAM roles created\n');

    // 4. サンプルアプリLambdaをデプロイ
    console.log('Step 4: Deploying sample app Lambda...');
    const sampleAppArn = await deployLambdaFunction(
        'llm-ops-sample-app',
        sampleAppZip,
        'index.handler',
        sampleAppRoleArn
    );
    console.log('Sample app Lambda deployed\n');

    // 5. API Gatewayを作成
    console.log('Step 5: Creating API Gateway...');
    const apiUrl = await createAPIGateway(sampleAppArn);
    console.log('API Gateway created\n');

    // 6. トリガーLambdaをデプロイ
    console.log('Step 6: Deploying trigger Lambda...');
    const triggerArn = await deployLambdaFunction(
        'llm-ops-trigger-workflow',
        triggerZip,
        'index.handler',
        triggerRoleArn,
        {
            GITHUB_TOKEN: githubToken,
            GITHUB_OWNER: githubOwner,
            GITHUB_REPO: githubRepo,
        }
    );
    console.log('Trigger Lambda deployed\n');

    // 7. CloudWatch Logsサブスクリプションフィルターを設定
    console.log('Step 7: Setting up CloudWatch Logs subscription filter...');
    await setupSubscriptionFilter(
        '/aws/lambda/llm-ops-sample-app',
        'error-detection-filter',
        triggerArn
    );
    console.log('Subscription filter configured\n');

    // 8. 完了メッセージ
    console.log('=== Deployment Completed Successfully! ===\n');
    console.log('API Gateway URL:', apiUrl);
    console.log('\nTest endpoints:');
    console.log(`  - Health check: ${apiUrl}/`);
    console.log(`  - Null reference error: ${apiUrl}/error/null-reference`);
    console.log(`  - Type error: ${apiUrl}/error/type-error`);
    console.log(`  - Async error: ${apiUrl}/error/async-error`);
    console.log(`  - Custom error: ${apiUrl}/error/custom (POST with body: { "message": "..." })`);
}

main().catch(console.error);
