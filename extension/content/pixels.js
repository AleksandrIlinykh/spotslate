// Drawing the companions (content/pup.js, cat.js, corgi.js) from parts: a part is a list of rows, one character per
// cell, '.' for transparent and the rest from the hero's palette.
(() => {
  // Draws `layers` in order onto an empty frame of `width` by `height` cells: [part, x, y]. What falls outside is cut.
  function drawFrame(width, height, layers) {
    const cells = Array.from({ length: height }, () => Array(width).fill('.'));
    for (const [part, left, top] of layers) {
      part.forEach((row, y) =>
        [...row].forEach((cell, x) => {
          if (cell !== '.' && cells[top + y]?.[left + x] !== undefined) cells[top + y][left + x] = cell;
        }),
      );
    }
    return cells.map((row) => row.join(''));
  }

  const mirror = (part) => part.map((row) => [...row].reverse().join(''));

  // `part` with some rows replaced: { [row index]: new row }.
  const withRows = (part, rows) => part.map((row, y) => rows[y] ?? row);

  Object.assign((globalThis.spotslate ??= {}), { pixels: { drawFrame, mirror, withRows } });
})();
