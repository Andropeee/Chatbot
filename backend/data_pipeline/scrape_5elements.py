"""
Scrape 5elements-sports.com and extract product information.
Tries WooCommerce REST API first; falls back to HTML scraping.

Output: ../../data/products.json
"""

import os
import json
import time
from datetime import datetime
from typing import List, Dict, Optional
from bs4 import BeautifulSoup
import requests
from dotenv import load_dotenv

load_dotenv()


class FiveElementsScraper:
    def __init__(self):
        self.base_url = "https://5elements-sports.com"
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (ChatbotIndexer/1.0; +https://your-agency.com)"
        })

    # ──────────────────────────────────────────────────────────────
    # WooCommerce REST API (best quality — includes all metadata)
    # ──────────────────────────────────────────────────────────────

    def scrape_woocommerce_api(self) -> List[Dict]:
        """
        Try WooCommerce REST API (no auth needed for public endpoints).
        Falls back to HTML scraping if the API is unavailable / auth-protected.
        """
        print("🌐  Trying WooCommerce REST API …")
        api_url = f"{self.base_url}/wp-json/wc/v3/products"
        products: List[Dict] = []
        page = 1

        while True:
            try:
                resp = self.session.get(
                    api_url,
                    params={"per_page": 100, "page": page, "status": "publish"},
                    timeout=15,
                )

                if resp.status_code == 401:
                    print("⚠️   API requires authentication → switching to HTML scraping …")
                    return self.scrape_html_fallback()

                if resp.status_code == 404:
                    print("⚠️   WooCommerce API not found → switching to HTML scraping …")
                    return self.scrape_html_fallback()

                if resp.status_code != 200:
                    print(f"⚠️   API returned {resp.status_code} → switching to HTML scraping …")
                    return self.scrape_html_fallback()

                data = resp.json()
                if not data:
                    break  # No more pages

                for product in data:
                    # Strip HTML from description
                    raw_desc = product.get("description", "") or product.get("short_description", "")
                    description = BeautifulSoup(raw_desc, "html.parser").get_text(separator=" ").strip()

                    # Get primary image URL
                    images = product.get("images", [])
                    image_url = images[0].get("src", "") if images else ""

                    products.append({
                        "id": product.get("id"),
                        "name": product.get("name"),
                        "description": description[:1000],  # limit size
                        "price": product.get("price"),
                        "regular_price": product.get("regular_price"),
                        "sale_price": product.get("sale_price"),
                        "categories": [cat["name"] for cat in product.get("categories", [])],
                        "tags": [tag["name"] for tag in product.get("tags", [])],
                        "sku": product.get("sku"),
                        "stock_status": product.get("stock_status"),
                        "url": product.get("permalink"),
                        "image_url": image_url,
                        "scraped_at": datetime.now().isoformat(),
                    })

                print(f"  ✓  Page {page}: {len(products)} products so far …")
                page += 1
                time.sleep(0.5)  # polite crawl delay

            except requests.RequestException as e:
                print(f"  ✗  Request error: {e}")
                if not products:
                    return self.scrape_html_fallback()
                break

        return products

    # ──────────────────────────────────────────────────────────────
    # HTML scraping fallback
    # ──────────────────────────────────────────────────────────────

    def scrape_html_fallback(self) -> List[Dict]:
        """
        Scrape product listing pages directly from HTML.
        Works even when the REST API is unavailable.
        """
        print("🌐  Scraping HTML product pages …")
        products: List[Dict] = []

        # Common category slugs for martial arts shops
        categories = [
            "boxen", "boxing",
            "kickboxen", "kickboxing",
            "mma",
            "karate",
            "taekwondo", "teakwon-do",
            "ringen", "wrestling",
            "kampfsport", "kampfsport-ausruestung",
            "schutzausruestung", "zubehoer",
        ]

        seen_urls: set = set()

        for category in categories:
            url = f"{self.base_url}/{category}/"
            try:
                resp = self.session.get(url, timeout=10)
                if resp.status_code != 200:
                    continue

                soup = BeautifulSoup(resp.content, "html.parser")

                # WooCommerce product list items
                items = soup.find_all(["li", "div"], class_=lambda c: c and "product" in c.lower())

                for item in items:
                    link_tag = item.find("a", href=True)
                    product_url = link_tag["href"] if link_tag else ""

                    if not product_url or product_url in seen_urls:
                        continue
                    seen_urls.add(product_url)

                    name_tag = item.find(["h2", "h3", "a"], class_=lambda c: c and "title" in (c or "").lower())
                    if not name_tag:
                        name_tag = item.find(["h2", "h3"])
                    price_tag = item.find(class_=lambda c: c and "price" in (c or "").lower())

                    products.append({
                        "name": name_tag.get_text(strip=True) if name_tag else "Unknown",
                        "price": price_tag.get_text(strip=True) if price_tag else "N/A",
                        "categories": [category],
                        "url": product_url,
                        "scraped_at": datetime.now().isoformat(),
                    })

                print(f"  ✓  {category}: {len(items)} items found")
                time.sleep(0.5)

            except Exception as e:
                print(f"  ✗  {category}: {e}")

        return products

    # ──────────────────────────────────────────────────────────────
    # Save
    # ──────────────────────────────────────────────────────────────

    def save_to_json(self, data: Dict, filepath: str = "../../data/products.json"):
        os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"\n✅  Saved → {os.path.abspath(filepath)}")


# ══════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    scraper = FiveElementsScraper()
    products = scraper.scrape_woocommerce_api()

    output = {
        "products": products,
        "metadata": {
            "total_products": len(products),
            "scraped_at": datetime.now().isoformat(),
            "source": "5elements-sports.com",
        },
    }

    scraper.save_to_json(output)
    print(f"\n🎉  Done! {len(products)} products scraped and saved.")
