"use strict";

const DIRS = ["n", "e", "s", "w"];
const DELTA = {
  n: [-1, 0],
  e: [0, 1],
  s: [1, 0],
  w: [0, -1]
};
const OPPOSITE = { n: "s", e: "w", s: "n", w: "e" };
const BASE_SHAPES = {
  line: ["n", "s"],
  curve: ["n", "e"],
  tee: ["n", "e", "s"],
  cross: ["n", "e", "s"]
};
BASE_SHAPES.cross = ["n", "e", "s", "w"];

const SETTINGS = {
  easy: { size: 5, targets: 1, label: "Facile" },
  medium: { size: 7, targets: 2, label: "Medio" },
  hard: { size: 9, targets: 3, label: "Difficile" }
};

class Tile {
  constructor(row, col, type, solutionRotation, role = "wire") {
    this.row = row;
    this.col = col;
    this.type = type;
    this.role = role;
    this.solutionRotation = solutionRotation;
    this.rotation = solutionRotation;
    this.powered = false;
  }

  get baseConnections() {
    return BASE_SHAPES[this.type];
  }

  get connections() {
    return rotateDirections(this.baseConnections, this.rotation);
  }

  get solutionConnections() {
    return rotateDirections(this.baseConnections, this.solutionRotation);
  }

  rotate() {
    if (this.type === "cross") return false;
    this.rotation = (this.rotation + 1) % 4;
    return true;
  }

  isCorrect() {
    return this.type === "cross" || this.rotation === this.solutionRotation;
  }
}

class LevelGenerator {
  generate(difficulty) {
    const config = SETTINGS[difficulty];
    const size = config.size;
    const required = Array.from({ length: size }, () => Array.from({ length: size }, () => new Set()));
    const source = { row: Math.floor(size / 2), col: 0 };
    const targets = this.pickTargets(size, config.targets);

    targets.forEach(target => this.carvePath(source, target, required, size));
    this.addBranches(required, size, Math.floor(size * size * 0.34));

    const tiles = required.map((row, r) => row.map((connections, c) => {
      if (connections.size === 0) this.addFillerConnections(connections, r, c, size);
      const role = r === source.row && c === source.col
        ? "source"
        : targets.some(target => target.row === r && target.col === c) ? "target" : "wire";
      const { type, rotation } = shapeFromConnections([...connections]);
      const tile = new Tile(r, c, type, rotation, role);
      tile.rotation = type === "cross" ? rotation : Math.floor(Math.random() * 4);
      return tile;
    }));

    return { tiles, size, source, targets, difficulty };
  }

  pickTargets(size, count) {
    const rows = shuffle([...Array(size).keys()]);
    return rows.slice(0, count).map((row, index) => ({
      row,
      col: size - 1 - (index % 2)
    }));
  }

  carvePath(start, end, required, size) {
    let row = start.row;
    let col = start.col;
    const verticalFirst = Math.random() > 0.5;
    const moveVertical = () => {
      while (row !== end.row) {
        const dir = row < end.row ? "s" : "n";
        this.connect(required, row, col, dir);
        row += DELTA[dir][0];
      }
    };
    const moveHorizontal = () => {
      while (col !== end.col) {
        const dir = col < end.col ? "e" : "w";
        this.connect(required, row, col, dir);
        col += DELTA[dir][1];
      }
    };

    if (verticalFirst) {
      moveVertical();
      moveHorizontal();
    } else {
      moveHorizontal();
      moveVertical();
    }

    for (let i = 0; i < Math.floor(size / 2); i++) {
      const dir = DIRS[Math.floor(Math.random() * DIRS.length)];
      const nr = clamp(row + DELTA[dir][0], 0, size - 1);
      const nc = clamp(col + DELTA[dir][1], 0, size - 1);
      if (nr !== row || nc !== col) {
        this.connect(required, row, col, dir);
        row = nr;
        col = nc;
      }
    }
  }

  addBranches(required, size, attempts) {
    for (let i = 0; i < attempts; i++) {
      const row = Math.floor(Math.random() * size);
      const col = Math.floor(Math.random() * size);
      const dir = DIRS[Math.floor(Math.random() * DIRS.length)];
      const nr = row + DELTA[dir][0];
      const nc = col + DELTA[dir][1];
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      if (required[row][col].size < 4 && required[nr][nc].size < 4) {
        this.connect(required, row, col, dir);
      }
    }
  }

