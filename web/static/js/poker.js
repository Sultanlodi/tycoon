/**
 * Poker Client
 * ============
 * Self-contained poker page logic.
 * Uses shared.js for: socket, gameState, session, showScreen, showToast, openModal, closeModal, goToPicker.
 * Uses BankrollService from bankroll.js (with wallet persistence).
 */

// ============== Poker State ==============
let pokerState = {
    room: null,
    timerInterval: null,
    dealCountdown: null,
    lastHandNumber: 0,
    raiseAmount: 0,
};

// ============== Initialization ==============
document.addEventListener('DOMContentLoaded', async () => {
    gameState.selectedGame = 'poker';
    initShared();
    initAuth();

    // Initialize wallet from Supabase
    await BankrollService.init();

    // If no saved poker session, apply any pending stack return now
    const savedSession = loadSession();
    if (!savedSession || savedSession.selectedGame !== 'poker' || !savedSession.roomCode) {
        await _applyPendingReturn();
    }

    connectSocket(registerPokerEvents);

    // On page unload, save stack to localStorage as pending
    window.addEventListener('beforeunload', () => {
        _savePendingReturn();
    });
});

// ============== Pending Stack Return ==============
// Handles the case where a user closes the tab mid-game.
// Stack is saved to localStorage and applied on next page load.

function _savePendingReturn() {
    if (!pokerState.room) return;
    const me = pokerState.room.players.find(p => p.id === gameState.playerId);
    if (me && me.stack > 0 && gameState.roomCode) {
        localStorage.setItem('poker_pending_return', JSON.stringify({
            stack: me.stack,
            time: Date.now(),
        }));
    }
}

async function _applyPendingReturn() {
    const raw = localStorage.getItem('poker_pending_return');
    if (!raw) return;
    localStorage.removeItem('poker_pending_return');

    try {
        const pending = JSON.parse(raw);
        if (Date.now() - pending.time < 120000 && pending.stack > 0) {
            await BankrollService.returnStack(pending.stack);
            showToast(`Recovered $${pending.stack} from last session`);
        }
    } catch (e) { /* ignore */ }
}

function _applyPendingReturnSync() {
    const raw = localStorage.getItem('poker_pending_return');
    if (!raw) return;
    localStorage.removeItem('poker_pending_return');

    try {
        const pending = JSON.parse(raw);
        if (Date.now() - pending.time < 120000 && pending.stack > 0) {
            BankrollService.returnStackSync(pending.stack);
        }
    } catch (e) { /* ignore */ }
}

function _clearPendingReturn() {
    localStorage.removeItem('poker_pending_return');
}

// ============== Socket Events ==============
function registerPokerEvents() {
    socket.on('room_created', (data) => {
        gameState.roomCode = data.code;
        gameState.isHost = true;
        gameState.room = data.room;
        pokerState.room = data.room;
        _clearPendingReturn();
        saveSession();
        showScreen('poker-waiting-screen');
        renderPokerWaiting();
    });

    socket.on('room_joined', (data) => {
        gameState.roomCode = data.code;
        gameState.room = data.room;
        gameState.isHost = false;
        pokerState.room = data.room;
        _clearPendingReturn();
        saveSession();
        showScreen('poker-waiting-screen');
        renderPokerWaiting();
    });

    socket.on('player_joined', (data) => {
        if (pokerState.room) {
            const exists = pokerState.room.players.find(p => p.id === data.player.id);
            if (!exists) pokerState.room.players.push(data.player);
            renderPokerWaiting();
        }
    });

    socket.on('player_left', (data) => {
        if (pokerState.room) {
            pokerState.room.players = pokerState.room.players.filter(p => p.id !== data.playerId);
            renderPokerWaiting();
        }
    });

    socket.on('poker_update', (data) => {
        const prevPhase = pokerState.room ? pokerState.room.gamePhase : null;
        const prevHand = pokerState.room ? pokerState.room.handNumber : 0;
        pokerState.room = data.room;

        if (data.room.gamePhase === 'waiting') {
            _clearTimers();
            showScreen('poker-waiting-screen');
            renderPokerWaiting();
        } else if (data.room.gamePhase === 'hand_end') {
            _clearTimers();
            showScreen('poker-game-screen');
            renderPokerTable();
            _showWinnerOverlay(data.room);
            _startDealCountdown(data.room);
        } else {
            showScreen('poker-game-screen');
            // Animate new cards if hand just started or street changed
            const isNewHand = data.room.handNumber !== prevHand;
            renderPokerTable(isNewHand, prevPhase !== data.room.gamePhase);
            _updateTimer(data.room);
        }
    });

    socket.on('poker_rejoined', (data) => {
        gameState.roomCode = data.code;
        gameState.room = data.room;
        pokerState.room = data.room;
        _clearPendingReturn();
        saveSession();
        showToast('Reconnected!');
        if (data.room.gamePhase === 'waiting' || data.room.gamePhase === 'hand_end') {
            showScreen('poker-waiting-screen');
            renderPokerWaiting();
        } else {
            showScreen('poker-game-screen');
            renderPokerTable();
        }
    });

    socket.on('poker_buy_in_success', (data) => {
        showToast(`Bought in for $${data.amount}`);
        updateBankrollDisplay();
    });

    // Handle room-not-found: apply pending return before shared.js redirects
    socket.on('error', (data) => {
        if (data.message === 'Room not found') {
            _applyPendingReturnSync();
        }
    });

    socket.on('poker_action_broadcast', (data) => {
        const msg = data.action === 'fold' ? `${data.player} folds`
            : data.action === 'check' ? `${data.player} checks`
            : data.action === 'call' ? `${data.player} calls $${data.amount}`
            : `${data.player} raises to $${data.amount}`;
        showToast(msg, 1500);

        // Chip animation on bet/call/raise
        if (data.action !== 'fold' && data.action !== 'check' && data.playerId) {
            const seatEl = _findSeatForPlayer(data.playerId);
            if (seatEl) animateChipToPot(seatEl);
        }
    });

    socket.on('poker_blinds_up', (data) => {
        showToast(`Blinds up! Now $${data.smallBlind}/$${data.bigBlind}`, 3000);
    });

    socket.on('poker_hand_shown', (data) => {
        // Update local state
        if (pokerState.room) {
            if (!pokerState.room.shownHands) pokerState.room.shownHands = {};
            pokerState.room.shownHands[data.playerId] = data.cards;
        }

        // Animate the reveal at the seat + show spotlight
        _animateSeatReveal(data.playerId, data.cards);
        _queueRevealSpotlight(data.playerName, data.cards);

        // Re-render to update seat cards and "Show Hand" button state
        renderPokerTable();
    });

    socket.on('player_kicked', (data) => {
        if (pokerState.room) {
            pokerState.room.players = pokerState.room.players.filter(p => p.id !== data.playerId);
            showToast(data.playerName + ' was removed');
            renderPokerWaiting();
        }
    });

    socket.on('kicked_from_room', async (data) => {
        _clearTimers();
        if (data.stack > 0) {
            await BankrollService.returnStack(data.stack);
        }
        _clearPendingReturn();
        clearSession();
        pokerState.room = null;
        gameState.roomCode = null;
        gameState.room = null;
        showToast(data.reason || 'You were removed from the room');
        showScreen('poker-home-screen');
        updateBankrollDisplay();
    });

    socket.on('player_disconnected', (data) => showToast(`${data.playerName} disconnected`));
    socket.on('player_reconnected', (data) => showToast(`${data.playerName} reconnected`));
}

