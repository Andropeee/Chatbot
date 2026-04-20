"""
Targeted scraper for 5elements-sports.com
Collects all product URLs from category pages, then scrapes each product.
Output: ../../data/products.json
"""
import json, time, re
from datetime import datetime
import requests
from bs4 import BeautifulSoup

BASE = "https://5elements-sports.com"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
SESSION = requests.Session()
SESSION.headers.update(HEADERS)

CATEGORY_SLUGS = [
    "product-category/bekleidung",
    "product-category/2-schutzausruestung",
    "product-category/handschuhe",
    "product-category/gym-ausstattung",
    "product-category/kampfsportarten",
    "product-category/taekwondo",
    "product-category/taekwondo-kampfsportarten",
    "product-category/boxen",
    "product-category/kickboxen",
    "product-category/mma-kampfsportarten",
    "product-category/karate",
    "product-category/muay-thai",
]


def get_product_urls_from_page(url: str) -> list[str]:
    try:
        r = SESSION.get(url, timeout=12)
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.content, "html.parser")
        links = {a["href"] for a in soup.find_all("a", href=True)
                 if "/product/" in a["href"] and not "/product-category/" in a["href"]}
        return list(links)
    except Exception as e:
        print(f"  ! {url}: {e}")
        return []


def collect_all_product_urls() -> set[str]:
    """Visit each category (multi-page) and collect all product URLs."""
    all_urls: set[str] = set()

    # Also scrape the main shop page
    for page in range(1, 10):
        url = f"{BASE}/shop/page/{page}/" if page > 1 else f"{BASE}/shop/"
        found = get_product_urls_from_page(url)
        if not found and page > 1:
            break
        all_urls.update(found)
        print(f"  Shop page {page}: {len(found)} products (total {len(all_urls)})")
        time.sleep(0.4)

    for slug in CATEGORY_SLUGS:
        for page in range(1, 15):
            url = f"{BASE}/{slug}/page/{page}/" if page > 1 else f"{BASE}/{slug}/"
            found = get_product_urls_from_page(url)
            if not found:
                break
            new = [u for u in found if u not in all_urls]
            all_urls.update(found)
            print(f"  {slug} p{page}: +{len(new)} new (total {len(all_urls)})")
            time.sleep(0.3)

    return all_urls


def scrape_product(url: str) -> dict | None:
    try:
        r = SESSION.get(url, timeout=12)
        if r.status_code != 200:
            return None
        soup = BeautifulSoup(r.content, "html.parser")

        # Name
        name_tag = soup.find("h1", class_=lambda c: c and "product_title" in (c or ""))
        if not name_tag:
            name_tag = soup.find("h1")
        name = name_tag.get_text(strip=True) if name_tag else ""
        if not name:
            return None

        # Price — take the visible display price (class="price")
        price_tag = soup.find(class_="price")
        price = price_tag.get_text(strip=True) if price_tag else "N/A"
        # Clean up duplicate prices like "30,00€30,00€"
        price = re.sub(r'(.{3,20})\1', r'\1', price).strip()

        # Categories from rel=tag links
        cats = [a.get_text(strip=True) for a in soup.find_all("a", rel="tag")]

        # Short description
        desc_tag = soup.find("div", class_="woocommerce-product-details__short-description")
        if not desc_tag:
            desc_tag = soup.find("div", class_=lambda c: c and "short-description" in (c or ""))
        description = desc_tag.get_text(separator=" ", strip=True)[:600] if desc_tag else ""

        # Main product image
        img_tag = soup.find("img", class_=lambda c: c and "wp-post-image" in (c or ""))
        image_url = img_tag.get("src", "") if img_tag else ""

        # SKU
        sku_tag = soup.find(class_="sku")
        sku = sku_tag.get_text(strip=True) if sku_tag else ""

        return {
            "name": name,
            "price": price,
            "description": description,
            "categories": cats,
            "sku": sku,
            "url": url,
            "image_url": image_url,
            "scraped_at": datetime.now().isoformat(),
        }
    except Exception as e:
        print(f"  ! {url}: {e}")
        return None


def main():
    print("=== Collecting product URLs ===")
    urls = collect_all_product_urls()
    print(f"\nFound {len(urls)} unique product URLs\n")

    print("=== Scraping product pages ===")
    products = []
    for i, url in enumerate(sorted(urls), 1):
        p = scrape_product(url)
        if p:
            products.append(p)
            print(f"  [{i}/{len(urls)}] {p['name']} — {p['price']}")
        else:
            print(f"  [{i}/{len(urls)}] SKIP {url}")
        time.sleep(0.35)

    out_path = "../../data/products.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"products": products}, f, indent=2, ensure_ascii=False)

    print(f"\n✅  Saved {len(products)} products → {out_path}")


if __name__ == "__main__":
    main()
