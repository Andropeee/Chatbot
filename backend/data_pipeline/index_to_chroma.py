"""
Index products into Chroma Vector DB (local SQLite, €0 cost).
Stores product URLs in metadata so the agent can return direct product links.

Input:  ../../data/products.json  (created by scrape_5elements.py)
Output: ./chroma_data/            (Chroma persisted SQLite database)

NOTE: This is used for LOCAL DEVELOPMENT only.
      On Vercel the API routes use data/products.json with keyword search.
"""

import os
import json
from pathlib import Path
from dotenv import load_dotenv
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma

load_dotenv()


class ChromaIndexer:
    def __init__(self, chroma_dir: str = "./chroma_data"):
        print("🔧  Initialising Chroma Vector Database (local, free) …\n")
        print("⏳  Loading HuggingFace multilingual-e5-small (first run: ~130 MB download) …")

        self.embeddings = HuggingFaceEmbeddings(
            model_name="intfloat/multilingual-e5-small",
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
        print("✓  Embeddings model loaded\n")

        self.vector_db = Chroma(
            collection_name="5elements_products",
            embedding_function=self.embeddings,
            persist_directory=chroma_dir,
        )

        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=100,
            separators=["\n\n", "\n", " ", ""],
        )

    # ──────────────────────────────────────────────────────────────
    # Load
    # ──────────────────────────────────────────────────────────────

    def load_data(self, filepath: str = "../../data/products.json") -> dict:
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(
                f"products.json not found at {path.resolve()}\n"
                "Run scrape_5elements.py first."
            )
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    # ──────────────────────────────────────────────────────────────
    # Build document text for a product
    # ──────────────────────────────────────────────────────────────

    def _product_to_text(self, product: dict) -> str:
        categories = ", ".join(product.get("categories") or [])
        tags = ", ".join(product.get("tags") or [])
        return f"""Product: {product.get('name', '')}
Price: {product.get('price', '')}
Categories: {categories}
Tags: {tags}
SKU: {product.get('sku', '')}
Description: {product.get('description', '')}""".strip()

    # ──────────────────────────────────────────────────────────────
    # Index
    # ──────────────────────────────────────────────────────────────

    def index_products(self, data: dict):
        products = data.get("products", [])
        print(f"📦  Indexing {len(products)} products …\n")

        batch_texts = []
        batch_metas = []

        for idx, product in enumerate(products, 1):
            try:
                text = self._product_to_text(product)
                chunks = self.splitter.split_text(text)

                meta = {
                    "product_name": product.get("name", ""),
                    "price": str(product.get("price", "")),
                    "sku": product.get("sku", ""),
                    "category": (product.get("categories") or ["unknown"])[0],
                    "product_url": product.get("url", ""),
                    "stock_status": product.get("stock_status", "unknown"),
                }

                batch_texts.extend(chunks)
                batch_metas.extend([meta] * len(chunks))

                if idx % 25 == 0:
                    self.vector_db.add_texts(texts=batch_texts, metadatas=batch_metas)
                    batch_texts, batch_metas = [], []
                    print(f"  ✓  Indexed {idx}/{len(products)} …")

            except Exception as e:
                print(f"  ✗  Error on product {idx}: {e}")

        # Flush remaining
        if batch_texts:
            self.vector_db.add_texts(texts=batch_texts, metadatas=batch_metas)

        self.vector_db.persist()
        print(f"\n✅  All products indexed → ./chroma_data/")

    # ──────────────────────────────────────────────────────────────
    # Test search
    # ──────────────────────────────────────────────────────────────

    def test_search(self, query: str, k: int = 3):
        results = self.vector_db.similarity_search(query, k=k)
        print(f"\n🔍  '{query}':")
        for r in results:
            name = r.metadata.get("product_name", "?")
            price = r.metadata.get("price", "N/A")
            url = r.metadata.get("product_url", "")
            print(f"    • {name} — {price}")
            if url:
                print(f"      🔗 {url}")
        return results


# ══════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    indexer = ChromaIndexer()
    data = indexer.load_data()
    indexer.index_products(data)

    print("\n🧪  Running test queries …")
    for query in ["Boxhandschuhe", "MMA Ausrüstung", "Kopfschutz", "blue boxing gloves"]:
        indexer.test_search(query)

    print("\n🎉  Done! Chroma DB ready for local development.")
