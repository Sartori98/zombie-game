// --- Configuração do Firebase ---
// O seu firebaseConfig fornecido:
const firebaseConfig = {
  apiKey: "AIzaSyCXsrrRfgsN3Y0uh_dWp8dxNK9s5Fxx1Bo",
  authDomain: "zombie-game-efb3e.firebaseapp.com",
  projectId: "zombie-game-efb3e",
  storageBucket: "zombie-game-efb3e.firebasestorage.app",
  messagingSenderId: "210412539983",
  appId: "1:210412539983:web:c800e02d20c28fe1ea1a3a"
};

// --- Constantes Globais ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'rpg-zumbi-default-app';
const GAME_COLLECTION_NAME = 'rpg_apocalipse_zumbi_shared'; // Este é o nome da última coleção antes do documento do jogo
const GAME_DOC_ID = 'partida_lucas_lavinia'; // Este é o ID do documento final do jogo

// Caminho completo para o documento do jogo no Firestore, AJUSTADO à sua estrutura:
const firestoreGameDocPath = `/artifacts/${appId}/public/doc_para_public/data/doc_para_data/${GAME_COLLECTION_NAME}/${GAME_DOC_ID}`;

// --- Inicialização do Firebase ---
let app;
let auth;
let db;
let userId = null;

// --- Elementos da UI ---
const storyTextElement = document.getElementById('story-text');
const choicesAreaElement = document.getElementById('choices-area');
const chosenFeedbackElement = document.getElementById('chosen-feedback');
const loadingIndicator = document.getElementById('loading-indicator');
const gameContent = document.getElementById('game-content');
const authStatusElement = document.getElementById('auth-status');
const userIdTextElement = document.getElementById('userIdText');
const userIdDisplayElement = document.getElementById('user-id-display');
const errorMessageElement = document.getElementById('error-message');

// --- Estado do Jogo Local ---
let currentActData = null;
let currentSceneId = null;

// --- Funções Auxiliares de UI ---
function showLoading(message = "A carregar...") {
    if (loadingIndicator) {
        const pElement = loadingIndicator.querySelector('p');
        if (pElement) pElement.textContent = message;
        loadingIndicator.classList.remove('hidden');
    }
    if (gameContent) gameContent.classList.add('hidden');
    if (errorMessageElement) errorMessageElement.classList.add('hidden');
}

function hideLoading() {
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
    if (gameContent) gameContent.classList.remove('hidden');
}

function displayError(message) {
    if (errorMessageElement) {
        errorMessageElement.textContent = message;
        errorMessageElement.classList.remove('hidden');
    }
    console.error("RPG Error:", message);
    if (loadingIndicator && !loadingIndicator.classList.contains('hidden')) {
        loadingIndicator.classList.add('hidden');
    }
}

function clearError() {
    if (errorMessageElement) {
        errorMessageElement.classList.add('hidden');
        errorMessageElement.textContent = '';
    }
}

// --- Lógica Principal do Jogo ---

async function initializeAppAndAuth() {
    try {
        if (!firebaseConfig || !firebaseConfig.apiKey) {
            throw new Error("Configuração do Firebase (firebaseConfig) é inválida ou apiKey está em falta. Verifique o app.js.");
        }
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        // Linha de setLogLevel removida

        if(authStatusElement) authStatusElement.textContent = "A autenticar...";

        auth.onAuthStateChanged(async (user) => {
            if (user) {
                userId = user.uid;
                if(authStatusElement) authStatusElement.textContent = "Autenticado";
                if(userIdTextElement) userIdTextElement.textContent = userId.substring(0, 8) + "...";
                if(userIdDisplayElement) userIdDisplayElement.classList.remove('hidden');
                console.log("Utilizador autenticado:", userId);
                listenToGameState();
            } else {
                userId = "anon_" + crypto.randomUUID().substring(0,12);
                if(authStatusElement) authStatusElement.textContent = "A tentar login anónimo...";
                if(userIdTextElement) userIdTextElement.textContent = `Anónimo (${userId.substring(5,10)}...)`;
                if(userIdDisplayElement) userIdDisplayElement.classList.remove('hidden');
                console.log("Nenhum utilizador. Tentando login anónimo. ID provisório:", userId);
                try {
                    const anonUserCredential = await auth.signInAnonymously();
                    console.log("Login anónimo bem-sucedido:", anonUserCredential.user.uid);
                } catch (error) {
                    console.error("Erro no login anónimo:", error);
                    displayError(`Erro no login anónimo: ${error.message}. Verifique as regras de segurança e se a autenticação anónima está ativa no Firebase.`);
                    if(authStatusElement) authStatusElement.textContent = "Falha na autenticação";
                }
            }
        });

    } catch (error) {
        console.error("Erro ao inicializar Firebase:", error);
        displayError(`Erro crítico na inicialização: ${error.message}.`);
        if(authStatusElement) authStatusElement.textContent = "Erro de Inicialização";
    }
}

