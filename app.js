const PIECE_URLS = {
    'p': 'img/chesspieces/wikipedia/bP.png',
    'n': 'img/chesspieces/wikipedia/bN.png',
    'b': 'img/chesspieces/wikipedia/bB.png',
    'r': 'img/chesspieces/wikipedia/bR.png',
    'q': 'img/chesspieces/wikipedia/bQ.png',
    'k': 'img/chesspieces/wikipedia/bK.png',
    'P': 'img/chesspieces/wikipedia/wP.png',
    'N': 'img/chesspieces/wikipedia/wN.png',
    'B': 'img/chesspieces/wikipedia/wB.png',
    'R': 'img/chesspieces/wikipedia/wR.png',
    'Q': 'img/chesspieces/wikipedia/wQ.png',
    'K': 'img/chesspieces/wikipedia/wK.png'
};

const FILES = 'abcdefgh';
const RANKS = '87654321';

class ChessApp {
    constructor() {
        this.game = new Chess();
        this.boardEl = document.getElementById('board');
        this.squaresLayer = document.getElementById('squares-layer');
        this.piecesLayer = document.getElementById('pieces-layer');
        this.arrowsSvg = document.getElementById('arrows-svg');
        
        this.flipped = false;
        this.draggingPiece = null;
        this.dragStartSquare = null;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.engineLines = [];
        this.playAs = 'w';
        this.lastRenderTime = 0;
        
        this.selectedSquare = null; // New state for tap-to-move
        
        this.sounds = {
            move: new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3'),
            capture: new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3'),
            check: new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-check.mp3'),
            gameEnd: new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/game-end.mp3')
        };
        
        this.engine = new Engine();
        this.engine.setStyle(document.getElementById('style-select').value);
        
        this.initBoard();
        this.bindEvents();
        this.updateBoard();
    }

