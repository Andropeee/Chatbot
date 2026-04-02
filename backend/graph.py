"""
LangGraph agent — local Python version for development & testing.
This mirrors the TypeScript lib/graph.ts that runs on Vercel.

Run:  python graph.py
"""

import os
from typing import TypedDict, Annotated, Sequence

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages

from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma

from dotenv import load_dotenv

load_dotenv()

# ════════════════════════════════════════════════════
# LLM — DeepSeek via OpenAI-compatible endpoint (€0)
# ════════════════════════════════════════════════════

llm = ChatOpenAI(
    model="deepseek-chat",
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com/v1",
    temperature=0.7,
    max_tokens=1000,
)

# ════════════════════════════════════════════════════
# Vector DB — Chroma (local SQLite, €0)
# ════════════════════════════════════════════════════

print("⏳  Loading embeddings …", end=" ", flush=True)
embeddings = HuggingFaceEmbeddings(
    model_name="intfloat/multilingual-e5-small",
    model_kwargs={"device": "cpu"},
    encode_kwargs={"normalize_embeddings": True},
)
print("done")

vector_db = Chroma(
    collection_name="5elements_products",
    embedding_function=embeddings,
    persist_directory="./chroma_data",
)

# ════════════════════════════════════════════════════
# Language detection
# ════════════════════════════════════════════════════

GERMAN_KW = ["habt", "gibt", "haben", "größe", "preis", "bitte", "danke",
             "kaufen", "bestellen", "handschuhe", "kickboxen", "boxen"]
ENGLISH_KW = ["do you", "have", "what", "size", "price", "please", "thank",
              "buy", "order", "gloves", "boxing", "kickboxing"]


def detect_language(text: str) -> str:
    if any(c in text for c in "äöüÄÖÜß"):
        return "de"
    text_lower = text.lower()
    de = sum(1 for kw in GERMAN_KW if kw in text_lower)
    en = sum(1 for kw in ENGLISH_KW if kw in text_lower)
    return "de" if de >= en else "en"


# ════════════════════════════════════════════════════
# Agent state
# ════════════════════════════════════════════════════

class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    retrieved_context: str
    is_sales_inquiry: bool
    language: str
    customer_name: str
    customer_phone: str


# ════════════════════════════════════════════════════
# Node 1 — Retrieve
# ════════════════════════════════════════════════════

def retrieve_node(state: AgentState) -> dict:
    query = state["messages"][-1].content if state["messages"] else ""
    lang = state.get("language", "en")

    try:
        results = vector_db.similarity_search(query, k=5)
    except Exception as e:
        return {"retrieved_context": f"[DB error: {e}]"}

    if not results:
        ctx = "Keine Produkte gefunden." if lang == "de" else "No matching products found."
        return {"retrieved_context": ctx}

    header = "Gefundene Produkte:\n\n" if lang == "de" else "Found products:\n\n"
    lines = []
    for r in results:
        m = r.metadata
        line = f"• {m.get('product_name', '?')} — {m.get('price', 'N/A')}"
        url = m.get("product_url", "")
        if url:
            line += f"\n  🔗 {url}"
        lines.append(line)

    return {"retrieved_context": header + "\n".join(lines)}


# ════════════════════════════════════════════════════
# Node 2 — Classify
# ════════════════════════════════════════════════════

ESCALATION_TRIGGERS = {
    "en": [
        "bulk order", "discount", "wholesale", "corporate", "custom branding",
        "custom logo", "partnership", "reseller", "distributor", "dropship",
        "franchise", "negotiate", "payment terms", "net terms", "credit",
        "sponsorship", "agency", "wholesale price", "samples", "volume order",
    ],
    "de": [
        "großbestellung", "rabatt", "großhandel", "corporate", "custom branding",
        "logo", "partnerschaft", "reseller", "distributor", "dropship", "franchise",
        "verhandeln", "zahlungsziel", "kreditlinie", "sponsoring", "agentur",
        "großhandelspreis", "muster", "mustermenge", "mengenrabatt",
    ],
}


def classify_node(state: AgentState) -> dict:
    text = (state["messages"][-1].content or "").lower()
    lang = state.get("language", "en")
    triggers = ESCALATION_TRIGGERS.get(lang, ESCALATION_TRIGGERS["en"])
    is_escalation = any(t in text for t in triggers)
    return {"is_sales_inquiry": is_escalation}


# ════════════════════════════════════════════════════
# Node 3 — Answer product question
# ════════════════════════════════════════════════════

def answer_node(state: AgentState) -> dict:
    query = state["messages"][-1].content
    context = state.get("retrieved_context", "")
    lang = state.get("language", "en")

    if lang == "de":
        system = (
            f"Du bist ein hilfreicher Kundenservice-Chatbot für 5elements-sports.com.\n"
            f"Antworte auf Deutsch (max 150 Wörter). Zeige Produktlinks deutlich.\n\n"
            f"Verfügbare Produkte:\n{context}"
        )
    else:
        system = (
            f"You are a helpful customer service chatbot for 5elements-sports.com.\n"
            f"Answer in English (max 150 words). Display product URLs clearly.\n\n"
            f"Available products:\n{context}"
        )

    response = llm.invoke([{"role": "system", "content": system},
                           {"role": "user", "content": query}])

    return {"messages": [AIMessage(content=response.content)]}


# ════════════════════════════════════════════════════
# Node 4 — Escalate
# ════════════════════════════════════════════════════

def escalate_node(state: AgentState) -> dict:
    lang = state.get("language", "en")
    if lang == "de":
        msg = (
            "Vielen Dank für dein Interesse! 🙌\n\n"
            "Dies ist eine spezielle Anfrage, die unser Team persönlich bearbeitet.\n"
            "Teile bitte deine Kontaktdaten:\n"
            "• Name\n• E-Mail\n• Telefonnummer"
        )
    else:
        msg = (
            "Thank you for your interest! 🙌\n\n"
            "This is a special request our team handles personally.\n"
            "Please share your contact info:\n"
            "• Name\n• Email\n• Phone number"
        )
    return {"messages": [AIMessage(content=msg)], "is_sales_inquiry": True}


# ════════════════════════════════════════════════════
# Graph
# ════════════════════════════════════════════════════

def create_agent_graph():
    g = StateGraph(AgentState)
    g.add_node("retrieve", retrieve_node)
    g.add_node("classify", classify_node)
    g.add_node("answer", answer_node)
    g.add_node("escalate", escalate_node)

    g.add_edge(START, "retrieve")
    g.add_edge("retrieve", "classify")
    g.add_conditional_edges(
        "classify",
        lambda s: "escalate" if s.get("is_sales_inquiry") else "answer",
    )
    g.add_edge("answer", END)
    g.add_edge("escalate", END)

    return g.compile()


agent = create_agent_graph()


# ════════════════════════════════════════════════════
# Test
# ════════════════════════════════════════════════════

if __name__ == "__main__":
    tests = [
        "Do you have blue boxing gloves in size M?",
        "Habt ihr blaue Boxhandschuhe in Größe M?",
        "Can we do a bulk order with discount?",
    ]

    for test in tests:
        lang = detect_language(test)
        print(f"\n👤 USER [{lang.upper()}]: {test}")

        result = agent.invoke({
            "messages": [HumanMessage(content=test)],
            "retrieved_context": "",
            "is_sales_inquiry": False,
            "language": lang,
            "customer_name": "",
            "customer_phone": "",
        })

        print(f"🤖 BOT: {result['messages'][-1].content}")
        print("-" * 60)
