import { supabase } from '../config/supabaseClient.js';

// --- INICIALIZAÇÃO ---
configurarTela();

function configurarTela() {
    const btnGerar = document.getElementById('btn-gerar-dre');
    const btnImprimir = document.getElementById('btn-imprimir-dre');
    
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

    const inputInicio = document.getElementById('dre-data-inicio');
    const inputFim = document.getElementById('dre-data-fim');

    if (inputInicio) inputInicio.valueAsDate = primeiroDia;
    if (inputFim) inputFim.valueAsDate = ultimoDia;

    if(btnGerar) btnGerar.onclick = gerarDRE;
    if(btnImprimir) btnImprimir.onclick = () => window.print();
}

async function gerarDRE() {
    const btnGerar = document.getElementById('btn-gerar-dre');
    const container = document.getElementById('relatorio-dre');
    const corpoTabela = document.getElementById('dre-corpo');
    const dataInicio = document.getElementById('dre-data-inicio').value;
    const dataFim = document.getElementById('dre-data-fim').value;
    const empresaId = localStorage.getItem('empresaAtivaId');

    if (!empresaId || !dataInicio || !dataFim) return alert("Preencha todos os campos.");

    btnGerar.disabled = true;
    btnGerar.textContent = "Carregando...";
    container.style.display = 'none';

    try {
        const { data: contas } = await supabase.from('plano_de_contas').select('*').eq('empresa_id', empresaId).order('codigo');
        const { data: lancamentos } = await supabase.from('lancamentos').select('*').eq('empresa_id', empresaId).gte('data', dataInicio).lte('data', dataFim);

        const resultado = processarDadosDRE(contas || [], lancamentos || []);
        renderizarTabelaPadrao(resultado, corpoTabela);
        
        container.style.display = 'block';
        document.getElementById('btn-imprimir-dre').style.display = 'inline-block';

    } catch (erro) {
        console.error(erro);
        alert("Erro: " + erro.message);
    } finally {
        btnGerar.disabled = false;
        btnGerar.textContent = "Gerar DRE";
    }
}

function processarDadosDRE(contas, lancamentos) {
    const mapa = {};
    contas.forEach(c => mapa[c.id] = { ...c, saldo: 0 });

    lancamentos.forEach(l => {
        const c = mapa[l.conta_id];
        if (!c) return;
        // Na DRE, queremos Receita (+), Despesa (-)
        if (l.tipo === 'C') c.saldo += Number(l.valor);
        else c.saldo -= Number(l.valor);
    });

    // Estrutura organizada para exibição sequencial
    const dados = {
        receitas: { titulo: "RECEITAS OPERACIONAIS", total: 0, itens: [] },
        custos: { titulo: "(-) CUSTOS E DESPESAS", total: 0, itens: [] }, // Agrupando para simplificar visual
        resultado: 0
    };

    Object.values(mapa).forEach(c => {
        if (Math.abs(c.saldo) < 0.01) return;

        const g = c.codigo.charAt(0);

        if (g === '5') { // RECEITAS
            dados.receitas.total += c.saldo;
            dados.receitas.itens.push(c);
        }
        else if (g === '4') { // DESPESAS
            // Invertemos o sinal para exibir (Despesa de 100 vira -100 na DRE matemática, mas aqui tratamos visualmente)
            // Se o saldo veio negativo (Débito), mantemos negativo para mostrar vermelho na tabela
            dados.custos.total += c.saldo; // Soma algébrica (vai diminuir o lucro)
            dados.custos.itens.push(c);
        }
    });

    dados.resultado = dados.receitas.total + dados.custos.total; // Soma algébrica pois despesas já são negativas

    return dados;
}

function renderizarTabelaPadrao(dados, tbody) {
    tbody.innerHTML = '';

    // Base para AV% é a Receita Total (ou a maior receita se total for 0)
    const baseAV = dados.receitas.total || 1; 

    // Função auxiliar para criar linhas da tabela
    const addRow = (codigo, nome, valor, tipo = 'item') => {
        const tr = document.createElement('tr');
        
        // Classes CSS baseadas no tipo de linha
        let classeValor = 'val-neutral';
        if (valor > 0) classeValor = 'val-pos';
        if (valor < 0) classeValor = 'val-neg';

        let classeTr = '';
        let styleNome = '';

        if (tipo === 'header') {
            classeTr = 'row-total'; // Negrito, fundo cinza claro
            classeValor = 'val-neutral'; // Totais de grupo geralmente neutros ou cor do grupo
        } else if (tipo === 'result') {
            classeTr = valor >= 0 ? 'row-result' : 'row-result prejuizo';
            classeValor = valor >= 0 ? 'val-pos' : 'val-neg';
        } else {
            // Item normal
            styleNome = 'indent-1'; // Recuo para itens filhos
        }

        const av = (valor / baseAV) * 100;
        const valorFmt = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const avFmt = Math.abs(av) < 999 ? av.toFixed(1) + '%' : '-';

        tr.className = classeTr;
        tr.innerHTML = `
            <td>${codigo}</td>
            <td class="${styleNome}">${nome}</td>
            <td class="col-valor ${classeValor}">${valorFmt}</td>
            <td class="col-av">${avFmt}</td>
        `;
        tbody.appendChild(tr);
    };

    // 1. RECEITAS
    if (dados.receitas.itens.length > 0) {
        // Cabeçalho do Grupo
        addRow('5', dados.receitas.titulo, dados.receitas.total, 'header');
        // Itens
        dados.receitas.itens.sort((a,b) => a.codigo.localeCompare(b.codigo)).forEach(item => {
            addRow(item.codigo, item.nome, item.saldo, 'item');
        });
    }

    // 2. CUSTOS E DESPESAS
    if (dados.custos.itens.length > 0) {
        // Cabeçalho do Grupo
        addRow('4', dados.custos.titulo, dados.custos.total, 'header');
        // Itens
        dados.custos.itens.sort((a,b) => a.codigo.localeCompare(b.codigo)).forEach(item => {
            addRow(item.codigo, item.nome, item.saldo, 'item');
        });
    }

    // 3. RESULTADO FINAL (Linha de destaque)
    // Linha vazia para separar
    const trEspaco = document.createElement('tr');
    trEspaco.innerHTML = '<td colspan="4" style="background:#fff; border:none; height:10px;"></td>';
    tbody.appendChild(trEspaco);

    addRow('', 'LUCRO / PREJUÍZO LÍQUIDO', dados.resultado, 'result');
}