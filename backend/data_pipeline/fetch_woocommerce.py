"""
Fetch all products + their variations from the WooCommerce REST API (v3).
Outputs: ../../data/products.json

Requires in .env.local (root of project) or .env in this folder:
  WC_CONSUMER_KEY=ck_...
  WC_CONSUMER_SECRET=cs_...
  WC_BASE_URL=https://5elements-sports.com   # no trailing slash

Run:
  cd backend/data_pipeline
  python fetch_woocommerce.py
"""

import os
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

import requests
from dotenv import load_dotenv

# ── Load .env.local (Next.js convention) or .env ─────────────────────────────
ROOT = Path(__file__).resolve().parents[2]
for env_file in [ROOT / ".env.local", ROOT / ".env", Path(".env")]:
    if env_file.exists():
        load_dotenv(env_file)
        print(f"✓  Loaded env from {env_file}")
        break

WC_BASE_URL      = os.getenv("WC_BASE_URL", "https://5elements-sports.com").rstrip("/")
WC_CONSUMER_KEY  = os.getenv("WC_CONSUMER_KEY", "")
WC_CONSUMER_SECRET = os.getenv("WC_CONSUMER_SECRET", "")
OUTPUT_PATH      = ROOT / "data" / "products.json"

if not WC_CONSUMER_KEY or not WC_CONSUMER_SECRET:
    print("✗  WC_CONSUMER_KEY / WC_CONSUMER_SECRET not set in .env.local")
    print("   Add them and re-run this script.")
    sys.exit(1)


# ── HTTP session ──────────────────────────────────────────────────────────────

session = requests.Session()
session.auth = (WC_CONSUMER_KEY, WC_CONSUMER_SECRET)
session.headers.update({"User-Agent": "5elements-chatbot-sync/1.0"})


def api_get(path: str, params: dict | None = None) -> list | dict:
    url = f"{WC_BASE_URL}/wp-json/wc/v3/{path.lstrip('/')}"
    resp = session.get(url, params=params, timeout=30)
    if resp.status_code == 401:
        print(f"\n✗  401 Unauthorised — check your WC_CONSUMER_KEY / WC_CONSUMER_SECRET")
        sys.exit(1)
    resp.raise_for_status()
    return resp.json()


# ── Helpers ───────────────────────────────────────────────────────────────────

def safe_text(html: str) -> str:
    """Strip HTML tags cheaply without BeautifulSoup."""
    import re
    text = re.sub(r"<[^>]+>", " ", html or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:1200]


def collect_all_pages(endpoint: str, extra_params: dict | None = None) -> List[dict]:
    """Paginate through a WooCommerce endpoint and return all items."""
    items: List[dict] = []
    page = 1
    while True:
        params = {"per_page": 100, "page": page, "status": "publish"}
        if extra_params:
            params.update(extra_params)
        batch = api_get(endpoint, params)
        if not isinstance(batch, list) or not batch:
            break
        items.extend(batch)
        print(f"  · {endpoint}  page {page}: {len(batch)} items  ({len(items)} total)", end="\r")
        if len(batch) < 100:
            break
        page += 1
        time.sleep(0.3)
    print()
    return items


def build_attribute_map(raw_attributes: list) -> Dict[str, List[str]]:
    """Return {attribute_name: [option1, option2, …]} from WooCommerce attribute list."""
    attrs: Dict[str, List[str]] = {}
    for attr in raw_attributes:
        name = attr.get("name", "")
        options = attr.get("options", [])
        if name and options:
            attrs[name] = options
    return attrs


def normalise_price(raw: str | None) -> str:
    if not raw:
        return ""
    try:
        return f"{float(raw):.2f} €".replace(".", ",")
    except ValueError:
        return raw


# ── Core fetch ────────────────────────────────────────────────────────────────

def fetch_variations(product_id: int) -> List[Dict[str, List[str]]]:
    """
    Return a list of attribute dicts for each variation of a variable product.
    E.g. [{"Farbe": "Rosa", "Größe": "10oz"}, {"Farbe": "Rot", "Größe": "14oz"}, …]
    """
    try:
        variations = collect_all_pages(f"products/{product_id}/variations")
        result = []
        for v in variations:
            attrs = {a["name"]: a["option"] for a in v.get("attributes", []) if a.get("name")}
            if attrs:
                result.append(attrs)
        return result
    except requests.HTTPError:
        return []


def fetch_all_products() -> List[Dict]:
    print(f"\n📦  Fetching products from {WC_BASE_URL} …\n")
    raw_products = collect_all_pages("products")
    print(f"✓  {len(raw_products)} products fetched\n")

    output: List[Dict] = []

    for idx, p in enumerate(raw_products, 1):
        product_type = p.get("type", "simple")
        name           = p.get("name", "")
        price          = normalise_price(p.get("price"))
        regular_price  = normalise_price(p.get("regular_price"))
        sale_price     = normalise_price(p.get("sale_price"))

        description    = safe_text(p.get("description", "") or p.get("short_description", ""))
        categories     = [c["name"] for c in p.get("categories", [])]
        tags           = [t["name"] for t in p.get("tags", [])]
        images         = p.get("images", [])
        image_url      = images[0]["src"] if images else ""

        # Attributes declared on the parent product (all possible options)
        attributes = build_attribute_map(p.get("attributes", []))

        # For variable products: fetch actual variations to get exact combos
        variations: List[Dict] = []
        if product_type == "variable" and attributes:
            print(f"  [{idx}/{len(raw_products)}] {name} — fetching variations …")
            variations = fetch_variations(p["id"])
        else:
            print(f"  [{idx}/{len(raw_products)}] {name}")

        record = {
            "id":            p.get("id"),
            "name":          name,
            "type":          product_type,
            "description":   description,
            "price":         price,
            "regular_price": regular_price,
            "sale_price":    sale_price,
            "categories":    categories,
            "tags":          tags,
            "sku":           p.get("sku", ""),
            "stock_status":  p.get("stock_status", ""),
            "url":           p.get("permalink", ""),
            "image_url":     image_url,
            # All attribute options (great for "what colours do you have?" queries)
            "attributes":    attributes,
            # Individual variation combos (e.g. [{"Farbe":"Rosa","Größe":"10oz"}, …])
            "variations":    variations,
            "synced_at":     datetime.now().isoformat(),
        }
        output.append(record)

    return output


# ── Save ──────────────────────────────────────────────────────────────────────

def save(products: List[Dict]) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "products": products,
        "metadata": {
            "total_products": len(products),
            "synced_at":      datetime.now().isoformat(),
            "source":         "woocommerce_api",
        },
    }
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"\n✅  Saved {len(products)} products → {OUTPUT_PATH}\n")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    products = fetch_all_products()
    save(products)