// ============== Room Actions ==============

function pokerCreateRoom() {
    gameState.playerName = document.getElementById('player-name').value || 'Player';
    socket.emit('create_room', {
        playerName: gameState.playerName,
        playerId: gameState.playerId,
        gameType: 'poker',
    });
}

function showPokerJoinModal() {
    const content = `
        <h2>Join Poker Room</h2>
        <input type="text" id="join-code-input" placeholder="ABCD12" maxlength="6" oninput="this.value = this.value.toUpperCase()">
        <div class="modal-buttons">
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn-primary" onclick="joinPokerRoom()">Join</button>
        </div>
    `;
    openModal(content);
    setTimeout(() => document.getElementById('join-code-input').focus(), 100);
}

function joinPokerRoom() {
    const code = document.getElementById('join-code-input').value.toUpperCase();
    if (code.length < 4) {
        showToast('Please enter a valid room code');
        return;
    }
    gameState.playerName = document.getElementById('player-name').value || 'Player';
    socket.emit('join_room', {
        code: code,
        playerName: gameState.playerName,
        playerId: gameState.playerId,
        gameType: 'poker',
    });
    closeModal();
}

// ============== How to Play Modal ==============

function showHowToPlayModal() {
    const content = `
        <div class="rules-modal">
            <h2>How to Play</h2>
            <div class="rules-content">
                <h3>Objective</h3>
                <p>Win chips from other players by making the best 5-card hand or by bluffing everyone else into folding.</p>

                <h3>Game Flow</h3>
                <ul>
                    <li><strong>Deal</strong> &mdash; Each player gets 2 private cards (hole cards).</li>
                    <li><strong>Pre-Flop</strong> &mdash; First betting round.</li>
                    <li><strong>Flop</strong> &mdash; 3 community cards dealt, then betting.</li>
                    <li><strong>Turn</strong> &mdash; 1 more community card, then betting.</li>
                    <li><strong>River</strong> &mdash; Final community card, then betting.</li>
                    <li><strong>Showdown</strong> &mdash; Remaining players reveal cards. Best 5-card hand wins the pot.</li>
                </ul>

                <h3>Actions</h3>
                <ul>
                    <li><strong>Fold</strong> &mdash; Give up your hand and sit out until the next deal.</li>
                    <li><strong>Check</strong> &mdash; Pass the action (only if no one has bet).</li>
                    <li><strong>Call</strong> &mdash; Match the current bet to stay in.</li>
                    <li><strong>Bet / Raise</strong> &mdash; Put chips in. Use the slider or presets (1/4, 1/2, Pot, All In).</li>
                </ul>

                <h3>Blinds</h3>
                <p>Each hand, two players post forced bets: <strong>Small Blind</strong> and <strong>Big Blind</strong>. These rotate around the table. Blinds increase every 10 hands to keep the game moving.</p>

                <h3>Wallet &amp; Buy-In</h3>
                <ul>
                    <li>Weekly minimum bankroll: <strong>$3,000</strong> (topped up if below).</li>
                    <li>Each buy-in costs <strong>$1,000</strong> from your wallet.</li>
                    <li>When you leave a room, your table chips return to your wallet.</li>
                </ul>

                <h3>Turn Timer</h3>
                <p>You have <strong>30 seconds</strong> to act on each turn. If time runs out, you auto-fold.</p>

                <h3>Quick Start</h3>
                <ol>
                    <li>Create a room or join with a code.</li>
                    <li>Buy in for $1,000.</li>
                    <li>Use the action buttons and raise slider.</li>
                    <li>Hands auto-deal after each round &mdash; just keep playing!</li>
                </ol>
            </div>
            <div class="modal-buttons">
                <button class="btn-primary" onclick="closeModal()">Got It</button>
            </div>
        </div>
    `;
    openModal(content);
}

// ============== Hand Rankings Modal ==============

