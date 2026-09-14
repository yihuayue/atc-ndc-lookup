# SOP: ATC to NDC using RxNorm APIs

## Purpose and output

Map an ATC class or substance code to current and optionally historical RxNorm NDCs using a repeatable API workflow. The output is an ingredient-linked mapping, not a reconstruction of an individual's medication package.

The two CSV tables are:
1. **ATC summary:** one row per ATC level-5 code, including rows with zero results.
2. **NDC mapping:** one row per ATC–NDC pair, preserving all linked product identifiers and source URLs.

## Workflow

~~~mermaid
flowchart TD
    A[Enter an ATC code] --> B{Level-5 substance code?}
    B -->|Yes| D[Use the entered substance code]
    B -->|Class| C[Find level-5 codes from class inventory]
    C --> D
    D --> E[findRxcuiById: ATC code to active RxCUIs]
    E --> F[getRxConceptProperties: name and ingredient term type]
    F --> G[getRelatedByType: related drug-product RxCUIs]
    G --> H[getNDCs: product RxCUI to current NDCs]
    G -->|Current + historical selected| L[getAllHistoricalNDCs: product RxCUI to dated associations]
    H --> I[Combine duplicate codes within each ATC]
    L --> I
    I --> J[Export ATC summary and NDC mapping]
    E --> K[Record zero-result or incomplete-query reasons]
    F --> K
    G --> K
    H --> K
    K --> J
~~~

## 1. Establish the substance rows

Normalize the entered ATC code by removing spaces and hyphens and using uppercase. A level-5 code is used as entered.

For a broader class, request:
~~~
https://rxnav.nlm.nih.gov/REST/rxclass/classMembers.json?classId={ATC}&relaSource=ATC&trans=0
~~~
Collect level-5 codes from SourceId attributes. For N03A and its subgroups, also retain the bundled WHO 2026 substance inventory so an unmapped substance is not lost. Former N03AX12 and N03AX16 are excluded from current class expansion. The app records the inventory source on each summary row.

Other classes depend on RxClass mappings; they are not exhaustive WHO inventories.

## 2. Match each ATC code to RxCUIs

Request:
~~~
https://rxnav.nlm.nih.gov/REST/rxcui.json?idtype=ATC&id={ATC5}&allsrc=0
~~~
Read the identifiers in idGroup.rxnormId. The active-scope query is explicit. Do not substitute an ingredient-name query when this ATC mapping is absent.

If no identifier is returned, retain the ATC row with zero counts and the reason that no active mapping was found.

## 3. Read and check the ingredient concepts

For each returned identifier, request:
~~~
https://rxnav.nlm.nih.gov/REST/rxcui/{ingredientRxCUI}/properties.json
~~~
Use the returned name and term type. Continue only when active properties match the requested identifier and the concept type is IN (ingredient), PIN (precise ingredient), or MIN (multiple ingredients).

This is an automatic check of API fields. It does not involve subjective name matching or manual approval. A missing active record or an unsupported concept type gets an explanatory result.

## 4. Retrieve drug products through the API

For every accepted ingredient, request:
~~~
https://rxnav.nlm.nih.gov/REST/rxcui/{ingredientRxCUI}/related.json?tty=SCD+SBD+GPCK+BPCK
~~~
Use the returned generic clinical drugs (SCD), branded drugs (SBD), generic packs (GPCK), and branded packs (BPCK). Combine duplicate product RxCUIs while retaining every ingredient that led to them.

No strength, route, brand, or combination-name filter is applied locally. These are products related by the API's default paths. Those paths do not include every possible relationship, such as separately linked reformulations or quantified forms.

## 5. Retrieve current and historical NDCs

For each unique product RxCUI, request:
~~~
https://rxnav.nlm.nih.gov/REST/rxcui/{productRxCUI}/ndcs.json
~~~
Read ndcGroup.ndcList.ndc. The API returns current RxNorm-curated NDCs in 11-digit form. Preserve those values as strings; do not infer or manually construct package codes.

The product step is required because an ingredient RxCUI does not specify a strength, dosage form, brand, or package. The supported getNDCs inputs are SCD, SBD, GPCK, and BPCK products.

With **Current + historical** selected (the default), also request for each product:
~~~
https://rxnav.nlm.nih.gov/REST/rxcui/{productRxCUI}/allhistoricalndcs.json?history=2
~~~
Read historicalNdcConcept.historicalNdcTime and each group's ndcTime entries. Preserve each original NDC string, associated RxCUI, route, startDate, and endDate together. A direct route associates the NDC with the queried product; an indirect route comes from a different, archived product concept that was remapped to it.

