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

function onBoardClick(e) {
  if (busy || gameOver || ignoreNextClick) {
    ignoreNextClick = false;
    return;
  }

  // Находим ячейку под курсором
  const cell = e.target.closest(".cell");
  if (!cell) return; // Клик попал в зазор или вне ячейки

  const r = +cell.dataset.row;
  const c = +cell.dataset.col;

  if (!selected) {
    selected = { r, c };
    cell.classList.add("selected");
    return;
  }

  const prev = getCell(selected.r, selected.c);
  prev.classList.remove("selected");

  // Проверяем, что клетки соседние
  const dr = Math.abs(selected.r - r);
  const dc = Math.abs(selected.c - c);
  if (dr + dc === 1) {
    trySwap(selected.r, selected.c, r, c);
  } else if (selected.r === r && selected.c === c) {
    // Клик по той же — снять выделение
  } else {
    // Выбрать новую клетку
    selected = { r, c };
    cell.classList.add("selected");
    return;
  }
  selected = null;
}

// Переменные для отслеживания состояния свайпа
let touchStartX = 0;
let touchStartY = 0;
let touchStartR = -1;
let touchStartC = -1;
let isSwiping = false;
let ignoreNextClick = false; // Флаг, чтобы предотвратить двойное срабатывание (свайп + клик)

function onTouchStart(e) {
  if (busy || gameOver) return;

  const touch = e.touches[0];

  // Находим элемент под пальцем и поднимаемся до .cell
  const target = document.elementFromPoint(touch.clientX, touch.clientY);
  const cell = target ? target.closest(".cell") : null;

  if (!cell) {
    // Если палец попал в зазор или вне ячейки, сбрасываем состояние
    touchStartR = -1;
    return;
  }

  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  touchStartR = +cell.dataset.row;
  touchStartC = +cell.dataset.col;
  isSwiping = false;

  cell.classList.add("selected");
}

function onTouchMove(e) {
  if (touchStartR === -1) return;
  const touch = e.touches[0];
  const deltaX = touch.clientX - touchStartX;
  const deltaY = touch.clientY - touchStartY;

  // Если палец сдвинулся больше чем на 10px, считаем это началом свайпа
  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 10) {
    isSwiping = true;
    // Предотвращаем прокрутку страницы, если свайп происходит внутри поля
    e.preventDefault();
  }
}

function onTouchEnd(e) {
  if (busy || gameOver || touchStartR === -1) return;

  const startCell = getCell(touchStartR, touchStartC);
  if (startCell) {
    startCell.classList.remove("selected");
  }

  if (isSwiping) {
    // Блокируем последующий клик, чтобы не сработала логика выделения
    ignoreNextClick = true;
    setTimeout(() => {
      ignoreNextClick = false;
    }, 500);

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const threshold = 20; // Минимальная длина свайпа в пикселях для совершения хода

    if (Math.max(absX, absY) >= threshold) {
      let targetR = touchStartR;
      let targetC = touchStartC;

      // Определяем приоритетное направление свайпа
      if (absX > absY) {
        if (deltaX > 0)
          targetC++; // Свайп вправо
        else targetC--; // Свайп влево
      } else {
        if (deltaY > 0)
          targetR++; // Свайп вниз
        else targetR--; // Свайп вверх
      }

      // Проверяем, что целевая клетка находится в пределах поля
      if (targetR >= 0 && targetR < SIZE && targetC >= 0 && targetC < SIZE) {
        trySwap(touchStartR, touchStartC, targetR, targetC);
      }
    }
  }

  // Сбрасываем состояние
  touchStartR = -1;
  isSwiping = false;
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

boardEl.addEventListener("click", onBoardClick);
boardEl.addEventListener("touchstart", onTouchStart, { passive: false });
boardEl.addEventListener("touchmove", onTouchMove, { passive: false });
boardEl.addEventListener("touchend", onTouchEnd);

restartBtn.addEventListener("click", init);
gameoverRestartBtn.addEventListener("click", init);

init();