function showHandRankingsModal() {
    const content = `
        <div class="rules-modal">
            <h2>Hand Rankings</h2>
            <div class="hand-rankings-list">
                <div class="rank-entry">
                    <span class="rank-num">1</span>
                    <span class="rank-name">Royal Flush</span>
                    <span class="rank-cards">
                        <span class="mini-card spades">A&#9824;</span>
                        <span class="mini-card spades">K&#9824;</span>
                        <span class="mini-card spades">Q&#9824;</span>
                        <span class="mini-card spades">J&#9824;</span>
                        <span class="mini-card spades">10&#9824;</span>
                    </span>
                </div>
                <div class="rank-entry">
                    <span class="rank-num">2</span>
                    <span class="rank-name">Straight Flush</span>
                    <span class="rank-cards">
                        <span class="mini-card hearts">9&#9829;</span>
                        <span class="mini-card hearts">8&#9829;</span>
                        <span class="mini-card hearts">7&#9829;</span>
                        <span class="mini-card hearts">6&#9829;</span>
                        <span class="mini-card hearts">5&#9829;</span>
                    </span>
                </div>
                <div class="rank-entry">
                    <span class="rank-num">3</span>
                    <span class="rank-name">Four of a Kind</span>
                    <span class="rank-cards">
                        <span class="mini-card spades">K&#9824;</span>
                        <span class="mini-card hearts">K&#9829;</span>
                        <span class="mini-card diamonds">K&#9830;</span>
                        <span class="mini-card clubs">K&#9827;</span>
                        <span class="mini-card spades">2&#9824;</span>
                    </span>
                </div>
                <div class="rank-entry">
                    <span class="rank-num">4</span>
                    <span class="rank-name">Full House</span>
                    <span class="rank-cards">
                        <span class="mini-card hearts">A&#9829;</span>
                        <span class="mini-card spades">A&#9824;</span>
                        <span class="mini-card diamonds">A&#9830;</span>
                        <span class="mini-card clubs">7&#9827;</span>
                        <span class="mini-card hearts">7&#9829;</span>
                    </span>
                </div>
                <div class="rank-entry">
                    <span class="rank-num">5</span>
                    <span class="rank-name">Flush</span>
                    <span class="rank-cards">
                        <span class="mini-card diamonds">K&#9830;</span>
                        <span class="mini-card diamonds">J&#9830;</span>
                        <span class="mini-card diamonds">9&#9830;</span>
                        <span class="mini-card diamonds">6&#9830;</span>
                        <span class="mini-card diamonds">3&#9830;</span>
                    </span>
                </div>
                <div class="rank-entry">
                    <span class="rank-num">6</span>
                    <span class="rank-name">Straight</span>
                    <span class="rank-cards">
                        <span class="mini-card spades">10&#9824;</span>
                        <span class="mini-card hearts">9&#9829;</span>
                        <span class="mini-card clubs">8&#9827;</span>
                        <span class="mini-card diamonds">7&#9830;</span>
                        <span class="mini-card spades">6&#9824;</span>
                    </span>
                </div>
                <div class="rank-entry">
                    <span class="rank-num">7</span>
                    <span class="rank-name">Three of a Kind</span>
                    <span class="rank-cards">
                        <span class="mini-card hearts">Q&#9829;</span>
                        <span class="mini-card spades">Q&#9824;</span>
                        <span class="mini-card diamonds">Q&#9830;</span>
                        <span class="mini-card clubs">8&#9827;</span>
                        <span class="mini-card spades">4&#9824;</span>
                    </span>
                </div>
                <div class="rank-entry">
                    <span class="rank-num">8</span>
                    <span class="rank-name">Two Pair</span>
                    <span class="rank-cards">
                        <span class="mini-card hearts">J&#9829;</span>
                        <span class="mini-card spades">J&#9824;</span>
                        <span class="mini-card diamonds">5&#9830;</span>
                        <span class="mini-card clubs">5&#9827;</span>
                        <span class="mini-card hearts">A&#9829;</span>
                    </span>
                </div>
                <div class="rank-entry">
                    <span class="rank-num">9</span>
                    <span class="rank-name">One Pair</span>
                    <span class="rank-cards">
                        <span class="mini-card clubs">10&#9827;</span>
                        <span class="mini-card hearts">10&#9829;</span>
                        <span class="mini-card spades">K&#9824;</span>
                        <span class="mini-card diamonds">7&#9830;</span>
                        <span class="mini-card clubs">2&#9827;</span>
                    </span>
                </div>
                <div class="rank-entry">
                    <span class="rank-num">10</span>
                    <span class="rank-name">High Card</span>
                    <span class="rank-cards">
                        <span class="mini-card spades">A&#9824;</span>
                        <span class="mini-card hearts">J&#9829;</span>
                        <span class="mini-card diamonds">8&#9830;</span>
                        <span class="mini-card clubs">4&#9827;</span>
                        <span class="mini-card spades">2&#9824;</span>
                    </span>
                </div>
            </div>
            <div class="modal-buttons">
                <button class="btn-primary" onclick="closeModal()">Close</button>
            </div>
        </div>
    `;
    openModal(content);
}

// ============== Timer & Countdown ==============

function _clearTimers() {
    if (pokerState.timerInterval) {
        clearInterval(pokerState.timerInterval);
        pokerState.timerInterval = null;
    }
    if (pokerState.dealCountdown) {
        clearInterval(pokerState.dealCountdown);
        pokerState.dealCountdown = null;
    }
    const autoDeal = document.getElementById('poker-auto-deal');
    if (autoDeal) autoDeal.style.display = 'none';
}

function _updateTimer(room) {
    const wrap = document.getElementById('poker-timer-wrap');
    const bar = document.getElementById('poker-timer-bar');
    if (!wrap || !bar) return;

    const isMyTurn = room.currentPlayerId === gameState.playerId;

    if (!isMyTurn || room.turnRemaining == null) {
        wrap.style.display = 'none';
        if (pokerState.timerInterval) {
            clearInterval(pokerState.timerInterval);
            pokerState.timerInterval = null;
        }
        return;
    }

    wrap.style.display = 'block';
    const total = room.turnTimeLimit || 30;
    let remaining = room.turnRemaining;

    // Set initial width
    bar.style.width = Math.max(0, (remaining / total) * 100) + '%';
    bar.classList.toggle('timer-low', remaining < 10);

    if (pokerState.timerInterval) clearInterval(pokerState.timerInterval);

    const startTime = Date.now();
    const startRemaining = remaining;

    pokerState.timerInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        remaining = Math.max(0, startRemaining - elapsed);
        bar.style.width = Math.max(0, (remaining / total) * 100) + '%';
        bar.classList.toggle('timer-low', remaining < 10);
        if (remaining <= 0) {
            clearInterval(pokerState.timerInterval);
            pokerState.timerInterval = null;
        }
    }, 100);
}

