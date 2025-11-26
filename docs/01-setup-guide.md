# 環境構築ガイド

このガイドでは、AWSアカウントとGitHubアカウントのみの状態から、LLM Opsデモ環境を構築する手順を説明します。

## 📋 前提条件の確認

以下のアカウントとサブスクリプションが必要です:

- ✅ AWSアカウント
- ✅ GitHubアカウント
- ✅ Claude Code（Maxプランのサブスクリプション）

## 1. Node.js環境のセットアップ

### Windows

**nvm-windowsを使用（推奨）**:

1. [nvm-windows](https://github.com/coreybutler/nvm-windows/releases)をダウンロードしてインストール

2. PowerShellを管理者権限で開き、Node.js 22をインストール:

```powershell
nvm install 22
nvm use 22
node --version  # v22.x.x が表示されることを確認
```

**または、Node.js公式インストーラーを使用**:

1. [Node.js公式サイト](https://nodejs.org/)からLTS版（22.x）をダウンロード
2. インストーラーを実行
3. インストール完了後、PowerShellで確認:

```powershell
node --version
npm --version
```

## 2. AWS CLIのインストールと設定

### AWS CLIのインストール

1. [AWS CLI公式ページ](https://aws.amazon.com/cli/)からWindows用インストーラーをダウンロード
2. インストーラーを実行
3. インストール完了後、PowerShellで確認:

```powershell
aws --version
```

### AWS CLIの設定

1. AWSマネジメントコンソールにログイン

2. IAMユーザーを作成（または既存のユーザーを使用）:
   - IAM → ユーザー → ユーザーを追加
   - アクセスキーを作成（プログラムによるアクセス）
   - 必要な権限:
     - `AWSLambda_FullAccess`
     - `IAMFullAccess`
     - `CloudWatchLogsFullAccess`
     - `AmazonAPIGatewayAdministrator`

3. アクセスキーとシークレットキーをメモ

4. AWS CLIを設定:

```powershell
aws configure
```

以下の情報を入力:
```
AWS Access Key ID: <アクセスキー>
AWS Secret Access Key: <シークレットキー>
Default region name: ap-northeast-1
Default output format: json
```

5. 設定を確認:

```powershell
aws sts get-caller-identity
```

アカウントIDとユーザー情報が表示されればOKです。

## 3. AWSアカウントIDの取得

```powershell
aws sts get-caller-identity --query Account --output text
```

表示されたアカウントIDをメモしてください。

## 4. Claude for GitHubのインストール

> [!IMPORTANT]
> Claude Code（Maxプランのサブスクリプション）が必要です。

1. GitHubリポジトリのページを開く（`https://github.com/your-username/llm-ops`）

2. リポジトリの「Settings」タブをクリック

3. 左サイドバーの「Integrations」→「GitHub Apps」をクリック

4. 「Browse GitHub Marketplace」をクリック

5. 検索ボックスで「Claude for GitHub」を検索

6. 「Claude for GitHub」を選択

7. 「Install it for free」をクリック

8. プランを選択:
   - 「Free」プラン（Claude Maxサブスクリプションが必要）を選択
   - 「Complete order and begin installation」をクリック

9. インストール先を選択:
   - 「Only select repositories」を選択
   - `llm-ops`リポジトリを選択
   - 「Install」をクリック

10. 権限を確認して承認

11. インストール完了後、リポジトリの「Settings」→「Integrations」→「GitHub Apps」で「Claude for GitHub」が表示されることを確認

> [!NOTE]
> **Claude for GitHubの仕組み**:
> - GitHub Appとして動作するため、API Keyは不要
> - GitHub Issueで `@claude-code` とメンションすることで自動的に解析が開始
> - リポジトリのコードを読み取り、コンテキストを理解して解析
> - Claude Maxプランのサブスクリプションが必要（月額$20）

> [!TIP]
> Claude Maxプランをまだ契約していない場合:
> 1. [Claude.ai](https://claude.ai/)にアクセス
> 2. 右上のアカウントメニューから「Upgrade to Claude Pro」または「Upgrade to Max」を選択
> 3. Maxプランを選択して契約

## 5. GitHub Personal Access Tokenの作成

1. GitHubにログイン

2. Settings → Developer settings → Personal access tokens → Tokens (classic)

3. 「Generate new token (classic)」をクリック

4. トークンの設定:
   - Note: `llm-ops-demo`
   - Expiration: 90 days（または任意の期間）
   - Scopes:
     - ✅ `repo` (Full control of private repositories)
     - ✅ `workflow` (Update GitHub Action workflows)

5. 「Generate token」をクリック

6. 表示されたトークンをコピーしてメモ（**一度しか表示されません**）

## 6. プロジェクトのセットアップ

1. リポジトリをクローン:

```powershell
git clone https://github.com/your-username/llm-ops.git
cd llm-ops
```

2. 依存関係をインストール:

```powershell
npm install
```

3. 環境変数ファイルを作成:

```powershell
cp .env.example .env
```

4. `.env`ファイルを編集:

```.env
# AWS設定
AWS_REGION=ap-northeast-1
AWS_ACCOUNT_ID=123456789012  # 手順3で取得したアカウントID

# GitHub設定
GITHUB_TOKEN=ghp_xxxxxxxxxxxx  # 手順5で作成したトークン
GITHUB_OWNER=your-github-username
GITHUB_REPO=llm-ops

# Lambda関数名（デフォルトのまま）
LAMBDA_SAMPLE_APP_NAME=llm-ops-sample-app
LAMBDA_TRIGGER_NAME=llm-ops-trigger-workflow

# CloudWatch Logs
LOG_GROUP_NAME=/aws/lambda/llm-ops-sample-app
```

5. TypeScriptをビルド:

```powershell
npm run build
```

エラーが出なければ、環境構築は完了です！

## 次のステップ

環境構築が完了したら、[デプロイ手順](02-deployment.md)に進んでください。

## トラブルシューティング

### AWS CLIの認証エラー

```
Unable to locate credentials
```

→ `aws configure`を再実行して、正しいアクセスキーを設定してください。

### Node.jsのバージョンエラー

```
Error: The engine "node" is incompatible with this module
```

→ Node.js 22.x以上をインストールしてください。

### npm installのエラー

```
EACCES: permission denied
```

→ PowerShellを管理者権限で実行してください。
