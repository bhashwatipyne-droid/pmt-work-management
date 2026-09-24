import dns.resolver
from pymongo import MongoClient

resolver = dns.resolver.Resolver()
resolver.nameservers = ["8.8.8.8", "1.1.1.1"]
dns.resolver.default_resolver = resolver

MONGO_URL = "mongodb+srv://bhashwatipyne_db_user:MyPmtDb_2026-Strong@cluster1.ahn4oou.mongodb.net/pmt?appName=Cluster1"

client = MongoClient(MONGO_URL)

db = client["pmt"]
collection = db["work_items"]

query = {
    "status": "Ongoing",
    "work_date": {
        "$lte": "2026-09-02"
    }
}

# Count before update
before_count = collection.count_documents(query)

print(f"\nWork items to close: {before_count}")

# Perform update
result = collection.update_many(
    query,
    {
        "$set": {
            "status": "Closed"
        }
    }
)

print(f"Matched: {result.matched_count}")
print(f"Modified: {result.modified_count}")

# Verify
remaining = collection.count_documents(query)

print(f"Remaining matching Ongoing items: {remaining}")

client.close()