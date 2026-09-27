/**
 * 2048 Shen - 遊戲核心邏輯與互動系統
 * 包含 4x4 核心運算、復原 (Undo) 功能、手勢滑動、明暗主題切換與吉祥物自由拖曳系統
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 主題管理員 (明暗模式切換)
  // ---------------------------------------------------------------------------
  class ThemeManager {
    constructor() {
      this.btnToggle = document.getElementById('btn-theme-toggle');
      this.iconElem = document.getElementById('theme-icon');
      this.textElem = document.getElementById('theme-text');
      this.storageKey = '2048shen_theme';

      // 讀取偏好設定，若無則依系統預設或暗色
      const savedTheme = localStorage.getItem(this.storageKey);
      if (savedTheme) {
        this.currentTheme = savedTheme;
      } else {
        const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
        this.currentTheme = prefersLight ? 'light' : 'dark';
      }

      this.init();
    }

    init() {
      this.applyTheme(this.currentTheme);

      if (this.btnToggle) {
        this.btnToggle.addEventListener('click', () => {
          this.toggleTheme();
        });
      }

      // 監聽系統主題切換 (若使用者未手動固定)
      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
          if (!localStorage.getItem(this.storageKey)) {
            this.applyTheme(e.matches ? 'light' : 'dark');
          }
        });
      }
    }

    toggleTheme() {
      const targetTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
      this.applyTheme(targetTheme);
      localStorage.setItem(this.storageKey, targetTheme);
    }

    applyTheme(theme) {
      this.currentTheme = theme;
      document.body.setAttribute('data-theme', theme);

      if (this.iconElem) {
        if (theme === 'light') {
          this.iconElem.className = 'fa-solid fa-sun';
          if (this.btnToggle) {
            this.btnToggle.title = '切換至深色模式';
            this.btnToggle.setAttribute('aria-label', '切換至深色模式');
          }
        } else {
          this.iconElem.className = 'fa-solid fa-moon';
          if (this.btnToggle) {
            this.btnToggle.title = '切換至淺色模式';
            this.btnToggle.setAttribute('aria-label', '切換至淺色模式');
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 遊戲核心類別
  // ---------------------------------------------------------------------------
  class GameManager {
    constructor(size = 4) {
      this.size = size;
      this.gridContainer = document.getElementById('grid-container');
      this.tileContainer = document.getElementById('tile-container');
      this.currentScoreElem = document.getElementById('current-score');
      this.bestScoreElem = document.getElementById('best-score');
      this.scoreAdditionElem = document.getElementById('score-addition');
      this.gameMessageElem = document.getElementById('game-message');
      this.messageTextElem = document.getElementById('message-text');
      this.messageSubtextElem = document.getElementById('message-subtext');
      this.messageIconElem = document.getElementById('message-icon');
      
      this.btnRestart = document.getElementById('btn-restart');
      this.btnUndo = document.getElementById('btn-undo');
      this.btnKeepGoing = document.getElementById('btn-keep-going');
      this.btnTryAgain = document.getElementById('btn-try-again');

      // 儲存鍵名
      this.storageKeyBest = '2048shen_best_score';

      // 遊戲狀態
      this.grid = [];
      this.score = 0;
      this.bestScore = parseInt(localStorage.getItem(this.storageKeyBest) || '0', 10);
      this.history = null; // 支援一步復原
      this.won = false;
      this.keepPlaying = false;
      this.over = false;

      // 觸控變數
      this.touchStartX = 0;
      this.touchStartY = 0;

      this.init();
    }

    /**
     * 初始化遊戲事件與棋盤
     */
    init() {
      this.updateBestScoreDisplay();
      this.bindEvents();
      this.setupNewGame();
    }

    /**
     * 綁定鍵盤、觸控與按鈕事件
     */
    bindEvents() {
      // 鍵盤操作
      window.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
          e.preventDefault();
        }
        this.handleKeyDown(e);
      });

      // 重新開始
      this.btnRestart.addEventListener('click', () => this.setupNewGame());
      this.btnTryAgain.addEventListener('click', () => {
        this.hideMessage();
        this.setupNewGame();
      });

      // 繼續挑戰
      this.btnKeepGoing.addEventListener('click', () => {
        this.keepPlaying = true;
        this.hideMessage();
      });

      // 復原上一步
      this.btnUndo.addEventListener('click', () => this.undo());

      // 棋盤滑動手勢 (Touch Swipe)
      const container = this.gridContainer;
      container.addEventListener('touchstart', (e) => {
        if (e.touches.length > 1) return;
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
      }, { passive: true });

      container.addEventListener('touchend', (e) => {
        if (!this.touchStartX || !this.touchStartY) return;
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;

        const dx = touchEndX - this.touchStartX;
        const dy = touchEndY - this.touchStartY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // 最小滑動閾值
        if (Math.max(absDx, absDy) > 30) {
          if (absDx > absDy) {
            // 水平滑動
            this.move(dx > 0 ? 1 : 3); // 1: 右, 3: 左
          } else {
            // 垂直滑動
            this.move(dy > 0 ? 2 : 0); // 2: 下, 0: 上
          }
        }
        this.touchStartX = 0;
        this.touchStartY = 0;
      }, { passive: true });

      // 觸控虛擬按鈕
      document.querySelectorAll('.touch-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const dir = btn.dataset.dir;
          const map = { up: 0, right: 1, down: 2, left: 3 };
          if (map[dir] !== undefined) {
            this.move(map[dir]);
          }
        });
      });

      // 監聽視窗尺寸改變時重新繪製方塊位置
      window.addEventListener('resize', () => {
        this.render();
      });
    }

    /**
     * 處理鍵盤方向鍵輸入
     */
    handleKeyDown(e) {
      if (this.over || (this.won && !this.keepPlaying)) return;

      const keyMap = {
        ArrowUp: 0,
        KeyW: 0,
        ArrowRight: 1,
        KeyD: 1,
        ArrowDown: 2,
        KeyS: 2,
        ArrowLeft: 3,
        KeyA: 3
      };

      const direction = keyMap[e.code];
      if (direction !== undefined) {
        this.move(direction);
      }
    }

    /**
     * 開啟全新遊戲
     */
    setupNewGame() {
      this.grid = this.createEmptyGrid();
      this.score = 0;
      this.history = null;
      this.won = false;
      this.keepPlaying = false;
      this.over = false;
      this.updateScore(0);
      this.hideMessage();
      this.updateUndoButtonState();

      // 隨機產生兩顆初始方塊
      this.addRandomTile();
      this.addRandomTile();

      this.render();
    }

    /**
     * 建立空的 4x4 網格
     */
    createEmptyGrid() {
      const grid = [];
      for (let r = 0; r < this.size; r++) {
        grid[r] = [];
        for (let c = 0; c < this.size; c++) {
          grid[r][c] = null;
        }
      }
      return grid;
    }

    /**
     * 在棋盤空白處隨機生成方塊 (90% 為 2, 10% 為 4)
     */
    addRandomTile() {
      const emptyCells = [];
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          if (!this.grid[r][c]) {
            emptyCells.push({ r, c });
          }
        }
      }

      if (emptyCells.length > 0) {
        const { r, c } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        const value = Math.random() < 0.9 ? 2 : 4;
        this.grid[r][c] = {
          value: value,
          isNew: true,
          isMerged: false,
          id: Math.random().toString(36).substring(2, 9)
        };
      }
    }

    /**
     * 複製當前棋盤狀態供復原使用
     */
    saveHistory() {
      const clonedGrid = [];
      for (let r = 0; r < this.size; r++) {
        clonedGrid[r] = [];
        for (let c = 0; c < this.size; c++) {
          if (this.grid[r][c]) {
            clonedGrid[r][c] = {
              value: this.grid[r][c].value,
              id: this.grid[r][c].id
            };
          } else {
            clonedGrid[r][c] = null;
          }
        }
      }

      this.history = {
        grid: clonedGrid,
        score: this.score,
        won: this.won,
        keepPlaying: this.keepPlaying
      };
      this.updateUndoButtonState();
    }

    /**
     * 復原上一步
     */
    undo() {
      if (!this.history) return;

      this.grid = this.history.grid;
      this.score = this.history.score;
      this.won = this.history.won;
      this.keepPlaying = this.history.keepPlaying;
      this.over = false;

      this.history = null;
      this.updateUndoButtonState();
      this.updateScore(0, false);
      this.hideMessage();
      this.render();
    }

    /**
     * 更新復原按鈕啟用狀態
     */
    updateUndoButtonState() {
      if (this.btnUndo) {
        this.btnUndo.disabled = !this.history;
        this.btnUndo.style.opacity = this.history ? '1' : '0.5';
        this.btnUndo.style.cursor = this.history ? 'pointer' : 'not-allowed';
      }
    }

    /**
     * 移動核心算法
     * @param {number} direction 0: 上, 1: 右, 2: 下, 3: 左
     */
    move(direction) {
      if (this.over || (this.won && !this.keepPlaying)) return;

      // 暫存備份以供復原
      const backupGrid = JSON.stringify(this.grid);
      const previousScore = this.score;

      // 清除先前的動畫標記
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          if (this.grid[r][c]) {
            this.grid[r][c].isNew = false;
            this.grid[r][c].isMerged = false;
          }
        }
      }

      let moved = false;
      let scoreGain = 0;

      // 旋轉矩陣使計算統一為向左滑動
      // 0: 上 (逆時針旋轉1次 = 旋轉3次)
      // 1: 右 (旋轉2次)
      // 2: 下 (旋轉1次)
      // 3: 左 (旋轉0次)
      const rotations = { 0: 3, 1: 2, 2: 1, 3: 0 }[direction];
      for (let i = 0; i < rotations; i++) {
        this.grid = this.rotateMatrix(this.grid);
      }

      // 針對每行執行向左滑動與合併
      for (let r = 0; r < this.size; r++) {
        const row = this.grid[r];
        const newRow = row.filter((tile) => tile !== null);

        for (let c = 0; c < newRow.length - 1; c++) {
          if (newRow[c] && newRow[c + 1] && newRow[c].value === newRow[c + 1].value) {
            const mergedVal = newRow[c].value * 2;
            newRow[c] = {
              value: mergedVal,
              isMerged: true,
              isNew: false,
              id: Math.random().toString(36).substring(2, 9)
            };
            scoreGain += mergedVal;
            newRow.splice(c + 1, 1);
            moved = true;

            // 達到 2048 且未曾獲勝時
            if (mergedVal === 2048 && !this.won) {
              this.won = true;
            }
          }
        }

        // 補齊 4 格
        while (newRow.length < this.size) {
          newRow.push(null);
        }

        // 檢查是否有位移
        for (let c = 0; c < this.size; c++) {
          if ((row[c] && !newRow[c]) || (!row[c] && newRow[c]) || (row[c] && newRow[c] && row[c].value !== newRow[c].value)) {
            moved = true;
          }
        }

        this.grid[r] = newRow;
      }

      // 轉回原本方向
      const rotateBack = (4 - rotations) % 4;
      for (let i = 0; i < rotateBack; i++) {
        this.grid = this.rotateMatrix(this.grid);
      }

      // 若有移動，進行狀態更新
      if (moved) {
        // 先儲存歷史記錄以便復原
        this.history = {
          grid: JSON.parse(backupGrid),
          score: previousScore,
          won: this.won,
          keepPlaying: this.keepPlaying
        };
        this.updateUndoButtonState();

        if (scoreGain > 0) {
          this.updateScore(scoreGain);
        }

        this.addRandomTile();
        this.render();

        // 檢查勝負狀態
        if (this.won && !this.keepPlaying) {
          this.showMessage('win');
        } else if (this.isGameOver()) {
          this.over = true;
          this.showMessage('lose');
        }
      }
    }

    /**
     * 順時針旋轉矩陣 90 度
     */
    rotateMatrix(matrix) {
      const result = this.createEmptyGrid();
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          result[c][this.size - 1 - r] = matrix[r][c];
        }
      }
      return result;
    }

    /**
     * 檢查是否遊戲結束 (無法再移動)
     */
    isGameOver() {
      // 尚有空白格
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          if (!this.grid[r][c]) return false;
        }
      }

      // 檢查水平相鄰是否有相同數字
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size - 1; c++) {
          if (this.grid[r][c].value === this.grid[r][c + 1].value) return false;
        }
      }

      // 檢查垂直相鄰是否有相同數字
      for (let c = 0; c < this.size; c++) {
        for (let r = 0; r < this.size - 1; r++) {
          if (this.grid[r][c].value === this.grid[r + 1][c].value) return false;
        }
      }

      return true;
    }

    /**
     * 更新目前分數與歷史最高分數
     */
    updateScore(add, animate = true) {
      this.score += add;
      this.currentScoreElem.textContent = this.score;

      if (add > 0 && animate) {
        this.scoreAdditionElem.textContent = `+${add}`;
        this.scoreAdditionElem.classList.remove('active');
        void this.scoreAdditionElem.offsetWidth; // 觸發 reflow
        this.scoreAdditionElem.classList.add('active');
      }

      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        localStorage.setItem(this.storageKeyBest, this.bestScore.toString());
        this.updateBestScoreDisplay();
      }
    }

    /**
     * 更新最高分數面板
     */
    updateBestScoreDisplay() {
      this.bestScoreElem.textContent = this.bestScore;
    }

    /**
     * 顯示結算彈窗 (勝利或失敗)
     */
    showMessage(type) {
      if (type === 'win') {
        this.messageIconElem.innerHTML = '<i class="fa-solid fa-trophy"></i>';
        this.messageTextElem.textContent = '傳奇達成！';
        this.messageSubtextElem.textContent = '恭喜你成功合成出 2048 方塊！';
        this.btnKeepGoing.style.display = 'inline-flex';
      } else {
        this.messageIconElem.innerHTML = '<i class="fa-solid fa-skull-crossbones"></i>';
        this.messageTextElem.textContent = '遊戲結束！';
        this.messageSubtextElem.textContent = `本局得分：${this.score}，再接再厲！`;
        this.btnKeepGoing.style.display = 'none';
      }
      this.gameMessageElem.classList.add('active');
    }

    /**
     * 隱藏結算彈窗
     */
    hideMessage() {
      this.gameMessageElem.classList.remove('active');
    }

    /**
     * 繪製方塊到 DOM 容器
     */
    render() {
      this.tileContainer.innerHTML = '';

      // 動態讀取當前棋盤容器尺寸
      const boardWidth = this.gridContainer.clientWidth;
      const computedStyle = getComputedStyle(this.gridContainer);
      const padding = parseFloat(computedStyle.paddingLeft) || 12;
      const gap = parseFloat(computedStyle.gap) || 12;
      const innerSize = boardWidth - (padding * 2);
      const cellSize = (innerSize - (gap * (this.size - 1))) / this.size;

      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          const tileData = this.grid[r][c];
          if (tileData) {
            const tileNode = document.createElement('div');
            tileNode.className = 'tile';
            
            // 根據數值決定樣式 class
            const val = tileData.value;
            if (val <= 2048) {
              tileNode.classList.add(`tile-${val}`);
            } else {
              tileNode.classList.add('tile-super');
            }

            if (tileData.isNew) tileNode.classList.add('tile-new');
            if (tileData.isMerged) tileNode.classList.add('tile-merged');

            // 計算精準的像素位移
            const posX = c * (cellSize + gap);
            const posY = r * (cellSize + gap);

            tileNode.style.width = `${cellSize}px`;
            tileNode.style.height = `${cellSize}px`;
            tileNode.style.transform = `translate(${posX}px, ${posY}px)`;
            tileNode.textContent = val;

            this.tileContainer.appendChild(tileNode);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 吉祥物 (LiyuChillGuy) 自由拖曳管理員（不含對話框）
  // ---------------------------------------------------------------------------
  class MascotManager {
    constructor() {
      this.widget = document.getElementById('mascot-widget');
      if (!this.widget) return;

      this.isDragging = false;
      this.startX = 0;
      this.startY = 0;
      this.initialLeft = 0;
      this.initialTop = 0;

      this.init();
    }

    init() {
      this.bindDragEvents();
    }

    /**
     * 綁定滑鼠與觸控拖曳事件
     */
    bindDragEvents() {
      // 滑鼠拖曳
      this.widget.addEventListener('mousedown', (e) => this.onDragStart(e));
      window.addEventListener('mousemove', (e) => this.onDragMove(e));
      window.addEventListener('mouseup', (e) => this.onDragEnd(e));

      // 手機觸控拖曳
      this.widget.addEventListener('touchstart', (e) => this.onDragStart(e), { passive: false });
      window.addEventListener('touchmove', (e) => this.onDragMove(e), { passive: false });
      window.addEventListener('touchend', (e) => this.onDragEnd(e));
    }

    getClientCoords(e) {
      if (e.touches && e.touches.length > 0) {
        return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
      } else if (e.changedTouches && e.changedTouches.length > 0) {
        return { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY };
      }
      return { clientX: e.clientX, clientY: e.clientY };
    }

    onDragStart(e) {
      if (e.type === 'touchstart') {
        e.stopPropagation();
      }

      this.isDragging = true;

      const coords = this.getClientCoords(e);
      this.startX = coords.clientX;
      this.startY = coords.clientY;

      const rect = this.widget.getBoundingClientRect();
      this.initialLeft = rect.left;
      this.initialTop = rect.top;

      // 切換為由 top / left 定位
      this.widget.style.bottom = 'auto';
      this.widget.style.right = 'auto';
      this.widget.style.left = `${this.initialLeft}px`;
      this.widget.style.top = `${this.initialTop}px`;

      this.widget.classList.add('is-dragging');
    }

    onDragMove(e) {
      if (!this.isDragging) return;

      if (e.cancelable) {
        e.preventDefault();
      }

      const coords = this.getClientCoords(e);
      const dx = coords.clientX - this.startX;
      const dy = coords.clientY - this.startY;

      let newLeft = this.initialLeft + dx;
      let newTop = this.initialTop + dy;

      // 邊界防溢出處理 (保持在螢幕可視範圍之內)
      const widgetWidth = this.widget.offsetWidth;
      const widgetHeight = this.widget.offsetHeight;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      newLeft = Math.max(8, Math.min(windowWidth - widgetWidth - 8, newLeft));
      newTop = Math.max(8, Math.min(windowHeight - widgetHeight - 8, newTop));

      this.widget.style.left = `${newLeft}px`;
      this.widget.style.top = `${newTop}px`;
    }

    onDragEnd(e) {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.widget.classList.remove('is-dragging');
    }
  }

  // ---------------------------------------------------------------------------
  // 啟動應用
  // ---------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    window.themeManager = new ThemeManager();
    window.gameManager = new GameManager(4);
    window.mascotManager = new MascotManager();
  });
})();
