import { supabase } from '../config/supabaseClient.js';

configurarTela();

function configurarTela() {
    const btnGerar = document.getElementById('btn-gerar-ind');
    const btnImprimir = document.getElementById('btn-imprimir-ind');
    
    const hoje = new Date();
    const fimMesAtual = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    const fimMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0);

    const inputRef = document.getElementById('ind-data-referencia');
    const inputAnt = document.getElementById('ind-data-anterior');

    if (inputRef) inputRef.valueAsDate = fimMesAtual;
    if (inputAnt) inputAnt.valueAsDate = fimMesAnterior;

    if(btnGerar) btnGerar.onclick = calcularIndicadores;
    if(btnImprimir) btnImprimir.onclick = () => window.print();
}

async function calcularIndicadores() {
    const btnGerar = document.getElementById('btn-gerar-ind');
    const container = document.getElementById('relatorio-ind');
    // Temos dois corpos de tabela agora
    const corpoLiquidez = document.getElementById('ind-corpo-liquidez');
    const corpoRetorno = document.getElementById('ind-corpo-retorno');
    
    const dataRef = document.getElementById('ind-data-referencia').value;
    const dataAnt = document.getElementById('ind-data-anterior').value;
    const empresaId = localStorage.getItem('empresaAtivaId');

    if (!empresaId || !dataRef) return alert("Selecione a data.");

    btnGerar.disabled = true;
    btnGerar.textContent = "Calculando...";
    container.style.display = 'none';

    try {
        const { data: contas } = await supabase.from('plano_de_contas').select('*').eq('empresa_id', empresaId);
        const { data: lancamentos } = await supabase.from('lancamentos').select('*').eq('empresa_id', empresaId).lte('data', dataRef);

        if (!contas || !lancamentos) throw new Error("Sem dados.");

        const dados = processarDadosPlanilha(contas, lancamentos, dataRef, dataAnt);
        
        // Renderiza cada tabela separadamente
        renderizarTabela(dados, 'liquidez', corpoLiquidez);
        renderizarTabela(dados, 'retorno', corpoRetorno);
        
        container.style.display = 'block';
        document.getElementById('btn-imprimir-ind').style.display = 'inline-block';

    } catch (erro) {
        console.error(erro);
        alert("Erro: " + erro.message);
    } finally {
        btnGerar.disabled = false;
        btnGerar.textContent = "Gerar Indicadores";
    }
}

function processarDadosPlanilha(contas, lancamentos, dataRef, dataAnt) {
    const mapa = {};
    contas.forEach(c => mapa[c.id] = { ...c, saldoAtual: 0, saldoAnterior: 0, saldoDRE: 0 });

    lancamentos.forEach(l => {
        const c = mapa[l.conta_id];
        if (!c) return;
        const valor = Number(l.valor);

        // Saldo Atual
        if (l.data <= dataRef) {
            if (l.tipo === 'D') c.saldoAtual += valor; else c.saldoAtual -= valor;
        }
        // Saldo Anterior (para ROI)
        if (l.data <= dataAnt) {
            if (l.tipo === 'D') c.saldoAnterior += valor; else c.saldoAnterior -= valor;
        }
        // DRE (Acumulado)
        if (l.data <= dataRef) {
            if (l.tipo === 'C') c.saldoDRE += valor; else c.saldoDRE -= valor;
        }
    });

    const t = {
        disponivel: 0, estoque: 0, ac: 0, rlp: 0, ativoTotal: 0,
        pc: 0, passivoTotal: 0, pl: 0, lucroLiquido: 0,
        investimentoAtual: 0, investimentoAnterior: 0
    };

    Object.values(mapa).forEach(c => {
        const cod = c.codigo;
        const saldo = c.saldoAtual * (c.natureza || 1);
        const saldoAnt = c.saldoAnterior * (c.natureza || 1);

        if (cod.startsWith('1')) {
            t.ativoTotal += saldo;
            if (cod.startsWith('1.1')) {
                t.ac += saldo;
                if (cod.startsWith('1.1.1') || cod.startsWith('1.1.2')) t.disponivel += saldo;
                if (cod.startsWith('1.1.4') || c.nome.toLowerCase().includes('estoque')) t.estoque += saldo;
            }
            if (cod.startsWith('1.2')) {
                if (cod.startsWith('1.2.1') && c.nome.includes('Receber')) t.rlp += saldo;
                else { t.investimentoAtual += saldo; t.investimentoAnterior += saldoAnt; }
            }
        }
        else if (cod.startsWith('2')) {
            if (cod.startsWith('2.1')) t.pc += saldo;
            if (cod.startsWith('2.1') || cod.startsWith('2.2')) t.passivoTotal += saldo;
        }
        else if (cod.startsWith('3')) t.pl += saldo;
    });

    // Lucro Líquido
    let rec = 0; let desp = 0;
    Object.values(mapa).forEach(c => {
        if (c.codigo.startsWith('5')) rec += c.saldoDRE;
        if (c.codigo.startsWith('4')) desp += c.saldoDRE;
    });
    t.lucroLiquido = rec + desp;
    t.pl += t.lucroLiquido;

    return t;
}

function renderizarTabela(t, tipo, tbody) {
    tbody.innerHTML = '';

    const addLinha = (nome, formula, valor, isPercent = false) => {
        const tr = document.createElement('tr');
        
        // Formata o valor: Se for %, multiplica por 100 e põe %. Senão, só decimal.
        let valStr = '-';
        if (isFinite(valor)) {
            if (isPercent) valStr = (valor * 100).toFixed(2) + '%';
            else valStr = valor.toFixed(4); // 4 casas igual planilha
        }

        tr.innerHTML = `
            <td>
                <div>${nome}</div>
                <span class="formula-mini">${formula}</span>
            </td>
            <td class="valor-ind">${valStr}</td>
        `;
        tbody.appendChild(tr);
    };

    if (tipo === 'liquidez') {
        const i_imediata = t.pc > 0 ? t.disponivel / t.pc : 0;
        const i_seca = t.pc > 0 ? (t.ac - t.estoque) / t.pc : 0;
        const i_corrente = t.pc > 0 ? t.ac / t.pc : 0;
        const i_geral = t.passivoTotal > 0 ? (t.ac + t.rlp) / t.passivoTotal : 0;
        const i_solvencia = t.passivoTotal > 0 ? t.ativoTotal / t.passivoTotal : 0;

        addLinha('Imediata', 'Disponível / PC', i_imediata);
        addLinha('Seca', '(AC - Estoque) / PC', i_seca);
        addLinha('Corrente', 'AC / PC', i_corrente);
        addLinha('Geral', '(AC + RLP) / Passivo Total', i_geral);
        addLinha('Solvência Geral', 'Ativo Total / Passivo Total', i_solvencia);
    } 
    else if (tipo === 'retorno') {
        const roi = t.investimentoAtual > 0 ? t.investimentoAnterior / t.investimentoAtual : 0;
        const roa = t.ativoTotal > 0 ? t.lucroLiquido / t.ativoTotal : 0;
        const roe = t.pl > 0 ? t.lucroLiquido / t.pl : 0;

        addLinha('ROA', 'Lucro Líquido / Ativo Total', roa, true);
        addLinha('ROI', 'Ganho / Custo Invest.', roi, true); 
        addLinha('ROE', 'Lucro Líquido / PL', roe, true);
    }
}