  addFillerConnections(connections, row, col, size) {
    const possible = DIRS.filter(dir => {
      const nr = row + DELTA[dir][0];
      const nc = col + DELTA[dir][1];
      return nr >= 0 && nr < size && nc >= 0 && nc < size;
    });
    const first = possible[Math.floor(Math.random() * possible.length)];
    connections.add(first);
    if (Math.random() > 0.42) {
      const second = possible.find(dir => dir !== first) || first;
      connections.add(second);
    }
  }

  connect(required, row, col, dir) {
    const nr = row + DELTA[dir][0];
    const nc = col + DELTA[dir][1];
    required[row][col].add(dir);
    required[nr][nc].add(OPPOSITE[dir]);
  }
}

class EnergySystem {
  update(level) {
    level.tiles.flat().forEach(tile => tile.powered = false);
    const start = level.tiles[level.source.row][level.source.col];
    const queue = [start];
    start.powered = true;

    while (queue.length) {
      const tile = queue.shift();
      tile.connections.forEach(dir => {
        const nr = tile.row + DELTA[dir][0];
        const nc = tile.col + DELTA[dir][1];
        if (!level.tiles[nr] || !level.tiles[nr][nc]) return;
        const next = level.tiles[nr][nc];
        if (next.powered || !next.connections.includes(OPPOSITE[dir])) return;
        next.powered = true;
        queue.push(next);
      });
    }

    return level.targets.every(target => level.tiles[target.row][target.col].powered);
  }
}

class SoundEngine {
  constructor() {
    this.context = null;
  }

  tone(frequency, duration, type = "sine", gain = 0.05) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context ||= new AudioContext();
    const osc = this.context.createOscillator();
    const volume = this.context.createGain();
    osc.frequency.value = frequency;
    osc.type = type;
    volume.gain.value = gain;
    osc.connect(volume);
    volume.connect(this.context.destination);
    osc.start();
    volume.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    osc.stop(this.context.currentTime + duration);
  }

  click() {
    this.tone(420, 0.08, "square", 0.035);
  }

  victory() {
    [523, 659, 784, 1046].forEach((note, index) => {
      setTimeout(() => this.tone(note, 0.18, "triangle", 0.055), index * 90);
    });
  }
}

class StorageManager {
  constructor() {
    this.key = "circuitMindState";
  }

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.key)) || this.defaults();
    } catch {
      return this.defaults();
    }
  }

  save(state) {
    localStorage.setItem(this.key, JSON.stringify(state));
  }

  defaults() {
    return { bestScore: 0, lastLevel: "easy", leaderboard: [] };
  }
}

class Game {
  constructor() {
    this.generator = new LevelGenerator();
    this.energy = new EnergySystem();
    this.sound = new SoundEngine();
    this.storage = new StorageManager();
    this.saved = this.storage.load();
    this.difficulty = this.saved.lastLevel || "easy";
    this.mode = "classic";
    this.moves = 0;
    this.elapsed = 0;
    this.hints = 3;
    this.timer = null;
    this.level = null;
    this.finished = false;
    this.bindElements();
    this.bindEvents();
    this.start();
  }

  bindElements() {
    this.board = document.querySelector("#board");
    this.timeLabel = document.querySelector("#timeLabel");
    this.movesLabel = document.querySelector("#movesLabel");
    this.scoreLabel = document.querySelector("#scoreLabel");
    this.bestScoreLabel = document.querySelector("#bestScoreLabel");
    this.lastLevelLabel = document.querySelector("#lastLevelLabel");
    this.hintsLabel = document.querySelector("#hintsLabel");
    this.leaderboardList = document.querySelector("#leaderboardList");
    this.winDialog = document.querySelector("#winDialog");
    this.winDetails = document.querySelector("#winDetails");
    this.instructionsDialog = document.querySelector("#instructionsDialog");
  }