Both APIs run independently. A history failure preserves current results and marks the run partial; a current failure preserves historical results but does not establish that they are absent from the current release. The app does not infer NDCs from an empty response.

The history option still starts with the products returned by the current ingredient relationships. It does not discover every archived product independently or reconstruct former ATC assignments.

## 6. Consolidate and export

Deduplicate within each ATC code by the returned NDC string. Preserve the contributing product RxCUIs, product names, ingredient RxCUIs, term types, and API-response URLs. A shared NDC can appear separately under different ATC codes.

Count products before NDC retrieval, so products with no NDCs still contribute to the product count. Count distinct returned NDCs separately. The summary uses exactly one row per level-5 code and separates current NDCs from those returned only by the history API.

For each ATC–NDC pair, assign:
- **Current association:** at least one queried product's getNDCs response contains the NDC.
- **History API only:** the history API returned it and all current checks for retrieved products completed without finding it.
- **Current check incomplete:** history returned it, no current positive was found, and current checks failed or are unfinished.

These statuses describe the retrieved products only. A code returned by both APIs counts once in the total and once in the current count.

The NDC export includes the earliest first release and latest last release across returned evidence. These are summary bounds, not a continuous interval. The **RxNorm association evidence (JSON)** column retains each product, associated RxCUI, direct/indirect route, start/end pair, and history source URL together, including overlapping or disjoint intervals. The current API URL column links the current checks even when those checks returned no code.

The **Any recorded association overlaps 2015–2026** column is Yes if any valid returned interval starts on or before 202612 and ends on or after 201501. It is No only when all returned intervals are valid and none overlaps; otherwise it is Unknown. No historical dates means Unknown, including current-only lookups. The summary's overlap count counts known Yes results; a partial run may have incomplete counts. No date filter excludes other records. Neither the date bounds nor the overlap flag establishes marketing or dispensing dates.

Include the RxNorm release, query timestamp, and run status in the exports. The display filter does not restrict exported rows. Import CSV NDC columns as text in Excel or statistical software.

## Zero results and incomplete queries

| Result | Explanation |
| --- | --- |
| No RxCUI | The ATC identifier query returned no active RxCUI. |
| No ingredient concept | Returned identifiers had no usable active IN, PIN, or MIN properties. |
| No products | Ingredient concepts were found, but the related-products API returned none of the supported product types. |
| No NDCs | Product concepts were found, but the selected NDC APIs returned none. Current-only zeros may still have historical records. |
| Partial | A request failed, the run was stopped, or an unexpected NDC format was returned. Retrieved results remain available; zero is not interpreted as a completed negative search. |

A zero result does not prove that a substance never had an NDC or was never marketed in the US. An unexpected code format is retained as returned and marked partial rather than padded or guessed.

## Interpretation

Current RxNorm presence and historical association dates do not establish market availability. Historical coverage follows the current product relationships and includes remapped predecessors returned by the history API, so it may omit disconnected archived products. The output includes API-related combinations and formulations. It does not independently prove that each product has the input ATC code as its product classification. All validation and retrieval steps run automatically.

## Verified example: N03AA01

On 2026-09-14 (RxNorm release 08-Sep-2026), N03AA01 mapped to ingredient RxCUI **6758, mephobarbital**. The WHO substance name is methylphenobarbital. Related product RxCUIs were **197923**, **197924**, and **197925**.

| Product RxCUI | Product | Current NDCs | NDCs returned by history API |
| --- | --- | ---: | ---: |
| 197923 | mephobarbital 100 MG Oral Tablet | 0 | 20 |
| 197924 | mephobarbital 32 MG Oral Tablet | 0 | 8 |
| 197925 | mephobarbital 50 MG Oral Tablet | 0 | 9 |

There were **37 unique NDCs** in the combined historical results. For example, NDC **00115700705** was directly associated with product **197923** from RxNorm release **200706** to **201212**. The latest last release across all 37 codes was **201301**. None of their returned association intervals overlaps 2015–2026.

This explains why a current getNDCs response can be empty while historical codes appear in the mapping. Both results come from APIs with different coverage.

## Source documentation

- [findRxcuiById](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.findRxcuiById.html)
- [getRxConceptProperties](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getRxConceptProperties.html)
- [getRelatedByType](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getRelatedByType.html)
- [getNDCs](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getNDCs.html)
- [getAllHistoricalNDCs](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getAllHistoricalNDCs.html)
- [getClassMembers](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxClass.getClassMembers.html)
- [WHO N03A](https://atcddd.fhi.no/atc_ddd_index/?code=N03A)
