import "./style.css";

const SIZE = 8;
const GEMS = 6;
const MAX_TIME = 45;
const TIME_PER_POINT = 0.1;
const MAX_BONUS_PER_MOVE = 5;

const boardEl = document.getElementById("board");
const scoreEl = document.getElementById("score");
const restartBtn = document.getElementById("restart");
const timerFillEl = document.getElementById("timer-fill");
const gameoverEl = document.getElementById("gameover");
const gameoverReasonEl = document.getElementById("gameover-reason");
const finalScoreEl = document.getElementById("final-score");
const gameoverRestartBtn = document.getElementById("gameover-restart");

let board = [];
let selected = null;
let score = 0;
let busy = false;
let gameOver = false;
let timeLeftMs = MAX_TIME * 1000;
let lastTick = 0;
let timerRAF = null;

function init() {
  board = [];
  score = 0;
  selected = null;
  busy = false;
  gameOver = false;
  scoreEl.textContent = score;

  gameoverEl.classList.add("hidden");

  // Запускаем таймер
  timeLeftMs = MAX_TIME * 1000;
  lastTick = performance.now();
  startTimerLoop();

  // Генерируем поле без начальных совпадений
  for (let r = 0; r < SIZE; r++) {
    const row = [];
    for (let c = 0; c < SIZE; c++) {
      let gem;
      do {
        gem = Math.floor(Math.random() * GEMS);
      } while (
        (c >= 2 && row[c - 1] === gem && row[c - 2] === gem) ||
        (r >= 2 && board[r - 1][c] === gem && board[r - 2][c] === gem)
      );
      row.push(gem);
    }
    board.push(row);
  }

  render();
}

function render() {
  boardEl.innerHTML = "";
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = r;
      cell.dataset.col = c;

      const gem = document.createElement("div");
      gem.className = `gem gem-${board[r][c]}`;
      cell.appendChild(gem);
      boardEl.appendChild(cell);
    }
  }
}

function getCell(r, c) {
  return boardEl.querySelector(`[data-row="${r}"][data-col="${c}"]`);
}

let pointerStartX = 0;
let pointerStartY = 0;
let pointerStartR = -1;
let pointerStartC = -1;
let isPointerMoving = false;

function getCellFromPoint(x, y) {
  const target = document.elementFromPoint(x, y);
  return target ? target.closest(".cell") : null;
}

function onPointerDown(e) {
  if (!e.isPrimary || busy || gameOver) return;

  boardEl.setPointerCapture(e.pointerId);

  pointerStartX = e.clientX;
  pointerStartY = e.clientY;

  const cell = getCellFromPoint(e.clientX, e.clientY);

  if (!cell) {
    pointerStartR = -1;
    pointerStartC = -1;
    isPointerMoving = false;
    return;
  }

  pointerStartR = +cell.dataset.row;
  pointerStartC = +cell.dataset.col;

  isPointerMoving = false;

  cell.classList.add("selected");
}

function onPointerMove(e) {
  if (pointerStartR === -1) {
    const cell = getCellFromPoint(e.clientX, e.clientY);

    if (!cell) return;

    pointerStartR = +cell.dataset.row;
    pointerStartC = +cell.dataset.col;

    cell.classList.add("selected");
  }

  const dx = e.clientX - pointerStartX;
  const dy = e.clientY - pointerStartY;

  if (Math.max(Math.abs(dx), Math.abs(dy)) > 10) {
    isPointerMoving = true;
    e.preventDefault();
  }
}

function onPointerUp(e) {
  const startCell = getCell(pointerStartR, pointerStartC);

  if (startCell) {
    startCell.classList.remove("selected");
  }

  if (busy || gameOver || pointerStartR === -1) {
    resetPointer();
    return;
  }

  const dx = e.clientX - pointerStartX;
  const dy = e.clientY - pointerStartY;

  if (isPointerMoving) {
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    const threshold = 20;

    if (Math.max(absX, absY) >= threshold) {
      let targetR = pointerStartR;
      let targetC = pointerStartC;

      if (absX > absY) {
        targetC += dx > 0 ? 1 : -1;
      } else {
        targetR += dy > 0 ? 1 : -1;
      }

      if (targetR >= 0 && targetR < SIZE && targetC >= 0 && targetC < SIZE) {
        trySwap(pointerStartR, pointerStartC, targetR, targetC);
      }
    }
  } else {
    handleCellClick(pointerStartR, pointerStartC);
  }

  resetPointer();
}

