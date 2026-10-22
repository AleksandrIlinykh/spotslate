(() => {
  // A model can answer with far more than a popup should hold; these keep the breakdown a glance.
  const MAX_BLOCKS = 40;
  const MAX_ITEMS = 30;
  const MAX_ROWS = 30;
  const MAX_COLUMNS = 8;

  const HEADING = /^#{1,6}\s+(.*?)\s*#*\s*$/;
  const BOLD_LINE = /^\*\*([^*]+)\*\*\s*:?\s*$/; // a line of nothing but bold: a model that skips ### writes a heading so
  const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
  const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
  const FENCE = /^\s*```/;
  const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-*:?\s*)*$/; // |---|:--| and what of it has streamed so far
  const isPipeLine = (line) => line.trimStart().startsWith('|');

  // The markup that is not drawn, out of a line of text: links and images keep their words, code its characters. The
  // **bold** stays, for `setRich` in the popup.
  function clean(line) {
    return line
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/`+/g, '')
      .replace(/^\s*>\s?/, '')
      .trim();
  }

  function cellsOf(line) {
    return line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .slice(0, MAX_COLUMNS)
      .map((cell) => clean(cell));
  }

  // The answer's Markdown cut into blocks: `{type: 'heading', text}`, `{type: 'list', items}`, `{type: 'table', columns,
  // rows}` and `{type: 'text', text}`, of the subset the learning prompt asks for (see `BREAKDOWN_FORMAT`). Anything
  // else a model writes (rules, fences, quotes, links) loses its markup and keeps its words. A table whose separator
  // row has not come yet is held back while the answer streams, so no pipes flash; `final` says it is whole, and pipes
  // that never became a table then show as text.
  /** @type {SpotSlate['parseMarkdown']} */
  function parseMarkdown(text, final = false) {
    const lines = text.split('\n');
    const blocks = [];
    let paragraph = [];
    let list = null;
    const flush = () => {
      if (paragraph.length > 0) blocks.push({ type: 'text', text: paragraph.join('\n') });
      paragraph = [];
      list = null;
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') {
        flush();
      } else if (FENCE.test(line) || RULE.test(line)) {
        flush();
      } else if (HEADING.test(line) || BOLD_LINE.test(line)) {
        flush();
        const heading = clean((HEADING.exec(line) ?? BOLD_LINE.exec(line))[1]).replace(/\s*:$/, '');
        if (heading) blocks.push({ type: 'heading', text: heading });
      } else if (isPipeLine(line)) {
        flush();
        let end = i;
        while (end + 1 < lines.length && isPipeLine(lines[end + 1])) end++;
        const run = lines.slice(i, end + 1);
        if (run.length >= 2 && SEPARATOR.test(run[1])) {
          blocks.push({ type: 'table', columns: cellsOf(run[0]), rows: run.slice(2).slice(0, MAX_ROWS).map(cellsOf) });
        } else if (run.length === 1 && !final) {
          // the header of a table that is still arriving
        } else {
          blocks.push({ type: 'text', text: run.map(clean).join('\n') });
        }
        i = end;
      } else if (BULLET.test(line)) {
        if (!list) {
          flush();
          list = { type: 'list', items: [] };
          blocks.push(list);
        }
        const item = clean(BULLET.exec(line)[1]);
        if (item && list.items.length < MAX_ITEMS) list.items.push(item);
      } else {
        const kept = clean(line);
        if (list) list = null;
        if (kept) paragraph.push(kept);
      }
    }
    flush();
    return blocks.filter((block) => block.type !== 'list' || block.items.length > 0).slice(0, MAX_BLOCKS);
  }

  Object.assign((globalThis.spotslate ??= {}), { parseMarkdown });
})();
