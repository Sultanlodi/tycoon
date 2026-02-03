/**
 * Shared utilities for all game pages.
 * Provides: state, session, socket init, UI helpers, card constants.
 */

// ============== State ==============
let socket = null;
let gameState = {
    playerId: null,
    playerName: 'Player',
    roomCode: null,
    isHost: false,
    room: null,
    selectedGame: null,
};

// ============== Constants ==============
const SUIT_SYMBOLS = {
    hearts: '\u2665',
    diamonds: '\u2666',
    clubs: '\u2663',
    spades: '\u2660',
};

const VALUE_DISPLAY = {
    3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: 'Joker'
};

// ============== Session Storage ==============
function saveSession() {
    if (gameState.roomCode && gameState.playerId) {
        localStorage.setItem('tycoon_session', JSON.stringify({
            roomCode: gameState.roomCode,
            playerId: gameState.playerId,
            playerName: gameState.playerName,
            isHost: gameState.isHost,
            selectedGame: gameState.selectedGame,
        }));
    }
}

function loadSession() {
    const saved = localStorage.getItem('tycoon_session');
    if (saved) {
        try { return JSON.parse(saved); } catch (e) { return null; }
    }
    return null;
}

function clearSession() {
    localStorage.removeItem('tycoon_session');
}

// ============== Screen Navigation ==============
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(screenId);
    if (el) el.classList.add('active');
}

// ============== UI Helpers ==============
function showToast(message, duration = 3000) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), duration);
}

function openModal(content) {
    document.getElementById('modal-content').innerHTML = content;
    document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
}

// ============== Shared Initialization ==============
function initShared() {
    const savedSession = loadSession();
    if (savedSession && savedSession.playerId) {
        gameState.playerId = savedSession.playerId;
        gameState.playerName = savedSession.playerName || 'Player';
    } else {
        gameState.playerId = 'player-' + Math.random().toString(36).substr(2, 9);
    }

    // Sync player name with localStorage
    const storedName = localStorage.getItem('player_name');
    if (storedName) {
        gameState.playerName = storedName;
    }

    // Populate name input if present
    const nameInput = document.getElementById('player-name');
    if (nameInput) {
        nameInput.value = gameState.playerName;
        nameInput.addEventListener('input', (e) => {
            gameState.playerName = e.target.value || 'Player';
            localStorage.setItem('player_name', gameState.playerName);
        });
    }
}

/**
 * Connect to the socket server.
 * @param {Function} registerEvents - callback to register game-specific socket events
 */
function connectSocket(registerEvents) {
    socket = io(window.location.origin);

    socket.on('connect', () => {
        console.log('Connected to server');

        // Register game-specific events
        if (registerEvents) registerEvents();

        // Try to rejoin if we have a saved session for THIS game
        const savedSession = loadSession();
        if (savedSession && savedSession.roomCode && savedSession.selectedGame === gameState.selectedGame) {
            console.log('Attempting to rejoin room:', savedSession.roomCode);
            socket.emit('join_room', {
                code: savedSession.roomCode,
                playerName: savedSession.playerName,
                playerId: savedSession.playerId,
                gameType: gameState.selectedGame,
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showToast('Connection lost. Reconnecting...');
    });

    socket.on('error', (data) => {
        showToast(data.message);
        if (data.message === 'Room not found' || data.message === 'You were replaced by a bot') {
            clearSession();
            window.location.href = '/';
        }
    });

    socket.on('session_ended', (data) => {
        clearSession();
        showToast(data.reason || 'Session ended');
        window.location.href = '/';
    });
}

function goToPicker() {
    if (gameState.roomCode && socket) {
        socket.emit('leave_game', {
            code: gameState.roomCode,
            playerId: gameState.playerId,
        });
    }
    clearSession();
    window.location.href = '/';
}
