import os
import certifi
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables from backend/.env
BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.dirname(os.path.abspath(__file__))
    )
)

load_dotenv(os.path.join(BASE_DIR, ".env"))

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
DATABASE_NAME = os.getenv("MONGODB_DATABASE", "clinicq")

# Create MongoDB client supporting both local instances and Atlas clusters
client_kwargs = {"serverSelectionTimeoutMS": 5000}
if "mongodb+srv://" in MONGODB_URI or "ssl=true" in MONGODB_URI.lower():
    client_kwargs["tlsCAFile"] = certifi.where()

client = MongoClient(MONGODB_URI, **client_kwargs)

# Select ClinicQ database
db = client[DATABASE_NAME]


def connect_mongodb():
    """Verify MongoDB connection."""
    try:
        client.admin.command("ping")
        print("MongoDB connected successfully!")
        print(f"Database: {DATABASE_NAME}")
        return db
    except Exception as error:
        print(f"MongoDB connection failed: {error}")
        raise
