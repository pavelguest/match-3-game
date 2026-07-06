const SIZE = 8;
const GEMS = 6;

const boardEl = document.getElementById("board");
const scoreEl = document.getElementById("score");
const restartBtn = document.getElementById("restart");

let board = [];
let selected = null;
let score = 0;
let busy = false; // блокировка во время анимаций

function init() {
  board = [];
  score = 0;
  selected = null;
  busy = false;
  scoreEl.textContent = score;

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

      cell.addEventListener("click", onCellClick);
      boardEl.appendChild(cell);
    }
  }
}

function getCell(r, c) {
  return boardEl.querySelector(`[data-row="${r}"][data-col="${c}"]`);
}

function onCellClick(e) {
  if (busy) return;
  const r = +e.currentTarget.dataset.row;
  const c = +e.currentTarget.dataset.col;

  if (!selected) {
    selected = { r, c };
    e.currentTarget.classList.add("selected");
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
    e.currentTarget.classList.add("selected");
    return;
  }
  selected = null;
}

// Обмен
async function trySwap(r1, c1, r2, c2) {
  busy = true;
  swap(r1, c1, r2, c2);
  render();

  const matches = findMatches();
  if (matches.size === 0) {
    // Возврат
    await sleep(250);
    swap(r1, c1, r2, c2);
    render();
  } else {
    await resolveMatches();
  }
  busy = false;
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

restartBtn.addEventListener("click", init);

init();
