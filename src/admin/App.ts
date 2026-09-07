import { computed, defineComponent, onMounted, ref } from 'vue';
import ArticleEditor from './ArticleEditor.ts';
import {
  api,
  ApiError,
  messageForApiFailure,
  type ArticleRow,
  type Author,
  type NewArticleInput,
  type OperationalStatus,
  type Verdict,
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
    const checkingStatus = ref(false);
    const signedIn = computed(() => author.value !== null);
    // Not a ref: only loadStatus reads it, and nothing renders from it.
    let statusRequest = 0;

    /**
     * The four states of docs/vps-acceptance-checklist.md section E.
     *
     * Each verdict gets its own word. `unknown` says the reading is missing
     * rather than borrowing either reassuring label, which is the whole reason
     * the fourth state exists.
     */
    const VERDICT_LABELS: Record<Verdict, string> = {
      ok: '正常',
      attention: '需要注意',
      failure: '失败',
      unknown: '未观测',
    };

    function verdictLabel(verdict: Verdict): string {
      return VERDICT_LABELS[verdict] ?? VERDICT_LABELS.unknown;
    }

    /** When this row's own reading was taken, or that there is none. */
    function observedLabel(observedAt: string | null): string {
      if (!observedAt) return '暂无读数';
      const at = new Date(observedAt);
      if (Number.isNaN(at.getTime())) return '读数时间无法解析';
      return `读数时间 ${at.toLocaleString()}`;
    }

    function checkedLabel(checkedAt: string): string {
      const at = new Date(checkedAt);
      if (Number.isNaN(at.getTime())) return '本次检查时间无法解析';
      return `本次检查 ${at.toLocaleString()}`;
    }

    /**
     * Drops every trace of the signed-in author and returns to the login form.
     *
     * Called on any 401. Leaving the shell showing "已登录" beside a stale
     * article list is worse than an error: it claims a session that the server
     * has already destroyed, and the drafts on screen belong to it.
     */
    function endSession(): void {
      author.value = null;
      articles.value = [];
      openId.value = null;
      status.value = null;
      creating.value = false;
      draft.value = newArticle();
      tagsText.value = '';
    }

    function report(error: unknown): void {
      if (error instanceof ApiError && error.status === 401) {
        endSession();
        failure.value = '会话已过期，请重新登录。';
        return;
      }
      failure.value = messageForApiFailure(error, '连接不上后台，请检查网络后重试。');
    }

    async function refresh(): Promise<void> {
      articles.value = (await api.listArticles()).articles;
    }

    /**
     * Fetches the panel, and shows `unknown` when the fetch itself fails.
     *
     * Checklist item E4: the panel failing has to read as "no reading", not as
     * a blank section. `messageForApiFailure` keeps the browser's own
     * `TypeError: Failed to fetch` off screen (ADR 0002 section 21.14).
     *
     * The sequence number is what makes the re-check button honest. A second
     * click is already blocked while one request is open, but `bootstrap`,
     * `signIn` and `backToList` all call this too, and a slow earlier response
     * landing after a newer one would leave the panel showing older readings
     * than the timestamp beside them claims.
     */
    async function loadStatus(): Promise<void> {
      statusRequest += 1;
      const mine = statusRequest;
      checkingStatus.value = true;
      try {
        const next = await api.status();
        if (mine !== statusRequest) return;
        status.value = next;
      } catch (error) {
        if (mine !== statusRequest) return;
        // A 401 is not a missing reading, it is the end of the session. Drawing
        // it as an `unknown` row would leave the author looking at a panel that
        // implies they are still signed in.
        if (error instanceof ApiError && error.status === 401) {
          endSession();
          failure.value = '会话已过期，请重新登录。';
          return;
        }
        status.value = {
          checkedAt: new Date().toISOString(),
          items: [
            {
              id: 'panel',
              label: '运维状态',
              verdict: 'unknown',
              detail: messageForApiFailure(error, '连接不上状态接口，请检查网络后重试。'),
              observedAt: null,
            },
          ],
        };
      } finally {
        if (mine === statusRequest) checkingStatus.value = false;
      }
    }

    /**
     * Loads the article list and the operations panel without letting either
     * failure hide the other.
     *
     * They used to be awaited in sequence inside one try, so a failing article
     * list skipped loadStatus() entirely and the panel simply did not render.
     * That is the failure mode section E exists to prevent, one level up: the
     * panel is the only thing that reports a silent failure, so it must not be
     * the thing a silent failure removes. loadStatus() reports its own trouble
     * as an `unknown` row, so the article list's error is the only one `report`
     * has to carry.
     */
    async function loadAuthorViews(): Promise<void> {
      const [articles] = await Promise.allSettled([refresh(), loadStatus()]);
      if (articles.status === 'rejected') report(articles.reason);
    }

    async function bootstrap(): Promise<void> {
      try {
        author.value = await api.session();
        if (author.value) await loadAuthorViews();
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
        await loadAuthorViews();
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
        endSession();
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
      await loadAuthorViews();
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
      checkingStatus,
      loadStatus,
      verdictLabel,
      observedLabel,
      checkedLabel,
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
          <button type="button" class="quiet" :disabled="checkingStatus" @click="loadStatus">{{ checkingStatus ? '检查中…' : '重新检查' }}</button>
        </div>
        <p class="note">这里不会主动告警；需要注意、失败和未观测的状态都会明确列出。{{ checkedLabel(status.checkedAt) }}。</p>
        <ul class="status-items">
          <li v-for="item in status.items" :key="item.id" :class="['status-item', 'verdict-' + item.verdict]">
            <span class="status-label">{{ item.label }}</span>
            <span class="status-detail">{{ item.detail }}</span>
            <span class="status-observed">{{ observedLabel(item.observedAt) }}</span>
            <span :class="['pill', 'verdict-' + item.verdict]">{{ verdictLabel(item.verdict) }}</span>
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
