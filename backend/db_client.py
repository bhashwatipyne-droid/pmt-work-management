"""The one MongoDB client and database handle for the backend.

Created on first import. server.py re-exports `client` and `db`, so everything
that reads `server.db` is unchanged.
"""
import os
from pathlib import Path

import certifi
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
# Keep a few connections open and warm. With the default minPoolSize=0 a burst
# of requests (the page-load burst, or after an idle period) has to open brand
# new TLS + auth connections to Atlas, and each of those costs several network
# round trips on top of the query itself.
client = AsyncIOMotorClient(
    mongo_url,
    tlsCAFile=certifi.where(),
    minPoolSize=int(os.environ.get("MONGO_MIN_POOL_SIZE", "5")),
    maxPoolSize=int(os.environ.get("MONGO_MAX_POOL_SIZE", "50")),
)
db = client[os.environ['DB_NAME']]
