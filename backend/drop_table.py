import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "opeschedule.db")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
try:
    cursor.execute("DROP TABLE task_templates")
    print("Dropped task_templates")
except Exception as e:
    print(e)
conn.commit()
conn.close()
