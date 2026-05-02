import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "opeschedule.db")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("PRAGMA table_info(project_snapshots);")
print("project_snapshots:")
for row in cursor.fetchall():
    print(row)
cursor.execute("PRAGMA table_info(projects);")
print("projects:")
for row in cursor.fetchall():
    print(row)
