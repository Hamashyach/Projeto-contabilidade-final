import { supabase } from '../config/supabaseClient.js';

// --- ESTRUTURA CONTÁBIL INTELIGENTE ---
const estrutura = {
    "1": { nome: "ATIVO", natureza: 1, subs: { "1": "Circulante", "2": "Não Circulante" } },
    "2": { nome: "PASSIVO", natureza: -1, subs: { "1": "Circulante", "2": "Não Circulante" } },
    "3": { nome: "PATRIMÔNIO LÍQUIDO", natureza: -1, subs: { "1": "Capital Social", "2": "Reservas", "3": "Lucros/Prejuízos" } },
    "4": { nome: "DESPESAS", natureza: 1, subs: { "1": "Administrativas", "2": "Custos", "3": "Financeiras" } },
    "5": { nome: "RECEITAS", natureza: -1, subs: { "1": "Operacionais", "2": "Financeiras" } },
    "6": { nome: "TRANSITÓRIAS", natureza: -1, subs: { "1": "Apuração de Resultado" } }
};

// --- CONTROLE DE UI (ABRIR/FECHAR FORM) ---
const formContainer = document.getElementById('form-container-nova-conta');
const btnNovaConta = document.getElementById('btn-nova-conta');
const btnCancelar = document.getElementById('btn-cancelar-nova-conta');

btnNovaConta.addEventListener('click', () => {
    formContainer.style.display = 'block';
});

btnCancelar.addEventListener('click', () => {
    formContainer.style.display = 'none';
    document.getElementById('form-nova-conta').reset();
});

// --- LÓGICA DE PREENCHIMENTO AUTOMÁTICO ---

// 1. Ao selecionar GRUPO -> Libera SUBGRUPO e define NATUREZA
document.getElementById('new-conta-grupo').addEventListener('change', function() {
    const grupoId = this.value;
    const subSelect = document.getElementById('new-conta-subgrupo');
    const natSelect = document.getElementById('natureza');

    subSelect.innerHTML = '<option value="">-- Selecione --</option>';
    subSelect.disabled = true;

    if (grupoId && estrutura[grupoId]) {
        subSelect.disabled = false;
        const subs = estrutura[grupoId].subs;

        // Preenche Subgrupos
        for (const [key, label] of Object.entries(subs)) {
            const opt = document.createElement('option');
            opt.value = key; // ex: 1
            opt.textContent = `${grupoId}.${key} - ${label}`;
            subSelect.appendChild(opt);
        }

        // Define Natureza Padrão (pode ser alterada depois manualmente)
        natSelect.value = estrutura[grupoId].natureza;
    }
});

// 2. Ao selecionar SUBGRUPO -> Gera CÓDIGO e CLASSIFICAÇÃO
document.getElementById('new-conta-subgrupo').addEventListener('change', async function() {
    const grupo = document.getElementById('new-conta-grupo').value;
    const sub = this.value;
    
    if (!grupo || !sub) return;

    // Preenche Classificação Visual (Ex: ATIVO - Circulante)
    const textoClassificacao = `${estrutura[grupo].nome} ${estrutura[grupo].subs[sub]}`;
    document.getElementById('new-conta-classificacao').value = textoClassificacao;

    // Gera Código
    await gerarCodigo(grupo, sub);
});

