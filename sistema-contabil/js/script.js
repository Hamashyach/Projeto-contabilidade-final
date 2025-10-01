document.addEventListener('DOMContentLoaded', () => {
    const mainContent = document.querySelector('.content');

    // Inicializa o seletor de empresas assim que a página carrega
    initializeCompanySelector();

    // Adiciona listeners para os links do menu
    document.querySelector('a[href="#cadastro-empresa"]').addEventListener('click', e => {
        e.preventDefault();
        loadContent('cadastro-empresa.html');
    });

    document.querySelector('a[href="#setup"]').addEventListener('click', e => {
        e.preventDefault();
        loadContent('setup.html');
    });

     document.querySelector('a[href="#livro-diario"]').addEventListener('click', e => {
        e.preventDefault();
        loadContent('livro-diario.html');
    });

    document.querySelector('a[href="#livro-razao"]').addEventListener('click', e => {
        e.preventDefault();
        loadContent('livro-razao.html');
    });

    document.querySelector('a[href="#balancete"]').addEventListener('click', e => {
        e.preventDefault();
        loadContent('balancete.html');
    });

    document.querySelector('a[href="#balanco-patrimonial"]').addEventListener('click', e => {
        e.preventDefault();
        loadContent('balanco-patrimonial.html');
    });

    // Função principal para carregar conteúdo
    async function loadContent(page) {
        try {
            const response = await fetch(page);
            if (!response.ok) throw new Error('Página não encontrada.');
            mainContent.innerHTML = await response.text();
            
            if (page === 'cadastro-empresa.html') setupCadastroForm();
            if (page === 'setup.html') setupPlanoDeContas();
            if (page === 'livro-diario.html') setupLivroDiario();
            if (page === 'livro-razao.html') setupLivroRazao();
            if (page === 'balancete.html') setupBalancete();
            if (page === 'balanco-patrimonial.html') setupBalancoPatrimonial();

        } catch (error) {
            mainContent.innerHTML = `<p style="color: red;">Erro ao carregar conteúdo: ${error.message}</p>`;
        }
    }

    // --- LÓGICA DO SELETOR DE EMPRESA ---
    async function initializeCompanySelector() {
        const selectElement = document.getElementById('company-select');
        const { data: empresas, error } = await supabaseClient.from('empresas').select('*').order('nome_fantasia');
        if (error) {
            selectElement.innerHTML = '<option>Erro ao carregar</option>';
            return;
        }
        selectElement.innerHTML = '<option value="">-- Selecione uma empresa --</option>';
        empresas.forEach(empresa => {
            const option = document.createElement('option');
            option.value = empresa.id;
            option.textContent = `${empresa.nome_fantasia || empresa.razao_social} (${empresa.cnpj})`;
            selectElement.appendChild(option);
        });
        const empresaAtivaId = localStorage.getItem('empresaAtivaId');
        if (empresaAtivaId) {
            selectElement.value = empresaAtivaId;
        }
        selectElement.addEventListener('change', () => {
            const selectedId = selectElement.value;
            if (selectedId) {
                localStorage.setItem('empresaAtivaId', selectedId);
                alert(`Empresa ativa foi alterada!`);
                window.location.reload();
            } else {
                localStorage.removeItem('empresaAtivaId');
            }
        });
    }

    // --- LÓGICA DO CADASTRO DE EMPRESA ---
    function setupCadastroForm() {
        const form = document.getElementById('form-cadastro-empresa');
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(form);
            const empresa = {
                cnpj: formData.get('cnpj'),
                razao_social: formData.get('razao_social'),
                nome_fantasia: formData.get('nome_fantasia'),
            };

            const { data: novaEmpresa, error } = await supabaseClient
                .from('empresas')
                .insert(empresa)
                .select()
                .single();

            if (error) {
                alert(`Erro ao salvar a empresa: ${error.message}`);
                return;
            }
            
            alert('Empresa cadastrada! Agora, importando o plano de contas padrão...');
            const sucesso = await popularPlanoDeContas(novaEmpresa.id);

            if (sucesso) {
                alert('Plano de contas importado com sucesso! A página será recarregada.');
                
                localStorage.setItem('empresaAtivaId', novaEmpresa.id);

                window.location.reload();
            } else  {
                alert('A empresa foi criada, mas houve um erro ao importar o plano de contas. Verifique o console.');
            }
        });
    }

    // --- LÓGICA DO SETUP (PLANO DE CONTAS) ---
 async function setupPlanoDeContas() {
    const empresaAtivaId = localStorage.getItem('empresaAtivaId');
    const corpoTabela = document.getElementById('corpo-tabela-contas');
    
    if (!empresaAtivaId) {
        corpoTabela.innerHTML = `<tr><td colspan="7"><b>Por favor, selecione uma empresa ativa para ver o plano de contas.</b></td></tr>`;
        return;
    }

    // --- Dados para popular os <select> ---
    const OPCOES = {
        classificacao: ['Ativo Circulante', 'Ativo Não Circulante', 'Passivo Circulante', 'Passivo Não Circulante', 'Patrimônio Líquido', 'Receita', 'Despesa'],
        grupo: ['1 - Ativo', '2 - Ativo Não Circulante', '3 - Passivo Circulante', '4 - Passivo Não Circulante', '5 - Patrimônio Líquido', '6 - Despesa', '7 - Receita', '8 - Apuração'],
        subgrupo: ['1', '2', '3', '4', '5', '6', '7', '8'] // Simplificado, pode ser expandido
    };

    // --- Lógica do formulário de nova conta ---
    const formContainer = document.getElementById('form-container-nova-conta');
    const btnNovaConta = document.getElementById('btn-nova-conta');
    const btnCancelar = document.getElementById('btn-cancelar-nova-conta');
    const formNovaConta = document.getElementById('form-nova-conta');
    
    const classificacaoSelect = document.getElementById('new-conta-classificacao');
    const grupoSelect = document.getElementById('new-conta-grupo');
    const subgrupoSelect = document.getElementById('new-conta-subgrupo');
    const elementoInput = document.getElementById('new-conta-elemento');
    const codigoInput = document.getElementById('new-conta-codigo');

    // Função para popular os dropdowns
    function popularDropdowns() {
        OPCOES.classificacao.forEach(item => classificacaoSelect.innerHTML += `<option value="${item}">${item}</option>`);
        OPCOES.grupo.forEach(item => {
            const valor = item.split(' ')[0]; // Pega só o número
            grupoSelect.innerHTML += `<option value="${valor}">${item}</option>`;
        });
        OPCOES.subgrupo.forEach(item => subgrupoSelect.innerHTML += `<option value="${item}">${item}</option>`);
    }

    // Função para gerar o próximo código
    async function gerarProximoCodigo() {
        const grupo = grupoSelect.value;
        const subgrupo = subgrupoSelect.value;

        if (!grupo || !subgrupo) {
            elementoInput.value = '';
            codigoInput.value = '';
            return;
        }

        const { data, error } = await supabaseClient
            .from('plano_de_contas')
            .select('elemento')
            .eq('empresa_id', empresaAtivaId)
            .eq('grupo', grupo)
            .eq('sub_grupo', subgrupo)
            .order('elemento', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error("Erro ao buscar último elemento:", error);
            return;
        }

        let proximoElemento = 1;
        if (data) {
            proximoElemento = parseInt(data.elemento, 10) + 1;
        }
        
        elementoInput.value = proximoElemento;
        codigoInput.value = `${grupo}.${subgrupo}.${proximoElemento}`;
    }

    // Adiciona "ouvintes" para os menus de seleção
    grupoSelect.addEventListener('change', gerarProximoCodigo);
    subgrupoSelect.addEventListener('change', gerarProximoCodigo);

    btnNovaConta.addEventListener('click', () => formContainer.style.display = 'block');
    btnCancelar.addEventListener('click', () => {
        formNovaConta.reset();
        gerarProximoCodigo();
        formContainer.style.display = 'none';
    });
    
    // Lógica de envio do formulário
    formNovaConta.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(formNovaConta);
        const novaConta = {
            codigo: formData.get('codigo'),
            nome: formData.get('nome'),
            grupo: formData.get('grupo'),
            sub_grupo: formData.get('sub_grupo'),
            elemento: formData.get('elemento'),
            classificacao: formData.get('classificacao'),
            natureza: parseInt(formData.get('natureza')),
            empresa_id: empresaAtivaId
        };
        
        if (!novaConta.codigo) {
            alert("Por favor, selecione o Grupo e Subgrupo para gerar o código da conta.");
            return;
        }

        const { error } = await supabaseClient.from('plano_de_contas').insert([novaConta]);
        if (error) {
            alert(`Erro ao salvar a conta: ${error.message}`);
        } else {
            alert('Conta salva com sucesso!');
            formNovaConta.reset();
            gerarProximoCodigo();
            formContainer.style.display = 'none';
            carregarContas();
        }
    });

    // Função para buscar e renderizar as contas
    async function carregarContas() {
        const { data: contas, error } = await supabaseClient
            .from('plano_de_contas')
            .select('*')
            .eq('empresa_id', empresaAtivaId)
            .order('codigo');

        if (error) {
            alert('Erro ao carregar o plano de contas.');
            return;
        }

        corpoTabela.innerHTML = '';
        contas.forEach(conta => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${conta.codigo}</td>
                <td>${conta.nome}</td>
                <td>${conta.classificacao || ''}</td>
                <td>${conta.grupo || ''}</td>
                <td>${conta.sub_grupo || ''}</td>
                <td>${conta.elemento || ''}</td>
                <td>${conta.natureza === 1 ? 'Devedora' : 'Credora'}</td>
            `;
            corpoTabela.appendChild(tr);
        });
    }

    // Inicializa a tela
    popularDropdowns();
    carregarContas();
}

    // --- FUNÇÃO PARA POPULAR O PLANO DE CONTAS DE UMA EMPRESA ---
    async function popularPlanoDeContas(empresaId) {
        const { data: contasPadrao, error: errorBusca } = await supabaseClient
            .from('plano_de_contas_padrao')
            .select('*');

        if (errorBusca) {
            console.error('Erro ao buscar contas padrão:', errorBusca);
            return false;
        }

        const novasContas = contasPadrao.map(conta => ({
            empresa_id: empresaId,
            grupo: conta.grupo,
            sub_grupo: conta.sub_grupo,
            elemento: conta.elemento,
            codigo: conta.codigo,
            nome: conta.nome,
            classificacao: conta.classificacao,
            natureza: conta.natureza,
        }));

        const { error: errorInsert } = await supabaseClient
            .from('plano_de_contas')
            .insert(novasContas);

        if (errorInsert) {
            console.error('Erro ao inserir plano de contas para nova empresa:', errorInsert);
            return false;
        }

        return true;
    }

});

// --- LÓGICA DO LIVRO DIÁRIO ---
    async function setupLivroDiario() {
    const empresaAtivaId = localStorage.getItem('empresaAtivaId');
    const corpoTabela = document.getElementById('corpo-tabela-livro-diario');
    
    if (!empresaAtivaId) {
        corpoTabela.innerHTML = `<tr><td colspan="6"><b>Selecione uma empresa ativa para ver o Livro Diário.</b></td></tr>`;
        return;
    }

    // --- Elementos do formulário ---
    const formContainer = document.getElementById('form-container-novo-lancamento');
    const btnNovoLancamento = document.getElementById('btn-novo-lancamento');
    const btnCancelar = document.getElementById('btn-cancelar-novo-lancamento');
    const formNovoLancamento = document.getElementById('form-novo-lancamento');
    const formTitle = document.getElementById('form-title');
    const editingPartidaIdInput = document.getElementById('editing-partida-id');
    const contaDebitoSelect = document.getElementById('conta-debito');
    const contaCreditoSelect = document.getElementById('conta-credito');
    
    let todosLancamentos = []; // Armazena os lançamentos carregados para usar na edição

    // Popula os dropdowns de contas
    const { data: contas } = await supabaseClient.from('plano_de_contas').select('id, codigo, nome').eq('empresa_id', empresaAtivaId).order('codigo');
    contaDebitoSelect.innerHTML = '<option value="">-- Selecione --</option>';
    contaCreditoSelect.innerHTML = '<option value="">-- Selecione --</option>';
    contas.forEach(c => {
        const option = `<option value="${c.id}">${c.codigo} - ${c.nome}</option>`;
        contaDebitoSelect.innerHTML += option;
        contaCreditoSelect.innerHTML += option;
    });

    // --- Lógica para carregar e exibir os lançamentos ---
    async function carregarLancamentos() {
        const { data, error } = await supabaseClient
            .from('lancamentos')
            .select(`partida_id, data, historico, valor, tipo, plano_de_contas ( id, codigo, nome )`)
            .eq('empresa_id', empresaAtivaId)
            .order('data', { ascending: false })
            .order('partida_id', { ascending: false });

        if (error) {
            alert('Erro ao carregar lançamentos.');
            return;
        }
        
        todosLancamentos = data; // Salva os dados para uso posterior
        corpoTabela.innerHTML = '';

        // Agrupa os lançamentos por partida_id
        const partidas = new Map();
        todosLancamentos.forEach(l => {
            if (!partidas.has(l.partida_id)) {
                partidas.set(l.partida_id, { debito: null, credito: null });
            }
            if (l.tipo === 'D') partidas.get(l.partida_id).debito = l;
            if (l.tipo === 'C') partidas.get(l.partida_id).credito = l;
        });

        // Renderiza a tabela
        for (const [partida_id, lancamento] of partidas.entries()) {
            if (!lancamento.debito || !lancamento.credito) continue; // Ignora partidas incompletas

            const dataFormatada = new Date(lancamento.debito.data + 'T00:00:00').toLocaleDateString('pt-BR');
            const valorFormatado = lancamento.debito.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            const trDebito = document.createElement('tr');
            trDebito.innerHTML = `
                <td>${dataFormatada}</td>
                <td>${lancamento.debito.plano_de_contas.codigo} - ${lancamento.debito.plano_de_contas.nome}</td>
                <td>${lancamento.debito.historico}</td>
                <td style="color: #c0392b;">${valorFormatado}</td>
                <td></td>
                <td rowspan="2" style="vertical-align: middle; text-align: center;">
                    <div class="action-buttons">
                        <button class="btn-action btn-edit" data-partida-id="${partida_id}">Editar</button>
                    </div>
                </td>
            `;

            const trCredito = document.createElement('tr');
            trCredito.style.borderBottom = "2px solid #34495e"; // Adiciona uma borda para separar as partidas
            trCredito.innerHTML = `
                <td></td>
                <td>${lancamento.credito.plano_de_contas.codigo} - ${lancamento.credito.plano_de_contas.nome}</td>
                <td></td>
                <td></td>
                <td style="color: #27ae60;">${valorFormatado}</td>
            `;

            corpoTabela.appendChild(trDebito);
            corpoTabela.appendChild(trCredito);
        }
    }

    // --- Lógica do formulário (Criar e Editar) ---
    function abrirFormulario(modo = 'novo', partida_id = null) {
        formNovoLancamento.reset();
        editingPartidaIdInput.value = '';
        
        if (modo === 'editar') {
            const partida = Array.from(new Map(todosLancamentos.map(l => [l.partida_id, l])).values()).find(l => l.partida_id == partida_id);
            const debito = todosLancamentos.find(l => l.partida_id == partida_id && l.tipo === 'D');
            const credito = todosLancamentos.find(l => l.partida_id == partida_id && l.tipo === 'C');
            
            if (!debito || !credito) return;
            
            formTitle.textContent = 'Editar Lançamento';
            editingPartidaIdInput.value = partida_id;
            
            // Preenche o formulário com os dados existentes
            formNovoLancamento.querySelector('#data-lancamento').value = debito.data;
            formNovoLancamento.querySelector('#conta-debito').value = debito.plano_de_contas.id;
            formNovoLancamento.querySelector('#conta-credito').value = credito.plano_de_contas.id;
            formNovoLancamento.querySelector('#historico').value = debito.historico;
            formNovoLancamento.querySelector('#valor').value = debito.valor;

        } else {
            formTitle.textContent = 'Novo Lançamento';
        }
        formContainer.style.display = 'block';
    }

    btnNovoLancamento.addEventListener('click', () => abrirFormulario('novo'));
    btnCancelar.addEventListener('click', () => formContainer.style.display = 'none');

    formNovoLancamento.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(formNovoLancamento);
        const partidaIdParaSalvar = formData.get('editing_partida_id') || Date.now();
        
        // Se estiver editando, primeiro apaga os registros antigos
        if (formData.get('editing_partida_id')) {
            const { error: deleteError } = await supabaseClient.from('lancamentos').delete().eq('partida_id', partidaIdParaSalvar);
            if (deleteError) {
                alert(`Erro ao apagar o lançamento antigo: ${deleteError.message}`);
                return;
            }
        }

        // Cria os novos registros (seja para edição ou novo lançamento)
        const registros = [
            { partida_id: partidaIdParaSalvar, data: formData.get('data'), historico: formData.get('historico'), valor: parseFloat(formData.get('valor')), tipo: 'D', empresa_id: empresaAtivaId, conta_id: formData.get('conta_debito') },
            { partida_id: partidaIdParaSalvar, data: formData.get('data'), historico: formData.get('historico'), valor: parseFloat(formData.get('valor')), tipo: 'C', empresa_id: empresaAtivaId, conta_id: formData.get('conta_credito') }
        ];

        const { error } = await supabaseClient.from('lancamentos').insert(registros);
        if (error) {
            alert(`Erro ao salvar lançamento: ${error.message}`);
        } else {
            alert('Lançamento salvo com sucesso!');
            formContainer.style.display = 'none';
            carregarLancamentos();
        }
    });

    // --- Lógica dos botões de ação na tabela ---
    corpoTabela.addEventListener('click', (event) => {
        const target = event.target.closest('.btn-edit');
        if (target) {
            const partidaId = target.dataset.partidaId;
            abrirFormulario('editar', partidaId);
        }
    });

    // Carrega tudo ao iniciar a tela
    carregarLancamentos();
}

// --- LÓGICA DO LIVRO RAZÃO ---
async function setupLivroRazao() {
    const empresaAtivaId = localStorage.getItem('empresaAtivaId');
    const razaoContainer = document.getElementById('razao-container');
    const contaSelect = document.getElementById('razao-conta-select');
    const btnGerar = document.getElementById('btn-gerar-razao');

    if (!empresaAtivaId) {
        contaSelect.innerHTML = '<option>Selecione uma empresa primeiro</option>';
        btnGerar.disabled = true;
        return;
    }

    // Popula o dropdown com as contas da empresa
    const { data: contas, error: errorContas } = await supabaseClient
        .from('plano_de_contas')
        .select('id, codigo, nome, natureza')
        .eq('empresa_id', empresaAtivaId)
        .order('codigo');
    
    if (errorContas) {
        alert('Erro ao carregar o plano de contas.');
        return;
    }

    contaSelect.innerHTML = '<option value="">-- Selecione uma conta --</option>';
    contas.forEach(c => {
        contaSelect.innerHTML += `<option value="${c.id}">${c.codigo} - ${c.nome}</option>`;
    });

    // Ação do botão "Gerar Razão"
    btnGerar.addEventListener('click', async () => {
        const contaId = contaSelect.value;
        if (!contaId) {
            alert('Por favor, selecione uma conta.');
            return;
        }

        const contaSelecionada = contas.find(c => c.id === contaId);

        // Busca todos os lançamentos para a conta selecionada
        const { data: lancamentos, error } = await supabaseClient
            .from('lancamentos')
            .select('data, historico, valor, tipo')
            .eq('empresa_id', empresaAtivaId)
            .eq('conta_id', contaId)
            .order('data');

        if (error) {
            alert('Erro ao buscar os lançamentos para esta conta.');
            return;
        }

        // Preenche as tabelas de débito e crédito
        const corpoDebito = document.getElementById('razao-corpo-debito');
        const corpoCredito = document.getElementById('razao-corpo-credito');
        corpoDebito.innerHTML = '';
        corpoCredito.innerHTML = '';
        
        let totalDebito = 0;
        let totalCredito = 0;

        lancamentos.forEach(l => {
            const tr = document.createElement('tr');
            const dataFormatada = new Date(l.data + 'T00:00:00').toLocaleDateString('pt-BR');
            const valorFormatado = l.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            tr.innerHTML = `<td>${dataFormatada}</td><td>${l.historico}</td><td>${valorFormatado}</td>`;

            if (l.tipo === 'D') {
                corpoDebito.appendChild(tr);
                totalDebito += l.valor;
            } else {
                corpoCredito.appendChild(tr);
                totalCredito += l.valor;
            }
        });

        // Calcula o saldo final
        const saldoFinal = (totalDebito - totalCredito) * contaSelecionada.natureza;
        const tipoSaldo = saldoFinal >= 0 ? 'Devedor' : 'Credor';

        // Atualiza os totais e o saldo no rodapé
        document.getElementById('razao-titulo-conta').textContent = `${contaSelecionada.codigo} - ${contaSelecionada.nome}`;
        document.getElementById('razao-total-debito').textContent = `Total Débitos: ${totalDebito.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
        document.getElementById('razao-total-credito').textContent = `Total Créditos: ${totalCredito.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
        document.getElementById('razao-saldo-final').textContent = `Saldo Final: ${Math.abs(saldoFinal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${tipoSaldo})`;
        
        razaoContainer.style.display = 'block';
    });

}
    // --- LÓGICA DO BALANCETE ---
    async function setupBalancete() {
    const empresaAtivaId = localStorage.getItem('empresaAtivaId');
    const corpoTabela = document.getElementById('corpo-tabela-balancete');
    const rodapeTabela = document.getElementById('rodape-tabela-balancete');
    const btnGerar = document.getElementById('btn-gerar-balancete');
    const dataInicioInput = document.getElementById('data-inicio');
    const dataFimInput = document.getElementById('data-fim');

    if (!btnGerar || !dataInicioInput || !dataFimInput) {
        console.error("ERRO: Elementos do formulário de filtro não encontrados no HTML.");
        return;
    }

    if (!empresaAtivaId) {
        corpoTabela.innerHTML = `<tr><td colspan="8"><b>Selecione uma empresa ativa primeiro.</b></td></tr>`;
        btnGerar.disabled = true;
        return;
    }
    
    // Define as datas padrão (início do mês e hoje)
    const hoje = new Date();
    const primeiroDiaDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    dataInicioInput.valueAsDate = primeiroDiaDoMes;
    dataFimInput.valueAsDate = hoje;


    btnGerar.addEventListener('click', async () => {
        const dataInicio = dataInicioInput.value;
        const dataFim = dataFimInput.value;

        if (!dataInicio || !dataFim) {
            alert("Por favor, selecione a Data de Início e a Data de Fim.");
            return;
        }

        corpoTabela.innerHTML = `<tr><td colspan="8">Gerando relatório, por favor aguarde...</td></tr>`;

        // 1. Busca todas as contas e TODOS os lançamentos até a data final.
        const [
            { data: contas, error: errorContas },
            { data: lancamentos, error: errorLancamentos }
        ] = await Promise.all([
            supabaseClient.from('plano_de_contas').select('*').eq('empresa_id', empresaAtivaId),
            supabaseClient.from('lancamentos').select('conta_id, valor, tipo, data').eq('empresa_id', empresaAtivaId).lte('data', dataFim)
        ]);

        if (errorContas || errorLancamentos) {
            alert('Erro ao buscar dados para o balancete.');
            return;
        }

        // 2. Processa os lançamentos para calcular saldos
        const movimentos = new Map();
        contas.forEach(c => movimentos.set(c.id, { ...c, saldoAnterior: 0, movDebito: 0, movCredito: 0 }));

        lancamentos.forEach(l => {
            if (!movimentos.has(l.conta_id)) return;
            
            const valor = l.tipo === 'D' ? l.valor : -l.valor;

            if (l.data < dataInicio) { // Lançamentos ANTES do período
                movimentos.get(l.conta_id).saldoAnterior += valor;
            } else { // Lançamentos DENTRO do período
                if (l.tipo === 'D') movimentos.get(l.conta_id).movDebito += l.valor;
                else movimentos.get(l.conta_id).movCredito += l.valor;
            }
        });
        
        // 3. Renderiza a tabela
        let totais = { movDebito: 0, movCredito: 0, finalDebito: 0, finalCredito: 0, antDebito: 0, antCredito: 0 };
        
        corpoTabela.innerHTML = '';
        const contasOrdenadas = Array.from(movimentos.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));

        contasOrdenadas.forEach(conta => {
            // Só exibe contas que tiveram saldo anterior ou movimentação
            if (conta.saldoAnterior === 0 && conta.movDebito === 0 && conta.movCredito === 0) return;
            
            // Separa o saldo anterior em Débito ou Crédito
            const saldoAntComNatureza = conta.saldoAnterior * conta.natureza;
            const saldoAntDebito = saldoAntComNatureza > 0 ? saldoAntComNatureza : 0;
            const saldoAntCredito = saldoAntComNatureza < 0 ? -saldoAntComNatureza : 0;
            
            // Cálculo do Saldo Final
            const saldoFinalNumerico = conta.saldoAnterior + conta.movDebito - conta.movCredito;
            const saldoFinalComNatureza = saldoFinalNumerico * conta.natureza;
            const saldoFinalDebito = saldoFinalComNatureza > 0 ? saldoFinalComNatureza : 0;
            const saldoFinalCredito = saldoFinalComNatureza < 0 ? -saldoFinalComNatureza : 0;
            
            // Soma aos totais gerais
            totais.antDebito += saldoAntDebito;
            totais.antCredito += saldoAntCredito;
            totais.movDebito += conta.movDebito;
            totais.movCredito += conta.movCredito;
            totais.finalDebito += saldoFinalDebito;
            totais.finalCredito += saldoFinalCredito;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${conta.codigo}</td>
                <td>${conta.nome}</td>
                <td>${saldoAntDebito.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>${saldoAntCredito.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>${conta.movDebito.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>${conta.movCredito.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>${saldoFinalDebito.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>${saldoFinalCredito.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            `;
            corpoTabela.appendChild(tr);
        });

        // 4. Renderiza o rodapé com os totais
        rodapeTabela.innerHTML = `
            <tr>
                <td colspan="2">TOTAIS</td>
                <td>${totais.antDebito.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>${totais.antCredito.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>${totais.movDebito.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>${totais.movCredito.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>${totais.finalDebito.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>${totais.finalCredito.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            </tr>
        `;
        
        if (totais.movDebito.toFixed(2) !== totais.movCredito.toFixed(2)) {
            alert('Atenção! A soma dos débitos do período é diferente da soma dos créditos.');
        }
    });
}