  bindEvents() {
    document.querySelector("#newGameBtn").addEventListener("click", () => this.start());
    document.querySelector("#hintBtn").addEventListener("click", () => this.showHint());
    document.querySelector("#instructionsBtn").addEventListener("click", () => this.instructionsDialog.showModal());
    document.querySelector("#nextLevelBtn").addEventListener("click", event => {
      event.preventDefault();
      this.winDialog.close();
      this.advanceLevel();
    });

    document.querySelectorAll("[data-difficulty]").forEach(button => {
      button.addEventListener("click", () => {
        this.difficulty = button.dataset.difficulty;
        setActive("[data-difficulty]", button);
        this.start();
      });
      if (button.dataset.difficulty === this.difficulty) setActive("[data-difficulty]", button);
    });

    document.querySelectorAll("[data-mode]").forEach(button => {
      button.addEventListener("click", () => {
        this.mode = button.dataset.mode;
        setActive("[data-mode]", button);
        this.start();
      });
    });
  }

  start() {
    clearInterval(this.timer);
    this.level = this.generator.generate(this.difficulty);
    this.moves = 0;
    this.elapsed = this.mode === "challenge" ? 180 : 0;
    this.hints = 3;
    this.finished = false;
    this.saved.lastLevel = this.difficulty;
    this.storage.save(this.saved);
    this.render();
    this.updateEnergy();
    this.updateHud();
    this.timer = setInterval(() => this.tick(), 1000);
  }

  tick() {
    if (this.finished) return;
    this.elapsed += this.mode === "challenge" ? -1 : 1;
    if (this.mode === "challenge" && this.elapsed <= 0) {
      this.elapsed = 0;
      this.start();
      return;
    }
    this.updateHud();
  }

  render() {
    this.board.innerHTML = "";
    this.board.style.setProperty("--grid-size", this.level.size);
    this.level.tiles.flat().forEach(tile => {
      const button = document.createElement("button");
      button.className = `tile ${tile.role}`;
      button.type = "button";
      button.ariaLabel = `${tile.role === "source" ? "Sorgente" : tile.role === "target" ? "Obiettivo" : "Tessera"} riga ${tile.row + 1}, colonna ${tile.col + 1}`;
      button.dataset.row = tile.row;
      button.dataset.col = tile.col;
      button.addEventListener("click", () => this.rotateTile(tile, button));
      button.appendChild(this.createPiece(tile));
      this.board.appendChild(button);
    });
    this.renderLeaderboard();
  }

  createPiece(tile) {
    const piece = document.createElement("span");
    piece.className = "piece";
    piece.style.setProperty("--rotation", tile.rotation);
    tile.baseConnections.forEach(dir => {
      const connector = document.createElement("span");
      connector.className = `connector ${dir}`;
      piece.appendChild(connector);
    });
    const core = document.createElement("span");
    core.className = "core";
    piece.appendChild(core);
    return piece;
  }

  rotateTile(tile, element) {
    if (this.finished || !tile.rotate()) return;
    this.moves += 1;
    this.sound.click();
    const piece = element.querySelector(".piece");
    element.classList.add("rotating");
    piece.style.setProperty("--rotation", tile.rotation);
    setTimeout(() => element.classList.remove("rotating"), 310);
    this.updateEnergy();
    this.updateHud();
    if (this.energy.update(this.level)) this.win();
  }

  updateEnergy() {
    const won = this.energy.update(this.level);
    this.level.tiles.flat().forEach(tile => {
      const element = this.tileElement(tile);
      element.classList.toggle("powered", tile.powered);
    });
    return won;
  }

  updateHud() {
    this.timeLabel.textContent = formatTime(this.elapsed);
    this.movesLabel.textContent = this.moves;
    this.scoreLabel.textContent = this.score();
    this.bestScoreLabel.textContent = this.saved.bestScore;
    this.lastLevelLabel.textContent = SETTINGS[this.saved.lastLevel]?.label || "Facile";
    this.hintsLabel.textContent = this.hints;
  }

  score() {
    const seconds = this.mode === "challenge" ? 180 - this.elapsed : this.elapsed;
    return Math.max(0, 1000 - this.moves * 5 - seconds);
  }