function handleCellClick(r, c) {
  const cell = getCell(r, c);
  if (!cell) return;

  if (!selected) {
    selected = { r, c };
    cell.classList.add("selected");
    return;
  }

  const prev = getCell(selected.r, selected.c);

  if (prev) {
    prev.classList.remove("selected");
  }

  // Проверяем, что клетки соседние
  const dr = Math.abs(selected.r - r);
  const dc = Math.abs(selected.c - c);

  if (dr + dc === 1) {
    trySwap(selected.r, selected.c, r, c);

    selected = null;
  } else if (selected.r === r && selected.c === c) {
    // Клик по той же — снять выделение
    selected = null;
  } else {
    // Выбрать новую клетку
    selected = { r, c };
    cell.classList.add("selected");
  }
}

function resetPointer() {
  pointerStartR = -1;
  pointerStartC = -1;
  isPointerMoving = false;
}

// Обмен
async function trySwap(r1, c1, r2, c2) {
  busy = true;
  const scoreBefore = score;

  swap(r1, c1, r2, c2);
  render();

  const matches = findMatches();
  if (matches.size === 0) {
    // Возврат — время не пополняется
    await sleep(250);
    swap(r1, c1, r2, c2);
    render();
  } else {
    await resolveMatches();
  }
  busy = false;

  if (!gameOver) {
    // Пополняем время в зависимости от заработанных очков
    const earned = score - scoreBefore;
    if (earned > 0) {
      const bonusMs = Math.min(
        earned * TIME_PER_POINT * 1000,
        MAX_BONUS_PER_MOVE * 1000,
      );
      addTime(bonusMs);
    }

    // Проверяем, есть ли ещё возможные ходы
    if (!hasPossibleMoves()) {
      endGame("Больше нет возможных ходов!");
    }
  }
}

function swap(r1, c1, r2, c2) {
  const tmp = board[r1][c1];
  board[r1][c1] = board[r2][c2];
  board[r2][c2] = tmp;
}

// Поиск совпадений
function findMatches() {
  const matched = new Set();

  // Горизонтальные
  for (let r = 0; r < SIZE; r++) {
    let count = 1;
    for (let c = 1; c < SIZE; c++) {
      if (board[r][c] === board[r][c - 1] && board[r][c] !== -1) {
        count++;
      } else {
        if (count >= 3) {
          for (let k = 1; k <= count; k++) matched.add(`${r},${c - k}`);
        }
        count = 1;
      }
    }
    if (count >= 3) {
      for (let k = 1; k <= count; k++) matched.add(`${r},${SIZE - k}`);
    }
  }

  // Вертикальные
  for (let c = 0; c < SIZE; c++) {
    let count = 1;
    for (let r = 1; r < SIZE; r++) {
      if (board[r][c] === board[r - 1][c] && board[r][c] !== -1) {
        count++;
      } else {
        if (count >= 3) {
          for (let k = 1; k <= count; k++) matched.add(`${r - k},${c}`);
        }
        count = 1;
      }
    }
    if (count >= 3) {
      for (let k = 1; k <= count; k++) matched.add(`${SIZE - k},${c}`);
    }
  }

  return matched;
}

// Проверка: есть ли хоть один возможный ход
function hasPossibleMoves() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      // Свап вправо
      if (c < SIZE - 1) {
        swap(r, c, r, c + 1);
        const has = findMatches().size > 0;
        swap(r, c, r, c + 1);
        if (has) return true;
      }
      // Свап вниз
      if (r < SIZE - 1) {
        swap(r, c, r + 1, c);
        const has = findMatches().size > 0;
        swap(r, c, r + 1, c);
        if (has) return true;
      }
    }
  }
  return false;
}

