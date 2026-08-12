#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { applyFoldForgeComposition, foldForgeCompositionIdentity } from "./foldforge-score.mjs";
import { renderLibraryFirstFrames } from "./work-first-frame.mjs";
import { applyCanonicalWorkCoordinates } from "./work-coordinates.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const archiveRoot = join(root, "works");
const now = () => new Date().toISOString();
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const execFileAsync = promisify(execFile);
const slug = (value) => String(value).toLowerCase().normalize("NFKD")
  .replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
const words = (value, language = null) => {
  const normalized = String(value).normalize("NFKC").toLowerCase();
  if (language === "ja" && typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter("ja", { granularity: "word" }).segment(normalized)]
      .filter(({ isWordLike }) => isWordLike)
      .map(({ segment }) => segment)
      .filter((token) => /[\p{L}\p{N}]/u.test(token));
  }
  return normalized.match(/[\p{L}\p{N}'’]+/gu) || [];
};
const STOP = new Set("a all also among an and another any are as at be because been being between both but by can could did do does each either even every few first for former from further had has have he her here hers him his how however i if in into is it its latter many may me might more most much must my no nor not of on one only or other others our ours own same several she should since so some still such than that the their them then there these they this those through thus to too under up upon us very was we well were what when where which while who will with within without would yet you your".split(" "));
const LANGUAGE_STOP = {
  de: new Set("aber alle allem allen aller alles also am an andere auch auf aus bei bin bis bist da dadurch daher darum das dass dein deine dem den denn der des die dies diese diesem diesen dieser dieses doch dort durch ein eine einem einen einer eines er es etwas für gegen gewesen hat hatte haben hier hin hinter ich ihm ihn ihnen ihr ihre im in ist ja jede jedem jeden jeder jedes kann kein keine mit muss nach nicht nichts noch nun nur ob oder ohne sehr sein seine sich sie sind so über um und uns unter vom von vor war waren was weg weil weiter welche wenn wer werden wie wieder will wir wo zu zum zur".split(" ")),
  es: new Set("al algo algún alguna algunas alguno algunos ante antes aquel aquella aquellas aquello aquellos aquí así aun aunque bajo bien cada casi como con contra cual cuando de del desde donde dos el ella ellas ello ellos en entre era eran es esa esas ese eso esos esta estaba estaban estar estas este esto estos fue fueron ha había habían hacia hasta hay la las le les lo los más me mi mientras muy nada ni no nos o otra otras otro otros para pero poco por porque que quien se ser si sin sobre solo son su sus también tan tanto te tiene todo todos tras un una unas uno unos ya y yo".split(" ")),
  ja: new Set("あれ ある いる から が こと この これ され し する その それ ため たり だ で て と とき ない なり なる に の は へ べし また まで もの も よう より を 事 也".split(" "))
};
const DEFAULT_TRANSFORMATION = "deterministic-structural-reading/v4-structural-depth";
const COMPILED_CORPUS_COLLECTIONS = new Set([
  "Original Douay-Rheims Catholic Canon",
  "King James Bible (1769) Protestant Canon"
]);
const foldForgeSnapshot = JSON.parse(await readFile(join(root, "sources", "foldforge.snapshot.json"), "utf8"));

export const coherentLibraryIdentity = (index, corpus = null) => {
  const editions = (index.works || [])
    .filter(({ collection }) => !COMPILED_CORPUS_COLLECTIONS.has(collection))
    .map(({ work_id, current_edition }) => [work_id, current_edition]);
  if (corpus?.corpus_id && corpus?.current_sound_edition) {
    editions.push([corpus.corpus_id, corpus.current_sound_edition]);
  }
  editions.sort(([left], [right]) => left.localeCompare(right));
  return {
    workCount: editions.length,
    signature: digest(JSON.stringify(editions))
  };
};

const walkExtension = async (path, extension) => {
  const stat = await import("node:fs/promises").then(({ stat }) => stat(path));
  if (stat.isFile()) return extname(path).toLowerCase() === extension ? [path] : [];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries
    .filter(({ name }) => !name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map(({ name }) => walkExtension(join(path, name), extension)));
  return nested.flat();
};
const walkMarkdown = (path) => walkExtension(path, ".md");

const parseDocument = (text, file, sourceRoot) => {
  const normalized = text.replace(/\r\n/g, "\n");
  const startMarker = normalized.match(/^\*{3}\s*START OF (?:THIS|THE) PROJECT GUTENBERG EBOOK[^\n]*\*{3}\s*$/mi);
  const endMarker = normalized.match(/^\*{3}\s*END OF (?:THIS|THE) PROJECT GUTENBERG EBOOK[^\n]*\*{3}\s*$/mi);
  const bodyStart = startMarker ? startMarker.index + startMarker[0].length : 0;
  const bodyEnd = endMarker ? endMarker.index : normalized.length;
  const lines = normalized.slice(bodyStart, bodyEnd).trim().split("\n");
  const sections = [];
  let current = { level: 1, title: basename(file, extname(file)), lines: [] };
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      if (current.lines.some((entry) => entry.trim())) sections.push(current);
      current = { level: heading[1].length, title: heading[2].trim(), lines: [] };
    } else current.lines.push(line);
  }
  if (current.lines.some((entry) => entry.trim())) sections.push(current);
  return {
    path: relative(sourceRoot, file) || basename(file),
    title: sections[0]?.title || basename(file, extname(file)),
    sections: sections.map((section, index) => ({
      coordinate: `${relative(sourceRoot, file) || basename(file)}#${index + 1}`,
      level: section.level,
      title: section.title,
      text: section.lines.join("\n").trim()
    }))
  };
};

const stripMarkup = (value) => String(value || "")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const parseDouayRheimsBook = (text) => {
  const book = JSON.parse(text);
  if (!book?.short_title || !Array.isArray(book.chapters)) throw new Error("The JSON source is not a structured Douay-Rheims book.");
  const documents = book.chapters.map((chapter) => ({
    path: `chapter:${chapter.chapter}`,
    title: `Chapter ${chapter.chapter}`,
    sections: [
      ...(chapter.summary ? [{
        coordinate: `${book.book}:${chapter.chapter}:summary`,
        level: 2,
        title: `Chapter ${chapter.chapter} argument`,
        text: stripMarkup(chapter.summary)
      }] : []),
      ...(chapter.verses || []).map((verse) => ({
        coordinate: `${book.book}:${chapter.chapter}:${verse.verse}`,
        level: 3,
        title: `${book.short_title} ${chapter.chapter}:${verse.verse}`,
        text: stripMarkup(verse.text)
      }))
    ]
  }));
  if (book.intros?.length) {
    documents.unshift({
      path: "apparatus:introduction",
      title: "Original argument and apparatus",
      sections: book.intros.map((intro, index) => ({
        coordinate: `${book.book}:introduction:${index + 1}`,
        level: 2,
        title: stripMarkup(intro.title) || `Introduction ${index + 1}`,
        text: stripMarkup(intro.text)
      }))
    });
  }
  return { title: book.short_title, documents };
};

export const parseMidvashBible = (text) => {
  const bible = JSON.parse(text);
  if (!bible?.name || !Array.isArray(bible.books) || bible.books.length !== 66) {
    throw new Error("The JSON source is not a complete 66-book Midvash Bible.");
  }
  const oldTestament = bible.books.filter(({ testament }) => testament === "OT");
  const newTestament = bible.books.filter(({ testament }) => testament === "NT");
  if (oldTestament.length !== 39 || newTestament.length !== 27) {
    throw new Error(`The Protestant canon requires 39 Old Testament and 27 New Testament books; found ${oldTestament.length} and ${newTestament.length}.`);
  }
  const documents = bible.books.map((book, bookIndex) => {
    if (!book.book || !book.englishName || !Array.isArray(book.chapters) || !book.chapters.length) {
      throw new Error(`Invalid Bible book at canonical position ${bookIndex + 1}.`);
    }
    return {
      path: `book:${book.book}`,
      title: book.englishName,
      sections: book.chapters.map((chapter) => ({
        coordinate: `${book.book}:${chapter.chapter}`,
        level: 2,
        title: `${book.englishName} ${chapter.chapter}`,
        text: (chapter.verses || []).map(({ text: verse }) => stripMarkup(verse)).filter(Boolean).join(" ")
      }))
    };
  });
  const chapters = documents.reduce((sum, document) => sum + document.sections.length, 0);
  const verses = bible.books.reduce((sum, book) =>
    sum + book.chapters.reduce((chapterSum, chapter) => chapterSum + (chapter.verses || []).length, 0), 0);
  return { title: bible.name, documents, measures: { books: documents.length, chapters, verses } };
};

