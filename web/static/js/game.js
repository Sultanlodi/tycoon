/**
 * Tycoon Game Client
 * ==================
 * Handles all Tycoon-specific UI and socket events.
 * Uses shared.js for: socket, gameState, session, showScreen, showToast, openModal, closeModal, goToPicker.
 */

// ============== Tycoon-specific state ==============
gameState.selectedCards = [];
gameState.isMyTurn = false;
gameState.difficulty = 'medium';

// ============== Initialization ==============
document.addEventListener('DOMContentLoaded', () => {
    gameState.selectedGame = 'tycoon';
    initShared();
    initAuth();

    // Setup difficulty buttons
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gameState.difficulty = btn.dataset.diff;
        });
    });

    connectSocket(registerTycoonEvents);
});

// ============== Socket Events ==============
function registerTycoonEvents() {
    socket.on('room_created', (data) => {
        gameState.roomCode = data.code;
        gameState.isHost = true;
        gameState.room = data.room;
        saveSession();
        showScreen('waiting-screen');
        updateWaitingRoom();
    });

    socket.on('room_joined', (data) => {
        gameState.roomCode = data.code;
        gameState.room = data.room;
        gameState.isHost = false;
        saveSession();
        showScreen('waiting-screen');
        updateWaitingRoom();
    });

    socket.on('player_joined', (data) => {
        if (gameState.room) {
            gameState.room.players.push(data.player);
            updateWaitingRoom();
        }
    });

    socket.on('player_left', (data) => {
        if (gameState.room) {
            gameState.room.players = gameState.room.players.filter(p => p.id !== data.playerId);
            updateWaitingRoom();
        }
    });

    socket.on('game_started', (data) => {
        gameState.room = data.room;
        showScreen('game-screen');
        updateGameBoard();
    });

    socket.on('game_update', (data) => {
        gameState.room = data.room;
        updateGameBoard();

        if (data.room.gamePhase === 'round_end') {
            showRoundEnd();
        } else if (data.room.gamePhase === 'game_end') {
            showGameEnd();
        }
    });

    socket.on('eight_played', () => showCutscene('eight-cutscene'));
    socket.on('revolution_triggered', () => showCutscene('revolution-cutscene'));
    socket.on('joker_countered', () => showCutscene('counter-cutscene'));

    socket.on('select_cards_to_give', (data) => showCardSelectionScreen(data));
    socket.on('card_exchange', (data) => showCardExchange(data));

    socket.on('tycoon_demoted', (data) => {
        document.getElementById('demoted-name').textContent = data.tycoonName;
        showCutscene('demotion-cutscene');
    });

    socket.on('rejoined_game', (data) => {
        gameState.roomCode = data.code;
        gameState.room = data.room;
        saveSession();
        showToast('Reconnected to game!');

        if (data.room.gamePhase === 'round_end') {
            showScreen('round-end-screen');
            showRoundEnd();
        } else if (data.room.gamePhase === 'game_end') {
            showScreen('game-end-screen');
            showGameEnd();
        } else {
            showScreen('game-screen');
            updateGameBoard();
        }
    });

    socket.on('player_disconnected', (data) => showToast(`${data.playerName} disconnected`));
    socket.on('player_reconnected', (data) => showToast(`${data.playerName} reconnected`));

    socket.on('player_replaced', (data) => {
        showToast(`${data.playerName} was replaced by bot`);
        if (gameState.room) updateGameBoard();
    });
}

// ============== Home Screen Actions ==============
function playOffline() {
    gameState.playerName = document.getElementById('player-name').value || 'Player';
    createRoom();
    setTimeout(() => {
        if (gameState.roomCode) startGame();
    }, 500);
}

function showCreateModal() {
    const content = `
        <h2>Create Room</h2>
        <p>A room code will be generated for your friends to join. Empty slots will be filled with bots.</p>
        <div class="modal-buttons">
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn-primary" onclick="createRoom(); closeModal();">Create</button>
        </div>
    `;
    openModal(content);
}

function showJoinModal() {
    const content = `
        <h2>Join Room</h2>
        <input type="text" id="join-code-input" placeholder="ABCD12" maxlength="6" oninput="this.value = this.value.toUpperCase()">
        <div class="modal-buttons">
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn-primary" onclick="joinRoom()">Join</button>
        </div>
    `;
    openModal(content);
    setTimeout(() => document.getElementById('join-code-input').focus(), 100);
}

