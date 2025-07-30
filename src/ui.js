// Debug mode toggle
export let DEBUG = false;
export let operatorUIVisible = false;

// UI Elements
let operatorDiv, addMassBtn, escMenu, startMenu, deathMenu, deathStatsDiv, leaderboardDiv, coordsDiv, fpsDiv, modeBtn;

export function initUI(renderer) {
    // Operator UI (hidden by default)
    operatorDiv = document.createElement('div');
    operatorDiv.style.position = 'fixed';
    operatorDiv.style.top = '20px';
    operatorDiv.style.left = '20px';
    operatorDiv.style.zIndex = '5000';
    operatorDiv.style.background = 'rgba(30,30,40,0.97)';
    operatorDiv.style.border = '2px solid #0077ff';
    operatorDiv.style.borderRadius = '1em';
    operatorDiv.style.padding = '1.2em 1.5em 1.2em 1.5em';
    operatorDiv.style.boxShadow = '0 4px 24px rgba(0,0,0,0.25)';
    operatorDiv.style.display = 'none';
    operatorDiv.style.minWidth = '180px';
    operatorDiv.style.color = 'white';
    operatorDiv.style.fontFamily = 'sans-serif';
    operatorDiv.innerHTML = `<div style="font-size:1.2em;font-weight:bold;margin-bottom:0.7em;letter-spacing:0.04em;">Operator UI</div>`;

    addMassBtn = document.createElement('button');
    addMassBtn.textContent = '+ 100 mass';
    addMassBtn.style.fontSize = '1.1em';
    addMassBtn.style.padding = '0.5em 1.2em';
    addMassBtn.style.borderRadius = '0.5em';
    addMassBtn.style.border = 'none';
    addMassBtn.style.background = '#222';
    addMassBtn.style.color = 'white';
    addMassBtn.style.cursor = 'pointer';
    addMassBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    addMassBtn.style.marginBottom = '0.5em';
    operatorDiv.appendChild(addMassBtn);
    document.body.appendChild(operatorDiv);

    addMassBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('addMassRequest'));
    });

    // Keyboard shortcuts for debug and operator UI
    window.addEventListener('keydown', (event) => {
        if (event.key === 'x' || event.key === 'X') {
            DEBUG = !DEBUG;
            window.dispatchEvent(new CustomEvent('debugToggle', { detail: { debug: DEBUG } }));
            console.log('DEBUG mode:', DEBUG);
        }

        if (DEBUG && event.key === 'Shift' && event.code === 'ShiftRight') {
            operatorUIVisible = !operatorUIVisible;
            operatorDiv.style.display = operatorUIVisible ? '' : 'none';
            renderer.domElement.style.cursor = operatorUIVisible ? 'auto' : 'none';
            if (operatorUIVisible && document.pointerLockElement === renderer.domElement) {
                document.exitPointerLock();
            }
        }
    });

    // Escape menu overlay
    escMenu = document.createElement('div');
    escMenu.style.position = 'fixed';
    escMenu.style.top = '0';
    escMenu.style.left = '0';
    escMenu.style.width = '100vw';
    escMenu.style.height = '100vh';
    escMenu.style.background = 'rgba(0,0,0,0.7)';
    escMenu.style.display = 'none';
    escMenu.style.flexDirection = 'column';
    escMenu.style.justifyContent = 'center';
    escMenu.style.alignItems = 'center';
    escMenu.style.zIndex = '2000';
    escMenu.innerHTML = `
      <div style="background:#222;padding:2em 3em;border-radius:1em;box-shadow:0 0 30px #000;display:flex;flex-direction:column;align-items:center;">
        <h2 style="color:white;margin-bottom:1em;">Leave Game?</h2>
        <div style="display:flex;gap:2em;">
          <button id="escYesBtn" style="font-size:1.2em;padding:0.5em 2em;border-radius:0.5em;border:none;background:#ff4444;color:white;cursor:pointer;">Yes</button>
          <button id="escNoBtn" style="font-size:1.2em;padding:0.5em 2em;border-radius:0.5em;border:none;background:#0077ff;color:white;cursor:pointer;">No</button>
        </div>
      </div>
    `;
    document.body.appendChild(escMenu);
    const escYesBtn = escMenu.querySelector('#escYesBtn');
    const escNoBtn = escMenu.querySelector('#escNoBtn');
    escYesBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('returnToHome')));
    escNoBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('closeEscMenu')));


    // Start Menu Overlay
    startMenu = document.createElement('div');
    startMenu.style.position = 'fixed';
    startMenu.style.top = '0';
    startMenu.style.left = '0';
    startMenu.style.width = '100vw';
    startMenu.style.height = '100vh';
    startMenu.style.background = 'rgba(0,0,0,0.85)';
    startMenu.style.display = 'flex';
    startMenu.style.flexDirection = 'column';
    startMenu.style.justifyContent = 'center';
    startMenu.style.alignItems = 'center';
    startMenu.style.zIndex = '1000';
    startMenu.innerHTML = `
      <h1 style="color:white;font-size:3em;margin-bottom:1em;">Agar3D</h1>
      <input id="playerNameInput" type="text" placeholder="Enter your name (optional)" style="font-size:1.3em;padding:0.4em 1em;margin-bottom:1em;border-radius:0.5em;border:none;outline:none;width:300px;max-width:80vw;box-sizing:border-box;" />
      <button id="playBtn" style="font-size:2em;padding:0.5em 2em;border-radius:0.5em;border:none;background:#0077ff;color:white;cursor:pointer;">Play</button>
    `;
    document.body.appendChild(startMenu);
    const playerNameInput = startMenu.querySelector('#playerNameInput');
    const playBtn = startMenu.querySelector('#playBtn');
    playBtn.addEventListener('click', () => {
        const playerName = playerNameInput.value.trim();
        window.dispatchEvent(new CustomEvent('startGameRequest', { detail: { name: playerName } }));
    });

    // Death UI overlay
    deathMenu = document.createElement('div');
    deathMenu.style.position = 'fixed';
    deathMenu.style.top = '0';
    deathMenu.style.left = '0';
    deathMenu.style.width = '100vw';
    deathMenu.style.height = '100vh';
    deathMenu.style.background = 'rgba(0,0,0,0.85)';
    deathMenu.style.display = 'none';
    deathMenu.style.flexDirection = 'column';
    deathMenu.style.justifyContent = 'center';
    deathMenu.style.alignItems = 'center';
    deathMenu.style.zIndex = '3000';
    deathMenu.innerHTML = `
      <div style="background:#222;padding:2em 3em;border-radius:1em;box-shadow:0 0 30px #000;display:flex;flex-direction:column;align-items:center;min-width:320px;">
        <h2 style="color:white;margin-bottom:1em;">You Died!</h2>
        <div id="deathStats" style="color:white;font-size:1.2em;margin-bottom:1.5em;text-align:center;"></div>
        <div style="display:flex;gap:2em;">
          <button id="deathHomeBtn" style="font-size:1.2em;padding:0.5em 2em;border-radius:0.5em;border:none;background:#ff4444;color:white;cursor:pointer;">Home</button>
          <button id="deathPlayBtn" style="font-size:1.2em;padding:0.5em 2em;border-radius:0.5em;border:none;background:#0077ff;color:white;cursor:pointer;">Play Again</button>
        </div>
      </div>
    `;
    document.body.appendChild(deathMenu);
    deathStatsDiv = deathMenu.querySelector('#deathStats');
    const deathHomeBtn = deathMenu.querySelector('#deathHomeBtn');
    const deathPlayBtn = deathMenu.querySelector('#deathPlayBtn');
    deathHomeBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('returnToHome')));
    deathPlayBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('playAgain')));

    // In-Game UI elements (like leaderboard, coords, etc.) would be created here too

    // Remove scrollbars
    document.body.style.overflow = 'hidden';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.margin = '0';
    document.documentElement.style.padding = '0';
}

