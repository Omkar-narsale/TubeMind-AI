import os
from typing import AsyncGenerator, List, Dict, Any
from groq import AsyncGroq
from app.core.config import settings

class GroqClient:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or settings.GROQ_API_KEY
        if not self.api_key:
            raise ValueError("Groq API key is missing. Please configure GROQ_API_KEY in your .env file.")
        self.client = AsyncGroq(api_key=self.api_key)
        self.model = settings.GROQ_MODEL

    async def complete(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> str:
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=False,
            )
            return response.choices[0].message.content
        except Exception as e:
            if "rate limit" in str(e).lower() or "429" in str(e):
                raise RuntimeError(f"Groq API rate limit exceeded: {str(e)}")
            raise RuntimeError(f"Groq API error: {str(e)}")

    async def stream_complete(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> AsyncGenerator[str, None]:
        try:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
            )
            async for chunk in stream:
                content = chunk.choices[0].delta.content
                if content:
                    yield content
        except Exception as e:
            if "rate limit" in str(e).lower() or "429" in str(e):
                raise RuntimeError(f"Groq API rate limit exceeded: {str(e)}")
            raise RuntimeError(f"Groq API error: {str(e)}")