function _startDealCountdown(room) {
    const overlay = document.getElementById('poker-auto-deal');
    const countEl = document.getElementById('poker-deal-countdown');
    if (!overlay || !countEl) return;

    const delay = room.postHandDelay || 10;
    let remaining = delay;
    countEl.textContent = remaining;
    overlay.style.display = 'flex';

    if (pokerState.dealCountdown) clearInterval(pokerState.dealCountdown);

    pokerState.dealCountdown = setInterval(() => {
        remaining--;
        countEl.textContent = Math.max(0, remaining);
        if (remaining <= 0) {
            clearInterval(pokerState.dealCountdown);
            pokerState.dealCountdown = null;
            overlay.style.display = 'none';
        }
    }, 1000);
}

// ============== Winner Overlay ==============

function _showWinnerOverlay(room) {
    const overlay = document.getElementById('poker-winner-overlay');
    const content = document.getElementById('poker-winner-content');
    if (!overlay || !content || !room.lastResults) return;

    let html = '';
    room.lastResults.winners.forEach(w => {
        const handName = w.handName ? `<div class="winner-hand-name">${w.handName}</div>` : '';
        html += `<div class="winner-entry">
            <span class="winner-name">${w.name}</span>
            <span class="winner-amount">+$${w.amount}</span>
            ${handName}
        </div>`;
    });

    content.innerHTML = html;
    overlay.style.display = 'block';
    // Force reflow then animate in
    overlay.offsetHeight;
    overlay.classList.add('winner-animate');

    // Animate chips flying to winner(s)
    if (room.lastResults && room.lastResults.winners) {
        room.lastResults.winners.forEach(w => {
            const winnerSeat = _findSeatForPlayer(w.id);
            if (winnerSeat) {
                const chipCount = Math.min(5, Math.max(1, Math.ceil(w.amount / 200)));
                animateChipsToWinner(winnerSeat, chipCount);
            }
        });
    }

    // Fade out after 3s, then hide
    setTimeout(() => {
        overlay.classList.remove('winner-animate');
        overlay.classList.add('winner-exit');
        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.classList.remove('winner-exit');
        }, 400);
    }, 3000);
}

// ============== Render: Waiting ==============

function renderPokerWaiting() {
    const room = pokerState.room;
    if (!room) return;

    document.getElementById('poker-room-code').textContent = room.code;

    const container = document.getElementById('poker-waiting-players');
    container.innerHTML = '';
    const maxSlots = 8;

    const isHost = gameState.isHost || gameState.playerId === room.hostId;

    for (let i = 0; i < maxSlots; i++) {
        const slot = document.createElement('div');
        slot.className = 'player-slot';

        if (room.players[i]) {
            const p = room.players[i];
            slot.classList.add('filled');
            const botLabel = p.isBot
                ? (p.botDifficulty === 'hard' ? ' [HARD BOT]' : ' [BOT]')
                : '';
            let kickBtn = '';
            if (isHost && p.id !== room.hostId) {
                kickBtn = '<button class="kick-btn" onclick="pokerKickPlayer(\'' + p.id + '\', ' + p.isBot + ')" title="Remove">&times;</button>';
            }
            slot.innerHTML = '<span>' + p.name + botLabel + '</span>' +
                '<span class="player-slot-right"><span class="player-stack">$' + p.stack + '</span>' + kickBtn + '</span>';
            if (p.id === room.hostId) slot.classList.add('host');
        } else {
            slot.classList.add('empty');
            slot.textContent = 'Open seat';
        }
        container.appendChild(slot);
    }

    // Bot controls (host only)
    const botControls = document.getElementById('poker-bot-controls');
    if (isHost && room.players.length < maxSlots && (room.gamePhase === 'waiting' || room.gamePhase === 'hand_end')) {
        botControls.style.display = 'block';
    } else {
        botControls.style.display = 'none';
    }

    // Start button
    const startBtn = document.getElementById('poker-start-btn');
    if (isHost) {
        const ready = room.players.filter(p => p.stack > 0).length;
        if (room.gamePhase === 'hand_end') {
            startBtn.textContent = 'Deal Next Hand';
            startBtn.style.display = 'block';
            startBtn.onclick = () => socket.emit('poker_next_hand', {
                code: gameState.roomCode, playerId: gameState.playerId,
            });
        } else {
            startBtn.textContent = 'Start Game';
            startBtn.style.display = ready >= 2 ? 'block' : 'none';
            startBtn.onclick = () => socket.emit('poker_start_game', {
                code: gameState.roomCode, playerId: gameState.playerId,
            });
        }
    } else {
        startBtn.style.display = 'none';
    }

    // Hand results
    const resultsDiv = document.getElementById('poker-hand-results');
    if (room.lastResults && room.gamePhase === 'hand_end') {
        let html = '<h3>Hand Result</h3>';
        room.lastResults.winners.forEach(w => {
            const handName = w.handName ? ` (${w.handName})` : '';
            html += `<div class="poker-winner">${w.name} wins $${w.amount}${handName}</div>`;
        });

        if (room.lastResults.hands) {
            html += '<div class="poker-showdown-hands">';
            Object.entries(room.lastResults.hands).forEach(([pid, info]) => {
                const p = room.players.find(pl => pl.id === pid);
                if (p && info.cards && info.cards.length) {
                    html += `<div class="showdown-hand">
                        <span class="showdown-name">${p.name}</span>
                        <span class="showdown-cards">${info.cards.map(c => c.display).join(' ')}</span>
                        <span class="showdown-rank">${info.handName}</span>
                    </div>`;
                }
            });
            html += '</div>';
        }

        if (room.lastResults.communityCards && room.lastResults.communityCards.length) {
            html += '<div class="poker-community-result">Board: ';
            html += room.lastResults.communityCards.map(c => c.display).join(' ');
            html += '</div>';
        }

        resultsDiv.innerHTML = html;
        resultsDiv.style.display = 'block';
    } else {
        resultsDiv.style.display = 'none';
    }

    updateBankrollDisplay();
}

// ============== Render: Table ==============

