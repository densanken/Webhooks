# Webhooks

Webhook のプロキシサーバー

レート制限 (HTTP 429) を自動的にハンドリングし、メッセージの配信を保証します。

Deno + Hono で構築され、Deno KV をデータストアとして使用します。

## セットアップ

```bash
# 依存関係のインストール
deno install

# 環境変数の設定
cp .env.example .env
# .env を編集して必要な値を設定
```

## 使い方

```bash
# 開発サーバーの起動 (ホットリロード)
deno task dev

# 本番起動
deno task start
```

## 開発

```bash
# フォーマット修正
deno task fmt

# テスト
deno task test

# リント & フォーマット チェック
deno task lint
```
