const articleRoot = document.querySelector("#article-root");
const markdownPath = document.body.dataset.markdown;

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const stripFrontMatter = (markdown) => {
  if (!markdown.startsWith("---")) {
    return { frontMatter: {}, content: markdown };
  }

  const end = markdown.indexOf("\n---", 3);
  if (end === -1) {
    return { frontMatter: {}, content: markdown };
  }

  const rawMatter = markdown.slice(3, end).trim();
  const frontMatter = rawMatter.split("\n").reduce((metadata, line) => {
    const separator = line.indexOf(":");
    if (separator === -1) {
      return metadata;
    }

    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^"|"$/g, "");

    return { ...metadata, [key]: value };
  }, {});

  return {
    frontMatter,
    content: markdown.slice(end + 4).trim(),
  };
};

const inlineMarkdown = (text) =>
  escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");

const renderBlocks = (markdown) => {
  const lines = markdown.split("\n");
  const blocks = [];
  let paragraph = [];
  let list = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list.length) {
      blocks.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
      list = [];
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    if (trimmed.startsWith("- ")) {
      flushParagraph();
      list.push(trimmed.slice(2));
      return;
    }

    flushList();

    if (trimmed.startsWith("#### ")) {
      flushParagraph();
      blocks.push(`<h4>${inlineMarkdown(trimmed.slice(5))}</h4>`);
      return;
    }

    if (trimmed.startsWith("### ")) {
      flushParagraph();
      blocks.push(`<h3>${inlineMarkdown(trimmed.slice(4))}</h3>`);
      return;
    }

    if (trimmed.startsWith("## ")) {
      flushParagraph();
      blocks.push(`<h2>${inlineMarkdown(trimmed.slice(3))}</h2>`);
      return;
    }

    if (trimmed.startsWith("# ")) {
      flushParagraph();
      blocks.push(`<h1>${inlineMarkdown(trimmed.slice(2))}</h1>`);
      return;
    }

    if (trimmed.startsWith("> ")) {
      flushParagraph();
      blocks.push(`<blockquote>${inlineMarkdown(trimmed.slice(2))}</blockquote>`);
      return;
    }

    paragraph.push(trimmed);
  });

  flushParagraph();
  flushList();

  return blocks.join("\n");
};

const renderArticle = (markdown) => {
  const { frontMatter, content } = stripFrontMatter(markdown);
  const html = renderBlocks(content);
  const title = frontMatter.title || "Living Statement";
  const number = frontMatter.number || "";
  const domain = frontMatter.domain || "Root Logos";

  document.title = number ? `Living Statement ${number} | Root Logos` : `${title} | Root Logos`;

  articleRoot.innerHTML = `
    <div class="article-shell">
      <aside class="article-meta" aria-label="Statement metadata">
        <a class="archive-back" href="../index.html#statements">Archive</a>
        <span>Living Statement ${escapeHtml(number)}</span>
        <span>${escapeHtml(domain)}</span>
      </aside>
      <div class="article-body">
        ${html}
      </div>
    </div>
  `;
};

const renderError = () => {
  articleRoot.innerHTML = `
    <div class="article-shell">
      <div class="article-body">
        <h1>Statement unavailable</h1>
        <p>This statement could not be loaded. Return to the archive and try again.</p>
      </div>
    </div>
  `;
};

fetch(markdownPath)
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Unable to load ${markdownPath}`);
    }
    return response.text();
  })
  .then(renderArticle)
  .catch(renderError);
