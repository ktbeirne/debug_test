# アーキテクチャ設計書

## システム概要

ブログ記事管理APIは、記事の作成・閲覧・更新・削除、およびコメント機能を提供するRESTful APIです。

## データモデル

### Article（記事）

```typescript
interface Article {
  id: number;              // 記事ID（自動採番）
  title: string;           // タイトル（1-200文字）
  content: string;         // 本文（1-10000文字）
  authorId: number;        // 著者のユーザーID
  tags: string[];          // タグ配列（0-10個）
  isDeleted: boolean;      // 削除フラグ
  createdAt: string;       // 作成日時（ISO 8601形式）
  updatedAt: string;       // 更新日時（ISO 8601形式）
  deletedAt?: string;      // 削除日時（削除済みの場合のみ）
}
```

**制約**:
- `id`は一意
- `authorId`は有効なユーザーIDである必要がある
- `isDeleted`がtrueの記事は通常のAPI経由では取得不可
- 削除は論理削除（物理削除しない）

---

### User（ユーザー）

```typescript
interface User {
  id: number;              // ユーザーID
  name: string;            // ユーザー名
  email: string;           // メールアドレス
  createdAt: string;       // 登録日時
}
```

---

### Comment（コメント）

```typescript
interface Comment {
  id: number;              // コメントID
  articleId: number;       // 親記事のID
  userId: number;          // コメント投稿者のユーザーID
  content: string;         // コメント内容（1-1000文字）
  createdAt: string;       // 投稿日時
}
```

**制約**:
- `articleId`は存在し、かつ削除されていない記事である必要がある
- `userId`は有効なユーザーIDである必要がある

---

## API エンドポイント

### 記事関連

#### GET /articles
記事一覧を取得

**クエリパラメータ**:
- `category`: カテゴリでフィルタ（オプション）
- `limit`: 取得件数（デフォルト: 10、最大: 100）
- `offset`: オフセット（デフォルト: 0）

**レスポンス**:
```json
{
  "articles": [
    {
      "id": 1,
      "title": "TypeScriptの型システム入門",
      "content": "...",
      "authorId": 10,
      "tags": ["typescript", "programming"],
      "createdAt": "2025-11-20T10:00:00Z"
    }
  ],
  "total": 100,
  "limit": 10,
  "offset": 0
}
```

---

#### GET /articles/:id
記事詳細を取得

**パスパラメータ**:
- `id`: 記事ID

**レスポンス**:
```json
{
  "id": 1,
  "title": "TypeScriptの型システム入門",
  "content": "TypeScriptは...",
  "authorId": 10,
  "authorName": "山田太郎",
  "tags": ["typescript", "programming"],
  "createdAt": "2025-11-20T10:00:00Z",
  "updatedAt": "2025-11-21T15:30:00Z"
}
```

**エラー**:
- `ART-001`: 記事が存在しない
- `ART-002`: 削除済み記事

**重要な実装ポイント**:
1. 記事の存在チェック
2. **削除フラグ（isDeleted）のチェック** ← これを忘れるとバグになる！
3. 著者情報の結合

---

#### POST /articles
新規記事を作成

**リクエストボディ**:
```json
{
  "title": "新しい記事",
  "content": "記事の本文...",
  "authorId": 10,
  "tags": ["tag1", "tag2"]
}
```

**レスポンス**:
```json
{
  "id": 123,
  "message": "記事を作成しました"
}
```

**エラー**:
- `ART-003`: バリデーションエラー
- `USR-001`: 存在しない著者ID

---

#### PUT /articles/:id
記事を更新

**パスパラメータ**:
- `id`: 記事ID

**リクエストボディ**:
```json
{
  "title": "更新後のタイトル",
  "content": "更新後の本文",
  "tags": ["tag1", "tag2", "tag3"]
}
```

**エラー**:
- `ART-001`: 記事が存在しない
- `ART-002`: 削除済み記事
- `ART-004`: 権限なし（他人の記事）

**重要な実装ポイント**:
1. 記事の存在チェック
2. 削除フラグのチェック
3. **権限チェック（authorIdの一致確認）** ← これを忘れると他人の記事を編集できてしまう！

---

#### DELETE /articles/:id
記事を削除（論理削除）

**エラー**:
- `ART-001`: 記事が存在しない
- `ART-004`: 権限なし

---

### コメント関連

#### POST /articles/:id/comments
記事にコメントを投稿

**パスパラメータ**:
- `id`: 記事ID

**リクエストボディ**:
```json
{
  "userId": 20,
  "content": "素晴らしい記事ですね！"
}
```

**エラー**:
- `CMT-001`: 親記事が存在しない、または削除済み
- `CMT-002`: コメントが空
- `USR-001`: 存在しないユーザーID

**重要な実装ポイント**:
1. **親記事の存在チェック** ← これを忘れると存在しない記事にコメントできてしまう！
2. **親記事の削除フラグチェック** ← 削除済み記事にコメント不可
3. ユーザーの存在チェック
4. コメント内容のバリデーション

---

## エラーハンドリング

### エラーレスポンスの統一フォーマット

すべてのエラーは以下の形式で返す：

```typescript
interface ErrorResponse {
  errorCode: string;      // 例: "ART-002"
  message: string;        // ユーザー向けメッセージ
  details?: any;          // 詳細情報
  timestamp?: string;     // エラー発生時刻
}
```

### CloudWatch Logsへのログ出力

エラー発生時は以下の形式でログ出力：

```typescript
console.error(JSON.stringify({
  timestamp: new Date().toISOString(),
  errorCode: 'ART-002',
  message: 'この記事は削除されています',
  context: 'GET /articles/123',
  details: { articleId: 123, isDeleted: true },
  severity: 'ERROR',
  stack: error.stack  // スタックトレース
}));
```

**重要**: `severity: 'ERROR'`を必ず含めること。これがCloudWatch Logsのサブスクリプションフィルターのトリガーとなる。

---

## セキュリティ考慮事項

### 1. 権限チェック

- 記事の編集・削除は著者本人のみ可能
- 実装時は必ず`article.authorId === requestUserId`をチェック

### 2. 入力バリデーション

- すべての入力値は適切にバリデーション
- SQLインジェクション対策（本実装ではメモリ内データのため不要）
- XSS対策（フロントエンド側で実施）

### 3. 削除済みデータの保護

- 削除済み記事は通常のAPI経由では取得不可
- `isDeleted`フラグのチェックを必ず実施

---

## パフォーマンス考慮事項

### 1. データ取得の最適化

- 記事一覧取得時は必要最小限のフィールドのみ返す
- ページネーション（limit/offset）を適切に実装

### 2. キャッシング

- 頻繁にアクセスされる記事はキャッシュ（本実装では未実装）
