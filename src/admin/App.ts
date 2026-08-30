import { computed, defineComponent, onMounted, ref } from 'vue';
import ArticleEditor from './ArticleEditor.ts';
import {
  api,
  ApiError,
  type ArticleRow,
  type Author,
  type NewArticleInput,
  type OperationalStatus,
} from './api.ts';

function newArticle(): NewArticleInput {
  return {
    translationKey: '',
    lang: 'zh',
    slug: '',
    title: '',
    summary: '',
    publishedAt: new Date().toISOString(),
    updatedAt: null,
    category: '',
    tags: [],
    cover: null,
    coverAlt: null,
    draft: false,
    unlisted: false,
    copyProtection: false,
    markdown: '写点什么。\n',
    editorJson: null,
  };
}

export default defineComponent({
  name: 'MoriiumAdmin',
  components: { ArticleEditor },
  setup() {
    const initializing = ref(true);
    const author = ref<Author | null>(null);
    const name = ref('');
    const password = ref('');
    const failure = ref('');
    const busy = ref(false);
    const articles = ref<ArticleRow[]>([]);
    const openId = ref<number | null>(null);
    const creating = ref(false);
    const draft = ref<NewArticleInput>(newArticle());
    const tagsText = ref('');
    const status = ref<OperationalStatus | null>(null);
    const signedIn = computed(() => author.value !== null);
    const needsAttention = computed(
      () => status.value?.items.filter((item) => item.verdict === 'attention') ?? [],
    );

    function report(error: unknown): void {
      failure.value = error instanceof ApiError ? error.message : String(error);
    }

    async function refresh(): Promise<void> {
      articles.value = (await api.listArticles()).articles;
    }

    /**
     * Loads the operational panel.
     *
     * Deliberately separate from refresh() and deliberately swallowing its own
     * failure: the panel reports on backups and exports, and a panel that could
     * not load must not stop the author from writing. It reports the failure in
     * its own row instead.
     */
    async function loadStatus(): Promise<void> {
      try {
        status.value = await api.status();
      } catch (error) {
        status.value = {
          checkedAt: new Date().toISOString(),
          items: [
            {
              id: 'panel',
              label: '运维状态',
              verdict: 'unknown',
              detail: error instanceof ApiError ? error.message : String(error),
            },
          ],
        };
      }
    }

    async function bootstrap(): Promise<void> {
      try {
        author.value = await api.session();
        if (author.value) {
          await refresh();
          await loadStatus();
        }
      } catch (error) {
        report(error);
      } finally {
        initializing.value = false;
      }
    }

    async function signIn(): Promise<void> {
      busy.value = true;
      failure.value = '';
      try {
        author.value = await api.login(name.value, password.value);
        password.value = '';
        await refresh();
        await loadStatus();
      } catch (error) {
        report(error);
      } finally {
        busy.value = false;
      }
    }

    async function signOut(): Promise<void> {
      busy.value = true;
      failure.value = '';
      try {
        await api.logout();
        author.value = null;
        articles.value = [];
        openId.value = null;
        status.value = null;
      } catch (error) {
        report(error);
      } finally {
        busy.value = false;
      }
    }

    async function create(): Promise<void> {
      busy.value = true;
      failure.value = '';
      try {
        const input: NewArticleInput = {
          ...draft.value,
          tags: [...new Set(tagsText.value.split(/[,\n]/).map((tag) => tag.trim()).filter(Boolean))],
          cover: draft.value.cover?.trim() || null,
          coverAlt: draft.value.coverAlt?.trim() || null,
          updatedAt: draft.value.updatedAt?.trim() || null,
        };
        const result = await api.createArticle(input);
        draft.value = newArticle();
        tagsText.value = '';
        creating.value = false;
        await refresh();
        openId.value = result.article.id;
      } catch (error) {
        report(error);
      } finally {
        busy.value = false;
      }
    }

    async function backToList(): Promise<void> {
      openId.value = null;
      await refresh();
      await loadStatus();
    }

    onMounted(() => void bootstrap());

    return {
      initializing,
      author,
      signedIn,
      name,
      password,
      failure,
      busy,
      articles,
      openId,
      creating,
      draft,
      tagsText,
      status,
      needsAttention,
      loadStatus,
      signIn,
      signOut,
      create,
      backToList,
    };
  },
  template: `
    <div v-if="initializing" class="login-shell"><p class="message">正在恢复作者会话…</p></div>

    <div v-else-if="!signedIn" class="login-shell">
      <form class="login-panel" @submit.prevent="signIn">
        <p class="eyebrow">Moriium</p>
        <h1>作者后台</h1>
        <p class="note">仅限服务器中已经建立的 Morii 与 Enouia 账户。</p>
        <label><span>账户</span><input v-model="name" autocomplete="username" required /></label>
        <label><span>口令</span><input v-model="password" type="password" autocomplete="current-password" required /></label>
        <button class="primary wide" type="submit" :disabled="busy || !name || !password">{{ busy ? '登录中…' : '登录' }}</button>
        <p v-if="failure" class="message error" role="alert">{{ failure }}</p>
      </form>
    </div>

    <ArticleEditor v-else-if="openId !== null" :article-id="openId" @back="backToList" />

    <main v-else class="admin-wrap">
      <header class="admin-header">
        <div><p class="eyebrow">Moriium</p><h1>文章</h1><p class="note">{{ author?.name }} 已登录</p></div>
        <div class="header-actions"><button type="button" @click="creating = !creating">{{ creating ? '取消新建' : '新建文章' }}</button><button type="button" class="quiet" :disabled="busy" @click="signOut">退出</button></div>
      </header>

      <p v-if="failure" class="message error" role="alert">{{ failure }}</p>

      <form v-if="creating" class="create-panel" @submit.prevent="create">
        <div class="section-heading"><div><p class="eyebrow">New article</p><h2>新建文章</h2></div><p class="note">文章身份建立后不随普通版本保存改写。</p></div>
        <div class="form-grid three">
          <label><span>语言</span><select v-model="draft.lang"><option value="zh">zh</option><option value="ja">ja</option><option value="en">en</option></select></label>
          <label><span>slug（如 zh/new-post）</span><input v-model="draft.slug" required /></label>
          <label><span>translationKey</span><input v-model="draft.translationKey" required /></label>
        </div>
        <div class="form-grid two">
          <label><span>标题</span><input v-model="draft.title" required /></label>
          <label><span>分类</span><input v-model="draft.category" required /></label>
        </div>
        <label><span>摘要</span><textarea v-model="draft.summary" rows="3" maxlength="280" required></textarea></label>
        <div class="form-grid two">
          <label><span>发布日期（ISO 8601）</span><input v-model="draft.publishedAt" required /></label>
          <label><span>更新日期（可空）</span><input :value="draft.updatedAt ?? ''" @input="draft.updatedAt = $event.target.value || null" /></label>
        </div>
        <label><span>标签（逗号或换行分隔）</span><textarea v-model="tagsText" rows="2"></textarea></label>
        <div class="form-grid two">
          <label><span>封面公开路径（可空）</span><input :value="draft.cover ?? ''" @input="draft.cover = $event.target.value || null" /></label>
          <label><span>封面替代文字</span><input :value="draft.coverAlt ?? ''" @input="draft.coverAlt = $event.target.value || null" /></label>
        </div>
        <fieldset class="checks"><legend>发布属性</legend><label><input v-model="draft.draft" type="checkbox" /> draft 标记</label><label><input v-model="draft.unlisted" type="checkbox" /> 不在列表中显示</label><label><input v-model="draft.copyProtection" type="checkbox" /> 启用复制限制</label></fieldset>
        <label><span>初始 Markdown</span><textarea v-model="draft.markdown" rows="6" required></textarea></label>
        <button class="primary" type="submit" :disabled="busy">{{ busy ? '创建中…' : '创建并打开' }}</button>
      </form>

      <section v-if="status" class="status-panel" aria-labelledby="status-title">
        <div class="section-heading">
          <div><p class="eyebrow">Operations</p><h2 id="status-title">运维状态</h2></div>
          <button type="button" class="quiet" @click="loadStatus">重新检查</button>
        </div>
        <p class="note">不做告警，所以失败只在这里可见。</p>
        <ul class="status-items">
          <li v-for="item in status.items" :key="item.id" :class="['status-item', item.verdict]">
            <span class="status-label">{{ item.label }}</span>
            <span class="status-detail">{{ item.detail }}</span>
            <span :class="['pill', item.verdict === 'attention' ? 'waiting' : item.verdict === 'ok' ? 'live' : '']">
              {{ item.verdict === 'ok' ? '正常' : item.verdict === 'attention' ? '需要注意' : '未观测' }}
            </span>
          </li>
        </ul>
      </section>

      <section class="article-list" aria-labelledby="article-list-title">
        <div class="section-heading"><h2 id="article-list-title">全部文章</h2><span class="note">{{ articles.length }} 篇</span></div>
        <p v-if="articles.length === 0" class="empty">还没有文章。可以先建一篇测试文章。</p>
        <button v-for="row in articles" :key="row.article.id" type="button" class="article-row" @click="openId = row.article.id">
          <span class="article-identity"><strong>{{ row.latest?.title || '未命名文章' }}</strong><small>{{ row.article.lang }} · {{ row.article.slug }}</small></span>
          <span class="article-states"><span v-if="row.article.publishedVersionId === null" class="pill draft">草稿</span><span v-else class="pill published">已发布 #{{ row.article.publishedVersionId }}</span><span v-if="row.article.liveVersionId !== null" class="pill live">已上线 #{{ row.article.liveVersionId }}</span><span v-if="row.awaitingExport" class="pill waiting">等待导出</span><span v-if="row.hasUnpublishedChanges" class="pill changed">有未发布改动</span></span>
          <span aria-hidden="true">→</span>
        </button>
      </section>
    </main>
  `,
});
