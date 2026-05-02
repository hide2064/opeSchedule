# D-1: 遅延タスクのメール通知設計書

> 作成日: 2026-05-02

## 概要
毎日指定時刻に遅延タスクをHTMLメールで送信する。APScheduler + smtplib。

## DB変更
```sql
ALTER TABLE config ADD COLUMN notify_emails TEXT NOT NULL DEFAULT '[]';
ALTER TABLE config ADD COLUMN notify_time VARCHAR(5) NOT NULL DEFAULT '08:00';
ALTER TABLE config ADD COLUMN notify_enabled BOOLEAN NOT NULL DEFAULT FALSE;
```
Alembic: `0015_add_config_notify.py`

## 環境変数 (.env)
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASSWORD=password
SMTP_FROM=noreply@example.com
```

## バックエンド構成
- `backend/app/notify.py`: メール送信ロジック（smtplib, HTML テンプレート）
- `backend/app/scheduler.py`: APScheduler 設定（`app/main.py` の lifespan で起動）
- スケジューラは config の `notify_time` を読んで毎日実行
- 遅延タスク: `end_date < today AND progress < 1.0` をプロジェクト別に集計

## メール本文（HTML）
```
件名: [opeSchedule] 遅延タスク通知 - 2026-05-02
本文:
  遅延中のタスク: 合計 N 件

  ■ ECサイトリニューアル
    - UIデザイン（PC版）  期限: 2026-04-28  進捗: 60%
    - ...

  ■ AI活用プラットフォーム
    - ...
```

## Config UI
Config タブに「通知設定」セクションを追加:
- 通知有効チェックボックス
- 通知時刻（HH:MM 入力）
- 送信先メールアドレス（カンマ区切り）
- 「今すぐテスト送信」ボタン

## ファイル変更
| ファイル | 変更 |
|---------|------|
| `backend/alembic/versions/0015_add_config_notify.py` | 新規 migration |
| `backend/app/models/config.py` | notify フィールド追加 |
| `backend/app/schemas/config.py` | notify フィールド追加 |
| `backend/app/notify.py` | 新規: メール送信 |
| `backend/app/scheduler.py` | 新規: APScheduler |
| `backend/app/main.py` | lifespan でスケジューラ起動 |
| `backend/requirements-local.txt` | apscheduler 追加 |
| `frontend/src/components/top/ConfigPanel.jsx` | 通知設定 UI 追加 |
| `frontend/src/styles/app.css` | 通知設定スタイル |
| `.env.example` | SMTP 変数追加 |
