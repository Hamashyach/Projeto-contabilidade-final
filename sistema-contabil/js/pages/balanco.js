import { supabase } from '../config/supabaseClient.js';

// --- INICIALIZAÇÃO ---
configurarTela();

function configurarTela() {
    const btnGerar = document.getElementById('btn-gerar-balanco');
    const btnImprimir = document.getElementById('btn-imprimir-balanco');
    const btnFechamento = document.getElementById('btn-fechamento');
    const dataFimInput = document.getElementById('data-fim');
    const dataInicioInput = document.getElementById('data-inicio');
    
    // Define datas padrão (Mês atual e mês passado)
    const hoje = new Date();
    const mesPassado = new Date();
    mesPassado.setMonth(hoje.getMonth() - 1);
    
    if (dataFimInput) dataFimInput.valueAsDate = hoje;
    if (dataInicioInput) dataInicioInput.valueAsDate = mesPassado;

    if(btnGerar) btnGerar.onclick = gerarBalanco;
    if(btnImprimir) btnImprimir.onclick = () => window.print();
    if(btnFechamento) btnFechamento.onclick = realizarFechamento;
}

let dadosCalculadosAtuais = null;

// --- 1. GERAR BALANÇO ---
async function gerarBalanco() {
    const btnGerar = document.getElementById('btn-gerar-balanco');
    const containerRelatorio = document.getElementById('relatorio-balanco');
    const dataInicioInput = document.getElementById('data-inicio');
    const dataFimInput = document.getElementById('data-fim');

    const empresaId = localStorage.getItem('empresaAtivaId');
    const dataInicio = dataInicioInput ? dataInicioInput.value : null;
    const dataFim = dataFimInput ? dataFimInput.value : null;

    if (!empresaId) return alert("Selecione uma empresa.");
    if (!dataInicio || !dataFim) return alert("Selecione as datas de comparação e atual.");

    btnGerar.textContent = "Carregando...";
    btnGerar.disabled = true;
    
    if(containerRelatorio) containerRelatorio.style.display = 'none';

    try {
        // Busca Plano de Contas
        const resContas = await supabase.from('plano_de_contas').select('*').eq('empresa_id', empresaId).order('codigo');
            
        // Busca Lançamentos (Trazemos tudo até a data fim para poder calcular os dois períodos na memória)
        const resLancamentos = await supabase.from('lancamentos').select('*').eq('empresa_id', empresaId).lte('data', dataFim);

        if (resContas.error) throw resContas.error;
        if (resLancamentos.error) throw resLancamentos.error;

        const contas = resContas.data || [];
        const lancamentos = resLancamentos.data || [];

        // --- CÁLCULO COM DOIS PERÍODOS ---
        dadosCalculadosAtuais = processarBalanco(contas, lancamentos, dataInicio, dataFim);

        // --- RENDERIZAÇÃO ---
        renderizarTelas(dadosCalculadosAtuais);
        
        if(containerRelatorio) containerRelatorio.style.display = 'grid';
        
        const btnPrint = document.getElementById('btn-imprimir-balanco');
        const btnFechar = document.getElementById('btn-fechamento');
        if(btnPrint) btnPrint.style.display = 'inline-block';
        if(btnFechar) btnFechar.style.display = 'inline-block';

    } catch (err) {
        console.error("ERRO:", err);
        alert("Erro ao gerar balanço: " + err.message);
    } finally {
        btnGerar.textContent = "Gerar Balanço";
        btnGerar.disabled = false;
    }
}

