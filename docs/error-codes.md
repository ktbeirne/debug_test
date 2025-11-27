# エラーコード設計書

## 概要

このドキュメントは、ブログ記事管理APIで使用されるエラーコードの定義と、各エラーの発生条件、推奨される対処方法を記載しています。

## エラーコード体系

エラーコードは以下の形式で定義されます：
```
[カテゴリ]-[番号]
```

- カテゴリ: 3文字の英字（ART, USR, CMT等）
- 番号: 3桁の数字（001-999）

## 記事関連エラー (ART-xxx)

### ART-001: 記事が見つかりません
**発生条件**: 指定されたIDの記事がデータベースに存在しない場合

**HTTPステータス**: 404 Not Found

**レスポンス例**:
```json
{
  "errorCode": "ART-001",
  "message": "記事が見つかりません",
  "details": {
    "articleId": 999
  }
}
```

**対処方法**: 
- クライアント側で有効な記事IDを指定する
- 記事一覧APIで存在する記事を確認する

---

### ART-002: 削除済み記事へのアクセス
**発生条件**: `isDeleted`フラグがtrueの記事にアクセスした場合

**HTTPステータス**: 410 Gone

**レスポンス例**:
```json
{
  "errorCode": "ART-002",
  "message": "この記事は削除されています",
  "details": {
    "articleId": 123,
    "deletedAt": "2025-11-20T10:30:00Z"
  }
}
```

**対処方法**:
- 削除済み記事は復元できません
- 記事一覧から除外する

**重要**: このエラーは必ず記事取得時にチェックすること。`isDeleted`フラグのチェック漏れは重大なバグとなります。

---

### ART-003: 記事の作成に失敗しました
**発生条件**: 必須フィールドが不足している、またはバリデーションエラーがある場合

**HTTPステータス**: 400 Bad Request

**レスポンス例**:
```json
{
  "errorCode": "ART-003",
  "message": "記事の作成に失敗しました",
  "details": {
    "missingFields": ["title", "content"],
    "invalidFields": {
      "authorId": "存在しないユーザーIDです"
    }
  }
}
```

**必須フィールド**:
- `title`: 文字列、1-200文字
- `content`: 文字列、1-10000文字
- `authorId`: 数値、存在するユーザーID
- `tags`: 配列、0-10個のタグ

---

### ART-004: 権限がありません
**発生条件**: 他人の記事を編集・削除しようとした場合

**HTTPステータス**: 403 Forbidden

**レスポンス例**:
```json
{
  "errorCode": "ART-004",
  "message": "この記事を編集する権限がありません",
  "details": {
    "articleId": 123,
    "articleAuthorId": 10,
    "requestUserId": 20
  }
}
```

**対処方法**:
- 自分が作成した記事のみ編集可能
- 管理者権限が必要な場合は別途実装

---

## ユーザー関連エラー (USR-xxx)

### USR-001: ユーザーが見つかりません
**発生条件**: 指定されたユーザーIDが存在しない場合

**HTTPステータス**: 404 Not Found

**レスポンス例**:
```json
{
  "errorCode": "USR-001",
  "message": "ユーザーが見つかりません",
  "details": {
    "userId": 999
  }
}
```

---

### USR-002: 認証に失敗しました
**発生条件**: 認証トークンが無効または期限切れの場合

**HTTPステータス**: 401 Unauthorized

**レスポンス例**:
```json
{
  "errorCode": "USR-002",
  "message": "認証に失敗しました",
  "details": {
    "reason": "トークンの有効期限が切れています"
  }
}
```

---

## コメント関連エラー (CMT-xxx)

### CMT-001: 親記事が存在しません
**発生条件**: コメントを投稿しようとした記事が存在しない、または削除済みの場合

**HTTPステータス**: 404 Not Found

**レスポンス例**:
```json
{
  "errorCode": "CMT-001",
  "message": "コメント先の記事が見つかりません",
  "details": {
    "articleId": 999
  }
}
```

**重要**: コメント投稿前に必ず親記事の存在と削除フラグをチェックすること。

---

### CMT-002: コメントが空です
**発生条件**: コメント内容が空文字列または空白のみの場合

**HTTPステータス**: 400 Bad Request

**レスポンス例**:
```json
{
  "errorCode": "CMT-002",
  "message": "コメント内容を入力してください",
  "details": {
    "minLength": 1,
    "maxLength": 1000
  }
}
```

---

## エラーハンドリングのベストプラクティス

### 1. エラーレスポンスの統一フォーマット

すべてのエラーは以下の形式で返すこと：

```typescript
interface ErrorResponse {
  errorCode: string;      // 例: "ART-002"
  message: string;        // ユーザー向けメッセージ
  details?: any;          // 詳細情報（オプション）
  timestamp?: string;     // エラー発生時刻（オプション）
}
```

### 2. ログ出力

エラー発生時は必ずCloudWatch Logsに以下の情報を出力すること：

```typescript
console.error(JSON.stringify({
  timestamp: new Date().toISOString(),
  errorCode: 'ART-002',
  message: 'この記事は削除されています',
  context: 'GET /articles/123',
  details: { articleId: 123 },
  severity: 'ERROR'
}));
```

### 3. エラーチェックの順序

1. 認証チェック（USR-002）
2. リソースの存在チェック（ART-001, USR-001）
3. 削除フラグチェック（ART-002）
4. 権限チェック（ART-004）
5. バリデーション（ART-003, CMT-002）

---

## よくあるバグパターン

### ❌ バグ例1: 削除フラグのチェック漏れ

```typescript
// 悪い例
const article = articles.find(a => a.id === id);
return article.content;  // isDeletedをチェックしていない！
```

```typescript
// 良い例
const article = articles.find(a => a.id === id);
if (!article) throw new Error('ART-001');
if (article.isDeleted) throw new Error('ART-002');
return article.content;
```

### ❌ バグ例2: null/undefinedチェック漏れ

```typescript
// 悪い例
const author = users[article.authorId];
return author.name;  // authorがundefinedの可能性！
```

```typescript
// 良い例
const author = users[article.authorId];
if (!author) throw new Error('USR-001');
return author.name;
```

### ❌ バグ例3: 配列操作のnullチェック漏れ

```typescript
// 悪い例
return article.tags.map(t => t.name);  // tagsがnullの可能性！
```

```typescript
// 良い例
if (!article.tags) return [];
return article.tags.map(t => t.name);
```