// Seat positions (percentages around the oval) for up to 8 seats
// My seat is always at the bottom center; others arranged relative
const SEAT_POSITIONS = {
    2: [
        { top: '5%', left: '50%' },     // opponent top
    ],
    3: [
        { top: '15%', left: '15%' },    // top-left
        { top: '15%', left: '85%' },    // top-right
    ],
    4: [
        { top: '15%', left: '10%' },
        { top: '5%', left: '50%' },
        { top: '15%', left: '90%' },
    ],
    5: [
        { top: '30%', left: '5%' },
        { top: '5%', left: '25%' },
        { top: '5%', left: '75%' },
        { top: '30%', left: '95%' },
    ],
    6: [
        { top: '40%', left: '3%' },
        { top: '8%', left: '15%' },
        { top: '5%', left: '50%' },
        { top: '8%', left: '85%' },
        { top: '40%', left: '97%' },
    ],
    7: [
        { top: '45%', left: '3%' },
        { top: '15%', left: '8%' },
        { top: '3%', left: '33%' },
        { top: '3%', left: '67%' },
        { top: '15%', left: '92%' },
        { top: '45%', left: '97%' },
    ],
    8: [
        { top: '50%', left: '2%' },
        { top: '20%', left: '5%' },
        { top: '3%', left: '25%' },
        { top: '3%', left: '50%' },
        { top: '3%', left: '75%' },
        { top: '20%', left: '95%' },
        { top: '50%', left: '98%' },
    ],
};

