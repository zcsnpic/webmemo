const Storage = {
  KEYS: {
    GITHUB_TOKEN: 'memoir_github_token',
    REPO_NAME: 'memoir_repo_name',
    AI_ROLE: 'memoir_ai_role',
    AI_RULES: 'memoir_ai_rules',
    MEMORY_INDEX: 'memoir_memory_index',
    DELETED_MEMORIES: 'memoir_deleted',
    GLOSSARY: 'memoir_glossary',
    CATEGORIES: 'memoir_categories',
    CURRENT_MEMORY: 'memoir_current_memory',
    AI_MODE: 'memoir_ai_mode',
    DRAFT_MEMORY: 'memoir_draft_memory'
  },

  get(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Storage get error:', e);
      return null;
    }
  },

  set(key, value) {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
      
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k);
        total += (k.length + v.length) * 2;
      }
      
      const LIMIT = 5 * 1024 * 1024;
      if (total > LIMIT * 0.9) {
        console.warn('LocalStorage 容量已达 90%，建议清理数据');
      }
      
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        console.error('LocalStorage 容量超限，请清理数据');
        throw new Error('存储空间已满，请清理一些数据后重试');
      }
      console.error('Storage set error:', e);
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error('Storage remove error:', e);
      return false;
    }
  },

  getMemoryIndex() {
    return this.get(this.KEYS.MEMORY_INDEX) || [];
  },

  setMemoryIndex(index) {
    return this.set(this.KEYS.MEMORY_INDEX, index);
  },

  getDeletedMemories() {
    return this.get(this.KEYS.DELETED_MEMORIES) || [];
  },

  addDeletedMemory(memory) {
    const deleted = this.getDeletedMemories();
    deleted.push({
      ...memory,
      deletedAt: new Date().toISOString()
    });
    return this.set(this.KEYS.DELETED_MEMORIES, deleted);
  },

  removeDeletedMemory(memoryId) {
    const deleted = this.getDeletedMemories().filter(m => m.id !== memoryId);
    return this.set(this.KEYS.DELETED_MEMORIES, deleted);
  },

  getCategories() {
    return this.get(this.KEYS.CATEGORIES) || [];
  },

  setCategories(categories) {
    return this.set(this.KEYS.CATEGORIES, categories);
  },

  addCategory(name) {
    const categories = this.getCategories();
    if (!categories.includes(name)) {
      categories.push(name);
      this.setCategories(categories);
    }
    return categories;
  },

  getGlossary() {
    return this.get(this.KEYS.GLOSSARY) || [];
  },

  setGlossary(glossary) {
    return this.set(this.KEYS.GLOSSARY, glossary);
  },

  addGlossaryItem(item) {
    const glossary = this.getGlossary();
    const existing = glossary.findIndex(g => g.id === item.id);
    if (existing >= 0) {
      glossary[existing] = item;
    } else {
      glossary.push(item);
    }
    this.setGlossary(glossary);
    return glossary;
  },

  removeGlossaryItem(itemId) {
    const glossary = this.getGlossary().filter(g => g.id !== itemId);
    this.setGlossary(glossary);
    return glossary;
  },

  getCurrentMemory() {
    return this.get(this.KEYS.CURRENT_MEMORY);
  },

  setCurrentMemory(memoryId) {
    return this.set(this.KEYS.CURRENT_MEMORY, memoryId);
  },

  getAiMode() {
    return this.get(this.KEYS.AI_MODE) || 'L1';
  },

  setAiMode(mode) {
    return this.set(this.KEYS.AI_MODE, mode);
  },

  getGithubToken() {
    return this.get(this.KEYS.GITHUB_TOKEN);
  },

  setGithubToken(token) {
    return this.set(this.KEYS.GITHUB_TOKEN, token);
  },

  getRepoName() {
    return this.get(this.KEYS.REPO_NAME);
  },

  setRepoName(repo) {
    return this.set(this.KEYS.REPO_NAME, repo);
  },

  getAiRole() {
    return this.get(this.KEYS.AI_ROLE) || '你是一位专业的回忆录整理助手，擅长将用户的口述内容整理成流畅、富有情感的文字，同时保持原始细节和情感表达。';
  },

  setAiRole(role) {
    return this.set(this.KEYS.AI_ROLE, role);
  },

  getAiRules() {
    return this.get(this.KEYS.AI_RULES) || `1. 保持第一人称叙述
2. 保留方言和口语化表达
3. 注意段落节奏，适当分行
4. 不添加不存在的内容
5. 如有模糊信息，用"大概"、"据说"等词标注`;
  },

  setAiRules(rules) {
    return this.set(this.KEYS.AI_RULES, rules);
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  saveDraft(memoryId, data) {
    return this.set(this.KEYS.DRAFT_MEMORY, { memoryId, data, savedAt: new Date().toISOString() });
  },

  getDraft(memoryId) {
    const draft = this.get(this.KEYS.DRAFT_MEMORY);
    if (draft && draft.memoryId === memoryId) {
      return draft.data;
    }
    return null;
  },

  clearDraft(memoryId) {
    const draft = this.get(this.KEYS.DRAFT_MEMORY);
    if (draft && draft.memoryId === memoryId) {
      this.remove(this.KEYS.DRAFT_MEMORY);
    }
  }
};
