import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

/**
 * サンプルアプリケーション Lambda関数
 * API Gateway経由でアクセスされ、意図的にエラーを発生させるエンドポイントを提供
 */

// エラーハンドラー - CloudWatch Logsに詳細なログを出力
const logError = (error: Error, context: string) => {
    console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        context,
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
        },
        severity: 'ERROR',
    }));
};

// Null参照エラーを発生させる
const triggerNullReferenceError = (): never => {
    const obj: any = null;
    // @ts-ignore - 意図的なエラー
    return obj.property.nested;
};

// 型エラーを発生させる
const triggerTypeError = (): never => {
    const num: any = 123;
    // @ts-ignore - 意図的なエラー
    return num.toUpperCase();
};

// 非同期エラーを発生させる
const triggerAsyncError = async (): Promise<never> => {
    await new Promise(resolve => setTimeout(resolve, 100));
    throw new Error('非同期処理中にエラーが発生しました');
};

// カスタムエラーを発生させる
const triggerCustomError = (message: string): never => {
    throw new Error(message);
};

export const handler = async (
    event: APIGatewayProxyEvent,
    context: Context
): Promise<APIGatewayProxyResult> => {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: {
            path: event.path,
            httpMethod: event.httpMethod,
            headers: event.headers,
        },
        context: {
            requestId: context.requestId,
            functionName: context.functionName,
        },
        severity: 'INFO',
    }));

    const path = event.path;
    const method = event.httpMethod;

    try {
        // ルーティング
        if (path === '/' && method === 'GET') {
            // ヘルスチェック
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    status: 'healthy',
                    message: 'LLM Ops Demo - Sample Application',
                    timestamp: new Date().toISOString(),
                    endpoints: [
                        'GET / - ヘルスチェック',
                        'GET /error/null-reference - Null参照エラー',
                        'GET /error/type-error - 型エラー',
                        'GET /error/async-error - 非同期エラー',
                        'POST /error/custom - カスタムエラー (body: { message: string })',
                    ],
                }),
            };
        }

        // エラーエンドポイント
        if (path === '/error/null-reference' && method === 'GET') {
            triggerNullReferenceError();
        }

        if (path === '/error/type-error' && method === 'GET') {
            triggerTypeError();
        }

        if (path === '/error/async-error' && method === 'GET') {
            await triggerAsyncError();
        }

        if (path === '/error/custom' && method === 'POST') {
            const body = event.body ? JSON.parse(event.body) : {};
            const message = body.message || 'カスタムエラーメッセージが指定されていません';
            triggerCustomError(message);
        }

        // 404 Not Found
        return {
            statusCode: 404,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                error: 'Not Found',
                message: `Path ${path} with method ${method} not found`,
            }),
        };

    } catch (error) {
        // エラーログを出力
        logError(error as Error, `${method} ${path}`);

        // エラーレスポンスを返す
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: (error as Error).message,
                timestamp: new Date().toISOString(),
            }),
        };
    }
};
