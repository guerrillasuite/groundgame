import React from "react";

// Parses inline **bold**, *italic*, ~~strikethrough~~, __underline__
function parseInline(text: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|__(.+?)__/g;
  let last = 0, key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) result.push(text.slice(last, m.index));
    if (m[1] != null) result.push(<strong key={key++}>{m[1]}</strong>);
    else if (m[2] != null) result.push(<em key={key++}>{m[2]}</em>);
    else if (m[3] != null) result.push(<s key={key++}>{m[3]}</s>);
    else result.push(<u key={key++}>{m[4]}</u>);
    last = m.index + m[0].length;
  }
  if (last < text.length) result.push(text.slice(last));
  return result;
}

// Renders a block of lines (within a paragraph) where some may be bullet/indent lines
function renderLines(lines: string[]): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let listItems: { indent: number; content: string }[] = [];
  let textLines: string[] = [];

  function flushText() {
    if (!textLines.length) return;
    textLines.forEach((line, i) => {
      if (i > 0) nodes.push(<br key={`br-${nodes.length}`} />);
      nodes.push(...parseInline(line));
    });
    textLines = [];
  }

  function flushList() {
    if (!listItems.length) return;
    // Group into nested structure: max 2 levels (indent 0 = top, indent > 0 = nested)
    const topItems: { text: string; sub: string[] }[] = [];
    listItems.forEach(({ indent, content }) => {
      if (indent === 0 || !topItems.length) {
        topItems.push({ text: content, sub: [] });
      } else {
        topItems[topItems.length - 1].sub.push(content);
      }
    });
    nodes.push(
      <ul key={`ul-${nodes.length}`} style={{ margin: "0.25em 0", paddingLeft: "1.4em" }}>
        {topItems.map((item, i) => (
          <li key={i} style={{ margin: "0.15em 0" }}>
            {parseInline(item.text)}
            {item.sub.length > 0 && (
              <ul style={{ margin: "0.1em 0", paddingLeft: "1.2em" }}>
                {item.sub.map((s, j) => (
                  <li key={j} style={{ margin: "0.1em 0" }}>{parseInline(s)}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    );
    listItems = [];
  }

  for (const line of lines) {
    const bulletMatch = line.match(/^(\s*)([-*])\s+(.*)$/);
    if (bulletMatch) {
      flushText();
      const indentLen = bulletMatch[1].length;
      listItems.push({ indent: indentLen > 0 ? 1 : 0, content: bulletMatch[3] });
    } else if (line.startsWith("    ") || line.startsWith("\t")) {
      // Indented line — render as indented block text
      flushList();
      flushText();
      const content = line.replace(/^(\t| {4})/, "");
      nodes.push(
        <span key={`indent-${nodes.length}`} style={{ display: "block", paddingLeft: "1.2em" }}>
          {parseInline(content)}
        </span>
      );
    } else {
      flushList();
      textLines.push(line);
    }
  }
  flushList();
  flushText();
  return nodes;
}

interface Props {
  text: string;
  style?: React.CSSProperties;
  pStyle?: React.CSSProperties; // style applied to each paragraph wrapper
}

/**
 * Renders markdown-lite text:
 * - Double newline → paragraph break
 * - Single newline → line break
 * - `- item` or `* item` → bullet list (indent with spaces/tab for sub-bullets)
 * - 4-space or tab indent → indented block
 * - `**bold**` → bold
 * - `*italic*` → italic
 * - `~~strikethrough~~` → strikethrough
 * - `__underline__` → underline
 */
export default function MarkdownText({ text, style, pStyle }: Props) {
  const paragraphs = text.split(/\n{2,}/);
  return (
    <span style={style}>
      {paragraphs.map((para, pi) => {
        const lines = para.split("\n");
        const blockNodes = renderLines(lines);
        return (
          <span key={pi} style={{ display: "block", ...(pi > 0 ? { marginTop: "0.6em" } : {}), ...pStyle }}>
            {blockNodes}
          </span>
        );
      })}
    </span>
  );
}
