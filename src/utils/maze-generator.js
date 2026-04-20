const sharp = require("sharp");

const DIFFICULTY = {
  "0-3": { cols: 10, rows: 10, entries: 1, extraPassages: 0 },
  "3-6": { cols: 15, rows: 15, entries: 2, extraPassages: 4 },
  "6-9": { cols: 18, rows: 18, entries: 2, extraPassages: 8 },
};

function generateMaze({ ageGroup = "3-6", heroName = "Kahraman", mazeGoal = "hedefe" } = {}) {
  const diff = DIFFICULTY[ageGroup] || DIFFICULTY["3-6"];
  const { cols: COLS, rows: ROWS, entries, extraPassages } = diff;

  const CELL = Math.floor(1800 / COLS);
  const WALL = Math.max(3, Math.round(CELL * 0.1));
  const MARGIN_X = Math.floor((2480 - COLS * CELL) / 2);
  const MARGIN_TOP = 500;
  const MAZE_H = ROWS * CELL;
  const W = 2480;
  const H = 3508;

  const grid = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ top: true, right: true, bottom: true, left: true, visited: false }))
  );

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const stack = [];
  function carve(r, c) {
    stack.push([r, c]);
    while (stack.length > 0) {
      const [cr, cc] = stack[stack.length - 1];
      grid[cr][cc].visited = true;
      const dirs = shuffle([
        { dr: -1, dc: 0, wall: "top", opposite: "bottom" },
        { dr: 1, dc: 0, wall: "bottom", opposite: "top" },
        { dr: 0, dc: -1, wall: "left", opposite: "right" },
        { dr: 0, dc: 1, wall: "right", opposite: "left" },
      ]);
      let found = false;
      for (const d of dirs) {
        const nr = cr + d.dr, nc = cc + d.dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !grid[nr][nc].visited) {
          grid[cr][cc][d.wall] = false;
          grid[nr][nc][d.opposite] = false;
          stack.push([nr, nc]);
          found = true;
          break;
        }
      }
      if (!found) stack.pop();
    }
  }

  carve(0, 0);

  let removed = 0;
  while (removed < extraPassages) {
    const r = Math.floor(Math.random() * (ROWS - 1));
    const c = Math.floor(Math.random() * (COLS - 1));
    const dir = Math.random() < 0.5 ? "right" : "bottom";
    if (dir === "right" && grid[r][c].right) {
      grid[r][c].right = false;
      grid[r][c + 1].left = false;
      removed++;
    } else if (dir === "bottom" && grid[r][c].bottom) {
      grid[r][c].bottom = false;
      grid[r + 1][c].top = false;
      removed++;
    }
  }

  const entryA = { r: 0, c: Math.floor(COLS * 0.2) };
  grid[entryA.r][entryA.c].top = false;

  let entryB = null;
  if (entries >= 2) {
    entryB = { r: 0, c: Math.floor(COLS * 0.8) };
    grid[entryB.r][entryB.c].top = false;
  }

  const exit = { r: ROWS - 1, c: Math.floor(COLS / 2) };
  grid[exit.r][exit.c].bottom = false;

  function solve(sr, sc, er, ec) {
    const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    const parent = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    const queue = [[sr, sc]];
    visited[sr][sc] = true;
    while (queue.length > 0) {
      const [r, c] = queue.shift();
      if (r === er && c === ec) {
        const path = [];
        let cur = [r, c];
        while (cur) { path.unshift(cur); cur = parent[cur[0]][cur[1]]; }
        return path;
      }
      for (const m of [
        { dr: -1, dc: 0, wall: "top" }, { dr: 1, dc: 0, wall: "bottom" },
        { dr: 0, dc: -1, wall: "left" }, { dr: 0, dc: 1, wall: "right" },
      ]) {
        const nr = r + m.dr, nc = c + m.dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !visited[nr][nc] && !grid[r][c][m.wall]) {
          visited[nr][nc] = true;
          parent[nr][nc] = [r, c];
          queue.push([nr, nc]);
        }
      }
    }
    return null;
  }

  const pathA = solve(entryA.r, entryA.c, exit.r, exit.c);
  const pathB = entryB ? solve(entryB.r, entryB.c, exit.r, exit.c) : null;

  if (!pathA || (entryB && !pathB)) {
    throw new Error("Maze generation failed — unsolvable maze produced");
  }

  const titleText = `${heroName}, Hedefe Giden Yolu Bul!`;
  const rewardText = "Sen Başardın!";

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="white"/>
<style>
  .title { font-family: 'Arial', sans-serif; font-size: 80px; font-weight: bold; fill: none; stroke: #1a1a1a; stroke-width: 2.5; text-anchor: middle; }
  .subtitle { font-family: 'Arial', sans-serif; font-size: 48px; fill: none; stroke: #1a1a1a; stroke-width: 1.5; text-anchor: middle; }
  .label { font-family: 'Arial', sans-serif; font-size: 42px; font-weight: bold; text-anchor: middle; fill: none; stroke: #1a1a1a; stroke-width: 2; }
  .wall { stroke: #1a1a1a; stroke-width: ${WALL}; stroke-linecap: round; }
  .reward { font-family: 'Arial', sans-serif; font-size: 64px; font-weight: bold; fill: none; stroke: #1a1a1a; stroke-width: 2; text-anchor: middle; }
  .icon { font-size: 60px; text-anchor: middle; }
  .border-line { stroke: #1a1a1a; stroke-width: 4; fill: none; }
  .deco { stroke: #1a1a1a; stroke-width: 2; fill: none; }
</style>
`;

  // Decorative page border
  svg += `<rect x="60" y="60" width="${W - 120}" height="${H - 120}" rx="30" class="border-line"/>\n`;

  // Title area (top 500px)
  svg += `<text x="${W / 2}" y="200" class="title">${escapeXml(titleText)}</text>\n`;

  // Character portrait placeholder (left of title)
  const portraitSize = 280;
  const portraitX = 120;
  const portraitY = 100;
  svg += `<rect x="${portraitX}" y="${portraitY}" width="${portraitSize}" height="${portraitSize}" rx="20" class="deco" stroke-dasharray="8 4"/>\n`;

  // Entry labels
  const axA = MARGIN_X + entryA.c * CELL + CELL / 2;
  svg += `<text x="${axA}" y="${MARGIN_TOP - 60}" class="label">GİRİŞ 1</text>\n`;
  svg += `<text x="${axA}" y="${MARGIN_TOP - 15}" class="icon">↓</text>\n`;

  if (entryB) {
    const axB = MARGIN_X + entryB.c * CELL + CELL / 2;
    svg += `<text x="${axB}" y="${MARGIN_TOP - 60}" class="label">GİRİŞ 2</text>\n`;
    svg += `<text x="${axB}" y="${MARGIN_TOP - 15}" class="icon">↓</text>\n`;
  }

  // Draw maze walls
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = MARGIN_X + c * CELL;
      const y = MARGIN_TOP + r * CELL;
      const cell = grid[r][c];
      if (cell.top) svg += `<line x1="${x}" y1="${y}" x2="${x + CELL}" y2="${y}" class="wall"/>\n`;
      if (cell.right) svg += `<line x1="${x + CELL}" y1="${y}" x2="${x + CELL}" y2="${y + CELL}" class="wall"/>\n`;
      if (cell.bottom) svg += `<line x1="${x}" y1="${y + CELL}" x2="${x + CELL}" y2="${y + CELL}" class="wall"/>\n`;
      if (cell.left) svg += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + CELL}" class="wall"/>\n`;
    }
  }

  // Outer border reinforcement
  svg += `<line x1="${MARGIN_X}" y1="${MARGIN_TOP}" x2="${MARGIN_X}" y2="${MARGIN_TOP + MAZE_H}" class="wall"/>\n`;
  svg += `<line x1="${MARGIN_X + COLS * CELL}" y1="${MARGIN_TOP}" x2="${MARGIN_X + COLS * CELL}" y2="${MARGIN_TOP + MAZE_H}" class="wall"/>\n`;

  // Exit label
  const exX = MARGIN_X + exit.c * CELL + CELL / 2;
  const exY = MARGIN_TOP + MAZE_H;
  svg += `<text x="${exX}" y="${exY + 60}" class="label">FİNİŞ</text>\n`;
  svg += `<text x="${exX}" y="${exY + 110}" class="icon">⭐</text>\n`;

  // Reward stamp area (bottom)
  const rewardY = H - 350;
  svg += `<ellipse cx="${W / 2}" cy="${rewardY}" rx="380" ry="120" class="deco" stroke-dasharray="12 6"/>\n`;
  svg += `<text x="${W / 2}" y="${rewardY + 20}" class="reward">${escapeXml(rewardText)}</text>\n`;

  // Decorative stars in corners
  const starPositions = [[150, 150], [W - 150, 150], [150, H - 150], [W - 150, H - 150]];
  for (const [sx, sy] of starPositions) {
    svg += drawStar(sx, sy, 35, 15, 5);
  }

  // Small decorative stars along top
  for (let i = 0; i < 7; i++) {
    const sx = 300 + i * 280;
    svg += drawStar(sx, 320, 20, 8, 5);
  }

  svg += `</svg>`;

  return {
    svg,
    metadata: {
      ageGroup,
      difficulty: diff,
      heroName,
      mazeGoal,
      pathA: pathA ? pathA.length : 0,
      pathB: pathB ? pathB.length : 0,
      solvable: true,
    },
  };
}

function drawStar(cx, cy, outerR, innerR, points) {
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
  }
  d += "Z";
  return `<path d="${d}" class="deco"/>\n`;
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function generateMazePng({ ageGroup, heroName, mazeGoal, outputPath, characterBuffer }) {
  const { svg, metadata } = generateMaze({ ageGroup, heroName, mazeGoal });
  let mazeImage = sharp(Buffer.from(svg)).resize(2480, 3508).png();

  if (characterBuffer) {
    const mazeBuf = await mazeImage.toBuffer();
    const portraitBuf = await sharp(characterBuffer)
      .resize(260, 260, { fit: "cover" })
      .grayscale()
      .linear(1.8, -120)
      .png()
      .toBuffer();

    await sharp(mazeBuf)
      .composite([{
        input: portraitBuf,
        left: 130,
        top: 110,
        blend: "multiply",
      }])
      .png()
      .toFile(outputPath);
  } else {
    await mazeImage.toFile(outputPath);
  }

  console.log(`  [maze-generator] ${outputPath} (${metadata.pathA}+${metadata.pathB} steps, ${ageGroup}${characterBuffer ? ", +portrait" : ""})`);
  return { outputPath, metadata };
}

module.exports = { generateMaze, generateMazePng };
