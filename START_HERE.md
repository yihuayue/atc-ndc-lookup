# Publish Convert ATC to NDC on GitHub Pages

This package contains the ready-to-upload website, including the vertical input/results layout, current and historical NDC lookup, CSV exports, and the mapping SOP. No installation or build command is needed.

## 1. Extract the package

Download **atc-ndc-lookup-github-pages.zip**, right-click it in Windows, and choose **Extract All**. Open the extracted folder.

Upload these nine files together:

```
index.html
styles.css
app.js
engine.js
n03a.json
.nojekyll
README.md
ATC_to_NDC_SOP.md
START_HERE.md
```

## 2. Choose the repository

Open your existing ATC website repository, or create a **Public** repository named **atc-ndc-lookup**. The separate **ndc-lookup** repository is for the drug-name/openFDA website.

## 3. Upload and save

On the repository's **Code** tab, select **Add file → Upload files**. For an empty repository, use **uploading an existing file**.

Drag the nine extracted files onto the upload page. Upload the files themselves, rather than the ZIP or its enclosing folder. The repository's top level must contain **index.html**.

Use a commit message such as **Add ATC to NDC website**, select the **main** branch, and click **Commit changes**. For an existing ATC site, upload the latest files into the same location to replace their earlier versions.

## 4. Enable GitHub Pages

Open **Settings → Pages**. Under **Build and deployment**, select:

| Setting | Value |
| --- | --- |
| Source | Deploy from a branch |
| Branch | main |
| Folder | /(root) |

Click **Save**. These settings follow [GitHub's publishing instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## 5. Get the website address

After deployment succeeds, return to **Settings → Pages** and click **Visit site**. Copy that address to share it. Publication can take up to 10 minutes. See [GitHub's instructions for viewing the published site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site#viewing-your-published-site).

For a repository named **atc-ndc-lookup**, the usual address is:

```
https://YOUR-USERNAME.github.io/atc-ndc-lookup/
```

The deployed public website can be opened without signing in to GitHub. Share the website address, rather than the repository page or a 127.0.0.1 address.

## 6. Check the published page

- Confirm the heading is **Convert ATC to NDC** and the input is above the results.
- Run **N03AA01** with **Current + historical**, then try both CSV exports. The verified 2026-09-14 result was 37 historical NDCs and 0 current NDCs; live data may change.
- A 404 usually means deployment is unfinished or index.html is outside the selected publishing folder. Check the repository's **Actions** tab for deployment errors.
- If a company-policy block appears, ask IT about access to the published github.io address and rxnav.nlm.nih.gov.

Uploading and enabling Pages are still required; downloading this package does not publish the site.
