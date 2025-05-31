<markdown>
### Arquivo `app.js`

Aqui está o conteúdo para o seu arquivo `app.js`.

**Como "baixar":**

1.  Clique no botão "Copiar" que aparece no canto superior direito desta caixa de código para copiar todo o conteúdo.
2.  Abra um editor de texto simples no seu computador (como Bloco de Notas, TextEdit em modo texto simples, VS Code, etc.).
3.  Cole o código copiado no editor.
4.  Guarde o ficheiro com o nome `app.js` **na mesma pasta** onde guardou o `index.html`.

**Lembretes importantes para este ficheiro:**
* **Configuração do Firebase:** Terá de colar o objeto `firebaseConfig` do seu projeto Firebase no local indicado no código.
* **Estrutura de Dados no Firestore:** Este `app.js` espera que os dados do ato (história, cenas, escolhas) estejam numa estrutura específica dentro do seu documento no Firestore, como discutimos anteriormente (no campo `act_data`).

</markdown>
```javascript
// --- Configuração do Firebase ---
// Cole aqui o objeto firebaseConfig que você copiou do console do Firebase:
// Exemplo:
const firebaseConfig = {
  apiKey: "AIzaSyCXsrrRfgsN3Y0uh_dWp8dxNK9s5Fxx1Bo",
  authDomain: "zombie-game-efb3e.firebaseapp.com",
  projectId: "zombie-game-efb3e",
  storageBucket: "zombie-game-efb3e.firebasestorage.app",
  messagingSenderId: "210412539983",
  appId: "1:210412539983:web:c800e02d20c28fe1ea1a3a"
};

// --- Constantes Globais ---
// O __app_id é fornecido pelo ambiente Canvas. Use um padrão se não estiver definido.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'rpg-zumbi-default-app';
const GAME_COLLECTION_NAME = 'rpg_apocalipse_zumbi_shared'; // Nome da coleção no Firestore
const GAME_DOC_ID = 'partida_lucas_lavinia'; // ID do documento do jogo

// Caminho do documento no Firestore (público para este app)
const firestoreGameDocPath = `/artifacts/${appId}/public/data/${GAME_COLLECTION_NAME}/${GAME_DOC_ID}`;

// --- Inicialização do Firebase ---
let app;
let auth;
let db;
let userId = null; // Será definido após a autenticação

// --- Elementos da UI (definidos no index.html) ---
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
let currentActData = null; // Armazenará os dados do ato carregado
let currentSceneId = null; // ID da cena atual que está sendo exibida

// --- Funções Auxiliares ---
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
    console.error(message);
    // Opcional: esconder o loading se já não estiver escondido
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
        if (!firebaseConfig || Object.keys(firebaseConfig).length === 0 || !firebaseConfig.apiKey) {
            console.error("Configuração do Firebase (__firebase_config) está vazia ou incompleta:", firebaseConfig);
            throw new Error("Configuração do Firebase (__firebase_config) não encontrada ou incompleta. Verifique as variáveis de ambiente da plataforma.");
        }
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        firebase.firestore().setLogLevel('debug'); // 'debug' ou 'error' para logs do Firestore

        authStatusElement.textContent = "A autenticar...";

        auth.onAuthStateChanged(async (user) => {
            if (user) {
                userId = user.uid;
                authStatusElement.textContent = "Autenticado";
                userIdTextElement.textContent = userId;
                userIdDisplayElement.classList.remove('hidden');
                console.log("Utilizador autenticado:", userId);
                listenToGameState(); // Começa a ouvir o estado do jogo após autenticação bem-sucedida
            } else {
                // Se não houver utilizador, tenta login anónimo se não houver token customizado
                userId = crypto.randomUUID(); // Gera um ID temporário para UI antes do login
                authStatusElement.textContent = "Autenticação anónima";
                userIdTextElement.textContent = `${userId.substring(0,8)}... (Anónimo)`;
                userIdDisplayElement.classList.remove('hidden'); // Mostra o ID anónimo temporário
                console.log("Nenhum utilizador atual. ID anónimo temporário:", userId);

                if (typeof __initial_auth_token === 'undefined' || !__initial_auth_token) {
                    console.log("A tentar login anónimo...");
                    try {
                        const anonUserCredential = await auth.signInAnonymously();
                        // onAuthStateChanged será chamado novamente com o utilizador anónimo real
                        console.log("Login anónimo bem-sucedido:", anonUserCredential.user.uid);
                    } catch (error) {
                        console.error("Erro no login anónimo:", error);
                        displayError(`Erro no login anónimo: ${error.message}. Recarregue a página.`);
                        authStatusElement.textContent = "Falha na autenticação";
                    }
                } else {
                    // Se __initial_auth_token estava definido mas falhou, onAuthStateChanged já teria sido chamado
                    // Se chegou aqui, é porque o token não estava definido e o login anónimo já foi tentado (ou será)
                    // Se o login anónimo falhar, o estado de "Falha na autenticação" persistirá.
                    // Se as regras do Firestore permitirem acesso não autenticado (não recomendado), poderia chamar listenToGameState aqui.
                    // Mas com as regras atuais, é preciso um utilizador (anónimo ou real).
                }
            }
        });

        // Tenta login com token customizado se disponível
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            console.log("A tentar login com token customizado...");
            try {
                await auth.signInWithCustomToken(__initial_auth_token);
                // onAuthStateChanged será chamado se bem-sucedido
            } catch (error) {
                console.error("Erro no login com token customizado:", error);
                // Se falhar, onAuthStateChanged pode tentar login anónimo (se __initial_auth_token não estiver definido)
                // ou mostrar erro se o token era a única opção.
                displayError(`Erro com token: ${error.message}. A tentar login anónimo se configurado.`);
                // O onAuthStateChanged já lida com o fallback para anónimo se __initial_auth_token não estiver definido
            }
        } else if (!auth.currentUser) { // Se não há token e nem utilizador atual, força tentativa de anónimo
             console.log("Nenhum token customizado e nenhum utilizador atual, a tentar login anónimo...");
             try {
                await auth.signInAnonymously();
             } catch (error) {
                console.error("Erro ao tentar login anónimo inicial:", error);
                displayError(`Falha crítica na autenticação: ${error.message}.`);
                authStatusElement.textContent = "Falha crítica na autenticação";
             }
        }


    } catch (error) {
        console.error("Erro ao inicializar Firebase:", error);
        displayError(`Erro crítico na inicialização: ${error.message}. Verifique a configuração do Firebase.`);
        authStatusElement.textContent = "Erro de Inicialização";
    }
}


// Ouve o documento principal do jogo para carregar o ato e a cena atual
function listenToGameState() {
    if (!db) {
        displayError("Base de dados não inicializada.");
        return;
    }
    if (!userId && !auth.currentUser) { // Verifica se userId está definido ou se há um utilizador autenticado
        displayError("Utilizador não autenticado. A aguardar autenticação.");
        // Poderia tentar autenticar novamente ou pedir ao utilizador para recarregar.
        return;
    }
    // Garante que userId é o uid do utilizador autenticado, se houver
    if (auth.currentUser && userId !== auth.currentUser.uid) {
        userId = auth.currentUser.uid;
        userIdTextElement.textContent = userId;
    }


    showLoading("A carregar dados do jogo...");
    const gameDocRef = db.doc(firestoreGameDocPath);

    gameDocRef.onSnapshot((doc) => {
        clearError();
        if (doc.exists) {
            const gameState = doc.data();
            console.log("Estado do jogo recebido:", gameState);

            // Carrega os dados do ato
            if (gameState.act_data && typeof gameState.act_data === 'object') {
                currentActData = gameState.act_data;
            } else {
                displayError("Dados do Ato (act_data) não encontrados ou em formato incorreto no Firestore. Verifique a estrutura em: " + firestoreGameDocPath);
                currentActData = null;
                hideLoading(); // Esconde o loading porque não há dados para mostrar
                return; // Interrompe se não há dados do ato
            }
            
            // Define a cena atual
            // Se currentSceneId não estiver no gameState, usa a cenaInicialId do ato
            // Se cenaInicialId também não existir, usa a primeira cena listada em act_data.cenas
            let newSceneId = gameState.currentSceneId;
            if (!newSceneId && currentActData) {
                newSceneId = currentActData.cenaInicialId;
                if (!newSceneId && currentActData.cenas && Object.keys(currentActData.cenas).length > 0) {
                    newSceneId = Object.keys(currentActData.cenas)[0]; // Fallback para a primeira cena
                    console.warn("currentSceneId e cenaInicialId não definidos. A usar a primeira cena do ato:", newSceneId);
                }
            }

            if (!newSceneId) {
                displayError("Não foi possível determinar a cena atual. Verifique currentSceneId e act_data.cenaInicialId no Firestore.");
                hideLoading();
                return;
            }

            // Atualiza a cena apenas se mudou ou se o conteúdo do jogo estava escondido
            if (newSceneId !== currentSceneId || gameContent.classList.contains('hidden')) {
                 currentSceneId = newSceneId;
                 displayScene(currentSceneId);
            }
            
            // Feedback da última escolha
            if (gameState.lastChoiceText) {
                const timestamp = gameState.lastUpdateTimestamp?.toDate ? new Date(gameState.lastUpdateTimestamp.toDate()).toLocaleTimeString() : 'recentemente';
                const chooser = gameState.lastChosenByUserId ? gameState.lastChosenByUserId.substring(0,8)+'...' : 'alguém';
                chosenFeedbackElement.textContent = `Última escolha: "${gameState.lastChoiceText}" (por ${chooser}) às ${timestamp}`;
            } else {
                chosenFeedbackElement.textContent = 'O jogo começou! Façam a vossa primeira escolha.';
            }
            // hideLoading() é chamado dentro de displayScene ou em caso de erro

        } else {
            displayError(`Documento do jogo não encontrado em: ${firestoreGameDocPath}. Peça ao Mestre para o configurar com 'act_data' e 'currentSceneId'.`);
            currentActData = null; // Limpa os dados do ato se o documento não existe
            hideLoading();
        }
    }, (error) => {
        console.error("Erro ao buscar estado do jogo: ", error);
        displayError(`Erro ao carregar estado do jogo: ${error.message}. Verifique a ligação e as regras do Firestore.`);
        currentActData = null;
        hideLoading();
    });
}

// Exibe uma cena específica com base no ID
function displayScene(sceneId) {
    if (!currentActData || !currentActData.cenas || !currentActData.cenas[sceneId]) {
        displayError(`Cena "${sceneId}" não encontrada nos dados do ato (act_data.cenas). Verifique a estrutura no Firestore.`);
        if(storyTextElement) storyTextElement.textContent = `Erro: Cena ${sceneId} não encontrada.`;
        if(choicesAreaElement) choicesAreaElement.innerHTML = '';
        hideLoading();
        return;
    }

    const scene = currentActData.cenas[sceneId];
    if(storyTextElement) {
        // Usar textContent para segurança por defeito. Se precisar de HTML, certifique-se que é sanitizado.
        storyTextElement.textContent = scene.descricao; 
    }
    
    if(choicesAreaElement) choicesAreaElement.innerHTML = ''; // Limpa escolhas antigas

    if (scene.finalDoAto) {
        const endMessage = document.createElement('p');
        endMessage.className = "text-center text-xl font-semibold my-4";
        endMessage.textContent = scene.gameOver ? "Fim de Jogo!" : "Fim do Ato!";
        if(choicesAreaElement) choicesAreaElement.appendChild(endMessage);
        
        // Botão para reiniciar (se for fim de jogo ou fim de ato e quisermos essa opção)
        if (scene.gameOver || scene.finalDoAto) { // Adicionado scene.finalDoAto para reiniciar no fim do ato também
            const restartButton = document.createElement('button');
            restartButton.textContent = "Reiniciar Ato (Voltar à cena inicial)";
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
        // Cena sem escolhas e que não é final
        if(choicesAreaElement) choicesAreaElement.innerHTML = '<p class="text-center text-gray-500">Não há mais ações possíveis aqui. O Mestre precisa de continuar a história ou esta é uma cena de transição.</p>';
    }
    hideLoading(); // Garante que o conteúdo do jogo seja exibido após o processamento da cena
}

// Função para quando uma escolha é selecionada
async function selectChoice(choice) {
    if (!db) {
        displayError("Base de dados não inicializada. Não é possível registar a escolha.");
        return;
    }
    if (!userId && !auth.currentUser) {
        displayError("Utilizador não autenticado. Não é possível registar a escolha.");
        return;
    }
     // Garante que userId é o uid do utilizador autenticado
    if (auth.currentUser && userId !== auth.currentUser.uid) {
        userId = auth.currentUser.uid;
    }


    if (!choice.proximaCenaId) {
        displayError("Escolha inválida: 'proximaCenaId' não definido na estrutura da escolha.");
        return;
    }

    console.log(`Utilizador ${userId} escolheu: "${choice.texto}", indo para cena: ${choice.proximaCenaId}`);
    showLoading(`A ir para a próxima cena...`);


    const gameDocRef = db.doc(firestoreGameDocPath);
    try {
        // Atualiza o Firestore com a nova cena atual e a última escolha feita.
        // O onSnapshot cuidará de chamar displayScene com a nova currentSceneId.
        await gameDocRef.update({
            currentSceneId: choice.proximaCenaId,
            lastChoiceText: choice.texto,
            lastChosenByUserId: userId, // Registra quem fez a escolha
            lastUpdateTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log("Escolha e próxima cena atualizadas no Firestore.");
        // O display da nova cena será feito pelo listener `onSnapshot` quando `currentSceneId` mudar.
    } catch (error) {
        console.error("Erro ao atualizar Firestore com a escolha: ", error);
        displayError(`Erro ao registar escolha: ${error.message}`);
        hideLoading(); // Esconde o loading se houver erro
    }
}

// Função para reiniciar o ato para a cena inicial
async function resetToActStart() {
    if (!db) {
        displayError("Base de dados não inicializada. Não é possível reiniciar.");
        return;
    }
    if (!currentActData || !currentActData.cenaInicialId) {
        displayError("Não foi possível reiniciar: dados do ato ou cena inicial não definidos. Verifique 'act_data.cenaInicialId'.");
        return;
    }
    showLoading("A reiniciar o ato...");
    const gameDocRef = db.doc(firestoreGameDocPath);
    try {
        await gameDocRef.update({
            currentSceneId: currentActData.cenaInicialId,
            lastChoiceText: "Ato reiniciado.",
            lastChosenByUserId: "Sistema", // Ou pode ser o userId atual
            lastUpdateTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log("Ato reiniciado para a cena:", currentActData.cenaInicialId);
        // O onSnapshot tratará de recarregar a cena.
    } catch (error) {
        console.error("Erro ao reiniciar o ato:", error);
        displayError(`Erro ao reiniciar: ${error.message}`);
        hideLoading();
    }
}


// --- Inicialização ---
// Garante que o DOM está carregado antes de tentar manipular elementos
document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof firebase.initializeApp === 'undefined') {
        displayError("SDK do Firebase não carregado corretamente. Verifique os links <script> no HTML.");
        // Oculta o spinner de loading principal se o Firebase não carregar
        if(loadingIndicator) loadingIndicator.classList.add('hidden');
        if(gameContent) gameContent.innerHTML = '<p class="text-red-500 text-center">Erro crítico: Firebase não carregado.</p>';
        if(gameContent) gameContent.classList.remove('hidden');
        return;
    }
    initializeAppAndAuth();
});

// ----- DADOS INICIAIS E ESTRUTURA ESPERADA NO FIRESTORE -----
// O "Mestre" (vocês) precisará criar/configurar o documento no Firestore
// em: /artifacts/{appId}/public/data/rpg_apocalipse_zumbi_shared/partida_lucas_lavinia
//
// O documento 'partida_lucas_lavinia' deve ter os seguintes campos:
//
// 1. act_data (Map): Contém toda a estrutura do ato atual. Exemplo:
//    {
//      "atoId": "ato1_exemplo_despertar",
//      "titulo": "O Despertar no Porão",
//      "cenaInicialId": "cena1_porao",
//      "cenas": {
//        "cena1_porao": {
//          "descricao": "Texto da cena 1...",
//          "escolhas": [
//            { "texto": "Escolha A", "proximaCenaId": "cena2_resultado_A" },
//            { "texto": "Escolha B", "proximaCenaId": "cena3_resultado_B" }
//          ]
//        },
//        "cena2_resultado_A": {
//          "descricao": "Texto da cena 2...",
//          "escolhas": [...] 
//        },
//        "fim_ato_vitoria": {
//            "descricao": "Vocês venceram o Ato 1!",
//            "finalDoAto": true,
//            "gameOver": false 
//        },
//        "fim_jogo_derrota": {
//            "descricao": "Fim de jogo...",
//            "finalDoAto": true, // Pode ser fim de ato e fim de jogo
//            "gameOver": true
//        }
//        // ... mais cenas
//      }
//    }
//
// 2. currentSceneId (String): O ID da cena atual a ser exibida.
//    Ex: "cena1_porao"
//
// 3. lastChoiceText (String): Texto da última escolha feita (opcional, para feedback).
//    Ex: "Investigar os barulhos"
//
// 4. lastChosenByUserId (String): UID do utilizador que fez a última escolha (opcional).
//
// 5. lastUpdateTimestamp (Timestamp): Timestamp da última atualização (opcional).
//
// Consultem o exemplo JSON fornecido anteriormente para a estrutura detalhada de `act_data`.
```
<markdown>
Depois de guardar este ficheiro `app.js` na mesma pasta que o `index.html`, o próximo grande passo será configurar o seu projeto Firebase e popular o Firestore com os dados do Ato 1, conforme a estrutura detalhada nos comentários do `app.js` e no exemplo JSON que forneci anteriormente.

Quando tiver tudo configurado, pode tentar abrir o `index.html` no seu navegador para testar! Se encontrar algum problema ou tiver dúvidas, diga-me.
</markdown>