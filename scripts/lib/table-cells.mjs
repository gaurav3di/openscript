/**
 * Splitting a Markdown table row into its cells, for every tool that reads one
 * the way a reader sees it.
 *
 * Shared because two readers splitting the same row two ways is how the
 * editor's hover text for six drawing calls came to say "box" and "nothing":
 * the documentation site read the rows correctly and the library prose
 * generator split them on every pipe.
 */

/**
 * The cells of a table row, split on every pipe a backslash does not escape and
 * a code span does not hold.
 *
 * The second half is a deliberate difference from the strict reading of a
 * table, which splits a row before it looks for code spans. Rows in the
 * specification and the reference write a union such as `line \| box` inside a
 * code span; read strictly, an unescaped one breaks in two at the pipe and
 * loses its last cell, which is not what anybody who wrote one meant. The
 * pages escape those pipes, because other renderers read strictly, and an
 * escaped pipe is a pipe inside a code span as well as outside one.
 */
export function tableCells(text) {
  let row = text.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells = [];
  let cell = '';
  for (let i = 0; i < row.length; i += 1) {
    if (row[i] === '\\' && row[i + 1] === '|') {
      cell += '|';
      i += 1;
    } else if (row[i] === '`') {
      let run = 1;
      while (row[i + run] === '`') run += 1;
      const ticks = '`'.repeat(run);
      let close = row.indexOf(ticks, i + run);
      while (close !== -1 && row[close + run] === '`') close = row.indexOf(ticks, close + run + 1);
      const end = close === -1 ? i + run : close + run;
      cell += row.slice(i, end).replaceAll('\\|', '|');
      i = end - 1;
    } else if (row[i] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += row[i];
    }
  }
  cells.push(cell.trim());
  return cells;
}