export const parseMidvashBibleBook = (text) => {
  const book = JSON.parse(text);
  if (!book?.book || !book?.englishName || !Array.isArray(book.chapters) || !book.chapters.length) {
    throw new Error("The JSON source is not a structured Midvash Bible book.");
  }
  return {
    title: book.englishName,
    documents: book.chapters.map((chapter) => ({
      path: `chapter:${chapter.chapter}`,
      title: `${book.englishName} ${chapter.chapter}`,
      sections: (chapter.verses || []).map((verse) => ({
        coordinate: `${book.book}:${chapter.chapter}:${verse.number}`,
        level: 3,
        title: `${book.englishName} ${chapter.chapter}:${verse.number}`,
        text: stripMarkup(verse.text)
      }))
    }))
  };
};

const decodeXml = (value) => String(value || "")
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
  .replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => ({
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'"
  })[entity]);

const parseXmlTree = (text) => {
  const rootNode = { name: "#document", attributes: {}, children: [] };
  const stack = [rootNode];
  for (const token of text.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|<\/?[^>]+>|[^<]+/g) || []) {
    if (token.startsWith("<!--") || token.startsWith("<?") || token.startsWith("<!")) continue;
    if (token.startsWith("</")) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (token.startsWith("<")) {
      const match = token.match(/^<([^\s/>]+)([\s\S]*?)\/?>$/);
      if (!match) continue;
      const attributes = {};
      for (const attribute of match[2].matchAll(/([:\w.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) {
        attributes[attribute[1]] = decodeXml(attribute[3]);
      }
      const node = { name: match[1].replace(/^.*:/, ""), attributes, children: [] };
      stack.at(-1).children.push(node);
      if (!token.endsWith("/>")) stack.push(node);
      continue;
    }
    const value = decodeXml(token).replace(/\s+/g, " ").trim();
    if (value) stack.at(-1).children.push(value);
  }
  return rootNode;
};

const xmlText = (node) => (typeof node === "string"
  ? node
  : (node?.children || []).map(xmlText).filter(Boolean).join(" ")
).replace(/\s+/g, " ").trim();

const xmlDescendants = (node, predicate, matches = []) => {
  if (!node || typeof node === "string") return matches;
  if (predicate(node)) matches.push(node);
  for (const child of node.children || []) xmlDescendants(child, predicate, matches);
  return matches;
};

const EPUB_BLOCKS = new Set(["blockquote", "div", "li", "p", "pre", "table", "td", "th"]);
const epubSections = (body, fallbackTitle) => {
  const sections = [];
  let current = { level: 1, title: fallbackTitle, text: [] };
  const flush = () => {
    const text = current.text.join(" ").replace(/\s+/g, " ").trim();
    if (text) sections.push({ ...current, text });
  };
  const visit = (node) => {
    if (typeof node === "string") {
      current.text.push(node);
      return;
    }
    if (!node) return;
    const heading = node.name.match(/^h([1-6])$/);
    if (heading) {
      flush();
      current = { level: Number(heading[1]), title: xmlText(node) || fallbackTitle, text: [] };
      return;
    }
    if (node.name === "img") {
      const tex = node.attributes?.["data-tex"]?.trim();
      const alt = node.attributes?.alt?.trim();
      if (tex) {
        current.text.push(tex
          .replace(/\\(?:mathrm|mathbf|mathit|text)\{([^{}]*)\}/g, "$1")
          .replace(/\\[a-zA-Z]+/g, " ")
          .replace(/[{}$^_&]/g, " ")
          .replace(/\s+/g, " ")
          .trim());
      } else if (alt && alt.toLowerCase() !== "image") current.text.push(alt);
      return;
    }
    for (const child of node.children || []) visit(child);
    if (EPUB_BLOCKS.has(node.name)) current.text.push(" ");
  };
  for (const child of body?.children || []) visit(child);
  flush();
  return sections;
};

export const parseWisdomEpubXhtml = (text, path) => {
  const tree = parseXmlTree(text);
  const body = xmlDescendants(tree, ({ name }) => name === "body")[0];
  if (!body) throw new Error(`${path} has no XHTML body.`);
  const fallbackTitle = basename(path, extname(path));
  const sections = epubSections(body, fallbackTitle).map((section, index) => ({
    coordinate: `${path}#${index + 1}`,
    level: section.level,
    title: section.title,
    text: section.text
  }));
  return { path, title: sections[0]?.title || fallbackTitle, sections };
};

const readZipEntry = async (epubPath, entry) => {
  const { stdout } = await execFileAsync("/usr/bin/unzip", ["-p", epubPath, entry], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  return stdout.replace(/\r\n/g, "\n");
};

const parseWisdomEpub = async (sourcePath) => {
  const container = await readZipEntry(sourcePath, "META-INF/container.xml");
  const packagePath = container.match(/full-path=["']([^"']+)["']/)?.[1];
  if (!packagePath) throw new Error("The EPUB container does not identify its package document.");
  const packageText = await readZipEntry(sourcePath, packagePath);
  const packageTree = parseXmlTree(packageText);
  const manifest = new Map(xmlDescendants(packageTree, ({ name }) => name === "item")
    .map(({ attributes }) => [attributes.id, attributes.href]));
  const spineIds = xmlDescendants(packageTree, ({ name }) => name === "itemref")
    .map(({ attributes }) => attributes.idref);
  const selectedIds = spineIds.filter((id) =>
    /^(?:mes|spe|pub|gen|tra|tec|c\d\d|app1|app2|note|san|bib)$/.test(id));
  if (selectedIds.length !== 48) {
    throw new Error(`The witnessed Wisdom EPUB requires 48 structural documents; found ${selectedIds.length}.`);
  }
  const packageDirectory = packagePath.includes("/")
    ? packagePath.slice(0, packagePath.lastIndexOf("/") + 1)
    : "";
  const records = await Promise.all(selectedIds.map(async (id) => {
    const href = manifest.get(id);
    if (!href) throw new Error(`The EPUB spine item ${id} has no manifest path.`);
    const path = `${packageDirectory}${href}`;
    const xhtml = await readZipEntry(sourcePath, path);
    return { id, path, xhtml, document: parseWisdomEpubXhtml(xhtml, path) };
  }));
  return {
    canonicalSource: records.map(({ path, xhtml }) => `--- ${path} ---\n${xhtml}`).join("\n"),
    documents: records.map(({ document }) => document)
  };
};

export const parseAnalyticalEngineEpub = async (sourcePath) => {
  const container = await readZipEntry(sourcePath, "META-INF/container.xml");
  const packagePath = container.match(/full-path=["']([^"']+)["']/)?.[1];
  if (!packagePath) throw new Error("The Analytical Engine EPUB does not identify its package document.");
  const packageText = await readZipEntry(sourcePath, packagePath);
  const packageTree = parseXmlTree(packageText);
  const manifest = new Map(xmlDescendants(packageTree, ({ name }) => name === "item")
    .map(({ attributes }) => [attributes.id, attributes.href]));
  const selectedIds = xmlDescendants(packageTree, ({ name }) => name === "itemref")
    .map(({ attributes }) => attributes.idref)
    .filter((id) => !/(?:cover|header|footer|nav|toc)/i.test(id))
    .filter((id) => /\.x?html?$/i.test(manifest.get(id) || ""));
  const packageDirectory = packagePath.includes("/")
    ? packagePath.slice(0, packagePath.lastIndexOf("/") + 1)
    : "";
  const records = (await Promise.all(selectedIds.map(async (id) => {
    const href = manifest.get(id);
    if (!href) throw new Error(`The Analytical Engine EPUB spine item ${id} has no manifest path.`);
    const path = `${packageDirectory}${href}`;
    const xhtml = await readZipEntry(sourcePath, path);
    const document = parseWisdomEpubXhtml(xhtml, path);
    const text = document.sections.map((section) => `${section.title}\n${section.text}`).join("\n");
    return { path, xhtml, document, text };
  }))).filter(({ text }) => !/Transcriber[’']s Notes/i.test(text));
  const sections = records.flatMap(({ document }) => document.sections).reduce((result, section) => {
    if (/^\d+_75107-h-\d+\.htm$/i.test(section.title) && result.length) {
      result.at(-1).text = `${result.at(-1).text} ${section.text}`.trim();
    } else result.push({ ...section });
    return result;
  }, []);
  const titles = sections.map(({ title }) => title);
  for (const required of ["ARTICLE XXIX", "NOTE A", "NOTE G"]) {
    if (!titles.some((title) => title.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().includes(required))) {
      throw new Error(`The exact Analytical Engine witness is missing ${required}.`);
    }
  }
  const documents = [];
  for (const section of sections) {
    if (/^(?:ARTICLE XXIX|NOTE [A-G])\b/i.test(section.title)) {
      documents.push({
        path: section.title.toUpperCase().startsWith("ARTICLE")
          ? "article:29"
          : `translator-note:${section.title.match(/NOTE ([A-G])/i)?.[1].toLowerCase()}`,
        title: section.title,
        sections: [{ ...section }]
      });
    } else if (documents.length) documents.at(-1).sections.push({ ...section });
  }
  if (documents.length !== 8) {
    throw new Error(`The exact Analytical Engine witness requires Article XXIX and Notes A-G; found ${documents.length} structural divisions.`);
  }
  documents.forEach((document) => document.sections.forEach((section, index) => {
    section.coordinate = `${document.path}#${index + 1}`;
  }));
  return {
    canonicalSource: records.map(({ path, xhtml }) => `--- ${path} ---\n${xhtml}`).join("\n"),
    documents
  };
};

const roman = (value) => {
  const numerals = [["M", 1000], ["CM", 900], ["D", 500], ["CD", 400], ["C", 100], ["XC", 90],
    ["L", 50], ["XL", 40], ["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1]];
  let number = Number(value);
  if (!Number.isFinite(number) || number < 1) return String(value);
  return numerals.reduce((result, [symbol, magnitude]) => {
    while (number >= magnitude) {
      result += symbol;
      number -= magnitude;
    }
    return result;
  }, "");
};

export const parsePerseusTei = (text) => {
  const tree = parseXmlTree(text);
  const titleNode = xmlDescendants(tree, ({ name }) => name === "title")[0];
  const books = xmlDescendants(tree, ({ name, attributes }) =>
    name === "div" && attributes.type === "textpart" && attributes.subtype === "book");
  if (!books.length) throw new Error("The TEI source does not contain any CTS book divisions.");
  const labels = {
    def: "Definition", post: "Postulate", comm_not: "Common Notion",
    prop: "Proposition", lemma: "Lemma", porism: "Porism"
  };
  const documents = books.map((book, bookIndex) => {
    const bookNumber = book.attributes.n || String(bookIndex + 1);
    const typeDivisions = (book.children || []).filter((child) =>
      typeof child !== "string" && child.name === "div" && child.attributes.subtype === "type");
    const sections = typeDivisions.flatMap((division) => {
      const type = division.attributes.n || "passage";
      const label = labels[type] || type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
      const numbered = xmlDescendants(division, ({ name, attributes }) =>
        name === "div" && attributes.subtype === "number");
      if (!numbered.length) {
        const textValue = xmlText(division);
        return textValue ? [{
          coordinate: `book:${bookNumber}:${type}`,
          level: 2,
          title: `Book ${roman(bookNumber)} / ${label}`,
          text: textValue
        }] : [];
      }
      return numbered.map((passage, passageIndex) => {
        const passageNumber = passage.attributes.n || String(passageIndex + 1);
        return {
          coordinate: `book:${bookNumber}:${type}:${passageNumber}`,
          level: 3,
          title: `Book ${roman(bookNumber)} / ${label} ${passageNumber}`,
          text: xmlText(passage)
        };
      }).filter(({ text: textValue }) => textValue);
    });
    return {
      path: `book:${bookNumber}`,
      title: `Book ${roman(bookNumber)}`,
      sections
    };
  });
  return {
    title: xmlText(titleNode) || "Untitled TEI work",
    documents
  };
};

const romanValue = (value) => {
  const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  return [...String(value).toUpperCase()].reduce((total, symbol, index, symbols) => {
    const current = values[symbol] || 0;
    const next = values[symbols[index + 1]] || 0;
    return total + (current < next ? -current : current);
  }, 0);
};

export const parseGutenbergBookText = (text) => {
  const normalized = text.replace(/\r\n/g, "\n");
  const startMarker = normalized.match(/^\*{3}\s*START OF (?:THIS|THE) PROJECT GUTENBERG EBOOK[^\n]*\*{3}\s*$/mi);
  const endMarker = normalized.match(/^\*{3}\s*END OF (?:THIS|THE) PROJECT GUTENBERG EBOOK[^\n]*\*{3}\s*$/mi);
  const bodyStart = startMarker ? startMarker.index + startMarker[0].length : 0;
  const bodyEnd = endMarker ? endMarker.index : normalized.length;
  const body = normalized.slice(bodyStart, bodyEnd).trim();
  const bookHeadings = [...body.matchAll(/^[ \t]*BOOK[ \t]+([IVXLCDM]+)\.?[ \t]*$/gmi)];
  const partHeadings = bookHeadings.length
    ? []
    : [...body.matchAll(/^[ \t]*PART[ \t]+([IVXLCDM]+)[ \t]*$/gmi)];
  const chapterHeadings = bookHeadings.length || partHeadings.length
    ? []
    : [...body.matchAll(/^[ \t]*CHAPTER[ \t]+([IVXLCDM]+)\.?[ \t]*$/gmi)];
  const titledChapterHeadings = bookHeadings.length || partHeadings.length || chapterHeadings.length
    ? []
    : [...body.matchAll(/^[ \t]*Chapter[ \t]+([IVXLCDM]+)\.[ \t]+([^\n]+?)[ \t]*$/gm)]
      .filter(([, , title]) => /\p{L}/u.test(title) && title === title.toUpperCase());
  const sectionHeadings = bookHeadings.length || partHeadings.length || chapterHeadings.length || titledChapterHeadings.length
    ? []
    : [...body.matchAll(/^[ \t]*([IVXLCDM]+)\.[ \t]*\n((?:[ \t]*[A-Z][A-Z ,&’'\-]+[ \t]*\n){1,3})[ \t]*\n/gm)];
  const division = bookHeadings.length ? "Book"
    : partHeadings.length ? "Part"
      : chapterHeadings.length || titledChapterHeadings.length ? "Chapter" : "Section";
  const headings = bookHeadings.length ? bookHeadings
    : partHeadings.length ? partHeadings
      : chapterHeadings.length ? chapterHeadings
        : titledChapterHeadings.length ? titledChapterHeadings : sectionHeadings;
  if (!headings.length) throw new Error("The Gutenberg text does not contain any BOOK, PART, CHAPTER, or numbered section divisions.");
  const documents = headings.map((heading, index) => {
    const divisionRoman = heading[1].toUpperCase();
    const divisionNumber = romanValue(divisionRoman) || index + 1;
    const passageStart = heading.index + heading[0].length;
    const passageEnd = headings[index + 1]?.index ?? body.length;
    const passage = body.slice(passageStart, passageEnd).trim();
    return {
      path: `${division.toLowerCase()}:${divisionNumber}`,
      title: heading[2] ? `${division} ${divisionRoman}: ${heading[2].replace(/\s+/g, " ").trim()}` : `${division} ${divisionRoman}`,
      sections: [{
        coordinate: `${division.toLowerCase()}:${divisionNumber}`,
        level: 2,
        title: heading[2] ? `${division} ${divisionRoman}: ${heading[2].replace(/\s+/g, " ").trim()}` : `${division} ${divisionRoman}`,
        text: passage
      }]
    };
  });
  return { documents };
};

export const parseMachineStopsText = (text) => {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const headings = [...normalized.matchAll(/^[ \t]*_Part ([IVXLCDM]+)_[ \t]*\n\s*([A-Z][A-Z -]+)[ \t]*$/gm)];
  if (headings.length !== 3 || headings.map((heading) => romanValue(heading[1])).join(",") !== "1,2,3") {
    throw new Error(`The exact Machine Stops witness requires Parts I-III; found ${headings.length}.`);
  }
  return {
    documents: headings.map((heading, index) => {
      const part = romanValue(heading[1]);
      const title = heading[2].replace(/\s+/g, " ").trim();
      const passageStart = heading.index + heading[0].length;
      const passageEnd = headings[index + 1]?.index ?? normalized.length;
      return {
        path: `part:${part}`,
        title: `Part ${heading[1]}: ${title}`,
        sections: [{
          coordinate: `part:${part}`,
          level: 2,
          title: `Part ${heading[1]}: ${title}`,
          text: normalized.slice(passageStart, passageEnd).trim()
        }]
      };
    })
  };
};

const boundedGutenbergBody = (text) => {
  const normalized = text.replace(/\r\n/g, "\n");
  const startMarker = normalized.match(/^\*{3}\s*START OF (?:THIS|THE) PROJECT GUTENBERG EBOOK[^\n]*\*{3}\s*$/mi);
  const endMarker = normalized.match(/^\*{3}\s*END OF (?:THIS|THE) PROJECT GUTENBERG EBOOK[^\n]*\*{3}\s*$/mi);
  return normalized.slice(
    startMarker ? startMarker.index + startMarker[0].length : 0,
    endMarker ? endMarker.index : normalized.length
  ).trim();
};

export const parseCalculatingEngineText = (text) => {
  const body = boundedGutenbergBody(text);
  if (!/THE CALCULATING ENGINE/i.test(body) || !/Charles Babbage/i.test(body)) {
    throw new Error("The exact Calculating Engine witness is missing its title or attribution.");
  }
  if (words(body).length < 10_000) {
    throw new Error("The exact Calculating Engine witness is incomplete.");
  }
  return {
    canonicalSource: body,
    documents: [{
      path: "article:1",
      title: "The Calculating Engine",
      sections: [{
        coordinate: "article:1",
        level: 1,
        title: "The Calculating Engine",
        text: body
      }]
    }]
  };
};

const LEONARDO_NOTEBOOK_DIVISIONS = [
  [1, "Prolegomena and General Introduction to the Book on Painting"],
  [40, "Linear Perspective"],
  [110, "Six Books on Light and Shade"],
  [222, "Perspective of Disappearance"],
  [263, "Theory of Colours"],
  [289, "Perspective of Colour and Aerial Perspective"],
  [308, "Proportions and Movements of the Human Figure"],
  [393, "Botany for Painters and Elements of Landscape Painting"],
  [482, "The Practice of Painting"],
  [663, "Studies and Sketches for Pictures and Decorations"],
  [706, "The Notes on Sculpture"],
  [741, "Architectural Designs"],
  [770, "Theoretical Writings on Architecture"],
  [796, "Anatomy, Zoology and Physiology"],
  [857, "Astronomy"],
  [919, "Physical Geography"],
  [1001, "Topographical Notes"],
  [1113, "Naval Warfare, Mechanical Appliances and Music"],
  [1132, "Philosophical Maxims, Morals, Polemics and Speculations"],
  [1220, "Humorous Writings"],
  [1336, "Letters, Personal Records and Dated Notes"],
  [1379, "Miscellaneous Notes"]
];

const stripLeonardoEditorialNotes = (value) => {
  let source = String(value);
  let result = "";
  while (source) {
    const note = source.search(/\[(?:Footnote|Illustration)\b/i);
    if (note < 0) {
      result += source;
      break;
    }
    result += source.slice(0, note);
    let depth = 0;
    let end = note;
    for (; end < source.length; end += 1) {
      if (source[end] === "[") depth += 1;
      if (source[end] === "]") {
        depth -= 1;
        if (depth === 0) {
          end += 1;
          break;
        }
      }
    }
    source = source.slice(end);
  }
  return result
    .replace(/^\*{3}.*\*{3}\s*$/gm, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const parseLeonardoNotebooksText = (text) => {
  const body = boundedGutenbergBody(text);
  if (!/The Notebooks of Leonardo Da Vinci/i.test(body)
    || !/Translated by Jean Paul Richter/i.test(body)
    || !/Volume 2/i.test(body)) {
    throw new Error("The exact complete Leonardo notebooks witness is missing its title, translator, or second volume.");
  }
  const candidates = [...body.matchAll(/^([0-9O]{1,4})\.\s*$/gm)]
    .map((match) => ({
      number: Number(match[1].replace(/O/g, "0")),
      index: match.index,
      end: match.index + match[0].length
    }));
  const passages = [];
  let previous = 0;
  for (const candidate of candidates) {
    if (candidate.number <= previous || candidate.number > previous + 10) continue;
    passages.push(candidate);
    previous = candidate.number;
  }
  if (passages.length < 1_530 || passages[0]?.number !== 1 || passages.at(-1)?.number !== 1566) {
    throw new Error(`The exact complete Leonardo notebooks witness must preserve passages 1-1566; resolved ${passages.length} numbered passages ending at ${passages.at(-1)?.number || 0}.`);
  }
  const anchors = new Map(LEONARDO_NOTEBOOK_DIVISIONS);
  const documents = LEONARDO_NOTEBOOK_DIVISIONS.map(([firstPassage, title], divisionIndex) => {
    const lastPassage = LEONARDO_NOTEBOOK_DIVISIONS[divisionIndex + 1]?.[0] ?? 1567;
    const sections = passages
      .filter(({ number }) => number >= firstPassage && number < lastPassage)
      .map((passage) => {
        const next = passages[passages.indexOf(passage) + 1];
        let passageEnd = next?.index ?? body.length;
        if (next && anchors.has(next.number)) {
          const boundaryWindow = body.slice(passage.end, next.index);
          const volumeBoundary = boundaryWindow.search(/\n\s*(?:\*{3}\s*End of Volume 1|The Notebooks of Leonardo Da Vinci\s*\n\s*Volume 2|X{0,3}(?:IX|IV|V?I{0,3})\.\s*\n)/i);
          if (volumeBoundary >= 0) passageEnd = passage.end + volumeBoundary;
        }
        return {
          coordinate: `division:${divisionIndex + 1}:passage:${passage.number}`,
          level: 3,
          title: `${title} / Passage ${passage.number}`,
          text: stripLeonardoEditorialNotes(body.slice(passage.end, passageEnd))
        };
      })
      .filter(({ text: passageText }) => passageText);
    return {
      path: `division:${divisionIndex + 1}`,
      title,
      sections
    };
  });
  if (documents.length !== 22 || documents.some(({ sections }) => !sections.length)) {
    throw new Error("The exact complete Leonardo notebooks witness did not resolve all twenty-two major divisions.");
  }
  return { canonicalSource: body, documents };
};

const MICHELANGELO_POETRY_DIVISIONS = [
  ["sonnet", "A SELECTION FROM THE SONNETS OF MICHELANGELO BUONARROTI", "EPIGRAMMI/EPIGRAMS", 22],
  ["epigram", "EPIGRAMMI/EPIGRAMS", "MADRIGALI/MADRIGALS", 3],
  ["madrigal", "MADRIGALI/MADRIGALS", "NOTES ON THE SONNETS EPIGRAMS AND MADRIGALS", 25]
];

const translatedMichelangeloStanzas = (value) => {
  const stanzas = [...String(value).matchAll(/_([\s\S]*?)_/g)]
    .map((match) => match[1]
      .replace(/^\s*[“\"]|[”\"]\s*$/g, "")
      .replace(/^\s{0,8}/gm, "")
      .replace(/\s+/g, " ")
      .trim())
    .filter(Boolean);
  return stanzas.slice(1).join(" ").replace(/\s+/g, " ").trim();
};

export const parseMichelangeloPoetryText = (text) => {
  const body = boundedGutenbergBody(text);
  if (!/SONNETS AND MADRIGALS[\s\S]*MICHELANGELO[\s\S]*BUONARROTI/i.test(body)
    || !/RENDERED INTO ENGLISH[\s\S]*WILLIAM[\s\S]*WELLS NEWELL/i.test(body)
    || !/WITH ITALIAN TEXT/i.test(body)) {
    throw new Error("The exact Michelangelo poetry witness is missing its title, translator, or Italian source text.");
  }
  const documents = MICHELANGELO_POETRY_DIVISIONS.map(([kind, startTitle, endTitle, expected]) => {
    const start = body.indexOf(startTitle);
    const end = body.indexOf(endTitle, start + startTitle.length);
    if (start < 0 || end < 0) throw new Error(`The exact Michelangelo poetry witness is missing its ${kind} boundary.`);
    const division = body.slice(start + startTitle.length, end).trim();
    const headings = [...division.matchAll(/^([IVXLCDM]+)\s*$/gm)]
      .filter((heading, index, matches) => {
        const number = romanValue(heading[1]);
        const previous = index ? romanValue(matches[index - 1][1]) : 0;
        return number === previous + 1;
      });
    if (headings.length !== expected || romanValue(headings.at(-1)?.[1]) !== expected) {
      throw new Error(`The exact Michelangelo poetry witness requires ${expected} ${kind}s; resolved ${headings.length}.`);
    }
    return {
      path: `${kind}s`,
      title: `${kind[0].toUpperCase()}${kind.slice(1)}s`,
      sections: headings.map((heading, index) => {
        const number = romanValue(heading[1]);
        const passageStart = heading.index + heading[0].length;
        const passageEnd = headings[index + 1]?.index ?? division.length;
        const translated = translatedMichelangeloStanzas(division.slice(passageStart, passageEnd));
        if (!translated) throw new Error(`The exact Michelangelo poetry witness is missing the English rendering of ${kind} ${heading[1]}.`);
        return {
          coordinate: `${kind}:${number}`,
          level: 2,
          title: `${kind[0].toUpperCase()}${kind.slice(1)} ${heading[1]}`,
          text: translated
        };
      })
    };
  });
  if (documents.flatMap(({ sections }) => sections).length !== 50) {
    throw new Error("The exact Michelangelo poetry witness must resolve fifty translated poems.");
  }
  return { canonicalSource: body, documents };
};

const texToPlainText = (value) => {
  let text = String(value)
    .replace(/^%.*$/gm, " ")
    .replace(/\\begin\{(?:equation\*?|align\*?|gather\*?|multline\*?|array|cases|center|flushleft|flushright|quote|quotation|verse|small|text)\}/g, " ")
    .replace(/\\end\{[^}]+\}/g, " ")
    .replace(/\\(?:label|index|pageref|ref|cite)\{[^{}]*\}/g, " ")
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1 divided by $2")
    .replace(/\\sqrt(?:\[[^\]]*\])?\{([^{}]*)\}/g, "square root of $1")
    .replace(/``|''/g, '"')
    .replace(/---/g, "—")
    .replace(/--/g, "–");
  for (let pass = 0; pass < 5; pass += 1) {
    text = text.replace(/\\(?:textsc|textit|textbf|textrm|mathrm|mathbf|mathit|emph|mbox|hbox|operatorname|centerline)\{([^{}]*)\}/g, "$1");
  }
  return text
    .replace(/\\(?:alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|rho|sigma|tau|phi|chi|psi|omega)\b/gi, (match) => match.slice(1))
    .replace(/\\(?:times|cdot)\b/g, " multiplied by ")
    .replace(/\\div\b/g, " divided by ")
    .replace(/\\(?:leq|le)\b/g, " less than or equal to ")
    .replace(/\\(?:geq|ge)\b/g, " greater than or equal to ")
    .replace(/\\neq\b/g, " not equal to ")
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?/g, " ")
    .replace(/\\./g, " ")
    .replace(/[{}$^_&~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const parseLawsOfThoughtTex = (text) => {
  const body = boundedGutenbergBody(text);
  const headings = [...body.matchAll(/\\chapter\[([\s\S]*?)\]\s*\{/g)]
    .map((match) => ({
      index: match.index,
      end: match.index + match[0].length,
      title: texToPlainText(match[1] || "").replace(/\s+/g, " ").trim()
    }));
  const selected = headings.filter(({ title }) => title && !/^CONTENTS\.?$/i.test(title));
  if (selected.length !== 23 || !/^PREFACE\.?$/i.test(selected[0].title)
    || !selected.some(({ title }) => /NATURE AND DESIGN OF THIS WORK/i.test(title))
    || !/CONSTITUTION OF THE INTELLECT/i.test(selected.at(-1).title)) {
    throw new Error(`The exact Laws of Thought witness requires its preface and 22 chapters; found ${selected.length} structural divisions.`);
  }
  return {
    canonicalSource: body,
    documents: selected.map((heading, index) => {
      const next = headings.find(({ index: candidate }) => candidate > heading.index);
      const chapterText = texToPlainText(body.slice(heading.end, next?.index ?? body.length));
      const number = index === 0 ? "preface" : `chapter:${index}`;
      return {
        path: number,
        title: heading.title,
        sections: [{ coordinate: number, level: index === 0 ? 1 : 2, title: heading.title, text: chapterText }]
      };
    })
  };
};

export const parseTaoTeChingText = (text) => {
  const body = boundedGutenbergBody(text);
  const headings = [{ number: 1, index: body.search(/^Ch\. 1\. 1\./m) }];
  for (let number = 2; number <= 81; number += 1) {
    const remainderOffset = Math.max(0, headings.at(-1).index + 1);
    const remainder = body.slice(remainderOffset);
    const numbered = new RegExp(`^${number}\\. 1\\.`, "m").exec(remainder);
    const standalone = new RegExp(`^${number}\\.[ \\t]*$`, "m").exec(remainder);
    const prose = new RegExp(`^${number}\\.[ \\t]+\\S`, "m").exec(remainder);
    const match = numbered || standalone || prose;
    if (!match) throw new Error(`The Tao Te Ching witness is missing chapter ${number}.`);
    headings.push({ number, index: remainderOffset + match.index });
  }
  if (headings[0].index < 0) throw new Error("The Tao Te Ching witness is missing chapter 1.");
  return {
    documents: headings.map((heading, index) => ({
      path: `chapter:${heading.number}`,
      title: `Chapter ${heading.number}`,
      sections: [{
        coordinate: `chapter:${heading.number}`,
        level: 2,
        title: `Chapter ${heading.number}`,
        text: body.slice(heading.index, headings[index + 1]?.index ?? body.length).trim()
      }]
    }))
  };
};

export const parseSiddharthaGermanText = (text) => {
  const body = boundedGutenbergBody(text);
  const titles = [
    "DER SOHN DES BRAHMANEN", "BEI DEN SAMANAS", "GOTAMA", "ERWACHEN",
    "KAMALA", "BEI DEN KINDERMENSCHEN", "SANSARA", "AM FLUSSE",
    "DER FÄHRMANN", "DER SOHN", "OM", "GOVINDA"
  ];
  const headings = titles.map((title) => {
    const match = new RegExp(`^${title}$`, "m").exec(body);
    if (!match) throw new Error(`The Siddhartha witness is missing ${title}.`);
    return { title, index: match.index };
  }).sort((left, right) => left.index - right.index);
  return {
    documents: headings.map((heading, index) => ({
      path: `chapter:${index + 1}`,
      title: heading.title,
      sections: [{
        coordinate: `chapter:${index + 1}`,
        level: 2,
        title: heading.title,
        text: body.slice(heading.index + heading.title.length, headings[index + 1]?.index ?? body.length).trim()
      }]
    }))
  };
};

export const parseUnitedStatesConstitutionText = (text) => {
  const body = boundedGutenbergBody(text);
  const articleHeadings = [...body.matchAll(/^(Article 1|ARTICLE (?:2|THREE|FOUR|FIVE|SIX|SEVEN))[ \t]*$/gm)];
  if (articleHeadings.length !== 7) throw new Error(`The Constitution witness requires seven articles; found ${articleHeadings.length}.`);
  const preambleStart = body.search(/^We the people\b/mi);
  if (preambleStart < 0) throw new Error("The Constitution witness is missing the preamble.");
  const wordNumbers = { THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7 };
  const documents = [{
    path: "preamble",
    title: "Preamble",
    sections: [{
      coordinate: "preamble",
      level: 2,
      title: "Preamble",
      text: body.slice(preambleStart, articleHeadings[0].index).trim()
    }]
  }];
  for (const [articleIndex, heading] of articleHeadings.entries()) {
    const articleNumber = Number(heading[1].match(/\d+/)?.[0])
      || wordNumbers[heading[1].split(/\s+/).at(-1)]
      || articleIndex + 1;
    const start = heading.index + heading[0].length;
    const end = articleHeadings[articleIndex + 1]?.index ?? body.length;
    const article = body.slice(start, end).trim();
    const sectionHeadings = [...article.matchAll(/^Section (\d+)\.[ \t]*/gm)];
    documents.push({
      path: `article:${articleNumber}`,
      title: `Article ${articleNumber}`,
      sections: sectionHeadings.length ? sectionHeadings.map((section, sectionIndex) => ({
        coordinate: `article:${articleNumber}:section:${section[1]}`,
        level: 3,
        title: `Article ${articleNumber} / Section ${section[1]}`,
        text: article.slice(section.index + section[0].length, sectionHeadings[sectionIndex + 1]?.index ?? article.length).trim()
      })) : [{
        coordinate: `article:${articleNumber}`,
        level: 2,
        title: `Article ${articleNumber}`,
        text: article
      }]
    });
  }
  return { documents };
};

export const parseFederalistText = (text) => {
  const body = boundedGutenbergBody(text);
  const headings = [...body.matchAll(/^FEDERALIST\.? No\. (\d+)[ \t]*$/gm)];
  if (headings.length !== 86) throw new Error(`The Federalist witness requires 86 transmitted essays including both No. 70 versions; found ${headings.length}.`);
  const occurrences = new Map();
  return {
    documents: headings.map((heading, index) => {
      const number = Number(heading[1]);
      const occurrence = (occurrences.get(number) || 0) + 1;
      occurrences.set(number, occurrence);
      const suffix = occurrence > 1 ? `:${occurrence}` : "";
      const title = `Federalist No. ${number}${occurrence > 1 ? ` / Version ${occurrence}` : ""}`;
      return {
        path: `federalist:${number}${suffix}`,
        title,
        sections: [{
          coordinate: `federalist:${number}${suffix}`,
          level: 2,
          title,
          text: body.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? body.length).trim()
        }]
      };
    })
  };
};

export const parseGilgameshText = (text) => {
  const body = boundedGutenbergBody(text);
  const patterns = [
    ["prefatory-note", "Prefatory Note", /^PREFATORY NOTE$/m],
    ["introduction", "Introduction", /^INTRODUCTION\.$/m],
    ["pennsylvania-tablet", "Pennsylvania Tablet", /^PENNSYLVANIA TABLET\.$/m],
    ["pennsylvania-transliteration", "Pennsylvania Tablet / Transliteration", /^TRANSLITERATION\.$/m],
    ["pennsylvania-translation", "Pennsylvania Tablet / Translation", /^TRANSLATION\.$/m],
    ["pennsylvania-commentary", "Commentary on the Pennsylvania Tablet", /^COMMENTARY ON THE PENNSYLVANIA TABLET\.$/m],
    ["yale-tablet", "Yale Tablet", /^YALE TABLET\.$/m],
    ["yale-transliteration", "Yale Tablet / Transliteration", /^TRANSLITERATION\.$/m],
    ["yale-translation", "Yale Tablet / Translation", /^TRANSLATION\.$/m],
    ["corrections", "Corrections to the Pennsylvania Tablet", /^CORRECTIONS TO THE TEXT OF LANGDON'S EDITION OF THE PENNSYLVANIA\nTABLET\. \[157\]$/m],
    ["notes", "Notes", /^NOTES$/m]
  ];
  let cursor = 0;
  const headings = patterns.map(([id, title, pattern]) => {
    const match = pattern.exec(body.slice(cursor));
    if (!match) throw new Error(`The Gilgamesh witness is missing ${title}.`);
    const index = cursor + match.index;
    cursor = index + match[0].length;
    return { id, title, index, length: match[0].length };
  });
  return {
    documents: headings.map((heading, index) => ({
      path: heading.id,
      title: heading.title,
      sections: [{
        coordinate: heading.id,
        level: 2,
        title: heading.title,
        text: body.slice(heading.index + heading.length, headings[index + 1]?.index ?? body.length).trim()
      }]
    }))
  };
};

const deriveWork = ({ title, author, kind, source, translation, language, rights, documents, sourceHash, workId, editionId, rootRevision, transformation, readingContext }) => {
  const sectionRows = documents.flatMap((document, documentIndex) => document.sections.map((section, sectionIndex) => ({
    ...section, documentIndex, sectionIndex, document: document.path
  })));
  const frequency = new Map();
  const languageStopwords = LANGUAGE_STOP[language] || new Set();
  const conceptTokens = (value) => words(value, language);
  for (const token of conceptTokens(sectionRows.map(({ text }) => text).join(" "))) {
    const longEnough = language === "ja"
      ? token.length > 1 || /^\p{Script=Han}$/u.test(token)
      : token.length > 3;
    if (longEnough && !STOP.has(token) && !languageStopwords.has(token)) {
      frequency.set(token, (frequency.get(token) || 0) + 1);
    }
  }
  const concepts = [...frequency].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 36);
  const conceptIndex = new Map(concepts.map(([concept], index) => [concept, index]));
  const nodes = [
    { id: "work", type: "work", label: title, weight: 1, coordinate: "work" },
    ...documents.map((document, index) => ({
      id: `document-${index + 1}`, type: "document", label: document.title, weight: document.sections.length,
      coordinate: document.path
    })),
    ...concepts.map(([concept, count], index) => ({
      id: `concept-${index + 1}`, type: "concept", label: concept, weight: count,
      coordinate: `lexicon:${concept}`
    }))
  ];
  const edges = documents.map((document, index) => ({
    from: "work", to: `document-${index + 1}`, relation: "contains", weight: document.sections.length
  }));
  documents.forEach((document, documentIndex) => {
    const seen = new Map();
    for (const token of conceptTokens(document.sections.map(({ text }) => text).join(" "))) {
      if (conceptIndex.has(token)) seen.set(token, (seen.get(token) || 0) + 1);
    }
    const ranked = [...seen].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const strongest = ranked[0]?.[1] || 0;
    const expressionFloor = strongest <= 3 ? 1 : Math.max(2, Math.ceil(strongest * .1));
    ranked.filter(([, count]) => count >= expressionFloor).forEach(([concept, count]) => edges.push({
      from: `document-${documentIndex + 1}`, to: `concept-${conceptIndex.get(concept) + 1}`,
      relation: "expresses", weight: count
    }));
  });
  const relationWindows = sectionRows.flatMap((section) => {
    const tokens = conceptTokens(section.text);
    const windows = [];
    for (let offset = 0; offset < tokens.length; offset += 120) {
      windows.push(new Set(tokens.slice(offset, offset + 120).filter((token) => conceptIndex.has(token))));
    }
    return windows.length ? windows : [new Set()];
  });
  const conceptPresence = concepts.map(([concept]) => relationWindows.reduce((count, window) => count + Number(window.has(concept)), 0));
  for (let left = 0; left < concepts.length; left += 1) {
    for (let right = left + 1; right < concepts.length; right += 1) {
      const shared = relationWindows.reduce((count, window) => count + Number(window.has(concepts[left][0]) && window.has(concepts[right][0])), 0);
      const minimumShared = relationWindows.length <= 2 ? 1 : 2;
      const association = shared / Math.sqrt(Math.max(1, conceptPresence[left] * conceptPresence[right]));
      if (shared >= minimumShared && association >= .18) edges.push({
        from: `concept-${left + 1}`, to: `concept-${right + 1}`, relation: "co-occurs",
        weight: Number((shared * (1 + association)).toFixed(4)),
        shared_windows: shared, association: Number(association.toFixed(4))
      });
    }
  }
  const palette = ["#cbb77a", "#e9e5d8", "#93b9bb", "#9a8cb6", "#ad7159", "#8aa681"];
  const scale = [1, 1.125, 1.25, 1.333333, 1.5, 1.666667, 1.875, 2];
  const graphEdges = edges.sort((a, b) => b.weight - a.weight || a.relation.localeCompare(b.relation) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  const relationProfile = Object.fromEntries(["contains", "expresses", "co-occurs"].map((relation) => [relation, graphEdges.filter((edge) => edge.relation === relation).length]));
  const possibleRelations = documents.length + documents.length * concepts.length + concepts.length * (concepts.length - 1) / 2;
  const relationDensity = possibleRelations ? graphEdges.length / possibleRelations : 0;
  const relationWeight = graphEdges.reduce((sum, edge) => sum + Math.max(0, Number(edge.weight) || 0), 0);
  const relationWeightEntropy = graphEdges.length > 1 && relationWeight
    ? -graphEdges.reduce((sum, edge) => {
      const probability = Math.max(0, Number(edge.weight) || 0) / relationWeight;
      return probability ? sum + probability * Math.log(probability) : sum;
    }, 0) / Math.log(graphEdges.length)
    : 0;
  const structuralSignature = digest(JSON.stringify({
    documents: documents.map((document) => document.sections.length), concepts,
    relations: graphEdges.map(({ from, to, relation, weight }) => [from, to, relation, weight]),
    profile: relationProfile
  })).slice(0, 16);
  const readingHash = digest(JSON.stringify({
    sourceHash, transformation, readingContext, concepts, graphEdges,
    foldforge: foldForgeCompositionIdentity(foldForgeSnapshot)
  }));
  const seed = Number.parseInt(readingHash.slice(0, 8), 16) >>> 0;
  const scoreEvents = Array.from({ length: 72 }, (_, index) => {
    const concept = concepts[(seed + index * 7) % Math.max(1, concepts.length)] || ["silence", 1];
    const rest = index % 13 === 0 || (index + concept[1]) % 19 === 0;
    return {
      index, voice: ["ground", "relation", "figure", "breath"][index % 4],
      provenance: `lexicon:${concept[0]}`, frequency: 55 * scale[(seed + index * 3 + concept[1]) % scale.length] * (2 ** (1 + index % 3)),
      beats: index % 11 === 0 ? 2 : index % 3 === 0 ? 1 : 0.5, rest,
      amplitude: Number(Math.min(.12, .025 + concept[1] / Math.max(80, sectionRows.length * 10)).toFixed(4))
    };
  });
  const derivedWork = {
    manifest: {
      schema: "root-logos-work/v1", work_id: workId, title, author, kind,
      source, source_hash: sourceHash, source_retained: true,
      translation: translation || null, language: language || "en",
      rights: rights || "Rights status must be witnessed before public ingestion.",
      first_received_at: now(), current_edition: editionId,
      constitutional_role: "A bounded body of language transformed into a navigable visual and resonant object."
    },
    edition: {
      schema: "root-logos-work-edition/v1", edition_id: editionId, work_id: workId,
      created_at: now(), root_logos_revision: rootRevision, source_hash: sourceHash,
      parent_edition: null, status: "archived", transformation,
      reading_context: readingContext || null,
      measures: {
        documents: documents.length, sections: sectionRows.length,
        words: sectionRows.reduce((sum, section) => sum + words(section.text, language).length, 0),
        concepts: concepts.length, relations: graphEdges.length,
        relation_density: Number(relationDensity.toFixed(4)),
        relation_weight_entropy: Number(relationWeightEntropy.toFixed(4))
      },
      visual: {
        schema: "root-logos-visual-score/v1", seed, palette,
        topology: { nodes, edges: graphEdges },
        motion: { drift: .16 + (seed % 20) / 100, pulse: 7 + (seed % 9), fold: (seed % 7) + 3 }
      },
      sound: applyFoldForgeComposition({ workId, snapshot: foldForgeSnapshot, score: {
        schema: "root-logos-work-score/v1", signature: readingHash.slice(0, 12),
        tempo: 44 + (seed % 21), root_hz: 55, events: scoreEvents
      } }),
      reading: {
        dominant_concepts: concepts.slice(0, 12).map(([concept, count]) => ({ concept, count })),
        structural_depth: {
          signature: structuralSignature,
          relation_profile: relationProfile,
          relation_density: Number(relationDensity.toFixed(4)),
          relation_weight_entropy: Number(relationWeightEntropy.toFixed(4)),
          comparison_boundary: "Comparable only with editions derived through deterministic-structural-reading/v4-structural-depth."
        },
        statement: `${title} resolves as ${documents.length} document${documents.length === 1 ? "" : "s"}, ${sectionRows.length} structural passage${sectionRows.length === 1 ? "" : "s"}, and ${graphEdges.length} witnessed relations at ${(relationDensity * 100).toFixed(1)}% derived density. Structural signature ${structuralSignature}.`
      }
    }
  };
  derivedWork.edition = applyCanonicalWorkCoordinates(derivedWork.edition);
  return derivedWork;
};

export const ingestWork = async ({
  input, title, author = "Unattributed", kind = "manuscript", source = null,
  translation = null, language = "en", rights = null, rootRevision = "v1.0",
  sourceVisibility = "public", sourceWitness = null, format = "auto",
  transformation = DEFAULT_TRANSFORMATION, collection = null, division = null,
  canonicalOrder = null, readingContext = null
}) => {
  const sourcePath = resolve(input);
  const sourceStat = await import("node:fs/promises").then(({ stat }) => stat(sourcePath));
  const douayJson = sourceStat.isFile() && (format === "douay-rheims-json" || (format === "auto" && extname(sourcePath).toLowerCase() === ".json"));
  const midvashBible = sourceStat.isFile() && format === "midvash-bible-json";
  const midvashBibleBook = sourceStat.isFile() && format === "midvash-bible-book-json";
  const perseusTei = sourceStat.isFile() && (format === "perseus-tei" || (format === "auto" && extname(sourcePath).toLowerCase() === ".xml"));
  const gutenbergText = sourceStat.isFile() && (format === "gutenberg-book-text" || (format === "auto" && extname(sourcePath).toLowerCase() === ".txt"));
  const machineStopsText = sourceStat.isFile() && format === "machine-stops-text";
  const calculatingEngineText = sourceStat.isFile() && format === "calculating-engine-text";
  const leonardoNotebooksText = sourceStat.isFile() && format === "leonardo-notebooks-text";
  const michelangeloPoetryText = sourceStat.isFile() && format === "michelangelo-poetry-text";
  const analyticalEngineEpub = sourceStat.isFile() && format === "analytical-engine-epub";
  const lawsOfThoughtTex = sourceStat.isFile() && format === "laws-of-thought-tex";
  const taoTeChingText = sourceStat.isFile() && format === "tao-te-ching-text";
  const siddharthaGermanText = sourceStat.isFile() && format === "siddhartha-german-text";
  const unitedStatesConstitutionText = sourceStat.isFile() && format === "us-constitution-text";
  const federalistText = sourceStat.isFile() && format === "federalist-text";
  const gilgameshText = sourceStat.isFile() && format === "gilgamesh-text";
  const xhtmlDirectory = sourceStat.isDirectory() && format === "xhtml-directory";
  const wisdomEpub = sourceStat.isFile() && format === "wisdom-epub";
  let documents;
  let canonicalSource;
  let inferredTitle;
  if (analyticalEngineEpub) {
    const parsed = await parseAnalyticalEngineEpub(sourcePath);
    canonicalSource = parsed.canonicalSource;
    documents = parsed.documents;
  } else if (lawsOfThoughtTex) {
    const parsed = parseLawsOfThoughtTex(await readFile(sourcePath, "utf8"));
    canonicalSource = parsed.canonicalSource;
    documents = parsed.documents;
  } else if (calculatingEngineText) {
    const parsed = parseCalculatingEngineText(await readFile(sourcePath, "utf8"));
    canonicalSource = parsed.canonicalSource;
    documents = parsed.documents;
  } else if (leonardoNotebooksText) {
    const parsed = parseLeonardoNotebooksText(await readFile(sourcePath, "utf8"));
    canonicalSource = parsed.canonicalSource;
    documents = parsed.documents;
  } else if (michelangeloPoetryText) {
    const parsed = parseMichelangeloPoetryText(await readFile(sourcePath, "utf8"));
    canonicalSource = parsed.canonicalSource;
    documents = parsed.documents;
  } else if (xhtmlDirectory) {
    const files = await walkExtension(sourcePath, ".xhtml");
    if (!files.length) throw new Error("No XHTML files were found in the supplied work.");
    const texts = await Promise.all(files.map((file) => readFile(file, "utf8")));
    canonicalSource = files.map((file, index) => `--- ${relative(sourcePath, file)} ---\n${texts[index].replace(/\r\n/g, "\n")}`).join("\n");
    documents = texts.map((text, index) => parseWisdomEpubXhtml(text, relative(sourcePath, files[index])));
  } else if (wisdomEpub) {
    const parsed = await parseWisdomEpub(sourcePath);
    canonicalSource = parsed.canonicalSource;
    documents = parsed.documents;
  } else if (midvashBibleBook) {
    canonicalSource = (await readFile(sourcePath, "utf8")).replace(/\r\n/g, "\n");
    const parsed = parseMidvashBibleBook(canonicalSource);
    documents = parsed.documents;
    inferredTitle = parsed.title;
  } else if (midvashBible) {
    canonicalSource = (await readFile(sourcePath, "utf8")).replace(/\r\n/g, "\n");
    const parsed = parseMidvashBible(canonicalSource);
    documents = parsed.documents;
    inferredTitle = parsed.title;
  } else if (douayJson) {
    canonicalSource = (await readFile(sourcePath, "utf8")).replace(/\r\n/g, "\n");
    const parsed = parseDouayRheimsBook(canonicalSource);
    documents = parsed.documents;
    inferredTitle = parsed.title;
  } else if (perseusTei) {
    canonicalSource = (await readFile(sourcePath, "utf8")).replace(/\r\n/g, "\n");
    const parsed = parsePerseusTei(canonicalSource);
    documents = parsed.documents;
    inferredTitle = parsed.title;
  } else if (taoTeChingText) {
    canonicalSource = (await readFile(sourcePath, "utf8")).replace(/\r\n/g, "\n");
    documents = parseTaoTeChingText(canonicalSource).documents;
  } else if (siddharthaGermanText) {
    canonicalSource = (await readFile(sourcePath, "utf8")).replace(/\r\n/g, "\n");
    documents = parseSiddharthaGermanText(canonicalSource).documents;
  } else if (unitedStatesConstitutionText) {
    canonicalSource = (await readFile(sourcePath, "utf8")).replace(/\r\n/g, "\n");
    documents = parseUnitedStatesConstitutionText(canonicalSource).documents;
  } else if (federalistText) {
    canonicalSource = (await readFile(sourcePath, "utf8")).replace(/\r\n/g, "\n");
    documents = parseFederalistText(canonicalSource).documents;
  } else if (gilgameshText) {
    canonicalSource = (await readFile(sourcePath, "utf8")).replace(/\r\n/g, "\n");
    documents = parseGilgameshText(canonicalSource).documents;
  } else if (machineStopsText) {
    canonicalSource = (await readFile(sourcePath, "utf8")).replace(/\r\n/g, "\n");
    documents = parseMachineStopsText(canonicalSource).documents;
  } else if (gutenbergText) {
    canonicalSource = (await readFile(sourcePath, "utf8")).replace(/\r\n/g, "\n");
    documents = parseGutenbergBookText(canonicalSource).documents;
  } else {
    const files = await walkMarkdown(sourcePath);
    if (!files.length) throw new Error("No Markdown files were found in the supplied work.");
    const sourceRoot = sourceStat.isDirectory() ? sourcePath : resolve(sourcePath, "..");
    const texts = await Promise.all(files.map((file) => readFile(file, "utf8")));
    canonicalSource = files.map((file, index) => `--- ${relative(sourceRoot, file)} ---\n${texts[index].replace(/\r\n/g, "\n")}`).join("\n");
    documents = texts.map((text, index) => parseDocument(text, files[index], sourceRoot));
  }
  const sourceHash = digest(canonicalSource);
  const resolvedTitle = title || inferredTitle || basename(sourcePath, extname(sourcePath));
  const workId = `${slug(resolvedTitle)}-${digest(`${resolvedTitle}\n${author}`).slice(0, 8)}`;
  const transformationId = `read-${digest(`${transformation}\n${JSON.stringify(readingContext || null)}\n${foldForgeSnapshot.witness}`).slice(0, 6)}`;
  const editionId = `${workId}--${slug(rootRevision)}-${transformationId}-${sourceHash.slice(8, 16)}`;
  const derived = deriveWork({
    title: resolvedTitle, author, kind,
    source: sourceVisibility === "private" ? null : (source || `local:${sourcePath}`),
    translation, language, rights, documents, sourceHash, workId, editionId, rootRevision, transformation, readingContext
  });
  derived.manifest.source_visibility = sourceVisibility;
  derived.manifest.source_retained = sourceVisibility !== "private";
  derived.manifest.source_witness = {
    classification: sourceVisibility === "private" ? "private-source/public-lineage" : "public-source",
    identity: sourceWitness || "unwitnessed",
    content_sha256: sourceHash
  };
  derived.manifest.collection = collection;
  derived.manifest.division = division;
  derived.manifest.canonical_order = canonicalOrder == null ? null : Number(canonicalOrder);
  const workDir = join(archiveRoot, workId);
  const editionDir = join(workDir, "editions", editionId);
  let priorManifest = null;
  try { priorManifest = JSON.parse(await readFile(join(workDir, "manifest.json"), "utf8")); } catch {}
  let priorEditions = priorManifest?.editions || [];
  if (priorManifest) {
    derived.manifest.first_received_at = priorManifest.first_received_at;
    derived.edition.parent_edition = priorManifest.current_edition === editionId ? derived.edition.parent_edition : priorManifest.current_edition;
    if (priorManifest.current_edition === editionId) {
      try {
        const existingEdition = JSON.parse(await readFile(join(workDir, "editions", editionId, "edition.json"), "utf8"));
        derived.edition.created_at = existingEdition.created_at;
        derived.edition.parent_edition = existingEdition.parent_edition;
      } catch {}
    }
    if (!priorEditions.length && priorManifest.current_edition) {
      try {
        const editionDirectories = await readdir(join(workDir, "editions"));
        priorEditions = await Promise.all(editionDirectories.map(async (directory) => {
          const priorEdition = JSON.parse(await readFile(join(workDir, "editions", directory, "edition.json"), "utf8"));
          return {
            edition_id: priorEdition.edition_id,
            root_logos_revision: priorEdition.root_logos_revision,
            transformation: priorEdition.transformation,
            created_at: priorEdition.created_at,
            href: `works/${workId}/editions/${priorEdition.edition_id}/edition.json`
          };
        }));
        priorEditions.sort((a, b) => a.created_at.localeCompare(b.created_at));
      } catch {}
    }
    priorEditions = await Promise.all(priorEditions.map(async (record) => {
      if (record.transformation) return record;
      try {
        const priorEdition = JSON.parse(await readFile(join(workDir, "editions", record.edition_id, "edition.json"), "utf8"));
        return { ...record, transformation: priorEdition.transformation };
      } catch {
        return { ...record, transformation: "unknown-preserved-reading" };
      }
    }));
  }
  const currentEditionRecord = {
    edition_id: editionId, root_logos_revision: rootRevision, transformation, created_at: derived.edition.created_at,
    href: `works/${workId}/editions/${editionId}/edition.json`
  };
  derived.manifest.editions = [...new Map([
    ...priorEditions.filter(({ edition_id: id }) => id !== editionId),
    currentEditionRecord
  ].map((record) => [record.edition_id, record])).values()];
  await mkdir(editionDir, { recursive: true });
  await writeFile(join(workDir, "manifest.json"), json(derived.manifest));
  await writeFile(join(editionDir, "edition.json"), json(derived.edition));
  const indexPath = join(archiveRoot, "index.json");
  let index = { schema: "root-logos-works-index/v1", updated_at: now(), works: [] };
  try { index = JSON.parse(await readFile(indexPath, "utf8")); } catch {}
  const priorEntry = (index.works || []).find(({ work_id: id }) => id === workId);
  const sameEdition = priorEntry?.current_edition === editionId;
  const coherentLibraryWork = !COMPILED_CORPUS_COLLECTIONS.has(collection);
  const libraryOrder = coherentLibraryWork
    ? priorEntry?.library_order ?? Math.max(
      0,
      ...(index.works || []).map(({ library_order: order }) => Number(order) || 0)
    ) + 1
    : null;
  derived.manifest.library_order = libraryOrder;
  await writeFile(join(workDir, "manifest.json"), json(derived.manifest));
  const entry = {
    work_id: workId, title: resolvedTitle, author, kind, current_edition: editionId,
    editions: derived.manifest.editions.length, updated_at: derived.edition.created_at,
    library_order: libraryOrder,
    edition_history: derived.manifest.editions,
    source_visibility: derived.manifest.source_visibility,
    translation: derived.manifest.translation,
    rights: derived.manifest.rights,
    collection: derived.manifest.collection,
    division: derived.manifest.division,
    canonical_order: derived.manifest.canonical_order,
    manifest: `works/${workId}/manifest.json`,
    edition: `works/${workId}/editions/${editionId}/edition.json`
  };
  index.works = [entry, ...(index.works || []).filter(({ work_id: id }) => id !== workId)];
  index.updated_at = now();
  await mkdir(archiveRoot, { recursive: true });
  await writeFile(indexPath, json(index));
  return entry;
};

export const refreshFoundingConstitution = async (triggerEntry) => {
  if (!triggerEntry || triggerEntry.work_id === "root-logos-founding-constitution-0e20f4a9") return null;
  const index = JSON.parse(await readFile(join(archiveRoot, "index.json"), "utf8"));
  return index.works.find(({ work_id }) => work_id === "root-logos-founding-constitution-0e20f4a9") || null;
};

export const ingestLibraryWork = async (options) => {
  const entry = await ingestWork(options);
  const foundingConstitution = await refreshFoundingConstitution(entry);
  const firstFrames = await renderLibraryFirstFrames();
  await import(`./library-composition.mjs?frame=${firstFrames.generated_at}`);
  return {
    entry,
    founding_constitution: foundingConstitution,
    first_frame: firstFrames.frames.find(({ work_id }) => work_id === entry.work_id) || null
  };
};

const args = process.argv.slice(2);
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const command = args.shift();
  if (command !== "ingest") {
    process.stderr.write("Usage: node scripts/works.mjs ingest <path> [--title <title>] [--author <author>] [--kind <kind>] [--source <url>] [--source-visibility <public|private>] [--source-witness <id>] [--format <auto|douay-rheims-json|midvash-bible-json|midvash-bible-book-json|perseus-tei|gutenberg-book-text|machine-stops-text|calculating-engine-text|leonardo-notebooks-text|michelangelo-poetry-text|analytical-engine-epub|laws-of-thought-tex|tao-te-ching-text|siddhartha-german-text|us-constitution-text|federalist-text|gilgamesh-text|xhtml-directory|wisdom-epub>] [--translation <name>] [--language <code>] [--rights <statement>] [--collection <name>] [--division <name>] [--canonical-order <number>] [--revision <revision>]\n");
    process.exitCode = 1;
  } else {
    const input = args.shift();
    const options = { input };
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index].replace(/^--/, "");
      const map = {
        revision: "rootRevision", "source-visibility": "sourceVisibility",
        "source-witness": "sourceWitness", "canonical-order": "canonicalOrder"
      };
      options[map[key] || key] = args[index + 1];
    }
    ingestLibraryWork(options).then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
  }
}
