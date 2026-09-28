// Standalone SVG piece renderer. Provides getPieceSVG(pieceLetter) used
// throughout script.js. Pieces use the classic cburnett outline set
// (lichess default look), in pure black/white: white pieces are
// white-filled with a black outline, black pieces are black-filled
// with a white outline.

const PIECE_PATHS = {
  k: `M22.5 11.63V6M20 8h5M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5
      M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4v3.5v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7
      M11.5 30c5.5-3 15.5-3 21 0
      M11.5 33.5c5.5-3 15.5-3 21 0
      M11.5 37c5.5-3 15.5-3 21 0`,
  q: `M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5-7 11L27 11l-4.5 13.5L18 11l-4.5 13.5-7-11L9 26z
      M9 26c0 2 1.5 2 2.5 4c1 1.5 1 1 0.5 3.5c-1.5 1-1.5 2.5-1.5 2.5s-1.5 0.5-1.5 2.5c8.5 1.5 18.5 1.5 27 0c0-2-1.5-2.5-1.5-2.5s0-1.5-1.5-2.5c-0.5-2.5-0.5-2 0.5-3.5c1-2 2.5-2 2.5-4
      M11.5 30c5.5 3 15.5 3 21 0
      M12 33.5c5.5 3 14.5 3 20 0
      M12.5 36c5 2 15 2 20 0`,
  r: `M9 39h27v-3H9v3z
      M12 36v-4h21v4H12z
      M11 14V9h4v2h5V9h5v2h5V9h4v5
      M11 14l1.5 16.5h18L34 14
      M11 14h23`,
  b: `M9 36c3.4-1 6-1 10.4-1.5c2.6-.5 5.6-1.5 8.1 0c4.4.5 7 .5 10.4 1.5
      M15 32c2.5 2.5 12.5 2.5 15 0
      M22.5 8a2.5 2.5 0 1 0 0.001 0z
      M22.5 8c-3.5 3-6 8-6 12c0 3.5 2 5 6 5s6-1.5 6-5c0-4-2.5-9-6-12z
      M17.5 26c2 1 8.5 1 10.5 0`,
  n: `M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21
      M24 18c.38 2.91-5.55 7.37-8 9c-3 2-2.82 4.34-5 4c-1.042-.94 1.41-3.04 0-3c-1 0-.5 1.5-1 1.5c-1 0-1-1-1-1c-1 3 1 3 1 3c-1 0-4-1-4-4c0-2 3-2.82 3-4.5c0-1.5-1-1.5-1-2.5c0-1 1-2.5 1-2.5s-1.5-.5-1.5-1.5c0-1 2-2 2-2s-.5-1.5.5-2.5c1-1 3-1 3-1s1-1.5 3-1.5c2 0 3.5 1.5 3.5 1.5s2 .5 2 3z
      M9.5 25.5c1.5-1 3.5-1 4.5.5`,
  p: `M22.5 9a4.5 4.5 0 1 0 0.001 0z
      M22.5 13.5c-1.5 4-4 5-4 10c0 4 3.5 6 3.5 6h1s3.5-2 3.5-6c0-5-2.5-6-4-10z
      M17 32c0-3 3-4.5 5.5-4.5S28 29 28 32c0 2.5-2.5 3-2.5 3h-6s-2.5-.5-2.5-3z
      M14.5 37c0-2 3-3 8-3s8 1 8 3v1H14.5v-1z`,
};

const VIEWBOX = "0 0 45 45";

function pieceFillColors(isWhitePiece) {
  return isWhitePiece
    ? { fill: "#ffffff", stroke: "#1a1a1a" }
    : { fill: "#3a3a3a", stroke: "#000000" };
}

function getPieceSVG(pieceLetter) {
  if (!pieceLetter) return "";
  const type = pieceLetter.toLowerCase();
  const pathData = PIECE_PATHS[type];
  if (!pathData) return "";
  const isWhitePiece = pieceLetter === pieceLetter.toUpperCase();
  const { fill, stroke } = pieceFillColors(isWhitePiece);

  return `<svg viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
    <g fill="${fill}" stroke="${stroke}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
      <path d="${pathData}" />
    </g>
  </svg>`;
}

if (typeof module === "object" && module.exports) {
  module.exports = { getPieceSVG };
}