// --- 2. PROCESSAMENTO DOS DADOS ---
function processarBalanco(contas, lancamentos, dataAnterior, dataAtual) {
    const mapa = {};
    
    contas.forEach(c => {
        mapa[String(c.id)] = { ...c, saldoAtual: 0, saldoAnterior: 0 };
    });

    // Processa saldos para as duas datas
    lancamentos.forEach(l => {
        const idConta = String(l.conta_id);
        const conta = mapa[idConta];

        if (conta) {
            const valor = Number(l.valor);
            const opera = l.tipo === 'D' ? 1 : -1;
            
            // Saldo na Data Atual (Data Fim)
            // Como a query já filtrou lte dataFim, todo registro conta para o atual
            conta.saldoAtual += (valor * opera);

            // Saldo na Data Anterior (Comparação)
            if (l.data <= dataAnterior) {
                conta.saldoAnterior += (valor * opera);
            }
        }
    });

    const resultado = {
        ativo: { totalAtual: 0, totalAnterior: 0, lista: [] },
        passivo: { totalAtual: 0, totalAnterior: 0, lista: [] },
        pl: { totalAtual: 0, totalAnterior: 0, lista: [] },
        resultadoExercicioAtual: 0,
        resultadoExercicioAnterior: 0
    };

    // Agrupa e soma totais
    Object.values(mapa).forEach(c => {
        // Define grupo pelo primeiro dígito do código se não tiver campo grupo
        let numeroGrupo = c.grupo ? Number(c.grupo) : Number(c.codigo.charAt(0));

        // Contas de Resultado
        if (numeroGrupo >= 4) {
            resultado.resultadoExercicioAtual += c.saldoAtual;
            resultado.resultadoExercicioAnterior += c.saldoAnterior;
            return; 
        }

        const natureza = c.natureza || 1; 
        // Ajusta sinal para exibição (Devedora vs Credora)
        c.saldoFinalAtual = c.saldoAtual * natureza;
        c.saldoFinalAnterior = c.saldoAnterior * natureza;

        // Adiciona ao grupo correto
        if (numeroGrupo === 1) {
            resultado.ativo.totalAtual += c.saldoFinalAtual;
            resultado.ativo.totalAnterior += c.saldoFinalAnterior;
            resultado.ativo.lista.push(c);
        } else if (numeroGrupo === 2) {
            resultado.passivo.totalAtual += c.saldoFinalAtual;
            resultado.passivo.totalAnterior += c.saldoFinalAnterior;
            resultado.passivo.lista.push(c);
        } else if (numeroGrupo === 3) {
            resultado.pl.totalAtual += c.saldoFinalAtual;
            resultado.pl.totalAnterior += c.saldoFinalAnterior;
            resultado.pl.lista.push(c);
        }
    });

    // Processa Apuração do Resultado (Lucro/Prejuízo)
    // Inverte sinal (Lucro é crédito, então vem negativo do cálculo D-C, invertemos para somar no PL)
    const lucroAtual = resultado.resultadoExercicioAtual * -1;
    const lucroAnterior = resultado.resultadoExercicioAnterior * -1;
    
    if (Math.abs(lucroAtual) > 0.001 || Math.abs(lucroAnterior) > 0.001) {
        resultado.pl.lista.push({
            codigo: '',
            nome: 'Resultado do Período (Apuração)',
            saldoFinalAtual: lucroAtual,
            saldoFinalAnterior: lucroAnterior,
            classificacao: 'Patrimônio Líquido',
            grupo: 3
        });
        resultado.pl.totalAtual += lucroAtual;
        resultado.pl.totalAnterior += lucroAnterior;
    }

    return resultado;
}

// --- 3. RENDERIZAÇÃO NA TELA ---
function renderizarTelas(dados) {
    const totalPassivoEPLAtual = dados.passivo.totalAtual + dados.pl.totalAtual;
    
    document.getElementById('lbl-total-ativo').textContent = formatarMoeda(dados.ativo.totalAtual);
    document.getElementById('lbl-total-passivo').textContent = formatarMoeda(totalPassivoEPLAtual);

    // Passamos o Total do Grupo para calcular a AV
    preencherContainer('container-ativo', dados.ativo.lista, dados.ativo.totalAtual, dados.ativo.totalAnterior);
    
    // Para passivo e PL, a base da AV é o Total do Passivo + PL
    const basePassivoAtual = dados.passivo.totalAtual + dados.pl.totalAtual;
    const basePassivoAnterior = dados.passivo.totalAnterior + dados.pl.totalAnterior;

    preencherContainer('container-passivo', dados.passivo.lista, basePassivoAtual, basePassivoAnterior);
    preencherContainer('container-pl', dados.pl.lista, basePassivoAtual, basePassivoAnterior);
}

