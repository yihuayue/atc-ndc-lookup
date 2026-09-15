# ATC to NDC

Convert Anatomical Therapeutic Chemical (ATC) codes to current and historical National Drug Codes (NDCs) using NLM RxNorm.

## SOP

### 1. Run a lookup

1. Enter a level 3, 4, or 5 ATC code, such as **N03A**, **N03AX**, or **N03AX14**.
2. Choose **Current only** for NDCs in the current RxNorm release, or **Current + historical** (default) to also retrieve historical associations.
3. Select **Find NDCs** and wait for the lookup to finish.
4. Review **Status · mapping step**. For a result with no NDCs, it shows where the mapping stopped and links to that step's response. For **Partial** results, review the failed requests and rerun as needed.

### 2. Mapping procedure

The tool performs these steps automatically:

**ATC code → ingredient RxCUI → product RxCUI → NDC**

RxCUI is the RxNorm concept identifier.

| Step | Method |
| --- | --- |
| Expand the ATC class | Identify level-5 substance codes using [RxClass](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxClass.getClassMembers.html). N03A and its subgroups also use the bundled WHO 2026 inventory. A level-5 input is used directly. |
| Identify ingredients | Use [findRxcuiById](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.findRxcuiById.html) to map each ATC code to RxCUIs and check for active ingredient concepts. |
| Retrieve products | Use [getRelatedByType](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getRelatedByType.html) to retrieve related generic drugs, branded drugs, and packs. |
| Retrieve NDCs | Call [getNDCs](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getNDCs.html) for each product. Historical mode also calls [getAllHistoricalNDCs](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getAllHistoricalNDCs.html) with `history=2`, including remapped-product associations. |
| Consolidate | Combine duplicate NDCs within each ATC code while retaining product identifiers, source links, and association dates. Keep substances with zero results in the summary. |

### 3. Export results

- **ATC summary CSV:** one row per level-5 substance, with product and NDC counts, lookup status, mapping step, step outcome, and relevant API links.
- **NDC mapping CSV:** one row per ATC–NDC pair, with ingredient and product identifiers, current association status, source links, and available historical dates and evidence.

Both files include the RxNorm release, retrieval time, and run status. Exports include all retrieved rows, regardless of the display filter. NDCs retain their leading zeros in the page and CSV.

**Excel:** Use **Data → From Text/CSV** and set the NDC column to **Text** before loading. Opening a CSV directly can remove leading zeros. See [Microsoft's import guidance](https://support.microsoft.com/en-us/office/keeping-leading-zeros-and-large-numbers-1bf7b935-36e1-4985-842f-5dfa51f85fe7).

## Interpreting results

| Mapping step | What stopped the mapping |
| --- | --- |
| ATC → RxCUI | No RxCUI was returned for the ATC code. |
| Ingredient check | Returned RxCUIs did not provide an active ingredient concept. |
| Ingredient → product | No related drug products were returned. |
| Product → NDC | Products were found, but the selected APIs returned no NDCs. |

A completed request with no matches is a mapping gap. A failed or interrupted request is marked **Partial**, with the affected step identified.

- **Current association:** the current API returned the code. **History API only:** historical results returned it and completed current checks did not. **Current check incomplete:** those checks failed or are unfinished.
- Historical dates describe RxNorm association releases, not marketing or dispensing dates. All returned dates are included. First and last dates are summary bounds; individual intervals remain in the exported evidence.
- Historical coverage starts from currently related products and may miss disconnected archived products. ATC class expansion may omit substances without RxClass mappings; N03A also uses its bundled inventory and excludes former class members.
- Related products can include combinations. Ingredient relationships alone do not confirm a product's exact ATC classification. Zero results do not establish that a substance never had an NDC.
