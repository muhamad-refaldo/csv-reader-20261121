// Fast CSV reader: returns exactly what csv-reader 1.0.0 returns for every input,
// but faster. Dependency-free ES module.
//
// Design: the reference walks the text one character at a time, building every field
// with string concatenation. This parser instead jumps between delimiters with
// indexOf (a native scan) and cuts fields out with slice, so the common case never
// touches a character twice. Two paths per field:
//   - unquoted: the next ',' / LF bounds the field; a slice is the value unless a
//     stray CR hides inside it (rare), in which case a short scan drops the CRs and
//     records one stray_cr error per CR.
//   - quoted: indexOf finds the closing quote (skipping doubled quotes); the content
//     is one slice unless it holds doubled quotes, CRs or line breaks (rare), which
//     are then repaired. What follows the closing quote is read as junk when it is
//     not a comma or a line break.
// Every error code, its line (the line its record starts on) and its row (the
// record's index in rows, null for the header) match the reference exactly.

const COMMA = 0;
const LINE = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const len = text.length;
  let pos = 0;
  let line = 1;
  if (len > 0 && text.charCodeAt(0) === 0xFEFF) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes.
  // Kept in outer `let`s so readUnquoted (defined once) can record errors for it.
  let recordLine = 1;
  let recordRow = null;

  // Reads an unquoted field starting at `pos`, appending to `init` (the value built
  // so far: '' for a plain field, the quoted content for quote junk, '"' for an
  // unterminated quote's re-read). Returns {value, ended, added}: `added` counts
  // the characters kept during this call (dropped CRs do not count). Mutates pos
  // and line; pushes one stray_cr error per CR dropped.
  function readUnquoted(init) {
    let value = init;
    let added = 0;
    while (pos < len) {
      const c = text.indexOf(',', pos);
      const n = text.indexOf('\n', pos);
      let m;
      let ended;
      if (c === -1 && n === -1) {
        m = len;
        ended = END;
      } else if (c === -1) {
        m = n;
        ended = LINE;
      } else if (n === -1) {
        m = c;
        ended = COMMA;
      } else if (c < n) {
        m = c;
        ended = COMMA;
      } else {
        m = n;
        ended = LINE;
      }
      // A line break whose char before the LF is a CR is a CRLF: the CR belongs to
      // the break, not to the field.
      let contentEnd = m;
      if (ended === LINE && m > pos && text.charCodeAt(m - 1) === 13) contentEnd = m - 1;
      // Any CR left inside [pos, contentEnd) is a stray CR: it is dropped and
      // reported. (A CR followed by LF cannot hide here: that LF would have been
      // the nearer line break.)
      const seg = text.slice(pos, contentEnd);
      if (seg.indexOf('\r') === -1) {
        value += seg;
        added += seg.length;
        if (ended === LINE) {
          pos = m + 1;
          line++;
        } else if (ended === COMMA) {
          pos = m + 1;
        } else {
          pos = len;
        }
        return { value, ended, added };
      }
      // Slow path: one or more stray CRs in this field. Walk it, dropping each CR
      // (one stray_cr error each) and keeping the runs between them.
      let i = pos;
      while (i < contentEnd) {
        if (text.charCodeAt(i) === 13) {
          errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
          i++;
        } else {
          const nextCR = text.indexOf('\r', i);
          const runEnd = nextCR === -1 || nextCR >= contentEnd ? contentEnd : nextCR;
          value += text.slice(i, runEnd);
          added += runEnd - i;
          i = runEnd;
        }
      }
      if (ended === LINE) {
        pos = m + 1;
        line++;
      } else if (ended === COMMA) {
        pos = m + 1;
      } else {
        pos = len;
      }
      return { value, ended, added };
    }
    return { value, ended: END, added };
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos++;
        line++;
      } else if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let lastQuoted = false;
    let ended = COMMA;

    while (true) {
      let value;
      let quoted = false;
      if (text.charCodeAt(pos) === 34) {
        // ---- Quoted field ----
        quoted = true;
        const open = pos;
        pos++;
        // The closing quote is the first '"' not followed by another '"'.
        let q = text.indexOf('"', pos);
        while (q !== -1 && q + 1 < len && text.charCodeAt(q + 1) === 34) {
          q = text.indexOf('"', q + 2);
        }
        if (q === -1) {
          // The quote never closes: it is a literal character, and the text after
          // it is read again as unquoted.
          pos = open + 1;
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          const f = readUnquoted('"');
          value = f.value;
          ended = f.ended;
        } else {
          let content = text.slice(pos, q);
          const hasLF = content.indexOf('\n') !== -1;
          const hasCR = content.indexOf('\r') !== -1;
          const hasDD = content.indexOf('""') !== -1;
          if (hasLF || hasCR) {
            // Count the line breaks inside the quotes: each CR and each LF not
            // part of a CRLF is one line.
            let breaks = 0;
            for (let i = 0; i < content.length; i++) {
              const ch = content.charCodeAt(i);
              if (ch === 13) {
                breaks++;
                if (i + 1 < content.length && content.charCodeAt(i + 1) === 10) i++;
              } else if (ch === 10) {
                breaks++;
              }
            }
            line += breaks;
          }
          if (hasDD) content = content.replaceAll('""', '"');
          if (hasCR) content = content.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
          pos = q + 1;
          if (pos >= len) {
            value = content;
            ended = END;
          } else {
            const c = text.charCodeAt(pos);
            if (c === 44) {
              pos++;
              value = content;
              ended = COMMA;
            } else if (c === 10) {
              pos++;
              line++;
              value = content;
              ended = LINE;
            } else if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
              pos += 2;
              line++;
              value = content;
              ended = LINE;
            } else {
              // What follows the closing quote is appended as it stands, up to
              // the next comma or line break.
              const f = readUnquoted(content);
              if (f.added > 0) {
                errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
              }
              value = f.value;
              ended = f.ended;
            }
          }
        }
      } else {
        // ---- Unquoted field ----
        const f = readUnquoted('');
        value = f.value;
        ended = f.ended;
      }
      fields.push(value);
      lastQuoted = quoted;
      if (ended !== COMMA) break;
    }

    // A line that held only stray CRs is left with no characters: no record (its
    // stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