function listenToGameState() {
    if (!db) {
        displayError("Base de dados não inicializada.");
        return;
    }
    if (!auth.currentUser && !userId.startsWith("anon_")) {
        displayError("Utilizador não autenticado. A aguardar autenticação.");
        return;
    }
    
    let currentUserIdToCheck = auth.currentUser ? auth.currentUser.uid : userId;
    if (auth.currentUser && currentUserIdToCheck !== auth.currentUser.uid) {
        currentUserIdToCheck = auth.currentUser.uid;
        if(userIdTextElement) userIdTextElement.textContent = currentUserIdToCheck.substring(0, 8) + "...";
    }

    showLoading("A carregar dados do jogo do Firestore...");
    console.log("A tentar aceder ao Firestore em:", firestoreGameDocPath); // Log para depuração do caminho
    const gameDocRef = db.doc(firestoreGameDocPath);

    gameDocRef.onSnapshot((doc) => {
        clearError();
        if (doc.exists) {
            const gameState = doc.data();
            console.log("Estado do jogo recebido do Firestore:", gameState);

            if (gameState.act_data && typeof gameState.act_data === 'object') {
                currentActData = gameState.act_data;
            } else {
                displayError(`Dados do Ato (act_data) não encontrados ou em formato incorreto no Firestore. Verifique o documento em: ${firestoreGameDocPath}`);
                currentActData = null;
                hideLoading();
                return;
            }
            
            let newSceneId = gameState.currentSceneId;
            if (!newSceneId && currentActData) {
                newSceneId = currentActData.cenaInicialId;
                if (!newSceneId && currentActData.cenas && Object.keys(currentActData.cenas).length > 0) {
                    newSceneId = Object.keys(currentActData.cenas)[0];
                    console.warn("currentSceneId e cenaInicialId não definidos no Firestore. A usar a primeira cena do ato:", newSceneId);
                }
            }

            if (!newSceneId) {
                displayError("Não foi possível determinar a cena atual. Verifique 'currentSceneId' e 'act_data.cenaInicialId' no Firestore.");
                hideLoading();
                return;
            }

            if (newSceneId !== currentSceneId || gameContent.classList.contains('hidden')) {
                 currentSceneId = newSceneId;
                 displayScene(currentSceneId);
            }
            
            if (gameState.lastChoiceText) {
                const timestamp = gameState.lastUpdateTimestamp?.toDate ? new Date(gameState.lastUpdateTimestamp.toDate()).toLocaleTimeString('pt-PT') : 'recentemente';
                const chooser = gameState.lastChosenByUserId ? (gameState.lastChosenByUserId.startsWith("anon_")? "Anónimo" : gameState.lastChosenByUserId.substring(0,8)+'...') : 'alguém';
                if(chosenFeedbackElement) chosenFeedbackElement.textContent = `Última escolha: "${gameState.lastChoiceText}" (por ${chooser}) às ${timestamp}`;
            } else {
                if(chosenFeedbackElement) chosenFeedbackElement.textContent = 'O jogo começou! Façam a vossa primeira escolha.';
            }

        } else {
            displayError(`Documento do jogo não encontrado em: ${firestoreGameDocPath}. Verifique se o caminho está correto e se o documento existe, contendo os campos 'act_data' e 'currentSceneId'.`);
            currentActData = null;
            hideLoading();
        }
    }, (error) => {
        console.error("Erro ao escutar estado do jogo (onSnapshot): ", error);
        displayError(`Erro ao carregar estado do jogo: ${error.message}. Verifique a ligação à internet e as regras de segurança do Firestore.`);
        currentActData = null;
        hideLoading();
    });
}