// Разрешение совпадений
async function resolveMatches() {
  let matches = findMatches();
  while (matches.size > 0) {
    // Анимация исчезновения
    for (const key of matches) {
      const [r, c] = key.split(",").map(Number);
      const cell = getCell(r, c);
      if (cell) cell.classList.add("matched");
    }
    await sleep(400);

    // Начисляем очки
    score += matches.size * 10;
    scoreEl.textContent = score;

    // Удаляем с доски
    for (const key of matches) {
      const [r, c] = key.split(",").map(Number);
      board[r][c] = -1;
    }

    // Применяем гравитацию и запоминаем, какие клетки упали
    const fallenCells = applyGravityWithTracking();

    // Заполняем пустые и запоминаем новые клетки
    const newCells = fillEmptyWithTracking();

    render();

    // Добавляем анимацию падения для упавших клеток
    for (const pos of fallenCells) {
      const cell = getCell(pos.r, pos.c);
      if (cell) cell.classList.add("falling");
    }

    // Добавляем анимацию появления для новых клеток
    for (const pos of newCells) {
      const cell = getCell(pos.r, pos.c);
      if (cell) {
        cell.classList.add("falling");
        // Небольшую задержка для новых клеток, чтобы они падали чуть позже
        cell.style.animationDelay = "0.1s";
      }
    }

    await sleep(350);

    matches = findMatches();
  }
}

function applyGravityWithTracking() {
  const fallenCells = [];

  for (let c = 0; c < SIZE; c++) {
    let writeRow = SIZE - 1;
    for (let r = SIZE - 1; r >= 0; r--) {
      if (board[r][c] !== -1) {
        // Если клетка перемещается вниз - запоминаем новую позицию
        if (writeRow !== r) {
          board[writeRow][c] = board[r][c];
          board[r][c] = -1;
          fallenCells.push({ r: writeRow, c });
        }
        writeRow--;
      }
    }
  }

  return fallenCells;
}

function fillEmptyWithTracking() {
  const newCells = [];

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === -1) {
        board[r][c] = Math.floor(Math.random() * GEMS);
        newCells.push({ r, c });
      }
    }
  }

  return newCells;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function startTimerLoop() {
  if (timerRAF) cancelAnimationFrame(timerRAF);

  function tick(now) {
    if (gameOver) return;

    const delta = now - lastTick;
    lastTick = now;
    timeLeftMs -= delta;

    if (timeLeftMs <= 0) {
      timeLeftMs = 0;
      updateTimerBar();
      endGame("Время истекло");
      return;
    }

    updateTimerBar();
    timerRAF = requestAnimationFrame(tick);
  }

  timerRAF = requestAnimationFrame(tick);
}

function updateTimerBar() {
  const maxMs = MAX_TIME * 1000;
  const percent = (timeLeftMs / maxMs) * 100;
  timerFillEl.style.width = percent + "%";

  // Меняем цвет при малом времени
  if (percent < 25) {
    timerFillEl.classList.add("urgent");
  } else {
    timerFillEl.classList.remove("urgent");
  }
}

function addTime(ms) {
  timeLeftMs += ms;
  const maxMs = MAX_TIME * 1000;
  if (timeLeftMs > maxMs) timeLeftMs = maxMs;
}

function endGame(reason) {
  gameOver = true;
  busy = true;
  if (timerRAF) {
    cancelAnimationFrame(timerRAF);
    timerRAF = null;
  }
  gameoverReasonEl.textContent = reason;
  finalScoreEl.textContent = score;
  gameoverEl.classList.remove("hidden");
}

boardEl.addEventListener("pointerdown", onPointerDown);
boardEl.addEventListener("pointermove", onPointerMove, { passive: false });
boardEl.addEventListener("pointerup", onPointerUp);
boardEl.addEventListener("pointercancel", resetPointer);
boardEl.addEventListener(
  "touchmove",
  function (e) {
    e.stopPropagation();
    e.preventDefault();
  },
  { passive: false },
);

restartBtn.addEventListener("click", init);
gameoverRestartBtn.addEventListener("click", init);

init();
