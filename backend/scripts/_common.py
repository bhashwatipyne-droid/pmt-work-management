"""Shared by the one-off scripts in this folder: connect to the database the same
way the server does, and save a JSON backup of documents before they are changed.

MONGO_URL and DB_NAME come from the environment or from backend/.env.
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from pymongo import MongoClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
BACKUP_DIR = BACKEND_DIR / "script_backups"


def connect():
    """The database named by MONGO_URL / DB_NAME. Exits with a plain message if
    they are not set."""
    try:
        from dotenv import load_dotenv
        load_dotenv(BACKEND_DIR / ".env")
    except ImportError:
        pass  # fine: the variables can simply be set in the terminal instead

    missing = [name for name in ("MONGO_URL", "DB_NAME") if not os.environ.get(name)]
    if missing:
        sys.exit(
            f"{' and '.join(missing)} not set. Put them in backend/.env or set them in this "
            "terminal first (see the commands in the instructions)."
        )

    # A pasted value often carries spaces or quotes around it.
    url = os.environ["MONGO_URL"].strip().strip("'\"").strip()
    if not url.startswith(("mongodb://", "mongodb+srv://")):
        sys.exit(
            "MONGO_URL must start with mongodb+srv:// (or mongodb://) but yours starts with "
            f"{url[:4]!r}. Copy the whole connection string from Atlas (Connect > Drivers), "
            "put your password in, and set it again."
        )

    options = {}
    try:
        import certifi
        options["tlsCAFile"] = certifi.where()  # same as the server, needed for Atlas on Windows
    except ImportError:
        pass
    client = MongoClient(url, serverSelectionTimeoutMS=15000, **options)
    return client[os.environ["DB_NAME"]]


def save_backup(label: str, collections: dict) -> Path:
    """Write {collection name: [documents]} to script_backups/<label>-<time>.json
    and return the path. ObjectIds and dates are written as text."""
    BACKUP_DIR.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    path = BACKUP_DIR / f"{label}-{stamp}.json"
    path.write_text(json.dumps(collections, indent=1, default=str), encoding="utf-8")
    return path