    initBoard() {
        this.squaresLayer.innerHTML = '';
        for (let i = 0; i < 64; i++) {
            const file = i % 8;
            const rank = Math.floor(i / 8);
            const sq = document.createElement('div');
            sq.className = `square ${(file + rank) % 2 === 0 ? 'white' : 'black'}`;
            sq.dataset.square = FILES[file] + RANKS[rank];
            sq.style.left = `${file * 12.5}%`;
            sq.style.top = `${rank * 12.5}%`;
            this.squaresLayer.appendChild(sq);
        }
        
        // Define SVG marker for arrows
        this.arrowsSvg.innerHTML = `
            <defs>
                <marker id="arrowhead-1" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0 0, 6 3, 0 6" fill="var(--c1)"/></marker>
                <marker id="arrowhead-2" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0 0, 6 3, 0 6" fill="var(--c2)"/></marker>
                <marker id="arrowhead-3" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0 0, 6 3, 0 6" fill="var(--c3)"/></marker>
                <marker id="arrowhead-4" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0 0, 6 3, 0 6" fill="var(--c4)"/></marker>
                <marker id="arrowhead-5" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0 0, 6 3, 0 6" fill="var(--c5)"/></marker>
            </defs>
        `;
        
        // Add listeners to empty squares for tap-to-move
        const squares = this.squaresLayer.querySelectorAll('.square');
        squares.forEach(sq => {
            sq.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.handleSquareClick(sq.dataset.square);
            });
            sq.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.handleSquareClick(sq.dataset.square);
            }, {passive: false});
        });
    }

    getSquareCoords(sq) {
        let file = FILES.indexOf(sq[0]);
        let rank = RANKS.indexOf(sq[1]);
        if (this.flipped) {
            file = 7 - file;
            rank = 7 - rank;
        }
        return { file, rank };
    }

    updateBoard() {
        this.piecesLayer.innerHTML = '';
        const position = this.game.board();
        
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const piece = position[r][f];
                if (piece) {
                    const pEl = document.createElement('div');
                    pEl.className = 'piece';
                    const symbol = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
                    pEl.style.backgroundImage = `url(${PIECE_URLS[symbol]})`;
                    
                    const sq = FILES[f] + RANKS[r];
                    pEl.dataset.square = sq;
                    
                    const coords = this.getSquareCoords(sq);
                    pEl.style.left = `${coords.file * 12.5}%`;
                    pEl.style.top = `${coords.rank * 12.5}%`;
                    
                    this.piecesLayer.appendChild(pEl);
                    
                    // Drag events
                    pEl.addEventListener('mousedown', (e) => this.onPieceDragStart(e, pEl));
                    pEl.addEventListener('touchstart', (e) => this.onPieceDragStart(e, pEl), {passive: false});
                }
            }
        }
        
        const squares = this.squaresLayer.querySelectorAll('.square');
        squares.forEach(sq => {
            const coords = this.getSquareCoords(sq.dataset.square);
            sq.style.left = `${coords.file * 12.5}%`;
            sq.style.top = `${coords.rank * 12.5}%`;
            sq.classList.remove('in-check', 'in-checkmate', 'selected');
            
            // clear old move indicators
            const dot = sq.querySelector('.move-indicator');
            if (dot) dot.remove();
        });
        
        if (this.game.in_check() || this.game.in_checkmate()) {
            const turn = this.game.turn();
            // Find the king's square
            let kingSq = null;
            for (let r = 0; r < 8; r++) {
                for (let f = 0; f < 8; f++) {
                    const p = position[r][f];
                    if (p && p.type === 'k' && p.color === turn) {
                        kingSq = FILES[f] + RANKS[r];
                        break;
                    }
                }
            }
            if (kingSq) {
                const kSquareEl = this.squaresLayer.querySelector(`.square[data-square="${kingSq}"]`);
                if (kSquareEl) {
                    if (this.game.in_checkmate()) {
                        kSquareEl.classList.add('in-checkmate');
                    } else {
                        kSquareEl.classList.add('in-check');
                    }
                }
            }
        }
        
        // Highlight selected square and draw legal moves
        if (this.selectedSquare) {
            const sqEl = this.squaresLayer.querySelector(`.square[data-square="${this.selectedSquare}"]`);
            if (sqEl) sqEl.classList.add('selected');
            
            const legalMoves = this.game.moves({ square: this.selectedSquare, verbose: true });
            legalMoves.forEach(m => {
                const targetSq = this.squaresLayer.querySelector(`.square[data-square="${m.to}"]`);
                if (targetSq) {
                    const dot = document.createElement('div');
                    dot.className = 'move-indicator';
                    targetSq.appendChild(dot);
                }
            });
        }
        
        document.getElementById('play-w').checked = (this.playAs === 'w');
        document.getElementById('play-b').checked = (this.playAs === 'b');
        
        this.renderHistory();
    }
    
    onPieceDragStart(e, pEl) {
        e.preventDefault();
        
        // Do not allow dragging if the game is over
        if (this.game.game_over()) return;
        
        this.draggingPiece = pEl;
        this.dragStartSquare = pEl.dataset.square;
        this.dragHasMoved = false;
        pEl.classList.add('dragging');
        this.clearArrows();
        
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        this.dragStartX = clientX;
        this.dragStartY = clientY;
        
        const moveHandler = (e) => this.onPieceDrag(e);
        const upHandler = (e) => {
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('touchmove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
            document.removeEventListener('touchend', upHandler);
            this.onPieceDragEnd(e);
        };
        
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('touchmove', moveHandler, {passive: false});
        document.addEventListener('mouseup', upHandler);
        document.addEventListener('touchend', upHandler);
    }
    
    onPieceDrag(e) {
        if (!this.draggingPiece) return;
        e.preventDefault();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        const dx = clientX - this.dragStartX;
        const dy = clientY - this.dragStartY;
        
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            this.dragHasMoved = true;
        }
        
        if (this.dragHasMoved) {
            this.draggingPiece.style.transform = `translate(${dx}px, ${dy}px) scale(1.1)`;
        }
    }
    
    onPieceDragEnd(e) {
        if (!this.draggingPiece) return;
        this.draggingPiece.classList.remove('dragging');
        this.draggingPiece.style.transform = '';
        
        const clientX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX);
        const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);
        
        const rect = this.boardEl.getBoundingClientRect();
        let x = clientX - rect.left;
        let y = clientY - rect.top;
        
        let fileIdx = Math.floor((x / rect.width) * 8);
        let rankIdx = Math.floor((y / rect.height) * 8);
        
        if (fileIdx >= 0 && fileIdx < 8 && rankIdx >= 0 && rankIdx < 8) {
            if (this.flipped) {
                fileIdx = 7 - fileIdx;
                rankIdx = 7 - rankIdx;
            }
            const targetSquare = FILES[fileIdx] + RANKS[rankIdx];
            
            if (!this.dragHasMoved) {
                // It was a tap!
                this.draggingPiece = null;
                this.handleSquareClick(this.dragStartSquare);
                return;
            }
            
            // Attempt move
            const success = this.executeMove(this.dragStartSquare, targetSquare);
            if (!success) {
                this.updateBoard(); // snap back
            }
        } else {
            if (!this.dragHasMoved) {
                this.draggingPiece = null;
                this.handleSquareClick(this.dragStartSquare);
                return;
            }
            this.updateBoard(); // snap back
        }
        
        this.draggingPiece = null;
        this.dragStartSquare = null;
    }
    
    showPromotionModal(callback) {
        const modal = document.getElementById('promotion-modal');
        modal.style.display = 'flex';
        
        const optionsContainer = modal.querySelector('.promo-options');
        const clickHandler = (e) => {
            const btn = e.target.closest('.promo-btn');
            if (btn) {
                optionsContainer.removeEventListener('click', clickHandler);
                modal.style.display = 'none';
                callback(btn.dataset.piece);
            }
        };
        optionsContainer.addEventListener('click', clickHandler);
    }
    
    playSound(move) {
        if (this.game.game_over()) {
            this.sounds.gameEnd.play().catch(e=>e);
        } else if (this.game.in_check()) {
            this.sounds.check.play().catch(e=>e);
        } else if (move.captured) {
            this.sounds.capture.play().catch(e=>e);
        } else {
            this.sounds.move.play().catch(e=>e);
        }
    }
    
    checkAutoPlay() {
        const isAutoPlay = document.getElementById('play-vs-ai').checked;
        if (isAutoPlay && !this.game.game_over() && this.game.turn() !== this.playAs) {
            this.playEngineMove();
        }
    }
    
    async playEngineMove() {
        document.getElementById('best-moves-list').innerHTML = `<div style="color: #a1a1aa; font-style: italic; padding: 20px;">AI is thinking...</div>`;
        const depth = parseInt(document.getElementById('depth-slider').value) || 15;
        const lines = await this.engine.analyze(this.game.fen(), depth, 1);
        if (lines.length > 0) {
            const bestMoveUci = lines[0].pv.split(' ')[0];
            const from = bestMoveUci.substring(0, 2);
            const to = bestMoveUci.substring(2, 4);
            const promotion = bestMoveUci.length > 4 ? bestMoveUci[4] : undefined;
            
            const move = this.game.move({ from, to, promotion });
            if (move) {
                this.updateBoard();
                this.playSound(move);
                this.clearArrows();
                document.getElementById('best-moves-list').innerHTML = `<div style="color: #a1a1aa; font-style: italic; padding: 20px;">AI played ${move.san}</div>`;
            }
        }
    }
    
    executeMove(from, to, promotion = null) {
        // Check if it's a pawn promotion move
        const piece = this.game.get(from);
        if (piece && piece.type === 'p' && (to[1] === '1' || to[1] === '8') && !promotion) {
            const moves = this.game.moves({verbose: true});
            const valid = moves.find(m => m.from === from && m.to === to);
            if (!valid) return false;

            this.showPromotionModal((choice) => {
                const move = this.game.move({ from, to, promotion: choice });
                if (move) {
                    this.selectedSquare = null;
                    this.updateBoard();
                    this.playSound(move);
                    this.checkAutoPlay();
                }
            });
            return true;
        }

        const move = this.game.move({ from, to, promotion: promotion || 'q' });
        if (move) {
            this.selectedSquare = null;
            this.updateBoard();
            this.playSound(move);
            this.checkAutoPlay();
            return true;
        }
        return false;
    }
    
    handleSquareClick(square) {
        if (!this.selectedSquare) {
            const piece = this.game.get(square);
            if (piece) {
                this.selectedSquare = square;
                this.updateBoard();
            }
        } else {
            const success = this.executeMove(this.selectedSquare, square);
            if (!success) {
                const piece = this.game.get(square);
                if (piece) {
                    this.selectedSquare = square;
                    this.updateBoard();
                } else {
                    this.selectedSquare = null;
                    this.updateBoard();
                }
            }
        }
    }

    bindEvents() {
        document.getElementById('btn-export-pgn').onclick = () => {
            navigator.clipboard.writeText(this.game.pgn());
            const btn = document.getElementById('btn-export-pgn');
            const orig = btn.innerText;
            btn.innerText = '✅ Copied!';
            setTimeout(() => btn.innerText = orig, 2000);
        };
        
        document.getElementById('btn-new').onclick = () => {
            this.game.reset();
            this.updateBoard();
            this.clearArrows();
            this.checkAutoPlay();
        };
        
        document.getElementById('btn-flip').onclick = () => {
            this.flipped = !this.flipped;
            this.updateBoard();
            this.drawArrows(); // redraw with new orientation
        };
        
        document.getElementById('btn-undo').onclick = () => {
            this.game.undo();
            this.updateBoard();
            this.clearArrows();
        };
        
        document.getElementById('btn-calculate').onclick = () => {
            this.triggerAnalysis();
        };

        document.getElementById('play-w').onchange = () => { this.playAs = 'w'; this.clearArrows(); };
        document.getElementById('play-b').onchange = () => { this.playAs = 'b'; this.clearArrows(); };
        
        const engineSel = document.getElementById('engine-select');
        engineSel.onchange = () => {
            this.engine.loadEngine(engineSel.value);
            this.engine.setStyle(document.getElementById('style-select').value);
            this.clearArrows();
        };

        const styleSel = document.getElementById('style-select');
        styleSel.onchange = () => {
            this.engine.setStyle(styleSel.value);
            this.clearArrows();
        };
        
        document.getElementById('theme-select').onchange = (e) => {
            const themes = {
                'green': { w: '#ebecd0', b: '#739552' },
                'walnut': { w: '#dcd0c0', b: '#4b4136' },
                'slate': { w: '#cdd2d6', b: '#546375' }
            };
            const t = themes[e.target.value];
            document.documentElement.style.setProperty('--white-square', t.w);
            document.documentElement.style.setProperty('--black-square', t.b);
        };
        
        const arrowCount = document.getElementById('arrow-count');
        arrowCount.oninput = () => {
            document.getElementById('arrow-count-val').innerText = arrowCount.value;
            this.drawArrows();
        };
        
        const depthSlider = document.getElementById('depth-slider');
        depthSlider.oninput = () => {
            document.getElementById('depth-val').innerText = depthSlider.value;
        };
        
        for (let i = 1; i <= 3; i++) {
            const c = document.getElementById(`color-${i}`);
            if(c) c.oninput = () => this.drawArrows();
        }
    }

    clearArrows() {
        this.engineLines = [];
        const existingLines = this.arrowsSvg.querySelectorAll('line');
        existingLines.forEach(line => {
            line.style.opacity = "0"; // Smooth fade out
            setTimeout(() => line.remove(), 300); // Remove from DOM after transition
        });
        document.getElementById('best-moves-list').innerHTML = `<div style="color: #a1a1aa; font-style: italic; padding: 20px;">Move made. Click Calculate to analyze.</div>`;
        document.getElementById('eval-bar-fill').style.height = `50%`;
    }

    async triggerAnalysis() {
        if (this.game.game_over()) {
            document.getElementById('best-moves-list').innerHTML = '<div style="color: #a1a1aa; font-style: italic;">Game over</div>';
            return;
        }

        if (this.game.turn() !== this.playAs) {
            document.getElementById('best-moves-list').innerHTML = `<div style="color: #a1a1aa; font-style: italic; padding: 20px;">Waiting for opponent's move...</div>`;
            return;
        }
        
        const btn = document.getElementById('btn-calculate');
        btn.innerHTML = '🧠 Thinking...';
        btn.disabled = true;
        
        this.clearArrows();
        document.getElementById('best-moves-list').innerHTML = `<div style="color: #a1a1aa; font-style: italic; padding: 20px;">Analyzing...</div>`;
        
        const depth = parseInt(document.getElementById('depth-slider').value);
        const multipv = parseInt(document.getElementById('arrow-count').value);
        
        const startTime = Date.now();
        // Start engine analysis
        const analysisPromise = this.engine.analyze(this.game.fen(), depth, multipv);
        
        // Await final lines
        const lines = await analysisPromise;
        const timeElapsed = (Date.now() - startTime) / 1000;
        
        // Sort lines by score
        this.engineLines = lines.sort((a, b) => {
            const aVal = a.score.type === 'mate' ? (a.score.value > 0 ? 10000 - a.score.value : -10000 - a.score.value) : a.score.value;
            const bVal = b.score.type === 'mate' ? (b.score.value > 0 ? 10000 - b.score.value : -10000 - b.score.value) : b.score.value;
            return this.game.turn() === 'w' ? bVal - aVal : aVal - bVal;
        });
        
        this.renderBestMoves(this.engineLines, timeElapsed);
        this.drawArrows();
        this.updateEvalBar();
        
        btn.innerHTML = '🚀 Calculate Best Move';
        btn.disabled = false;
    }
    
    updateEvalBar() {
        if (this.engineLines.length === 0) return;
        const best = this.engineLines[0];
        let evalCp = best.score.type === 'cp' ? best.score.value : (best.score.value > 0 ? 10000 : -10000);
        
        if (this.game.turn() === 'b') {
            evalCp = -evalCp;
        }
        
        // Cap eval for UI purposes (-1000 to +1000)
        evalCp = Math.max(-1000, Math.min(1000, evalCp));
        
        // 0 cp = 50% height
        let percent = 50 + (evalCp / 1000) * 50;
        
        if (this.flipped) {
            percent = 100 - percent;
        }
        
        document.getElementById('eval-bar-fill').style.height = `${percent}%`;
    }

    renderBestMoves(lines, timeElapsed) {
        document.getElementById('analysis-time').innerText = `⏱️ ${timeElapsed.toFixed(1)}s`;
        const list = document.getElementById('best-moves-list');
        list.innerHTML = '';
        
        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
        const colors = [
            document.getElementById('color-1').value,
            document.getElementById('color-2').value,
            document.getElementById('color-3').value,
            '#a855f7', '#ec4899'
        ];
        
        lines.slice(0, parseInt(document.getElementById('arrow-count').value)).forEach((line, idx) => {
            const el = document.createElement('div');
            el.className = 'move-item';
            
            let scoreVal = line.score.value;
            if (this.game.turn() === 'b') scoreVal = -scoreVal;
            
            let evalClass = scoreVal > 0 ? 'positive' : (scoreVal < 0 ? 'negative' : '');
            
            let evalStr = '';
            if (line.score.type === 'mate') {
                evalStr = `M${Math.abs(line.score.value)}`;
            } else {
                evalStr = (scoreVal > 0 ? '+' : '') + (scoreVal / 100).toFixed(2);
            }
            
            const pvArray = line.pv.split(' ');
            let firstMoveUci = pvArray[0];
            
            // Format for display
            el.innerHTML = `
                <div class="move-rank">${medals[idx] || ''}</div>
                <div class="move-san" style="color: ${colors[idx]}">${firstMoveUci}</div>
                <div class="move-eval ${evalClass}">${evalStr}</div>
                <div class="move-line">${line.pv}</div>
            `;
            list.appendChild(el);
        });
    }

    drawArrows() {
        const svg = this.arrowsSvg;
        const defs = svg.querySelector('defs');
        
        const colors = [
            document.getElementById('color-1').value,
            document.getElementById('color-2').value,
            document.getElementById('color-3').value,
            '#a855f7', '#ec4899'
        ];
        
        for(let i=0; i<5; i++) {
            svg.style.setProperty(`--c${i+1}`, colors[i] || colors[2]);
        }
        
        const lines = this.engineLines.slice(0, parseInt(document.getElementById('arrow-count').value));
        
        // Use viewBox 0 0 100 100 to map coordinates
        svg.setAttribute('viewBox', '0 0 100 100');
        
        const usedIndices = new Set();
        
        [...lines].reverse().forEach((line, revIdx) => {
            const idx = lines.length - 1 - revIdx;
            usedIndices.add(idx);
            
            const moveUci = line.pv.split(' ')[0];
            if (moveUci.length >= 4) {
                const fromSq = moveUci.substring(0, 2);
                const toSq = moveUci.substring(2, 4);
                
                const from = this.getSquareCoords(fromSq);
                const to = this.getSquareCoords(toSq);
                
                const x1 = from.file * 12.5 + 6.25;
                const y1 = from.rank * 12.5 + 6.25;
                const x2 = to.file * 12.5 + 6.25;
                const y2 = to.rank * 12.5 + 6.25;
                
                // Shorten line slightly so arrowhead doesn't overshoot center
                const dx = x2 - x1;
                const dy = y2 - y1;
                const angle = Math.atan2(dy, dx);
                const dist = Math.sqrt(dx*dx + dy*dy);
                const offset = Math.min(3, dist / 3);
                
                const ex = x2 - Math.cos(angle) * offset;
                const ey = y2 - Math.sin(angle) * offset;
                
                if (dist > 0) {
                    let lineEl = svg.querySelector(`line[data-idx="${idx}"]`);
                    if (!lineEl) {
                        lineEl = document.createElementNS("http://www.w3.org/2000/svg", "line");
                        lineEl.setAttribute("data-idx", idx);
                        svg.appendChild(lineEl);
                    }
                    
                    lineEl.style.transition = "all 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s";
                    lineEl.setAttribute("x1", x1);
                    lineEl.setAttribute("y1", y1);
                    lineEl.setAttribute("x2", ex);
                    lineEl.setAttribute("y2", ey);
                    lineEl.setAttribute("stroke", colors[idx]);
                    lineEl.setAttribute("stroke-width", "1.5");
                    lineEl.setAttribute("stroke-linecap", "round");
                    lineEl.setAttribute("opacity", "0.85");
                    lineEl.setAttribute("marker-end", `url(#arrowhead-${idx+1})`);
                }
            }
        });
        
        const existingLines = svg.querySelectorAll('line');
        existingLines.forEach(line => {
            const idx = parseInt(line.getAttribute('data-idx'));
            if (!usedIndices.has(idx)) {
                line.remove();
            }
        });
    }
    
    renderHistory() {
        const hist = this.game.history();
        const container = document.getElementById('move-history');
        container.innerHTML = '';
        
        for (let i = 0; i < hist.length; i += 2) {
            const moveNum = Math.floor(i / 2) + 1;
            container.innerHTML += `<div style="color: var(--text-secondary); width: 25px;">${moveNum}.</div>`;
            
            const m1 = document.createElement('div');
            m1.className = 'hist-move';
            m1.innerText = hist[i];
            container.appendChild(m1);
            
            if (i + 1 < hist.length) {
                const m2 = document.createElement('div');
                m2.className = 'hist-move';
                m2.innerText = hist[i+1];
                container.appendChild(m2);
            }
        }
        container.scrollTop = container.scrollHeight;
    }
}

window.onload = () => {
    window.app = new ChessApp();
};