// --- LÓGICA DO BALANÇO PATRIMONIAL ---
async function setupBalancoPatrimonial() {
    const empresaAtivaId = localStorage.getItem('empresaAtivaId');
    const balancoContainer = document.getElementById('balanco-container');
    const btnGerar = document.getElementById('btn-gerar-balanco');
    const dataFimInput = document.getElementById('data-fim-balanco');

    if (!btnGerar || !dataFimInput) {
        console.error("ERRO: Elementos do formulário de filtro não encontrados no HTML.");
        return;
    }

    if (!empresaAtivaId) {
        balancoContainer.innerHTML = `<p><b>Selecione uma empresa ativa primeiro.</b></p>`;
        btnGerar.disabled = true;
        return;
    }

    // Define a data padrão como hoje
    dataFimInput.valueAsDate = new Date();

    const MAPA_NOMES = { /* ... (pode manter seu mapa de nomes aqui se tiver um) ... */ };

    btnGerar.addEventListener('click', async () => {
        const dataFim = dataFimInput.value;
        if (!dataFim) {
            alert("Por favor, selecione a data para gerar o balanço.");
            return;
        }

        balancoContainer.innerHTML = `<p>Gerando relatório, por favor aguarde...</p>`;

        // 1. Busca todas as contas e os lançamentos ATÉ a data final selecionada.
        const [
            { data: contas, error: errorContas },
            { data: lancamentos, error: errorLancamentos }
        ] = await Promise.all([
            supabaseClient.from('plano_de_contas').select('*').eq('empresa_id', empresaAtivaId),
            supabaseClient.from('lancamentos').select('conta_id, valor, tipo').eq('empresa_id', empresaAtivaId).lte('data', dataFim)
        ]);

        if (errorContas || errorLancamentos) {
            alert('Erro ao buscar dados para o balanço.');
            return;
        }

        // 2. Calcula o saldo final de cada conta na data especificada
        const saldos = new Map();
        contas.forEach(c => saldos.set(c.id, { ...c, saldoFinal: 0 }));
        lancamentos.forEach(l => {
            const conta = saldos.get(l.conta_id);
            if (conta) {
                const valor = l.tipo === 'D' ? l.valor : -l.valor;
                // Multiplica pela natureza para ter o saldo correto (positivo para devedora, negativo para credora)
                conta.saldoFinal += valor * conta.natureza; 
            }
        });

        // 3. Constrói a estrutura hierárquica 
        const estrutura = {};
        saldos.forEach(conta => {
            if (conta.saldoFinal === 0) return;
            const { grupo, sub_grupo, elemento } = conta;
            if (!estrutura[grupo]) estrutura[grupo] = {};
            if (!estrutura[grupo][sub_grupo]) estrutura[grupo][sub_grupo] = {};
            if (!estrutura[grupo][sub_grupo][elemento]) estrutura[grupo][sub_grupo][elemento] = [];
            estrutura[grupo][sub_grupo][elemento].push(conta);
        });

        // 4. A lógica de renderização hierárquica 
        const renderizarSecao = (gruposParaRenderizar, tituloSecao) => {
           
            let html = `<div class="bp-section-title">${tituloSecao}</div>`;
            let totalSecao = 0;
            html += '<table class="bp-table">';
            for (const grupoId of gruposParaRenderizar) {
                if (!estrutura[grupoId]) continue;
                let totalGrupo = 0;
                const nomeGrupo = MAPA_NOMES[grupoId]?.nome || `Grupo ${grupoId}`;
                html += `<tr class="bp-group-header"><td colspan="2">${nomeGrupo}</td></tr>`;
                for (const subgrupoId in estrutura[grupoId]) {
                    for (const elementoId in estrutura[grupoId][subgrupoId]) {
                        const contasDoElemento = estrutura[grupoId][subgrupoId][elementoId];
                        contasDoElemento.sort((a,b) => a.codigo.localeCompare(b.codigo));
                        contasDoElemento.forEach(conta => {
                            totalGrupo += conta.saldoFinal;
                            html += `<tr class="bp-account-row">
                                        <td>${conta.codigo} - ${conta.nome}</td>
                                        <td>${Math.abs(conta.saldoFinal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                     </tr>`;
                        });
                    }
                }
                totalSecao += totalGrupo;
                html += `<tr class="bp-subtotal-row">
                            <td class="total-tipo">Total ${nomeGrupo}</td>
                            <td>${totalGrupo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                         </tr>`;
            }
            html += '</table>';
            html += `<table class="bp-table"><tr class="bp-grand-total-row">
                        <td>TOTAL ${tituloSecao}</td>
                        <td>${totalSecao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                     </tr></table>`;
            return { html, total: totalSecao };
        };
        
        // 5. Renderiza o relatório completo
        const ativo = renderizarSecao(['1', '2'], 'ATIVO');
        const passivo = renderizarSecao(['3', '4'], 'PASSIVO');
        const pl = renderizarSecao(['5'], 'PATRIMÔNIO LÍQUIDO');

        const resultadoReceitas = Array.from(saldos.values()).filter(c => c.classificacao === 'Receita').reduce((acc, c) => acc + c.saldoFinal, 0);
        const resultadoDespesas = Array.from(saldos.values()).filter(c => c.classificacao === 'Despesa').reduce((acc, c) => acc + c.saldoFinal, 0);
        const resultadoExercicio = Math.abs(resultadoReceitas) - resultadoDespesas;

        let resultadoHtml = '';
        if (resultadoExercicio !== 0) {
            resultadoHtml = `<table class="bp-table">
                                <tr class="bp-account-row">
                                    <td>Resultado do Exercício</td>
                                    <td>${Math.abs(resultadoExercicio).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                </tr>
                             </table>`;
        }
        
        const totalPassivoEPL = passivo.total + pl.total + resultadoExercicio;

        const totalPassivoEPLHtml = `<table class="bp-table"><tr class="bp-grand-total-row">
                                        <td>TOTAL PASSIVO E PATRIMÔNIO LÍQUIDO</td>
                                        <td>${totalPassivoEPL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                     </tr></table>`;

        balancoContainer.innerHTML = ativo.html + passivo.html + pl.html + resultadoHtml + totalPassivoEPLHtml;

        if (ativo.total.toFixed(2) !== totalPassivoEPL.toFixed(2)) {
            alert('Atenção! O Total do Ativo não bate com o Total do Passivo + PL.');
        }
    });
}