import os
from fastapi import FastAPI, UploadFile, File, HTTPException # type: ignore
from starlette.responses import StreamingResponse # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore
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

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize embedding model
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

# Initialize Ollama client
ollama_ac = AsyncClient(host='http://localhost:11434')

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
    model: str = "gemma3.2"  # default model

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
            "content": "You are a helpful assistant that answers questions based on the provided document. "
                       " If the answer isn't in the document, say you don't know. Also ask the user if they want to continue."

        },
        {
            "role": "user",
            "content": prompt
        }
    ]

    try:
        async for part in await ollama_ac.chat(model=request.model, messages=messages, stream=True):
            yield json.dumps({'response': part['message']['content']})
    except Exception as e:
        yield json.dumps({'error': str(e)})

@app.post("/chat")
async def chat_with_document(request: ChatRequest):
    return StreamingResponse(generate_response_chunks(request), media_type="application/json")

async def generate_response_chunks_general(request: ChatRequest):
    last_message = request.messages[-1]

    messages = [
        {
            "role": "user",
            "content": last_message.content
        }
    ]

    try:
        async for part in await ollama_ac.chat(model=request.model, messages=messages, stream=True):
            yield json.dumps({'response': part['message']['content']})
    except Exception as e:
        yield json.dumps({'error': str(e)})

#chat with general model
@app.post("/general/chat")
async def chat_with_general_model(request: ChatRequest):
   return StreamingResponse(generate_response_chunks_general(request), media_type="application/json")




@app.get("/models")
async def get_available_models():
    try:
        models = await ollama_ac.list()
        return {"models": models}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, port=8000)
    print('api running on port 8000')