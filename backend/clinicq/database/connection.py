
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

MONGODB_URI = os.getenv("MONGODB_URI")
DATABASE_NAME = os.getenv("MONGODB_DATABASE", "clinicq")

if not MONGODB_URI:
    raise ValueError("MONGODB_URI is missing from .env")

# Create MongoDB client
client = MongoClient(
    MONGODB_URI,
    tlsCAFile=certifi.where(),
    serverSelectionTimeoutMS=5000
)

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