function renderPokerTable(isNewHand, isNewStreet) {
    const room = pokerState.room;
    if (!room) return;

    const me = room.players.find(p => p.id === gameState.playerId);
    const isMyTurn = room.currentPlayerId === gameState.playerId;

    // Header
    const phaseNames = { pre_flop: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River', hand_end: 'Showdown' };
    document.getElementById('poker-phase').textContent = phaseNames[room.gamePhase] || '';
    document.getElementById('poker-blinds-label').textContent = `Blinds $${room.smallBlind}/$${room.bigBlind}`;
    document.getElementById('poker-pot').textContent = `Pot: $${room.pot}`;
    document.getElementById('poker-hand-num').textContent = `#${room.handNumber}`;

    // Pot in center
    const potCenter = document.getElementById('poker-pot-center');
    if (room.pot > 0) {
        potCenter.textContent = `$${room.pot}`;
        potCenter.style.display = 'block';
    } else {
        potCenter.style.display = 'none';
    }

    // Community cards
    _renderCommunityCards(room, isNewStreet);

    // Seats
    _renderSeats(room, me);

    // My hand
    _renderMyHand(room, me, isNewHand);

    // My info
    if (me) {
        document.getElementById('poker-my-name').textContent = me.name;
        document.getElementById('poker-my-stack').textContent = `$${me.stack}`;
        document.getElementById('poker-my-bet').textContent = me.currentBet > 0 ? `Bet: $${me.currentBet}` : '';
    }

    // Actions
    renderPokerActions(room, me, isMyTurn);

    // Hide auto-deal overlay when hand is active
    if (room.gamePhase !== 'hand_end') {
        const autoDeal = document.getElementById('poker-auto-deal');
        if (autoDeal) autoDeal.style.display = 'none';
    }
}

function _renderCommunityCards(room, animate) {
    const el = document.getElementById('poker-community-cards');
    el.innerHTML = '';

    room.communityCards.forEach((card, i) => {
        const cardEl = createPokerCard(card);
        if (animate) {
            cardEl.style.animationDelay = (i * 0.12) + 's';
            cardEl.classList.add('card-deal-anim');
        }
        el.appendChild(cardEl);
    });

    const remaining = 5 - room.communityCards.length;
    for (let i = 0; i < remaining; i++) {
        const ph = document.createElement('div');
        ph.className = 'poker-card-placeholder';
        el.appendChild(ph);
    }
}

function _renderSeats(room, me) {
    const seatsEl = document.getElementById('poker-seats');
    seatsEl.innerHTML = '';

    // Get opponents (everyone except me)
    const myIdx = room.players.findIndex(p => p.id === gameState.playerId);
    const total = room.players.length;
    const opponents = [];

    for (let i = 1; i < total; i++) {
        const idx = (myIdx + i) % total;
        opponents.push(room.players[idx]);
    }

    const positions = SEAT_POSITIONS[total] || SEAT_POSITIONS[Math.min(total, 8)];
    if (!positions) return;

    opponents.forEach((p, i) => {
        if (i >= positions.length) return;
        const pos = positions[i];

        const seat = document.createElement('div');
        seat.className = 'poker-seat';
        if (p.isFolded) seat.classList.add('folded');
        if (p.id === room.currentPlayerId) seat.classList.add('active-turn');
        if (p.isAllIn) seat.classList.add('all-in');
        if (p.seat === room.dealerSeat) seat.classList.add('is-dealer');

        seat.style.top = pos.top;
        seat.style.left = pos.left;

        const isShowdown = room.gamePhase === 'hand_end' && p.holeCards && p.holeCards.length;
        const shownCards = room.shownHands && room.shownHands[p.id];
        const botLabel = p.isBot
            ? (p.botDifficulty === 'hard'
                ? '<span class="bot-badge hard-badge">HARD</span>'
                : '<span class="bot-badge">BOT</span>')
            : '';

        let cardsHtml = '';
        if (isShowdown) {
            // Player reached showdown — server sent their cards
            cardsHtml = p.holeCards.map(c =>
                `<span class="mini-card ${c.suit}">${c.display}</span>`
            ).join('');
        } else if (shownCards) {
            // Folded player opted to reveal post-hand
            cardsHtml = shownCards.map(c =>
                `<span class="mini-card ${c.suit} reveal-flip">${c.display}</span>`
            ).join('');
        } else if (p.cardCount > 0 && !p.isFolded) {
            cardsHtml = '<span class="mini-card back"></span><span class="mini-card back"></span>';
        }

        const isHost = gameState.playerId === room.hostId;
        const kickHtml = isHost && p.id !== room.hostId
            ? `<button class="seat-kick-btn" onclick="event.stopPropagation();pokerKickPlayer('${p.id}', ${p.isBot})" title="Remove">&times;</button>`
            : '';

        seat.innerHTML = `
            ${kickHtml}
            ${p.seat === room.dealerSeat ? '<span class="dealer-btn">D</span>' : ''}
            <div class="seat-name">${p.name}${botLabel}</div>
            <div class="seat-stack">$${p.stack}</div>
            ${p.currentBet > 0 ? `<div class="seat-bet">$${p.currentBet}</div>` : ''}
            ${p.isFolded ? '<div class="seat-status">FOLD</div>' : ''}
            ${p.isAllIn ? '<div class="seat-status seat-allin">ALL IN</div>' : ''}
            <div class="seat-cards">${cardsHtml}</div>
        `;

        seatsEl.appendChild(seat);
    });
}

function _renderMyHand(room, me, animate) {
    const handEl = document.getElementById('poker-my-hand');
    handEl.innerHTML = '';
    if (me && me.holeCards && me.holeCards.length) {
        me.holeCards.forEach((card, i) => {
            const cardEl = createPokerCard(card);
            if (animate) {
                cardEl.style.animationDelay = (i * 0.15) + 's';
                cardEl.classList.add('card-deal-anim');
            }
            handEl.appendChild(cardEl);
        });
    } else if (room.gamePhase === 'hand_end' && me && room.shownHands && room.shownHands[me.id]) {
        // I folded but chose to show — render my revealed cards
        room.shownHands[me.id].forEach(card => {
            const cardEl = createPokerCard(card);
            cardEl.classList.add('reveal-flip');
            handEl.appendChild(cardEl);
        });
    }

    // Show dealer button indicator for me
    if (me && me.seat === room.dealerSeat) {
        document.getElementById('poker-my-name').innerHTML = me.name + ' <span class="dealer-btn-inline">D</span>';
    }
}

// ============== Actions / Betting ==============

function renderPokerActions(room, me, isMyTurn) {
    const actionsEl = document.getElementById('poker-actions');
    actionsEl.innerHTML = '';

    // Post-hand: show "Show Hand" button for folded local player
    if (room.gamePhase === 'hand_end' && me) {
        const myId = gameState.playerId;
        const iFolded = room.foldedPlayerIds && room.foldedPlayerIds.includes(myId);
        const alreadyShown = room.shownHands && room.shownHands[myId];
        if (iFolded && !alreadyShown) {
            const showBtn = document.createElement('button');
            showBtn.className = 'poker-action-btn show-hand-btn';
            showBtn.textContent = 'Show Hand';
            showBtn.onclick = () => {
                socket.emit('poker_show_hand', {
                    code: gameState.roomCode,
                    playerId: myId,
                });
                showBtn.disabled = true;
                showBtn.textContent = 'Shown';
            };
            actionsEl.appendChild(showBtn);
        }
        return;
    }

    if (!isMyTurn || !me || me.isFolded || me.isAllIn) {
        if (!isMyTurn && me && !me.isFolded && !me.isAllIn && room.gamePhase !== 'hand_end') {
            actionsEl.innerHTML = '<div class="poker-wait-msg">Waiting for other players...</div>';
        }
        return;
    }

    const canCheck = me.currentBet >= room.currentBet;
    const callAmount = room.currentBet - me.currentBet;
    const minRaise = room.currentBet + room.bigBlind;
    const maxBet = me.stack + me.currentBet;
    const chipsAfterCall = me.stack - Math.max(0, callAmount);
    const raiseAction = room.currentBet > 0 ? 'raise' : 'bet';

    // Row 1: Fold + Check/Call
    const row1 = document.createElement('div');
    row1.className = 'action-row';

    const foldBtn = document.createElement('button');
    foldBtn.className = 'poker-action-btn fold-btn';
    foldBtn.textContent = 'Fold';
    foldBtn.onclick = () => pokerAction('fold');
    row1.appendChild(foldBtn);

    if (canCheck) {
        const checkBtn = document.createElement('button');
        checkBtn.className = 'poker-action-btn check-btn';
        checkBtn.textContent = 'Check';
        checkBtn.onclick = () => pokerAction('check');
        row1.appendChild(checkBtn);
    } else {
        const callBtn = document.createElement('button');
        callBtn.className = 'poker-action-btn call-btn';
        const actualCall = Math.min(callAmount, me.stack);
        callBtn.textContent = actualCall >= me.stack ? `All In $${me.stack}` : `Call $${actualCall}`;
        callBtn.onclick = () => pokerAction('call');
        row1.appendChild(callBtn);
    }

    actionsEl.appendChild(row1);

    // Row 2: Raise/Bet with slider and presets
    if (chipsAfterCall > 0 && minRaise <= maxBet) {
        const raiseWrap = document.createElement('div');
        raiseWrap.className = 'raise-controls';

        // Preset buttons (1/4 pot, 1/2 pot, pot, all-in)
        const presets = document.createElement('div');
        presets.className = 'raise-presets';

        const pot = room.pot;
        const presetValues = [
            { label: '1/4', amount: Math.max(minRaise, Math.floor(pot * 0.25) + room.currentBet) },
            { label: '1/2', amount: Math.max(minRaise, Math.floor(pot * 0.5) + room.currentBet) },
            { label: 'Pot', amount: Math.max(minRaise, pot + room.currentBet) },
            { label: 'All In', amount: maxBet },
        ];

        presetValues.forEach(pv => {
            const amt = Math.min(pv.amount, maxBet);
            if (amt < minRaise && pv.label !== 'All In') return;
            const btn = document.createElement('button');
            btn.className = 'preset-btn';
            btn.textContent = pv.label;
            btn.onclick = () => _setRaiseAmount(amt, minRaise, maxBet);
            presets.appendChild(btn);
        });

        raiseWrap.appendChild(presets);

        // Slider
        const sliderRow = document.createElement('div');
        sliderRow.className = 'slider-row';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'raise-slider';
        slider.min = minRaise;
        slider.max = maxBet;
        slider.value = pokerState.raiseAmount >= minRaise ? Math.min(pokerState.raiseAmount, maxBet) : minRaise;
        slider.step = room.bigBlind;

        const amountInput = document.createElement('input');
        amountInput.type = 'number';
        amountInput.className = 'raise-input';
        amountInput.min = minRaise;
        amountInput.max = maxBet;
        amountInput.value = slider.value;
        amountInput.step = room.bigBlind;

        pokerState.raiseAmount = parseInt(slider.value);

        slider.oninput = () => {
            amountInput.value = slider.value;
            pokerState.raiseAmount = parseInt(slider.value);
        };
        amountInput.oninput = () => {
            let v = parseInt(amountInput.value) || minRaise;
            v = Math.max(minRaise, Math.min(v, maxBet));
            slider.value = v;
            pokerState.raiseAmount = v;
        };

        sliderRow.appendChild(slider);
        sliderRow.appendChild(amountInput);
        raiseWrap.appendChild(sliderRow);

        // Raise button
        const raiseBtn = document.createElement('button');
        raiseBtn.className = 'poker-action-btn raise-submit-btn';
        raiseBtn.textContent = `${raiseAction === 'raise' ? 'Raise' : 'Bet'} $${pokerState.raiseAmount}`;
        raiseBtn.onclick = () => pokerAction(raiseAction, pokerState.raiseAmount);

        // Update label when slider changes
        slider.addEventListener('input', () => {
            raiseBtn.textContent = `${raiseAction === 'raise' ? 'Raise' : 'Bet'} $${pokerState.raiseAmount}`;
        });
        amountInput.addEventListener('input', () => {
            raiseBtn.textContent = `${raiseAction === 'raise' ? 'Raise' : 'Bet'} $${pokerState.raiseAmount}`;
        });

        raiseWrap.appendChild(raiseBtn);
        actionsEl.appendChild(raiseWrap);
    }
}

function _setRaiseAmount(amount, min, max) {
    const clamped = Math.max(min, Math.min(amount, max));
    pokerState.raiseAmount = clamped;
    const slider = document.querySelector('.raise-slider');
    const input = document.querySelector('.raise-input');
    const btn = document.querySelector('.raise-submit-btn');
    if (slider) slider.value = clamped;
    if (input) input.value = clamped;
    if (btn) btn.textContent = btn.textContent.replace(/\$\d+/, '$' + clamped);
}

// ============== Actions ==============

function pokerAction(action, amount) {
    if (!socket || !gameState.roomCode) return;
    socket.emit('poker_action', {
        code: gameState.roomCode,
        playerId: gameState.playerId,
        action: action,
        amount: amount || 0,
    });
}

async function pokerBuyIn() {
    const result = await BankrollService.tryBuyIn();
    if (!result.success) {
        showToast(result.message);
        return;
    }

    socket.emit('poker_buy_in', {
        code: gameState.roomCode,
        playerId: gameState.playerId,
        amount: result.amount,
    });

    updateBankrollDisplay();
}

function pokerAddBot(difficulty) {
    if (!socket || !gameState.roomCode) return;
    socket.emit('poker_add_bot', {
        code: gameState.roomCode,
        playerId: gameState.playerId,
        difficulty: difficulty || 'normal',
    });
}

function pokerLeaveGame() {
    const isHost = gameState.playerId === (pokerState.room && pokerState.room.hostId);
    const message = isHost
        ? 'As the host, leaving will end the game for everyone. Are you sure?'
        : 'Are you sure you want to leave?';

    const content = `
        <h2>Leave Poker?</h2>
        <p>${message}</p>
        <div class="modal-buttons">
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn-primary" onclick="confirmPokerLeave()">Leave</button>
        </div>
    `;
    openModal(content);
}

async function confirmPokerLeave() {
    closeModal();
    _clearTimers();

    // Return stack to wallet before leaving
    if (pokerState.room) {
        const me = pokerState.room.players.find(p => p.id === gameState.playerId);
        if (me && me.stack > 0) {
            await BankrollService.returnStack(me.stack);
        }
    }
    _clearPendingReturn();

    if (gameState.roomCode) {
        socket.emit('leave_game', {
            code: gameState.roomCode,
            playerId: gameState.playerId,
        });
    }
    clearSession();
    pokerState.room = null;
    gameState.roomCode = null;
    gameState.room = null;
    showScreen('poker-home-screen');
    updateBankrollDisplay();
}

// ============== Kick Player ==============

function pokerKickPlayer(targetPlayerId, isBot) {
    if (isBot) {
        socket.emit('poker_kick_player', {
            code: gameState.roomCode,
            playerId: gameState.playerId,
            targetPlayerId: targetPlayerId,
        });
    } else {
        const target = pokerState.room && pokerState.room.players.find(p => p.id === targetPlayerId);
        const name = target ? target.name : 'this player';
        openModal(`
            <h2>Remove Player?</h2>
            <p>Remove <strong>${name}</strong> from the room? Their chips will be returned.</p>
            <div class="modal-buttons">
                <button class="btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="btn-primary btn-danger" onclick="confirmPokerKick('${targetPlayerId}')">Remove</button>
            </div>
        `);
    }
}

function confirmPokerKick(targetPlayerId) {
    closeModal();
    socket.emit('poker_kick_player', {
        code: gameState.roomCode,
        playerId: gameState.playerId,
        targetPlayerId: targetPlayerId,
    });
}

// ============== Bankroll Display ==============

function updateBankrollDisplay() {
    const state = BankrollService.getState();
    const el = document.getElementById('poker-bankroll-info');
    if (!el) return;

    el.innerHTML = `
        <div class="bankroll-wallet">Wallet: $${state.walletBalance}</div>
        <div class="bankroll-reset">Weekly min: $${state.weeklyMinimum} (${BankrollService.formatDate(state.nextResetDate)})</div>
        <button class="btn-primary poker-buyin-btn" onclick="pokerBuyIn()" ${state.canBuyIn ? '' : 'disabled'}>
            Buy In: $${state.buyInAmount}
        </button>
        ${!state.canBuyIn ? '<div class="bankroll-exhausted">Not enough chips to buy in</div>' : ''}
    `;
}

// ============== Card Rendering ==============

function createPokerCard(card) {
    const elem = document.createElement('div');
    elem.className = `poker-card ${card.suit}`;
    elem.innerHTML = `
        <div class="poker-card-corner">${card.display}</div>
        <div class="poker-card-center">${SUIT_SYMBOLS[card.suit] || ''}</div>
        <div class="poker-card-corner bottom">${card.display}</div>
    `;
    return elem;
}

function copyPokerRoomCode() {
    navigator.clipboard.writeText(gameState.roomCode).then(() => {
        showToast('Room code copied!');
    });
}

// ============== Chip Animations ==============

function _findSeatForPlayer(playerId) {
    if (!pokerState.room) return null;

    // If it's me, use the bottom area
    if (playerId === gameState.playerId) {
        return document.querySelector('.poker-my-area');
    }

    // Find opponent seat by matching player order
    const room = pokerState.room;
    const myIdx = room.players.findIndex(p => p.id === gameState.playerId);
    const total = room.players.length;
    const seats = document.querySelectorAll('.poker-seat');

    for (let i = 1; i < total; i++) {
        const idx = (myIdx + i) % total;
        if (room.players[idx] && room.players[idx].id === playerId) {
            return seats[i - 1] || null;
        }
    }
    return null;
}

function animateChipToPot(seatElement) {
    const felt = document.querySelector('.poker-felt');
    const potCenter = document.getElementById('poker-pot-center');
    if (!felt || !potCenter) return;

    const feltRect = felt.getBoundingClientRect();
    const seatRect = seatElement.getBoundingClientRect();
    const potRect = potCenter.getBoundingClientRect();

    const startX = seatRect.left + seatRect.width / 2 - feltRect.left - 10;
    const startY = seatRect.top + seatRect.height / 2 - feltRect.top - 10;
    const endX = potRect.left + potRect.width / 2 - feltRect.left - 10;
    const endY = potRect.top + potRect.height / 2 - feltRect.top - 10;

    const chip = document.createElement('div');
    chip.className = 'chip-anim chip-to-pot';
    chip.textContent = '$';
    chip.style.setProperty('--start-x', startX + 'px');
    chip.style.setProperty('--start-y', startY + 'px');
    chip.style.setProperty('--end-x', endX + 'px');
    chip.style.setProperty('--end-y', endY + 'px');

    felt.appendChild(chip);
    chip.addEventListener('animationend', () => chip.remove());
}

function animateChipsToWinner(winnerSeatElement, chipCount) {
    const felt = document.querySelector('.poker-felt');
    const potCenter = document.getElementById('poker-pot-center');
    if (!felt || !potCenter) return;

    const feltRect = felt.getBoundingClientRect();
    const potRect = potCenter.getBoundingClientRect();
    const seatRect = winnerSeatElement.getBoundingClientRect();

    const startX = potRect.left + potRect.width / 2 - feltRect.left - 10;
    const startY = potRect.top + potRect.height / 2 - feltRect.top - 10;
    const endX = seatRect.left + seatRect.width / 2 - feltRect.left - 10;
    const endY = seatRect.top + seatRect.height / 2 - feltRect.top - 10;

    for (let i = 0; i < chipCount; i++) {
        setTimeout(() => {
            const chip = document.createElement('div');
            chip.className = 'chip-anim chip-to-winner';
            chip.textContent = '$';
            const jX = (Math.random() - 0.5) * 16;
            const jY = (Math.random() - 0.5) * 16;
            chip.style.setProperty('--start-x', (startX + jX) + 'px');
            chip.style.setProperty('--start-y', (startY + jY) + 'px');
            chip.style.setProperty('--end-x', endX + 'px');
            chip.style.setProperty('--end-y', endY + 'px');

            felt.appendChild(chip);
            chip.addEventListener('animationend', () => chip.remove());
        }, i * 100);
    }
}

// ============== Reveal Animations ==============

/**
 * Animate the card flip at a player's seat when they show their hand.
 * Finds the seat, replaces face-down cards with face-up + flip animation + glow.
 */
function _animateSeatReveal(playerId, cards) {
    const seatEl = _findSeatForPlayer(playerId);
    if (!seatEl) return;

    // Add glow pulse to the seat
    seatEl.classList.add('seat-reveal-glow');
    setTimeout(() => seatEl.classList.remove('seat-reveal-glow'), 2000);

    // Find or create the seat-cards container
    let cardsContainer;
    if (playerId === gameState.playerId) {
        // My area — update poker-my-hand
        cardsContainer = document.getElementById('poker-my-hand');
    } else {
        cardsContainer = seatEl.querySelector('.seat-cards');
    }
    if (!cardsContainer || !cards || !cards.length) return;

    if (playerId === gameState.playerId) {
        // Render full poker cards for self
        cardsContainer.innerHTML = '';
        cards.forEach(c => {
            const cardEl = createPokerCard(c);
            cardEl.classList.add('reveal-flip-card');
            cardsContainer.appendChild(cardEl);
        });
    } else {
        // Render mini-cards for opponents
        cardsContainer.innerHTML = cards.map(c =>
            `<span class="mini-card ${c.suit} reveal-flip-card">${c.display}</span>`
        ).join('');
    }

    // Add "Shown" label
    const existing = seatEl.querySelector('.seat-status');
    if (existing && playerId !== gameState.playerId) {
        existing.textContent = 'SHOWN';
        existing.classList.add('seat-shown');
    }
}

/**
 * Queue a spotlight banner showing the revealed hand.
 * Banners play sequentially so multiple reveals don't overlap.
 */
const _revealQueue = [];
let _revealPlaying = false;

function _queueRevealSpotlight(playerName, cards) {
    _revealQueue.push({ playerName, cards });
    if (!_revealPlaying) _playNextSpotlight();
}

function _playNextSpotlight() {
    if (!_revealQueue.length) {
        _revealPlaying = false;
        return;
    }
    _revealPlaying = true;
    const { playerName, cards } = _revealQueue.shift();

    const container = document.getElementById('reveal-spotlight');
    if (!container) {
        _revealPlaying = false;
        return;
    }

    const cardsHtml = cards.map(c =>
        `<span class="mini-card ${c.suit}">${c.display}</span>`
    ).join(' ');

    const banner = document.createElement('div');
    banner.className = 'spotlight-banner';
    banner.innerHTML = `
        <span class="spotlight-name">${playerName}</span>
        <span class="spotlight-label">showed</span>
        <span class="spotlight-cards">${cardsHtml}</span>
    `;
    container.appendChild(banner);

    // Force reflow then add active class for animation
    banner.offsetHeight;
    banner.classList.add('spotlight-active');

    // Fade out after 2s, then remove and play next
    setTimeout(() => {
        banner.classList.remove('spotlight-active');
        banner.classList.add('spotlight-exit');
        setTimeout(() => {
            banner.remove();
            _playNextSpotlight();
        }, 400);
    }, 2000);
}
