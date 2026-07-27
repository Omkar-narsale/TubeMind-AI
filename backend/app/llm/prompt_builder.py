from typing import List, Dict
from app.rag.models import RAGSearchResult
from app.llm.models import ChatMessage


class PromptBuilder:
    SYSTEM_PROMPT = (
        "You are TubeMind AI.\n"
        "Answer ONLY using the supplied transcript context.\n"
        "Never invent facts.\n"
        "If the transcript does not contain the answer, say exactly: "
        "\"I couldn't find that information in this video's transcript.\"\n"
        "Always cite timestamps (e.g. [02:30]) whenever possible when referencing information from the transcript.\n"
        "Keep answers concise."
    )

    @staticmethod
    def format_timestamp(seconds: float) -> str:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        if h > 0:
            return f"{h:02d}:{m:02d}:{s:02d}"
        return f"{m:02d}:{s:02d}"

    def build_prompt_messages(
        self,
        query: str,
        retrieved_context: List[RAGSearchResult],
        history: List[ChatMessage],
    ) -> List[Dict[str, str]]:
        messages = []
        
        # 1. System Prompt
        messages.append({"role": "system", "content": self.SYSTEM_PROMPT})
        
        # 2. Retrieved context injected with index
        context_blocks = []
        for chunk in retrieved_context:
            time_badge = self.format_timestamp(chunk.start)
            context_blocks.append(f"[Index: {chunk.chunk_index}] [{time_badge}] {chunk.text}")
            
        context_text = "\n\n".join(context_blocks)
        
        messages.append({
            "role": "system",
            "content": f"Supplied Transcript Context:\n\n{context_text}"
        })
        
        # 3. Conversation History (Limit to the last 8 messages)
        limited_history = history[-8:]
        for msg in limited_history:
            messages.append({"role": msg.role.value, "content": msg.content})
            
        # 4. User Question
        messages.append({"role": "user", "content": query})
        
        return messages