function preencherContainer(idContainer, listaContas, totalGrupoAtual, totalGrupoAnterior) {
    const container = document.getElementById(idContainer);
    if (!container) return;

    if (listaContas.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:#888;">Nenhuma conta.</div>';
        return;
    }

    const grupos = {};
    listaContas.forEach(c => {
        const nomeGrupo = c.classificacao || 'Outros';
        if (!grupos[nomeGrupo]) grupos[nomeGrupo] = [];
        grupos[nomeGrupo].push(c);
    });

    let html = '';
    
    Object.keys(grupos).sort().forEach(grupoNome => {
        html += `<div class="grupo-titulo">${grupoNome}</div>`;
        
        const contasDoGrupo = grupos[grupoNome].sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));

        contasDoGrupo.forEach(c => {
            // Cálculos de AV e AH
            const valAtual = c.saldoFinalAtual;
            const valAnt = c.saldoFinalAnterior;
            
            // AV = (Valor Conta / Total Grupo) * 100
            const avAtual = totalGrupoAtual !== 0 ? (valAtual / totalGrupoAtual) * 100 : 0;
            const avAnt = totalGrupoAnterior !== 0 ? (valAnt / totalGrupoAnterior) * 100 : 0;
            
            // AH = ((Valor Atual / Valor Ant) - 1) * 100
            let ah = 0;
            if (valAnt !== 0) {
                ah = ((valAtual / valAnt) - 1) * 100;
            } else if (valAtual !== 0) {
                ah = 100; // Se não tinha nada e agora tem, cresceu 100% (ou tratar como Infinito)
            }

            const classAh = ah >= 0 ? 'ah-pos' : 'ah-neg';
            
            // Se ambos forem zero, esconde ou deixa cinza
            if (Math.abs(valAtual) < 0.01 && Math.abs(valAnt) < 0.01) return;

            html += `
                <div class="linha-conta">
                    <span class="nome-conta" title="${c.nome}">${c.codigo ? c.codigo : ''} ${c.nome}</span>
                    
                    <span class="valor-col">${formatarMoeda(valAtual)}</span>
                    <span class="perc-col">${avAtual.toFixed(1)}%</span>
                    
                    <span class="valor-col" style="color:#777;">${formatarMoeda(valAnt)}</span>
                    <span class="perc-col">${avAnt.toFixed(1)}%</span>
                    
                    <span class="valor-col ${classAh}">${ah.toFixed(1)}%</span>
                </div>
            `;
        });
    });

    container.innerHTML = html;
}

// --- 4. FECHAMENTO MENSAL ---
// --- 4. FECHAMENTO MENSAL (Salvar Histórico) ---
async function realizarFechamento() {
    // Verifica se há dados calculados na memória
    if (!dadosCalculadosAtuais) return alert("Gere o balanço primeiro.");
    
    const empresaId = localStorage.getItem('empresaAtivaId');
    const dataFimInput = document.getElementById('data-fim');
    const dataFechamento = dataFimInput.value; // Data do fechamento é a Data Fim selecionada
    const btnFechamento = document.getElementById('btn-fechamento');

    if (!dataFechamento) return alert("Selecione uma data de fim.");
    
    const confirmacao = confirm(
        `ATENÇÃO: Você está prestes a fechar o balanço em ${dataFechamento}.\n\n` +
        `Isso salvará os saldos atuais como histórico para consultas futuras.\n` +
        `Se já houver um fechamento nesta data, ele será sobrescrito.\n\n` +
        `Deseja continuar?`
    );

    if(!confirmacao) return;

    btnFechamento.textContent = "Salvando...";
    btnFechamento.disabled = true;

    try {
        // 1. Coletar todas as contas das listas (Ativo, Passivo, PL)
        const todasListas = [
            ...dadosCalculadosAtuais.ativo.lista,
            ...dadosCalculadosAtuais.passivo.lista,
            ...dadosCalculadosAtuais.pl.lista
        ];

        const registrosParaSalvar = [];

        todasListas.forEach(c => {
            // Só salvamos contas que:
            // 1. Têm ID real (ignoramos totais calculados ou linhas de título)
            // 2. Têm saldo diferente de zero (para economizar espaço no banco)
            // 3. Ignoramos a linha 'Resultado do Período' (pois ela não tem ID de conta real)
            
            if (c.id && Math.abs(c.saldoFinalAtual) > 0.00) {
                registrosParaSalvar.push({
                    empresa_id: empresaId,
                    conta_id: c.id,
                    data_fechamento: dataFechamento,
                    saldo: c.saldoFinalAtual // Salvamos o saldo JÁ com o sinal correto da natureza
                });
            }
        });

        if (registrosParaSalvar.length === 0) {
            throw new Error("Não há saldos para fechar nesta data.");
        }

        // 2. Apagar fechamento anterior SE existir para essa mesma data e empresa
        // (Isso evita duplicidade se você fechar o mês duas vezes)
        const { error: errorDelete } = await supabase
            .from('fechamentos')
            .delete()
            .eq('empresa_id', empresaId)
            .eq('data_fechamento', dataFechamento);

        if (errorDelete) throw errorDelete;

        // 3. Inserir os novos registros
        const { error: errorInsert } = await supabase
            .from('fechamentos')
            .insert(registrosParaSalvar);

        if (errorInsert) throw errorInsert;

        alert(`Fechamento realizado com sucesso!\n${registrosParaSalvar.length} saldos de contas foram salvos.`);

    } catch (err) {
        console.error("Erro no fechamento:", err);
        alert("Erro ao realizar fechamento: " + err.message);
    } finally {
        btnFechamento.textContent = "🔒 Realizar Fechamento";
        btnFechamento.disabled = false;
    }
}

function formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}