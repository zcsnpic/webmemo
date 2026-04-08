const App = {
  currentTab: 'chat',
  currentCategory: null,
  currentMemory: null,
  currentMemoryData: null,
  chatMessages: [],
  aiMode: 'L1',
  isLoading: false,

  async init() {
    try {
      this.bindEvents();
      await this.loadInitialData();
      this.switchTab('chat');
    } catch (e) {
      console.error('App init error:', e);
    }
  },

  bindEvents() {
    document.getElementById('tabChat').addEventListener('click', () => this.switchTab('chat'));
    document.getElementById('tabOrganize').addEventListener('click', () => this.switchTab('organize'));
    document.getElementById('btnNew').addEventListener('click', () => this.showNewMemoryModal());
    document.getElementById('btnGlossary').addEventListener('click', () => this.showGlossaryModal());
    document.getElementById('btnSettings').addEventListener('click', () => this.showSettingsModal());
    document.getElementById('btnSend').addEventListener('click', () => this.sendChatMessage());
    document.getElementById('chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendChatMessage();
      }
    });
    document.getElementById('btnAiSend').addEventListener('click', () => this.sendAiCommand());
    document.getElementById('btnSaveMemory').addEventListener('click', () => this.saveCurrentMemory());
    document.getElementById('btnBackMatrix').addEventListener('click', () => this.backToList());
    document.getElementById('btnAnalyzeTime').addEventListener('click', () => this.analyzeTime());
    document.getElementById('btnConnectGithub').addEventListener('click', () => this.connectGithub());
    document.getElementById('btnDisconnectGithub').addEventListener('click', () => this.disconnectGithub());
    document.getElementById('btnNextStep').addEventListener('click', () => this.goToStep2());
    document.getElementById('btnPrevStep').addEventListener('click', () => this.backToStep1());
    document.getElementById('btnCreateMemory').addEventListener('click', () => this.createMemory());
    document.getElementById('btnShowNewColumn').addEventListener('click', () => this.showNewColumnInModal());
    document.getElementById('btnConfirmNewColumn').addEventListener('click', () => this.createColumnFromModal());
    document.getElementById('btnAddGlossary').addEventListener('click', () => this.showGlossaryEditModal());
    document.getElementById('btnSaveGlossary').addEventListener('click', () => this.saveGlossaryItem());
    document.getElementById('btnConfirmDelete').addEventListener('click', () => this.confirmDelete());

    this.bindAiModeButtons();
    this.bindGlossaryCategoryButtons();
    this.bindTagInput();
    this.bindSearchInput();
    this.bindDraftAutoSave();
  },

  bindDraftAutoSave() {
    let debounceTimer;
    const saveDraft = (e) => {
      if (!this.currentMemory) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const title = document.getElementById('memoryTitleInput')?.value || '';
        const content = document.getElementById('memoryContentInput')?.value || '';
        if (title || content) {
          Storage.saveDraft(this.currentMemory, { title, content });
          console.log('Draft saved:', this.currentMemory, { title, content });
        }
      }, 1000);
    };

    document.addEventListener('input', (e) => {
      if (e.target.id === 'memoryTitleInput' || e.target.id === 'memoryContentInput') {
        saveDraft(e);
      }
    });
  },

  bindAiModeButtons() {
    document.querySelectorAll('.ai-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ai-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.aiMode = btn.dataset.mode;
        Storage.setAiMode(this.aiMode);
      });
    });
  },

  bindGlossaryCategoryButtons() {
    document.querySelectorAll('.glossary-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.glossary-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.filterGlossary(btn.dataset.cat);
      });
    });
  },

  bindTagInput() {
    const tagInput = document.getElementById('tagInput');
    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && tagInput.value.trim()) {
        e.preventDefault();
        this.addTag(tagInput.value.trim());
        tagInput.value = '';
      }
    });
  },

  bindSearchInput() {
    const searchInput = document.getElementById('searchInput');
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.searchMemories(searchInput.value);
      }, 300);
    });
  },

  async loadInitialData() {
    this.aiMode = Storage.getAiMode() || 'L1';
    document.querySelectorAll('.ai-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === this.aiMode);
    });

    if (Github.isConfigured()) {
      try {
        await Github.fullSync();
        this.renderCategoryList();
        this.loadSettingsValues();
      } catch (e) {
        console.error('Load data error:', e);
        this.renderCategoryList();
      }
    } else {
      this.renderCategoryList();
    }
  },

  async switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
    document.getElementById(tab + 'Content').classList.add('active');

    const chatToolbar = document.getElementById('chatToolbar');
    const aiFloatBubble = document.getElementById('aiFloatBubble');

    if (tab === 'chat') {
      chatToolbar.style.display = 'block';
      aiFloatBubble.classList.remove('active');
    } else {
      chatToolbar.style.display = 'none';
      aiFloatBubble.classList.add('active');

      if (this.chatMessages.length > 0) {
        this.showToast('正在导入并分析内容...', 'info');
        await this.importAndAnalyzeContent();
      }
    }
  },

  async importAndAnalyzeContent() {
    if (this.chatMessages.length === 0) return;

    const processedContent = this.processConversationContent();
    document.getElementById('memoryContentInput').value = processedContent;

    await this.analyzeMemoryAttributes(processedContent);

    this.showToast('内容已导入并分析完成', 'success');
  },

  processConversationContent() {
    const userMessages = this.chatMessages.filter(m => m.role === 'user');

    let content = userMessages.map(m => m.content).join('\n\n');

    content = this.cleanupContent(content);
    content = this.formatContent(content);

    return content;
  },

  cleanupContent(content) {
    let cleaned = content.trim();

    const lines = cleaned.split('\n');
    const uniqueLines = [];
    const seen = new Set();

    for (const line of lines) {
      const normalized = line.trim().toLowerCase();
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        uniqueLines.push(line);
      }
    }

    cleaned = uniqueLines.join('\n');

    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned;
  },

  formatContent(content) {
    const paragraphs = content.split(/\n\n+/);

    const formatted = paragraphs.map(p => {
      p = p.trim();
      if (!p) return '';

      p = p.replace(/^(\S)/, match => match.toUpperCase());

      if (!p.match(/[。！？.!?]$/)) {
        p += '。';
      }

      return p;
    }).filter(p => p);

    return formatted.join('\n\n');
  },

  async analyzeMemoryAttributes(content) {
    const titleInput = document.getElementById('memoryTitleInput');
    const timeInput = document.getElementById('timeNaturalInput');

    if (titleInput.value.trim() === '') {
      const title = this.generateTitle(content);
      titleInput.value = title;
    }

    const analysis = await this.analyzeContentWithAI(content);

    if (analysis.timeHint && timeInput.value.trim() === '') {
      timeInput.value = analysis.timeHint;
      await this.analyzeTime();
    }

    if (analysis.keywords && analysis.keywords.length > 0) {
      const currentTags = this.getCurrentTags();
      const remainingSlots = 10 - currentTags.length;

      for (let i = 0; i < Math.min(analysis.keywords.length, remainingSlots); i++) {
        if (!currentTags.includes(analysis.keywords[i])) {
          this.addTag(analysis.keywords[i]);
        }
      }
    }
  },

  generateTitle(content) {
    const firstLine = content.split('\n')[0].substring(0, 30);
    return firstLine.replace(/[。！？.!?]$/, '') || '未命名记忆';
  },

  async analyzeContentWithAI(content) {
    const prompt = `请分析以下回忆录内容，提取关键信息。

内容：
${content.substring(0, 500)}

请返回JSON格式的分析结果：
{
  "timeHint": "如提到具体时间，返回时间描述",
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "summary": "一句话概括"
}

只返回JSON，不要其他内容。`;

    try {
      const result = await AI.chat([
        { role: 'user', content: prompt }
      ], { mode: 'L1' });

      if (result.success) {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }
    } catch (e) {
      console.error('Content analysis error:', e);
    }

    return { timeHint: null, keywords: [], summary: '' };
  },

  toggleAiFloatPanel() {
    const aiFloatBubble = document.getElementById('aiFloatBubble');
    aiFloatBubble.classList.toggle('active');
  },

  renderCategoryList() {
    const container = document.getElementById('categoryList');
    const categories = Storage.getCategories();
    const memories = Storage.getMemoryIndex();

    if (categories.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>暂无栏目</p></div>';
      return;
    }

    container.innerHTML = categories.map(cat => {
      const catMemories = memories.filter(m => m.category === cat);
      const isExpanded = this.currentCategory === cat;

      return `
        <div class="category-item ${isExpanded ? 'expanded' : ''}" data-category="${cat}">
          <div class="category-header" onclick="App.toggleCategory('${cat}')">
            <span class="category-icon">▶</span>
            <span class="category-name">${cat}</span>
            <span class="category-count">(${catMemories.length})</span>
            <div class="category-actions">
              <button class="category-action-btn" onclick="event.stopPropagation(); App.editCategory('${cat}')">✎</button>
              <button class="category-action-btn delete" onclick="event.stopPropagation(); App.deleteCategory('${cat}')">✕</button>
            </div>
          </div>
          <div class="memory-list">
            ${catMemories.map(mem => this.renderMemoryItem(mem)).join('')}
          </div>
        </div>
      `;
    }).join('');
  },

  renderMemoryItem(memory) {
    const dateStr = memory.date ? memory.date.substring(0, 7) : '';
    const isActive = this.currentMemory === memory.id;

    return `
      <div class="memory-item ${isActive ? 'active' : ''}" data-id="${memory.id}" onclick="App.selectMemory('${memory.id}')">
        <span class="memory-title">${memory.title}</span>
        ${dateStr ? `<span class="memory-date">${dateStr}</span>` : ''}
        <div class="memory-actions">
          <button class="memory-action-btn delete" onclick="event.stopPropagation(); App.showDeleteConfirm('${memory.id}')">✕</button>
        </div>
      </div>
    `;
  },

  toggleCategory(category) {
    this.currentCategory = this.currentCategory === category ? null : category;
    this.renderCategoryList();
  },

  editCategory(category) {
    const newName = prompt('请输入新的栏目名称：', category);
    if (!newName || newName === category) return;

    const categories = Storage.getCategories();
    const index = categories.indexOf(category);
    if (index >= 0) {
      categories[index] = newName;
      Storage.setCategories(categories);

      const memories = Storage.getMemoryIndex();
      memories.forEach(m => {
        if (m.category === category) {
          m.category = newName;
        }
      });
      Storage.setMemoryIndex(memories);

      this.renderCategoryList();
      this.showToast('栏目已重命名', 'success');
    }
  },

  deleteCategory(category) {
    if (!confirm(`确定要删除栏目"${category}"吗？栏日下的素材不会被删除。`)) return;

    const categories = Storage.getCategories();
    const index = categories.indexOf(category);
    if (index >= 0) {
      categories.splice(index, 1);
      Storage.setCategories(categories);
      this.renderCategoryList();
      this.showToast('栏目已删除', 'success');
    }
  },

  selectMemory(memoryId) {
    this.currentMemory = memoryId;
    Storage.setCurrentMemory(memoryId);

    const memories = Storage.getMemoryIndex();
    this.currentMemoryData = memories.find(m => m.id === memoryId);

    this.renderCategoryList();
    this.loadMemoryToEditor(memoryId);

    if (Github.isConfigured()) {
      this.loadConversation(memoryId);
    }

    this.updateTagsDisplay();
    this.updateDocGlossaryDisplay();
  },

  async loadMemoryToEditor(memoryId) {
    const memories = Storage.getMemoryIndex();
    const memory = memories.find(m => m.id === memoryId);

    if (!memory) return;

    const draft = Storage.getDraft(memoryId);
    console.log('loadMemoryToEditor:', memoryId, { draft, memoryTitle: memory.title, memoryContent: memory.content ? memory.content.substring(0, 50) : '' });

    document.getElementById('memoryTitleInput').value = draft?.title || memory.title || '';
    document.getElementById('memoryContentInput').value = draft?.content || memory.content || '';

    if (draft) {
      console.log('Restoring draft, clearing it');
      Storage.clearDraft(memoryId);
    }

    if (memory.date) {
      document.getElementById('timeNaturalInput').value = memory.date;
      this.updateTimeDisplay(memory);
    }
  },

  updateTimeDisplay(memory) {
    const dateEl = document.getElementById('attrDate');
    const periodEl = document.getElementById('attrPeriod');

    if (dateEl) {
      dateEl.textContent = memory.dateAttr || '';
    }
    if (periodEl) {
      periodEl.textContent = memory.period || '';
    }
  },

  async loadConversation(memoryId) {
    const data = await Github.getConversation(memoryId);
    if (data && data.messages) {
      this.chatMessages = data.messages;
      this.renderChatMessages();
    } else {
      this.chatMessages = [];
      this.renderChatMessages();
    }
  },

  renderChatMessages() {
    const container = document.getElementById('chatMessages');

    if (this.chatMessages.length === 0) {
      container.innerHTML = '<div class="empty-state" id="chatEmptyState"><p>选择或新建素材开始采访</p></div>';
      return;
    }

    container.innerHTML = this.chatMessages.map(msg => {
      if (msg.role === 'user') {
        return `<div class="chat-message user"><div class="message-content">${this.escapeHtml(msg.content)}</div></div>`;
      } else {
        let followupHtml = '';
        if (msg.followups && msg.followups.length > 0) {
          followupHtml = `<div class="message-hints"><div class="message-hints-label">💡 思路提示：</div>${msg.followups.map(f => `<div class="message-hint-item">• ${this.escapeHtml(f)}</div>`).join('')}</div>`;
        }
        return `
          <div class="chat-message ai">
            <div class="message-avatar">🤖</div>
            <div class="message-content">
              ${this.escapeHtml(msg.content)}
              ${followupHtml}
            </div>
          </div>
        `;
      }
    }).join('');

    container.scrollTop = container.scrollHeight;
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  async sendChatMessage() {
    const input = document.getElementById('chatInput');
    const content = input.value.trim();

    if (!content || !this.currentMemory) {
      if (!this.currentMemory) {
        this.showToast('请先选择或创建素材', 'warning');
      }
      return;
    }

    input.value = '';

    this.chatMessages.push({ role: 'user', content });
    this.renderChatMessages();

    const thinkingMsg = { role: 'assistant', content: '思考中...', isThinking: true };
    this.chatMessages.push(thinkingMsg);
    this.renderChatMessages();

    const result = await AI.chat(
      this.chatMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
      { mode: this.aiMode }
    );

    this.chatMessages = this.chatMessages.filter(m => !m.isThinking);

    if (result.success) {
      const nounMatch = result.content.match(/\[名词待确认:([^\]]+)\]/g);
      const finalContent = result.content.replace(/\[名词待确认:[^\]]+\]/g, '').trim();

      let followups = [];
      if (this.aiMode === 'L3') {
        followups = this.generateHintQuestions(finalContent);
      }

      this.chatMessages.push({
        role: 'assistant',
        content: finalContent,
        followups
      });

      if (nounMatch && this.aiMode !== 'L1') {
        const nouns = nounMatch.map(n => n.match(/\[名词待确认:([^\]]+)\]/)[1]);
        this.showNounConfirmDialog(nouns);
      }
    } else {
      this.chatMessages.push({
        role: 'assistant',
        content: `抱歉，发生了错误：${result.error}`
      });
      this.showToast('AI响应失败', 'error');
    }

    this.renderChatMessages();

    if (Github.isConfigured()) {
      await Github.saveConversation(this.currentMemory, this.chatMessages);
    }

    const memories = Storage.getMemoryIndex();
    const mem = memories.find(m => m.id === this.currentMemory);
    if (mem) {
      mem.dialogueTurns = (mem.dialogueTurns || 0) + 1;
      Storage.setMemoryIndex(memories);
    }
  },

  generateHintQuestions(aiResponse) {
    const hints = [];

    const questionPatterns = [
      '后来呢', '还有吗', '能再', '多说',
      '什么时候', '那是怎么', '当时', '然后'
    ];

    for (const pattern of questionPatterns) {
      if (aiResponse.includes(pattern)) {
        hints.push(`您能再说说${pattern.replace(/[后来呢还有吗能再多说]/g, '')}的情况吗？`);
      }
    }

    if (hints.length === 0) {
      hints.push('您能再多说说吗？');
      hints.push('那是什么时候的事呢？');
      hints.push('还有其他人参与吗？');
    }

    return hints.slice(0, 3);
  },

  async sendFollowup(question) {
    document.getElementById('chatInput').value = question;
    await this.sendChatMessage();
  },

  async sendAiCommand() {
    const input = document.getElementById('aiCommandInput');
    const command = input.value.trim();

    if (!command || !this.currentMemory) return;

    const content = document.getElementById('memoryContentInput').value;

    input.value = '';
    this.showToast('AI正在调整内容...', 'info');

    const result = await AI.refineContent(content, command);

    if (result.success) {
      document.getElementById('memoryContentInput').value = result.content;
      this.showToast('内容已更新', 'success');
    } else {
      this.showToast('调整失败：' + result.error, 'error');
    }
  },

  async saveCurrentMemory() {
    if (!this.currentMemory) {
      this.showToast('请先选择素材', 'warning');
      return;
    }

    const title = document.getElementById('memoryTitleInput').value.trim();
    const content = document.getElementById('memoryContentInput').value;
    const timeInput = document.getElementById('timeNaturalInput').value;
    const tags = this.getCurrentTags();

    const memories = Storage.getMemoryIndex();
    const mem = memories.find(m => m.id === this.currentMemory);

    if (!mem) return;

    mem.title = title;
    mem.content = content;
    mem.date = timeInput;
    mem.tags = tags;
    mem.updatedAt = new Date().toISOString();

    Storage.setMemoryIndex(memories);

    if (Github.isConfigured()) {
      this.showToast('保存中...', 'info');
      try {
        await Github.saveMemory(mem);
        this.showToast('已保存', 'success');
      } catch (e) {
        this.showToast('保存失败：' + e.message, 'error');
      }
    } else {
      this.showToast('已保存到本地', 'success');
    }

    this.renderCategoryList();
  },

  backToList() {
    this.currentMemory = null;
    this.currentMemoryData = null;
    Storage.setCurrentMemory(null);
    this.renderCategoryList();
  },

  updateTagsDisplay() {
    const container = document.getElementById('tagsContainer');
    const memories = Storage.getMemoryIndex();
    const mem = memories.find(m => m.id === this.currentMemory);
    const tags = mem?.tags || [];

    container.innerHTML = tags.map(tag => `
      <span class="tag" onclick="App.removeTag('${this.escapeHtml(tag)}')">
        ${this.escapeHtml(tag)} <span class="tag-remove">×</span>
      </span>
    `).join('');

    const tagCountEl = document.getElementById('tagCount');
    if (tagCountEl) {
      tagCountEl.textContent = tags.length;
    }
  },

  getCurrentTags() {
    const memories = Storage.getMemoryIndex();
    const mem = memories.find(m => m.id === this.currentMemory);
    return mem?.tags || [];
  },

  addTag(tag) {
    const tags = this.getCurrentTags();
    if (tags.length >= 10) {
      this.showToast('最多添加10个标签', 'warning');
      return;
    }
    if (!tags.includes(tag)) {
      tags.push(tag);
      const memories = Storage.getMemoryIndex();
      const mem = memories.find(m => m.id === this.currentMemory);
      if (mem) {
        mem.tags = tags;
        Storage.setMemoryIndex(memories);
      }
      this.updateTagsDisplay();
    }
  },

  removeTag(tag) {
    const tags = this.getCurrentTags().filter(t => t !== tag);
    const memories = Storage.getMemoryIndex();
    const mem = memories.find(m => m.id === this.currentMemory);
    if (mem) {
      mem.tags = tags;
      Storage.setMemoryIndex(memories);
    }
    this.updateTagsDisplay();
  },

  updateDocGlossaryDisplay() {
    const container = document.getElementById('docGlossaryList');
    const memories = Storage.getMemoryIndex();
    const mem = memories.find(m => m.id === this.currentMemory);
    const glossary = mem?.glossary || [];

    if (glossary.length === 0) {
      container.innerHTML = '<div class="empty-hint">本文暂无名词</div>';
      return;
    }

    container.innerHTML = glossary.map(item => `
      <div class="doc-glossary-item" onclick="App.toggleDocGlossaryDetail(this)">
        <div class="doc-glossary-header">
          <span class="doc-glossary-expand">▶</span>
          <span class="doc-glossary-name">${item.icon || ''} ${this.escapeHtml(item.name)}</span>
        </div>
        <div class="doc-glossary-detail">
          ${item.aliases ? `<div class="doc-glossary-field"><span class="field-label">别名：</span><span class="field-value">${this.escapeHtml(item.aliases)}</span></div>` : ''}
          ${item.addresses ? `<div class="doc-glossary-field"><span class="field-label">称谓：</span><span class="field-value">${this.escapeHtml(item.addresses)}</span></div>` : ''}
        </div>
      </div>
    `).join('');
  },

  toggleDocGlossaryDetail(element) {
    element.classList.toggle('expanded');
  },

  async analyzeTime() {
    const input = document.getElementById('timeNaturalInput');
    const text = input.value.trim();

    if (!text) {
      this.showToast('请输入时间描述', 'warning');
      return;
    }

    const btn = document.getElementById('btnAnalyzeTime');
    btn.classList.add('loading');
    btn.disabled = true;

    const result = await AI.analyzeTime(text);

    btn.classList.remove('loading');
    btn.disabled = false;

    const memories = Storage.getMemoryIndex();
    const mem = memories.find(m => m.id === this.currentMemory);
    if (mem) {
      mem.dateAttr = result.date;
      mem.period = result.period;
      Storage.setMemoryIndex(memories);
    }

    this.updateTimeDisplay({ dateAttr: result.date, period: result.period });
    this.showToast('时间分析完成', 'success');
  },

  async connectGithub() {
    const token = document.getElementById('githubTokenInput').value.trim();
    const repo = document.getElementById('repoNameInput').value.trim();

    if (!token || !repo) {
      this.showToast('请填写完整信息', 'warning');
      return;
    }

    Storage.setGithubToken(token);
    Storage.setRepoName(repo);

    const statusEl = document.getElementById('syncStatus');
    statusEl.classList.remove('connected', 'error');
    statusEl.querySelector('.sync-text').textContent = '连接中...';

    const result = await Github.validateConnection();

    if (result.success) {
      statusEl.classList.add('connected');
      statusEl.querySelector('.sync-text').textContent = `已连接 ${result.user}/${result.repo}`;
      this.showToast('GitHub连接成功', 'success');
      await this.fullSync();
    } else {
      statusEl.classList.add('error');
      statusEl.querySelector('.sync-text').textContent = '连接失败';
      this.showToast('连接失败：' + result.error, 'error');
    }
  },

  disconnectGithub() {
    localStorage.removeItem(Storage.KEYS.GITHUB_TOKEN);
    localStorage.removeItem(Storage.KEYS.REPO_NAME);

    const statusEl = document.getElementById('syncStatus');
    const disconnectBtn = document.getElementById('btnDisconnectGithub');

    statusEl.classList.remove('connected', 'error');
    statusEl.querySelector('.sync-text').textContent = '未连接';
    if (disconnectBtn) disconnectBtn.style.display = 'none';

    document.getElementById('githubTokenInput').value = '';
    document.getElementById('repoNameInput').value = '';

    this.showToast('已断开 GitHub 连接', 'success');
  },

  async fullSync() {
    try {
      await Github.fullSync();
      this.renderCategoryList();
      this.loadSettingsValues();
      this.showToast('同步完成', 'success');
    } catch (e) {
      this.showToast('同步失败：' + e.message, 'error');
    }
  },

  loadSettingsValues() {
    document.getElementById('githubTokenInput').value = Storage.getGithubToken() || '';
    document.getElementById('repoNameInput').value = Storage.getRepoName() || '';
    document.getElementById('apiEndpoint').value = Storage.get('memoir_api_endpoint') || 'https://api.deepseek.com/v1/chat/completions';
    document.getElementById('apiKey').value = Storage.get('memoir_api_key') || '';
    document.getElementById('defaultAiMode').value = Storage.getAiMode() || 'L3';
    document.getElementById('namingPattern').value = Storage.get('memoir_naming_pattern') || '{category}/{title}_{date}';

    const statusEl = document.getElementById('syncStatus');
    const disconnectBtn = document.getElementById('btnDisconnectGithub');

    if (Github.isConfigured()) {
      statusEl.classList.add('connected');
      statusEl.classList.remove('error');
      statusEl.querySelector('.sync-text').textContent = '已连接';
      if (disconnectBtn) disconnectBtn.style.display = 'block';
    } else {
      statusEl.classList.remove('connected');
      statusEl.querySelector('.sync-text').textContent = '未连接';
      if (disconnectBtn) disconnectBtn.style.display = 'none';
    }

    this.renderDeletedList();
  },

  saveSettings() {
    const token = document.getElementById('githubTokenInput').value.trim();
    const repo = document.getElementById('repoNameInput').value.trim();
    const apiEndpoint = document.getElementById('apiEndpoint').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();
    const defaultAiMode = document.getElementById('defaultAiMode').value;
    const namingPattern = document.getElementById('namingPattern').value.trim();

    if (token) Storage.setGithubToken(token);
    if (repo) Storage.setRepoName(repo);
    if (apiEndpoint) Storage.set('memoir_api_endpoint', apiEndpoint);
    if (apiKey) Storage.set('memoir_api_key', apiKey);
    Storage.setAiMode(defaultAiMode);
    if (namingPattern) Storage.set('memoir_naming_pattern', namingPattern);

    this.showToast('设置已保存', 'success');
    closeModal('settingsModal');
  },

  openPromptEditor() {
    document.getElementById('promptTemplate').value = Storage.getAiRole() || '';
    document.getElementById('promptInstruction').value = '';
    document.getElementById('promptEditorModal').classList.add('active');
  },

  async sendPromptInstruction() {
    const instruction = document.getElementById('promptInstruction').value.trim();
    if (!instruction) {
      this.showToast('请输入修改指令', 'warning');
      return;
    }

    const currentPrompt = document.getElementById('promptTemplate').value;

    const result = await AI.refineContent(currentPrompt, instruction);

    if (result.success) {
      Storage.setAiRole(result.content);
      document.getElementById('promptTemplate').value = result.content;
      this.showToast('提示词已更新', 'success');
    } else {
      this.showToast('更新失败：' + result.error, 'error');
    }
  },

  renderDeletedList() {
    const container = document.getElementById('deletedList');
    const deleted = Storage.getDeletedMemories();

    if (deleted.length === 0) {
      container.innerHTML = '<p class="empty-hint">暂无已删除的素材</p>';
      return;
    }

    container.innerHTML = deleted.map(mem => `
      <div class="deleted-item">
        <div class="deleted-item-info">
          <div class="deleted-item-title">${this.escapeHtml(mem.title)}</div>
          <div class="deleted-item-date">删除于 ${new Date(mem.deletedAt).toLocaleDateString()}</div>
        </div>
        <div class="deleted-item-actions">
          <button class="btn btn-sm btn-secondary" onclick="App.restoreMemory('${mem.id}')">恢复</button>
          <button class="btn btn-sm btn-danger" onclick="App.permanentDelete('${mem.id}')">彻底删除</button>
        </div>
      </div>
    `).join('');
  },

  showNewMemoryModal() {
    const modal = document.getElementById('newMemoryModal');
    const categorySelect = document.getElementById('modalCategorySelect');
    const categories = Storage.getCategories();

    categorySelect.innerHTML = categories.map(cat =>
      `<option value="${cat}">${cat}</option>`
    ).join('');

    document.getElementById('modalMemoryTitle').value = '';
    document.getElementById('modalMemoryDate').value = '';

    document.getElementById('step1Column').style.display = 'block';
    document.getElementById('step2Info').style.display = 'none';
    document.getElementById('step1Footer').style.display = 'flex';
    document.getElementById('step2Footer').style.display = 'none';
    document.getElementById('newColumnInModal').style.display = 'none';

    modal.classList.add('active');
  },

  goToStep2() {
    const category = document.getElementById('modalCategorySelect').value;
    if (!category) {
      this.showToast('请选择栏目', 'warning');
      return;
    }
    document.getElementById('step1Column').style.display = 'none';
    document.getElementById('step2Info').style.display = 'block';
    document.getElementById('step1Footer').style.display = 'none';
    document.getElementById('step2Footer').style.display = 'flex';
    document.getElementById('modalMemoryTitle').focus();
  },

  backToStep1() {
    document.getElementById('step1Column').style.display = 'block';
    document.getElementById('step2Info').style.display = 'none';
    document.getElementById('step1Footer').style.display = 'flex';
    document.getElementById('step2Footer').style.display = 'none';
  },

  showNewColumnInModal() {
    document.getElementById('newColumnInModal').style.display = 'block';
    document.getElementById('newColumnNameInput').focus();
  },

  async createColumnFromModal() {
    const input = document.getElementById('newColumnNameInput');
    const name = input.value.trim();

    if (!name) {
      this.showToast('请输入栏目名称', 'warning');
      return;
    }

    Storage.addCategory(name);
    this.renderCategoryList();

    const categorySelect = document.getElementById('modalCategorySelect');
    categorySelect.innerHTML += `<option value="${name}">${name}</option>`;
    categorySelect.value = name;

    document.getElementById('newColumnInModal').style.display = 'none';
    input.value = '';
    this.showToast('栏目已创建', 'success');
  },

  async addNewCategory() {
    const input = document.getElementById('newCategoryInput');
    const name = input.value.trim();

    if (!name) return;

    Storage.addCategory(name);

    const categorySelect = document.getElementById('modalCategorySelect');
    categorySelect.innerHTML += `<option value="${name}">${name}</option>`;
    categorySelect.value = name;

    input.value = '';
    this.renderCategoryList();
    this.showToast('栏目已创建', 'success');
  },

  async createMemory() {
    const category = document.getElementById('modalCategorySelect').value;
    const title = document.getElementById('modalMemoryTitle').value.trim();
    const date = document.getElementById('modalMemoryDate').value.trim();

    if (!title) {
      this.showToast('请输入素材标题', 'warning');
      return;
    }

    const memory = {
      id: Storage.generateId(),
      title,
      category,
      date,
      content: '',
      tags: [],
      glossary: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const memories = Storage.getMemoryIndex();
    memories.push(memory);
    Storage.setMemoryIndex(memories);

    if (Github.isConfigured()) {
      try {
        await Github.saveMemory(memory);
      } catch (e) {
        console.error('Save memory error:', e);
      }
    }

    closeModal('newMemoryModal');
    this.renderCategoryList();
    this.selectMemory(memory.id);
    this.showToast('素材已创建', 'success');
  },

  showDeleteConfirm(memoryId) {
    this.memoryToDelete = memoryId;
    const memories = Storage.getMemoryIndex();
    const mem = memories.find(m => m.id === memoryId);
    document.getElementById('deleteConfirmText').textContent = `确定要删除素材"${mem?.title}"吗？`;
    document.getElementById('deleteConfirmModal').classList.add('active');
  },

  async confirmDelete() {
    if (!this.memoryToDelete) return;

    const memories = Storage.getMemoryIndex();
    const mem = memories.find(m => m.id === this.memoryToDelete);

    if (mem) {
      Storage.addDeletedMemory(mem);

      const newMemories = memories.filter(m => m.id !== this.memoryToDelete);
      Storage.setMemoryIndex(newMemories);

      if (Github.isConfigured()) {
        try {
          await Github.deleteMemory(mem);
        } catch (e) {
          console.error('Delete memory error:', e);
        }
      }

      if (this.currentMemory === this.memoryToDelete) {
        this.currentMemory = null;
        this.currentMemoryData = null;
      }

      this.renderCategoryList();
      this.showToast('素材已删除', 'success');
    }

    closeModal('deleteConfirmModal');
    this.memoryToDelete = null;
  },

  async restoreMemory(memoryId) {
    const deleted = Storage.getDeletedMemories();
    const mem = deleted.find(m => m.id === memoryId);

    if (!mem) return;

    const memories = Storage.getMemoryIndex();
    delete mem.deletedAt;
    memories.push(mem);
    Storage.setMemoryIndex(memories);

    Storage.removeDeletedMemory(memoryId);

    if (Github.isConfigured()) {
      try {
        await Github.saveMemory(mem);
      } catch (e) {
        console.error('Restore memory error:', e);
      }
    }

    this.renderCategoryList();
    this.renderDeletedList();
    this.showToast('素材已恢复', 'success');
  },

  async permanentDelete(memoryId) {
    Storage.removeDeletedMemory(memoryId);
    this.renderDeletedList();
    this.showToast('已彻底删除', 'success');
  },

  searchMemories(query) {
    const items = document.querySelectorAll('.memory-item');
    const lowerQuery = query.toLowerCase();

    items.forEach(item => {
      const title = item.querySelector('.memory-title').textContent.toLowerCase();
      item.style.display = title.includes(lowerQuery) ? 'flex' : 'none';
    });
  },

  showGlossaryModal() {
    this.loadGlossaryList();
    document.getElementById('glossaryModal').classList.add('active');
  },

  loadGlossaryList(filter = 'all', search = '') {
    const container = document.getElementById('glossaryItemList');
    let glossary = Storage.getGlossary();

    if (filter !== 'all') {
      glossary = glossary.filter(item => item.category === filter);
    }

    if (search) {
      const lowerSearch = search.toLowerCase();
      glossary = glossary.filter(item =>
        item.name.toLowerCase().includes(lowerSearch) ||
        (item.aliases && item.aliases.toLowerCase().includes(lowerSearch))
      );
    }

    if (glossary.length === 0) {
      container.innerHTML = '<div class="empty-hint">暂无名词</div>';
      return;
    }

    container.innerHTML = glossary.map(item => `
      <div class="glossary-item" data-id="${item.id}" onclick="App.showGlossaryDetail('${item.id}')">
        <div class="glossary-item-name">${this.escapeHtml(item.name)}</div>
        <div class="glossary-item-type">${item.category}</div>
      </div>
    `).join('');
  },

  filterGlossary(category) {
    const search = document.getElementById('glossarySearchInput').value;
    this.loadGlossaryList(category, search);
  },

  showGlossaryDetail(itemId) {
    const glossary = Storage.getGlossary();
    const item = glossary.find(g => g.id === itemId);

    if (!item) return;

    document.querySelectorAll('.glossary-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === itemId);
    });

    const detailEl = document.getElementById('glossaryDetail');
    detailEl.innerHTML = `
      <div class="glossary-detail-fields">
        <div class="glossary-detail-field">
          <div class="field-label">分类</div>
          <div class="field-value">${item.category}</div>
        </div>
        <div class="glossary-detail-field">
          <div class="field-label">标准名称</div>
          <div class="field-value">${this.escapeHtml(item.name)}</div>
        </div>
        ${item.description ? `
          <div class="glossary-detail-field">
            <div class="field-label">解释/描述</div>
            <div class="field-value">${this.escapeHtml(item.description)}</div>
          </div>
        ` : ''}
        ${item.aliases ? `
          <div class="glossary-detail-field">
            <div class="field-label">别名/曾用名</div>
            <div class="field-value">${this.escapeHtml(item.aliases)}</div>
          </div>
        ` : ''}
        ${item.addresses ? `
          <div class="glossary-detail-field">
            <div class="field-label">常用称谓</div>
            <div class="field-value">${this.escapeHtml(item.addresses)}</div>
          </div>
        ` : ''}
      </div>
      <div style="margin-top: 20px; display: flex; gap: 10px;">
        <button class="btn btn-secondary btn-sm" onclick="App.editGlossaryItem('${item.id}')">编辑</button>
        <button class="btn btn-danger btn-sm" onclick="App.deleteGlossaryItem('${item.id}')">删除</button>
      </div>
    `;
  },

  showGlossaryEditModal(itemId = null) {
    this.glossaryEditingId = itemId;

    document.querySelectorAll('.glossary-cat-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.cat === '人物');
    });

    if (itemId) {
      const glossary = Storage.getGlossary();
      const item = glossary.find(g => g.id === itemId);
      if (item) {
        document.getElementById('glossaryEditTitle').textContent = '📋 编辑词条';
        document.getElementById('glossaryName').value = item.name || '';
        document.getElementById('glossaryDesc').value = item.description || '';
        document.getElementById('glossaryAlias').value = item.aliases || '';
        document.getElementById('glossaryAddress').value = item.addresses || '';
        document.getElementById('glossaryRelated').value = (item.related || []).join(', ');

        document.querySelectorAll('.glossary-cat-option').forEach(opt => {
          opt.classList.toggle('selected', opt.dataset.cat === item.category);
        });
      }
    } else {
      document.getElementById('glossaryEditTitle').textContent = '📋 新增词条';
      document.getElementById('glossaryName').value = '';
      document.getElementById('glossaryDesc').value = '';
      document.getElementById('glossaryAlias').value = '';
      document.getElementById('glossaryAddress').value = '';
      document.getElementById('glossaryRelated').value = '';
    }

    document.getElementById('glossaryEditModal').classList.add('active');
  },

  editGlossaryItem(itemId) {
    this.showGlossaryEditModal(itemId);
  },

  async saveGlossaryItem() {
    const name = document.getElementById('glossaryName').value.trim();
    const category = document.querySelector('.glossary-cat-option.selected')?.dataset.cat || '人物';
    const description = document.getElementById('glossaryDesc').value.trim();
    const aliases = document.getElementById('glossaryAlias').value.trim();
    const addresses = document.getElementById('glossaryAddress').value.trim();
    const related = document.getElementById('glossaryRelated').value.split(',').map(s => s.trim()).filter(s => s);

    if (!name) {
      this.showToast('请输入词条名称', 'warning');
      return;
    }

    const item = {
      id: this.glossaryEditingId || Storage.generateId(),
      name,
      category,
      description,
      aliases,
      addresses,
      related,
      updatedAt: new Date().toISOString()
    };

    Storage.addGlossaryItem(item);

    if (Github.isConfigured()) {
      try {
        await Github.syncGlossary(Storage.getGlossary());
      } catch (e) {
        console.error('Sync glossary error:', e);
      }
    }

    closeModal('glossaryEditModal');
    this.loadGlossaryList();
    this.updateDocGlossaryForCurrentMemory();
    this.showToast('词条已保存', 'success');
  },

  async deleteGlossaryItem(itemId) {
    Storage.removeGlossaryItem(itemId);

    if (Github.isConfigured()) {
      try {
        await Github.syncGlossary(Storage.getGlossary());
      } catch (e) {
        console.error('Sync glossary error:', e);
      }
    }

    this.loadGlossaryList();
    document.getElementById('glossaryDetail').innerHTML = '<div class="empty-state"><p>选择或新增名词查看详情</p></div>';
    this.updateDocGlossaryForCurrentMemory();
    this.showToast('词条已删除', 'success');
  },

  updateDocGlossaryForCurrentMemory() {
    if (!this.currentMemory) return;

    const memories = Storage.getMemoryIndex();
    const mem = memories.find(m => m.id === this.currentMemory);
    const allGlossary = Storage.getGlossary();

    if (mem && mem.characters) {
      mem.glossary = allGlossary.filter(item =>
        mem.characters.includes(item.name)
      );
      Storage.setMemoryIndex(memories);
    }

    this.updateDocGlossaryDisplay();
  },

  async showNounConfirmDialog(nouns) {
    for (const noun of nouns) {
      const confirmed = confirm(`是否将"${noun}"添加到名词库？`);
      if (confirmed) {
        const item = {
          id: Storage.generateId(),
          name: noun,
          category: '人物',
          aliases: '',
          addresses: '',
          updatedAt: new Date().toISOString()
        };
        Storage.addGlossaryItem(item);

        if (Github.isConfigured()) {
          try {
            await Github.syncGlossary(Storage.getGlossary());
          } catch (e) {
            console.error('Sync glossary error:', e);
          }
        }

        if (this.currentMemory) {
          const memories = Storage.getMemoryIndex();
          const mem = memories.find(m => m.id === this.currentMemory);
          if (mem) {
            if (!mem.characters) mem.characters = [];
            if (!mem.glossary) mem.glossary = [];
            if (!mem.characters.includes(noun)) {
              mem.characters.push(noun);
              mem.glossary.push(item);
            }
            Storage.setMemoryIndex(memories);
          }
          this.updateDocGlossaryDisplay();
        }

        this.showToast(`"${noun}"已添加到名词库`, 'success');
      }
    }
  },

  showSettingsModal() {
    this.loadSettingsValues();
    document.getElementById('settingsModal').classList.add('active');
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ'}</span>
      <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
};

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
  App.init();

  document.querySelectorAll('.glossary-cat-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.glossary-cat-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });
});
