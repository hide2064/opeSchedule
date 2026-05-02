import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "opeschedule.db")
print("Connecting to", db_path)

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Try dropping columns if they exist
    for col in ["notify_emails", "notify_time", "notify_enabled"]:
        try:
            cursor.execute(f"ALTER TABLE config DROP COLUMN {col}")
            print(f"Dropped {col} from config")
        except Exception as e:
            print(f"Could not drop {col} from config: {e}")

    for col in ["is_baseline"]:
        try:
            cursor.execute(f"ALTER TABLE project_snapshots DROP COLUMN {col}")
            print(f"Dropped {col} from project_snapshots")
        except Exception as e:
            print(f"Could not drop {col} from project_snapshots: {e}")

    try:
        cursor.execute("DROP INDEX IF EXISTS ix_projects_share_token")
        print("Dropped index ix_projects_share_token")
    except Exception as e:
        pass

    for col in ["share_token"]:
        try:
            cursor.execute(f"ALTER TABLE projects DROP COLUMN {col}")
            print(f"Dropped {col} from projects")
        except Exception as e:
            print(f"Could not drop {col} from projects: {e}")

    conn.commit()
    conn.close()
    print("Done")
except Exception as e:
    print("Error:", e)
