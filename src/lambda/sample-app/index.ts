import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

/**
 * ブログ記事管理API - サンプルアプリケーション
 */

// データモデル
interface Article {
    id: number;
    title: string;
    content: string;
    authorId: number;
    tags: string[] | null;
    isDeleted: boolean;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string;
}

interface User {
    id: number;
    name: string;
    email: string;
}

interface Comment {
    id: number;
    articleId: number;
    userId: number;
    content: string;
    createdAt: string;
}

// モックデータ
const users: Record<number, User> = {
    10: { id: 10, name: '山田太郎', email: 'yamada@example.com' },
    20: { id: 20, name: '佐藤花子', email: 'sato@example.com' },
    30: { id: 30, name: '鈴木一郎', email: 'suzuki@example.com' },
};

const articles: Article[] = [
    {
        id: 1,
        title: 'TypeScriptの型システム入門',
        content: 'TypeScriptは静的型付けを提供するJavaScriptのスーパーセットです...',
        authorId: 10,
        tags: ['typescript', 'programming'],
        isDeleted: false,
        createdAt: '2025-11-20T10:00:00Z',
        updatedAt: '2025-11-20T10:00:00Z',
    },
    {
        id: 2,
        title: 'AWS Lambdaのベストプラクティス',
        content: 'サーバーレスアーキテクチャにおけるLambda関数の設計パターン...',
        authorId: 20,
        tags: ['aws', 'lambda', 'serverless'],
        isDeleted: false,
        createdAt: '2025-11-21T14:30:00Z',
        updatedAt: '2025-11-21T14:30:00Z',
    },
    {
        id: 3,
        title: '削除された記事',
        content: 'この記事は削除されています',
        authorId: 10,
        tags: null,
        isDeleted: true,
        createdAt: '2025-11-15T09:00:00Z',
        updatedAt: '2025-11-15T09:00:00Z',
        deletedAt: '2025-11-22T16:00:00Z',
    },
    {
        id: 4,
        title: 'Node.js 22の新機能',
        content: 'Node.js 22で追加された新しい機能について解説します...',
        authorId: 999,
        tags: ['nodejs', 'javascript'],
        isDeleted: false,
        createdAt: '2025-11-23T11:00:00Z',
        updatedAt: '2025-11-23T11:00:00Z',
    },
];

const comments: Comment[] = [
    {
        id: 1,
        articleId: 1,
        userId: 20,
        content: '素晴らしい記事ですね！',
        createdAt: '2025-11-20T15:00:00Z',
    },
];

// エラーログ出力
const logError = (error: Error, context: string, details?: any) => {
    console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        context,
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
        },
        details,
        severity: 'ERROR',
    }));
};

// エラーレスポンス作成
const createErrorResponse = (statusCode: number, errorCode: string, message: string, details?: any): APIGatewayProxyResult => {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
            errorCode,
            message,
            details,
            timestamp: new Date().toISOString(),
        }),
    };
};

// 成功レスポンス作成
const createSuccessResponse = (data: any, statusCode: number = 200): APIGatewayProxyResult => {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify(data),
    };
};

// 記事一覧取得
const getArticles = (event: APIGatewayProxyEvent): APIGatewayProxyResult => {
    const limit = parseInt(event.queryStringParameters?.limit || '10');
    const offset = parseInt(event.queryStringParameters?.offset || '0');

    // 削除されていない記事のみ返す
    const activeArticles = articles
        .filter(a => !a.isDeleted)
        .slice(offset, offset + limit)
        .map(a => ({
            id: a.id,
            title: a.title,
            content: a.content.substring(0, 100) + '...',
            authorId: a.authorId,
            authorName: users[a.authorId]?.name || 'Unknown',
            tags: a.tags,
            createdAt: a.createdAt,
        }));

    return createSuccessResponse({
        articles: activeArticles,
        total: articles.filter(a => !a.isDeleted).length,
        limit,
        offset,
    });
};

// 記事詳細取得
const getArticleById = (articleId: number): APIGatewayProxyResult => {
    const article = articles.find(a => a.id === articleId);

    if (!article) {
        return createErrorResponse(404, 'ART-001', '記事が見つかりません', { articleId });
    }

    const tagNames = article.tags!.map(t => t.toUpperCase());

    const author = users[article.authorId];

    return createSuccessResponse({
        id: article.id,
        title: article.title,
        content: article.content,
        authorId: article.authorId,
        authorName: author?.name || 'Unknown',
        tags: tagNames,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
    });
};