function showRules() {
    document.getElementById('rules-modal').classList.add('active');
}

function closeRulesModal() {
    document.getElementById('rules-modal').classList.remove('active');
}

// ============== Room Actions ==============
function createRoom() {
    gameState.playerName = document.getElementById('player-name').value || 'Player';
    socket.emit('create_room', {
        playerName: gameState.playerName,
        playerId: gameState.playerId,
        difficulty: gameState.difficulty,
        gameType: 'tycoon',
    });
}

function joinRoom() {
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
        gameType: 'tycoon',
    });
    closeModal();
}

function leaveRoom() {
    if (gameState.roomCode) {
        socket.emit('leave_game', {
            code: gameState.roomCode,
            playerId: gameState.playerId,
        });
    }
    goHome();
}

function goHome() {
    clearSession();
    gameState.roomCode = null;
    gameState.room = null;
    gameState.selectedCards = [];
    showScreen('home-screen');
}

function copyRoomCode() {
    navigator.clipboard.writeText(gameState.roomCode).then(() => {
        showToast('Room code copied!');
    });
}

function startGame() {
    socket.emit('start_game', {
        code: gameState.roomCode,
        playerId: gameState.playerId,
    });
}

function updateWaitingRoom() {
    document.getElementById('room-code-display').textContent = gameState.roomCode;

    const startBtn = document.getElementById('start-game-btn');
    startBtn.style.display = gameState.isHost ? 'block' : 'none';

    const container = document.getElementById('waiting-players');
    container.innerHTML = '';

    const players = gameState.room?.players || [];
    for (let i = 0; i < 4; i++) {
        const slot = document.createElement('div');
        slot.className = 'player-slot';

        if (players[i]) {
            slot.classList.add('filled');
            slot.textContent = players[i].name;
            if (players[i].id === gameState.room.hostId) {
                slot.classList.add('host');
            }
        } else {
            slot.classList.add('empty');
            slot.textContent = 'Waiting...';
        }

        container.appendChild(slot);
    }
}

// ============== Game Board ==============
function updateGameBoard() {
    if (!gameState.room) return;

    const room = gameState.room;
    document.getElementById('round-number').textContent = room.currentRound;

    const revBanner = document.getElementById('revolution-banner');
    revBanner.style.display = room.isRevolution ? 'block' : 'none';

    const myPlayer = room.players.find(p => p.id === gameState.playerId);
    const mySeatIndex = myPlayer ? room.players.indexOf(myPlayer) : 0;

    updateOpponents(room, mySeatIndex);
    updatePile(room.currentPile);
    updateTurnIndicator(room);
    updateHand(myPlayer);
    updateActionButtons(room);
}

function updateOpponents(room, mySeatIndex) {
    const players = room.players;

    for (let i = 0; i < 3; i++) {
        const opponentIndex = (mySeatIndex + 1 + i) % 4;
        const opponent = players[opponentIndex];
        const elem = document.getElementById(`player-${i + 1}`);

        if (opponent) {
            elem.querySelector('.opponent-name').textContent = opponent.name;
            elem.querySelector('.opponent-cards').textContent = opponent.hasFinished
                ? 'Finished!' : `${opponent.handCount} cards`;

            const rankElem = elem.querySelector('.opponent-rank');
            if (opponent.rank && opponent.rank !== 'none') {
                rankElem.textContent = opponent.rank.charAt(0).toUpperCase() + opponent.rank.slice(1);
                rankElem.className = 'opponent-rank ' + opponent.rank;
            } else {
                rankElem.textContent = '';
            }

            elem.classList.toggle('current-turn', opponentIndex === room.currentPlayerIndex);
            elem.classList.toggle('finished', opponent.hasFinished);
        }
    }
}

function updatePile(pile) {
    const container = document.getElementById('current-pile');
    container.innerHTML = '';
    if (!pile || pile.length === 0) return;
    pile.forEach(card => container.appendChild(createCardElement(card, false, false)));
}

function updateTurnIndicator(room) {
    const indicator = document.getElementById('turn-indicator');
    const currentPlayer = room.players[room.currentPlayerIndex];

    if (!currentPlayer) { indicator.textContent = ''; return; }

    if (currentPlayer.id === gameState.playerId) {
        indicator.textContent = 'Your turn!';
        gameState.isMyTurn = true;
    } else {
        indicator.textContent = `${currentPlayer.name}'s turn`;
        gameState.isMyTurn = false;
    }
}

