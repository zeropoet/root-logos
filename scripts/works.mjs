#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import { applyFoldForgeComposition, foldForgeCompositionIdentity } from "./foldforge-score.mjs";
import { renderLibraryFirstFrames } from "./work-first-frame.mjs";
import { applyCanonicalWorkCoordinates } from "./work-coordinates.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const archiveRoot = join(root, "works");
const now = () => new Date().toISOString();
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (value) => createHash("sha256").update(value).digest("hex");
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
const STOP = new Set("a an and are as at be been but by can could did do does for from had has have he her hers him his how i if in into is it its may me more most my no nor not of on one only or our ours she so than that the their them then there these they this those through to too under up upon us was we were what when where which who will with would you your".split(" "));
const LANGUAGE_STOP = {
  de: new Set("aber alle allem allen aller alles also am an andere auch auf aus bei bin bis bist da dadurch daher darum das dass dein deine dem den denn der des die dies diese diesem diesen dieser dieses doch dort durch ein eine einem einen einer eines er es etwas für gegen gewesen hat hatte haben hier hin hinter ich ihm ihn ihnen ihr ihre im in ist ja jede jedem jeden jeder jedes kann kein keine mit muss nach nicht nichts noch nun nur ob oder ohne sehr sein seine sich sie sind so über um und uns unter vom von vor war waren was weg weil weiter welche wenn wer werden wie wieder will wir wo zu zum zur".split(" ")),
  es: new Set("al algo algún alguna algunas alguno algunos ante antes aquel aquella aquellas aquello aquellos aquí así aun aunque bajo bien cada casi como con contra cual cuando de del desde donde dos el ella ellas ello ellos en entre era eran es esa esas ese eso esos esta estaba estaban estar estas este esto estos fue fueron ha había habían hacia hasta hay la las le les lo los más me mi mientras muy nada ni no nos o otra otras otro otros para pero poco por porque que quien se ser si sin sobre solo son su sus también tan tanto te tiene todo todos tras un una unas uno unos ya y yo".split(" ")),
  ja: new Set("あれ ある いる から が こと この これ され し する その それ ため たり だ で て と とき ない なり なる に の は へ べし また まで もの も よう より を 事 也".split(" "))
};
const DEFAULT_TRANSFORMATION = "deterministic-structural-reading/v3";
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

const walkMarkdown = async (path) => {
  const stat = await import("node:fs/promises").then(({ stat }) => stat(path));
  if (stat.isFile()) return extname(path).toLowerCase() === ".md" ? [path] : [];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries
    .filter(({ name }) => !name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map(({ name }) => walkMarkdown(join(path, name))));
  return nested.flat();
};

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
  const bookHeadings = [...body.matchAll(/^[ \t]*BOOK[ \t]+([IVXLCDM]+)[ \t]*$/gmi)];
  const partHeadings = bookHeadings.length
    ? []
    : [...body.matchAll(/^[ \t]*PART[ \t]+([IVXLCDM]+)[ \t]*$/gmi)];
  const chapterHeadings = bookHeadings.length || partHeadings.length
    ? []
    : [...body.matchAll(/^[ \t]*CHAPTER[ \t]+([IVXLCDM]+)\.[ \t]*$/gmi)];
  const sectionHeadings = bookHeadings.length || partHeadings.length || chapterHeadings.length
    ? []
    : [...body.matchAll(/^[ \t]*([IVXLCDM]+)\.[ \t]*\n((?:[ \t]*[A-Z][A-Z ,&’'\-]+[ \t]*\n){1,3})[ \t]*\n/gm)];
  const division = bookHeadings.length ? "Book"
    : partHeadings.length ? "Part"
      : chapterHeadings.length ? "Chapter" : "Section";
  const headings = bookHeadings.length ? bookHeadings
    : partHeadings.length ? partHeadings
      : chapterHeadings.length ? chapterHeadings : sectionHeadings;
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
    [...seen].sort((a, b) => b[1] - a[1]).slice(0, 14).forEach(([concept, count]) => edges.push({
      from: `document-${documentIndex + 1}`, to: `concept-${conceptIndex.get(concept) + 1}`,
      relation: "expresses", weight: count
    }));
  });
  for (let left = 0; left < concepts.length; left += 1) {
    for (let right = left + 1; right < concepts.length; right += 1) {
      let shared = 0;
      for (const section of sectionRows) {
        const tokens = new Set(conceptTokens(section.text));
        if (tokens.has(concepts[left][0]) && tokens.has(concepts[right][0])) shared += 1;
      }
      if (shared) edges.push({ from: `concept-${left + 1}`, to: `concept-${right + 1}`, relation: "co-occurs", weight: shared });
    }
  }
  const palette = ["#cbb77a", "#e9e5d8", "#93b9bb", "#9a8cb6", "#ad7159", "#8aa681"];
  const scale = [1, 1.125, 1.25, 1.333333, 1.5, 1.666667, 1.875, 2];
  const graphEdges = edges.sort((a, b) => b.weight - a.weight).slice(0, 180);
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
        concepts: concepts.length, relations: graphEdges.length
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
        statement: `${title} resolves as ${documents.length} document${documents.length === 1 ? "" : "s"}, ${sectionRows.length} structural passage${sectionRows.length === 1 ? "" : "s"}, and ${graphEdges.length} witnessed relations.`
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
  let documents;
  let canonicalSource;
  let inferredTitle;
  if (midvashBibleBook) {
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
  derived.manifest.editions = [...priorEditions.filter(({ edition_id: id }) => id !== editionId), currentEditionRecord];
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
    editions: sameEdition ? priorEntry.editions : (priorEntry?.editions || 0) + 1, updated_at: derived.edition.created_at,
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
    process.stderr.write("Usage: node scripts/works.mjs ingest <path> [--title <title>] [--author <author>] [--kind <kind>] [--source <url>] [--source-visibility <public|private>] [--source-witness <id>] [--format <auto|douay-rheims-json|midvash-bible-json|midvash-bible-book-json|perseus-tei|gutenberg-book-text>] [--translation <name>] [--language <code>] [--rights <statement>] [--collection <name>] [--division <name>] [--canonical-order <number>] [--revision <revision>]\n");
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
