document.addEventListener('DOMContentLoaded', () => {
    const gridDisplay = document.getElementById('grid');
    const tileContainer = document.getElementById('tile-container');
    const scoreDisplay = document.getElementById('score');
    const gameMessage = document.getElementById('game-message');
    const messageText = document.getElementById('message-text');
    const retryButton = document.getElementById('retry-button');

    let board = [];
    let score = 0;
    let hasWon = false;
    let hasLost = false;
    let keepPlaying = false; 
    const size = 4;

    function createGrid() {
        for (let i = 0; i < size * size; i++) {
            let cell = document.createElement('div');
            cell.classList.add('grid-cell');
            gridDisplay.appendChild(cell);
        }
    }

    function initBoard() {
        board = Array(size).fill().map(() => Array(size).fill(0));
        score = 0;
        hasWon = false;
        hasLost = false;
        keepPlaying = false;
        scoreDisplay.innerText = score;
        tileContainer.innerHTML = '';
        gameMessage.style.display = 'none';
        addRandomTile();
        addRandomTile();
        renderBoard();
    }

    function addRandomTile() {
        let emptyCells = [];
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === 0) {
                    emptyCells.push({r, c});
                }
            }
        }
        if (emptyCells.length > 0) {
            let randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
            board[randomCell.r][randomCell.c] = Math.random() < 0.9 ? 2 : 4;
        }
    }

    function renderBoard() {
        tileContainer.innerHTML = '';
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== 0) {
                    let tile = document.createElement('div');
                    let val = board[r][c];
                    tile.classList.add('tile', `tile-${val > 2048 ? 'super' : val}`);
                    tile.innerText = val;
                    // Assign CSS variables for tile positioning
                    tile.style.setProperty('--r', r);
                    tile.style.setProperty('--c', c);
                    tileContainer.appendChild(tile);
                }
            }
        }
    }

    function handleInput(e) {
        if (hasLost || (hasWon && !keepPlaying)) return;
        
        // Prevent default scrolling for arrow keys
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
        }

        let moved = false;
        if (e.key === 'ArrowUp') moved = moveUp();
        else if (e.key === 'ArrowDown') moved = moveDown();
        else if (e.key === 'ArrowLeft') moved = moveLeft();
        else if (e.key === 'ArrowRight') moved = moveRight();

        if (moved) {
            addRandomTile();
            renderBoard();
            checkGameState();
        }
    }

    document.addEventListener('keydown', handleInput);

    // Touch Support
    let touchStartX = 0;
    let touchStartY = 0;
    
    const gameContainer = document.querySelector('.game-container');
    gameContainer.addEventListener('touchstart', e => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        e.preventDefault();
    }, { passive: false });

    gameContainer.addEventListener('touchend', e => {
        if (hasLost || (hasWon && !keepPlaying)) return;
        
        let touchEndX = e.changedTouches[0].clientX;
        let touchEndY = e.changedTouches[0].clientY;
        
        let dx = touchEndX - touchStartX;
        let dy = touchEndY - touchStartY;
        
        // Ensure swipe distance is significant
        if (Math.abs(dx) > 30 || Math.abs(dy) > 30) {
            if (Math.abs(dx) > Math.abs(dy)) {
                if (dx > 0) { if (moveRight()) finalizeMove(); } 
                else { if (moveLeft()) finalizeMove(); }
            } else {
                if (dy > 0) { if (moveDown()) finalizeMove(); } 
                else { if (moveUp()) finalizeMove(); }
            }
        }
    });

    function finalizeMove() {
        addRandomTile();
        renderBoard();
        checkGameState();
    }

    // Array logic for merging tiles
    function slide(row) {
        let filtered = row.filter(val => val !== 0);
        for (let i = 0; i < filtered.length - 1; i++) {
            if (filtered[i] === filtered[i+1]) {
                filtered[i] *= 2;
                score += filtered[i];
                filtered[i+1] = 0;
            }
        }
        filtered = filtered.filter(val => val !== 0);
        while(filtered.length < size) {
            filtered.push(0);
        }
        return filtered;
    }

    function moveLeft() {
        let moved = false;
        for (let r = 0; r < size; r++) {
            let row = board[r];
            let newRow = slide(row);
            if (row.toString() !== newRow.toString()) moved = true;
            board[r] = newRow;
        }
        scoreDisplay.innerText = score;
        return moved;
    }

    function moveRight() {
        let moved = false;
        for (let r = 0; r < size; r++) {
            let row = board[r].slice().reverse();
            let newRow = slide(row);
            newRow.reverse();
            if (board[r].toString() !== newRow.toString()) moved = true;
            board[r] = newRow;
        }
        scoreDisplay.innerText = score;
        return moved;
    }

    function moveUp() {
        let moved = false;
        for (let c = 0; c < size; c++) {
            let col = [board[0][c], board[1][c], board[2][c], board[3][c]];
            let newCol = slide(col);
            for (let r = 0; r < size; r++) {
                if (board[r][c] !== newCol[r]) moved = true;
                board[r][c] = newCol[r];
            }
        }
        scoreDisplay.innerText = score;
        return moved;
    }

    function moveDown() {
        let moved = false;
        for (let c = 0; c < size; c++) {
            let col = [board[0][c], board[1][c], board[2][c], board[3][c]].reverse();
            let newCol = slide(col);
            newCol.reverse();
            for (let r = 0; r < size; r++) {
                if (board[r][c] !== newCol[r]) moved = true;
                board[r][c] = newCol[r];
            }
        }
        scoreDisplay.innerText = score;
        return moved;
    }

    function checkGameState() {
        if (!hasWon && !keepPlaying) {
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    if (board[r][c] === 2048) {
                        hasWon = true;
                        showGameMessage('You Win!', true);
                        return; // Allow UI to update and user to choose action
                    }
                }
            }
        }

        let isFull = true;
        let canMove = false;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === 0) isFull = false;
                if (r < size - 1 && board[r][c] === board[r+1][c]) canMove = true;
                if (c < size - 1 && board[r][c] === board[r][c+1]) canMove = true;
            }
        }

        if (isFull && !canMove) {
            hasLost = true;
            showGameMessage('Game Over!', false);
        }
    }

    function showGameMessage(msg, isWin) {
        messageText.innerText = msg;
        gameMessage.style.display = 'flex';
        
        if (isWin) {
            retryButton.innerText = 'Keep going';
            retryButton.onclick = () => {
                keepPlaying = true;
                gameMessage.style.display = 'none';
                // Reset button behavior to normal restart
                retryButton.innerText = 'Try again';
                retryButton.onclick = initBoard;
            };
        } else {
            retryButton.innerText = 'Try again';
            retryButton.onclick = initBoard;
        }
    }

    retryButton.onclick = initBoard;

    createGrid();
    initBoard();
});