function updateHand(player) {
    const container = document.getElementById('player-hand');
    container.innerHTML = '';
    gameState.selectedCards = [];
    if (!player || !player.hand) return;

    player.hand.forEach(card => {
        const elem = createCardElement(card, true, !gameState.isMyTurn);
        elem.addEventListener('click', () => toggleCardSelection(card, elem));
        container.appendChild(elem);
    });
}

function createCardElement(card, clickable = false, disabled = false) {
    const elem = document.createElement('div');
    elem.className = `card ${card.suit}`;
    if (disabled) elem.classList.add('disabled');

    const value = VALUE_DISPLAY[card.value];
    const suit = card.suit === 'joker' ? '' : SUIT_SYMBOLS[card.suit];

    if (card.suit === 'joker') {
        elem.innerHTML = `
            <div class="corner">${value}</div>
            <div class="center">JOKER</div>
            <div class="corner bottom">${value}</div>
        `;
    } else {
        elem.innerHTML = `
            <div class="corner">${value}${suit}</div>
            <div class="center">${suit}</div>
            <div class="corner bottom">${value}${suit}</div>
        `;
    }

    elem.dataset.cardId = card.id;
    return elem;
}

function toggleCardSelection(card, elem) {
    if (!gameState.isMyTurn) return;

    const index = gameState.selectedCards.findIndex(c => c.id === card.id);

    if (index >= 0) {
        gameState.selectedCards.splice(index, 1);
        elem.classList.remove('selected');
    } else {
        if (gameState.selectedCards.length > 0) {
            const selectedValue = getEffectiveValue(gameState.selectedCards);
            if (card.value !== 16 && selectedValue !== 16 && card.value !== selectedValue) {
                document.querySelectorAll('.hand .card.selected').forEach(c => c.classList.remove('selected'));
                gameState.selectedCards = [];
            }
        }
        gameState.selectedCards.push(card);
        elem.classList.add('selected');
    }

    updateActionButtons(gameState.room);
}

function getEffectiveValue(cards) {
    const nonJokers = cards.filter(c => c.value !== 16);
    if (nonJokers.length === 0) return 16;
    return nonJokers[0].value;
}

function updateActionButtons(room) {
    const passBtn = document.getElementById('pass-btn');
    const playBtn = document.getElementById('play-btn');

    const isMyTurn = gameState.isMyTurn && room.gamePhase === 'playing';
    const hasSelection = gameState.selectedCards.length > 0;

    passBtn.disabled = !isMyTurn;
    playBtn.disabled = !isMyTurn || !hasSelection;
}

// ============== Game Actions ==============
function playCards() {
    if (gameState.selectedCards.length === 0) return;
    socket.emit('play_cards', {
        code: gameState.roomCode,
        playerId: gameState.playerId,
        cardIds: gameState.selectedCards.map(c => c.id),
    });
    gameState.selectedCards = [];
}

function passTurn() {
    socket.emit('pass_turn', {
        code: gameState.roomCode,
        playerId: gameState.playerId,
    });
}

function leaveGame() {
    const isHost = gameState.isHost;
    const message = isHost
        ? 'As the host, leaving will end the game for everyone. Are you sure?'
        : 'Are you sure you want to leave? You will be replaced by a bot.';

    openModal(`
        <h2>Leave Game?</h2>
        <p>${message}</p>
        <div class="modal-buttons">
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn-primary" onclick="confirmLeaveGame()">Leave</button>
        </div>
    `);
}

function confirmLeaveGame() {
    closeModal();
    if (gameState.roomCode) {
        socket.emit('leave_game', {
            code: gameState.roomCode,
            playerId: gameState.playerId,
        });
    }
    clearSession();
    gameState.roomCode = null;
    gameState.room = null;
    gameState.selectedCards = [];
    showScreen('home-screen');
}

// ============== Round/Game End ==============
function showRoundEnd() {
    showScreen('round-end-screen');
    document.getElementById('round-end-number').textContent = gameState.room.currentRound;
    renderRankings('rankings');
}

function showGameEnd() {
    showScreen('game-end-screen');
    renderRankings('final-rankings', true);
}

