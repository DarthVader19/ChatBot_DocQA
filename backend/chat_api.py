import os
import sys


from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from starlette.responses import StreamingResponse, JSONResponse  # Import JSONResponse for custom responses
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PyPDF2 import PdfReader
from docx import Document
from typing import List, Optional
from sentence_transformers import SentenceTransformer
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import tempfile
import uvicorn
from ollama import AsyncClient
import asyncio
import json
from PIL import Image
import io
import base64

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# api key validation
API_KEYS = {"your_api_key_1": "user_a", "your_api_key_2": "user_b"}  # Replace with your actual API keys

# API Key Validation Middleware
@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    if request.url.path.startswith("/api"):
        api_key = request.headers.get("X-API-Key")
        if api_key is None or api_key not in API_KEYS:
            return JSONResponse({"detail": "Invalid API Key"}, status_code=401)
    response = await call_next(request)  # Await the next middleware or endpoint
    return response



#test api
@app.post("/api/test")
def test_api(request:Request):
    
    return {"msg":"working api key"}


# Initialize embedding model
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

# Initialize Ollama client
ollama = AsyncClient(host='http://localhost:11434')

class DocumentData:
    def __init__(self):
        self.text = ""
        self.chunks = []
        self.embeddings = None

doc_data = DocumentData()

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str = "gemma3"
    streaming:bool  = False  # default model

def extract_text_from_pdf(file_path: str) -> str:
    text = ""
    with open(file_path, "rb") as f:
        reader = PdfReader(f)
        for page in reader.pages:
            text += page.extract_text()
    return text

def extract_text_from_docx(file_path: str) -> str:
    doc = Document(file_path)
    return "\n".join([para.text for para in doc.paragraphs])

def extract_text_from_txt(file_path: str) -> str:
    with open(file_path, "r") as f:
        return f.read()

def chunk_text(text: str, chunk_size: int = 1000) -> List[str]:
    words = text.split()
    chunks = []
    current_chunk = []
    current_length = 0

    for word in words:
        if current_length + len(word) + 1 <= chunk_size:
            current_chunk.append(word)
            current_length += len(word) + 1
        else:
            chunks.append(" ".join(current_chunk))
            current_chunk = [word]
            current_length = len(word)

    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks


@app.get("/")
def root():
    return {"message": "The API is running"}

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    file_ext = os.path.splitext(file.filename)[1].lower()
    with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as temp_file:
        content = await file.read()
        temp_file.write(content)
        temp_path = temp_file.name

    try:
        if file_ext == ".pdf":
            doc_data.text = extract_text_from_pdf(temp_path)
        elif file_ext == ".docx":
            doc_data.text = extract_text_from_docx(temp_path)
        elif file_ext == ".txt":
            doc_data.text = extract_text_from_txt(temp_path)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")

        doc_data.chunks = chunk_text(doc_data.text)
        doc_data.embeddings = embedding_model.encode(doc_data.chunks)

        return {"message": "Document processed successfully", "char_count": len(doc_data.text)}
    finally:
        os.unlink(temp_path)

def get_relevant_chunks(query: str, top_k: int = 3) -> List[str]:
    if not doc_data.chunks or doc_data.embeddings is None:
        return []

    query_embedding = embedding_model.encode(query)
    similarities = cosine_similarity([query_embedding], doc_data.embeddings)[0]

    top_indices = np.argsort(similarities)[-top_k:][::-1]
    return [doc_data.chunks[i] for i in top_indices]


def generate_begin_message(prompt,systemMsg) -> List[dict]:
    return [
        {
            "role": "system",
            "content": systemMsg
        },
        {
            "role": "user",
            "content": prompt
        }
    ]