async function gerarCodigo(grupo, sub) {

    const empresaId = localStorage.getItem('empresaAtivaId');

    if (!empresaId) {
        alert("Erro: Nenhuma empresa selecionada no topo da página.");
        return;
    }

    const inputCodigo = document.getElementById('new-conta-codigo');
    const inputElemento = document.getElementById('new-conta-elemento');
    
    inputCodigo.value = "Calculando...";
    
    const prefixo = `${grupo}.${sub}.`; // Ex: 1.1.

    try {
        // Busca último código desse grupo no Supabase
        const { data, error } = await supabase
            .from('plano_de_contas')
            .select('codigo, elemento')
            .eq('empresa_id', empresaId) // <--- O PULO DO GATO ESTÁ AQUI
            .ilike('codigo', `${prefixo}%`)
            .order('elemento', { ascending: false })
            .limit(1)

        let novoElemento = 1;
        
        if (data && data.length > 0) {
            // Se achou 1.1.05, pega o 05 e soma 1
            const partes = data[0].codigo.split('.');
            if (partes.length === 3) {
                novoElemento = parseInt(partes[2]) + 1;
            }
        }

        const elementoFormatado = String(novoElemento); 
        
        inputElemento.value = novoElemento;
        inputCodigo.value = `${prefixo}${elementoFormatado}`; // Ex: 1.1.1 ou 1.1.10
        
    } catch (err) {
        console.error("Erro no gerarCodigo:", err);
        inputCodigo.value = "Erro";
    }
}

// --- SALVAR NO BANCO ---

document.getElementById('form-nova-conta').addEventListener('submit', async (e) => {
    e.preventDefault();

    const empresaId = localStorage.getItem('empresaAtivaId'); // <--- PEGA O ID
    if (!empresaId) {
        alert("Erro: Nenhuma empresa selecionada.");
        return;
    }

    const grupo = document.getElementById('new-conta-grupo').value;
    const sub = document.getElementById('new-conta-subgrupo').value;
    const elemento = document.getElementById('new-conta-elemento').value;
    const codigo = document.getElementById('new-conta-codigo').value;
    const nome = document.getElementById('nome').value;
    const classificacao = document.getElementById('new-conta-classificacao').value;
    const natureza = document.getElementById('natureza').value;

    const novaConta = {
        empresa_id: empresaId, // <--- OBRIGATÓRIO PARA APARECER NA LISTA
        grupo: parseInt(grupo),
        sub_grupo: parseInt(sub),
        elemento: parseInt(elemento),
        codigo: codigo,
        nome: nome,
        classificacao: classificacao,
        natureza: parseInt(natureza),
        tipo: 'A' 
    };

    const { error } = await supabase.from('plano_de_contas').insert([novaConta]);

    if (error) {
        alert("Erro ao salvar: " + error.message);
    } else {
        alert("Conta salva com sucesso!");
        formContainer.style.display = 'none';
        document.getElementById('form-nova-conta').reset();
        carregarTabela(); 
    }
});
// --- LISTAR CONTAS NA TABELA ---
async function carregarTabela() {
    const tbody = document.getElementById('corpo-tabela-contas');
    if (!tbody) return;

    const empresaId = localStorage.getItem('empresaAtivaId');
    
    // Se não tiver empresa selecionada, limpa a tabela e avisa
    if (!empresaId) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Selecione uma empresa no topo da página para ver os dados.</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';
    const { data, error } = await supabase
        .from('plano_de_contas')
        .select('*')
        .eq('empresa_id', empresaId) // <--- SEM PARSEINT AQUI TAMBÉM
        .order('grupo', { ascending: true })
        .order('sub_grupo', { ascending: true })
        .order('elemento', { ascending: true });

    if (error) {
        tbody.innerHTML = '<tr><td colspan="5">Erro ao carregar dados.</td></tr>';
        console.error(error);
        return;
    }

    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma conta cadastrada para esta empresa.</td></tr>';
        return;
    }

    data.forEach(conta => {
        const tr = document.createElement('tr');
        // Pinta de vermelho se for Credora (-1), Azul se for Devedora (1)
        const cor = conta.natureza === 1 ? '#0056b3' : '#d9534f';
        const textoNatureza = conta.natureza === 1 ? 'Devedora' : 'Credora';

        tr.innerHTML = `
            <td>${conta.codigo}</td>
            <td>${conta.nome}</td>
            <td>${conta.classificacao}</td>
            <td style="color:${cor}; font-weight:bold;">${textoNatureza}</td>
        `;
        tbody.appendChild(tr);
    });
}


// Iniciar ao abrir a página
carregarTabela();