function renderRankings(containerId, showTotal = false) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    const players = [...gameState.room.players].sort((a, b) => {
        if (showTotal) return b.points - a.points;
        return (a.finishOrder || 999) - (b.finishOrder || 999);
    });

    players.forEach(player => {
        const item = document.createElement('div');
        item.className = `rank-item ${player.rank || ''}`;
        const rankLabel = player.rank
            ? player.rank.charAt(0).toUpperCase() + player.rank.slice(1) : '';

        item.innerHTML = `
            <div>
                <div class="name">${player.name}${player.id === gameState.playerId ? ' (You)' : ''}</div>
                <div class="rank">${rankLabel}</div>
            </div>
            <div class="points">${player.points} pts</div>
        `;
        container.appendChild(item);
    });
}

function continueGame() {
    socket.emit('next_round', { code: gameState.roomCode });
    showScreen('game-screen');
}

function playAgain() { goHome(); }

// ============== Card Selection (Tycoon/Rich) ==============
let cardSelectionState = { requiredCount: 0, selectedCards: [], hand: [] };

function showCardSelectionScreen(data) {
    cardSelectionState.requiredCount = data.requiredCount;
    cardSelectionState.selectedCards = [];
    cardSelectionState.hand = data.hand;

    const screen = document.getElementById('card-select-screen');
    const info = document.getElementById('card-select-info');
    const handContainer = document.getElementById('card-select-hand');
    const selectedContainer = document.getElementById('card-select-selected');
    const confirmBtn = document.getElementById('card-select-confirm');

    if (data.rank === 'tycoon') {
        info.textContent = `You are TYCOON - Select ${data.requiredCount} cards to give to Beggar`;
    } else {
        info.textContent = `You are RICH - Select ${data.requiredCount} card to give to Poor`;
    }

    handContainer.innerHTML = '';
    data.hand.forEach(card => {
        const elem = createCardElement(card, true, false);
        elem.addEventListener('click', () => toggleCardForGiving(card, elem));
        handContainer.appendChild(elem);
    });

    selectedContainer.innerHTML = '';
    confirmBtn.disabled = true;
    screen.classList.add('active');
}

function toggleCardForGiving(card, elem) {
    const index = cardSelectionState.selectedCards.findIndex(c => c.id === card.id);

    if (index >= 0) {
        cardSelectionState.selectedCards.splice(index, 1);
        elem.classList.remove('selected-to-give');
    } else {
        if (cardSelectionState.selectedCards.length < cardSelectionState.requiredCount) {
            cardSelectionState.selectedCards.push(card);
            elem.classList.add('selected-to-give');
        }
    }

    const selectedContainer = document.getElementById('card-select-selected');
    selectedContainer.innerHTML = '';
    cardSelectionState.selectedCards.forEach(c => {
        selectedContainer.appendChild(createCardElement(c, false, false));
    });

    document.getElementById('card-select-confirm').disabled =
        cardSelectionState.selectedCards.length !== cardSelectionState.requiredCount;
}

function confirmCardSelection() {
    socket.emit('submit_card_selection', {
        code: gameState.roomCode,
        playerId: gameState.playerId,
        cardIds: cardSelectionState.selectedCards.map(c => c.id),
    });
    document.getElementById('card-select-screen').classList.remove('active');
}

// ============== Card Exchange ==============
function createCardBack() {
    const elem = document.createElement('div');
    elem.className = 'card card-back';
    elem.innerHTML = '<div class="card-back-design"></div>';
    return elem;
}

function showCardExchange(data) {
    const screen = document.getElementById('exchange-screen');

    ['beggar-gives', 'tycoon-gives', 'poor-gives', 'rich-gives'].forEach(id => {
        const el = document.getElementById(id);
        el.innerHTML = '';
        const dataKey = {
            'beggar-gives': 'beggarGives', 'tycoon-gives': 'tycoonGives',
            'poor-gives': 'poorGives', 'rich-gives': 'richGives',
        }[id];
        if (data[dataKey]) {
            for (let i = 0; i < data[dataKey].length; i++) {
                el.appendChild(createCardBack());
            }
        }
    });

    screen.classList.add('active');
}

function acknowledgeExchange() {
    document.getElementById('exchange-screen').classList.remove('active');
    showScreen('game-screen');
}

// ============== Cutscene Animations ==============
function showCutscene(cutsceneId) {
    const cutscene = document.getElementById(cutsceneId);
    if (!cutscene) return;

    cutscene.style.display = 'flex';
    cutscene.style.animation = 'none';
    cutscene.offsetHeight;
    cutscene.style.animation = 'cutsceneFade 1.5s ease-out forwards';

    setTimeout(() => { cutscene.style.display = 'none'; }, 1500);
}
