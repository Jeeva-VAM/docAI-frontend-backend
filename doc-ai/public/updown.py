import json
 
PAGE_HEIGHT = 842  # constant for your PDF
 
with open(r"C:\Users\MohammadRazakAbdulRa\Downloads\DocAI-V4 2\public\GEL_Sample_Statement_filled.json", "r", encoding="utf-8") as f:
    data = json.load(f)
 
for page in data.get("pages", []):
    for item in page.get("textItems", []):
        y = item.get("y")
        h = item.get("height")
        # only convert when both y and height exist
        if y is not None and h is not None:
            item["y"] = PAGE_HEIGHT - y - h
 
with open(r"C:\Users\MohammadRazakAbdulRa\Downloads\DocAI-V4 2\public\hehehe.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)