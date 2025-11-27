# エンドツーエンドテスト手順

## 概要

このドキュメントでは、CloudWatchエラー検知からClaude Code解析までの完全なフローをテストする手順を説明します。

## 前提条件

- Lambda関数がデプロイ済み
- CloudWatch Logsサブスクリプションフィルター設定済み
- GitHub Actionsワークフロー設定済み
- Claude for GitHub Appがリポジトリにインストール済み

## テスト手順

### 1. エラーを発生させる

サンプルアプリのAPIにリクエストを送信してエラーを発生させます：

```bash
# 記事ID=3でnullポインタエラーを発生させる
curl https://5zp7c0rge0.execute-api.ap-northeast-1.amazonaws.com/dev/articles/3
```

**期待されるレスポンス:**
```json
{
  "errorCode": "INTERNAL-ERROR",
  "message": "Internal Server Error",
  "error": "Cannot read properties of null (reading 'map')",
  "timestamp": "2025-11-27T06:42:50.925Z"
}
```

### 2. フローの確認

エラー発生後、以下のフローが自動的に実行されます：

1. **CloudWatch Logs** (即座)
   - エラーログが `/aws/lambda/llm-ops-sample-app` に記録される
   - Subscription Filterが `$.severity = "ERROR"` でフィルタリング

2. **Trigger Lambda** (数秒後)
   - CloudWatch Logsイベントを受信
   - GitHub Actions `repository_dispatch` イベントを送信
   - ログ: `GitHub Actions triggered successfully (status 204 = success)`

3. **GitHub Actions** (数秒後)
   - `error-analysis.yml` ワークフローが起動
   - GitHub Issueを自動作成
   - `@claude` メンションのコメントを追加

4. **Claude for GitHub** (1-2分後)
   - `@claude` メンションに反応
   - リポジトリのコードを解析
   - 解析結果をIssueにコメント

### 3. 結果確認

#### GitHub Issueの確認

```bash
# 最新のIssueを確認
gh issue list --repo ktbeirne/debug_test --limit 5

# 特定のIssueを詳細表示
gh issue view <issue-number> --repo ktbeirne/debug_test --comments
```

または、ブラウザで確認：
```
https://github.com/ktbeirne/debug_test/issues
```

#### CloudWatch Logsの確認

AWS Console → CloudWatch → Log groups → `/aws/lambda/llm-ops-sample-app`

#### Trigger Lambdaログの確認

AWS Console → CloudWatch → Log groups → `/aws/lambda/llm-ops-trigger-workflow`

確認ポイント：
- `Triggering GitHub Actions with payload`
- `Target repository: ktbeirne/debug_test`
- `GitHub API Response: {"status":204,...}`
- `GitHub Actions triggered successfully`

#### GitHub Actionsの確認

```bash
# ワークフロー実行履歴を確認
gh run list --repo ktbeirne/debug_test --limit 5

# 特定のワークフロー実行を詳細表示
gh run view <run-id> --repo ktbeirne/debug_test
```

または、ブラウザで確認：
```
https://github.com/ktbeirne/debug_test/actions
```

## その他のテストケース

### 記事ID=4（存在しないユーザー）

```bash
curl https://5zp7c0rge0.execute-api.ap-northeast-1.amazonaws.com/dev/articles/4
```

このリクエストは正常に処理されますが、authorNameが"Unknown"になります（エラーではない）。

### 記事作成（著者ID存在チェック漏れ）

```bash
curl -X POST https://5zp7c0rge0.execute-api.ap-northeast-1.amazonaws.com/dev/articles \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","content":"Test content","authorId":999,"tags":["test"]}'
```

このリクエストは成功しますが、存在しないユーザーIDで記事が作成されます（バグ）。

## トラブルシューティング

### Issueが作成されない

1. CloudWatch Logsにエラーが記録されているか確認
2. Trigger Lambdaのログでエラーがないか確認
3. GitHub Actionsが起動しているか確認

### Claudeが反応しない

1. Claude for GitHub Appがインストールされているか確認
2. Claude.aiでGitHub連携されているか確認
3. Issueのコメントに`@claude`メンションがあるか確認（本文ではなくコメント）

### GitHub Actions が403エラー

`permissions: issues: write` がワークフローに設定されているか確認

## API Gateway URL

現在のURL:
```
https://5zp7c0rge0.execute-api.ap-northeast-1.amazonaws.com/dev
```

再デプロイ後にURLが変わる場合は、AWS Console → API Gateway → llm-ops-demo-api → Stages → dev で確認してください。
