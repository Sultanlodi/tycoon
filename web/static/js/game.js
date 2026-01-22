/**
 * Tycoon Card Game - Client JavaScript
 */

// ============== State ==============
let socket = null;
let gameState = {
    playerId: null,
    playerName: 'Player',
    roomCode: null,
    isHost: false,
    difficulty: 'medium',
    room: null,
    selectedCards: [],
    isMyTurn: false,
};

// ============== Constants ==============
const SUIT_SYMBOLS = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠',
};

const VALUE_DISPLAY = {
    3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: 'Joker'
};

// ============== Initialization ==============
document.addEventListener('DOMContentLoaded', () => {
    // Generate unique player ID
    gameState.playerId = 'player-' + Math.random().toString(36).substr(2, 9);

    // Setup difficulty buttons
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gameState.difficulty = btn.dataset.diff;
        });
    });

    // Connect to server
    connectSocket();
});

function connectSocket() {
    // Connect to the server
    const serverUrl = window.location.origin;
    socket = io(serverUrl);

    socket.on('connect', () => {
        console.log('Connected to server');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showToast('Connection lost. Reconnecting...');
    });

    socket.on('error', (data) => {
        showToast(data.message);
    });

    socket.on('room_created', (data) => {
        gameState.roomCode = data.code;
        gameState.isHost = true;
        gameState.room = data.room;
        showScreen('waiting-screen');
        updateWaitingRoom();
    });

    socket.on('room_joined', (data) => {
        gameState.roomCode = data.code;
        gameState.isHost = false;
        gameState.room = data.room;
        showScreen('waiting-screen');
        updateWaitingRoom();
    });

    socket.on('player_joined', (data) => {
        if (gameState.room) {
            gameState.room.players.push(data.player);
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

        // Check for phase changes
        if (data.room.gamePhase === 'round_end') {
            showRoundEnd();
        } else if (data.room.gamePhase === 'game_end') {
            showGameEnd();
        }
    });

    // Listen for special card events
    socket.on('eight_played', (data) => {
        showCutscene('eight-cutscene');
    });

    socket.on('revolution_triggered', (data) => {
        showCutscene('revolution-cutscene');
    });

    socket.on('joker_countered', (data) => {
        showCutscene('counter-cutscene');
    });

    // Listen for card exchange event
    socket.on('card_exchange', (data) => {
        showCardExchange(data);
    });

    // Listen for tycoon demotion event
    socket.on('tycoon_demoted', (data) => {
        document.getElementById('demoted-name').textContent = data.tycoonName;
        showCutscene('demotion-cutscene');
    });
}

// ============== Screen Navigation ==============
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function goHome() {
    gameState.roomCode = null;
    gameState.room = null;
    gameState.selectedCards = [];
    showScreen('home-screen');
}

// ============== Home Screen Actions ==============
function playOffline() {
    gameState.playerName = document.getElementById('player-name').value || 'Player';
    createRoom();
    // Auto-start after creating
    setTimeout(() => {
        if (gameState.roomCode) {
            startGame();
        }
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

function openModal(content) {
    document.getElementById('modal-content').innerHTML = content;
    document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
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
        difficulty: gameState.difficulty
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
        playerId: gameState.playerId
    });
    closeModal();
}

function leaveRoom() {
    // TODO: Emit leave event
    goHome();
}

function copyRoomCode() {
    navigator.clipboard.writeText(gameState.roomCode).then(() => {
        showToast('Room code copied!');
    });
}

function startGame() {
    socket.emit('start_game', {
        code: gameState.roomCode,
        playerId: gameState.playerId
    });
}

function updateWaitingRoom() {
    document.getElementById('room-code-display').textContent = gameState.roomCode;

    // Show/hide start button for host
    const startBtn = document.getElementById('start-game-btn');
    startBtn.style.display = gameState.isHost ? 'block' : 'none';

    // Update player slots
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

    // Update round number
    document.getElementById('round-number').textContent = room.currentRound;

    // Update revolution banner
    const revBanner = document.getElementById('revolution-banner');
    revBanner.style.display = room.isRevolution ? 'block' : 'none';

    // Find current player (me)
    const myPlayer = room.players.find(p => p.id === gameState.playerId);
    const mySeatIndex = myPlayer ? room.players.indexOf(myPlayer) : 0;

    // Update opponents
    updateOpponents(room, mySeatIndex);

    // Update center pile
    updatePile(room.currentPile);

    // Update turn indicator
    updateTurnIndicator(room);

    // Update my hand
    updateHand(myPlayer);

    // Update action buttons
    updateActionButtons(room);
}

function updateOpponents(room, mySeatIndex) {
    const positions = ['left', 'top', 'right'];
    const players = room.players;

    for (let i = 0; i < 3; i++) {
        const opponentIndex = (mySeatIndex + 1 + i) % 4;
        const opponent = players[opponentIndex];
        const elem = document.getElementById(`player-${i + 1}`);

        if (opponent) {
            elem.querySelector('.opponent-name').textContent = opponent.name;
            elem.querySelector('.opponent-cards').textContent = opponent.hasFinished
                ? 'Finished!'
                : `${opponent.handCount} cards`;

            // Show rank if any
            const rankElem = elem.querySelector('.opponent-rank');
            if (opponent.rank && opponent.rank !== 'none') {
                rankElem.textContent = opponent.rank.charAt(0).toUpperCase() + opponent.rank.slice(1);
                rankElem.className = 'opponent-rank ' + opponent.rank;
            } else {
                rankElem.textContent = '';
            }

            // Highlight current player
            elem.classList.toggle('current-turn', opponentIndex === room.currentPlayerIndex);
            elem.classList.toggle('finished', opponent.hasFinished);
        }
    }
}

function updatePile(pile) {
    const container = document.getElementById('current-pile');
    container.innerHTML = '';

    if (!pile || pile.length === 0) {
        return;
    }

    pile.forEach(card => {
        container.appendChild(createCardElement(card, false, false));
    });
}

function updateTurnIndicator(room) {
    const indicator = document.getElementById('turn-indicator');
    const currentPlayer = room.players[room.currentPlayerIndex];

    if (!currentPlayer) {
        indicator.textContent = '';
        return;
    }

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
        // Deselect
        gameState.selectedCards.splice(index, 1);
        elem.classList.remove('selected');
    } else {
        // Select - check if same value or joker
        if (gameState.selectedCards.length > 0) {
            const selectedValue = getEffectiveValue(gameState.selectedCards);
            if (card.value !== 16 && selectedValue !== 16 && card.value !== selectedValue) {
                // Different value, clear selection
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

    const cardIds = gameState.selectedCards.map(c => c.id);

    socket.emit('play_cards', {
        code: gameState.roomCode,
        playerId: gameState.playerId,
        cardIds: cardIds
    });

    gameState.selectedCards = [];
}

function passTurn() {
    socket.emit('pass_turn', {
        code: gameState.roomCode,
        playerId: gameState.playerId
    });
}

function leaveGame() {
    if (confirm('Are you sure you want to leave the game?')) {
        goHome();
    }
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
        if (showTotal) {
            return b.points - a.points;
        }
        return (a.finishOrder || 999) - (b.finishOrder || 999);
    });

    players.forEach(player => {
        const item = document.createElement('div');
        item.className = `rank-item ${player.rank || ''}`;

        const rankLabel = player.rank
            ? player.rank.charAt(0).toUpperCase() + player.rank.slice(1)
            : '';

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
    socket.emit('next_round', {
        code: gameState.roomCode
    });
    showScreen('game-screen');
}

function playAgain() {
    // Reset and start new game
    goHome();
}

// ============== Card Exchange ==============
function showCardExchange(data) {
    const screen = document.getElementById('exchange-screen');

    // Render beggar's cards (giving to tycoon)
    const beggarGives = document.getElementById('beggar-gives');
    beggarGives.innerHTML = '';
    if (data.beggarGives) {
        data.beggarGives.forEach(card => {
            beggarGives.appendChild(createCardElement(card, false, false));
        });
    }

    // Render tycoon's cards (giving to beggar)
    const tycoonGives = document.getElementById('tycoon-gives');
    tycoonGives.innerHTML = '';
    if (data.tycoonGives) {
        data.tycoonGives.forEach(card => {
            tycoonGives.appendChild(createCardElement(card, false, false));
        });
    }

    // Render poor's cards (giving to rich)
    const poorGives = document.getElementById('poor-gives');
    poorGives.innerHTML = '';
    if (data.poorGives) {
        data.poorGives.forEach(card => {
            poorGives.appendChild(createCardElement(card, false, false));
        });
    }

    // Render rich's cards (giving to poor)
    const richGives = document.getElementById('rich-gives');
    richGives.innerHTML = '';
    if (data.richGives) {
        data.richGives.forEach(card => {
            richGives.appendChild(createCardElement(card, false, false));
        });
    }

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

    // Remove and re-add to restart animation
    cutscene.style.animation = 'none';
    cutscene.offsetHeight; // Trigger reflow
    cutscene.style.animation = 'cutsceneFade 1.5s ease-out forwards';

    // Hide after animation completes
    setTimeout(() => {
        cutscene.style.display = 'none';
    }, 1500);
}

// ============== Utilities ==============
function showToast(message, duration = 3000) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), duration);
}
