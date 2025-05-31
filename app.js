```javascript
// --- Configuração do Firebase ---
// !!! IMPORTANTE: SUBSTITUA ESTE BLOCO PELO SEU firebaseConfig REAL !!!
// Obtenha o seu firebaseConfig no console do Firebase:
// Configurações do Projeto > Seus apps > Configuração do SDK (selecione "CDN")
const firebaseConfig = {
  apiKey: "AIzaSyCXsrrRfgsN3Y0uh_dWp8dxNK9s5Fxx1Bo",
  authDomain: "zombie-game-efb3e.firebaseapp.com",
  projectId: "zombie-game-efb3e",
  storageBucket: "zombie-game-efb3e.firebasestorage.app",
  messagingSenderId: "210412539983",
  appId: "1:210412539983:web:c800e02d20c28fe1ea1a3a"
};
// !!! FIM DO BLOCO A SUBSTITUIR !!!


// --- Constantes Globais ---
// O __app_id é fornecido por alguns ambientes de execução (como o Canvas do Gemini).
// Se não estiver definido, usamos um valor padrão. Este valor DEVE corresponder
// ao ID do documento que criou dentro da coleção "artifacts" no Firestore.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'rpg-zumbi-default-app';

// Nomes da coleção e do documento no Firestore.
// Estes DEVEM corresponder exatamente aos nomes que usou no seu banco de dados Firestore.
const GAME_COLLECTION_NAME = 'rpg_apocalipse_zumbi_shared';
const GAME_DOC_ID = 'partida_lucas_lavinia';

// Caminho completo para o documento do jogo no Firestore.
const firestoreGameDocPath = `/artifacts/${appId}/public/data/${GAME_COLLECTION_NAME}/${GAME_DOC_ID}`;

// --- Inicialização do Firebase ---
let app;
let auth;
let db;
let userId = null; // Será definido após a autenticação

// --- Elementos da UI (IDs DEVEM corresponder aos do index.html) ---
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
let currentActData = null; // Armazenará os dados do ato carregado do Firestore
let currentSceneId = null; // ID da cena atual que está sendo exibida

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
        // Verifica se firebaseConfig foi preenchido
        if (!firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey === "COLE_AQUI_SUA_API_KEY") {
            throw new Error("Configuração do Firebase (firebaseConfig) não foi preenchida ou é inválida. Verifique o app.js.");
        }
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        firebase.firestore().setLogLevel('error'); // 'debug' para mais logs, 'error' para menos

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
                userId = "anon_" + crypto.randomUUID().substring(0,12); // ID anónimo temporário
                if(authStatusElement) authStatusElement.textContent = "A tentar login anónimo...";
                if(userIdTextElement) userIdTextElement.textContent = `Anónimo (${userId.substring(5,10)}...)`;
                if(userIdDisplayElement) userIdDisplayElement.classList.remove('hidden');
                console.log("Nenhum utilizador. Tentando login anónimo. ID provisório:", userId);
                try {
                    const anonUserCredential = await auth.signInAnonymously();
                    // onAuthStateChanged será chamado novamente com o utilizador anónimo real
                    console.log("Login anónimo bem-sucedido:", anonUserCredential.user.uid);
                } catch (error) {
                    console.error("Erro no login anónimo:", error);
                    displayError(`Erro no login anónimo: ${error.message}. Verifique as regras de segurança e se a autenticação anónima está ativa no Firebase.`);
                    if(authStatusElement) authStatusElement.textContent = "Falha na autenticação";
                }
            }
        });

        // Não é necessário chamar signInWithCustomToken ou signInAnonymously aqui explicitamente
        // se o onAuthStateChanged já lida com a lógica de "nenhum utilizador".
        // A menos que __initial_auth_token seja um requisito específico da plataforma.

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
    // userId deve ser definido pelo onAuthStateChanged antes desta função ser chamada com sucesso.
    if (!userId && !auth.currentUser) {
        displayError("Utilizador não autenticado. A aguardar autenticação.");
        return;
    }
    // Garante que userId é o uid do utilizador autenticado, se houver
    if (auth.currentUser && userId !== auth.currentUser.uid) {
        userId = auth.currentUser.uid;
         if(userIdTextElement) userIdTextElement.textContent = userId.substring(0, 8) + "...";
    }

    showLoading("A carregar dados do jogo do Firestore...");
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
            // hideLoading() é chamado dentro de displayScene

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
        endMessage.className = "text-center text-xl font-semibold my-4"; // Tailwind classes
        endMessage.textContent = scene.gameOver ? "Fim de Jogo!" : "Fim do Ato!";
        if(choicesAreaElement) choicesAreaElement.appendChild(endMessage);
        
        if (scene.gameOver || scene.finalDoAto) {
            const restartButton = document.createElement('button');
            restartButton.textContent = "Reiniciar Ato";
            restartButton.className = "choice-button w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 mt-4"; // Tailwind classes
            restartButton.onclick = () => resetToActStart();
            if(choicesAreaElement) choicesAreaElement.appendChild(restartButton);
        }

    } else if (scene.escolhas && Array.isArray(scene.escolhas) && scene.escolhas.length > 0) {
        scene.escolhas.forEach((choice) => {
            if (choice && typeof choice.texto === 'string' && typeof choice.proximaCenaId === 'string') {
                const button = document.createElement('button');
                button.textContent = choice.texto;
                button.className = "choice-button w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-4 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75"; // Tailwind classes
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
    let currentUserId = auth.currentUser ? auth.currentUser.uid : userId; // Garante que temos o ID mais atualizado
    if (!currentUserId) {
        displayError("Utilizador não autenticado. Não é possível registar a escolha.");
        return;
    }

    if (!choice.proximaCenaId) {
        displayError("Escolha inválida: 'proximaCenaId' não definido.");
        return;
    }

    console.log(`Utilizador ${currentUserId} escolheu: "${choice.texto}", indo para cena: ${choice.proximaCenaId}`);
    showLoading(`A processar escolha...`);

    const gameDocRef = db.doc(firestoreGameDocPath);
    try {
        await gameDocRef.update({
            currentSceneId: choice.proximaCenaId,
            lastChoiceText: choice.texto,
            lastChosenByUserId: currentUserId,
            lastUpdateTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log("Escolha e próxima cena atualizadas no Firestore.");
        // O onSnapshot tratará de atualizar a UI com a nova cena.
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
    let currentUserId = auth.currentUser ? auth.currentUser.uid : userId;

    showLoading("A reiniciar o ato...");
    const gameDocRef = db.doc(firestoreGameDocPath);
    try {
        await gameDocRef.update({
            currentSceneId: currentActData.cenaInicialId,
            lastChoiceText: "Ato reiniciado.",
            lastChosenByUserId: currentUserId || "Sistema",
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
    // Verifica se os elementos HTML essenciais existem
    if (!storyTextElement || !choicesAreaElement || !loadingIndicator || !gameContent) {
        console.error("Um ou mais elementos HTML essenciais não foram encontrados no DOM. Verifique os IDs no index.html.");
        // Poderia mostrar um erro visual para o utilizador aqui, se apropriado
        const body = document.querySelector('body');
        if (body) {
            body.innerHTML = '<p style="color:red; text-align:center; margin-top: 50px;">Erro crítico: Elementos da página não encontrados. Verifique o HTML.</p>';
        }
        return;
    }

    // Verifica se o SDK do Firebase está carregado
    if (typeof firebase === 'undefined' || typeof firebase.initializeApp === 'undefined') {
        displayError("SDK do Firebase não carregado corretamente. Verifique os links <script> no index.html.");
        if(loadingIndicator) loadingIndicator.classList.add('hidden');
        if(gameContent && !gameContent.querySelector('p.text-red-500')) { // Evita duplicar msg de erro
             const errorP = document.createElement('p');
             errorP.className = "text-red-500 text-center"; // Tailwind classes
             errorP.textContent = "Erro crítico: Firebase SDK não carregado.";
             gameContent.innerHTML = ''; // Limpa conteúdo anterior
             gameContent.appendChild(errorP);
             gameContent.classList.remove('hidden');
        }
        return;
    }
    initializeAppAndAuth();
});
