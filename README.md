# ATC to NDC

Part of **Medication mapping**, with the same header and visual style as the Drug name to NDC tool. **Convert ATC to NDC** accepts level 3, 4, or 5 codes, with the input panel above the results. The expandable **API details & coverage** section sits below the workflow.

Enter an ATC class or level-5 substance code, choose NDC coverage, select **Find NDCs**, and export the ATC summary and NDC mapping.

The workflow is **ATC → ingredient RxCUI → product RxCUI → NDC**, using the public NLM APIs. The final step calls **getNDCs** for every related product. **Current + historical** (the default) also calls **getAllHistoricalNDCs**, with history=2, to retrieve dated associations. All steps are automatic.

## Use

- Open the hosted website in a browser with internet access. The standalone **ATC Drug Lookup.html** is a separate local artifact, not part of this GitHub upload package.
- Try **N03AX14** (levetiracetam), **N03AA01** (methylphenobarbital / mephobarbital), or **N03A** (the antiepileptics class).
- Choose **Current only** to use getNDCs alone. Choose **Current + historical** to include historical association records.
- **ATC summary CSV** has one row per level-5 code, including product counts, unique NDC counts, and zero-result reasons.
- **NDC mapping CSV** has one row per ATC–NDC pair. It retains ingredient and product identifiers, product names, current association status, API URLs, and available historical dates. Dated evidence preserves the product, associated RxCUI, and direct or indirect route together.
- Import the NDC column as **text** to preserve leading zeros. CSV downloads also provide a copyable text alternative.
- Stop preserves available results. Errors and interrupted runs are marked **Partial**; a failed request is not reported as a completed zero result.

## Coverage

NDCs are the original 11-digit strings from the selected APIs. **Current association** means getNDCs returned that NDC for at least one retrieved product. **History API only** means it was found by the history API and was absent from the completed current checks for the retrieved products; this is not a statement about the NDC elsewhere in RxNorm or its marketing status. Failed current checks are labeled incomplete.

Historical dates are the first and last RxNorm releases recording each association, not market availability or dispensing dates. The 2015–2026 overlap column checks the actual returned intervals; no date filter removes other records. All history is reached through the current ingredient-to-product relationships, so this is not a census of every discontinued product or former ATC assignment.

Live verification on 2026-09-14 found **0 current NDCs and 37 history-API-only NDCs for N03AA01**, through ingredient RxCUI 6758 and product RxCUIs 197923, 197924, and 197925. The latest recorded association ended in 201301, with no returned interval overlapping 2015–2026. All products returned by the selected RxNorm relationships are included, including combinations; an ingredient relationship does not establish an exact product ATC classification.

N03A uses the bundled WHO 2026 substance inventory plus any additional current RxClass member codes. Unmapped substances remain visible. Other classes use current RxClass-mapped members and may omit WHO entries without an RxClass mapping. Gabapentin and pregabalin are not added under their former N03A codes; use their current codes N02BF01 and N02BF02 when needed.

See [the SOP](ATC_to_NDC_SOP.md) for the flowchart, API calls, automatic checks, and zero-result logic.

## Publish on GitHub Pages

Start with [START_HERE.md](START_HERE.md) for the upload steps, Pages settings, website address, and troubleshooting.

Use a separate repository such as **atc-ndc-lookup** for this ATC tool, or host it in a dedicated subfolder. The existing **ndc-lookup** project is the separate drug-name/openFDA tool.

For a new repository:

1. Create a public repository, then upload the extracted contents of the ATC GitHub Pages package directly into its top level.
2. Ensure the top level includes index.html, styles.css, app.js, engine.js, n03a.json, README.md, ATC_to_NDC_SOP.md, START_HERE.md, and .nojekyll.
3. Open **Settings → Pages**, choose **Deploy from a branch**, then **main** and **/(root)**, and select **Save**.
4. After successful deployment, use the exact live address shown by GitHub.
5. Test N03AX14, the API-response links, and both CSV exports.

This package does not publish itself or change an existing GitHub repository.

## Development

The GitHub package contains ready-to-host static files and requires no build command. In the full development project, run **node serve.mjs** for the local preview at port 4173. After edits, run **node build-portable.mjs**, then **npm test**. The dist folder is the hosting output; development scripts are not included in this upload package.

Browser automation tools **lookup_atc** and **read_atc_results** use the same page and API workflow. Only an ATC code is required; lookup_atc also accepts coverage=current or coverage=history.

## Sources

- [ATC identifier to RxCUI](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.findRxcuiById.html)
- [Active concept properties](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getRxConceptProperties.html)
- [Related drug products](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getRelatedByType.html)
- [RxCUI to NDC: getNDCs](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getNDCs.html)
- [Historical NDC associations](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getAllHistoricalNDCs.html)
- [RxClass membership](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxClass.getClassMembers.html)
- [WHO N03A index](https://atcddd.fhi.no/atc_ddd_index/?code=N03A)
- [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
