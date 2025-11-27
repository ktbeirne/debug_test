const { LambdaClient, CreateFunctionCommand, UpdateFunctionCodeCommand, GetFunctionCommand, AddPermissionCommand } = require('@aws-sdk/client-lambda');
const { APIGatewayClient, CreateRestApiCommand, GetResourcesCommand, CreateResourceCommand, PutMethodCommand, PutIntegrationCommand, CreateDeploymentCommand } = require('@aws-sdk/client-api-gateway');
const { IAMClient, GetRoleCommand } = require('@aws-sdk/client-iam');
const fs = require('fs');
const path = require('path');

const REGION = 'ap-northeast-1';
const FUNCTION_NAME = 'llm-ops-user-api-stub';
const API_NAME = 'llm-ops-user-api';
const STAGE_NAME = 'prod';

const lambdaClient = new LambdaClient({ region: REGION });
const apiGatewayClient = new APIGatewayClient({ region: REGION });
const iamClient = new IAMClient({ region: REGION });

async function deployStubAPI() {
    console.log('🚀 Starting Stub API deployment...\n');

    try {
        // 1. Lambda関数のデプロイ
        console.log('📦 Step 1: Deploying Lambda function...');
        const lambdaArn = await deployLambdaFunction();
        console.log(`✅ Lambda deployed: ${lambdaArn}\n`);

        // 2. API Gateway作成
        console.log('🌐 Step 2: Creating API Gateway...');
        const apiId = await createAPIGateway();
        console.log(`✅ API Gateway created: ${apiId}\n`);

        // 3. リソースとメソッド作成
        console.log('🔧 Step 3: Configuring API Gateway resources...');
        await configureAPIGateway(apiId, lambdaArn);
        console.log('✅ API Gateway configured\n');

        // 4. Lambda実行パーミッション追加
        console.log('🔑 Step 4: Adding Lambda permission...');
        await addLambdaPermission(lambdaArn, apiId);
        console.log('✅ Permission added\n');

        // 5. API Gatewayデプロイ
        console.log('🚀 Step 5: Deploying API Gateway...');
        const apiUrl = await deployAPIGateway(apiId);
        console.log(`✅ API Gateway deployed\n`);

        // 完了
        console.log('✅ Deployment completed!\n');
        console.log('📝 API Endpoint:');
        console.log(`   ${apiUrl}/users/{id}`);
        console.log('\n💡 Next step:');
        console.log(`   Set USER_API_URL="${apiUrl}/users" in sample-app Lambda environment variables`);
        console.log('\n🧪 Test:');
        console.log(`   curl ${apiUrl}/users/999`);

    } catch (error) {
        console.error('❌ Deployment failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

async function deployLambdaFunction() {
    const zipPath = path.join(__dirname, 'stub-api-lambda.zip');
    const zipBuffer = fs.readFileSync(zipPath);

    // Lambda実行ロール（sample-appと同じものを使用）
    const roleArn = 'arn:aws:iam::448120078826:role/llm-ops-sample-app-role';
    console.log(`   Using role: ${roleArn}`);

    // Lambda関数が既に存在するかチェック
    let functionExists = false;
    try {
        await lambdaClient.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
        functionExists = true;
        console.log(`   Function exists, updating code...`);
    } catch (error) {
        console.log(`   Creating new function...`);
    }

    if (functionExists) {
        // 既存の関数を更新
        const response = await lambdaClient.send(new UpdateFunctionCodeCommand({
            FunctionName: FUNCTION_NAME,
            ZipFile: zipBuffer,
        }));
        return response.FunctionArn;
    } else {
        // 新規作成
        const response = await lambdaClient.send(new CreateFunctionCommand({
            FunctionName: FUNCTION_NAME,
            Runtime: 'python3.12',
            Role: roleArn,
            Handler: 'lambda_function.lambda_handler',
            Code: {
                ZipFile: zipBuffer,
            },
            Timeout: 30,
            MemorySize: 128,
        }));
        return response.FunctionArn;
    }
}

async function createAPIGateway() {
    const response = await apiGatewayClient.send(new CreateRestApiCommand({
        name: API_NAME,
        description: 'User API stub for LLM Ops demo',
        endpointConfiguration: {
            types: ['REGIONAL']
        }
    }));
    return response.id;
}

async function configureAPIGateway(apiId, lambdaArn) {
    // ルートリソースを取得
    const resourcesResponse = await apiGatewayClient.send(new GetResourcesCommand({ restApiId: apiId }));
    const rootResource = resourcesResponse.items.find(r => r.path === '/');

    // /users リソース作成
    const usersResource = await apiGatewayClient.send(new CreateResourceCommand({
        restApiId: apiId,
        parentId: rootResource.id,
        pathPart: 'users'
    }));

    // /users/{id} リソース作成
    const userIdResource = await apiGatewayClient.send(new CreateResourceCommand({
        restApiId: apiId,
        parentId: usersResource.id,
        pathPart: '{id}'
    }));

    // GET メソッド作成
    await apiGatewayClient.send(new PutMethodCommand({
        restApiId: apiId,
        resourceId: userIdResource.id,
        httpMethod: 'GET',
        authorizationType: 'NONE',
    }));

    // Lambda統合
    await apiGatewayClient.send(new PutIntegrationCommand({
        restApiId: apiId,
        resourceId: userIdResource.id,
        httpMethod: 'GET',
        type: 'AWS_PROXY',
        integrationHttpMethod: 'POST',
        uri: `arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${lambdaArn}/invocations`,
    }));
}

async function addLambdaPermission(lambdaArn, apiId) {
    const accountId = '448120078826';
    try {
        await lambdaClient.send(new AddPermissionCommand({
            FunctionName: FUNCTION_NAME,
            StatementId: `apigateway-${apiId}`,
            Action: 'lambda:InvokeFunction',
            Principal: 'apigateway.amazonaws.com',
            SourceArn: `arn:aws:execute-api:${REGION}:${accountId}:${apiId}/*/*`,
        }));
    } catch (error) {
        if (error.name === 'ResourceConflictException') {
            console.log('   Permission already exists, skipping...');
        } else {
            throw error;
        }
    }
}

async function deployAPIGateway(apiId) {
    await apiGatewayClient.send(new CreateDeploymentCommand({
        restApiId: apiId,
        stageName: STAGE_NAME,
    }));

    return `https://${apiId}.execute-api.${REGION}.amazonaws.com/${STAGE_NAME}`;
}

// 実行
deployStubAPI();