function displayScene(sceneId) {
    if (!currentActData || !currentActData.cenas || !currentActData.cenas[sceneId]) {
        displayError(`Cena "${sceneId}" não encontrada nos dados do ato (act_data.cenas). Verifique a estrutura JSON no Firestore.`);
        if(storyTextElement) storyTextElement.textContent = `Erro: Cena ${sceneId} não encontrada.`;
        if(choicesAreaElement) choicesAreaElement.innerHTML = '';
        hideLoading();
        return;
    }

    const scene = currentActData.cenas[sceneId];
    if(storyTextElement) {
        storyTextElement.textContent = scene.descricao; 
    }
    
    if(choicesAreaElement) choicesAreaElement.innerHTML = '';

    if (scene.finalDoAto) {
        const endMessage = document.createElement('p');
        endMessage.className = "text-center text-xl font-semibold my-4";
        endMessage.textContent = scene.gameOver ? "Fim de Jogo!" : "Fim do Ato!";
        if(choicesAreaElement) choicesAreaElement.appendChild(endMessage);
        
        if (scene.gameOver || scene.finalDoAto) {
            const restartButton = document.createElement('button');
            restartButton.textContent = "Reiniciar Ato";
            restartButton.className = "choice-button w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 mt-4";
            restartButton.onclick = () => resetToActStart();
            if(choicesAreaElement) choicesAreaElement.appendChild(restartButton);
        }

    } else if (scene.escolhas && Array.isArray(scene.escolhas) && scene.escolhas.length > 0) {
        scene.escolhas.forEach((choice) => {
            if (choice && typeof choice.texto === 'string' && typeof choice.proximaCenaId === 'string') {
                const button = document.createElement('button');
                button.textContent = choice.texto;
                button.className = "choice-button w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-4 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75";
                button.onclick = () => selectChoice(choice);
                if(choicesAreaElement) choicesAreaElement.appendChild(button);
            } else {
                console.warn("Formato de escolha inválido na cena:", sceneId, choice);
            }
        });
    } else {
        if(choicesAreaElement) choicesAreaElement.innerHTML = '<p class="text-center text-gray-500">Não há mais ações possíveis aqui.</p>';
    }
    hideLoading();
}

async function selectChoice(choice) {
    if (!db) {
        displayError("Base de dados não inicializada.");
        return;
    }
    let currentUserIdToLog = auth.currentUser ? auth.currentUser.uid : userId;
    if (!currentUserIdToLog) {
        displayError("Utilizador não autenticado. Não é possível registar a escolha.");
        return;
    }

    if (!choice.proximaCenaId) {
        displayError("Escolha inválida: 'proximaCenaId' não definido.");
        return;
    }

    console.log(`Utilizador ${currentUserIdToLog} escolheu: "${choice.texto}", indo para cena: ${choice.proximaCenaId}`);
    showLoading(`A processar escolha...`);

    const gameDocRef = db.doc(firestoreGameDocPath);
    try {
        await gameDocRef.update({
            currentSceneId: choice.proximaCenaId,
            lastChoiceText: choice.texto,
            lastChosenByUserId: currentUserIdToLog,
            lastUpdateTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log("Escolha e próxima cena atualizadas no Firestore.");
    } catch (error) {
        console.error("Erro ao atualizar Firestore com a escolha: ", error);
        displayError(`Erro ao registar escolha: ${error.message}`);
        hideLoading();
    }
}

async function resetToActStart() {
    if (!db) {
        displayError("Base de dados não inicializada.");
        return;
    }
    if (!currentActData || !currentActData.cenaInicialId) {
        displayError("Não foi possível reiniciar: dados do ato ou cena inicial não definidos.");
        return;
    }
    let currentUserIdToLog = auth.currentUser ? auth.currentUser.uid : userId;

    showLoading("A reiniciar o ato...");
    const gameDocRef = db.doc(firestoreGameDocPath);
    try {
        await gameDocRef.update({
            currentSceneId: currentActData.cenaInicialId,
            lastChoiceText: "Ato reiniciado.",
            lastChosenByUserId: currentUserIdToLog || "Sistema",
            lastUpdateTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log("Ato reiniciado para a cena:", currentActData.cenaInicialId);
    } catch (error) {
        console.error("Erro ao reiniciar o ato:", error);
        displayError(`Erro ao reiniciar: ${error.message}`);
        hideLoading();
    }
}

// --- Inicialização da Aplicação ---
document.addEventListener('DOMContentLoaded', () => {
    if (!storyTextElement || !choicesAreaElement || !loadingIndicator || !gameContent) {
        console.error("Um ou mais elementos HTML essenciais não foram encontrados no DOM. Verifique os IDs no index.html.");
        const body = document.querySelector('body');
        if (body) {
            body.innerHTML = '<p style="color:red; text-align:center; margin-top: 50px;">Erro crítico: Elementos da página não encontrados. Verifique o HTML.</p>';
        }
        return;
    }

    if (typeof firebase === 'undefined' || typeof firebase.initializeApp === 'undefined') {
        displayError("SDK do Firebase não carregado corretamente. Verifique os links <script> no index.html.");
        if(loadingIndicator) loadingIndicator.classList.add('hidden');
        if(gameContent && !gameContent.querySelector('p.text-red-500')) {
             const errorP = document.createElement('p');
             errorP.className = "text-red-500 text-center";
             errorP.textContent = "Erro crítico: Firebase SDK não carregado.";
             gameContent.innerHTML = '';
             gameContent.appendChild(errorP);
             gameContent.classList.remove('hidden');
        }
        return;
    }
    initializeAppAndAuth();
});
