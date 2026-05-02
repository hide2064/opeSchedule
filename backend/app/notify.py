"""
notify.py — smtplib を使った週次サマリーメール送信 (D-1)

送信内容:
  - 全アクティブプロジェクトの概要
  - 期限切れタスク・今週期限のタスクの警告

環境変数:
  SMTP_HOST     - SMTPサーバーホスト (デフォルト: localhost)
  SMTP_PORT     - SMTPサーバーポート (デフォルト: 587)
  SMTP_USER     - SMTPユーザー名 (省略可)
  SMTP_PASS     - SMTPパスワード (省略可)
  SMTP_FROM     - 送信元メールアドレス (デフォルト: noreply@opeschedule.local)
  SMTP_USE_TLS  - TLS使用 (true/false, デフォルト: true)
"""
import json
import logging
import os
import smtplib
from datetime import date, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.config import Config
from app.models.project import Project
from app.models.task import Task

logger = logging.getLogger("notify")

# ── SMTP 設定 ────────────────────────────────────────────────────────────────
SMTP_HOST    = os.getenv("SMTP_HOST",    "localhost")
SMTP_PORT    = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER    = os.getenv("SMTP_USER",    "")
SMTP_PASS    = os.getenv("SMTP_PASS",    "")
SMTP_FROM    = os.getenv("SMTP_FROM",    "noreply@opeschedule.local")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"


def _build_html(projects_data: list[dict]) -> str:
    """週次サマリーメールの HTML 本文を生成する。"""
    today = date.today()
    week_end = today + timedelta(days=7)

    rows = ""
    for pd in projects_data:
        pname   = pd["name"]
        total   = pd["total"]
        done    = pd["completed"]
        delayed = pd["delayed"]
        pct     = round(done / total * 100) if total > 0 else 0
        color   = "#e53935" if delayed > 0 else ("#43a047" if pct >= 100 else "#4A90D9")
        rows += f"""
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">{pname}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;text-align:center;">{total}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;text-align:center;">{done}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;text-align:center;color:{color};">{pct}%</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;text-align:center;color:#e53935;">{delayed if delayed > 0 else '—'}</td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;color:#333;margin:0;padding:0;background:#f5f5f5;">
<div style="max-width:680px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  <div style="background:linear-gradient(90deg,#1a237e,#283593);padding:20px 28px;">
    <h1 style="margin:0;color:#fff;font-size:18px;">📅 opeSchedule 週次サマリー</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">{today} 時点</p>
  </div>
  <div style="padding:24px 28px;">
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f3f3f3;">
          <th style="padding:8px 12px;text-align:left;font-weight:600;">プロジェクト</th>
          <th style="padding:8px 12px;text-align:center;font-weight:600;">タスク数</th>
          <th style="padding:8px 12px;text-align:center;font-weight:600;">完了</th>
          <th style="padding:8px 12px;text-align:center;font-weight:600;">進捗</th>
          <th style="padding:8px 12px;text-align:center;font-weight:600;">遅延</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
    <p style="margin-top:20px;font-size:11px;color:#999;">
      このメールは opeSchedule から自動送信されています。
    </p>
  </div>
</div>
</body>
</html>"""


def send_weekly_summary() -> None:
    """週次サマリーメールを送信するメイン関数。APScheduler から呼ばれる。"""
    db: Session = SessionLocal()
    try:
        config = db.query(Config).first()
        if not config:
            logger.info("Config が見つかりません。送信をスキップします。")
            return
        if not config.notify_enabled:
            logger.info("メール通知が無効です。送信をスキップします。")
            return

        try:
            emails: list[str] = json.loads(config.notify_emails or "[]")
        except Exception:
            emails = []
        emails = [e.strip() for e in emails if e.strip()]
        if not emails:
            logger.info("送信先メールアドレスが設定されていません。")
            return

        # プロジェクトデータ収集
        today = date.today()
        projects = db.query(Project).filter(Project.status == "active").order_by(Project.sort_order).all()
        projects_data = []
        for p in projects:
            tasks = db.query(Task).filter(Task.project_id == p.id, Task.task_type == "task").all()
            total     = len(tasks)
            completed = sum(1 for t in tasks if t.progress >= 1.0)
            delayed   = sum(1 for t in tasks if t.end_date < today and t.progress < 1.0)
            projects_data.append({"name": p.name, "total": total, "completed": completed, "delayed": delayed})

        html_body = _build_html(projects_data)

        # メール送信
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"[opeSchedule] 週次サマリー {today}"
        msg["From"]    = SMTP_FROM
        msg["To"]      = ", ".join(emails)
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        try:
            if SMTP_USE_TLS:
                with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                    server.ehlo()
                    server.starttls()
                    if SMTP_USER:
                        server.login(SMTP_USER, SMTP_PASS)
                    server.sendmail(SMTP_FROM, emails, msg.as_string())
            else:
                with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                    if SMTP_USER:
                        server.login(SMTP_USER, SMTP_PASS)
                    server.sendmail(SMTP_FROM, emails, msg.as_string())
            logger.info(f"週次サマリーメールを {len(emails)} 件に送信しました: {emails}")
        except Exception as smtp_ex:
            logger.error(f"SMTP 送信エラー: {smtp_ex}")

    finally:
        db.close()