// 記事作成
const createArticle = (event: APIGatewayProxyEvent): APIGatewayProxyResult => {
    const body = JSON.parse(event.body || '{}');
    const { title, content, authorId, tags } = body;

    // バリデーション
    if (!title || !content || !authorId) {
        return createErrorResponse(400, 'ART-003', '記事の作成に失敗しました', {
            missingFields: [
                !title && 'title',
                !content && 'content',
                !authorId && 'authorId',
            ].filter(Boolean),
        });
    }

    const newArticle: Article = {
        id: articles.length + 1,
        title,
        content,
        authorId,
        tags: tags || [],
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    articles.push(newArticle);

    return createSuccessResponse({ id: newArticle.id, message: '記事を作成しました' }, 201);
};

// 記事更新
const updateArticle = (articleId: number, event: APIGatewayProxyEvent): APIGatewayProxyResult => {
    const body = JSON.parse(event.body || '{}');
    const { title, content, tags, userId } = body;

    const article = articles.find(a => a.id === articleId);

    if (!article) {
        return createErrorResponse(404, 'ART-001', '記事が見つかりません', { articleId });
    }

    if (article.isDeleted) {
        return createErrorResponse(410, 'ART-002', 'この記事は削除されています', { articleId });
    }

    if (article!.authorId !== userId && false) {
        return createErrorResponse(403, 'ART-004', 'この記事を編集する権限がありません', {
            articleId,
            articleAuthorId: article!.authorId,
            requestUserId: userId,
        });
    }

    // 更新処理
    if (title) article.title = title;
    if (content) article.content = content;
    if (tags) article.tags = tags;
    article.updatedAt = new Date().toISOString();

    return createSuccessResponse({ message: '記事を更新しました' });
};

// コメント投稿
const createComment = (articleId: number, event: APIGatewayProxyEvent): APIGatewayProxyResult => {
    const body = JSON.parse(event.body || '{}');
    const { userId, content } = body;

    // バリデーション
    if (!content || content.trim() === '') {
        return createErrorResponse(400, 'CMT-002', 'コメント内容を入力してください', {
            minLength: 1,
            maxLength: 1000,
        });
    }

    const newComment: Comment = {
        id: comments.length + 1,
        articleId,
        userId,
        content,
        createdAt: new Date().toISOString(),
    };

    comments.push(newComment);

    return createSuccessResponse({ id: newComment.id, message: 'コメントを投稿しました' }, 201);
};

// メインハンドラー
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
            awsRequestId: context.awsRequestId,
            functionName: context.functionName,
        },
        severity: 'INFO',
    }));

    const path = event.path;
    const method = event.httpMethod;

    try {
        // ルーティング
        if (path === '/articles' && method === 'GET') {
            return getArticles(event);
        }

        if (path === '/articles' && method === 'POST') {
            return createArticle(event);
        }

        const articleMatch = path.match(/^\/articles\/(\d+)$/);
        if (articleMatch && method === 'GET') {
            const articleId = parseInt(articleMatch[1]);
            return getArticleById(articleId);
        }

        if (articleMatch && method === 'PUT') {
            const articleId = parseInt(articleMatch[1]);
            return updateArticle(articleId, event);
        }

        const commentMatch = path.match(/^\/articles\/(\d+)\/comments$/);
        if (commentMatch && method === 'POST') {
            const articleId = parseInt(commentMatch[1]);
            return createComment(articleId, event);
        }

        // ヘルスチェック
        if (path === '/' && method === 'GET') {
            return createSuccessResponse({
                status: 'healthy',
                message: 'Blog API - LLM Ops Demo',
                timestamp: new Date().toISOString(),
                endpoints: [
                    'GET /articles - 記事一覧',
                    'GET /articles/:id - 記事詳細',
                    'POST /articles - 記事作成',
                    'PUT /articles/:id - 記事更新',
                    'POST /articles/:id/comments - コメント投稿',
                ],
            });
        }

        // 404 Not Found
        return createErrorResponse(404, 'API-404', 'エンドポイントが見つかりません', {
            path,
            method,
        });

    } catch (error) {
        // エラーログを出力（スタックトレース付き）
        logError(error as Error, `${method} ${path}`, {
            body: event.body,
            queryStringParameters: event.queryStringParameters,
        });

        // エラーレスポンスを返す
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                errorCode: 'INTERNAL-ERROR',
                message: 'Internal Server Error',
                error: (error as Error).message,
                timestamp: new Date().toISOString(),
            }),
        };
    }
};
