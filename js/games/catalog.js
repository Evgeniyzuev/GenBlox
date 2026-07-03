export const games = {
  classic: {
    id: "classic",
    type: "line",
    title: "Крестики-нолики",
    description: "Классика на двоих · 3×3",
    space: "Спейс 001",
    size: 3,
    winLength: 3,
    players: "2 игрока",
    duration: "2–5 мин",
    tag: "Первый спейс",
    coverClass: "",
  },
  five: {
    id: "five",
    type: "line",
    title: "5 в ряд",
    description: "Большая доска · 10×10",
    space: "Спейс 002",
    size: 10,
    winLength: 5,
    players: "2 игрока",
    duration: "5–15 мин",
    tag: "Большая доска",
    coverClass: "five-cover",
  },
  battleship: {
    id: "battleship",
    type: "battle",
    title: "Морской бой",
    description: "Авторасстановка · поле 8×8",
    space: "Спейс 003",
    size: 8,
    players: "Против бота",
    duration: "5–10 мин",
    tag: "Новый спейс",
    coverClass: "battle-cover",
  },
};

function linePreview(game) {
  const size = game.id === "classic" ? 3 : 5;
  const cells = Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size);
    const column = index % size;
    const mark = row === column ? "×" : column === row + 1 ? "○" : "";
    return `<i>${mark}</i>`;
  }).join("");
  return `<span class="${size === 3 ? "cover-grid" : "five-preview"}" aria-hidden="true">${cells}</span>`;
}

function battlePreview() {
  return `
    <span class="battle-preview" aria-hidden="true">
      <i class="ship ship-a"></i>
      <i class="ship ship-b"></i>
      <i class="battle-shot">×</i>
      <i class="battle-wave"></i>
    </span>
  `;
}

export function renderGameCatalog(container, onOpen) {
  container.replaceChildren();

  Object.values(games).forEach((game) => {
    const article = document.createElement("article");
    article.className = "space-card featured";
    article.innerHTML = `
      <button class="space-cover ${game.coverClass}" type="button" aria-label="Открыть спейс ${game.title}">
        ${game.type === "battle" ? battlePreview() : linePreview(game)}
        <span class="play-badge" aria-hidden="true">▶</span>
        <span class="new-tag ${game.id === "classic" ? "" : "alt-tag"}">${game.tag}</span>
      </button>
      <div class="space-info">
        <div>
          <h3>${game.title}</h3>
          <p>${game.description}</p>
        </div>
        <button class="join-button" type="button">Играть <span>→</span></button>
      </div>
      <footer class="space-meta">
        <span><i class="status-dot"></i> Можно играть</span>
        <span>👥 ${game.players}</span>
        <span>⚡ ${game.duration}</span>
      </footer>
    `;

    article.querySelectorAll(".space-cover, .join-button").forEach((button) => {
      button.addEventListener("click", () => onOpen(game.id));
    });
    container.append(article);
  });
}

export function findWinningLine(board, game) {
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];

  for (let row = 0; row < game.size; row += 1) {
    for (let column = 0; column < game.size; column += 1) {
      const mark = board[row * game.size + column];
      if (!mark) continue;

      for (const [deltaRow, deltaColumn] of directions) {
        const line = [];
        for (let step = 0; step < game.winLength; step += 1) {
          const nextRow = row + deltaRow * step;
          const nextColumn = column + deltaColumn * step;
          if (
            nextRow < 0 ||
            nextRow >= game.size ||
            nextColumn < 0 ||
            nextColumn >= game.size
          ) break;
          const index = nextRow * game.size + nextColumn;
          if (board[index] !== mark) break;
          line.push(index);
        }
        if (line.length === game.winLength) return line;
      }
    }
  }
  return null;
}
