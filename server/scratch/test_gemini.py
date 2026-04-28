import os
from google import genai
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.environ.get("GEMINI_API_KEY")

if not API_KEY:
    print("GEMINI_API_KEY not found in .env")
    exit(1)

client = genai.Client(api_key=API_KEY)

try:
    print(f"Testing Gemini with key: {API_KEY[:5]}...{API_KEY[-4:]}")
    response = client.models.generate_content(
        model="gemini-1.5-flash",
        contents="Say hello"
    )
    print("Response:", response.text)
except Exception as e:
    print("Error type:", type(e))
    print("Error message:", e)