async def generate_response_chunks(request: ChatRequest):
    last_message = request.messages[-1]
    relevant_chunks = get_relevant_chunks(last_message.content)
    context = "\n\n".join(relevant_chunks)

    prompt = f"""Document Context:{context} 
    Based on the above document, answer the following question:
    {last_message.content}"""

    messages = [
        {
            "role": "system",
            "content": "You are a helpful assistant that answers questions based on the provided document. If the answer isn't in the document, say you don't know."
        },
        {
            "role": "user",
            "content": prompt
        }
    ]

    try:
        async for part in await ollama.chat(model=request.model, messages=messages, stream=True):
            yield json.dumps({'response': part['message']['content']})
    except Exception as e:
        yield json.dumps({'error': str(e)})

@app.post("/chat")
async def chat_with_document(request: ChatRequest):
    if request.streaming:
        print('in streaming','document chat')
        return StreamingResponse(generate_response_chunks(request), media_type="application/json")
    else:
        # Non-streaming response
        systemMsg = "You are a helpful assistant that answers questions based on the provided document." \
                    " If the answer isn't in the document, say you don't know."
        context = "\n\n".join(get_relevant_chunks(request.messages[-1].content))

        prompt = f"""Document Context:{context} 
                 Based on the above document, answer the following question:
                 {request.messages[-1].content}"""
        
        messages = generate_begin_message(prompt=prompt,systemMsg=systemMsg)
        response = await ollama.chat(model=request.model, messages=messages, stream=False)
        return {"response": response["message"]["content"]}
    


# general chat function
async def generate_general_response_chunks(request: ChatRequest):
    last_message = request.messages[-1]
   
    prompt = f"{last_message.content}"

    messages = [
        {
            "role": "system",
            "content": "You are a helpful assistant that answers questions."
            " Be precise and greet back if the user greets you."
            "Don't provide wrong information or make up answers."
            "stick to what user has asked."
            "provide number of words in the answer at the end of the answer."
        },
        {
            "role": "user",
            "content": prompt
        }
    ]
    try:
        # Directly pass the user's messages to the model
        async for part in await ollama.chat(model=request.model, messages=messages, stream=True):
            yield json.dumps({'response': part['message']['content']})
    except Exception as e:
        yield json.dumps({'error': str(e)})

# General chat endpoint
@app.post("/general/chat")
async def general_chat(request: ChatRequest):
    """
    Endpoint for general chat without document context.
    """
    print('in general chat')
    print(request)
    if request.streaming:
          return StreamingResponse(generate_general_response_chunks(request), media_type="application/json")
    else:
        # Non-streaming response
        response = await ollama.chat(model=request.model, messages=request.messages, stream=False)
        print(response)
        return {"response": response["message"]["content"]}

@app.get("/models")
async def get_available_models():
    try:
        models = await ollama.list()
        return {"models": models}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

# Add this function to process images
async def process_image(file: UploadFile,request) -> StreamingResponse:
    try:
        # Open the image using PIL
        image = Image.open(io.BytesIO(file.file.read()))
        # save the image file in images directory
        image_path = os.path.join('images', file.filename)
        image.save(image_path)

        # # Convert the image to base64
        # buffered = io.BytesIO()
        # image.save(buffered, format="PNG")  # Save as PNG or the required format
        # image_base64 = base64.b64encode(buffered.getvalue()).decode("utf-8")

        # Prepare the payload for the ollama model
        messages = [
            {
                "role": "system",
                "content": "You are a vision model that processes images and provides insights."
            },
            {
                "role": "user",
                "content": "Here is an image for analysis.",
                "image": [image_path]  
            }
        ]

        try:
        # Directly pass the user's messages to the model
             async for part in await ollama.chat(model=request.model, messages=messages, stream=True):
                 yield json.dumps({'response': part['message']['content']})
        except Exception as e:
              yield json.dumps({'error': str(e)})

      
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing image: {str(e)}")

# Add a new endpoint for image uploads
@app.post("/upload/image")
async def upload_image(file: UploadFile = File(...),request: ChatRequest = None):
    print('in image upload')
    print(request)
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in [".jpg", ".jpeg", ".png", ".bmp"]:
        raise HTTPException(status_code=400, detail="Unsupported image file type")
    
    return StreamingResponse(process_image(file,request), media_type="application/json")

if __name__ == "__main__":
    uvicorn.run(app, port=8000)
    print('api running on port 8000')