// --- UI State Management Functions ---

export function showStartMenu() {
    startMenu.style.display = 'flex';
    deathMenu.style.display = 'none';
    escMenu.style.display = 'none';
    if (leaderboardDiv) leaderboardDiv.style.display = 'none';
    if (coordsDiv) coordsDiv.style.display = 'none';
    if (fpsDiv) fpsDiv.style.display = 'none';
    if (modeBtn) modeBtn.style.display = 'none';
}

export function showGameUI() {
    startMenu.style.display = 'none';
    deathMenu.style.display = 'none';
    escMenu.style.display = 'none';
    if (leaderboardDiv) leaderboardDiv.style.display = '';
    if (coordsDiv) coordsDiv.style.display = '';
    if (fpsDiv) fpsDiv.style.display = '';
    if (modeBtn) modeBtn.style.display = 'block';
}

export function showDeathUI(detail) {
    deathMenu.style.display = 'flex';
    startMenu.style.display = 'none';
    escMenu.style.display = 'none';
    deathStatsDiv.innerHTML = `Survival Time: <b>${detail.lastSurvivalTime}</b> seconds<br>Final Mass: <b>${detail.lastMass}</b><br>${detail.absorbedBy}`;
    if (leaderboardDiv) leaderboardDiv.style.display = 'none';
    if (coordsDiv) coordsDiv.style.display = 'none';
    if (fpsDiv) fpsDiv.style.display = 'none';
    if (modeBtn) modeBtn.style.display = 'none';
}

export function showEscMenu() {
    escMenu.style.display = 'flex';
}

export function hideEscMenu() {
    escMenu.style.display = 'none';
}

export function updateLeaderboardUI(players) {
    if (!leaderboardDiv) return;
    let leaderboardContent = '<h3>Leaderboard</h3>';
    players.forEach((p, i) => {
        leaderboardContent += `<div${p.isPlayer ? ' class="leaderboard-player"' : ''}>${i + 1}. ${p.name} - ${p.mass}</div>`;
    });
    leaderboardDiv.innerHTML = leaderboardContent;
}

// ... other UI update functions can be added here