  showHint() {
    if (this.hints <= 0 || this.finished) return;
    const candidates = this.level.tiles.flat().filter(tile => tile.type !== "cross" && !tile.isCorrect());
    if (!candidates.length) return;
    this.hints -= 1;
    const tile = candidates[Math.floor(Math.random() * candidates.length)];
    const element = this.tileElement(tile);
    element.classList.remove("hint");
    void element.offsetWidth;
    element.classList.add("hint");
    setTimeout(() => element.classList.remove("hint"), 2100);
    this.updateHud();
  }

  win() {
    if (this.finished) return;
    this.finished = true;
    clearInterval(this.timer);
    const score = this.score();
    this.saved.bestScore = Math.max(this.saved.bestScore, score);
    this.saved.leaderboard.unshift({
      score,
      moves: this.moves,
      time: formatTime(this.mode === "challenge" ? 180 - this.elapsed : this.elapsed),
      difficulty: SETTINGS[this.difficulty].label,
      mode: this.mode
    });
    this.saved.leaderboard = this.saved.leaderboard
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    this.storage.save(this.saved);
    this.sound.victory();
    this.winDetails.textContent = `Tempo impiegato: ${formatTime(this.mode === "challenge" ? 180 - this.elapsed : this.elapsed)}. Mosse: ${this.moves}. Punteggio: ${score}.`;
    this.updateHud();
    this.renderLeaderboard();
    this.winDialog.showModal();
  }

  advanceLevel() {
    if (this.mode === "infinite") {
      this.start();
      return;
    }
    const order = ["easy", "medium", "hard"];
    const index = order.indexOf(this.difficulty);
    this.difficulty = order[Math.min(index + 1, order.length - 1)];
    const active = document.querySelector(`[data-difficulty="${this.difficulty}"]`);
    if (active) setActive("[data-difficulty]", active);
    this.start();
  }

  renderLeaderboard() {
    this.leaderboardList.innerHTML = "";
    const rows = this.saved.leaderboard.length
      ? this.saved.leaderboard
      : [{ score: 0, moves: 0, time: "00:00", difficulty: "-", mode: "-" }];
    rows.forEach(row => {
      const item = document.createElement("li");
      item.textContent = `${row.score} punti - ${row.difficulty} - ${row.time} - ${row.moves} mosse`;
      this.leaderboardList.appendChild(item);
    });
  }

  tileElement(tile) {
    return this.board.querySelector(`[data-row="${tile.row}"][data-col="${tile.col}"]`);
  }
}

function rotateDirections(connections, rotation) {
  return connections.map(dir => DIRS[(DIRS.indexOf(dir) + rotation) % 4]);
}

function shapeFromConnections(connections) {
  const sorted = sortDirs(connections);
  const variants = Object.entries(BASE_SHAPES).flatMap(([type, base]) =>
    [0, 1, 2, 3].map(rotation => ({ type, rotation, dirs: sortDirs(rotateDirections(base, rotation)) }))
  );
  const exact = variants.find(variant => sameDirs(variant.dirs, sorted));
  if (exact) return { type: exact.type, rotation: exact.rotation };

  const length = connections.length;
  if (length <= 1) return { type: "line", rotation: connections[0] === "e" || connections[0] === "w" ? 1 : 0 };
  if (length === 2) return { type: areOpposite(connections[0], connections[1]) ? "line" : "curve", rotation: 0 };
  if (length === 3) return { type: "tee", rotation: 0 };
  return { type: "cross", rotation: 0 };
}

function sortDirs(dirs) {
  return [...dirs].sort((a, b) => DIRS.indexOf(a) - DIRS.indexOf(b));
}

function sameDirs(a, b) {
  return a.length === b.length && a.every((dir, index) => dir === b[index]);
}

function areOpposite(a, b) {
  return OPPOSITE[a] === b;
}

function shuffle(items) {
  return items.sort(() => Math.random() - 0.5);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatTime(totalSeconds) {
  const value = Math.max(0, totalSeconds);
  const minutes = String(Math.floor(value / 60)).padStart(2, "0");
  const seconds = String(value % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function setActive(selector, activeButton) {
  document.querySelectorAll(selector).forEach(button => button.classList.remove("active"));
  activeButton.classList.add("active");
}

document.addEventListener("DOMContentLoaded", () => new Game());
